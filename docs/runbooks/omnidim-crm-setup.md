# Omnidim CRM onboarding and pilot gates

Status: **disabled**, pending account and contract verification. The CRM does not yet have an authenticated provider adapter. `POST /webhooks/omnidim` returns 503 without writing anything. An API key does not enable the outbound logging stub. Existing human/WhatsApp qualification fallback remains available. Manual recording uploads continue through staff review.

## Account preparation

Create the provider account, confirm billing and permitted calling regions, then obtain a test phone number, voice agent/bot identifier, outbound dispatch API documentation, inbound number routing documentation, API credentials, webhook/event documentation and recording access/deletion policy. Keep credentials in the approved backend secret store; do not paste them into Git, screenshots or this document. Existing `OMNIDIM_API_KEY` is an account credential name, **not** proof that the adapter or callback authentication works. There is no operational enable flag for the incomplete adapter; add disabled-by-default tenant/provider pilot controls only with the verified adapter.

Ask provider support for the exact event schema and authentication contract: signing header and algorithm, raw-body requirements, key rotation, timestamp/replay validation, stable event/call identifiers, retry timing, acknowledgement requirements and event ordering. A guessed `x-omnidim-signature` or guessed HMAC must never enable ingestion.

Collect sanitized representative payloads for inbound call start, outbound acceptance, live state/transcript (if available), recording ready, completion, failure and transfer request/result. Replace phone numbers, transcripts and secrets with synthetic equivalents while preserving field names, nesting, identifier relationships and timestamp formats. Provide configuration **names**, test bot/number roles and documentation URLs, not credential values.

## What the public documentation establishes

[Live call monitoring](https://docs.omnidim.io/docs/dashboard-guides/live-call-monitoring) describes transcript monitoring in the provider dashboard. This does not establish a CRM live transcript feed or push notification callback.

[Custom API transfer](https://docs.omnidim.io/docs/integrations/custom-api-transfer) documents a tool API response with `__omni_transfer_number` and optional `__omni_transfer_message`. This can supply a destination during an agent's transfer tool call. It does not establish a remote CRM initiated transfer endpoint or a confirmed transfer outcome callback. Obtain those contracts and prove the assigned employee's authorized phone is reached before exposing a successful handoff in CRM.

## Adapter implementation contract

Dispatch originates in the backend, after tenant/team ownership, contact restrictions and harvested-owner verification checks. Persist a unique dispatch request before calling the provider; correlate the accepted provider call ID to tenant, staff, contact and work item. Never advance a deal because a dispatch API accepted a request. Treat timeouts with unknown outcomes as reconciliation work, not permission to dispatch again.

Authenticate the exact raw callback, reject replay/invalid credentials, deduplicate stable event IDs and correlate through the persisted call map. Reject unmatched events; there is no first-tenant fallback. A recording/transcript creates one StaffCall draft through the shared processing path. Requirements, matching, deal creation and sends remain behind human approval. Inbound call-start notifications go only to authorized assigned staff. Recording URLs must use verified provider hosts/access methods and SSRF protections, never arbitrary callback URLs.

A phone transfer persists request and provider confirmation separately. Resolve the assigned employee phone on the backend; never accept a client-selected arbitrary destination. Confirm provider acceptance and actual transfer outcome. Stop AI follow-ups only after confirmed handoff. A failure or unknown outcome creates one visible callback task; no successful-handoff marker is written.

Retain reviewed audio seven days and unreviewed audio thirty days by default (`CALL_AUDIO_RETENTION_REVIEWED_DAYS`, `CALL_AUDIO_RETENTION_UNREVIEWED_DAYS`). Verify provider deletion support separately; keep verified notes and audit history when audio is removed.

## Reproducible pilot checks

Use synthetic contacts in a non-production tenant and disabled-by-default pilot controls. Prove each item before expanding:

1. Invalid signature, altered body, stale timestamp, replay and unmatched call cannot write CRM data. Duplicate and out-of-order events produce one draft.
2. One inbound and one outbound test call produce reviewable notes with playable authorized recordings. Cross-tenant and cross-team dossier/notification access fails.
3. Approval preserves BHK, canonical type/specifications and rupee budgets; rejection leaves authoritative requirements unchanged. Two simultaneous approvals have one business result.
4. Stop/restart processing between transcription, extraction, approval and follow-up. Durable claims recover; no duplicate history, score increments, listing tasks or dispatches appear.
5. Compare dashboard transcript access to any supported CRM feed; if no feed exists, describe the limitation explicitly in the UI.
6. CRM transfer to the assigned test staff phone rings and receives the call. Provider-confirmed failure creates one callback task. Unsupported transfer capabilities remain hidden.
7. Audio retention and supported provider cleanup remove audio without deleting verified notes/history. Confirm task failure visibility and bounded manual retry.

## Production-safe rollout

Do not enable calling or apply migrations from this guide. First reconcile live application revision, production migration history and documented drift. Review each additive migration SQL, take and verify backups and restore procedures, establish a rollback-compatible artifact and obtain the explicit production rollout authorization. Do not use blanket migration deployment against the drifted database.

After non-production gates pass, configure credentials through the approved secret mechanism, restrict one pilot tenant and a small permitted contact/staff set, deploy the guarded artifact, then verify API auth, queue/recovery, recording authorization, review tasks and phone transfer with explicit test-call consent. Record provider call IDs and synthetic evidence without secrets. Expand only after callbacks, matching, cleanup and failure tasks have been observed. Production/runtime verification has not been performed by this implementation.
