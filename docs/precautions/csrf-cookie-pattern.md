The admin CRM was completely broken for every state-mutating action. User reported: can't save lead, can't match properties, Google Maps search "not working."

**Root cause:** CSRF cookie was set without a `domain` attribute. Browser scoped it to `api.realtypandit.in` only. JS on `admin.realtypandit.in` could not read it, so X-CSRF-Token header was always empty. Every POST returned 403 "CSRF validation failed."

**Why:** Original auth cookie code assumed same-origin. Admin and API are different subdomains of realtypandit.in.

**How to apply:** When setting cookies for a multi-subdomain SPA, always use `domain: '.realtypandit.in'` (with leading dot). Also use `sameSite: 'lax'` not `'strict'` so cookies flow on cross-origin XHR within the same site. Same rule for any future healthcare PWA split across subdomains.

## Files fixed

- `agents/backend/src/middleware/auth.ts` — `setAuthCookies` + `clearAuthCookies` now set `domain: '.realtypandit.in'` and `sameSite: 'lax'`. Also clears legacy no-domain cookies to avoid overlap.
- `agents/backend/src/middleware/csrf.ts` — `setCsrfCookie` same fix.

## Related issues fixed in same session

### GlitchTip DSN rejected by Sentry SDK
Sentry `@sentry/core` regex `\w+` doesn't accept UUID public keys with hyphens. Fix: strip hyphens in the DSN. GlitchTip accepts both hyphenless and hyphenated UUIDs for lookup.
Files: all 4 `.env.production` DSN lines.

### Lead save Prisma runtime cache bug
After adding `owning_manager_id` column via migration `20260417000000_partner_ownership`, the server's PM2-managed Prisma Client in memory rejected the new field with "Unknown argument `owning_manager_id`" — even after pm2 kill + resurrect + manual prisma generate + Prisma upgrade to 5.22.0. Standalone Node test of Prisma Client shows field works. Root cause never identified (possibly systemd/pm2 holding module cache at a level I couldn't clear from SSH).
**Workaround (in `routes/leads.ts`):** Create the Contact without `owning_manager_id` + `created_by`, then backfill both via `$executeRaw UPDATE`. Safe because the DB columns exist (migration applied). Permanent — works regardless of Prisma client cache state.

### CSRF middleware and /auth/csrf
`/auth/csrf` is protected by `authMiddleware` — fine because browsers get CSRF cookie at login time (`/auth/login` is in csrfExempt list). Not a bug; just confusing.

## Verification

Tested all three endpoints after fix:
- `POST /api/chat/start` (buyer chat) → 200 ✓
- `POST /api/leads` (save lead) → 201 ✓
- `POST /api/leads/:phone/match` (matching) → 200 with 10 matches ✓
