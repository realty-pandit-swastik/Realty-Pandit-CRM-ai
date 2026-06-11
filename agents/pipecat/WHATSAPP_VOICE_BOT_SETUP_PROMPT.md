# WhatsApp Business Calling + AI Voice Bot — Copy-Paste Setup Prompt

Paste the block below into a fresh Claude Code session on any new project. It is self-contained and encodes every hard-won gotcha from a 16-hour debug on another project. Claude should follow it end-to-end without re-deriving the decisions.

---

## PROMPT (copy from below this line)

You are going to build an inbound WhatsApp Business voice-call bot for me — caller dials our WhatsApp number, reaches an AI assistant that converses in real time. Do **not** re-derive architecture decisions from first principles — I learned these the hard way on another project and I want you to short-circuit straight to the working design.

### Non-negotiable architecture (do not deviate without telling me first)

1. **Use the Webhook signaling path, NOT SIP.** Meta offers both. The SIP path with aiortc fails — DTLS never completes, you'll waste days. Disable SIP on the phone number via Graph API before anything else.
2. **Pipecat 1.0.0 WhatsApp transport owns the call lifecycle.** It ships `WhatsAppClient` which handles pre_accept + accept Graph API calls, SDP filtering, and WebRTC setup. Don't roll your own.
3. **Gemini Live for the AI brain.** Model: `gemini-3.1-flash-live-preview` (NOT `gemini-2.5-flash-native-audio-latest` — that one gives 10-15s turn-around, unusable). **Before using ANY model id, verify it's actually exposed on the Live API** by running `curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}" | python3 -c 'import sys,json; [print(m["name"]) for m in json.load(sys.stdin)["models"] if "bidiGenerateContent" in m.get("supportedGenerationMethods",[])]'` — if the id you want isn't in the output, using it will crash with 1008 "not supported for bidiGenerateContent".
4. **Our Node backend (Express) already owns the Meta webhook URL** because it handles WhatsApp text messages too. Do not change the Meta webhook URL. Instead, make Node forward *call* events to Pipecat while keeping text-message handling intact.

### Wire diagram to implement

```
WhatsApp caller → Meta → HTTPS POST /webhooks/whatsapp (Node/Express, :7071)
                                                       │
                                                       ├─ calls event? forward raw body + X-Hub-Signature-256 to Pipecat
                                                       └─ else (messages, etc.) existing Node handler

Node ──POST── http://127.0.0.1:8765/wa/webhook (Pipecat FastAPI)
                                                       │
Pipecat WhatsAppClient ──HMAC verify → pre_accept → accept → SmallWebRTCConnection
                                                       │
Pipeline: SmallWebRTCTransport(in) → GeminiLiveLLMService → SmallWebRTCTransport(out)
                                                       │
Gemini Live WebSocket (WebRTC ↔ SRTP audio both ways)
```

### Credentials I will provide (ask for any that are missing)

- `WHATSAPP_PHONE_ID` — the numeric ID of the phone, not the number
- `WHATSAPP_SYSTEM_TOKEN` — system-user access token with `whatsapp_business_messaging` + `whatsapp_business_management`
- `WHATSAPP_APP_ID` + `WHATSAPP_APP_SECRET` — from Meta App Dashboard → Settings → Basic. The App Secret is used to verify HMAC on Meta's webhooks.
- `WHATSAPP_BUSINESS_ACCOUNT_ID` (WABA ID) — parent of the phone, needed to re-subscribe the app if Meta drops the subscription
- `GEMINI_API_KEY`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — pick any random string; Meta will echo it during webhook setup

### The 8 gotchas baked in below (believe them, don't test them)

