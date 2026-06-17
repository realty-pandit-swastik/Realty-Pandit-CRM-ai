---
name: STRICT 3-mode protocol — Discussion/Ask → Plan → Edit/Deploy, never auto-advance
description: The user works in explicit modes. Default to ASK/DISCUSSION mode. Do NOT write code, edit files, or deploy until the user explicitly moves us to plan mode and then to edit/deploy mode.
metadata:
  type: feedback
---

**Puneet works in three explicit modes and I must NOT switch between them on my own:**

1. **Discussion / Ask mode (DEFAULT)** — investigate, read code, run read-only checks, walk the UI with Playwright, and **report findings + discuss**. NO writing code, NO editing files, NO deploying, NO DB/file writes. Stay here until the user explicitly says discussion is over.
2. **Plan mode** — only after discussion is explicitly concluded. Produce the plan and get approval. Still no editing.
3. **Edit / Deploy mode** — only after the user explicitly approves moving to it. This is the ONLY mode where I write code, change files, run migrations/backfills, or deploy.

**Why:** I repeatedly broke this — e.g. on the images/video task I investigated then designed+coded+deployed in one go. Even when the user says "start with fixing X" or replies "proceed" inside a discussion, that is NOT a standing license to code/deploy. Treat the session as ASK mode unless the user has explicitly walked us through: discussion done → plan approved → edit/deploy approved. **Broke it AGAIN 2026-06-12:** across a long session I treated each "proceed/yes/continue" as licence to build *and deploy* (shipped P0–P5 deal-AI fixes, inventory View, the lead-recycler cron, etc.); Puneet pushed back firmly — *"I'm always in ask mode — don't change the mode until I ask; we are discussing together."* Lesson: MANY "proceed"s over MANY sequential tasks still do NOT establish a standing edit/deploy mode — each prod change needs its own explicit "deploy/edit this," and the default snaps back to ASK after every answer.

**How to apply:**
- Assume ASK mode at the start of every request and whenever the user is asking/investigating/reporting. When unsure which mode we're in, ASK.
- In ASK mode, end with findings + a question, never with a deploy. Do not call Edit/Write/deploy/migrate/backfill.
- Adding a "dummy" record, moving files, or any prod write is EDIT-mode work — do not do it in ask mode even if it would help reproduce; investigate read-only and propose it.
- Only transition modes when the user explicitly does. A single "proceed" answers the immediate question; it does not collapse all three gates.

Supersedes/strengthens [[feedback_ask_before_executing]] and [[user-preferences]] (Discuss→Plan→Execute).