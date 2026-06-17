# Claude memory snapshot (portable)

A snapshot of Claude Code's **machine-local memory** for RealtyPandit, copied into the repo
so it travels with git to any machine (e.g. a cloud VS Code box). This is working-style
feedback + technical reference notes — **not** authoritative project knowledge (that lives in
`docs/`, with `docs/PROJECT_STATUS.md` winning on conflicts).

## Contents
```
docs/claude-memory/
├── workspace-CLAUDE.md      ← the workspace-root CLAUDE.md (operating notes, project map)
├── realtypandit/            ← RealtyPandit Claude memory: MEMORY.md (index) + 118 feedback_/reference_/project_ notes
└── root/                    ← cross-project operating rules (MEMORY.md index, user-preferences, 2 feedback rules)
```

## ⚠ Excluded (secrets — NOT in git, transfer securely if needed)
These were intentionally left out because they contain credentials/infra secrets:
`admin_credentials.md`, `project_whatsapp_token_history.md`, `reference_glitchtip_db_access.md`,
`reference_member_email_config.md`, `reference_prod_infrastructure.md`,
`feedback_playwright_mcp_blocked.md`. A test admin password in two curl examples
(`reference_deal_permissions.md`, `reference_reassign_authority.md`) was redacted to `****REDACTED****`.

## How another Claude Code uses this

**Option A — just point Claude at it (no setup):**
Tell the other Claude: *"Read `docs/claude-memory/realtypandit/MEMORY.md` and follow the references it points to."*
It will read the files on demand. Good enough for most work.

**Option B — make it auto-load as real memory:** Claude Code auto-loads memory from
`~/.claude/projects/<ENCODED_CWD>/memory/MEMORY.md`, where `<ENCODED_CWD>` is the project's
absolute path with every `/`, `\`, and `:` replaced by `-`. On the new machine:
```bash
# find the encoded folder name for your current project dir:
ls ~/.claude/projects/        # the one matching your cwd; or compute it from `pwd`

# then seed it with this snapshot (adjust the encoded name to yours):
mkdir -p ~/.claude/projects/<ENCODED_CWD>/memory
cp docs/claude-memory/realtypandit/*.md ~/.claude/projects/<ENCODED_CWD>/memory/

# operating notes: place workspace-CLAUDE.md as CLAUDE.md at your workspace root
cp docs/claude-memory/workspace-CLAUDE.md <workspace-root>/CLAUDE.md
```
The `root/` files are the cross-project index — they reference other clients (FitEdge, Sanro, etc.)
whose folders won't exist on a RealtyPandit-only checkout; that's expected.

> This is a point-in-time copy. The live memory keeps evolving on the origin machine — re-copy
> to refresh. `docs/` (source of truth) is always current via git.
