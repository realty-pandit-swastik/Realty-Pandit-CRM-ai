# Inventory tile contact information

Status: implemented locally; not deployed.

## Behavior

- Desktop and mobile tiles show the main source's designation, key holder and designation,
  and separate Call/WhatsApp links for each person's permitted phone.
- Saved `Contact.client_role` values use the existing human-readable role labels. Agent/Owner/
  External fallbacks describe records without a saved designation; no designation is fabricated.
- Owner/uploader key-holder types resolve that person's current name and phone. Old external
  key-holder fields do not override a later type change. External holders use their saved fields
  or linked contact. Hydration happens before existing staff redaction.
- Last contacted is the latest recorded message, call, call initiation, human call outcome,
  website form or project enquiry associated with a visible owner/uploader/key-holder/source
  phone. This is contact-level activity, not proof that the conversation concerned this listing.
  Indian phone variants share the existing normalization rules. Internal audit events and page
  views are excluded. Browser Call/WhatsApp navigation itself does not record an interaction.
- Next action is the earliest open property task (`TODO`, `IN_PROGRESS`, `BLOCKED`, not completed)
  or future scheduled/confirmed/rescheduled property appointment. Overdue tasks remain visible.
- Dates include the year. Missing values read “Not recorded” or “Not scheduled”.
- Three batched, tenant-scoped activity queries serve each nonempty page; there are no
  per-listing activity queries. Task tenancy is checked through the linked property.

## Verification

- Focused helper/source/list-API/owner-update regressions pass, including role resolution,
  stale key-holder fields, staff redaction, empty pages, overdue tasks and batch query counts.
- CRM TypeScript/Vite production build passes. Scoped ESLint: zero errors, 127 warnings.
- Backend TypeScript comparison against the unchanged base: 400 diagnostics on each side,
  zero added diagnostics.
- Full backend run: 689 tests passed, 3 skipped; the image suite's Windows cleanup hook failed
  with `EPERM`. The stale-key-holder regression was added and run separately afterward.
- Real-browser local-fixture checks at desktop and 390px mobile verified role/date text,
  canonical paired links, 24px contact-action targets, keyboard focus and redacted/empty states.
  No real calls or WhatsApp messages were sent; production/database-backed validation is pending.
- `graphify update .` could not run because Graphify is not installed/on PATH in this shell.

No schema migration or new dependency is needed.
