# Pipeline Stage 6 — NEGOTIATION — KRA Plan

**Date Locked:** 2026-04-24
**Parent Decision:** [DEC-003 Deal Pipeline Unification](../decisions/DEC-003-deal-pipeline-unification.md)
**Previous Stage:** [Stage 5 — VISITED](./2026-04-24-pipeline-stage-05-visited-kra.md)
**Status:** Locked — ready for implementation

## Scope

Client liked a property and is ready to negotiate. All parties — buyer, seller/owner, and Realty Pandit lead manager — must meet to agree on price and terms. Lead manager drives; AI coordinates entry, monitors inactivity, and handles closing messages.

## Stage Owner

- **Lead Manager / Super Admin:** Drives negotiation, arranges meeting, submits outcome
- **AI:** Entry message, availability collection from customer, 48hr inactivity nudge, closing WhatsApps

---

## Area 1 — On Entry to NEGOTIATION

| Event | Action |
|---|---|
| Deal enters NEGOTIATION | AI WhatsApps customer: "Great news! Our team will contact you shortly to discuss the next steps." |
| No meeting booked within 48 hours | AI sends customer WhatsApp: "We're arranging your meeting, our team will confirm shortly" + WhatsApp lead manager: "Meeting not yet booked for [customer name]. Please schedule." |
| All other communication | Lead manager owns directly — AI does not interfere |

---

## Area 2 — Meeting Coordination

| Action | Owner |
|---|---|
| Ask customer for meeting availability | AI (WhatsApp: "When would you be available to visit our office for a discussion?") |
| Contact property owner for availability | Lead Manager directly |
| Confirm final meeting slot for all parties | Lead Manager |
| Send meeting confirmation to customer | Lead Manager |

---

## Area 3 — Deal Outcome Submission

### CLOSED_WON
- **Who:** Lead manager OR super admin
- **Fields captured:**
  - Final agreed price
  - Commission amount
  - Commission split (if partner involved)
  - Closing date
  - Notes
- **System action:** `DealCloseCommissionDialog` fires for commission entry

### CLOSED_LOST
- **Who:** Lead manager OR super admin
- **Reasons captured:** Price mismatch / Buyer backed out / Owner backed out / Financing failed / Other

### Inactivity Rule
- **14 days** with no negotiation progress → deal moves to `ON_HOLD` + AI WhatsApps lead manager: "No negotiation progress in 14 days. Please follow up or close."

---

## Area 4 — Stage-Exit Rules

| Trigger | Next Stage | AI Action |
|---|---|---|
| CLOSED_WON submitted | → `CLOSED_WON` | AI WhatsApps customer: "Congratulations! We're excited to complete this journey with you. Our team will be in touch for next steps." |
| CLOSED_LOST submitted | → `CLOSED_LOST` | AI WhatsApps customer: "Thank you for your time. If you're ever looking again, we're here to help." |
| 14 days no progress | → `ON_HOLD` | AI WhatsApps lead manager to follow up or close |
| Customer backs out, wants more properties | → `QUALIFIED` | AI restarts property sharing |
| Manual drag | → Lead manager / super admin only | Drag restricted — NEGOTIATION is sensitive |

---

## Deferred Items

| # | Item |
|---|---|
| 1 | Meta template mapping for all NEGOTIATION WhatsApp events |
| 2 | Commission split rules for PARTNER_INTERNAL and PARTNER_PARTNER scenarios |
| 3 | Legal/documentation checklist post-CLOSED_WON |
| 4 | KRA metrics (negotiation-to-close rate, average time in NEGOTIATION, etc.) |
| 5 | Post-closure follow-up flow (referral ask, review request, etc.) |
