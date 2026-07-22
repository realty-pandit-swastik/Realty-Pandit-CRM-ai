"""GlitchTip / Sentry-SDK instrumentation for Panditji voice service.

MUST be imported FIRST (before fastapi / pipecat / anything else) so that
auto-instrumentation can patch HTTP and asyncio primitives before they are used.

Imported as: `import instrument  # noqa: F401` from main.py (line 1).

The Sentry SDK is the wire-compatible transport for GlitchTip — set
GLITCHTIP_DSN_PIPECAT in the environment (separate project from backend so
voice errors don't mix with web errors).
"""

import os
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Pipecat reuses the existing backend GlitchTip project (set GLITCHTIP_DSN to the
# backend DSN value). The legacy GLITCHTIP_DSN_PIPECAT is still honored for setups
# that prefer a dedicated voice project — checked first.
_GLITCHTIP_DSN = (
    os.getenv("GLITCHTIP_DSN_PIPECAT")
    or os.getenv("GLITCHTIP_DSN")
    or os.getenv("SENTRY_DSN")
    or ""
)


def _read_release() -> str:
    """Read deploy release tag (git short SHA) written by scripts/write-release.sh."""
    release_file = Path(__file__).parent / ".release.txt"
    try:
        if release_file.exists():
            return release_file.read_text(encoding="utf-8").strip()
    except OSError:
        pass
    return os.getenv("GIT_SHA", "unknown")


_PHONE_RE = re.compile(r"[+]?\d{10,15}")


def _mask_phone(value: str) -> str:
    """Keep last 4 digits, mask the rest. Returns the original on no match."""
    if not isinstance(value, str):
        return value
    cleaned = re.sub(r"[\s-]", "", value)
    if not re.fullmatch(r"[+]?\d{10,15}", cleaned):
        return value
    return ("*" * (len(cleaned) - 4)) + cleaned[-4:]


_REDACT_KEYS = {
    "password", "password_confirm", "new_password", "old_password",
    "token", "refresh_token", "access_token", "auth_token", "jwt",
    "otp", "csrf_token", "x-hub-signature-256",
    "whatsapp_token", "whatsapp_system_token", "whatsapp_app_secret",
    "gemini_api_key",
    "razorpay_payment_id", "razorpay_order_id", "razorpay_signature",
}
_PHONE_KEY_HINTS = ("phone", "mobile", "whatsapp", "msisdn", "caller_number", "phone_number", "from_")


def _scrub(obj, depth=0):
    """Recursively scrub a dict/list in place. Caller owns the object."""
    if depth > 5 or obj is None:
        return
    if isinstance(obj, dict):
        for key in list(obj.keys()):
            lower = key.lower()
            if lower in _REDACT_KEYS:
                obj[key] = "[REDACTED]"
                continue
            if any(h in lower for h in _PHONE_KEY_HINTS) and isinstance(obj[key], str):
                obj[key] = _mask_phone(obj[key])
                continue
            if isinstance(obj[key], (dict, list)):
                _scrub(obj[key], depth + 1)
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                _scrub(item, depth + 1)


def _before_send(event, _hint):
    # (P-D, 2026-06-23) Drop benign asyncio/pipecat teardown noise. These fire when a voice call
    # disconnects and pipecat cancels its internal processor/observer tasks (SmallWebRTC, Gemini Live,
    # aggregators) — framework-level cleanup warnings with no user impact, NOT app errors. Captured only
    # because LoggingIntegration promotes asyncio's logger.error lines to events; without this filter
    # they flood GlitchTip (~21 such issues) and bury real errors.
    # "task_manager:cancel_task" added 2026-06-25 (#87): pipecat logs CRITICAL from its own
    # task_manager when force-cancelling internal tasks on call disconnect — teardown, not an app
    # error. NOTE: we deliberately do NOT suppress "[Pipeline] runner failed" (#88) — that's a real
    # per-call pipeline failure worth capturing.
    _benign = (
        "Task was destroyed but it is pending",
        "coroutine ignored GeneratorExit",
        "task_manager:cancel_task",
    )
    _parts = []
    _le = event.get("logentry") or {}
    if isinstance(_le, dict) and _le.get("message"):
        _parts.append(str(_le["message"]))
    if event.get("message"):
        _parts.append(str(event["message"]))
    for _v in ((event.get("exception") or {}).get("values") or []):
        if isinstance(_v, dict) and _v.get("value"):
            _parts.append(str(_v["value"]))
    if any(b in " ".join(_parts) for b in _benign):
        return None  # drop benign teardown noise

    # Scrub request headers
    request = event.get("request") or {}
    headers = request.get("headers")
    if isinstance(headers, dict):
        for k in list(headers.keys()):
            if k.lower() in ("authorization", "cookie", "x-hub-signature-256"):
                headers[k] = "[REDACTED]"

    # Scrub request body and URL query string
    if isinstance(request.get("data"), (dict, list)):
        _scrub(request["data"])
    if isinstance(request.get("query_string"), str):
        request["query_string"] = _PHONE_RE.sub(lambda m: _mask_phone(m.group(0)), request["query_string"])

    # Scrub extras, contexts, tags (where we pass caller_number etc.)
    if "extra" in event:
        _scrub(event["extra"])
    if "contexts" in event:
        _scrub(event["contexts"])
    if "tags" in event and isinstance(event["tags"], dict):
        _scrub(event["tags"])

    return event


def _before_breadcrumb(crumb, _hint):
    """Mask phone numbers in breadcrumb URLs / messages."""
    data = crumb.get("data")
    if isinstance(data, dict):
        url = data.get("url")
        if isinstance(url, str):
            data["url"] = _PHONE_RE.sub(lambda m: _mask_phone(m.group(0)), url)
    message = crumb.get("message")
    if isinstance(message, str):
        crumb["message"] = _PHONE_RE.sub(lambda m: _mask_phone(m.group(0)), message)
    return crumb


if _GLITCHTIP_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    from sentry_sdk.integrations.asyncio import AsyncioIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration

    sentry_sdk.init(
        dsn=_GLITCHTIP_DSN,
        environment=os.getenv("NODE_ENV", "production"),
        release=_read_release(),
        traces_sample_rate=0.1,
        # send_default_pii=False is implicit; we still scrub explicitly above.
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            StarletteIntegration(transaction_style="endpoint"),
            AsyncioIntegration(),
            # Capture logger.error / logger.exception as Sentry events.
            # Below ERROR (warning/info/debug) become breadcrumbs only.
            LoggingIntegration(level=None, event_level="ERROR"),
        ],
        before_send=_before_send,
        before_breadcrumb=_before_breadcrumb,
    )

    # Tag every event so the shared project can be filtered by service.
    sentry_sdk.set_tag("service", "pipecat")

    # Re-export so callers can `from instrument import sentry_sdk`.
    __all__ = ["sentry_sdk"]
else:
    sentry_sdk = None  # type: ignore[assignment]
    __all__ = ["sentry_sdk"]
