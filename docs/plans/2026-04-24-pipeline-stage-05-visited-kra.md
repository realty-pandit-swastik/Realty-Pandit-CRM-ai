# Pipeline Stage 5 — VISITED — KRA Plan

**Date Locked:** 2026-04-24
**Parent Decision:** [DEC-003 Deal Pipeline Unification](../decisions/DEC-003-deal-pipeline-unification.md)
**Previous Stage:** [Stage 4 — VISIT_SCHEDULED](./2026-04-24-pipeline-stage-04-visit-scheduled-kra.md)
**Status:** Locked — ready for implementation

## Scope

Lead manager has submitted "Visit Complete." Client physically saw the property. This is a decision point — brief stage that routes the deal based on client reaction. All exits are human-submitted. AI responds silently or hands off based on the outcome.

## Stage Owner

- **Lead Manager:** Submits visit outcome + feedback via pipeline UI
- **AI:** Responds to outcome silently (re-match) or defers to next stage (NEGOTIATION)

---

## Area 1 — Post-Visit AI Actions

| Outcome Submitted | AI Action |
|---|---|
| Property Liked | No automated message — NEGOTIATION stage handles its own opening |
| Want More Properties | AI re-books from existing shortlist → VISIT_SCHEDULED flow restarts |
| Re-match Required | AI silently restarts property card sequence in QUALIFIED — no announcement to customer. Runs full QUALIFIED flow: new property cards → appointment booking |
| No Show | AI sends customer WhatsApp: "We missed you today! Would you like to reschedule?" |

---

## Area 2 — Lead Manager Submission Form

Fields captured when lead manager submits visit outcome:

| Field | Type | Required |
|---|---|---|
| Outcome | Dropdown: Property Liked / Want More Properties / Re-match Required / No Show | Yes |
| Client interest level | Dropdown: Hot / Warm / Cold | Yes |
| Property feedback | Text — what did client say about the property? | Optional |
| Updated requirements | Text — anything new learned (different location, larger BHK, budget change, etc.) | Optional |
| Follow-up notes for AI | Text — any instructions for next steps | Optional |

**Auto-update rule:** If lead manager fills "Updated requirements" in a Re-match Required submission → AI automatically updates the `Contact` record fields + immediately re-runs property match with new data.

---

## Area 3 — Stage-Exit Rules

| Trigger | Next Stage | AI Action |
|---|---|---|
| Lead manager submits "Property Liked" | → `NEGOTIATION` | No automated message |
| Lead manager submits "Want More Properties" | → `VISIT_SCHEDULED` | AI re-books from existing shortlist |
| Lead manager submits "Re-match Required" | → `QUALIFIED` | Auto-update Contact + silently restart property cards |
| Lead manager submits "No Show" | → `VISIT_SCHEDULED` | AI WhatsApps customer to reschedule |
| Deal goes cold | → `ON_HOLD` | Lead manager notified |
| Manual drag | → Allowed | Anyone with permission |

---

## Deferred Items

| # | Item |
|---|---|
| 1 | Additional visit form fields (to be added as business evolves) |
| 2 | Meta template mapping for VISITED stage WhatsApp events |
| 3 | KRA metrics (visit-to-negotiation conversion rate, re-match rate, etc.) |

## Next Stage

Stage 6 — **NEGOTIATION** — client liked a property. AI books office meeting, lead manager drives deal to close.