1. **SIP path is dead.** aiortc 1.14.0 + Meta SIP = no DTLS ever. Use webhook.
2. **WABA → app subscription silently drops.** If webhooks stop working, `GET /{WABA_ID}/subscribed_apps` will show empty `data: []`. Re-subscribe with `POST /{WABA_ID}/subscribed_apps`.
3. **WhatsApp SDP only accepts SHA-256 fingerprints.** aiortc emits sha-256 + sha-384 + sha-512. Meta silently refuses DTLS. Pipecat's `WhatsAppClient._filter_sdp_for_whatsapp` handles this — use the official client, don't hand-roll.
4. **Pipecat 1.0.0 module names moved.** Gemini Live is `pipecat.services.google.gemini_live.llm.GeminiLiveLLMService` (not `gemini_multimodal_live`). SmallWebRTC is `pipecat.transports.smallwebrtc.{connection,transport}` (not `network.small_webrtc`).
5. **Pipecat 1.0.0 bug — `_create_single_response` forgets to set `_ready_for_realtime_input = True`.** If you seed a greeting with `LLMMessagesAppendFrame`, Panditji will greet but then drop every user audio frame. Manually flip the flag after queuing the seed. Do NOT skip this or you'll spend hours debugging.
6. **Seed greeting must be queued AFTER Gemini's WebSocket connects.** WebRTC connects ~300ms before Gemini. Hook `transport.event_handler("on_client_connected")`, `asyncio.sleep(0.5)`, then queue.
7. **Graph API `/calls` endpoint returns 131055 if SIP is enabled on the phone.** Disable SIP first; then pre_accept/accept work. Pipecat's `WhatsAppClient` does pre_accept + accept itself — you only call it for terminate if needed.
8. **`express.json()` in Node strips the raw body.** HMAC verification fails after forwarding. Add a `verify` callback to capture `req.rawBody` before forwarding.

### Step-by-step implementation order (do these in order, do not skip)

#### Step 1 — Verify Meta-side state before writing any code

Run these and paste the output back to me:

```bash
# What signaling mode is currently active?
curl -s "https://graph.facebook.com/v21.0/${PHONE_ID}/settings" \
  -H "Authorization: Bearer ${TOKEN}" | jq

# Is any app subscribed to the WABA?
curl -s "https://graph.facebook.com/v21.0/${WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer ${TOKEN}" | jq

# What webhook URL / fields is the app subscribed to?
curl -s "https://graph.facebook.com/v21.0/${APP_ID}/subscriptions?access_token=${APP_ID}|${APP_SECRET}" | jq
```

Expected healthy state: `calling.sip.status=DISABLED`, WABA has our app in `subscribed_apps.data`, app subscription includes `calls` in the `whatsapp_business_account` fields list.

If SIP is enabled: disable it:
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${PHONE_ID}/settings" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d '{"calling":{"status":"ENABLED","sip":{"status":"DISABLED"}}}'
```

If WABA `subscribed_apps` is empty: re-subscribe:
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer ${TOKEN}"
```

If app is not subscribed to `calls` field: update via `POST /{APP_ID}/subscriptions` with `object=whatsapp_business_account` and `fields=calls,messages,...`.

#### Step 2 — Python service (Pipecat + Gemini Live)

Create a fresh Python 3.12 venv and install exactly these pins:

```bash
python3 -m venv venv
source venv/bin/activate
pip install "pipecat-ai[google,webrtc]==1.0.0" python-dotenv fastapi uvicorn httpx aiohttp
```

Directory layout:
```
pipecat/
├── main.py           # FastAPI + WhatsAppClient
├── pipeline.py       # Per-call pipeline wiring
├── prompts/
│   └── system.txt    # System instruction (plain text)
└── .env
```

**`.env`:**
```
WHATSAPP_PHONE_ID=...
WHATSAPP_SYSTEM_TOKEN=...
WHATSAPP_APP_ID=...
WHATSAPP_APP_SECRET=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<pick-any-random-string>
GEMINI_API_KEY=...
NODE_BACKEND_URL=http://127.0.0.1:7071
PIPECAT_PORT=8765
```

