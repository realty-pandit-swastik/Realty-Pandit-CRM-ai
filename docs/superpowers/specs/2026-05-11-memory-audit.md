# Memory Audit & Classification — 2026-05-11

> Output of Task 1 of the memory restructure plan. **No files have been modified yet.** User review required before proceeding to Task 2.

**Totals:** 53 (Realty Pandit memory) + 15 (root memory) + 13 (.claude/plans/) = **81 files inventoried**

**Verdict legend:**
- `keep` — already feedback/reference with **Why** block; leave alone
- `rewrite` — good content, missing or weak **Why** — add **Why** + **How to apply**
- `migrate` — content belongs in /docs/; move it, leave a 1-line pointer in memory
- `archive` — historical snapshot (bug log, completion record) → consolidate under `/docs/archive/`
- `delete` — pure duplicate of /docs/ content, or content folded into PROJECT_STATUS.md

---

## A. Realty Pandit memory (`...c--…-sunny-sharma/memory/`) — 53 files

### A1. Feedback files (10) — all kept

These are the gold: Claude-specific working rules with **Why** blocks already present.

| File | Has Why? | Verdict | Notes |
|---|---|---|---|
| `feedback_agent_phone_field.md` | ✓ | keep | Agent model uses `phone` not `phone_number` |
| `feedback_axios_shared_client.md` | ✓ | keep | Mutations must use shared axios client (CSRF interceptor) |
| `feedback_browser_qa.md` | ✓ | keep | Always do visible browser QA |
| `feedback_investigate_first.md` | ✓ | keep | Investigate before coding |
| `feedback_mobile_components.md` | ✓ | keep | Update mobile + desktop components together |
| `feedback_pipecat_vad_guard.md` | ✓ | keep | Pipecat 1.0.0 PipelineParams is immutable |
| `feedback_pwa_deploy.md` | ✓ | rewrite | Strong content but mechanics belong in `runbooks/pwa-cache-bust.md`. Keep the **rule** ("after frontend changes, bump index.html comment") in memory, move the how-to to /docs/. |
| `feedback_self_correction.md` | ✓ | keep | Apply user corrections immediately |
| `feedback_self_improvement.md` | ✓ | keep | Read memory at conversation start |
| `feedback_sentry_v10.md` | ✓ | keep | Sentry v10 API: `setupExpressErrorHandler(app)` |
| `feedback_subagent_reviews.md` | ✓ | delete | Duplicate of root `feedback_subagent_overhead.md` |
| `feedback_ui_quality.md` | ✓ | keep | UI must look human-designed |

### A2. Operating-rule / how-we-work files (3) — consolidate

| File | Verdict | Notes |
|---|---|---|
| `MASTER_OPERATING_RULES.md` | rewrite | Keep as the single Claude-operating-rules file. Add **Why** blocks where missing. |
| `how_we_work.md` | delete | Overlaps heavily with MASTER_OPERATING_RULES.md. Carry any unique content over before delete. |
| `user_workflow_preferences.md` | delete | Duplicate of root `user-preferences.md`. |

### A3. Project knowledge → /docs/architecture/ (11) — migrate

These describe what's built. Content moves to /docs/, memory keeps a 1-line pointer.

| File | New location |
|---|---|
| `admin_panel_map.md` | `docs/architecture/admin-panel-map.md` |
| `agent_workflow.md` | `docs/architecture/agent-workflow.md` |
| `classification_tree_final.md` | `docs/architecture/classification-tree.md` |
| `design_system.md` | `docs/architecture/design-system.md` |
| `leads_system.md` | `docs/architecture/leads-system.md` |
| `project_99acres_integration.md` | `docs/architecture/integrations.md` (combine with magicbricks) |
| `project_magicbricks_integration.md` | `docs/architecture/integrations.md` (combine with 99acres) |
| `project_architecture.md` | `docs/architecture/system-overview.md` (use as source) |
| `project_complete_reference.md` | `docs/architecture/system-overview.md` (merge URLs/credentials section) |
| `project_inventory_assignment_rules.md` | append to existing `docs/architecture/business-logic.md` |
| `website_map.md` | `docs/architecture/website-map.md` |

### A4. Project knowledge → /docs/runbooks/ (4) — migrate as operational procedures

| File | New location |
|---|---|
| `project_glitchtip_system.md` | `docs/runbooks/glitchtip.md` |
| `project_meta_catalog.md` | `docs/runbooks/meta-product-catalog.md` |
| `project_whatsapp_meta_status.md` | `docs/runbooks/meta-template-approval.md` + status table to PROJECT_STATUS.md |
| `project_whatsapp_token_history.md` | `docs/runbooks/whatsapp-token-rotation.md` |

### A5. Project knowledge → /docs/precautions/ (1) — migrate as warning

| File | New location |
|---|---|
| `project_csrf_cookie_fix.md` | `docs/precautions/csrf-cookie-pattern.md` |

