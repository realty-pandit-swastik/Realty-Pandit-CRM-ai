# WhatsApp Voice Bot Architecture

> Migrated from auto-memory 2026-05-11. Original capture: 2026-04-19 after the system shipped to production.
>
> **Verify before asserting:** file paths and Pipecat/aiortc behaviors below were correct as of 2026-04-19. If you're about to act on a specific line citation, confirm against current code first.

## Production identity

- **Phone:** +91 81784 91914 (Realty Pandit)
- **App ID:** 1868797817103904
- **Server:** 72.62.231.224 (VPS, public IPv4/IPv6, no NAT)

## Path chosen: Webhook over SIP

Meta supports two mutually-exclusive signaling paths per phone number — **SIP** (TLS:5061) and **Webhook** (HTTPS POST to `/webhooks/whatsapp`). We chose Webhook.

**Why:** The SIP path completed SIP 200 OK + ICE successfully but DTLS handshake never completed. Zero DTLS packets from Meta in either direction even after trying every aiortc role/SDP combination. SIP+DTLS with aiortc 1.14.0 + Pipecat WhatsApp offers was a dead end.

To disable SIP and force the webhook path:
```bash
curl -X POST "https://graph.facebook.com/v21.0/${PHONE_ID}/settings" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"calling":{"status":"ENABLED","sip":{"status":"DISABLED"}}}'
```

## End-to-end flow

```
WhatsApp caller
    ↓
Meta Cloud API
    ↓  HTTPS POST {action:"connect", session:{sdp_type:offer, sdp:...}}
    ↓  Header: X-Hub-Signature-256 (HMAC of raw body with App Secret)
    ↓
nginx (/webhooks/whatsapp → Node :7071)
    ↓  Node captures rawBody via express.json verify callback
    ↓  extractCallEvent() → if connect/terminate → forwardCallWebhookToPipecat(rawBody, sig)
    ↓
Node → Pipecat (POST 127.0.0.1:8765/wa/webhook)
    ↓  Preserves raw body + X-Hub-Signature-256 so Pipecat HMAC still validates
    ↓
Pipecat FastAPI + WhatsAppClient
    ↓  Signature verify → _handle_connect_event()
    ↓  Builds SDP answer, applies SHA-256-only fingerprint filter
    ↓  POST /{phone_id}/calls {action:"pre_accept"} + {action:"accept"}
    ↓
SmallWebRTCConnection (aiortc) ↔ Meta media server (port 3480)
    ↓  DTLS-SRTP, Opus 48kHz stereo
    ↓
Pipeline: SmallWebRTCTransport → GeminiLiveLLMService → SmallWebRTCTransport
    ↓
Gemini Live WebSocket
```

## The 8 non-obvious fixes (cost us 16 hours combined)

### 1. WABA must be subscribed to the app (silently un-subscribes)

**Symptom:** App subscribed to webhook URL + `calls` field, but no events arriving for days.

**Cause:** Each WABA must be independently subscribed to the app via `POST /{WABA_ID}/subscribed_apps`. This can un-subscribe itself (token refresh, account change) without warning.

**Check + fix:**
```bash
curl -s "https://graph.facebook.com/v21.0/${WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer ${TOKEN}"
# if data: [] → re-subscribe:
curl -s -X POST "https://graph.facebook.com/v21.0/${WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer ${TOKEN}"
```

### 2. Pipecat 0.0.68 has no WhatsApp transport

Upgrade to 1.0.0. Module paths changed:
- `pipecat.services.gemini_multimodal_live.gemini.GeminiMultimodalLiveLLMService` → `pipecat.services.google.gemini_live.llm.GeminiLiveLLMService`
- `pipecat.transports.network.small_webrtc` → `pipecat.transports.smallwebrtc.{connection,transport}`
- Install: `pip install "pipecat-ai[google,webrtc]==1.0.0"`

### 3. WhatsApp only accepts SHA-256 fingerprints in SDP answer

aiortc emits `a=fingerprint` lines for sha-256, sha-384, and sha-512. WhatsApp silently refuses DTLS if the extras are present. Pipecat's WhatsAppClient filters these automatically (`_filter_sdp_for_whatsapp`), but if you roll your own SIP path you must filter manually. **Undocumented by Meta.**