**`main.py`:**
```python
"""WhatsApp Calling webhook service.

Meta webhook → WhatsAppClient → SmallWebRTCConnection → Gemini Live pipeline.
"""
import os
from contextlib import asynccontextmanager

import aiohttp
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from loguru import logger

from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.whatsapp.api import WhatsAppWebhookRequest
from pipecat.transports.whatsapp.client import WhatsAppClient

from pipeline import run_pipeline_for_connection

load_dotenv()
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_SYSTEM_TOKEN", "")
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET", "")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "")

_call_meta: dict[str, dict] = {}
_http_session: aiohttp.ClientSession | None = None
_wa_client: WhatsAppClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _http_session, _wa_client
    _http_session = aiohttp.ClientSession()
    _wa_client = WhatsAppClient(
        whatsapp_token=WHATSAPP_TOKEN,
        phone_number_id=WHATSAPP_PHONE_ID,
        session=_http_session,
        whatsapp_secret=WHATSAPP_APP_SECRET,
    )
    logger.info("WhatsApp webhook service ready")
    try:
        yield
    finally:
        try:
            await _wa_client.terminate_all_calls()
        finally:
            await _http_session.close()


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/wa/webhook")
async def verify_webhook(request: Request):
    try:
        challenge = await _wa_client.handle_verify_webhook_request(
            dict(request.query_params), WHATSAPP_VERIFY_TOKEN
        )
        return Response(content=str(challenge), media_type="text/plain")
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.post("/wa/webhook")
async def handle_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-hub-signature-256", "")
    try:
        payload = WhatsAppWebhookRequest.model_validate_json(raw_body)
    except Exception as e:
        raise HTTPException(status_code=400, detail="invalid payload")

    # Stash caller metadata keyed by call_id before handing off to WhatsAppClient.
    for entry in payload.entry:
        for change in entry.changes:
            for call in getattr(change.value, "calls", None) or []:
                if call.event == "connect":
                    _call_meta[call.id] = {"caller_number": getattr(call, "from_", "unknown")}

    try:
        await _wa_client.handle_webhook_request(
            request=payload,
            connection_callback=_on_connected,
            raw_body=raw_body,
            sha256_signature=signature,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok"}


async def _on_connected(webrtc_connection: SmallWebRTCConnection) -> None:
    # Match connection → original call_id
    real_call_id = next(
        (cid for cid, conn in _wa_client._ongoing_calls_map.items() if conn is webrtc_connection),
        webrtc_connection.pc_id,
    )
    meta = _call_meta.pop(real_call_id, {})
    caller_number = meta.get("caller_number", "unknown")
    logger.info(f"[WA] Pipeline starting for call {real_call_id} from {caller_number}")
    await run_pipeline_for_connection(webrtc_connection, real_call_id, caller_number)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1",
                port=int(os.getenv("PIPECAT_PORT", "8765")), reload=False)
```

