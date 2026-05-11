# Pipecat + Gemini WhatsApp Voice Calling — AI Panditji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inbound WhatsApp voice calling to Realty Pandit so users who call `+91 81784 91914` are answered by AI Panditji — a Hindi/English real estate assistant powered by Gemini.

**Architecture:** A Python Pipecat microservice runs alongside the existing Node.js backend on the same server. WhatsApp routes call audio via SIP to Daily.co, which bridges to WebRTC. Pipecat connects to Daily.co and runs a Gemini STT → Gemini LLM → Gemini TTS pipeline. The Node.js webhook handler catches `calls` events and orchestrates session creation. After each call, Pipecat POSTs a summary back to Node.js, which saves it to the existing `voiceCall` database table.

**Tech Stack:** Python 3.11, Pipecat (`pipecat-ai[google,daily,silero]`), Google Gemini API (existing key), Daily.co (free tier WebRTC/SIP bridge), FastAPI (HTTP control server), Node.js Express (existing, extended for call events), Meta WhatsApp Cloud API v21.0

---

## Prerequisites Checklist

Before starting any task, verify these are available:

- [ ] **Daily.co account** — Sign up free at https://daily.co — get an API key from dashboard → Developers → API Keys
- [ ] **Google Cloud Speech-to-Text enabled** — Go to https://console.cloud.google.com → APIs → enable "Cloud Speech-to-Text API" for the project tied to `GEMINI_API_KEY`. Note: Gemini API key ≠ Google Cloud key. You may need a separate `GOOGLE_APPLICATION_CREDENTIALS` JSON file OR use the Gemini-native STT (`gemini-2.0-flash` handles audio natively — simpler, use this).
- [ ] **Server access** — SSH to the production server where `api.realtypandit.in` runs (the Node.js backend at port 7071)
- [ ] **New token saved** — The full-access system user token from Meta (the one verified in this session) — save it as `WHATSAPP_SYSTEM_TOKEN` in `.env.production`

---

## File Structure

### New files to create:

```
agents/
└── pipecat/                              ← NEW Python microservice root
    ├── main.py                           ← FastAPI app + call session manager
    ├── pipeline.py                       ← Pipecat pipeline (STT→LLM→TTS)
    ├── prompts/
    │   └── panditji.txt                  ← Panditji personality + real estate context
    ├── requirements.txt                  ← Python dependencies
    ├── .env                              ← Python env vars (mirrors backend .env)
    ├── Dockerfile                        ← Docker build for pipecat service
    └── ecosystem.config.js               ← PM2 config to run alongside Node.js
```

### Existing files to modify:

```
agents/backend/src/
├── routes/webhooks.ts                    ← Add call event handler (lines ~40-112)
├── services/voice.ts                     ← Add Pipecat bridge method
└── .env.production                       ← Add DAILY_API_KEY, PIPECAT_SERVICE_URL, WHATSAPP_SYSTEM_TOKEN
```

---

## Task 1: Python Pipecat Service — Dependencies + Boot

**Files:**
- Create: `agents/pipecat/requirements.txt`
- Create: `agents/pipecat/.env`
- Create: `agents/pipecat/main.py`

- [ ] **Step 1.1: Create requirements.txt**

```
# agents/pipecat/requirements.txt
pipecat-ai[google,daily,silero]==0.0.68
fastapi==0.115.12
uvicorn[standard]==0.34.0
python-dotenv==1.1.0
httpx==0.28.1
```

- [ ] **Step 1.2: Create .env for the Python service**

```bash
# agents/pipecat/.env
GEMINI_API_KEY=AIzaSyBrV65qRcUvY_eudk-D8VeZvB6bBpszIE4
DAILY_API_KEY=your_daily_api_key_here
NODE_BACKEND_URL=http://127.0.0.1:7071
PIPECAT_PORT=8765
```

- [ ] **Step 1.3: Create main.py — FastAPI control server**

