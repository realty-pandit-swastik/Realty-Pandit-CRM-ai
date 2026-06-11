# WhatsApp Chat tab (Deal + Lead) — Implementation Plan

> Execute inline (this codebase ships via `deploy-agent.js frontend`, no branch). Checkbox steps.

**STATUS: ✅ SHIPPED & verified 2026-05-19.** All 4 tasks done. New
`WhatsAppChatTab.tsx`; wired into `DealWorkspace` (tab "WhatsApp Chat",
desktop+mobile via shared DealPipeline modal) and `ExternalLeads` lead
panel (sliderTab `chat`, desktop+PWA). No backend change (reused
`getInteractions`/`GET /api/contacts/:phone/interactions`, role-access
controlled). tsc all-touched-clean; deployed (bundle index-Bj_dC9Yo,
SW v20260519e — PWA must close+reopen once); data E2E: +917986024171 →
24 WA msgs (14 in/10 out), +919958860411 → 109 → tab populates both ways;
GlitchTip clean. Pending: user visual confirm on a real deal + lead
(desktop + reopened PWA).

**Goal:** A read-only "WhatsApp Chat" tab showing the complete two-way Panditji⇄customer WhatsApp history (incl. template/marketing/workflow messages) on both the Deal modal and the Lead detail panel — desktop **and** mobile PWA.

**Decisions (Puneet 2026-05-19):** WhatsApp-only; desktop + PWA; read-only v1.

**Architecture:** No backend change — `GET /api/contacts/:phone/interactions` (client helper `getInteractions(phone)`) already returns all interactions with role-based access control. One reusable responsive `<WhatsAppChatTab phone>` component (self-fetches, filters `channel==='whatsapp'`, renders chat bubbles) wired into the two shared components used by BOTH desktop and mobile: `deal/DealWorkspace.tsx` (DealPipeline modal, used for `case 'deals'` desktop+mobile) and `ExternalLeads.tsx` (lead panel, used desktop + `isMobile`).

**Tech:** React + TS, inline styles (codebase convention), `getInteractions` from `api/client`.

## File Structure
| File | Responsibility | Action |
|---|---|---|
| `frontend/src/components/WhatsAppChatTab.tsx` | Reusable read-only WA chat history (fetch + filter + bubbles) | Create |
| `frontend/src/components/deal/DealWorkspace.tsx` | Add `chat` tab + render | Modify (tabs ~76-79, render ~286-293) |
| `frontend/src/components/ExternalLeads.tsx` | Add a "Chat" view in the selected-lead detail panel | Modify |
| `frontend/index.html` | PWA SW cache-bust stamp | Modify (1 line) |

## Task 1 — WhatsAppChatTab component
- [ ] Create `WhatsAppChatTab.tsx`: props `{ phone: string; isMobile?: boolean }`. On mount + when phone changes, `getInteractions(digits(phone))`; filter `channel==='whatsapp'`; sort by `created_at` asc. Render scrollable bubble list: `direction==='inbound'` → left/grey (customer), else right/green ("Panditji / Team"). Show time (`Asia/Kolkata`, dd MMM HH:mm). For `event_type` not in `['message']`, show a faint chip (e.g. `template`, `marketing`, `workflow_message`, `closing_signal`, `property_shared`, `followup`). Empty → "No WhatsApp messages yet." Loading + error states. Auto-scroll to newest. No input box (read-only).
- [ ] tsc: `cd frontend && npx tsc --noEmit 2>&1 | grep WhatsAppChatTab || echo CLEAN` → CLEAN.

## Task 2 — Wire into DealWorkspace (covers desktop + mobile deal modal)
- [ ] Import `WhatsAppChatTab`. Extend `Tab` union + tabs array with `{ key:'chat', label:'WhatsApp Chat' }` (after `shared`, before `timeline`).
- [ ] Add render branch `{activeTab === 'chat' && <WhatsAppChatTab phone={deal.demand_contact?.phone_number || ''} isMobile={isMobile} />}` (mirror the `activeTab === 'timeline'` block). Use the existing `phone`/responsive context already in the file.
- [ ] tsc DealWorkspace → CLEAN.

## Task 3 — Wire into ExternalLeads lead panel (covers desktop + PWA leads)
- [ ] In the selected-lead detail panel, add a tab/segment "Chat" alongside the existing Activity / Visits & Views; when active render `<WhatsAppChatTab phone={selectedPhone} isMobile={effectiveIsMobile} />`. Reuse `selectedPhone` + `effectiveIsMobile` already in the component. Default tab unchanged.
- [ ] tsc ExternalLeads → CLEAN (ignore unrelated pre-existing baseline lines).

## Task 4 — Verify + ship
- [ ] `cd frontend && npx tsc --noEmit 2>&1 | grep -E "WhatsAppChatTab|DealWorkspace|ExternalLeads" || echo ALL_TOUCHED_CLEAN`.
- [ ] Bump `frontend/index.html` SW stamp (PWA must refresh — runbook pwa-cache-bust).
- [ ] Deploy: `node deployment/deploy-agent.js frontend --skip-verify` → SUCCESS; confirm new bundle hash + `sw.js` updated.
- [ ] Data E2E: pick a real contact with WA history (e.g. +917986024171), hit `GET /api/contacts/<phone>/interactions` server-side, assert ≥1 `channel==='whatsapp'` row both directions → proves the tab will populate (no client spam, read-only).
- [ ] GlitchTip clean; update plan status + memory; user visually confirms tab on a real deal + lead (desktop + reopened PWA).

## Notes / risk
- Pure additive frontend; no API/schema/cron change → low risk. Access control already enforced server-side by the existing endpoint (employee sees only assigned, etc.).
- PWA users must fully close+reopen the app once (SW cache).
