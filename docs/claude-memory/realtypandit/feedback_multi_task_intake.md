---
name: feedback-multi-task-intake
description: When the user says they'll explain multiple tasks one by one, just acknowledge + silently study the codebase per task. Do NOT investigate-plan-work until they explicitly finish and say go.
metadata:
  type: feedback
---

# Multi-task intake mode

When the user opens with something like *"I'll explain tasks one by one, you don't have to work, just understand and check the codebase, after I finish we'll investigate/plan/work"*:

- **Acknowledge each task briefly** — confirm you understood the intent in 1-2 lines.
- **Acknowledge only.** A brief 1-2 line restatement that you understood. Nothing else.
- **Do NOT touch the live server at all** — no SSH, no DB queries, no curl, not even read-only. Live-server probing reads as "working" and breaks the user's trust during a briefing.
- **Minimise even local codebase reading.** Light Grep/Read to orient is tolerable ONLY if it stays invisible; when in doubt, just acknowledge and wait. The user's signal "you are not following my instructions" means: stop all tool use except memory writes.
- **Do NOT** start the investigate→plan→execute cycle, write code, or deploy.
- **Wait** until the user signals they've shared everything AND explicitly says go/proceed.
- Then run the full cycle across all tasks together.

**Why:** The user batches related tasks and wants Claude primed with full context before any one is acted on — acting early fragments the work and risks doing the wrong thing before the whole picture is shared. This pairs with [[feedback_ask_before_executing]] (ASK MODE) — same discipline, applied to a multi-task briefing.

**How to apply:** Treat the briefing as read-only context-loading. A running tally of "Task 1: …, Task 2: …" in your head (and optionally a TodoWrite once they say go) is fine. Findings stay private until requested.

## Related

- [[feedback_ask_before_executing]] — investigate/audit → stop at findings; no write/deploy without explicit go
- [[feedback_investigate_first]] — find exact cause before coding (applies once we DO start)