```python
# agents/pipecat/main.py
import asyncio
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx

from pipeline import run_panditji_call

active_sessions: dict[str, asyncio.Task] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    for task in active_sessions.values():
        task.cancel()


app = FastAPI(lifespan=lifespan)


class CallStartRequest(BaseModel):
    call_id: str
    caller_number: str
    room_url: str
    room_token: str


class CallEndRequest(BaseModel):
    call_id: str


@app.get("/health")
def health():
    return {"status": "ok", "active_calls": len(active_sessions)}


@app.post("/call/start")
async def start_call(req: CallStartRequest):
    if req.call_id in active_sessions:
        raise HTTPException(status_code=409, detail="Call already active")

    task = asyncio.create_task(
        run_panditji_call(
            call_id=req.call_id,
            caller_number=req.caller_number,
            room_url=req.room_url,
            room_token=req.room_token,
        )
    )
    active_sessions[req.call_id] = task
    task.add_done_callback(lambda t: active_sessions.pop(req.call_id, None))

    return {"status": "started", "call_id": req.call_id}


@app.post("/call/end")
async def end_call(req: CallEndRequest):
    task = active_sessions.get(req.call_id)
    if task:
        task.cancel()
    return {"status": "ended", "call_id": req.call_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=int(os.getenv("PIPECAT_PORT", "8765")),
        reload=False,
    )
```

- [ ] **Step 1.4: Verify Python 3.11+ is available on the server**

```bash
python3 --version
# Expected: Python 3.11.x or higher
# If not: sudo apt install python3.11 python3.11-venv python3.11-pip
```

- [ ] **Step 1.5: Create virtualenv and install dependencies**

```bash
cd agents/pipecat
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Expected: All packages install without errors. Pipecat installs `pipecat_ai-0.0.68`.

- [ ] **Step 1.6: Test the FastAPI server boots**

```bash
cd agents/pipecat
source venv/bin/activate
python main.py
# Expected output:
# INFO:     Started server process
# INFO:     Waiting for application startup.
# INFO:     Application startup complete.
# INFO:     Uvicorn running on http://127.0.0.1:8765

# In another terminal:
curl http://127.0.0.1:8765/health
# Expected: {"status":"ok","active_calls":0}
```

Stop the server with Ctrl+C after confirming.

- [ ] **Step 1.7: Commit**

```bash
cd agents/pipecat
git add requirements.txt .env main.py
git commit -m "feat(pipecat): add FastAPI control server for Panditji voice service"
```

---

## Task 2: Panditji Personality Prompt

**Files:**
- Create: `agents/pipecat/prompts/panditji.txt`

- [ ] **Step 2.1: Create the Panditji system prompt**

```
# agents/pipecat/prompts/panditji.txt

You are Panditji, the AI voice assistant for Realty Pandit — a real estate company in India.

## Identity
- Your name is Panditji
- You work for Realty Pandit
- You are warm, professional, and helpful — like a knowledgeable friend in real estate

## Language
- Greet in Hindi first: "Namaste! Main Panditji hoon, Realty Pandit se."
- Match the caller's language. If they speak Hindi, respond in Hindi. If English, respond in English. If Hinglish, use Hinglish naturally.
- Speak clearly and at a natural pace — this is a voice call.
- Keep responses SHORT (2-3 sentences max per turn) — the caller can always ask for more.

## Your Job on This Call
1. Greet the caller warmly
2. Ask what kind of property they are looking for (buy/rent/sell)
3. Understand their budget, location preference, and timeline
4. If they want to see a property: offer to book a site visit
5. If they have a specific question you cannot answer: tell them a human agent will call them back shortly

## What You Know
- Realty Pandit operates in India
- We handle residential and commercial properties (buy, sell, rent)
- We have listings across major Indian cities
- Site visits can be booked Monday–Saturday, 10am–6pm

## What You Cannot Do
- You cannot quote exact prices (say "our agent will share current pricing")
- You cannot make promises about availability
- You cannot access live listing data during this call (say "I'll have our team send you matching options on WhatsApp")

## Call Endings
- If the caller wants a human: "Bilkul, main abhi ek agent ko assign karta hoon. Thodi der mein aapko call aayegi."
- If the call is productive: "Bahut acha! Main aapki details note kar leta hoon. Hamari team aapko WhatsApp par options bhejegi."
- Always end warmly: "Realty Pandit choose karne ke liye shukriya! Khush rahiye."

