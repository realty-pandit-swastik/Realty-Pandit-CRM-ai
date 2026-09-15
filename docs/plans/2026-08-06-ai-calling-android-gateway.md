# Plan — AI calling gateway (Android handset + VPS bridge)

**Status:** Phase 0 proven on hardware 2026-08-06. This document specs the **root-independent**
server bridge — the largest block of work that can be built and tested *before* the bootloader
unlock completes.

**Scope of this doc:** transport, call orchestration, CRM integration, compliance gating.
**Explicitly NOT in this doc:** audio capture and uplink injection (root-gated, Phase 1–2), and the
AI conversation design (blocked on an unanswered product question — see Open items).

---

## 0. What is already proven

Verified over adb on the live handset (Redmi 9 `lancelot`, M2004J19C, Helio G80, Android 10, MIUI
V12.0.3.0), spare JIO SIM:

| Capability | Result |
|---|---|
| Place outbound call | `mCallState` 0 → 2 (OFFHOOK) |
| Detect inbound ring | `mCallState` = 1, per SIM slot |
| Read inbound caller ID | `+919958860411` — full E.164 |
| Answer programmatically | 1 → 2 |
| Hang up programmatically | 2 → 0 |

adb keyevents were the *proof mechanism only*. The shipped app uses `TelecomManager` /
`TelephonyManager` + a `PhoneStateListener`, not shell keyevents.

---

## 1. The constraint that dictates the architecture: CGNAT

The handset sits on Jio mobile data behind **carrier-grade NAT**. It has **no publicly reachable
IP**, and that will not change.

**Therefore: the phone always initiates and holds the connection outbound to the VPS.** Any design
where the server "calls the phone" is impossible — not merely awkward. This single fact rules out
REST-on-the-phone, and it is the reason for a persistent socket.

```
┌──────────────┐   outbound WSS (phone dials out, holds open)   ┌────────────────────┐
│  Android app │ ────────────────────────────────────────────►  │ VPS call-gateway   │
│  (foreground │ ◄──────────────────────────────────────────── │ :7075 (new PM2 proc)│
│   service)   │        commands: dial / answer / hangup        └─────────┬──────────┘
└──────────────┘                                                          │ internal HTTP
                                                                          ▼
                                                              ┌────────────────────┐
                                                              │ realty-backend     │
                                                              │ :7071 (existing)   │
                                                              └────────────────────┘
```

**Backup wake path:** if the socket dies *and* the OS killed the app, the server cannot reach it at
all. Mitigate with an **FCM data push** as a wake signal — its only job is "reconnect now". Never
carry call commands over FCM; delivery is not guaranteed or ordered.

⚠️ **Run this as a NEW PM2 process on its own port.** Do not extend the existing pipecat/WhatsApp
voice service — that bot is explicitly off limits and working
(`project_voice_bot_training_deferred`). Separate process, separate port, separate failure domain.

---

## 2. Components

### 2.1 Android app — "RP Call Agent"

- **Foreground service** with persistent notification. Non-negotiable: MIUI kills background work
  aggressively, and this must survive Doze and battery optimisation. Request
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; flashing LineageOS later removes most of this pain.
- **WebSocket client** — reconnect with exponential backoff + jitter, heartbeat every 20 s.
- **Telephony control** — place / answer / hang up; `PhoneStateListener` (or
  `TelephonyCallback` on newer API) per subscription.
- **Watchdog** — `AlarmManager` periodic check that the service is alive and the socket connected.
- Permissions: `CALL_PHONE`, `ANSWER_PHONE_CALLS`, `READ_PHONE_STATE`, `READ_CALL_LOG`,
  `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `POST_NOTIFICATIONS`.
- (Phase 1+) audio capture and injection modules — stubbed behind an interface now so the transport
  work does not have to be rewritten later.

### 2.2 VPS service — `call-gateway`

- New PM2 process, port **7075**, nginx `wss://` upstream.
- WebSocket server (device auth via a long-lived device token, one per handset).
- Internal REST API consumed by `realty-backend`: `POST /calls` (request a call),
  `GET /calls/:id`, `POST /calls/:id/hangup`, `GET /lines`.
- Session + line state in **Redis** (the backend already uses it; see `reference_prod_infrastructure`
  for the password-read pattern).

### 2.3 CRM integration — `agents/backend/src/services/call_gateway.ts`

Reuses what already exists rather than reimplementing:
`normalizePhone`, `ensureDealForLead`, `assignContact`, Interaction logging,
`buildDemandFromInventory`.

---

## 3. Wire protocol (JSON over WebSocket)

**Phone → server:** `hello` (device id, app version, SIM slots + roles, Android build) ·
`heartbeat` · `call_state` (subId, state, number, direction, callId) · `command_ack` (commandId) ·
`error`

**Server → phone:** `dial` (commandId, callId, subId, number) · `answer` · `hangup` · `config` ·
`ping`

### Idempotency rules — these are not optional

1. Every server→phone command carries a **`commandId`**. The phone **acks** it. The server retries
   unacked commands; the phone **dedupes by commandId** and never executes one twice.
   Without this, a socket blip during `dial` re-dials a customer.
2. **The server never infers call state — it only believes reported state.** The phone is the sole
   source of truth for `mCallState`.

---

## 4. Line management

Two SIMs with **distinct roles**, per the agreed design:

| Line | Role |
|---|---|
| A | Outbound qualification calls |
| B | Inbound — the company number people already call |

