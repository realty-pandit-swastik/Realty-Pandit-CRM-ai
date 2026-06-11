import os
import time
import httpx

DAILY_API_KEY = os.getenv("DAILY_API_KEY")
DAILY_API_BASE = "https://api.daily.co/v1"
DAILY_DOMAIN = "realtypandit"


async def create_call_room(call_id: str) -> dict:
    """Create an ephemeral Daily.co room for one WhatsApp voice call session."""
    headers = {
        "Authorization": f"Bearer {DAILY_API_KEY}",
        "Content-Type": "application/json",
    }
    room_name = f"panditji-{call_id[:16]}"
    expires_at = int(time.time()) + 3600

    async with httpx.AsyncClient(timeout=10.0) as client:
        room_resp = await client.post(
            f"{DAILY_API_BASE}/rooms",
            headers=headers,
            json={
                "name": room_name,
                "properties": {
                    "exp": expires_at,
                    "max_participants": 2,
                    "enable_chat": False,
                    "enable_screenshare": False,
                    "start_video_off": True,
                    "start_audio_off": False,
                },
            },
        )
        room_resp.raise_for_status()
        room = room_resp.json()

        token_resp = await client.post(
            f"{DAILY_API_BASE}/meeting-tokens",
            headers=headers,
            json={
                "properties": {
                    "room_name": room_name,
                    "is_owner": True,
                    "exp": expires_at,
                }
            },
        )
        token_resp.raise_for_status()
        token = token_resp.json()

    # SIP dial-in URI — WhatsApp will route audio here
    # Format: sip:{room-name}@{domain}.sip.daily.co
    sip_uri = f"sip:{room_name}@{DAILY_DOMAIN}.sip.daily.co"

    return {
        "room_url": room["url"],
        "room_token": token["token"],
        "room_name": room_name,
        "sip_uri": sip_uri,
    }


async def delete_room(room_name: str) -> None:
    """Clean up room after call ends."""
    headers = {"Authorization": f"Bearer {DAILY_API_KEY}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.delete(f"{DAILY_API_BASE}/rooms/{room_name}", headers=headers)