## Rules
- Never discuss topics outside real estate
- Never ask for payment or financial information
- Never make commitments you cannot keep
- Be concise — this is voice, not text
```

- [ ] **Step 2.2: Commit**

```bash
git add prompts/panditji.txt
git commit -m "feat(pipecat): add Panditji personality prompt for voice calls"
```

---

## Task 3: Pipecat Pipeline — Gemini STT + LLM + TTS

**Files:**
- Create: `agents/pipecat/pipeline.py`

- [ ] **Step 3.1: Create pipeline.py**

```python
# agents/pipecat/pipeline.py
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.services.google.llm import GoogleLLMService
from pipecat.services.google.tts import GoogleTTSService
from pipecat.services.google.stt import GoogleSTTService
from pipecat.transports.services.daily import DailyParams, DailyTransport
from pipecat.frames.frames import EndFrame
import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://127.0.0.1:7071")

_PROMPT_PATH = Path(__file__).parent / "prompts" / "panditji.txt"
PANDITJI_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


async def run_panditji_call(
    call_id: str,
    caller_number: str,
    room_url: str,
    room_token: str,
) -> None:
    transport = DailyTransport(
        room_url,
        room_token,
        "Panditji",
        DailyParams(
            audio_out_enabled=True,
            audio_in_enabled=True,
            vad_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
            vad_audio_passthrough=True,
        ),
    )

    stt = GoogleSTTService(
        api_key=GEMINI_API_KEY,
        language="hi-IN",          # Hindi primary; Gemini STT auto-detects English too
        model="latest_long",
    )

    llm = GoogleLLMService(
        api_key=GEMINI_API_KEY,
        model="gemini-2.0-flash",
    )

    tts = GoogleTTSService(
        api_key=GEMINI_API_KEY,
        voice_id="hi-IN-Wavenet-A",   # Natural Hindi female voice
        language_code="hi-IN",
    )

    messages = [
        {
            "role": "system",
            "content": PANDITJI_SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": "The caller has just connected. Greet them.",
        },
    ]

    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(allow_interruptions=True),
    )

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason):
        await task.queue_frame(EndFrame())

    @transport.event_handler("on_call_state_updated")
    async def on_call_state_updated(transport, state):
        if state == "left":
            await task.queue_frame(EndFrame())

    runner = PipelineRunner()

    try:
        await runner.run(task)
    finally:
        # Build transcript from context for Node.js to save
        transcript_turns = [
            f"{m['role'].upper()}: {m['content']}"
            for m in context.messages
            if m["role"] in ("user", "assistant")
        ]
        transcript_text = "\n".join(transcript_turns)

        await _notify_call_ended(call_id, caller_number, transcript_text)


async def _notify_call_ended(call_id: str, caller_number: str, transcript: str) -> None:
    payload = {
        "call_id": call_id,
        "caller_number": caller_number,
        "transcript": transcript,
        "source": "pipecat",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{NODE_BACKEND_URL}/internal/call-ended",
                json=payload,
            )
    except Exception as e:
        print(f"[Pipecat] Failed to notify Node.js of call end: {e}")
```

- [ ] **Step 3.2: Verify pipeline imports work**

```bash
cd agents/pipecat
source venv/bin/activate
python -c "from pipeline import run_panditji_call; print('OK')"
# Expected: OK
# If ImportError on any service: check pipecat version supports it
# Fix: pip install "pipecat-ai[google,daily,silero]" --upgrade
```

- [ ] **Step 3.3: Commit**

```bash
git add pipeline.py
git commit -m "feat(pipecat): add Gemini STT+LLM+TTS pipeline for Panditji"
```

---

## Task 4: Daily.co Room Creation Utility

**Files:**
- Create: `agents/pipecat/daily_client.py`

- [ ] **Step 4.1: Create daily_client.py**

```python
# agents/pipecat/daily_client.py
import os
import httpx

DAILY_API_KEY = os.getenv("DAILY_API_KEY")
DAILY_API_BASE = "https://api.daily.co/v1"


