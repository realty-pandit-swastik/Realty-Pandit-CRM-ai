---
name: reference_99acres_lead_routing
description: 99acres pull-API leads route to the LISTER (the team member whose listing got the enquiry) via SubUserName → Agent.personal_email (employees AND managers, since 2026-06-07), NOT round-robin — onboard a new lister by setting their personal_email; Housing API has no such field
metadata:
  type: reference
---

**99acres leads are NOT round-robined** — they auto-route to the **team member whose listing received the
enquiry**. The active path is the **pull-API poller** [`services/ninety_nine_acres_poller.ts`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/ninety_nine_acres_poller.ts) (BullMQ, ~12-min):

- Each lead's XML carries **`SubUserName`** = the **Gmail of the lister** (the 99acres sub-user whose listing
  got the enquiry), captured into the interaction metadata as `sub_user_name`.
- [`resolveAgentByEmail`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/lead_assignment.ts#L56) matches `SubUserName` against **`Agent.personal_email`** (case-insensitive, `status:'active'`,
  `role IN ('employee','manager')`) → assigns the contact + fires the 20-min escalation + new-lead notify.
- **No match / no SubUserName → first active manager** (NOT round-robin). super_boss is the final fallback.

**To onboard a new 99acres lister** (so their leads reach them instead of falling to super_boss): set that
team member's **`personal_email` = their 99acres sub-user Gmail** (Team → profile → Personal Email, or
`UPDATE agents SET personal_email=…`). That single field is the whole mapping — there is no separate table.

**2026-06-07 changes (this is when the above became fully true):**
- `resolveAgentByEmail` role filter widened `employee` → **`{ in: ['employee','manager'] }`** so a **manager
  who also lists/handles buy-sell (e.g. Ashwani)** receives their own leads. Was employee-only, which silently
  dropped a manager-lister's leads to super_boss.
- Set **Ashwani** (`ashwani@realtypandit.in`, role=manager) `personal_email = ashwanikashyap8595@gmail.com`.
  Verified live: 10/10 distinct recent SubUserNames now match an active agent (was 9/10). **Forward-only — no
  past leads were reassigned** (poller assigns only on `isNew`).

**Gotchas / facts:**
- The match field is **`personal_email`**, NOT `email` (the @realtypandit.in work address). The old code
  comment wrongly said "maps to Agent.email" — the code has always used `personal_email`.
- There is a SECOND, **dormant** 99acres path: the webhook [`integrations/99acres.ts`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/integrations/99acres.ts) (mounted `/external/99acres/webhook`)
  still uses `assignViaRoundRobin()` and ignores SubUserName — but it received **0 leads in 60 days** (99acres
  delivers only via the pull API). Latent footgun if anyone ever points 99acres at it; left untouched 2026-06-07.
- **Housing.com:** its broker-leads API returns only buyer + property (no sub-broker/team-member field), so
  housing leads can't be routed this way — they fall to `assignViaManagerRoundRobin()`. Housing is currently
  unconfigured (0 leads). See [[feedback_poller_silent_loss]], [[feedback_lead_assignment_dedup]].