- `mCallState` is reported **per SIM slot**. The app must report **per-subscription** state; a
  single global "busy" flag is wrong and will collide the two roles.
- **A line is only free when the phone has reported `IDLE` for that subscription.** Never dial on
  optimism.

⚠️ **Hangup lag is real and was measured.** `KEYCODE_ENDCALL` returned while the call was still
`OFFHOOK`; `IDLE` arrived seconds later. The server must **poll to confirm teardown** before
releasing the line — otherwise it will dial over a live call.

---

## 5. Outbound flow

1. **Trigger** — new ad lead, callback task, or scheduled qualification.
2. **Pre-dial compliance gate — BLOCKING, fail closed:**
   - `contact.opted_out_at` set → **ABORT**
   - any of the contact's deals `ai_paused` → **ABORT**
   - **DND / NCPR scrub** → abort if registered without recorded consent
   - **Time window** — no calls outside 09:00–21:00 IST
   - Per-lead retry cap per day
3. Server selects a **confirmed-idle** outbound line → sends `dial`.
4. Phone dials, streams `call_state` transitions.
5. `OFFHOOK` → audio session begins *(Phase 2)*.
6. `IDLE` → write Interaction, update deal, schedule follow-up.

> **Why the gate is blocking and fails closed:** opt-outs were the root cause of the 9-day WABA lock
> (`reference_whatsapp_delivery_and_account_lock`) — 21 people asked us to stop and all 21 kept
> receiving messages. Repeating that on a **voice** channel means TRAI/DLT exposure and a
> disconnected SIM, not just a locked app. The SIM is the asset the whole architecture exists to
> protect.

---

## 6. Inbound flow

1. Phone reports `ringing` + caller ID in **E.164**.
2. Server **normalises** the number, then looks up `contacts.phone_number`.
   - ⚠️ **Normalise before lookup.** Inbound arrives as `+919958860411`; a raw compare against a
     user-entered `9958860411` misses and **silently creates a duplicate contact** instead of
     matching the existing lead. `contacts.phone_number` is the PK with 23 cascading FKs
     (`reference_contact_rekey_cascade`) — duplicates are expensive to unpick.
   - **Existing contact** → keep their assigned agent (never reassign —
     `feedback_lead_assignment_dedup`).
   - **New contact** → create + `ensureDealForLead`; if attributable to an ad, route by the
     inventory-manager rule (`reference_ad_lead_capture_chain`).
3. Server decides answer vs ignore → sends `answer`.
4. Audio session *(Phase 2)*.
5. `IDLE` → Interaction + follow-up task.

---

## 7. Data model

Prefer **reusing `Interaction`** (`channel: 'voice_gateway'`) for the timeline, so calls appear
alongside WhatsApp and portal events with no new reader code.

Add one table for per-call state:

```
CallSession
  id, direction, sub_id/line, phone_number (E.164), contact_phone (FK),
  deal_id, command_id, started_at, answered_at, ended_at, duration_sec,
  outcome, recording_url, transcript, error
```

*To verify before building:* the 2026-07-13 Panditji audit shipped a voice duration/transcript
pipeline — check whether it can be reused rather than duplicated
(`project_panditji_behavior_audit_2026-07-13`).

---

## 8. Failure modes — each needs an explicit answer

| Failure | Handling |
|---|---|
| Socket dead / phone offline | Queue commands, FCM wake, alert after N minutes |
| App killed by OS | Foreground service + watchdog alarm + FCM wake |
| Dial never connects | Timeout → mark outcome, release line |
| **Hangup lag** | Poll until `IDLE`; never release the line early |
| Duplicate `dial` | `commandId` dedupe on the phone |
| SIM removed / no service | `hello` reports SIM state; server marks line unavailable |
| Both lines busy | Queue with priority; never pre-empt a live call |

### ⚠️ Omnidim's live behaviour must be replaced, not just deleted

`triggerOmnidimCall()` is a stub that never fires HTTP — **but the surrounding fallback is live**:
14 `omnidim_call_attempt` events on real ad leads, logging *"sent intro template + alerted manager."*
Deleting it with nothing behind it means new leads **silently stop getting that touch**. Either this
gateway takes over that job on call failure, or the gap is accepted as an explicit decision.

---

## 9. Build order (all root-independent)

1. `call-gateway` service skeleton + WS server + device auth
2. Android app: foreground service + WS client + reconnect/heartbeat
3. Telephony control + per-subscription state reporting
4. Line manager with idle-confirmation and the hangup-lag guard
5. CRM `call_gateway.ts`: inbound matching (normalise → lookup → route)
6. **Compliance gate** — before any automated dialling is switched on
7. Outbound orchestration + Interaction logging
8. Failure handling + Omnidim replacement decision

Phases 1 (capture) and 2 (injection) slot in at step 5–7 once root lands, behind the interfaces
stubbed in step 2.

---

## Open items

- **Bootloader unlock** — Mi Unlock has a ~7-day wait, one device at a time. Gates Phases 1–2 only.
  Confirm it has been submitted.
- **Product question, unanswered:** the voice AI must do *more than the WhatsApp bot* — what,
  specifically? Blocks the AI conversation design (not this bridge).
- **Injection target order:** the SIM is VoLTE-registered (`mVopsSupport=1`), so attack
  `com.mediatek.ims` **before** `audio.primary.mt6768.so` — the media is already packetised there.
  Both are MediaTek blobs; see the on-device verdict in `project_ai_calling_android_gateway`.
