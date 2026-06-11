# 2026-05-17 — Website lead phone-normalization fix ("Could Not Load Lead")

**Status:** ✅ SHIPPED 2026-05-17 — Phases 1–3 deployed (`realty-backend`), verified
on prod. Phase 4 (PK backfill) deferred — Phase 3 read-tolerance makes it
unnecessary; the ~10 junk + 5 TEMP_ rows correctly stay 404 by design.

**Verification (prod, 2026-05-17):**
- `GET /api/leads/9873333182` (Hitesh, bare website) → 200 OK (was 404).
- `GET /api/leads/9924223260` (Arpit Mishra, 99acres `+91-` dash) → 200 OK.
- Canonical `+919999992400` → 200, resolves to itself (no regression);
  same lead via bare `9999992400` → resolves to `+919999992400`.
- Genuinely-absent `7611234567` → 404 (not-found path intact).
- Validator unit tests: 24/25 pass (1 pre-existing unrelated `loginSchema`
  failure). New bare/91/+91 → `+91…` normalization + junk-reject tests green.
- GlitchTip: 0 issues in 20 min post-deploy.

**99acres importer — investigated, no fix needed (2026-05-17):** source is
`services/ninety_nine_acres_poller.ts:381` which already `normalizePhone()`s +
rejects invalid. Bad 99acres rows exist ONLY on 2026-04-04 (2) and 2026-04-13
(119) — the two big post-outage intake days; the normalize guard was added
after. Zero bad 99acres rows in the 34 days since; last 7 days 100% canonical.
Not recurring; 121 rows are inert debris already rescued by Phase 3.

**Status (original):** PLAN — awaiting execution approval (ASK MODE)
**Owner:** Claude (exec) / Puneet (approval)
**Trigger:** Website-source lead "Hitesh" (`9873333182`) shows "Could Not Load Lead" in admin Ext. Leads. Concern: Meta ad spend driving website-form traffic into broken leads.

---

## 1. Root cause (confirmed)

`Contact.phone_number` is the **primary key**, canonical format `+91XXXXXXXXXX`
(`prisma/schema.prisma:45`). ~15+ tables FK to it.

- **Write side:** 8 `/public/*` form handlers store the user-typed phone **raw**
  (no `normalizePhone`). A visitor typing `9873333182` is stored with PK
  `9873333182`.
- **Read side:** `GET /api/leads/:phone` runs `resolvePhone()` → `normalizePhone`
  → `+919873333182`, then `findUnique({ phone_number })` (exact PK). Bare-stored
  row never matches → 404 → "Could Not Load Lead"
  (`routes/leads.ts:814-829`, frontend `ExternalLeads.tsx:567-569`).

Meta's own paths (Lead-Form `integrations/facebook.ts:146`, Click-to-WhatsApp
`services/webhook_processor.ts:70`) **already normalize** — safe. The exposure is
Meta traffic → website landing page → buggy `/public/*` forms.

### Affected write endpoints (`routes/public.ts`)

| Endpoint | Line | Uses `validate()`? |
|---|---|---|
| `POST /public/contact` | 395 | yes (`contactSchema`) |
| `POST /public/lead` | 467 | yes (`leadSchema`) |
| `POST /public/lead-requirements` | 558 | yes (`leadRequirementsSchema`) |
| `POST /public/schedule-visit` | 683 | yes (`scheduleVisitSchema`) |
| `POST /public/post-property` | 1062 | yes (`postPropertySchema`) |
| `POST /public/project-enquiry` | 1414 | yes (`leadSchema`) |
| `POST /public/save-property` | 818 | **no** (raw `req.body`) |
| `POST /public/share-property-whatsapp` | 861 | **no** (raw `req.body`) |

`validate()` does `req.body = result.data` (`validators/index.ts:12`) → a Zod
`.transform()` on the `phone` field fixes all 6 validated endpoints at one
chokepoint. The 2 non-validated endpoints need an inline fix.

### Affected read endpoints (`routes/leads.ts`, exact `findUnique`/`where:{phone_number}`)

`:phone` (812), `:phone/score` (683), `:phone/status` (257), `:phone/reassign`
(296), `:phone/mark-lost` (706), `:phone/no-show` (787), `:phone/match` (841),
`:phone/assign` (897), `:phone/session` (945), `:phone/requirements` (964).
All derive `phone` from `resolvePhone(req.params.phone)`.

---

## 2. Strategy

1. **Fix writes** (root cause) so no new bad rows — chokepoint + 2 inline.
2. **Make reads tolerant** (rescues Hitesh + all existing bad rows **without
   mutating primary keys** — lowest risk given 15+ FKs).
3. **Quantify** existing damage (read-only) to decide if Phase 4 backfill is
   warranted.
4. **Backfill** (optional, separate approval) — only if count is material.

Phases 1–3 fully resolve the user-visible problem. Phase 4 is cosmetic
(canonical PKs) and high-risk; deferred behind its own gate.

---

## 3. Detailed changes

### Phase 1 — Quantify (read-only, prod) — DONE 2026-05-17

Ran via SSH (`DATABASE_URL` with `${DB%%\?*}` to strip query params; do **not**
`source .env`). **Results:**

- 1,660 contacts; **133 non-canonical**. **0 from `facebook`/`whatsapp`** →
  Meta paths confirmed safe.
- By bucket:
  - **~119 `+91-XXXXXXXXXX` (dash)** — almost all `99acres`, all created
    `2026-04-13` (one-time bulk import; live 99acres webhook normalizes — not an
    ongoing leak). **Silently 404 on detail open today.**
  - **~10 junk/non-Indian** (`+`, `+995880855`, `+15868395952`, "Meat factory")
    — correctly unreachable; leave.
  - **5 `TEMP_`** placeholders — intentional; `resolvePhone` already passes
    through; leave.
  - **2 bare 10-digit `website`** — Hitesh `9873333182`, A Roy `8076631790` —
    the reported bug + the live `/public` leak.