async def create_call_room(call_id: str) -> dict:
    """Create a Daily.co room for one WhatsApp voice call. Returns room_url and token."""
    headers = {
        "Authorization": f"Bearer {DAILY_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Create ephemeral room (expires 1 hour from now)
        room_resp = await client.post(
            f"{DAILY_API_BASE}/rooms",
            headers=headers,
            json={
                "name": f"panditji-{call_id[:16]}",
                "properties": {
                    "exp": int(__import__("time").time()) + 3600,
                    "max_participants": 2,
                    "enable_chat": False,
                    "enable_screenshare": False,
                    "start_audio_off": False,
                    "start_video_off": True,
                },
            },
        )
        room_resp.raise_for_status()
        room = room_resp.json()

        # Create bot token with owner privileges
        token_resp = await client.post(
            f"{DAILY_API_BASE}/meeting-tokens",
            headers=headers,
            json={
                "properties": {
                    "room_name": room["name"],
                    "is_owner": True,
                    "exp": int(__import__("time").time()) + 3600,
                }
            },
        )
        token_resp.raise_for_status()
        token = token_resp.json()

    return {
        "room_url": room["url"],
        "room_token": token["token"],
        "room_name": room["name"],
    }


async def delete_room(room_name: str) -> None:
    """Clean up room after call ends."""
    headers = {"Authorization": f"Bearer {DAILY_API_KEY}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.delete(f"{DAILY_API_BASE}/rooms/{room_name}", headers=headers)
```

- [ ] **Step 4.2: Update main.py to use daily_client for room creation**

Replace the `start_call` endpoint in `main.py`:

```python
# In main.py — replace the start_call endpoint
from daily_client import create_call_room, delete_room

@app.post("/call/start")
async def start_call(req: CallStartRequest):
    if req.call_id in active_sessions:
        raise HTTPException(status_code=409, detail="Call already active")

    # If no room_url provided, create one via Daily.co API
    room_url = req.room_url
    room_token = req.room_token

    if not room_url:
        room_data = await create_call_room(req.call_id)
        room_url = room_data["room_url"]
        room_token = room_data["room_token"]

    task = asyncio.create_task(
        run_panditji_call(
            call_id=req.call_id,
            caller_number=req.caller_number,
            room_url=room_url,
            room_token=room_token,
        )
    )
    active_sessions[req.call_id] = task
    task.add_done_callback(lambda t: active_sessions.pop(req.call_id, None))

    return {"status": "started", "call_id": req.call_id, "room_url": room_url}
```

- [ ] **Step 4.3: Commit**

```bash
git add daily_client.py main.py
git commit -m "feat(pipecat): add Daily.co room creation for call sessions"
```

---

## Task 5: Node.js — Handle WhatsApp `calls` Webhook Events

**Files:**
- Modify: `agents/backend/src/routes/webhooks.ts`
- Create: `agents/backend/src/services/pipecat_bridge.ts`
- Modify: `agents/backend/src/routes/webhooks.ts` (add internal call-ended route)

The `calls` webhook field is **already subscribed** (confirmed via Graph API). When a user calls the WhatsApp number, Meta sends a `calls` type event to `POST /webhooks/whatsapp`. We need to detect it and forward to Pipecat.

- [ ] **Step 5.1: Create pipecat_bridge.ts**

```typescript
// agents/backend/src/services/pipecat_bridge.ts
import axios from 'axios';
import logger from '../utils/logger';

const PIPECAT_URL = process.env.PIPECAT_SERVICE_URL || 'http://127.0.0.1:8765';

export interface CallStartedEvent {
    call_id: string;
    caller_number: string;
}

export interface CallEndedPayload {
    call_id: string;
    caller_number: string;
    transcript: string;
    source: string;
}

export async function startPipecatCall(event: CallStartedEvent): Promise<void> {
    try {
        await axios.post(`${PIPECAT_URL}/call/start`, {
            call_id: event.call_id,
            caller_number: event.caller_number,
            room_url: '',      // Pipecat will create Daily.co room
            room_token: '',
        }, { timeout: 5000 });
        logger.info(`[PipecatBridge] Started call session: ${event.call_id}`);
    } catch (err) {
        logger.error(`[PipecatBridge] Failed to start call ${event.call_id}:`, (err as Error).message);
    }
}

export async function endPipecatCall(call_id: string): Promise<void> {
    try {
        await axios.post(`${PIPECAT_URL}/call/end`, { call_id }, { timeout: 5000 });
        logger.info(`[PipecatBridge] Ended call session: ${call_id}`);
    } catch (err) {
        logger.error(`[PipecatBridge] Failed to end call ${call_id}:`, (err as Error).message);
    }
}
```

- [ ] **Step 5.2: Modify webhooks.ts — detect calls events**

Add a call event parser at the top of the `router.post('/whatsapp', ...)` handler, right after `res.sendStatus(200)`:

```typescript
// Add this import at the top of webhooks.ts
import { startPipecatCall, endPipecatCall } from '../services/pipecat_bridge';

// Add this helper function before the router definition
function extractCallEvent(body: any): { type: 'call_started' | 'call_ended' | null; call_id: string; caller: string } {
    try {
        const entry = body?.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const callObj = value?.calls?.[0];

        if (!callObj) return { type: null, call_id: '', caller: '' };

        const callId = callObj.id || callObj.call_id || '';
        const caller = callObj.from || value?.metadata?.phone_number_id || '';
        const status = callObj.status || '';

        if (status === 'ringing' || status === 'initiated') {
            return { type: 'call_started', call_id: callId, caller };
        }
        if (status === 'ended' || status === 'missed' || status === 'rejected') {
            return { type: 'call_ended', call_id: callId, caller };
        }
        return { type: null, call_id: callId, caller };
    } catch {
        return { type: null, call_id: '', caller: '' };
    }
}
```

Then inside `router.post('/whatsapp', ...)`, after `res.sendStatus(200)` and before the message parsing try/catch, add:

```typescript
// ─── Call Event Handler ────────────────────────────────────────────────────
const callEvent = extractCallEvent(req.body);
if (callEvent.type === 'call_started') {
    logger.info(`[Webhook] Incoming WhatsApp call from ${callEvent.caller}, id: ${callEvent.call_id}`);
    startPipecatCall({ call_id: callEvent.call_id, caller_number: callEvent.caller }).catch(
        err => logger.error('[Webhook] Failed to start Pipecat call:', err)
    );
    return; // Call events are separate from messages — stop processing here
}
if (callEvent.type === 'call_ended') {
    logger.info(`[Webhook] Call ended: ${callEvent.call_id}`);
    endPipecatCall(callEvent.call_id).catch(
        err => logger.error('[Webhook] Failed to end Pipecat call:', err)
    );
    return;
}
// ─── (existing message processing continues below) ──────────────────────
```

- [ ] **Step 5.3: Add internal `call-ended` route for Pipecat → Node.js callback**

Add this to `webhooks.ts` after the voice webhook:

```typescript
// ─── Internal: Pipecat Call Ended Callback ───────────────────────────────
// Called by Python Pipecat service after call finishes to save transcript
router.post('/internal/call-ended', async (req, res) => {
    res.sendStatus(200); // Respond immediately

    try {
        const { call_id, caller_number, transcript, source } = req.body;

        if (source !== 'pipecat') return;
        if (!caller_number) return;

        logger.info(`[Internal] Pipecat call ended for ${caller_number}, saving transcript`);

        const { VoiceService } = await import('../services/voice');
        const voiceService = new VoiceService();
        await voiceService.savePipecatCallRecord({
            call_id,
            caller_number,
            transcript,
        });
    } catch (err) {
        logger.error('[Internal] Error saving Pipecat call record:', err);
    }
});
```

- [ ] **Step 5.4: Add savePipecatCallRecord to voice.ts**

Add this method to the `VoiceService` class in `src/services/voice.ts`:

```typescript
public async savePipecatCallRecord(params: {
    call_id: string;
    caller_number: string;
    transcript: string;
}): Promise<void> {
    const { call_id, caller_number, transcript } = params;
    const now = new Date();

    const tenant = await prisma.tenant.findFirst();
    if (!tenant) return;

    let contact = await prisma.contact.findUnique({
        where: { phone_number: caller_number }
    });

    if (!contact) {
        contact = await prisma.contact.create({
            data: {
                phone_number: caller_number,
                tenant_id: tenant.id,
                source: 'voice',
                lead_status: 'warm',
                contact_type: 'UNKNOWN',
            }
        });
    }

    await prisma.voiceCall.create({
        data: {
            tenant_id: tenant.id,
            phone_number: caller_number,
            call_sid: call_id,
            direction: 'inbound',
            call_status: 'completed',
            duration: 0,
            transcript: transcript,
            ai_call_summary: transcript.split('\n').slice(-3).join(' '),
            started_at: now,
            ended_at: now,
        }
    });

    await prisma.interaction.create({
        data: {
            tenant_id: tenant.id,
            phone_number: caller_number,
            channel: 'voice',
            direction: 'inbound',
            event_type: 'whatsapp_call',
            content: `WhatsApp voice call via Panditji AI`,
            metadata: { call_id, source: 'pipecat' },
        }
    });

    await prisma.contact.update({
        where: { phone_number: caller_number },
        data: {
            last_channel: 'voice',
            last_interaction: now,
        }
    });

    logger.info(`[VoiceService] Pipecat call saved for ${caller_number}`);
}
```

- [ ] **Step 5.5: Add env vars to .env.production**

```bash
# Add to agents/backend/.env.production:
PIPECAT_SERVICE_URL=http://127.0.0.1:8765
WHATSAPP_SYSTEM_TOKEN=EAAajqWYLpiABRGKSvS1ZAfz1i... # full-access system user token
```

- [ ] **Step 5.6: Build TypeScript and verify no errors**

```bash
cd agents/backend
npx tsc --noEmit
# Expected: no errors
# Fix any type errors before proceeding
```

- [ ] **Step 5.7: Commit**

```bash
cd agents/backend
git add src/routes/webhooks.ts src/services/pipecat_bridge.ts src/services/voice.ts .env.production
git commit -m "feat(backend): handle WhatsApp call events and bridge to Pipecat service"
```

---

## Task 6: Configure Meta SIP via Graph API

This registers your Daily.co SIP endpoint with Meta so WhatsApp routes call audio there.

- [ ] **Step 6.1: Get Daily.co SIP interconnect URI**

In the Daily.co dashboard:
1. Go to **Developers** → **SIP Interconnect**
2. Enable SIP interconnect
3. Copy the SIP URI — it looks like: `sip:yourroom@sip.daily.co`

- [ ] **Step 6.2: Run the Meta settings API call to register SIP**

```bash
TOKEN="EAAajqWYLpiABRGKSvS1ZAfz1iEtFybZAzmafFeOjAcp3ZC1BQul6HGorPTSZCfmUM6zCuU2roUJXZCaqKORBzr7LEqZCGZBIO5kb1f7LNLdmJlAPK0LZBfIjpfc6dvilmCy6R6FfJJDCDX8ZBcn9yubj8v84NZAjwzLwaTZCmYc9TOOIExhrNyFERZCWb0poBTlFKAZDZD"
PHONE_ID="1021151161081768"
SIP_URI="sip:panditji@sip.daily.co"   # Replace with actual Daily.co SIP URI

curl -X POST "https://graph.facebook.com/v21.0/${PHONE_ID}/settings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"calling\": {
      \"status\": \"ENABLED\",
      \"call_transport\": \"SIP\",
      \"sip_config\": {
        \"sip_uri\": \"${SIP_URI}\"
      }
    }
  }"

