"""Panditji voice tools — Gemini Live function definitions + HTTP bridge to Node.

Each tool is a function Gemini Live can invoke mid-conversation. When a tool call
fires, Pipecat's event handler (see pipeline.py) calls `call_tool` which posts
the invocation to the Node backend. The JSON result flows back to Gemini Live,
which continues the conversation with fresh data.
"""

import json
import os
import time
from typing import Any

import httpx
from loguru import logger

NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://127.0.0.1:7071")
TOOLS_BASE = f"{NODE_BACKEND_URL}/webhooks/internal/tools"

# In-session cache for read-only tools. Key: "phone:tool:args_json" → {result, ts}.
# TTL: 60 seconds. Only successful (ok=True) responses are cached.
_TOOL_CACHE: dict[str, dict] = {}
_CACHE_TTL_SECONDS = 60

# Read-only tools safe to cache — write/action tools always bypass.
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


# Tool specifications for Gemini Live (OpenAI-function schema format).
TEAM_MEMBER_TOOLS = [
    {
        "name": "get_my_leads",
        "description": (
            "Fetch leads assigned to the calling team member. Use this when they "
            "ask about 'mere leads', 'my leads', or with a specific stage filter "
            "like 'hot leads' or 'negotiation stage'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "stage": {
                    "type": "string",
                    "description": "Optional lifecycle stage filter (e.g. 'new', 'site_visit_scheduled', 'negotiation').",
                },
                "limit": {
                    "type": "integer",
                    "description": "How many leads to return. Default 10, max 50.",
                },
            },
        },
    },
    {
        "name": "get_my_appointments",
        "description": (
            "Fetch the caller's upcoming appointments or site visits. Use when they "
            "ask 'aaj ke appointments', 'today's meetings', or for a specific range."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "date_range": {
                    "type": "string",
                    "enum": ["today", "week", "upcoming"],
                    "description": "Default: today.",
                },
            },
        },
    },
    {
        "name": "get_my_tasks",
        "description": (
            "Fetch pending tasks (callbacks, follow-ups) for the caller. Use when "
            "they ask 'kya pending hai?' or 'what callbacks do I have'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["pending", "completed"],
                    "description": "Default: pending.",
                },
            },
        },
    },
    {
        "name": "search_lead",
        "description": (
            "Look up a specific lead by name or phone number. Use when they refer "
            "to a client by name like 'Priya Sharma ki file dikhao'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "phone": {"type": "string"},
                "lead_id": {"type": "string"},
            },
        },
    },
    {
        "name": "schedule_callback",
        "description": (
            "Schedule a callback task for a lead. Always confirm the lead identity "
            "before calling this — use search_lead first if the lead_id is not known."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string"},
                "datetime": {
                    "type": "string",
                    "description": "ISO8601 datetime of the callback (e.g. 2026-04-20T10:00:00.000Z).",
                },
                "note": {"type": "string", "description": "Optional note about the callback."},
            },
            "required": ["lead_id", "datetime"],
        },
    },
    {
        "name": "log_call_note",
        "description": (
            "Save a note against a lead. Use when the caller explicitly says "
            "'ye note add karo' or after summarizing an important discussion point."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string"},
                "note": {"type": "string"},
            },
            "required": ["lead_id", "note"],
        },
    },
    {
        "name": "send_on_whatsapp",
        "description": (
            "Send a WhatsApp text message to a recipient (the caller for a paper "
            "trail, or a client to share info). Always call this after retrieving "
            "a list of >2 items so the team member has a written record."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "recipient_phone": {
                    "type": "string",
                    "description": "E.164 phone number (e.g. +919958860411).",
                },
                "content_type": {
                    "type": "string",
                    "enum": ["text"],
                    "description": "Phase 1 supports text only.",
                },
                "payload": {
                    "type": "object",
                    "properties": {"body": {"type": "string"}},
                    "required": ["body"],
                },
            },
            "required": ["recipient_phone", "content_type", "payload"],
        },
    },
    {
        "name": "search_inventory",
        "description": (
            "Search available properties in the inventory database matching the "
            "caller's (or their client's) requirement. Use when a team member asks "
            "'Vaishali mein 2BHK hai?' or 'show me Dwarka rentals'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "Area, city, or locality (e.g. 'Vaishali', 'Dwarka Sector 12').",
                },
                "intent": {
                    "type": "string",
                    "enum": ["buy", "rent", "sell"],
                },
                "bhk": {"type": "integer"},
                "budget_min": {"type": "number"},
                "budget_max": {"type": "number"},
                "property_type": {
                    "type": "string",
                    "description": "flat / house / plot / shop / office",
                },
                "furnishing": {
                    "type": "string",
                    "description": "furnished / semi_furnished / unfurnished",
                },
            },
            "required": ["location", "intent"],
        },
    },
    {
        "name": "schedule_site_visit",
        "description": (
            "Book a site visit appointment for a lead to view a property. Use after "
            "the caller says 'appointment lagao kal 3 baje' and you know the lead_id. "
            "Call search_lead first if the lead_id is unknown."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string"},
                "datetime": {"type": "string", "description": "ISO8601 datetime."},
                "property_id": {
                    "type": "string",
                    "description": "Optional inventory ID for the specific property being visited.",
                },
                "location": {
                    "type": "string",
                    "description": "Optional — address or meeting-point for the visit.",
                },
            },
            "required": ["lead_id", "datetime"],
        },
    },
    {
        "name": "update_lead_status",
        "description": (
            "Move a lead through the pipeline by updating its lifecycle_stage. "
            "Use when caller says 'is lead ka stage negotiation kar do' or after a "
            "milestone (site visit done, offer made, deal closed)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string"},
                "stage": {
                    "type": "string",
                    "description": "e.g. new, contacted, site_visit_scheduled, site_visit_done, negotiation, closed_won, closed_lost",
                },
                "note": {"type": "string"},
            },
            "required": ["lead_id", "stage"],
        },
    },
    {
        "name": "get_lead_history",
        "description": (
            "Pull the recent interaction timeline (WhatsApp messages, notes, calls, "
            "stage changes) for a lead. Use when caller asks 'is lead ka pura history "
            "batao' or 'last kya hua tha?'."
        ),
        "parameters": {
            "type": "object",
            "properties": {"lead_id": {"type": "string"}},
            "required": ["lead_id"],
        },
    },
    {
        "name": "mark_task_done",
        "description": (
            "Close a pending callback or follow-up task. Use after the caller says "
            "'ye kaam ho gaya' or 'task complete kar do'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "outcome_note": {"type": "string"},
            },
            "required": ["task_id"],
        },
    },
    # Phase 3 — Manager / Super Boss tools
    {
        "name": "get_unassigned_leads",
        "description": (
            "List leads with no assigned agent. Manager-only. Use when caller "
            "asks 'unassigned leads kitne hain?' or 'koi pending leads?'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "Optional location filter."},
                "limit": {"type": "integer", "description": "Default 20, max 50."},
            },
        },
    },
    {
        "name": "reassign_lead",
        "description": (
            "Transfer a lead from one agent to another. Manager can only reassign "
            "to agents in their own team. Super boss can reassign to anyone in "
            "the tenant. Use after 'ye lead [name] ko de do'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string"},
                "new_agent_id": {"type": "string"},
            },
            "required": ["lead_id", "new_agent_id"],
        },
    },
    {
        "name": "get_team_performance",
        "description": (
            "Per-agent activity counts for the caller's team. Manager: own team; "
            "Super Boss: whole company. Use when caller asks 'aaj kisne kitne "
            "calls kiye?' or 'meri team ki performance batao'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "enum": ["today", "week", "month"]},
            },
        },
    },
    {
        "name": "get_pipeline_overview",
        "description": (
            "Deal pipeline breakdown — lead count and estimated total value per "
            "lifecycle stage. Manager: own team; Super Boss: tenant-wide. Use when "
            "caller asks 'pipeline dikhao' or 'kitne deals negotiation mein hain?'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "enum": ["week", "month", "all"]},
            },
        },
    },
    # Phase 4 — Super Boss / advanced tools
    {
        "name": "get_company_metrics",
        "description": (
            "Company-wide metrics: new leads count, deals closed count + value, "
            "active agents count. Super Boss only. Use when caller asks 'company "
            "ka revenue kitna hua?' or 'is hafte naye leads kitne aaye?'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "enum": ["today", "week", "month"]},
            },
        },
    },
    {
        "name": "get_stuck_deals",
        "description": (
            "Find deals that haven't moved in N days (default 10). Manager sees "
            "own team's stuck deals; Super Boss sees company-wide. Use when caller "
            "asks 'koi stuck deal?' or 'kaun se deals atke hain?'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Min days without update. Default 10, max 60."},
            },
        },
    },
    # Catalog tools — send property cards to caller's WhatsApp during a voice call
    {
        "name": "search_and_show_properties",
        "description": (
            "Search inventory and send matching property cards to the caller's WhatsApp number. "
            "Use when caller asks to see properties, listings, or inventory. "
            "Always say 'Main aapke WhatsApp pe properties bhej raha/rahi hoon' before calling. "
            "The caller can browse and tap to book directly from those cards."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "city":          {"type": "string", "description": "City name e.g. Delhi, Noida"},
                "intent":        {"type": "string", "enum": ["BUY", "RENT"]},
                "property_type": {"type": "string", "description": "Flat, Villa, Plot, Office etc."},
                "category":      {"type": "string", "enum": ["residential", "commercial"]},
                "bhk":           {"type": "integer", "description": "Number of bedrooms"},
                "budget_min":    {"type": "number", "description": "Min price in INR"},
                "budget_max":    {"type": "number", "description": "Max price in INR"},
                "limit":         {"type": "integer", "description": "Max results, default 10, max 30"},
            },
            "required": [],
        },
    },
    {
        "name": "send_booking_flow",
        "description": (
            "Send a WhatsApp site visit booking form for a specific property to the caller. "
            "Use after showing properties when caller expresses interest in visiting one. "
            "Say 'Main booking form bhej raha/rahi hoon' before calling. "
            "Requires property_id from search results."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "property_id": {"type": "string", "description": "Inventory ID from search results"},
            },
            "required": ["property_id"],
        },
    },
]


