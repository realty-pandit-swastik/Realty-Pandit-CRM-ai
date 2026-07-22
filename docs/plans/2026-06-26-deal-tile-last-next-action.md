# Plan — Last human action + Next action on Deal Pipeline tiles

**Date:** 2026-06-26
**Status:** ✅ DONE 2026-06-26 — shipped Feature A (last human action) + Feature B **Option A** (stage-derived next action), per owner's choice. Backend `listDeals` `team_actions` take-1 include; frontend single combined line (both card blocks). 6/6 builds clean; backend restarted (r=253), frontend rebuilt (`index-BxE0zr1i.js`), bundle verified, all endpoints 200. Backups `/root/backups/deal-tile-lastnext-20260626/`. Option B (real human-entered next-action + due) NOT built — available as a fast-follow.
**Trigger:** Owner wants each deal tile to show the team member's **last action** (call/share/etc., distinct from the AI's activity) and the **next action** the human should take. Follows the 2026-06-25 investigation and the shipped deal-age chip (`2026-06-26-deal-tile-age.md`).

## 1. What exists (from investigation)

- **`team_actions` table** (model `TeamAction`): every human action is logged here by the `POST /api/deals/:id/log-action` endpoint (the tile's "Log My Call" etc.) — `action_type`, `outcome`, `notes`, `agent_id`, `stage`, `created_at`. Indexed on `transaction_id` + `created_at`.
  - **Prod action types:** `CALL_LOGGED` (106), `TRANSFER` (62), `REMINDER_SET` (19), `SCHEDULED_VISIT` (19), `REMINDER_GIVEN` (8), `PAUSED_AI` (5), `CONFIRMED_VISIT` (1), `RESUMED_AI` (1).
  - **Density caveat:** only **139 / 1,473 open deals (~9%)** have any human action yet → ~90% of tiles will show an empty state. Correct behaviour, but worth knowing.
- **`transactions.last_team_action_at`** — already on the tile (timestamp only, no type).
- **`tasks_followups`** (the only "next task" table) is effectively **unused** — **1 pending row system-wide**. So there is **no real data to derive a stored "next task" from.**

## 2. Feature A — Last human action  *(data exists; ship)*

**Backend** (`services/deal_service.ts` → `listDeals` include):
```ts
team_actions: {
  take: 1,
  orderBy: { created_at: 'desc' },
  select: { action_type: true, outcome: true, created_at: true, agent: { select: { name: true } } },
}
```
(Efficient: take-1 per deal on indexed columns, 20 deals/page.)

**Frontend** (`DealPipeline.tsx`): a `lastActionLine(deal)` helper + render. Label/icon map for the real action types:
| action_type | display |
|---|---|
| CALL_LOGGED | 📞 Called |
| TRANSFER | 🔁 Reassigned |
| REMINDER_SET / REMINDER_GIVEN | ⏰ Reminder |
| SCHEDULED_VISIT / CONFIRMED_VISIT | 🗓️ Visit set |
| PAUSED_AI / RESUMED_AI | ⏯️ AI toggled |
| (fallback) | 📝 {action_type humanised} |

Render: **`👤 Bharat — 📞 Called (no answer) · 2h ago`** (agent first name + label + outcome if present + relative time). Empty state: **`👤 No team action yet`** (muted) so the absence is explicit, not blank.

**Effort:** ~half a day (backend include + frontend line, both card blocks for mobile parity).

## 3. Feature B — Next action  *(no stored data — pick an approach)*

### Option A — Stage-derived prompt  *(recommended to ship now; deterministic, no new data)*
Show the expected next step from the deal's stage (its KRA), made smarter using data already on the tile (appointment state):
| stage | next action |
|---|---|
| NEW | 📞 Call & qualify |
| QUALIFIED | 🏘️ Share property / schedule visit (→ "Schedule visit" if a property is already matched) |
| VISIT_SCHEDULED | appt `requested` → ✅ Confirm slot · appt booked → 🔔 Remind & confirm visit |
| VISITED | 📝 Submit visit outcome |
| NEGOTIATION | 🤝 Follow up to close |
| ON_HOLD | 🔄 Revive / review |

Render: **`➡️ Next: Share property`**. Frontend-only. **Pro:** instant, always present. **Con:** it's a *prompt*, not a real human-entered plan or a due time.

### Option B — Real human-entered next action + due  *(more powerful; a small new workflow)*
- **Schema:** add `next_action String?` + `next_action_at DateTime?` to `transactions` (or a `TaskFollowup` with a real `transaction_id`).
- **Capture:** extend the "Log My Call" / log-action flow with an optional **"Next step"** + **"due when"** input → persists `next_action`/`next_action_at`.
- **Tile:** **`➡️ Next: Call back · due in 2h`**, with **overdue** highlighted red. Doubles as a real follow-up SLA (could feed reminders later).
- **Effort:** ~1–1.5 days (migration + endpoint field + small UI in the log-action modal + tile render). **Pro:** genuine "next action by the human" with accountability. **Con:** relies on team members filling it in (adoption), and is a behaviour change.

**Recommendation:** ship **A + Option A** together now (instant value, no data dependency); treat **Option B** as a fast-follow if you want real human-entered next steps with due dates/SLA.

## 4. Tile layout (keep it compact)

The card already has: header (name · 📞 · 🕐 age · AI badge) → type·location → budget·matches → **stage info line** (the AI line) → source badges · coordinator → action buttons. Adding two more full lines makes cards tall (esp. mobile). Proposed:
- Keep the existing AI stage-info line.
- Add **one** compact line below it: **`👤 Bharat · 📞 Called 2h ago   ➡️ Next: Share property`** (last action left, next action right; wraps on mobile). Empty last-action collapses to just the Next prompt.
- This adds a single line, not two. Detailed history stays in the deal detail view.

## 5. Verification
- Resolver/include: spot-check a deal with a known `team_actions` row returns the latest correctly.
- `tsc -b` clean (frontend strict) + no new backend tsc errors; backend `listDeals` perf unaffected (take-1 indexed).
- Build on server; **visual proof** (screenshot) of a tile showing last + next + age.
- Confirm empty-state on a fresh AI-only deal reads "No team action yet".

## 6. Sequencing
1. Backend `listDeals` add `team_actions` include (+ unit/spot check).
2. Frontend: `lastActionLine` + `nextActionLine` helpers + the single combined line (both card blocks).
3. Deploy backend (scp + restart) and frontend (build on server, SW bump).
4. Verify + screenshot.

## 7. Open decision for owner
**Next action: Option A (stage-derived prompt, now) or also Option B (real human-entered next step + due, fast-follow)?** Plan ships A + last-action regardless; B is the add-on.
