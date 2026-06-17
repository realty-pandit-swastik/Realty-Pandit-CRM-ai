---
name: phone normalization at every contact write + tolerant read
description: Contact.phone_number is the PK in +91 E.164; raw-stored phones = un-openable "Could Not Load Lead" leads. Normalize on write, resolve tolerantly on read.
metadata:
  type: feedback
---

`Contact.phone_number` is the PK, canonical `+91XXXXXXXXXX`. Any contact
write without `normalizePhone()` creates a lead that 404s in the admin detail
panel ("Could Not Load Lead"). Reads keyed by `:phone` must resolve via
`resolveStoredContactPhone(raw, prisma)` (trailing-10-digit match) so
historical odd-format rows still open.

**Why:** read path normalizes the lookup key then does an exact PK match — a
bare `9873…` or 99acres `+91-99…` dash row never matches. Found via website
lead "Hitesh"; real blast radius was ~121 (mostly a one-time 99acres dash
import), not 1.

**How to apply:**
- New `/public/*` form → reuse `phoneField` in its zod schema (it
  `.transform(normalizePhone)`); never hand-roll `z.string().regex(phoneRegex)`
  for a phone. Routes without `validate()` normalize inline.
- New `:phone` read route → resolve through `resolveStoredContactPhone`, not
  bare `normalizePhone` + `findUnique`.
- Meta (Lead-Form + CTW), 99acres webhook, WhatsApp, external_leads already
  normalize — don't re-audit those; the leak was only the 8 `/public/*` forms.

Shipped 2026-05-17. Full detail: `docs/precautions/phone-normalization-pattern.md`
+ `docs/plans/2026-05-17-website-phone-normalization-fix.md`. Related:
[[feedback_agent_phone_field]] (Agent model uses `phone` not `phone_number`).