# Customer-safe subset exposed to non-team-member (buyer) calls — derived from TEAM_MEMBER_TOOLS so
# the schemas/descriptions stay in one place. These send to the caller's OWN WhatsApp.
CUSTOMER_TOOL_NAMES = {"search_and_show_properties", "send_booking_flow"}
CUSTOMER_TOOLS = [t for t in TEAM_MEMBER_TOOLS if t["name"] in CUSTOMER_TOOL_NAMES]


# Map tool name → (HTTP method, path) for dispatching.
_TOOL_PATHS: dict[str, tuple[str, str]] = {
    # Phase 1
    "get_my_leads": ("GET", "/my-leads"),
    "get_my_appointments": ("GET", "/my-appointments"),
    "get_my_tasks": ("GET", "/my-tasks"),
    "search_lead": ("GET", "/search-lead"),
    "schedule_callback": ("POST", "/schedule-callback"),
    "log_call_note": ("POST", "/log-call-note"),
    "send_on_whatsapp": ("POST", "/send-whatsapp"),
    # Phase 2
    "search_inventory": ("GET", "/search-inventory"),
    "schedule_site_visit": ("POST", "/schedule-site-visit"),
    "update_lead_status": ("POST", "/update-lead-status"),
    "get_lead_history": ("GET", "/lead-history"),
    "mark_task_done": ("POST", "/mark-task-done"),
    # Phase 3
    "get_unassigned_leads": ("GET", "/unassigned-leads"),
    "reassign_lead": ("POST", "/reassign-lead"),
    "get_team_performance": ("GET", "/team-performance"),
    "get_pipeline_overview": ("GET", "/pipeline-overview"),
    # Phase 4
    "get_company_metrics": ("GET", "/company-metrics"),
    "get_stuck_deals": ("GET", "/stuck-deals"),
    # Catalog tools
    "search_and_show_properties": ("POST", "/search-and-show-properties"),
    "send_booking_flow":          ("POST", "/send-booking-flow"),
}


