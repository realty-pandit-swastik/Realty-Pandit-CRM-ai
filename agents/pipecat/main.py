"""Panditji WhatsApp Calling webhook service.

Meta webhook → WhatsAppClient → SmallWebRTCConnection → Gemini Live pipeline.
The SIP flow is gone — Meta calls our HTTPS webhook, we answer via Graph API
`pre_accept` + `accept`, and the WhatsAppClient handles the WebRTC setup.
"""

# instrument MUST be the first import — initializes GlitchTip / sentry-sdk and
# patches fastapi/starlette/asyncio before they load.
import instrument  # noqa: F401, E402  (side-effect import; must precede framework imports)

import os
from contextlib import asynccontextmanager

import aiohttp
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from loguru import logger

from instrument import sentry_sdk

from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.whatsapp.api import WhatsAppWebhookRequest
from pipecat.transports.whatsapp.client import WhatsAppClient

from pipeline import run_pipeline_for_connection

load_dotenv()

WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_SYSTEM_TOKEN") or os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET", "")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "")

# Per-call metadata populated from the connect webhook so the pipeline can tag
# its end-of-call notification.
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
    """Meta calls this once during webhook setup to verify the endpoint."""
    try:
        challenge = await _wa_client.handle_verify_webhook_request(
            dict(request.query_params), WHATSAPP_VERIFY_TOKEN
        )
        return Response(content=str(challenge), media_type="text/plain")
    except ValueError as e:
        logger.warning(f"Webhook verify failed: {e}")
        raise HTTPException(status_code=403, detail=str(e))


@app.post("/wa/webhook")
async def handle_webhook(request: Request):
    """Receives every WhatsApp call event (connect, terminate)."""
    raw_body = await request.body()
    signature = request.headers.get("x-hub-signature-256", "")
    try:
        payload = WhatsAppWebhookRequest.model_validate_json(raw_body)
    except Exception as e:
        logger.error(f"Invalid webhook payload: {e}")
        raise HTTPException(status_code=400, detail="invalid payload")

    # Capture caller metadata before handing off to WhatsAppClient, so the
    # pipeline can include it in the end-of-call notification.
    for entry in payload.entry:
        for change in entry.changes:
            value = change.value
            calls = getattr(value, "calls", None) or []
            for call in calls:
                if call.event == "connect":
                    _call_meta[call.id] = {
                        "caller_number": getattr(call, "from_", "unknown"),
                    }

    try:
        await _wa_client.handle_webhook_request(
            request=payload,
            connection_callback=_on_connected,
            raw_body=raw_body,
            sha256_signature=signature,
        )
    except Exception as e:
        logger.error(f"Webhook handling failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok"}


async def _on_connected(webrtc_connection: SmallWebRTCConnection) -> None:
    """Fires after WhatsAppClient accepts the call and ICE/DTLS are set up."""
    call_id = webrtc_connection.pc_id
    # Match the connection back to the caller metadata we stored above.
    # WhatsAppClient stores the original call.id as the dict key in
    # _ongoing_calls_map — find it by value identity.
    real_call_id = next(
        (cid for cid, conn in _wa_client._ongoing_calls_map.items() if conn is webrtc_connection),
        call_id,
    )
    meta = _call_meta.pop(real_call_id, {})
    caller_number = meta.get("caller_number", "unknown")
    logger.info(f"[WA] Pipeline starting for call {real_call_id} from {caller_number}")

    # Wrap the entire per-call pipeline so any uncaught error reaches GlitchTip
    # with call-level tags. caller_number is masked by the global before_send scrubber.
    try:
        if sentry_sdk is not None:
            sentry_sdk.set_tag("call_id", real_call_id)
            sentry_sdk.set_tag("source", "whatsapp_call")
        await run_pipeline_for_connection(webrtc_connection, real_call_id, caller_number)
    except Exception:
        if sentry_sdk is not None:
            sentry_sdk.capture_exception()
        raise


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=int(os.getenv("PIPECAT_PORT", "8765")),
        reload=False,
    )
