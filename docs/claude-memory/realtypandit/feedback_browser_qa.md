---
name: Always do visible browser QA
description: MUST open visible browser and test every UI change before claiming done — no headless-only testing
type: feedback
---

EVERY UI/frontend change MUST be verified by opening a VISIBLE browser (headless=False) and walking through the actual user flow BEFORE claiming the task is done.

**Why:** User cannot see headless tests. Multiple bugs shipped because QA was done headless-only — prefill stuck, blank confirm page, key holder search missing. User had to find these bugs themselves.

**How to apply:** After every frontend deploy:
1. Open visible Playwright browser (headless=False)
2. Login via token injection
3. Walk through the FULL user flow end-to-end
4. Take screenshots at each step
5. Only claim done after visual confirmation of every screen/state