# Expected response: {"success": true}
```

- [ ] **Step 6.3: Verify SIP config was applied**

```bash
curl -s "https://graph.facebook.com/v21.0/${PHONE_ID}?fields=health_status&access_token=${TOKEN}" | python -m json.tool
# Expected: can_receive_call_sip should change from BLOCKED to AVAILABLE
```

- [ ] **Step 6.4: Commit the Graph API configuration script**

```bash
# Save this as a utility script
cat > agents/backend/scripts/configure-whatsapp-sip.sh << 'EOF'
#!/bin/bash
# Run once to register Daily.co SIP with Meta WhatsApp
source .env.production
curl -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/settings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${WHATSAPP_SYSTEM_TOKEN}" \
  -d "{\"calling\":{\"status\":\"ENABLED\",\"call_transport\":\"SIP\",\"sip_config\":{\"sip_uri\":\"${DAILY_SIP_URI}\"}}}"
EOF
chmod +x agents/backend/scripts/configure-whatsapp-sip.sh
git add agents/backend/scripts/configure-whatsapp-sip.sh
git commit -m "feat: add script to configure WhatsApp SIP calling with Daily.co"
```

---

## Task 7: PM2 Process for Pipecat Service

**Files:**
- Create: `agents/pipecat/ecosystem.config.js`

- [ ] **Step 7.1: Create PM2 config for Pipecat service**

```javascript
// agents/pipecat/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'panditji-voice',
      script: 'main.py',
      interpreter: './venv/bin/python',
      cwd: '/var/www/realtypandit/agents/pipecat',  // Update to actual server path
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      error_file: '../backend/logs/pipecat-error.log',
      out_file: '../backend/logs/pipecat-out.log',
    },
  ],
};
```

- [ ] **Step 7.2: Start Pipecat service with PM2**

Run on the server:
```bash
cd /var/www/realtypandit/agents/pipecat
pm2 start ecosystem.config.js
pm2 save
pm2 status
# Expected: panditji-voice   online
```

- [ ] **Step 7.3: Restart Node.js backend to pick up new env vars**

```bash
pm2 restart all
pm2 logs --lines 20
# Expected: no errors in Node.js logs
```

- [ ] **Step 7.4: Commit**

```bash
git add ecosystem.config.js
git commit -m "feat(pipecat): add PM2 config for Panditji voice service"
```

---

## Task 8: End-to-End Test

- [ ] **Step 8.1: Test Pipecat health endpoint from Node server**

```bash
curl http://127.0.0.1:8765/health
# Expected: {"status":"ok","active_calls":0}
```

- [ ] **Step 8.2: Test simulated call start**

```bash
curl -X POST http://127.0.0.1:8765/call/start \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "test-001",
    "caller_number": "+919999999999",
    "room_url": "",
    "room_token": ""
  }'
