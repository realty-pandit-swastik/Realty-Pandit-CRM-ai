"""Panditji voice pipeline.

Spun up per-call from the WhatsApp webhook handler. Receives a pre-connected
SmallWebRTCConnection from pipecat.transports.whatsapp, wraps it in a
Gemini Live pipeline, and notifies the Node backend with the transcript when
the call ends.
"""

import asyncio
import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from loguru import logger

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.frames.frames import EndFrame, LLMMessagesAppendFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.services.llm_service import FunctionCallParams

try:
    from instrument import sentry_sdk  # type: ignore
except Exception:
    sentry_sdk = None  # type: ignore[assignment]


def _capture(exc: Exception, **tags) -> None:
    if sentry_sdk is None:
        return
    try:
        with sentry_sdk.push_scope() as scope:
            for k, v in tags.items():
                scope.set_tag(k, str(v))
            sentry_sdk.capture_exception(exc)
    except Exception:
        pass
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from tools import TEAM_MEMBER_TOOLS, CUSTOMER_TOOLS, call_tool

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://127.0.0.1:7071")

_PROMPTS_DIR = Path(__file__).parent / "prompts"
CUSTOMER_SYSTEM_PROMPT = (_PROMPTS_DIR / "panditji.txt").read_text(encoding="utf-8")
TEAM_MEMBER_SYSTEM_PROMPT = (_PROMPTS_DIR / "panditji_team_member.txt").read_text(encoding="utf-8")
# Backward-compat alias: earlier code paths / tests imported PANDITJI_SYSTEM_PROMPT.
PANDITJI_SYSTEM_PROMPT = CUSTOMER_SYSTEM_PROMPT


def _build_tools_schema(tools: list) -> ToolsSchema:
    """Convert the OpenAI-style dict tools from tools.py into a Pipecat ToolsSchema."""
    schemas = []
    for tool in tools:
        params = tool.get("parameters") or {}
        schemas.append(
            FunctionSchema(
                name=tool["name"],
                description=tool.get("description", ""),
                properties=params.get("properties", {}) or {},
                required=params.get("required", []) or [],
            )
        )
    return ToolsSchema(standard_tools=schemas)


