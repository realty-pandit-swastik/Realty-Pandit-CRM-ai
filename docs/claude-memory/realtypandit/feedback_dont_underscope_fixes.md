---
name: Don't under-scope an "enable editing / manage X" request
description: When the user asks to be able to edit or manage an entity, default to the full surface (profile/management page), not a one-field patch. Clarify scope before building.
metadata:
  type: feedback
---

**2026-05-30:** Puneet asked to be able to **edit partner agents** (the corrupted "I have the key"
partner couldn't be renamed). I shipped a minimal ✎ **name-only** edit button. He pushed back:
> "you just create edit button to edit the name — it is wrong. I need a complete page on which I
> can edit the profile of the partner and manage my partner agent."

**Why it matters:** "I can't edit X" / "let me edit/manage X" usually means a **proper editable
surface** (full profile + management actions), not the single field that triggered the complaint.
A narrow patch reads as missing the point and burns a round-trip + a deploy.

**How to apply:**
- When a request is about *editing/managing an entity*, scope to the **whole entity** (all its
  meaningful fields + the actions a manager needs), and look for an existing pattern to mirror
  (here: `TeamMemberProfile.tsx` / `MyProfile.tsx` — full profile pages).
- If unsure how big, **ask** ("just the name, or a full profile/management page?") BEFORE building,
  per [[feedback_three_mode_protocol]] / [[feedback_ask_before_executing]] — don't assume minimal.
- A quick fix can be an interim step, but say so and offer the full version.
- Plan: `docs/plans/2026-05-30-partner-agent-profile-management.md`.
