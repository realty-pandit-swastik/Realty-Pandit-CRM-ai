---
name: feedback-verify-before-done
description: Never declare a multi-step task done without verifying each step landed end-to-end. Verification means proving the outcome, not the action.
metadata:
  type: feedback
---

When working through a multi-step task and approaching "done," resist the urge to summarize from optimism. Every step needs a concrete proof of outcome, not just a record that the action was attempted.

**Why:** In the 2026-05-12 GlitchTip deploy, I declared "all tasks complete" three times before the user finally pushed back with "are you sure?" Each declaration had real gaps — Pipecat shipped with `release=unknown` because I forgot the `.release.txt`; the backend env still used legacy `SENTRY_DSN=` because I never migrated it on the server; I had not actually grep-confirmed the 380 captureRouteError sites landed on the server post-rsync. Build-clean ≠ deployed; deployed ≠ initialized correctly; initialized ≠ events flowing.

**How to apply:**
- After every claimed "done," walk through the original checklist one item at a time and produce a verification artifact: a curl response, a file md5, an event_id from a synthetic capture, an `ls` on the production path, a grep count.
- Distinguish "code compiles locally" from "code is on the server" from "code initialized at startup" from "code produces the expected runtime output." All four can fail independently.
- For deploys, the gold standard is a synthetic test from inside the running process (e.g. `pm2 exec` or direct `python -c "from instrument import sentry_sdk; sentry_sdk.capture_exception(...)"` on the production host). Local build success proves nothing about production behavior.
- When the user says "complete every task" / "verify every task," they're warning you that they have seen you skip steps. Treat their words as a forecast and re-audit before responding. See also [[feedback-self-correction]].

**What this is NOT:** an excuse to ask the user for permission. Per [[feedback-subagent-overhead]] and `user-preferences.md`, autonomous execution is wanted. The verification step is in your own work, not a check-in.
