# Panditji Voice Bot — Performance & Latency Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Panditji voice bot response latency from ~884ms to under 500ms per turn, and eliminate the 10–57 second silent gaps caused by spurious Gemini VAD interrupts.

**Architecture:** Five independent phases applied to the Pipecat 1.0.0 + Gemini Live pipeline: (1) protect function-call response windows from VAD interrupts, (2) pre-load caller data at call start so common queries need no function call, (3) shrink the system prompts from ~4,800/2,300 tokens to ~400 tokens, (4) parallelize the blocking caller lookup with transport setup, (5) add a 60s in-session cache in the tool dispatcher.

**Tech Stack:** Python 3.11, Pipecat 1.0.0, Gemini Live (`gemini-3.1-flash-live-preview`), httpx, asyncio, Node.js/TypeScript (Express + Prisma), PM2, server `72.62.231.224`

---

## Context

**Why:** A live call on 2026-04-20 with Puneet (super_boss, +91 99588 60411) exposed two classes of problems:

1. **Catastrophic silent gaps (10s, 22s, 57s):** After a function call result returned in 27–52ms, Gemini's VAD fired a spurious "interrupted" signal that killed the bot's response before any audio was generated. Root cause: the user was likely on speakerphone — the bot's audio echoed back into the mic — and Gemini's server-side VAD mistook the echo for user speech. Pipecat propagated the interruption and cancelled the response.

2. **Steady-state latency of ~884ms per turn:** Even when interrupts didn't fire, every query incurred a full round-trip: (a) function called → 27–52ms DB → (b) result sent back to Gemini → (c) Gemini generates audio in 855ms. The 855ms is driven primarily by the 4,800-token system prompt that Gemini must process on every turn.

**Target after all phases:** Pre-loaded queries (appointments, pipeline, tasks) respond in ≤200ms. Fresh DB queries respond in ≤500ms. Zero spurious-interrupt silent gaps.

---

## Files Modified

| File | Change |
|------|--------|
| `agents/pipecat/pipeline.py` | Phase 1 (VAD guard), Phase 2 (pre-fetch), Phase 4 (parallel lookup) |
| `agents/pipecat/tools.py` | Phase 5 (in-session cache) |
| `agents/pipecat/prompts/panditji_team_member.txt` | Phase 3 (trim to ~400 tokens) |
| `agents/pipecat/prompts/panditji.txt` | Phase 3 (trim to ~400 tokens) |

All files are at:
`c:\Users\Varchasv Bhardwaj\Project\clients\sunny-sharma\projects\reality-pandit\agents\pipecat\`

Server path (deployed via rsync/PM2):
`/var/www/realty-pandit/agents/pipecat/`

---

## Phase 1 — Fix VAD Interrupt Guard (Eliminates Silent Gaps)

**Problem:** After `result_callback(result)` fires, Gemini needs ~855ms to generate audio. During that window, a spurious `TOOL_CALL_CANCELLATION` or VAD-interrupted signal kills the response. The fix is to disable pipeline interruptions for 700ms after every function call result.

**File:** `pipeline.py` lines 206–224 + line 246

### Task 1.1 — Make `task` accessible inside the handler closures

- [ ] **Step 1: Read pipeline.py lines 206–246**

Confirm the current structure:
```python
# line 206
if is_team_member:
    def _make_handler(tool_name: str):
        async def _handler(params: FunctionCallParams) -> None:
            result = await call_tool(tool_name, caller_number, dict(params.arguments or {}))
            await params.result_callback(result)
        return _handler
    for tool in TEAM_MEMBER_TOOLS:
        llm.register_function(tool["name"], _make_handler(tool["name"]))