### 4. Pipecat 1.0.0 `_create_single_response` bug — greeting seed breaks user-audio processing

**Symptom:** Panditji greets the user, then goes deaf — user audio silently dropped, no "Bot started speaking" on subsequent turns.

**Cause:** `LLMMessagesAppendFrame` routes to `_create_single_response` in `pipecat.services.google.gemini_live.llm` (line ~1316). The other initial-response path (`_create_initial_response`) sets `self._ready_for_realtime_input = True` at the end. `_create_single_response` does NOT. All subsequent `_send_user_audio` calls check the flag, return early, drop audio.

**Fix:** Manually flip the flag after queuing the seed frame:
```python
await task.queue_frames([LLMMessagesAppendFrame(messages=[{"role":"user","content":"[call_started]"}])])
await asyncio.sleep(0.2)
llm._ready_for_realtime_input = True
```

### 5. Greeting must fire AFTER Gemini's WebSocket is connected

If you queue `LLMMessagesAppendFrame` before Gemini connects (~300ms after WebRTC ready), it's dropped. Hook `transport.event_handler("on_client_connected")`, sleep ~500ms, then queue.

### 6. Node backend lives at `/var/www/realty-pandit/backend/`, NOT `/agents/backend/`

Deploys to the wrong path silently succeed (file copy works) but PM2 runs old code.

```bash
pm2 describe realty-backend   # exec cwd is authoritative
```

### 7. nginx backups in `sites-enabled` get loaded

If you `cp nginx/sites-enabled/foo nginx/sites-enabled/foo.backup-TIMESTAMP`, nginx loads BOTH files with same `server_name` and picks the first alphabetically (the backup). Always move backups OUT of `sites-enabled`.

### 8. Meta's SIP-path Graph API calls all fail with 131055 "Method not allowed"

Expected when SIP is enabled. Meta docs: *"When SIP is enabled, calling related Graph API endpoints and calling related webhooks are not sent."* If you see 131055 while SIP is enabled, you don't have a bug — delete the Graph API call code. Only the webhook path uses `/calls` with `pre_accept`/`accept`.

## Required env vars (server `.env`)

| Var | Source |
|---|---|
| `WHATSAPP_PHONE_ID` | Meta WABA → phone number ID (not the number itself) |
| `WHATSAPP_SYSTEM_TOKEN` | Meta Business Settings → System Users → permanent token with `whatsapp_business_messaging` + `whatsapp_business_management` |
| `WHATSAPP_APP_SECRET` | App Dashboard → Settings → Basic → App Secret (for HMAC verify) |
| `WHATSAPP_APP_ID` | App Dashboard → App ID |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Random string we pick; Meta echoes during webhook setup |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA ID (parent of the phone) |
| `GEMINI_API_KEY` | Google AI Studio |

## Model + voice choice

- **Voice:** `voice_id="Charon"` (deep male, Indian-priest-appropriate). Alternatives: Orus, Fenrir, Puck (male), Kore, Aoede, Leda, Zephyr (female).
- **Gemini model:** only 4 models support `bidiGenerateContent` (the Live API). Always re-query the model list before picking — don't guess names. Valid IDs as of 2026-04-19:
  - `models/gemini-2.5-flash-native-audio-latest` — slow (10–15s turnaround), premium voice
  - `models/gemini-2.5-flash-native-audio-preview-09-2025`
  - `models/gemini-2.5-flash-native-audio-preview-12-2025`
  - `models/gemini-3.1-flash-live-preview` ← **use this for low-latency conversational voice**

Re-query:
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
  | jq '.models[] | select(.supportedGenerationMethods[]? == "bidiGenerateContent") | .name'
```

## Known cleanup items

- Deprecation warnings: `voice_id`, `model`, `params` should move to `settings=GeminiLiveLLMService.Settings(...)`
- Diagnostic `[INPUT-DIAG]` patch in `pipecat/transports/smallwebrtc/transport.py` on the server — remove after debugging (`transport.py.orig` is the backup)
- SIP port 5061 still open in firewall — close it
- `sip_server.py` code can be deleted from the repo