async def call_tool(tool_name: str, caller_phone: str, args: dict[str, Any]) -> dict[str, Any]:
    """Dispatch a Gemini Live tool call to the Node backend. Returns JSON dict.

    Read-only tools are cached for 60s per (caller_phone, tool_name, args) key.
    Write/action tools (schedule_*, log_*, update_*, mark_*, send_*, reassign_*)
    always bypass the cache.
    Never raises — Gemini Live expects a structured response.
    """
    if tool_name not in _TOOL_PATHS:
        return {"ok": False, "error": f"unknown tool {tool_name}"}

    # Check cache for read-only tools
    cache_key = f"{caller_phone}:{tool_name}:{json.dumps(args, sort_keys=True)}"
    if tool_name in _CACHEABLE_TOOLS:
        entry = _TOOL_CACHE.get(cache_key)
        if entry and (time.time() - entry["ts"]) < _CACHE_TTL_SECONDS:
            age = int(time.time() - entry["ts"])
            logger.debug(f"[Cache] HIT {tool_name} ({age}s old)")
            return entry["result"]

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
        try:
            from instrument import sentry_sdk  # type: ignore
            if sentry_sdk is not None:
                sentry_sdk.capture_exception(e)
        except Exception:
            pass
        return {"ok": False, "error": str(e)}

    # Store successful read-only results in cache
    if tool_name in _CACHEABLE_TOOLS and result.get("ok"):
        _TOOL_CACHE[cache_key] = {"result": result, "ts": time.time()}
        logger.debug(f"[Cache] STORE {tool_name}")

    return result