# line 246
task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
```

The `task` object is created AFTER `_make_handler` is defined. Python closures capture variables by reference, not value — so we can declare `task = None` before the handlers and assign later.

- [ ] **Step 2: Refactor pipeline.py — move `task` declaration before handler registration**

Replace lines 206–224 with:

```python
    # task will be created below — handlers capture it by reference (assigned before any call fires)
    _pipeline_task: list = [None]   # mutable box so inner closures can read the live reference

    if is_team_member:
        def _make_handler(tool_name: str):
            async def _handler(params: FunctionCallParams) -> None:
                try:
                    result = await call_tool(
                        tool_name, caller_number, dict(params.arguments or {})
                    )
                except Exception as e:
                    logger.error(f"[Tool] {tool_name} dispatcher crashed: {e}")
                    result = {"ok": False, "error": str(e)}

                await params.result_callback(result)

                # Guard: give Gemini 700ms to generate the first audio byte before
                # re-enabling interruptions. Without this, echo/background noise
                # triggers VAD and kills the response before the user hears anything.
                pt = _pipeline_task[0]
                if pt is not None:
                    pt.params.allow_interruptions = False
                    await asyncio.sleep(0.7)
                    pt.params.allow_interruptions = True

            return _handler

        for tool in TEAM_MEMBER_TOOLS:
            llm.register_function(tool["name"], _make_handler(tool["name"]))
        logger.info(
            f"[Pipeline] {call_id}: registered {len(TEAM_MEMBER_TOOLS)} team-member tools"
        )
```

- [ ] **Step 3: After `task = PipelineTask(...)` (current line 246), set the mutable box**

Replace line 246 with:
```python
    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
    _pipeline_task[0] = task   # now all handlers can see the live task
```

- [ ] **Step 4: Verify no import changes needed**

`asyncio` is already imported at line 9. `PipelineParams` is imported at line 23. No new imports needed.

### Task 1.2 — Silence the data-channel noise (reduces spurious signals)

WhatsApp's WebRTC never establishes a data channel. Pipecat queues hundreds of `send_app_message` calls, times out, then disables queueing. This generates noise and may contribute to pipeline state changes that trigger VAD.

**File:** `pipeline.py` — inside `run_pipeline_for_connection`, immediately after transport is created (after line 148)

- [ ] **Step 1: Add data-channel no-op override after transport creation**

After `webrtc_connection.force_transceivers_to_send_recv()` (line 155), add:

```python
    # WhatsApp calls never establish a WebRTC data channel.
    # Pipecat's SmallWebRTCConnection queues send_app_message calls for 10s then
    # clears them — generating hundreds of warning log lines and potential state
    # noise. Patch it to a no-op for this call so the queue never fills.
    webrtc_connection.send_app_message = lambda msg, *a, **kw: None
```

- [ ] **Step 2: Deploy to server and run one test call**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'cd /var/www/realty-pandit/agents/pipecat && pm2 restart panditji-voice && pm2 logs panditji-voice --lines 5 --nostream'
```

Expected: No more `Data channel not ready, queuing message` lines in subsequent calls.

- [ ] **Step 3: Verify VAD interrupt guard in logs after test call**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'pm2 logs panditji-voice --lines 200 --nostream 2>&1 | grep -E "allow_interruptions|VAD|Calling function|Bot started speaking" | tail -20'
```

Expected: After any `FunctionCallResultFrame`, no `VAD: interrupted` line should appear within 700ms of the result. The bot should start speaking.

- [ ] **Step 4: Commit**

```bash
git add clients/sunny-sharma/projects/reality-pandit/agents/pipecat/pipeline.py
git commit -m "fix(panditji): guard function-call response window from VAD interrupts

After result_callback fires, disable pipeline interruptions for 700ms so
Gemini can generate the first audio byte before echo/noise can cancel it.
Also no-op send_app_message since WhatsApp never opens a data channel."
```

---

## Phase 2 — Pre-load Caller Context (Eliminates Function Calls for Common Queries)

**Problem:** Every query requires a function call (~27ms DB) + Gemini generation (~855ms) = ~884ms. If the most common data (today's appointments, tasks, pipeline overview) is injected into the greeting seed, Gemini answers from context in ~150ms with no function call at all.

**Files:** `pipeline.py` — new `_prefetch_team_context()` function + modified greeting seed

### Task 2.1 — Add `_prefetch_team_context()` function

- [ ] **Step 1: Add the prefetch function after `_lookup_caller()` (after line 127)**

```python
# Common queries that team members ask at the start of almost every call.
# Pre-fetching these means Gemini answers from context (150ms) instead of
# making a tool call (880ms) for the first 3–5 questions.
_PREFETCH_TOOLS = [
    ("get_my_appointments", {"date_range": "today"}),
    ("get_my_tasks",        {"status": "pending"}),
    ("get_pipeline_overview", {"period": "month"}),
]


