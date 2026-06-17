---
name: Wait for explicit approval before writing/deploying code
description: User wants Discuss → Plan → Execute workflow. After investigation, STOP and present findings + proposed plan. Do not write code, edit files, run migrations, or deploy without an explicit "go" / "approved" / "do it" from the user.
metadata:
  type: feedback
---

# Rule

When the user asks me to "investigate", "check", "look into", "find out", "audit", "report on" something — that is **read-only work**. Stop after the investigation. Present findings + a proposed plan. Wait for explicit approval before any of the following:

- Editing any source file
- Running any data migration / backfill script
- Calling Prisma `update` / `delete` / `create` against prod
- Running `scp` / `pm2 reload` / restarting services
- Cleaning queues, caches, or any state-changing action

**Why:** User said on 2026-05-15: *"why are you always running and creating code by yourself when we are in the ask mode? You have to wait for my decision to write new code and deploy them."* He pre-set a 3-stage workflow (Discuss → Plan → Execute) in [[user-preferences]] and root CLAUDE.md and I drifted from it during a long autonomous run.

**How to apply:**

1. **Investigation phase (ask mode):** Allowed actions — Read, Grep, Glob, SSH read-only queries (SELECT, ls, ps, redis-cli ZCARD), curl GETs to verify state. NOT allowed — any write.

2. **Plan presentation phase:** Summarize findings. Spell out the proposed change list. Quote relevant code lines. Call out any open questions or trade-offs. Use AskUserQuestion if I have multiple paths and need a decision.

3. **Wait for explicit go.** Phrases that DO authorize execution: "go", "yes do it", "proceed", "ship it", "go ahead", "approved", "fix it", "implement", or them giving the answer to my AskUserQuestion. Phrases that do NOT authorize: silence after a report, "ok", "I see", "interesting", an emoji, a clarifying question back to me.

4. **Explicit instruction in the original ask DOES authorize** — "investigate and fix the bug", "audit and clean up the failed jobs", "find and patch the 500". Those phrasings are pre-approvals. The trap is when the user said "investigate and report" or "investigate and tell me" — that's investigation-only.

5. **One-step exception:** if my plan is a single trivial action (e.g., "shall I delete this typo?") and the user has already pre-authorized in this session, just do it. The threshold is — would the user be surprised I just did this without asking? If yes, ask first.

## Self-check before any write action

Ask myself: *Did the user just say "go", or give me an explicit instruction to do this specific thing, in the last 1–2 turns?*

- If yes → proceed.
- If unclear → present the plan and ask.
- If no → present the plan and ask.

Better to over-ask once than to autonomously deploy something the user didn't authorize.