# Expected: {"status":"started","call_id":"test-001","room_url":"https://yourorg.daily.co/panditji-test-001"}
# Pipecat should create Daily.co room and start pipeline
```

- [ ] **Step 8.3: Check active_calls increases**

```bash
curl http://127.0.0.1:8765/health
# Expected: {"status":"ok","active_calls":1}
```

- [ ] **Step 8.4: End the test call**

```bash
curl -X POST http://127.0.0.1:8765/call/end \
  -H "Content-Type: application/json" \
  -d '{"call_id": "test-001"}'
# Expected: {"status":"ended","call_id":"test-001"}
```

- [ ] **Step 8.5: Verify call record was saved to DB**

```bash
cd agents/backend
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.voiceCall.findFirst({ orderBy: { started_at: 'desc' } }).then(r => { console.log(r); p.\$disconnect(); });
"
# Expected: a voiceCall record with call_sid = 'test-001'
```

- [ ] **Step 8.6: Live test — make a real WhatsApp call**

On your personal phone (or a test phone):
1. Open WhatsApp
2. Search for `+91 81784 91914` (Realty Pandit)
3. Tap the **Call** button
4. Panditji should answer and say the Hindi greeting within 3-5 seconds

Check backend logs:
```bash
pm2 logs backend --lines 30
# Expected: [Webhook] Incoming WhatsApp call from +91XXXXXXXXXX, id: call_xxx
# Expected: [PipecatBridge] Started call session: call_xxx
```

---

## Task 9: Dockerfile for Pipecat Service (Production)

**Files:**
- Create: `agents/pipecat/Dockerfile`

- [ ] **Step 9.1: Create Dockerfile**

```dockerfile
# agents/pipecat/Dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8765

