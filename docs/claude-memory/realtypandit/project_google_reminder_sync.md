---
name: Feature — sync member deal-reminders to their own Google Calendar/Tasks
description: Requested feature; in-app half (T8) already shipped; the Google-OAuth half is greenfield. Plan + open decisions.
metadata:
  type: project
---

**Requested 2026-05-17 (Puneet):** team members set self reminders/tasks on
their pipeline deals (callback, send greeting, etc.); they connect their OWN
Google account from their login and the reminder also lands in their Google
Calendar / Google Tasks so they don't miss clients.

**✅ 2026-05-18 — WhatsApp reminder shipped (the user's concrete ask).** New
`deal_reminder_due` notification event (push **+ WhatsApp**, body =
customer name/📞phone/📝note + due time) + the reminder sweep
(`sendReminderTaskAlerts`) was exported and registered as a real BullMQ
repeatable job `reminder-task-alerts` (every 5 min) in `scheduled_worker.ts`
— because the old T8 cron only lived in the dead legacy path and had NEVER
fired in prod ([[feedback_legacy_cron_is_dead]], [[reference_deal_reminder]]).
Verified live on prod. The Google Calendar/Tasks OAuth sync below is the
remaining (still greenfield) part.

**Half already done = T8 self-scheduled deal reminders (see
[[reference_deal_reminder]]):** `POST /api/deals/:id/reminder` →
`Task(task_type='REMINDER', assigned_to, due_date, deal_id, contact_phone,
stage_metadata{advance_minutes,...})`; `notification_crons.ts
sendReminderTaskAlerts()` 5-min cron fires `notify('task_due_reminder')`
(in-app/PWA push) advance + at-due. UI `deal/ReminderModal.tsx`.

**Missing half = Google sync — fully greenfield (verified 2026-05-17):** NO
`googleapis`/`google-auth-library` dep (only `@google/generative-ai` +
Maps geocode), NO `GOOGLE_*`/OAuth env, NO Google Calendar/Tasks code, NO
per-agent Google token columns. `agents.refresh_token` is the JWT auth token,
NOT Google.

**Pattern to reuse:** T9b per-member email config
([[reference_member_email_config]]) — self-service card in
`TeamMemberProfile.tsx` when `isSelf`, per-agent secret AES-256-GCM via
`utils/crypto.ts`, `GET/PUT /api/team/me/...-config`. Mirror this for Google
but with OAuth2 (store encrypted **refresh_token**, not a password).

**Recommended architecture:** Google Cloud OAuth2 client (client must provide
a Google Cloud project) → `GET /api/team/me/google/connect` consent →
`/google/callback` stores enc refresh_token+google_email on Agent → on
`/deals/:id/reminder` (and/or the 5-min cron) also create a **Google Calendar
event** at remind_at with popup reminder overrides (advance + at);
store google_event_id in Task.stage_metadata for update/cancel sync.
Google **Tasks** API has no time-of-day/notification → Calendar is the real
fix; Tasks optional/extra.

**Open decisions (asked Puneet 2026-05-17):** Calendar vs Tasks vs both; do
they have a Google Cloud project + is the team on Google Workspace (domain-
wide, no consent-screen friction) or personal Gmail (needs published/verified
consent screen or test-users, 100-user cap); scope = reminders only or also
sync internal Appointments/visits to Google. Decisions locked 2026-05-17: Calendar event + Google Task; personal Gmail;
reminders + visit appointments. ALSO requested: Google Sign-In for team
members (same OAuth client, openid/email/profile scopes).
Detailed plan: `docs/plans/2026-05-18-google-calendar-task-reminder-sync.md`.

**✅ P1 SHIPPED 2026-05-18 (deployed prod, backend+frontend online,
GlitchTip clean of Google errors).** OAuth connect/disconnect + per-member
profile card. Key gotcha discovered & fixed: the **public OAuth callback
must be registered at app.ts level ABOVE `app.use('/api', apiRoutes)`
(app.ts:281)** — that mount has global JWT auth that intercepts
`/api/team/google/callback` before the `/api/team` router (:286), so the
in-`team.ts` pre-`router.use(authMiddleware)` placement returned 401 (not
the redirect). Same hoist the inventory bulk-template route uses (app.ts
~:268, comment "Public team endpoints"). Admin SPA has **no URL router**
(view = useState, defaults 'dashboard') → OAuth `?google=<status>` result
is handled **globally in App.tsx** (toast + setView('team')), not in the
card (card may be unmounted on return). Dep = `google-auth-library` only
(P1); `googleapis` deferred to P2. Verified API-level (302/401/state-JWT).
See [[reference_public_route_hoist_pattern]].

**✅ P1 prod E2E PASSED 2026-05-18:** agent **Puneet Bhardwaj**
(`puneet.bhardwaj@realtypandit.in`) connected Google `bzonkcrazy@gmail.com`
via the live "Connect Google" button. `agents.google_refresh_token` =
196-char base64 ciphertext, `decryptSecret` round-trips to a 103-char Google
refresh token (encrypted at rest AND usable for P2). `sync_enabled=true`.
The "Google hasn't verified this app" interstitial appeared as expected
(sensitive scopes, unverified, ≤100-user cap) — user clicked Advanced→continue.
**P1 fully shipped.** Follow-ups requested: (a) change OAuth consent
support/developer email `realtypandit2026@gmail.com` → `Support@realtypandit.in`;
(b) submit the app for Google OAuth verification to remove the warning + cap
(needs privacy-policy URL, domain verification, demo video, scope
justification — multi-day Google-side review, not instantly completable).

**✅ P1b SHIPPED 2026-05-18 (API-verified, deployed):** "Sign in with
Google" on the admin LoginPage. Gate = server requires a stored
`agents.google_refresh_token` (`AuthService.loginByGoogleEmail`, case-
insensitive `google_email`, active) — so Google login is impossible until
the member connects Google from their profile first (exactly the user's
requirement). `routes/auth.ts` public `GET /auth/google` +
`/auth/google/callback` (auth.ts uses per-route auth → no app.ts hoist
needed, unlike /api/team — see [[reference_public_route_hoist_pattern]]);
identity scopes only + separate `GOOGLE_SIGNIN_REDIRECT`. setAuthCookies →
SPA bootstraps via /auth/me. **✅ P1b human E2E PASSED 2026-05-18:** Puneet
clicked "Sign in with Google" in a real browser → `[Auth] Google sign-in OK
for agent d39a05ab… (bzonkcrazy@gmail.com)`, `last_login_at` bumped to
13:43:21Z. Identity-only scopes (no unverified-app screen). Gate verified
(logged in only because google_refresh_token was set via prior profile
connect). P1 + P1b fully done; next build = P2 (reminders→Calendar/Task).

**✅ P2+P3+P4 SHIPPED & prod-E2E-verified 2026-05-18 (real Gmail).** Full
Google Calendar/Tasks sync now live: `services/google_sync.ts`
(`pushReminderToGoogle`, `pushAppointmentToGoogle`, `reconcileGoogleSync`),
`googleapis` dep, hooks in `POST /api/deals/:id/reminder` &
`CalendarService.createPropertyVisitAppointment`, BullMQ 5-min
`google-reconcile-sync` job in `scheduled_worker.ts`. P4: reschedule→patch,
cancel/complete→delete, reassign→move old→new, reminder-DONE→delete, dead
token→wipe+push `google_disconnected`. Reconcile is per-item-gated (NOT
agent-filtered for synced items) so reassigned-away items still clean up;
`orderBy updated_at desc` + take 300. Gotcha learned: Google **Tasks** API
returns a deleted task as `{deleted:true}` HTTP 200 (not 404) — assert on
that in delete tests. Idempotency ids in `Task.stage_metadata` /
`Appointment.metadata` (+`google_synced_agent_id`,`google_synced_at`). The
whole plan (`docs/plans/2026-05-18-google-calendar-task-reminder-sync.md`) is
now COMPLETE.

**Google OAuth verification (2026-05-18, Claude via Playwright):**
- ✅ Dev contact email → Support@realtypandit.in. ⚠️ User-support-email
  dropdown is Google-locked to owner/Google-Group only (can't be arbitrary
  support@ — would need a Google Group).
- ✅ Filled home/privacy/terms (realtypandit.in /privacy /terms, all 200) →
  enabled "Verify branding"; branding auto-check → needs full verification.
- ❌ Submit blocked on **demo video (YouTube)** + **scope justification**
  for calendar.events & tasks (Confirm disabled until both). Claude CANNOT
  produce the video. Paste-ready justification draft + full state in
  `docs/plans/2026-05-18-google-calendar-task-reminder-sync.md`. App is
  "In production" so it WORKS for the team now (unverified screen + 100-user
  cap only); verification is polish/scale, days–weeks of Google review.

**✅ P0 Google Cloud setup DONE 2026-05-18 (Claude via Playwright, acct
realtypandit2026@gmail.com):**
- Project: **Panditji** `gen-lang-client-0714891689` (existing Gemini project, reused).
- APIs enabled: Google Calendar API (was already on) + Google Tasks API.
- OAuth consent (Google Auth Platform): User type **External**, Publishing
  status **In production** (NOT testing → refresh tokens don't expire in 7d),
  app name **RealtyPandit**, support+dev email realtypandit2026@gmail.com.
- Scopes registered: `openid`, `userinfo.email`, `userinfo.profile`
  (non-sensitive), `calendar.events`, `tasks` (sensitive → unverified-app
  screen, 100-user cap; acceptable for team).
- OAuth client "RealtyPandit Web" (Web application):
  - Client ID: `1007436351560-3a4u5rf93nac6eu1iklf98l4asaopac6.apps.googleusercontent.com`
  - Client secret: stored in prod `.env` only (NOT here) — 35 chars, key
    `GOOGLE_CLIENT_SECRET`.
  - JS origins: `https://admin.realtypandit.in`, `https://api.realtypandit.in`
  - Redirect URIs: `https://api.realtypandit.in/api/team/google/callback`
    (Calendar/Tasks connect), `https://api.realtypandit.in/auth/google/callback`
    (team Google Sign-In). Editable later if backend paths differ.
- prod `/var/www/realty-pandit/backend/.env` has `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT`, `GOOGLE_SIGNIN_REDIRECT`
  (staged; no code consumes them yet). Build (P1+) is now UNBLOCKED.
- Unverified-app caveat: users see the "Google hasn't verified this app" →
  Advanced → continue screen; fine ≤100 users. Submit for verification later
  to remove it if scaling.
