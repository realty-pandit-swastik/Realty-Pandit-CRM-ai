# Project root — operating notes

This workspace hosts multiple projects (Realty Pandit, FitEdge, Passion Sports, Sanro IT, etc.). Each project has its own /docs/ as source of truth and its own memory directory for Claude-side feedback + pointers.

## Knowledge layer

Each project is self-contained:

| Project | /docs/ source of truth | Project memory dir |
|---|---|---|
| Realty Pandit | `clients/sunny-sharma/projects/reality-pandit/docs/` | `~/.claude/projects/c--…-sunny-sharma/memory/` |
| FitEdge | (in-repo docs TBD) | `~/.claude/projects/C--Users-Varchasv-Bhardwaj/memory/` |
| Passion Sports | (in-repo docs, isolated) | `clients/passion-sports/memory/` |
| Sanro IT (sanroit.in) | `clients/sanro-it/projects/website/docs/` | `clients/sanro-it/memory/` |

**Realty Pandit quick map:**
- Live status: [`clients/sunny-sharma/projects/reality-pandit/docs/PROJECT_STATUS.md`](clients/sunny-sharma/projects/reality-pandit/docs/PROJECT_STATUS.md)
- Architecture: [`docs/architecture/`](clients/sunny-sharma/projects/reality-pandit/docs/architecture/)
- Decisions (ADRs): [`docs/decisions/`](clients/sunny-sharma/projects/reality-pandit/docs/decisions/)
- Plans: [`docs/plans/`](clients/sunny-sharma/projects/reality-pandit/docs/plans/)
- Runbooks: [`docs/runbooks/`](clients/sunny-sharma/projects/reality-pandit/docs/runbooks/)
- Precautions: [`docs/precautions/`](clients/sunny-sharma/projects/reality-pandit/docs/precautions/)

**Sanro IT quick map:**
- Live URL: https://sanroit.in/ (Hostinger shared hosting, key-based deploy)
- Memory index: [`clients/sanro-it/memory/MEMORY.md`](clients/sanro-it/memory/MEMORY.md)
- Design docs: [`clients/sanro-it/projects/website/docs/`](clients/sanro-it/projects/website/docs/)
- Deploy: `python clients/sanro-it/projects/website/deploy/deploy.py` (one command, key auth via `~/.ssh/sanroit_deploy`)
- QA harness: [`clients/sanro-it/projects/website/qa/verify.py`](clients/sanro-it/projects/website/qa/verify.py)

## Research tools

- **Default: Grep + Glob + Read.** Fast and reliable.
- **`code-review-graph` MCP server** tools are installed but have caused session stalls in practice — treat as optional and skip if they hang. (See `feedback_skip_code_review_graph.md` in root memory.)

## Operating discipline

- 3-stage workflow: Discuss → Plan → Execute (never autonomous code-writing)
- Visual proof for every UI change (screenshot before + after)
- Project isolation — never mix files across projects
- Inline execution with phase checkpoints (per `feedback_subagent_overhead.md`)
