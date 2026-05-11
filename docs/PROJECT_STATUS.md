# Realty Pandit — Live Project Status

**Last updated:** 2026-05-11
**Update trigger:** Significant deployments, phase completions, blockers cleared/added.

> This file is the **live state**. When you see contradictions with anything else in /docs/, this wins. Update the timestamp on each meaningful change.

## Active people

- **Puneet** — owner, super_boss role on the admin panel
- **Sunny Sharma** — client / business stakeholder
- **Ashwani** — manager role, agent ID `37738548-f4d3-4a4c-b005-1c0b325e03cf`

## Phase status

| Phase / Workstream | Status | Notes |
|---|---|---|
| Phases 1–8 (AI automation core) | ✅ DEPLOYED | |
| Pipeline Stage 1 NEW | ✅ DEPLOYED 2026-04-24 | [`plans/2026-04-24-pipeline-stage-01-new-kra.md`](plans/2026-04-24-pipeline-stage-01-new-kra.md) |
| Pipeline Stage 2 QUALIFIED | ✅ DEPLOYED 2026-04-24 | |
| Pipeline Stage 3 MATCHING_APPOINTMENT | ✅ DEPLOYED 2026-04-24 | |
| Pipeline Stage 4 VISIT_SCHEDULED | ✅ DEPLOYED 2026-04-24 | |
| Pipeline Stage 5 VISITED | ✅ DEPLOYED 2026-04-24 | |
| Pipeline Stage 6 NEGOTIATION | ✅ DEPLOYED 2026-04-24 | |
| Stage 1 NEW UX redesign | ✅ DEPLOYED 2026-04-30 | Phases 1–7. Phase 6 (mobile full-screen page) deferred. |
| B1 auto-deal creation + stage routing | ✅ DEPLOYED 2026-05-01 | Every lead from any channel auto-creates a Deal in the correct stage |
| Deal Pipeline UI/UX overhaul | ✅ DEPLOYED 2026-05-03 | Source badges, CSS vars, card shadows, submit button fix |
| Lead↔Deal sync fix + budget corruption fixes | ✅ DEPLOYED 2026-05-07 | 15 sync-gap deals + 2 budget records fixed |
| Team Member Profile + Manager column + portal email | ✅ DEPLOYED 2026-05-09 | Full edit form, manager assignment, account actions |
| Inventory NULL `uploaded_by_agent_id` fix + 18-record backfill | ✅ DEPLOYED 2026-05-11 | See [`precautions/workflow-engine-traps.md`](precautions/workflow-engine-traps.md) + [`runbooks/inventory-null-agent-recovery.md`](runbooks/inventory-null-agent-recovery.md) |
| Location filter visibility OR fix | ✅ DEPLOYED 2026-05-11 | See [`precautions/prisma-where-or-pattern.md`](precautions/prisma-where-or-pattern.md) |
| Phase 9 — property cards | ⏸ BLOCKED | Pending product decision |
| Phase 10 — digest | ⏸ BLOCKED | Pending product decision |

## Known blockers / pending decisions

- **790 contacts have no Deal** — backfill decision pending Sunny (do we retroactively create Deals from existing contacts?)
- **Phase 9 (property cards)** — blocked on product decision
- **Phase 10 (digest)** — blocked on product decision
- **3 WhatsApp templates pending Meta approval** — out of 78 total. See [`runbooks/meta-template-approval.md`](runbooks/meta-template-approval.md).
- **Category lock expires ~2026-05-17** — 3 templates can then be reclassified MARKETING → UTILITY for cheaper messaging

## Active vigilance items

- Meta developer app deletion risk — once happened 2026-04-16. If WhatsApp goes silent + Graph API returns 401, check developer console FIRST. See [`runbooks/meta-template-approval.md`](runbooks/meta-template-approval.md).
- WhatsApp token rotation — check periodically; the WABA → app subscription can silently un-subscribe

## Recent deploys (last 30 days)

| Date | What |
|---|---|
| 2026-05-11 | Inventory NULL agentId fix + location filter fix + 18-record backfill (Ashwani) |
| 2026-05-09 | Team Member Profile + Manager column + portal email + PWA cache bust |
| 2026-05-07 | Lead↔Deal sync fix (15 sync-gap deals + 2 budget corruption fixes) |
| 2026-05-06 | Deal workspace SSOT fix + reassign |
| 2026-05-03 | Deal Pipeline UI/UX overhaul (source badges, CSS vars, card shadows, submit button) |
| 2026-05-02 | 9 bug fixes — qualify form blanks, 99acres BHK regex, MagicBricks msg parsing |
| 2026-05-01 | B1 auto-deal creation + stage routing |
| 2026-04-30 | Stage 1 NEW UX redesign (Phases 1–7) |
| 2026-04-29 | Phase A bot fixes + Phase C audit/cleanup |
| 2026-04-28 | Pipeline bug fixes — matching engine + property sharing |
| 2026-04-25 | Workstream 4 AI automation wiring final |
| 2026-04-24 | All 6 pipeline stage KRAs + DEC-003 (Deal Pipeline unification) |
| 2026-04-23 | 5 bug fixes — scheduled_worker import path, mapInventoryToProduct names, interaction_engine, AdminAgent search |
| 2026-04-20 | Panditji voice optimizations + VAD guard fix + WhatsApp token fix |
| 2026-04-19 | WhatsApp voice bot LIVE (Pipecat 1.0.0 + Gemini Live) |
| 2026-04-18 | MagicBricks PUSH integration live |
| 2026-04-17 | Middleman model (partner ownership) + CSRF cookie cross-subdomain fix |
| 2026-04-16 | Master execution plan approved |
| 2026-04-15 | GlitchTip error intelligence system + Phase 3 PWA remediation |
| 2026-04-14 | Filter sheets redesign + Jitesh lead investigation (12 bugs, 2 critical fixed) |
| 2026-04-12 | Full PWA UI/UX redesign |
