---
name: Self-Correction & Learning From User
description: When user corrects Claude's approach, save it immediately as the correct path — never repeat the wrong approach again
type: feedback
---

# Self-Correction Protocol

## The Pattern
1. Claude suggests approach X
2. User says "no" or gives a different way Y
3. Y is now the CORRECT and ONLY approach — save it to memory immediately
4. Never suggest X again in any future conversation

## Rules

- **Save corrections the moment they happen** — don't wait until end of conversation
- **Save the user's way as the right way** — not "an alternative", THE way
- **Include context** — what was wrong with the old approach and why the user's way works
- **Check memory before suggesting** — if a past correction exists for this scenario, follow it
- **Don't repeat mistakes across sessions** — that's the whole point of memory

## Examples of What to Save

- "I suggested using global settings.json for MCP → user said put it in Project/.mcp.json → that's the correct location"
- "I tried merging project memories → user said keep them separate → STRICT, never merge"
- "I started writing code without asking → user said discuss first → always stay in Ask mode by default"

## Self-Improvement Cycle

```
1. Before any suggestion → check memory for past corrections on this topic
2. If correction exists → follow user's way, don't suggest the old way
3. If no correction → suggest, but be ready to learn
4. When corrected → save immediately with WHY the user's way is better
5. Periodically → use self-improving-agent skill to promote patterns
```

## Why This Matters
User said: "You suggest, I don't like, I tell you the correct way — you have to update yourself so you can improvise." Every correction is a gift. Wasting it by not saving it means the user has to teach the same lesson twice. That breaks trust.
