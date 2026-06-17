---
name: Skip subagent-driven-development for mechanical work
description: Subagent-driven execution adds too much overhead for this project's tempo. Use inline execution with phase-boundary checkpoints instead.
type: feedback
originSessionId: 6083be92-cbcf-4f7d-9d4e-f3bd2059e900
---
For mechanical implementation work (file edits, deploys, wiring known patterns), do NOT use the subagent-driven-development skill. The 3-subagent-per-task pattern (implementer + spec reviewer + code quality reviewer) compounds into hours of wall-clock for plans with 10+ tasks.

**Why:** The user works at a fast pace and dispatches feel like stalling. They have full trust in inline execution after seeing the Stage 1 NEW redesign ship cleanly that way (2026-04-30 session).

**How to apply:**
- For implementation plans, default to **inline execution with phase-boundary checkpoints** (the loop used for Stage 1 NEW redesign): execute multiple tasks per phase in the controller session, stop at phase boundary for screenshot/SQL review, continue.
- Reserve subagents for: (a) genuinely independent research that pollutes context, (b) parallel work where multiple agents save time, (c) one-off bigger tasks the user explicitly delegates.
- If the user picks "subagent-driven" from a writing-plans handoff menu, push back gently: "for plans this size that means 50+ subagent dispatches — would you rather inline like last time?"
- Saving plans is still valuable; just don't follow the dispatch-per-task workflow blindly.

**Triggered by:** User saying "you are stuck" after I dispatched implementer + spec reviewer + was about to dispatch code quality reviewer for the first task of a 17-task plan (B1 auto-deal-creation, 2026-04-30).
