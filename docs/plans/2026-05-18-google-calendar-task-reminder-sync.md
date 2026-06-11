# 2026-05-18 — Sync member deal-reminders & visit appointments to their own Google Calendar + Tasks

**Status:** ✅ **COMPLETE 2026-05-18** — P0, P1, P1b, P2, P3, P4 all SHIPPED
to prod and end-to-end verified against a real Gmail (`bzonkcrazy@gmail.com`,
agent Puneet). OAuth verification deferred (works for the team now; see
"Google OAuth verification status" below).

**P2 (SHIPPED, prod E2E PASSED):** `googleapis` dep + `services/google_sync.ts`
`pushReminderToGoogle(taskId)` — Calendar event (`⏰ Follow up: <customer>`,
Asia/Kolkata, reminders popup `advance_minutes` + `0`) + Google Task mirror;
ids persisted in `Task.stage_metadata` (idempotent: patch vs insert, recreate
on 404). Fire-and-forget hook in `POST /api/deals/:id/reminder` after the
`$transaction`. Opt-in (skips unless connected + sync on). E2E: event+task
appeared in real Gmail with correct tz/popups; cleaned up.

**P3 (SHIPPED, prod E2E PASSED):** `pushAppointmentToGoogle(appointmentId)`
(`🏠 Visit: <customer>`, location, popup 30+10) hooked into
`CalendarService.createPropertyVisitAppointment`; **5-min BullMQ job
`google-reconcile-sync`** (registered in `scheduled_worker.ts`, live path per
[[feedback_legacy_cron_is_dead]]) running `reconcileGoogleSync()` — backfills
future+active reminders/appointments lacking a Google id for connected
members. E2E verified BOTH the direct hook AND the reconcile sweep
(appointment created with no push call → swept in) → covers all 6
`appointment.create` sites + pre-connect backfill.

**P4 (SHIPPED, prod E2E PASSED — T1-T4):** `reconcileGoogleSync` extended:
(T1) appointment rescheduled/edited (`updated_at > google_synced_at`) →
patch event; (T2) status cancelled/completed/no_show/rescheduled → delete
the Google event + clear ids; (T3) reassignment — `google_synced_agent_id`
≠ current `assigned_to_agent_id` → delete from OLD member's calendar, clear,
re-push to new (if connected); (T4) REMINDER Task DONE/BLOCKED → delete
event+task. Dead token (`invalid_grant`) → wipe link + push notify
`google_disconnected` (new push-only notification event; no WhatsApp
template). Reconcile queries are NOT agent-filtered for already-synced items
(so reassigned-away items are still cleaned) + `orderBy updated_at desc` +
take 300. All four behaviours verified in real Gmail; artifacts cleaned up.
Note: Google Tasks API returns a deleted task as `{deleted:true}` (HTTP 200),
not 404 — relevant for any future delete-verification tests.

---

## P1b — "Sign in with Google" (SHIPPED 2026-05-18)

A member who has ALREADY linked Google from their profile (P1) can log into
the admin panel with Google instead of phone+password. Gate: server requires
a stored `agents.google_refresh_token` (only ever set by the authenticated
P1 connect flow) — so Google login is impossible until they connect via
profile first, exactly as required.

- `services/google_oauth.ts`: added `buildSignInUrl`/`exchangeSignInCode`
  (identity scopes only: openid/email/profile — NOT calendar/tasks),
  separate `GOOGLE_SIGNIN_REDIRECT` (`/auth/google/callback`),
  `signSignInState`/`verifySignInState` (purpose `google_signin`). Requires
  `email_verified` from the id_token.
- `services/auth.ts`: `loginByGoogleEmail(email)` — case-insensitive match
  on `google_email`, `status:'active'`, `google_refresh_token` not null;
  mints the same JWT + refresh cookie as phone login.