### A6. Snapshots / completion records → /docs/archive/ (13) — archive

These are one-time work records. Useful as history, not as live memory. Consolidate or move to `/docs/archive/`.

| File | Verdict | Destination |
|---|---|---|
| `project_bugs_fixed_20260418.md` | archive | `docs/archive/2026-04-05-bug-fixes.md` (consolidated) |
| `project_bugs_fixed_20260420.md` | archive | same consolidated file |
| `project_bugs_fixed_20260423.md` | archive | same consolidated file |
| `project_bugs_fixed_20260502.md` | archive | same consolidated file |
| `project_pipeline_bugs_fixed_20260428.md` | archive | same consolidated file |
| `project_b1_auto_deal_creation_20260501.md` | archive | `docs/archive/2026-05-01-b1-auto-deal-creation.md` |
| `project_filter_sheets.md` | archive | `docs/archive/2026-04-14-filter-sheets-redesign.md` |
| `project_lead_investigation_jitesh.md` | archive | `docs/archive/2026-04-14-jitesh-lead-investigation.md` |
| `project_middleman_model_deployed.md` | archive | `docs/archive/2026-04-17-middleman-model.md` (merge with `project_partner_middleman.md`) |
| `project_partner_middleman.md` | archive | (merged with above) |
| `project_panditji_voice_optimizations.md` | archive | `docs/archive/2026-04-20-panditji-voice-optimizations.md` |
| `project_phase3_remediation.md` | archive | `docs/archive/2026-04-15-phase3-remediation.md` |
| `project_phase_a_bot_fixes_20260429.md` | archive | `docs/archive/2026-04-29-phase-a-bot-fixes.md` |
| `project_phase_c_audit_20260429.md` | archive | `docs/archive/2026-04-29-phase-c-audit.md` |
| `project_pwa_redesign.md` | archive | `docs/archive/2026-04-12-pwa-redesign.md` |
| `project_stage1_new_ux_redesign_20260430.md` | archive | `docs/archive/2026-04-30-stage1-new-ux-redesign.md` |
| `leads_whatsapp_data_gap.md` | archive | `docs/archive/2026-03-27-whatsapp-lead-data-gap-investigation.md` |

### A7. Special status files (3)

| File | Verdict | Notes |
|---|---|---|
| `admin_credentials.md` | keep | Credentials don't belong in /docs/ (committed to git) — keep in memory, type=reference. Sensitive. |
| `glitchtip_errors.md` | keep | Auto-updated nightly digest — leave as-is, mark `type: reference`. Pointer to runbook. |
| `skills_master.md` | migrate | → `docs/tools-and-skills/USED.md` (the list of skills) + memory pointer |

### A8. User / index files (3)

| File | Verdict | Notes |
|---|---|---|
| `MEMORY.md` | rewrite | Rebuild as tight one-line index after migration completes (Task 11) |
| `user-roles.md` | rewrite | Trim to 2 lines: Sunny = client, Puneet = owner. Full details go to PROJECT_STATUS.md "Active people". |

---

## B. Root memory (`...c--…-Project/memory/`) — 15 files

| File | Verdict | Notes |
|---|---|---|
| `MEMORY.md` | rewrite | Rebuild as cross-project index only (Task 11) |
| `user-preferences.md` | keep | The master user-prefs file. Verify **Why** is present. |
| `feedback_skip_code_review_graph.md` | keep | Has **Why** |
| `feedback_subagent_overhead.md` | keep | Has **Why** |
| `fitedge-project.md` | move | → `C--Users-Varchasv-Bhardwaj/` (FitEdge memory dir) |
| `fitedge-state.md` | move | → FitEdge memory dir (file already self-flags as "WRONG LOCATION") |
| `realty-pandit-state.md` | delete | Content folded into `docs/PROJECT_STATUS.md`. File self-flags as "WRONG LOCATION". |
| `partner-agent-system-plan.md` | move | → `clients/sunny-sharma/projects/reality-pandit/docs/plans/2026-04-17-partner-agent-system.md` (if not already there — note `.claude/plans/2026-04-17-partner-agent-system-remediation.md` exists) — verify which has full content |
| `project_meta_app_deleted.md` | rewrite | Keep — this is a recurring-risk incident note. Strengthen **Why** + **How to apply** (the procedure to detect this state). Type: `reference`. |
| `project_realty_pandit_master_plan.md` | delete | The plan lives in `.claude/plans/compiled-sparking-kitten.md` (which Task 9 renames + moves). PROJECT_STATUS.md tracks completion. |
| `project_realty_pandit_pipeline_unification.md` | delete | ADR at `docs/decisions/DEC-003-deal-pipeline-unification.md` is authoritative. Memory will have a 1-line pointer. |
| `project_realty_pandit_session_progress.md` | delete | Replaced by `docs/PROJECT_STATUS.md` |
| `project_realty_pandit_stage1_new_kra.md` | delete | Full content at `docs/plans/2026-04-24-pipeline-stage-01-new-kra.md`. The 6-stage summary in MEMORY.md goes too. |
| `project_realty_pandit_workstream4_progress.md` | archive | → `docs/archive/2026-04-25-workstream4-progress.md` then delete from memory |
| `realty_pandit_whatsapp_voice_bot_architecture.md` | migrate | → `docs/architecture/whatsapp-voice-bot.md` (this is in the Realty Pandit ws, not root — move there) |