async def _prefetch_team_context(caller_number: str) -> str:
    """Fire 3 parallel read-only tool calls at call start and return a compact context block."""
    async def _fetch(tool_name: str, args: dict) -> tuple[str, dict]:
        try:
            result = await call_tool(tool_name, caller_number, args)
            return tool_name, result
        except Exception as e:
            logger.warning(f"[Prefetch] {tool_name} failed: {e}")
            return tool_name, {"ok": False}

    results = await asyncio.gather(*[_fetch(name, args) for name, args in _PREFETCH_TOOLS])

    lines = ["[PREFETCHED_CONTEXT — use this data to answer common questions instantly]"]
    for tool_name, data in results:
        if not data.get("ok"):
            continue
        if tool_name == "get_my_appointments":
            appts = data.get("appointments", [])
            if appts:
                appt_lines = [
                    f"  • {a.get('contact_name','?')} at {a.get('scheduled_at','?')}"
                    for a in appts[:5]
                ]
                lines.append(f"TODAY'S APPOINTMENTS ({len(appts)} total):\n" + "\n".join(appt_lines))
            else:
                lines.append("TODAY'S APPOINTMENTS: None scheduled")
        elif tool_name == "get_my_tasks":
            tasks = data.get("tasks", [])
            lines.append(f"PENDING TASKS: {len(tasks)} pending")
            for t in tasks[:3]:
                lines.append(f"  • {t.get('title','?')} — {t.get('contact_name','?')}")
        elif tool_name == "get_pipeline_overview":
            stages = data.get("stages", [])
            stage_summary = ", ".join(
                f"{s['stage']}: {s['count']}" for s in stages if s.get("count", 0) > 0
            )
            lines.append(f"PIPELINE (this month): {stage_summary or 'no data'}")

    return "\n".join(lines)
```

### Task 2.2 — Integrate prefetch into call startup

- [ ] **Step 1: In `run_pipeline_for_connection`, run prefetch in parallel with LLM setup**

After line 177 (after `is_team_member` and `system_prompt` are determined), add:

```python
    # For team members, pre-fetch common data while the pipeline is being wired up.
    # This task runs concurrently — by the time on_client_connected fires (300–700ms
    # later), the prefetch is already done and the result is available in the closure.
    prefetch_task: asyncio.Task | None = None
    if is_team_member:
        prefetch_task = asyncio.create_task(_prefetch_team_context(caller_number))
```

- [ ] **Step 2: In `_on_client_connected`, await the prefetch result and append to seed**

Replace the existing `_on_client_connected` handler (lines 259–275) with:

```python
    @transport.event_handler("on_client_connected")
    async def _on_client_connected(_t, _conn):
        logger.info(f"[Pipeline] Caller context for {call_id}:\n{caller_context_str}")

        # Gather prefetched context (already running; this await is usually near-instant)
        prefetched = ""
        if prefetch_task is not None:
            try:
                prefetched = await asyncio.wait_for(prefetch_task, timeout=3.0)
            except asyncio.TimeoutError:
                logger.warning(f"[Pipeline] Prefetch timed out for {call_id}")

        seed_content = f"[call_started]\n{caller_context_str}"
        if prefetched:
            seed_content += f"\n\n{prefetched}"

        await task.queue_frames([
            LLMMessagesAppendFrame(
                messages=[{"role": "user", "content": seed_content}],
                run_llm=True,
            )
        ])
        logger.info(f"[Pipeline] Greeting seed queued for call {call_id} (prefetch={'yes' if prefetched else 'no'})")
```

- [ ] **Step 3: Deploy and test — verify prefetch is used**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'pm2 logs panditji-voice --lines 100 --nostream 2>&1 | grep -E "Prefetch|PREFETCHED|prefetch"'
```

Expected: Lines like `[Prefetch] get_my_appointments ...` at call start, and `prefetch=yes` in the greeting log.