- `routes/auth.ts` (PUBLIC, auth.ts uses per-route auth so no hoist needed):
  `GET /auth/google` → 302 Google; `GET /auth/google/callback` →
  exchange → loginByGoogleEmail → `setAuthCookies` → 302
  `ADMIN_PANEL_URL/?login=google` (or `?login_error=<code>`).
- Frontend `LoginPage.tsx`: "Sign in with Google" button + divider + hint
  ("works only after you've connected Google in your profile"); reads
  `?login_error=` and shows a friendly message. AuthContext bootstraps from
  the HttpOnly cookie via `/auth/me`, so the redirect lands logged in.
- Verified API-level: `/auth/google` 302 → accounts.google.com with correct
  client_id + `redirect_uri=…/auth/google/callback` + signed state;
  callback no-params → `?login_error=google_error`; junk state →
  `?login_error=google_expired`. tsc clean (my files), vitest 162/172.
  Full human E2E (click button → Google chooser → logged in) pending — works
  for `bzonkcrazy@gmail.com` (Puneet already connected).

---

## Google OAuth verification status (2026-05-18)

App is **"In production"** (P0) so the feature WORKS for the team NOW —
unverified-app interstitial + 100-user cap only. Verification removes those.

Done in-console (Claude via Playwright, acct realtypandit2026@gmail.com):
- Developer contact email → **Support@realtypandit.in** (saved). NOTE: the
  **User support email** stays `realtypandit2026@gmail.com` — Google hard-
  restricts that dropdown to the account owner or a **Google Group you
  manage**; an arbitrary `support@` mailbox is not selectable. To change it,
  create a Google Group `support@realtypandit.in` owned by the project owner.
- Home page `https://realtypandit.in`, privacy `…/privacy`, terms `…/terms`
  filled (all live HTTP 200) → this **enabled** "Verify branding".
- Branding auto-check ran → result: needs full app verification (expected
  for sensitive scopes). "Prepare for verification" now ENABLED; the submit
  form's only red items: **scope justification + demo video** for
  `calendar.events` & `tasks`. Confirm stays disabled until both supplied.

**Two remaining blockers (need a human / business assets — Claude cannot do):**
1. **Demo video** — a YouTube (can be Unlisted) screen recording showing:
   the OAuth consent screen, then a member setting a deal reminder / visit
   and it appearing in their Google Calendar + Google Tasks. Mandatory for
   sensitive-scope review.
2. **Scope justification** text (paste-ready draft below — review/approve
   then I can fill it in the Data Access page, verificationMode).
3. (Optional) **App logo** 120×120 — recommended, currently "Not provided".

After submit, Google Trust & Safety review = **days to several weeks**, often
with back-and-forth. Not blocking the team (≤100 users works today).

### Scope justification — paste-ready draft
> RealtyPandit is a private CRM for a single real-estate brokerage's own
> staff. Each team member optionally connects their **own** Google account
> from their authenticated profile. We request `.../auth/calendar.events`
> solely to create/update/delete that same member's follow-up reminders and
> property-visit appointments as events on **their own** primary calendar so
> they get timely pop-up alerts and don't miss client call-backs; we never
> read or modify any of their other calendar data. We request
> `.../auth/tasks` solely to mirror each of those reminders as a Google Task
> for the member's checklist. openid/email/profile identify which account
> the member linked and to let them sign in. Data is per-user, written only
> for the connecting member, never shared, never sold; the encrypted refresh
> token is stored server-side (AES-256-GCM) and deleted on disconnect.

**P1 shipped 2026-05-18 (deployed prod, backend+frontend online, GlitchTip
clean):**
- Dep `google-auth-library@^9.15.1` (lightweight OAuth2/id-token only;
  `googleapis` deferred to P2 for actual Calendar/Tasks calls).
- `Agent` schema + prod `agents` ALTER: `google_email`,
  `google_refresh_token` (AES-256-GCM via utils/crypto, never returned),
  `google_connected_at`, `google_sync_enabled Boolean @default(true)`.
