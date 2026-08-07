# ⛔ Retired — do not read this as current state

This file used to say "READ THIS FILE AT THE START OF EVERY SESSION". It was last accurate in
**February 2026** and drifted badly (it still described a deploy flow and process layout that changed
months ago). Keeping it as the entry point meant every session started from stale facts.

**Archived copy:** [`docs/archive/STALE-PROJECT_KNOWLEDGE.md`](docs/archive/STALE-PROJECT_KNOWLEDGE.md)

## Read these instead

| You want | Go to |
|---|---|
| Turn-one project context | [`clients/sunny-sharma/CLAUDE.md`](../../CLAUDE.md) |
| **Current state — wins on any contradiction** | [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) |
| Architecture, ADRs, plans, runbooks, precautions | [`docs/`](docs/) |
| Claude-side rules, traps, pointers | the memory dir — index `MEMORY.md` |

## ⚠️ Security note

The archived copy contains a **live Google Gemini API key in plaintext**, committed to this repo.
It has not been rotated. Rotating it will break production AI chat until the server `.env` is updated,
so it needs a deliberate, owner-approved change — not a drive-by edit.

*Retired 2026-08-06.*