**Plan impact:** real blast radius ≈ 121 (not 2). Phase 3 must match on
trailing-10-digits (dash format breaks clean `phoneVariants` IN-match).

### Phase 2 — Write fix (root cause)

**2a. Shared phone transform** — `validators/public.validator.ts`:
- Import `normalizePhone` from `../utils/phone`.
- Define a reusable schema:
  ```ts
  const phoneField = z.string().regex(phoneRegex, 'Invalid phone number')
      .transform((v) => normalizePhone(v))
      .refine((v) => /^\+91[6-9]\d{9}$/.test(v), 'Invalid phone number');
  ```
- Replace `phone:` in `contactSchema`, `scheduleVisitSchema`, `postPropertySchema`
  with `phoneField`; in `leadSchema` and `leadRequirementsSchema` use
  `phoneField.optional()`.
- Net effect: every validated handler receives a normalized
  `req.body.phone`; invalid Indian numbers now 400 instead of silently
  storing junk.

**2b. Inline fix** — `routes/public.ts`:
- `/save-property` (~811): `const phone = normalizePhone(req.body.phone || '');`
  then `if (!phone) return res.status(400)...`. Use `phone` for upsert.
- `/share-property-whatsapp` (~853): same treatment.

**2c. GlitchTip** (project rule `feedback_glitchtip_instrumentation.md`): wrap the
two inline handlers' new validation/early-return in `captureRouteError` on the
500 path; confirm no new silent catch. (Validated handlers already covered.)

**Regression note:** `__tests__/validators.test.ts` asserts `contactSchema`
output — update expectations to the normalized value (`+919876543210`).

### Phase 3 — Read resilience (rescues existing bad leads)

**3a.** Add helper in `utils/phone.ts`:
```ts
// returns the actual stored PK for any input format, or null
export async function resolveStoredContactPhone(raw, prisma): Promise<string|null>
```
Implementation (REVISED after Phase 1 — clean `phoneVariants` IN-match does
NOT catch dash-stored `+91-9924223260`):
- `TEMP_` prefix → return as-is (passthrough, unchanged behavior).
- Else compute `last10` = last 10 digits of `raw` stripped to digits.
  If not a 10-digit `[6-9]…` → fall back to exact `normalizePhone` match only.
- Raw SQL trailing-digit match (parameterized, `LIMIT 1`):
  ```sql
  SELECT phone_number FROM contacts
  WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') LIKE '%' || $1
  ORDER BY (phone_number = $2) DESC, length(phone_number) LIMIT 1
  ```
  `$1` = `last10`, `$2` = `normalizePhone(raw)` (prefer exact-canonical row if
  duplicates exist). Returns the **actual stored PK** for dash / bare /
  91-prefixed / `+91` uniformly. `null` → existing 404.
- Index note: column is the PK (already indexed for the `$2` exact tiebreak);
  the `LIKE '%'||last10` scan is over ≤1,660 rows on a single detail-open
  request — acceptable. If it ever matters, add a functional index on
  `right(regexp_replace(phone_number,'[^0-9]','','g'),10)` (separate migration).

**3b.** In `routes/leads.ts`, for each of the 10 `:phone` routes: replace
`const phone = resolvePhone(req.params.phone)` with the awaited
`resolveStoredContactPhone(...)`; if `null`, return the existing 404. All
downstream queries (interactions, score, etc.) then use the **exact stored**
value, so they keep matching even for bad-format rows.

Why not just mutate PKs: `Contact.phone_number` is `@id` referenced by ~15+ FK
tables (interactions, deals, tasks, owners, transactions, leadScore, etc.).
Read-tolerance un-breaks every existing lead with zero data risk.

### Phase 4 — Backfill (OPTIONAL — separate approval gate)

Only if Phase 1 count is material **and** canonical PKs are wanted. Transactional
script: for each bad contact, compute normalized PK; if target free → cascade
update contact + all FK dependents in one tx; if target already exists → merge
(complex — flag for manual review, do not auto-merge). Dry-run first, backup DB,
off-peak. **Not in initial execution scope.**

---

## 4. Verification (per `feedback_verify_before_done.md`)

1. **Hitesh repro:** before screenshot (current error) → after Phase 3 deploy,
   open Hitesh in admin Ext. Leads → detail loads (after screenshot).
2. **Write fix:** submit each public form with bare `98733XXXXX` on staging/prod
   → confirm contact stored as `+9198733XXXXX` and opens in admin.
3. **Invalid input:** submit garbage phone → 400, not a blank-PK row.
4. **No regression:** `npm test` (validators suite green), existing `+91` leads
   still open, 99acres/MagicBricks/Meta leads unaffected.
5. **GlitchTip:** post-deploy digest clean (no new error classes).
6. Browser QA visible (project rule), screenshots saved.

## 5. Rollout order

Phase 1 (read-only) → review count → Phase 2 + Phase 3 together (one deploy,
backend only) → verify → Phase 4 only on explicit separate approval.

## 6. Risk

| Risk | Mitigation |
|---|---|
| Transform rejects valid edge numbers | `refine` mirrors existing `normalizePhone` Indian rule; non-Indian were already unsupported |
| Extra `findFirst` per `:phone` request | indexed PK/variant lookup, ≤3 values, negligible; only on detail open |
| Test fixture breakage | update `validators.test.ts` expectations in same change |
| FK damage | Phases 1–3 mutate **no** data; Phase 4 gated separately |