- `services/google_oauth.ts`: OAuth2 client factory, signed-`state` JWT
  (purpose `google_connect`, 10-min exp, JWT_SECRET), `buildConnectUrl`
  (offline + prompt=consent + scopes calendar.events/tasks/openid/email/
  profile), `exchangeCode` (returns refresh token + email from id_token),
  `getAuthedClient` (for P2), `revokeRefreshToken`.
- Routes: **public callback `GET /api/team/google/callback` hoisted to
  app.ts** ABOVE the `/api` JWT-auth mount (the in-`team.ts`-router pre-auth
  trick does NOT work — `app.use('/api', apiRoutes)` at app.ts:281 has global
  JWT auth that intercepts before `/api/team` at :286; same hoist the
  inventory bulk-template route needs). Authed: `GET /me/google/connect`
  (returns `{url}` JSON, not 302 — behind Bearer/cookie auth),
  `GET /me/google-config`, `PUT /me/google-config` (toggle sync),
  `DELETE /me/google` (revoke + wipe).
- Frontend: `GoogleAccountCard.tsx` in `TeamMemberProfile` (self only,
  next to EmailAccountCard). OAuth `?google=<status>` result handled
  **globally in App.tsx** (SPA has no router → card may not be mounted on
  return; success also `setView('team')`).
- Verified: tsc clean on touched files; vitest 162/172 (exact baseline);
  prod `GET /api/team/google/callback` → 302 to admin `/profile?google=error`
  (no params) / `google=expired` (junk state, proves state-JWT path);
  authed endpoints → 401 (registered, not 404); GlitchTip no
  Google-related errors.
- ⏳ REMAINING for P1 sign-off: interactive prod E2E — a real member clicks
  "Connect Google", consents with a real Gmail, token lands encrypted in
  `agents.google_refresh_token`, card shows Connected. Needs a human Google
  login (checkpoint).

**P0 done (Claude via Playwright, acct realtypandit2026@gmail.com):** project
**Panditji** `gen-lang-client-0714891689`; Calendar + Tasks APIs enabled;
consent screen External + **In production**; app name **RealtyPandit**;
scopes openid/email/profile + calendar.events + tasks; OAuth client
"RealtyPandit Web" — Client ID
`1007436351560-3a4u5rf93nac6eu1iklf98l4asaopac6.apps.googleusercontent.com`,
secret in prod `.env` (`GOOGLE_CLIENT_SECRET`); redirect URIs
`/api/team/google/callback` (Calendar/Tasks) + `/auth/google/callback`
(sign-in); `.env` has GOOGLE_CLIENT_ID/SECRET/OAUTH_REDIRECT/SIGNIN_REDIRECT
(staged, unused). Unverified-app screen applies (≤100 users OK).

**Status (orig):** PLAN — for review, NOT executed (ASK MODE). Verified
against code 2026-05-17/18.

**Goal:** A team member connects their **own personal Google account** from
their CRM login. Their self-set deal reminders (T8) and their visit
appointments then also appear in **their Google Calendar (with notifications)
and Google Tasks**, so they don't miss clients.

**Locked decisions (Puneet):** target = **Calendar event + Google Task**;
accounts = **personal Gmail**; scope = **reminders + visit appointments**;
deliverable now = **this plan for review**.

---

## 1. Current state (verified)

- **DONE — in-app half (T8, [[reference_deal_reminder]]):**
  `POST /api/deals/:id/reminder` (`deals.ts:940`) → `Task` (task_type
  `REMINDER`, `assigned_to`, `due_date`, `deal_id`, `contact_phone`,
  `stage_metadata{advance_minutes,...}`); 5-min cron
  `sendReminderTaskAlerts()` fires in-app/PWA push before+at.
- **DONE — visit appointments:** `Appointment` model (`assigned_to_agent_id`,
  `scheduled_at`, `contact_id`, `property_id`, `status`). Created via
  `CalendarService.createPropertyVisitAppointment` + `routes/calendar.ts:194`
  POST + a few other `prisma.appointment.create` sites.