CMD ["python", "main.py"]
```

- [ ] **Step 9.2: Commit**

```bash
git add Dockerfile
git commit -m "feat(pipecat): add Dockerfile for production deployment"
```

---

## Deployment Summary

After all tasks are complete, the production deployment state is:

```
PM2 process list:
├── backend          (Node.js Express :7071)  — existing
└── panditji-voice   (Python Pipecat :8765)   — new

Nginx routes:
├── api.realtypandit.in/webhooks/whatsapp  → Node.js (existing)
└── api.realtypandit.in/internal/*         → Node.js (new internal routes, NOT public)

Daily.co:
└── SIP URI registered with Meta → routes call audio to Pipecat rooms

Meta WhatsApp settings:
└── calling.status = ENABLED
└── calling.call_transport = SIP
└── calling.sip_config.sip_uri = sip:panditji@sip.daily.co
```

---

## Cost Estimate (Monthly at ~100 calls × 5 min avg = 500 min)

| Service | Cost |
|---|---|
| Daily.co (WebRTC/SIP bridge) | Free (10,000 min free tier) |
| Gemini 2.0 Flash (LLM) | ~$0.003/min = ~$1.50 |
| Google Cloud TTS (WaveNet Hindi) | ~$0.004/min = ~$2.00 |
| Google Cloud STT | ~$0.006/min = ~$3.00 |
| **Total** | **~$6.50/month** |

---

## Known Limitations

1. **Outbound calls** not in scope — this plan covers inbound only
2. **`calls` webhook payload format** — Meta's exact JSON for call events is undocumented in some edge cases. The `extractCallEvent` parser in webhooks.ts uses safe optional chaining; log the raw body on first real call and adjust if needed
3. **SIP settings API** — The `calling.sip_config` field name may vary by API version; if the curl in Task 6 returns an error, check https://developers.facebook.com/docs/whatsapp/cloud-api/calling for the latest field names
4. **Daily.co SIP interconnect** may require a paid plan — verify before Task 6