- [ ] **Step 4: Make a call and ask "aaj ke appointments" — verify NO function call fires**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'pm2 logs panditji-voice --lines 200 --nostream 2>&1 | grep -E "Calling function|Bot started speaking|Transcription:user" | tail -10'
```

Expected: User asks appointments → `Bot started speaking` within 300ms, NO `Calling function [get_my_appointments` line.

- [ ] **Step 5: Commit**

```bash
git add clients/sunny-sharma/projects/reality-pandit/agents/pipecat/pipeline.py
git commit -m "feat(panditji): pre-load appointments/tasks/pipeline at call start

Fire 3 parallel tool calls during pipeline setup so Gemini answers
common queries from context (~150ms) instead of tool calls (~880ms).
Prefetch runs concurrently with LLM init; result injected into greeting seed."
```

---

## Phase 3 — Trim System Prompts (Reduces Gemini Processing by ~350ms)

**Problem:** Customer prompt is ~4,800 tokens, team member prompt is ~2,300 tokens. Every Gemini turn processes the full system instruction. Target: ≤400 tokens each. Behavioral rules stay; verbose examples, tool descriptions with usage guidance, and repetitive formatting rules get cut.

**Files:**
- `agents/pipecat/prompts/panditji_team_member.txt`
- `agents/pipecat/prompts/panditji.txt`

### Task 3.1 — Rewrite `panditji_team_member.txt`

The current file contains: persona, detailed tool trigger examples, permission levels per tool, Hindi grammar rules (verbose), WhatsApp paper trail rule, gender-aware grammar, context injection format. 

Cut: verbose tool trigger examples (those belong in tool descriptions in `tools.py`), multi-paragraph Hindi grammar section, repetitive formatting reminders.

Keep: core identity, language rule (match caller's language), max 2–3 sentences per response, WhatsApp paper trail rule (compact), role-aware tool permissions (one line each).

- [ ] **Step 1: Back up current file on server before overwriting**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'cp /var/www/realty-pandit/agents/pipecat/prompts/panditji_team_member.txt \
      /var/www/realty-pandit/agents/pipecat/prompts/panditji_team_member.txt.bak'
```

- [ ] **Step 2: Replace `panditji_team_member.txt` with trimmed version**

Overwrite the file at:
`agents/pipecat/prompts/panditji_team_member.txt`

New content (target ~380 tokens):

```
You are Panditji, the AI assistant for Realty Pandit real estate. You are talking to a team member via WhatsApp voice call.

LANGUAGE: Match the caller's language. Default Hinglish. Short sentences only. Max 2–3 sentences per response — this is a phone call, not a chat.

ROLE-BASED TOOL ACCESS:
- employee: get_my_leads, get_my_appointments, get_my_tasks, search_lead, search_inventory, schedule_callback, log_call_note, send_on_whatsapp, schedule_site_visit, update_lead_status, get_lead_history, mark_task_done
- manager: all above + get_unassigned_leads, reassign_lead, get_team_performance, get_pipeline_overview
- super_boss: all tools including get_company_metrics, get_stuck_deals

WHATSAPP PAPER TRAIL: After retrieving any list with more than 2 items, always call send_on_whatsapp to send the summary to the caller's number so they have a written record.

CONTEXT: The [PREFETCHED_CONTEXT] block in the call_started message contains today's appointments, pending tasks, and pipeline overview already loaded. Answer questions about these from context directly — do not call the tool again unless the caller needs fresh data or asks about something not in the prefetch.

CALLER IDENTITY: The call_started message includes CALLER_TYPE, CALLER_NAME, CALLER_ROLE, CALLER_GENDER. Use the caller's name when addressing them. If CALLER_GENDER is male, use masculine Hindi. If female, use feminine Hindi.

TOOL USE: Always confirm lead identity via search_lead before scheduling or updating. Never guess a lead_id.
```

- [ ] **Step 3: Count tokens to verify target**

```bash
python3 -c "
import re
text = open('clients/sunny-sharma/projects/reality-pandit/agents/pipecat/prompts/panditji_team_member.txt').read()
words = len(text.split())
approx_tokens = int(words * 1.35)
print(f'Words: {words}, Approx tokens: {approx_tokens}')
"
```

Expected: ~270 words, ~365 tokens. If over 500, trim further.

### Task 3.2 — Rewrite `panditji.txt` (customer prompt)

Current: 3,218 words / ~4,800 tokens covering 4 caller scenarios, multi-step data collection flows, escalation rules.

- [ ] **Step 1: Back up current file**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'cp /var/www/realty-pandit/agents/pipecat/prompts/panditji.txt \
      /var/www/realty-pandit/agents/pipecat/prompts/panditji.txt.bak'
```

- [ ] **Step 2: Replace `panditji.txt` with trimmed version**

Overwrite `agents/pipecat/prompts/panditji.txt` — target ~350 tokens:

```
You are Panditji, the friendly AI assistant for Realty Pandit real estate. You are talking to a potential customer via WhatsApp voice call.

LANGUAGE: Match the caller's language exactly. Default Hindi. Max 2–3 sentences per response. This is a phone call — be warm, brief, and natural.

YOUR JOB: Understand what the caller wants (buy / sell / rent / lease property) and collect the required information to connect them with the right agent.

FOR BUYERS: Collect — intent (buy/rent), property type, BHK, location preference, budget (min/max), timeline. Ask one question at a time.

FOR SELLERS / LANDLORDS: Collect — property address, type, size, asking price, availability date. Ask one question at a time.

ESCALATION: If the caller is angry, wants to speak to a human, or asks for something you cannot help with, say: "Main abhi aapko humari team se connect karta/karti hoon" and end the call politely.

NEVER: Give specific pricing guarantees, legal advice, or claim properties are available without checking. Never make commitments on behalf of agents.

DATA COLLECTION RULE: Confirm each piece of information back to the caller before moving to the next question. Example: "Aapko 2BHK chahiye Vaishali mein — budget kya hai?"

When you have collected all required fields, say: "Theek hai, main aapki details hamare team ko bhej raha/rahi hoon. Woh aapse jald contact karenge."
```

- [ ] **Step 3: Verify token count**

```bash
python3 -c "
text = open('clients/sunny-sharma/projects/reality-pandit/agents/pipecat/prompts/panditji.txt').read()
words = len(text.split())
print(f'Words: {words}, Approx tokens: {int(words * 1.35)}')
"
```

Expected: ~240 words, ~325 tokens.

- [ ] **Step 4: Deploy and test both prompts**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'cd /var/www/realty-pandit && rsync -av agents/pipecat/prompts/ /var/www/realty-pandit/agents/pipecat/prompts/ && pm2 restart panditji-voice'
```

Make one team-member call and one "unknown number" call. Verify:
- Team member: Panditji greets by name, offers daily summary
- Unknown caller: Panditji asks about property intent

- [ ] **Step 5: Commit**

```bash
git add clients/sunny-sharma/projects/reality-pandit/agents/pipecat/prompts/
git commit -m "perf(panditji): trim system prompts from 4800/2300 tokens to ~350/380 tokens

Remove verbose tool trigger examples, multi-paragraph grammar rules, and
repetitive formatting instructions. Behavioral core preserved. Reduces
Gemini's per-turn processing overhead by ~350ms."
```

---

## Phase 4 — Parallelize Caller Lookup with Transport Setup (Saves 75–320ms)

**Problem:** `pipeline.py:171` calls `await _lookup_caller(caller_number)` before ANY pipeline work starts. The transport setup, `force_transceivers_to_send_recv`, and idle timeout fix (~50–80ms of sync work) currently wait for the HTTP lookup to finish first.

**Fix:** Start the lookup as a background task immediately, do the sync transport work, then await the result just before it's needed.

**File:** `pipeline.py` — `run_pipeline_for_connection()` lines 136–177

### Task 4.1 — Restructure startup sequence

- [ ] **Step 1: Replace lines 136–177 in `run_pipeline_for_connection()`**

Current order:
1. Create transport
2. `force_transceivers_to_send_recv()`
3. Set `_idle_timeout`
4. `await _lookup_caller()` ← BLOCKS
5. Determine `is_team_member`, `system_prompt`, `tools_schema`
6. Create `llm`

New order (saves the transport-setup time from the lookup's critical path):

```python
async def run_pipeline_for_connection(
    webrtc_connection: SmallWebRTCConnection,
    call_id: str,
    caller_number: str,
) -> None:
    """Wire a WhatsApp-accepted WebRTC connection into the Gemini Live pipeline."""

    # Start caller lookup immediately — it runs while we do sync transport work below.
    lookup_task = asyncio.create_task(_lookup_caller(caller_number))

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        ),
    )

    webrtc_connection.force_transceivers_to_send_recv()

    # Silence data-channel noise — WhatsApp never opens a data channel.
    webrtc_connection.send_app_message = lambda msg, *a, **kw: None

    _audio_track = webrtc_connection.audio_input_track()
    if _audio_track is not None:
        _audio_track._idle_timeout = 3600.0

    # Now await the lookup — it has been running in the background for ~50–80ms
    # already (the transport setup above overlaps with the HTTP roundtrip).
    caller_context_str = await lookup_task
    is_team_member = "CALLER_TYPE: MANAGEMENT" in caller_context_str
    system_prompt = TEAM_MEMBER_SYSTEM_PROMPT if is_team_member else CUSTOMER_SYSTEM_PROMPT
    logger.info(
        f"[Pipeline] {call_id}: is_team_member={is_team_member}, "
        f"using {'team' if is_team_member else 'customer'} prompt"
    )
```

- [ ] **Step 2: Remove the duplicate `send_app_message` no-op from Phase 1 if it was added inline**

The Phase 1 no-op patch is now incorporated into the restructured startup above. Verify there's only one `send_app_message = lambda` line.

- [ ] **Step 3: Deploy and verify**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'pm2 restart panditji-voice && pm2 logs panditji-voice --lines 3 --nostream'
```

Time the gap between `_handle_connect_event` and `Connecting to Gemini` in the next call's logs:

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'pm2 logs panditji-voice --lines 100 --nostream 2>&1 | grep -E "_handle_connect_event|Connecting to Gemini"'
```

Expected: Gap reduces from ~1.8s to ~1.5s (saves ~75–320ms depending on DB load).

- [ ] **Step 4: Commit**

```bash
git add clients/sunny-sharma/projects/reality-pandit/agents/pipecat/pipeline.py
git commit -m "perf(panditji): parallelize caller lookup with transport setup

Start _lookup_caller as a background asyncio.Task immediately on call
connect, do sync transport work while HTTP runs, await result just before
it's needed. Saves 75–320ms from call setup critical path."
```

---

## Phase 5 — In-Session Result Cache in Tool Dispatcher (Instant Repeated Queries)

**Problem:** If a user asks the same question twice in a call (e.g., pipeline overview to voice, then "bhej do" WhatsApp), the second call hits the DB again. A simple 60s TTL dict cache makes repeated queries return in 0ms.

**File:** `tools.py` — `call_tool()` function (lines 376–411)

### Task 5.1 — Add in-session cache to `call_tool()`

- [ ] **Step 1: Add imports and cache dict at top of `tools.py` (after line 10)**

```python
import json
import time
```

After the `NODE_BACKEND_URL` and `TOOLS_BASE` declarations (after line 16), add:

```python
# In-session cache for read-only tools. Key: "phone:tool:args_json" → {result, ts}.
# TTL: 60 seconds. Only caches successful (ok=True) responses.
_TOOL_CACHE: dict[str, dict] = {}
_CACHE_TTL_SECONDS = 60

# Tools that are safe to cache (read-only, no side effects).
_CACHEABLE_TOOLS = {
    "get_my_leads",
    "get_my_appointments",
    "get_my_tasks",
    "get_unassigned_leads",
    "get_team_performance",
    "get_pipeline_overview",
    "get_company_metrics",
    "get_stuck_deals",
    "get_lead_history",
}
```

- [ ] **Step 2: Wrap `call_tool()` with cache logic**

Replace lines 376–411 (`call_tool` function) with:

```python
async def call_tool(tool_name: str, caller_phone: str, args: dict[str, Any]) -> dict[str, Any]:
    """Dispatch a Gemini Live tool call to the Node backend. Returns JSON dict.

    Read-only tools are cached for 60s per (caller_phone, tool_name, args) key.
    Write tools (schedule_*, log_*, update_*, mark_*, send_*, reassign_*) bypass cache.
    Never raises — Gemini Live expects a structured response.
    """
    if tool_name not in _TOOL_PATHS:
        return {"ok": False, "error": f"unknown tool {tool_name}"}

    # Check cache for read-only tools
    cache_key = f"{caller_phone}:{tool_name}:{json.dumps(args, sort_keys=True)}"
    if tool_name in _CACHEABLE_TOOLS:
        entry = _TOOL_CACHE.get(cache_key)
        if entry and (time.time() - entry["ts"]) < _CACHE_TTL_SECONDS:
            logger.debug(f"[Cache] HIT {tool_name} ({int(time.time() - entry['ts'])}s old)")
            return entry["result"]

    # Execute HTTP call
    method, path = _TOOL_PATHS[tool_name]
    url = f"{TOOLS_BASE}{path}"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if method == "GET":
                params = {"caller": caller_phone}
                for k, v in (args or {}).items():
                    if v is not None:
                        params[k] = v
                resp = await client.get(url, params=params)
            else:
                body = {"caller": caller_phone, **(args or {})}
                resp = await client.post(url, json=body)

            if resp.status_code >= 400:
                logger.warning(f"[Tool] {tool_name} {resp.status_code}: {resp.text[:200]}")
                return {
                    "ok": False,
                    "error": f"http {resp.status_code}",
                    "detail": resp.text[:300],
                }

            result = resp.json()

    except Exception as e:
        logger.error(f"[Tool] {tool_name} failed: {e}")
        return {"ok": False, "error": str(e)}

    # Store in cache for read-only tools (only on success)
    if tool_name in _CACHEABLE_TOOLS and result.get("ok"):
        _TOOL_CACHE[cache_key] = {"result": result, "ts": time.time()}
        logger.debug(f"[Cache] STORE {tool_name}")

    return result
```

- [ ] **Step 3: Deploy and verify cache hits in logs**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'pm2 logs panditji-voice --lines 200 --nostream 2>&1 | grep -E "\[Cache\]"'
```

Expected: On a call where pipeline overview is asked and then asked again: `[Cache] HIT get_pipeline_overview (12s old)`.

- [ ] **Step 4: Commit**

```bash
git add clients/sunny-sharma/projects/reality-pandit/agents/pipecat/tools.py
git commit -m "perf(panditji): add 60s in-session cache for read-only tool calls

Caches get_my_appointments, get_pipeline_overview, get_company_metrics,
and 6 other read-only tools. Write tools bypass cache. Repeated queries
in the same call return in 0ms instead of 27–52ms + 855ms Gemini gen."
```

---

## Deployment Order

Execute phases in this order — each is independently deployable:

```
Phase 1 → Phase 4 → Phase 2 → Phase 5 → Phase 3
```

Rationale: Phase 1 (VAD guard) fixes the CRITICAL silent-gap bug first. Phase 4 (parallel lookup) is a small refactor needed before Phase 2 (prefetch) is added. Phase 5 (cache) and Phase 3 (prompts) are independent improvements.

Deploy command for each phase:
```bash
# Sync local pipecat dir to server
rsync -av -e "ssh -i ~/.ssh/realty_pandit_key -F /dev/null" \
  clients/sunny-sharma/projects/reality-pandit/agents/pipecat/ \
  root@72.62.231.224:/var/www/realty-pandit/agents/pipecat/

# Restart PM2
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'pm2 restart panditji-voice'
```

---

## Verification — End-to-End Latency Test

After all phases deployed, measure actual latency from a real call:

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'pm2 logs panditji-voice --lines 300 --nostream 2>&1 \
   | grep -v "INPUT-DIAG\|media stream error\|Cache STORE" \
   | grep -E "Transcription:user|Bot started speaking|Calling function|FunctionCallResultFrame|prefetch" \
   | tail -30'
```

**Target latency measurements:**

| Query type | Current | Target after all phases |
|-----------|---------|------------------------|
| Pre-loaded (appointments, tasks, pipeline) | 884ms | ≤200ms |
| Fresh DB query (search_lead, search_inventory) | 884ms | ≤550ms |
| Repeated query (same question 2nd time) | 884ms | ≤200ms (cache hit) |
| Spurious VAD silent gaps | 10–57s | 0 (guard active) |

**Pass criteria:**
- No `Gemini VAD: interrupted signal received` within 700ms of any `FunctionCallResultFrame`
- `Bot started speaking` appears within 300ms of greeting seed for pre-loaded queries
- `[Cache] HIT` log lines appear for repeated queries
- Zero calls where bot is silent for >3s without a transcription or EndFrame