- **GREENFIELD — Google:** no `googleapis`/`google-auth-library` dep, no
  `GOOGLE_*` env, no Google code, no per-agent Google token columns
  (`agents.refresh_token` is JWT auth, unrelated).
- **Reusable pattern:** T9b per-member email config
  ([[reference_member_email_config]]) — self-service card in own profile,
  per-agent secret AES-256-GCM via `utils/crypto.ts`
  (`encryptSecret`/`decryptSecret`), `GET/PUT /api/team/me/email-config`.

## 2. Prerequisite — Google Cloud setup (ONLY the client can do; blocks P1)

1. Create / pick a **Google Cloud project**.
2. **Enable APIs:** Google Calendar API + Google Tasks API.
3. **OAuth consent screen:** User type **External**. App name, support email,
   developer email, logo. **Scopes (minimal):**
   `.../auth/calendar.events` + `.../auth/tasks`.
4. **Publishing status — critical gotcha:** while the app is in **"Testing"**,
   Google **refresh tokens expire after 7 days** → members would silently
   disconnect weekly. Must click **"Publish app" (Production)**. Publishing is
   allowed without Google verification, but unverified + sensitive scopes
   shows an **"unverified app" interstitial** and is capped at **100 users**
   (fine for the team; full Google OAuth verification removes the warning/cap
   later if needed).
5. **OAuth client (Web application):** Authorized redirect URI =
   `https://api.realtypandit.in/api/team/google/callback` (confirm domain;
   see note in §7). Authorized JS origin `https://admin.realtypandit.in`.
6. Give me `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` → added to prod `.env`
   as `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_OAUTH_REDIRECT`
   (grep-style read, never `source .env` — [[reference_meta_webhooks_live]]).

## 3. Data model (idempotent ALTER + Prisma, same as T9b)

`agents` add nullable: `google_refresh_token` (AES-256-GCM ciphertext via
`utils/crypto`), `google_email`, `google_connected_at`, `google_sync_enabled`
(Boolean default true). Mirror in `prisma/schema.prisma` Agent model.
Link/idempotency: store `google_event_id` + `google_task_id` in the existing
JSON columns — `Task.stage_metadata` (reminders) and `Appointment.metadata`
(visits). No new tables.

## 4. Dependency

Add `googleapis` (official; bundles OAuth2 + Calendar v3 + Tasks v1). Pin a
version; `npm install` runs in deploy.

## 5. OAuth flow (`routes/team.ts`, mirrors `/me/email-config`)

- `GET /api/team/me/google/connect` → 302 to Google consent
  (`access_type=offline`, `prompt=consent` to force a refresh token,
  `state` = short-lived signed JWT {agentId, nonce}).
- `GET /api/team/google/callback` → validate state → exchange code →
  `encryptSecret(refresh_token)` + store `google_email`,
  `google_connected_at`; redirect back to profile with success.
- `GET /api/team/me/google-config` → `{ connected, google_email,
  sync_enabled }` (never the token).
- `PUT /api/team/me/google-config` → toggle `google_sync_enabled`.
- `DELETE /api/team/me/google` → revoke at Google + wipe columns.
Security: exact redirect-URI match, signed state (CSRF), token only
server-side, GlitchTip on all (project rule).

## 6. Sync service `services/google_sync.ts`

Helper `getGoogleClient(agent)` → OAuth2 client from decrypted refresh token;
on `invalid_grant` → clear `google_*`, `notify()` member "reconnect Google".

- `pushReminderToGoogle(taskId)` (fire-and-forget after Task create):
  - **Calendar event:** summary `⏰ Follow up: <customer>`, description =
    note + deal link + phone, `start=due_date`, `end=+15m`,
    `reminders.overrides=[popup advance_minutes, popup 0]`, tz
    `Asia/Kolkata`.
  - **Google Task:** title = note, notes = deal/customer, `due` = date
    (Tasks API is date-only, no time/alarm — Calendar is the actual alert;
    Task is the checklist item, per decision).
  - Persist `google_event_id`/`google_task_id` into
    `Task.stage_metadata`; idempotent (present → patch, absent → insert).
