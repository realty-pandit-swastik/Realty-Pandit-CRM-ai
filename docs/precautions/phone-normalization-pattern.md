# Precaution — phone normalization at every contact write/read

`Contact.phone_number` is the **primary key**, canonical `+91XXXXXXXXXX`
(`prisma/schema.prisma:45`), referenced by ~15+ FK tables. Two rules:

## 1. Never write a contact phone without `normalizePhone()`

Any path that creates/upserts a `Contact` (or writes `contact_id` /
`contact_phone` / `phone_number` FKs) **must** pass the phone through
`normalizePhone()` from `utils/phone.ts` first. A raw-stored phone (bare
10-digit, `+91-` dash, `91…`) becomes an **un-openable lead** — the admin
detail panel shows "Could Not Load Lead" because the read path normalizes the
lookup key and an exact PK match misses.

- Public website forms: phone is normalized at the **validator chokepoint**
  (`validators/public.validator.ts` → `phoneField` with `.transform(normalizePhone).refine(...)`).
  `validate()` writes `result.data` back to `req.body`, so every handler using
  a schema with `phoneField` is covered. Routes **without** `validate()`
  (`/public/save-property`, `/public/share-property-whatsapp`) normalize inline.
- New `/public/*` form route → reuse `phoneField` in its schema, or it WILL
  reintroduce this bug. Don't hand-roll `z.string().regex(phoneRegex)` for a
  phone again.

## 2. Reads keyed by a `:phone` param must tolerate any stored format

Historical/imported rows (e.g. the one-time 2026-04-13 99acres bulk import:
~119 rows stored `+91-99…` with a dash) won't match a clean
`normalizePhone`/`phoneVariants` lookup. Use
`resolveStoredContactPhone(raw, prisma)` (`utils/phone.ts`) — trailing-10-digit
match that returns the **actual stored PK**, preferring the canonical row on
duplicates, `TEMP_` passthrough preserved. `routes/leads.ts` `resolvePhone()`
already delegates to it; any new `:phone` route should resolve through it
instead of a bare `normalizePhone` + `findUnique`.

## Audit commands

```bash
# write paths that upsert/create a contact without normalizing
grep -rn "contact\.\(upsert\|create\)" src/routes src/integrations src/services \
  | grep -v normalizePhone
# bad-format rows on prod (read-only)
psql "$DB" -c "SELECT source,count(*) FROM contacts \
  WHERE phone_number !~ '^\+91[6-9][0-9]{9}$' GROUP BY 1 ORDER BY 2 DESC;"
```

History: shipped 2026-05-17, see
[`docs/plans/2026-05-17-website-phone-normalization-fix.md`](../plans/2026-05-17-website-phone-normalization-fix.md).
Meta (Lead-Form + CTW), 99acres webhook, WhatsApp, external_leads already
normalize — the live leak was only the 8 `/public/*` forms.