---

## C. `.claude/plans/` — 13 files, all move to `docs/plans/`

| Current name | New name | Source clue |
|---|---|---|
| `2026-04-17-partner-agent-system-remediation.md` | (keep name) | Already dated |
| `2026-04-18-pipecat-whatsapp-voice-calling.md` | (keep name) | Already dated |
| `2026-04-20-meta-catalog-whatsapp-flows.md` | (keep name) | Already dated |
| `2026-04-23-catalog-fix.md` | (keep name) | Already dated |
| `2026-05-06-deal-workspace-ssot-fix-and-reassign.md` | (keep name) | Already dated |
| `2026-05-07-lead-deal-sync-fix.md` | (keep name) | Already dated |
| `compiled-sparking-kitten.md` | `2026-04-16-master-execution-plan.md` | "Realty Pandit — Master Execution Plan / AI Lead Automation + Contact System Redesign + WhatsApp Experience" |
| `compressed-growing-flamingo.md` | `2026-04-15-glitchtip-error-intelligence.md` | "Automated GlitchTip Error Intelligence System" |
| `curious-wishing-scroll.md` | `2026-05-02-deal-pipeline-ui-ux-overhaul.md` | "Deal Pipeline UI/UX Overhaul — Light & Dark Mode (Web + PWA)" |
| `dazzling-wobbling-whisper.md` | `2026-04-25-whatsapp-templates-wiring.md` | "Plan: Wire WhatsApp Templates into AI Agents" (date from file mtime — verify in execution) |
| `giggly-growing-mochi.md` | `2026-04-20-panditji-voice-performance.md` | "Panditji Voice Bot — Performance & Latency Optimization Plan" |
| `precious-plotting-frost.md` | `2026-04-28-deal-pipeline-ai-team-coordination.md` | "Plan: Deal Pipeline AI–Team Coordination Layer", file says Date: 2026-04-28 |
| `velvet-wishing-cook.md` | `2026-04-20-sw-403-axios-fix.md` | "Fix Plan: Production Errors — Service Worker + 403 AxiosError" |

All destinations: `clients/sunny-sharma/projects/reality-pandit/docs/plans/<new-name>.md`

---

## D. Summary by verdict

| Verdict | Count | Result |
|---|---|---|
| keep | 12 | Untouched, possibly slim |
| rewrite | 6 | Edit in place, add **Why**/**How to apply** |
| migrate | 17 | Content → /docs/, 1-line pointer stays in memory |
| archive | 17 | → `/docs/archive/` (consolidated or individual) |
| move | 3 | FitEdge files out of root memory; voice-bot arch into RP /docs/ |
| delete | 13 | Pure duplicates or replaced by PROJECT_STATUS.md |
| plans → /docs/plans/ | 13 | All renamed (cryptic) + moved |

**End state:**
- Realty Pandit memory: 53 → ~13 files (the 12 keepers + 1 rewritten user-roles)
- Root memory: 15 → 4 files (`MEMORY.md`, `user-preferences.md`, `feedback_skip_code_review_graph.md`, `feedback_subagent_overhead.md`, `project_meta_app_deleted.md`) — net ~5
- `.claude/plans/`: 13 → 0 files (all moved into `/docs/plans/`)
- `/docs/` gains: 11 architecture files, 4 runbooks, 1 precaution, 17 archive entries, all 13 plans

---

## E. ⚠ User review items

These are the few decisions where I'd appreciate explicit confirmation before executing:

1. **`how_we_work.md` deletion** — content overlaps MASTER_OPERATING_RULES.md, but anything unique should be carried over first. OK to delete after merge?
2. **All `project_bugs_fixed_*` to archive** — 5 files become one chronological archive. The current fixes are in code/git already; the memory entries lose nothing by archiving. Agree?
3. **`project_realty_pandit_master_plan.md` deletion** — the full plan moves to `/docs/plans/2026-04-16-master-execution-plan.md` (via Task 9 rename). PROJECT_STATUS.md tracks completion percentages. Memory copy redundant after that. Agree?
4. **`project_meta_app_deleted.md` retention as memory** — this is an incident note about a Meta app being accidentally deleted, with future detection procedure. I'm keeping it in memory (not migrating) because it's an active vigilance rule. Confirm?
5. **`admin_credentials.md` retention as memory** — credentials shouldn't live in git/docs. Keep in memory as `type: reference`. Confirm?

Once you say go on these (or override any of them), I move to Task 2.