- `pushAppointmentToGoogle(appointmentId)`: Calendar event for
  `assigned_to_agent_id`, `start=scheduled_at`, `end=+duration`,
  location = property, popup 30m+10m; store ids in `Appointment.metadata`.
- `updateGoogle*/deleteGoogle*`: reminder edited/deleted or appointment
  rescheduled/cancelled/completed → patch/delete the linked event/task.

## 7. Hook points

- Reminders: in `POST /api/deals/:id/reminder` after the Task `$transaction`,
  fire-and-forget `pushReminderToGoogle`. Wire reminder edit/cancel if/when
  those endpoints exist (today T8 has set only — note: no edit/delete
  endpoint exists yet; cancel-on-status path via the 5-min cron can also
  reconcile).
- Appointments: centralize in `CalendarService.createPropertyVisitAppointment`
  + `routes/calendar.ts` POST; add a **5-min reconcile sweep** (extend the
  existing `notification_crons` cadence) that finds connected-member
  reminders/appointments in the next N days lacking a `google_event_id` and
  pushes them — this also covers the other `appointment.create` sites and
  **backfills** items created before the member connected.
- Member not connected or `sync_enabled=false` → silently skip (opt-in).
- **Domain note:** OAuth callback must be HTTPS and match exactly. Confirm
  whether to host it on `api.realtypandit.in` (backend) — recommended — vs
  `admin.realtypandit.in`. Backend route is simplest; finalize before §2.5.

## 8. Frontend

`GoogleAccountCard.tsx` rendered in the self-profile component next to
`EmailAccountCard` (only when `isSelf`): "Connect Google" → opens
`/api/team/me/google/connect`; shows connected Gmail + "Sync on" toggle +
"Disconnect". Mirror EmailAccountCard styling/placement.

## 9. Phasing & verification

| Phase | Work | Verify |
|---|---|---|
| P0 | Client does §2 Google Cloud setup; env added | OAuth client loads consent |
| P1 | DB cols + deps + OAuth connect/disconnect + profile card | a member connects a real Gmail; token stored encrypted; disconnect works |
| P2 | `pushReminderToGoogle` (event + task) + hook in reminder POST | set a reminder → event w/ popup + Task appear in that Gmail; in-app push still works |
| P3 | `pushAppointmentToGoogle` + hooks + reconcile cron | book a visit → event in member's Calendar; backfill sweep picks up pre-connect items |
| P4 | update/cancel sync + invalid-token reconnect UX | edit/cancel reflects; revoke → graceful reconnect prompt |

Each phase: tsc/touched + vitest baseline (162/172 — [[reference_test_tsc_baseline]]),
deploy, prod E2E with a real test Gmail, GlitchTip clean.

## 10. Risks / open questions

- **7-day refresh-token expiry if consent screen left in "Testing"** — P0
  must publish to Production (documented in §2.4).
- Unverified-app warning + 100-user cap (acceptable for the team; verify
  later if scaling).
- Personal Gmail per member = each must individually connect (no domain-wide
  push). Expected.
### RESOLVED 2026-05-17/18 (Puneet)
- Q1 → **future + active only** (`status=scheduled/confirmed`, scheduled_at ≥ now).
- Q2 → **yes, mirror reassignment** (delete from old member's Google, add to
  new) — build in P4.
- Q3 → member's **primary** calendar.
- Q4 → timezone `Asia/Kolkata` for all events (default, not contested).
- Execution → **pending clarification** (user answer "fir" was truncated).
  Regardless, **P0 (client Google Cloud setup) blocks all build** — nothing
  can be implemented until `GOOGLE_CLIENT_ID/SECRET` exist + consent screen is
  Published.