**`pipeline.py`:**
```python
import asyncio
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from loguru import logger

from pipecat.frames.frames import EndFrame, LLMMessagesAppendFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService, InputParams
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://127.0.0.1:7071")

_PROMPT_PATH = Path(__file__).parent / "prompts" / "system.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


async def run_pipeline_for_connection(
    webrtc_connection: SmallWebRTCConnection,
    call_id: str,
    caller_number: str,
) -> None:
    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            # Gemini Live: 16kHz in, 24kHz out.  WhatsApp's Opus is 16kHz but
            # aiortc decodes to 48kHz — explicit rates force Pipecat to resample.
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        ),
    )

    # Force audio transceiver to sendrecv.  aiortc answer-side default can be
    # unidirectional in edge cases → Meta refuses to stream audio to us.
    webrtc_connection.force_transceivers_to_send_recv()

    # Pipecat's SmallWebRTCTrack disables the receiver after 2s idle (memory
    # heuristic for streaming media).  In a voice call, the caller is silent
    # while the bot speaks → receiver gets disabled → user audio is dropped.
    # Raise the threshold so it stays live.
    _track = webrtc_connection.audio_input_track()
    if _track is not None:
        _track._idle_timeout = 3600.0

    # Use the fast Live model, not the native-audio one (which is 10-15s slower).
    llm = GeminiLiveLLMService(
        api_key=GEMINI_API_KEY,
        model="models/gemini-3.1-flash-live-preview",
        system_instruction=SYSTEM_PROMPT,
        voice_id="Charon",              # deep male — pick Kore/Aoede/Leda/Zephyr for female
        params=InputParams(language=Language.HI_IN),   # or EN_US / whatever you need
    )

    pipeline = Pipeline([transport.input(), llm, transport.output()])
    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))

    @webrtc_connection.event_handler("closed")
    async def _on_closed(_):
        await task.queue_frame(EndFrame())

    @transport.event_handler("on_client_connected")
    async def _on_client_connected(_t, _conn):
        # Gemini's WebSocket connects ~300ms after WebRTC — wait for it.
        await asyncio.sleep(0.5)
        await task.queue_frames([
            LLMMessagesAppendFrame(messages=[{"role": "user", "content": "[call_started]"}])
        ])
        # CRITICAL: Pipecat 1.0.0 bug — _create_single_response (the
        # LLMMessagesAppendFrame path) never sets _ready_for_realtime_input,
        # so Gemini drops every user audio frame that follows the greeting.
        # Flip the flag manually or the bot is deaf.
        await asyncio.sleep(0.2)
        llm._ready_for_realtime_input = True
        logger.info(f"[Pipeline] Greeting queued + realtime input enabled for call {call_id}")

    runner = PipelineRunner()
    asyncio.create_task(_run_and_notify(runner, task, call_id, caller_number, llm))


async def _run_and_notify(runner, task, call_id, caller_number, llm):
    try:
        await runner.run(task)
    finally:
        transcript = _extract_transcript(llm)
        await _notify_call_ended(call_id, caller_number, transcript)


def _extract_transcript(llm) -> str:
    try:
        ctx = getattr(llm, "_context", None)
        if not ctx:
            return ""
        return "\n".join(
            f"{m['role'].upper()}: {m.get('content', '')}"
            for m in ctx
            if m.get("role") in ("user", "assistant")
        )
    except Exception:
        return ""


async def _notify_call_ended(call_id, caller_number, transcript) -> None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{NODE_BACKEND_URL}/internal/call-ended",
                json={"call_id": call_id, "caller_number": caller_number,
                      "transcript": transcript, "source": "pipecat"},
            )
    except Exception as e:
        logger.error(f"Failed to notify backend for call {call_id}: {e}")
```

**`prompts/system.txt`:** Write your character / flow here. Tell Gemini to greet in the caller's language first, keep responses 1-2 sentences (voice calls demand brevity), and what actions to take (book appointments, escalate, etc.).

#### Step 3 — Node backend changes (only if you have an existing Node service on /webhooks/whatsapp)

Skip this step if your project doesn't share the webhook URL with another service.

**`app.ts`** — add raw body capture to `express.json()`:
```typescript
app.use(express.json({
    limit: '10mb',
    verify: (req: any, _res, buf: Buffer) => {
        req.rawBody = buf;    // preserve for HMAC-verified forwarding
    },
}));
```

**`services/pipecat_bridge.ts`** — replace entire file:
```typescript
import axios from 'axios';
import logger from '../utils/logger';

const PIPECAT_URL = process.env.PIPECAT_SERVICE_URL || 'http://127.0.0.1:8765';

export async function forwardCallWebhookToPipecat(
    rawBody: Buffer,
    sha256Signature: string | undefined,
): Promise<void> {
    try {
        await axios.post(`${PIPECAT_URL}/wa/webhook`, rawBody, {
            headers: {
                'content-type': 'application/json',
                ...(sha256Signature ? { 'x-hub-signature-256': sha256Signature } : {}),
            },
            timeout: 10000,
        });
    } catch (err) {
        logger.error('[PipecatBridge] Forward failed:', (err as Error).message);
        throw err;
    }
}
```

**`routes/webhooks.ts`** — in the `/webhooks/whatsapp` POST handler, after `res.sendStatus(200)`:
```typescript
const callEvent = extractCallEvent(req.body);
if (callEvent.type === 'call_connect' || callEvent.type === 'call_terminate') {
    const rawBody: Buffer = (req as any).rawBody;
    const signature = req.header('x-hub-signature-256');
    forwardCallWebhookToPipecat(rawBody, signature)
        .catch(err => logger.error('[Webhook] Forward failed:', err));
    return;
}
// else fall through to existing message handling
```

