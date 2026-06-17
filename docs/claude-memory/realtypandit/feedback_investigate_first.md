---
name: Investigate before coding
description: MUST find and confirm the exact error before writing any fix — never jump to coding
type: feedback
---

NEVER jump to coding a fix. Always follow this sequence:
1. FIRST reproduce the exact problem the user sees (visible browser, same viewport, same flow)
2. CONFIRM the root cause with evidence (screenshot, console error, network log)
3. SHOW the user what you found — explain the exact problem
4. ONLY THEN plan and implement the fix

**Why:** User repeatedly corrected me for shipping blind fixes that didn't solve the actual problem. Multiple rounds of deploy-and-hope wasted time and trust. The user said: "you jump on to start working, you don't find the problem."

**How to apply:** Before ANY code change, open visible browser, reproduce the bug, screenshot it, and explain what's happening before touching code.
