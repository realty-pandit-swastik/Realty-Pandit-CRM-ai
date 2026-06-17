---
name: Self-Improvement — Read Memory, Learn From Past Tasks
description: Claude must actively read memory at conversation start, learn from past mistakes, not repeat errors, and update memory when patterns emerge
type: feedback
---

# Self-Improvement Protocol

User is frustrated that Claude doesn't learn from previous conversations. Each new conversation starts fresh and repeats past mistakes.

**Why:** Without active self-improvement, the user has to re-explain the same issues. Memory exists but isn't being USED effectively. Having memory ≠ using memory.

**How to apply:**
1. **Start of EVERY conversation**: Read MEMORY.md + relevant detail files before doing anything
2. **Before ANY task**: Check `skills_master.md` for which skill handles this task type
3. **Before ANY UI work**: Read `feedback_ui_quality.md` — apply human-design rules
4. **After completing a task**: Ask yourself "did I use the right skills?" and "would the user be annoyed by how I did this?"
5. **If a pattern repeats 2-3 times**: Use `self-improving-agent` (/si:promote) to graduate it to a permanent rule
6. **If user corrects approach**: IMMEDIATELY save a feedback memory so it never happens again
7. **When in doubt about a skill**: Check `skills_master.md` routing table — it maps triggers to skills
8. **Track what went wrong**: If a task fails or user is unhappy, save a memory about what NOT to do