#### Step 4 — nginx + PM2

nginx site config (add to existing `server` block BEFORE `location /`):
```nginx
location /wa/webhook {
    proxy_pass http://127.0.0.1:8765;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass_request_headers on;
    proxy_connect_timeout 15s;
    proxy_read_timeout 60s;
}
```

**Watch out:** do NOT leave nginx backup files in `sites-enabled/` — they get loaded too and can shadow your new config. Move backups to `/root/` or similar.

PM2 run (Pipecat only — Node is whatever you already have):
```bash
pm2 start "python main.py" --name voice-bot --cwd /path/to/pipecat --interpreter /path/to/venv/bin/python
```

#### Step 5 — Meta dashboard: webhook URL + verify token

If your existing Node service already owns the `whatsapp_business_account` webhook URL (our case), you're done — the webhook URL stays, Node forwards call events to Pipecat.

Otherwise, point Meta at Pipecat's `/wa/webhook` directly:
1. Meta App Dashboard → WhatsApp → Configuration → Webhooks
2. Callback URL: `https://<your-domain>/wa/webhook`
3. Verify token: `WHATSAPP_WEBHOOK_VERIFY_TOKEN` value
4. Click **Verify and save** (Meta hits our GET endpoint — should succeed)
5. Subscribe to the `calls` field (checkbox)

#### Step 6 — Smoke test before a real call

```bash
# Health
curl https://<your-domain>/wa/webhook?hub.mode=subscribe&hub.challenge=99&hub.verify_token=<TOKEN>
# Expected: HTTP 200, response body "99"

# Synthetic POST (signature will fail — that's expected proof HMAC verify is wired)
curl -X POST http://127.0.0.1:8765/wa/webhook -H 'content-type: application/json' \
  -H 'x-hub-signature-256: sha256=bogus' -d '{"object":"whatsapp_business_account","entry":[]}'
# Expected: 500 Invalid webhook signature
```

#### Step 7 — Real call test

Call the WhatsApp number. Watch:
```bash
pm2 logs voice-bot --lines 0 | grep -E "connect event|pre_accept|accept|Pipeline starting|Connected to Gemini|Bot started speaking"
```

Expected sequence:
```
Processing connect event for call wacid....
Pre-accept successful
Accept successful
WebRTC connection established
[WA] Pipeline starting
Connected to Gemini service
[Pipeline] Greeting queued + realtime input enabled
Bot started speaking
```

### What "done" looks like
- Caller hears the bot greet them within ~1.5s of the call being answered
- Caller speaks; bot responds within ~1.5s (NOT 10+ seconds — if it's slow, you're on the wrong model)
- Bot stays responsive across multi-turn conversation
- Log shows `Bot started speaking` / `Bot stopped speaking` events for each turn

### If something breaks, check in this order
1. Is SIP disabled on the phone? (`GET /{PHONE_ID}/settings` → `calling.sip.status`)
2. Is the WABA still subscribed to the app? (`GET /{WABA_ID}/subscribed_apps` — if empty, re-POST)
3. Is the app subscribed to the `calls` field? (`GET /{APP_ID}/subscriptions`)
4. Are webhook events reaching Node? (nginx access log for `/webhooks/whatsapp` from Meta IPs like `173.252.*`)
5. Is the raw body being forwarded? (Pipecat log should show `Webhook signature verified!`)
6. Is Gemini actually connected? (log: `Connected to Gemini service`)
7. Is `_ready_for_realtime_input` being flipped? (log: `realtime input enabled`)
8. Are user audio frames arriving? (temporarily add the `[INPUT-DIAG]` patch to `pipecat/transports/smallwebrtc/transport.py` — grep existing Realty Pandit repo for the exact diff)

Do not spend time on the SIP path. Do not try aiortc role overrides. Do not write your own pre_accept/accept code. If you find yourself doing any of those, you've drifted — come back here.

Now proceed with Step 1.