async def _lookup_caller(caller_number: str) -> str:
    """Fetch caller profile from Node backend and return a context string for the seed message."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{NODE_BACKEND_URL}/webhooks/internal/caller-lookup",
                params={"phone": caller_number},
            )
            if resp.status_code != 200:
                return f"CALLER_PHONE: {caller_number}\nCALLER_STATUS: not_found"
            data = resp.json()
    except Exception as e:
        logger.warning(f"[Pipeline] caller-lookup failed for {caller_number}: {e}")
        _capture(e, stage="caller_lookup", caller=caller_number)
        return f"CALLER_PHONE: {caller_number}\nCALLER_STATUS: lookup_failed"

    identified = data.get("identified")
    contact = data.get("contact")

    lines = [f"CALLER_PHONE: {caller_number}"]

    if identified:
        lines.append(f"CALLER_TYPE: {identified['contact_type']}")
        if identified.get("name"):
            lines.append(f"CALLER_NAME: {identified['name']}")
        if identified.get("role"):
            lines.append(f"CALLER_ROLE: {identified['role']}")
        if identified.get("department"):
            lines.append(f"CALLER_DEPARTMENT: {identified['department']}")
        if identified.get("gender"):
            lines.append(f"CALLER_GENDER: {identified['gender']}")
        if identified.get("preferred_language"):
            lines.append(f"CALLER_PREFERRED_LANGUAGE: {identified['preferred_language']}")
    elif contact and contact.get("name"):
        lines.append("CALLER_TYPE: KNOWN_CONTACT")
        lines.append(f"CALLER_NAME: {contact['name']}")
    else:
        lines.append("CALLER_TYPE: FRESH_LEAD")

    if contact:
        if contact.get("intent"):
            lines.append(f"CALLER_INTENT_HISTORY: {contact['intent']}")
        if contact.get("preferred_location"):
            lines.append(f"CALLER_PREFERRED_LOCATION: {contact['preferred_location']}")
        if contact.get("budget_min") or contact.get("budget_max"):
            lines.append(f"CALLER_BUDGET_HISTORY: {contact.get('budget_min', '?')} – {contact.get('budget_max', '?')}")
        leads = contact.get("leads", [])
        if leads:
            lead_summaries = []
            for lead in leads:
                parts = []
                if lead.get("intent"):
                    parts.append(lead["intent"])
                if lead.get("demand_main_category"):
                    parts.append(lead["demand_main_category"])
                if lead.get("demand_type_slug"):
                    parts.append(lead["demand_type_slug"])
                if lead.get("budget_min") or lead.get("budget_max"):
                    parts.append(f"budget {lead.get('budget_min', '?')}–{lead.get('budget_max', '?')}")
                lead_summaries.append(", ".join(parts))
            lines.append(f"CALLER_PREVIOUS_LEADS: {' | '.join(lead_summaries)}")

    return "\n".join(lines)


# Common queries that team members ask at the start of almost every call.
# Pre-fetching these means Gemini answers from context (~150ms) instead of
# making a tool call (~880ms) for the first 3–5 questions.
_PREFETCH_TOOLS = [
    ("get_my_appointments", {"date_range": "today"}),
    ("get_my_tasks",        {"status": "pending"}),
    ("get_pipeline_overview", {"period": "month"}),
]


async def _prefetch_team_context(caller_number: str) -> str:
    """Fire 3 parallel read-only tool calls at call start and return a compact context block."""
    async def _fetch(tool_name: str, args: dict) -> tuple:
        try:
            result = await call_tool(tool_name, caller_number, args)
            return tool_name, result
        except Exception as e:
            logger.warning(f"[Prefetch] {tool_name} failed: {e}")
            _capture(e, stage="prefetch", tool=tool_name)
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
                    f"  • {a.get('contact_name', '?')} at {a.get('scheduled_at', '?')}"
                    for a in appts[:5]
                ]
                lines.append(f"TODAY'S APPOINTMENTS ({len(appts)} total):\n" + "\n".join(appt_lines))
            else:
                lines.append("TODAY'S APPOINTMENTS: None scheduled")
        elif tool_name == "get_my_tasks":
            tasks = data.get("tasks", [])
            lines.append(f"PENDING TASKS: {len(tasks)} pending")
            for t in tasks[:3]:
                lines.append(f"  • {t.get('title', '?')} — {t.get('contact_name', '?')}")
        elif tool_name == "get_pipeline_overview":
            stages = data.get("stages", [])
            stage_summary = ", ".join(
                f"{s['stage']}: {s['count']}" for s in stages if s.get("count", 0) > 0
            )
            lines.append(f"PIPELINE (this month): {stage_summary or 'no data'}")

    return "\n".join(lines)


async def run_pipeline_for_connection(
    webrtc_connection: SmallWebRTCConnection,
    call_id: str,
    caller_number: str,
) -> None:
    """Wire a WhatsApp-accepted WebRTC connection into the Gemini Live pipeline."""

    # PHASE 4: Start caller lookup immediately as a background task so it runs
    # concurrently with the sync transport setup below (saves 75–320ms).
    lookup_task = asyncio.create_task(_lookup_caller(caller_number))

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            # Gemini Live expects 16 kHz PCM mono on input and produces 24 kHz.
            # WhatsApp Opus is 16 kHz too, but aiortc decodes Opus to 48 kHz
            # by default — without these explicit rates Pipecat auto-resamples
            # to unpredictable defaults and Gemini Live stops recognising speech.
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        ),
    )

    # Force audio transceiver to sendrecv so Meta streams caller audio to us.
    webrtc_connection.force_transceivers_to_send_recv()

    # PHASE 1: WhatsApp calls never establish a WebRTC data channel.
    # Pipecat queues send_app_message calls for 10s then clears them, generating
    # hundreds of warning log lines and potential pipeline state noise. No-op it.
    webrtc_connection.send_app_message = lambda msg, *a, **kw: None

    # Pipecat's SmallWebRTCTrack disables the aiortc receiver after 2s of no
    # recv() activity. Raise the threshold so the receiver stays active for the
    # entire call even while Panditji is speaking and the caller is silent.
    _audio_track = webrtc_connection.audio_input_track()
    if _audio_track is not None:
        _audio_track._idle_timeout = 3600.0

    # Await lookup now — it has been running in background during transport setup.
    caller_context_str = await lookup_task
    is_team_member = "CALLER_TYPE: MANAGEMENT" in caller_context_str
    system_prompt = TEAM_MEMBER_SYSTEM_PROMPT if is_team_member else CUSTOMER_SYSTEM_PROMPT
    logger.info(
        f"[Pipeline] {call_id}: is_team_member={is_team_member}, "
        f"using {'team' if is_team_member else 'customer'} prompt"
    )

    # Active tool set depends on the caller: team members get the full toolkit; customers get the
    # customer-safe subset (search_and_show_properties + send_booking_flow) so Panditji can actually
    # send them matching properties + a booking flow during the call.
    active_tools = TEAM_MEMBER_TOOLS if is_team_member else CUSTOMER_TOOLS
    tools_schema = _build_tools_schema(active_tools)

    # PHASE 2: Pre-fetch common team-member data concurrently with LLM init.
    # By the time on_client_connected fires (~300–700ms later), this is done.
    prefetch_task: asyncio.Task | None = None
    if is_team_member:
        prefetch_task = asyncio.create_task(_prefetch_team_context(caller_number))

    # Pipecat 1.0.0: model/voice/language moved into settings=Settings(...) (the old top-level
    # model=/voice_id=/params= kwargs are deprecated). voice_id default "Charon" never warned.
    llm = GeminiLiveLLMService(
        api_key=GEMINI_API_KEY,
        system_instruction=system_prompt,
        settings=GeminiLiveLLMService.Settings(
            model="models/gemini-3.1-flash-live-preview",
            voice="Charon",
            language=Language.HI_IN,
        ),
    )

    # PHASE 1: Mutable box so handler closures can reference `task` before it
    # is assigned. Python closures capture by reference — the box is populated
    # after task creation below, before any actual call can fire.
    _pipeline_task: list = [None]

    def _make_handler(tool_name: str):
        async def _handler(params: FunctionCallParams) -> None:
            try:
                result = await call_tool(
                    tool_name, caller_number, dict(params.arguments or {})
                )
            except Exception as e:
                logger.error(f"[Tool] {tool_name} dispatcher crashed: {e}")
                _capture(e, stage="tool_dispatcher", tool=tool_name)
                result = {"ok": False, "error": str(e)}

            await params.result_callback(result)

            # PHASE 1 VAD GUARD: After result_callback, Gemini needs ~700–900ms
            # to generate the first audio byte. During that window, echo or
            # background noise triggers VAD and cancels the response before the
            # caller hears anything (observed: 10–57s silent gaps in prod logs).
            # Monkey-patch llm.broadcast_interruption for 700ms — PipelineParams
            # in Pipecat 1.0.0 is an immutable Pydantic model with no
            # allow_interruptions field, so the params approach doesn't work.
            _orig_broadcast = llm.broadcast_interruption
            async def _suppressed_broadcast(*a, **kw):
                logger.debug("[VAD Guard] interrupt suppressed during tool response window")
            llm.broadcast_interruption = _suppressed_broadcast
            await asyncio.sleep(0.7)
            llm.broadcast_interruption = _orig_broadcast

        return _handler

    # Register the active tool set's handlers — team members get the full toolkit, customers get the
    # 2 customer-safe tools. (Previously only team members had ANY tools, so customer calls could never
    # send properties even though the customer prompt told the bot to.)
    for tool in active_tools:
        llm.register_function(tool["name"], _make_handler(tool["name"]))
    logger.info(
        f"[Pipeline] {call_id}: registered {len(active_tools)} tools "
        f"({'team' if is_team_member else 'customer'})"
    )

    context_kwargs = {"messages": []}
    if tools_schema is not None:
        context_kwargs["tools"] = tools_schema
    context = LLMContext(**context_kwargs)
    context_aggregator = LLMContextAggregatorPair(context)

    pipeline = Pipeline([
        transport.input(),
        context_aggregator.user(),
        llm,
        transport.output(),
        context_aggregator.assistant(),
    ])
    task = PipelineTask(pipeline, params=PipelineParams())
    _pipeline_task[0] = task   # handlers can now see the live task reference

    @webrtc_connection.event_handler("closed")
    async def _on_closed(_):
        await task.queue_frame(EndFrame())

    @transport.event_handler("on_client_connected")
    async def _on_client_connected(_t, _conn):
        logger.info(f"[Pipeline] Caller context for {call_id}:\n{caller_context_str}")

        # PHASE 2: Gather prefetched context (already running; await is near-instant).
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
                messages=[{
                    "role": "user",
                    "content": seed_content,
                }],
                run_llm=True,
            )
        ])
        logger.info(
            f"[Pipeline] Greeting seed queued for call {call_id} "
            f"(prefetch={'yes' if prefetched else 'no'})"
        )

    runner = PipelineRunner()
    asyncio.create_task(_run_and_notify(runner, task, call_id, caller_number, llm))


async def _run_and_notify(runner, task, call_id, caller_number, llm):
    # Lazy import: instrument.py is loaded by main.py at startup; importing
    # here keeps pipeline.py importable in isolation (e.g. tests).
    try:
        from instrument import sentry_sdk  # type: ignore
    except ImportError:
        sentry_sdk = None  # type: ignore[assignment]

    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"[Pipeline] runner failed for call {call_id}: {e}")
        if sentry_sdk is not None:
            sentry_sdk.capture_exception(
                e,
                # call_id is non-PII; caller_number gets masked by before_send.
                # tags must be primitives — keep them small.
            )
        # Don't re-raise — we still want to attempt transcript persistence below.
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


async def _notify_call_ended(call_id: str, caller_number: str, transcript: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{NODE_BACKEND_URL}/webhooks/internal/call-ended",
                json={
                    "call_id": call_id,
                    "caller_number": caller_number,
                    "transcript": transcript,
                    "source": "pipecat",
                },
            )
    except Exception as e:
        logger.error(f"Failed to notify Node backend for call {call_id}: {e}")
