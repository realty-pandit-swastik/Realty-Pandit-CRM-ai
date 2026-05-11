# Pending Work

> Active items, organized by who/what is blocking. For dated phase plans see [`../plans/`](../plans/). For live status see [`../PROJECT_STATUS.md`](../PROJECT_STATUS.md).

## Blocked on Sunny (product decision)

| Item | Detail |
|---|---|
| 790 contacts have no Deal | Should we retroactively backfill Deals from existing Contacts? Or leave only forward-going Contacts to create Deals? |
| Phase 9 — property cards | Design/scope decision needed |
| Phase 10 — digest | Design/scope decision needed |

## Blocked on Meta

| Item | Detail |
|---|---|
| 3 WhatsApp templates pending approval | Out of 78 total. Recheck periodically. See [`../runbooks/meta-template-approval.md`](../runbooks/meta-template-approval.md) |
| Category lock expires ~2026-05-17 | 3 templates can then be reclassified MARKETING → UTILITY (saves ~₹0.44/message). Action: reclassify in Meta Business Manager after that date. |

## Known technical debt

| Item | Where | Priority |
|---|---|---|
| BullMQ `scheduled_jobs` queue had ~1000 failed jobs (2026-05-02) | Server BullMQ dashboard | Investigate when feasible |
| Pipecat deprecation warnings — `voice_id`, `model`, `params` should move to `settings=GeminiLiveLLMService.Settings(...)` | Pipecat config | Low |
| Diagnostic `[INPUT-DIAG]` patch in `pipecat/transports/smallwebrtc/transport.py` on server | Server only | Remove after debugging; `.orig` backup exists |
| SIP port 5061 still open in firewall | Server | Close — webhook path is what we use |
| `sip_server.py` code can be deleted from repo | Codebase | Cleanup |
| Partner portal login route not built yet | `agents/backend` | `sendPartnerOTP()` is ready in `agent_auth.ts`; route TBD |

## Deferred from completed phases

| From | Item |
|---|---|
| Stage 1 NEW UX redesign (2026-04-30) | Phase 6 — mobile full-screen page deferred |
