# 2026-05-18 — "My Profile" self-service for team members (employee role)

**Status:** ✅ SHIPPED 2026-05-18 (backend API-E2E verified; frontend
deployed, GlitchTip clean). Scope locked with Puneet: self-service + edit
own name/phone, both desktop + PWA.

**Shipped:**
- Backend `PATCH /api/team/me/profile` (auth-only, no admin perm) — name +
  phone, phone normalized `+91`, Contact SSOT upsert mirrored from
  `/members/:id`. `department` added to `GET /api/team/me`. API E2E PASSED:
  an `employee`-role JWT (Beenu Chauhan) updated name+phone via the live
  endpoint (HTTP 200, no admin permission), Contact `+91…982` synced
  (`source:self_profile_update`), then reverted + stray contact cleaned.
- Frontend `components/MyProfile.tsx` (responsive `isMobile`): edit
  name/phone; Portal Email (`/me/portal-email`); Change Password
  (`POST /auth/change-password`); `<EmailAccountCard>` (T9b) +
  `<GoogleAccountCard>` (P1); read-only email/role/department/status.
- Nav: `DashboardLayout` + `MobileLayout` "Team" section now has
  `{ id:'my-profile', permission:null }` (visible to ALL roles incl.
  employee); App.tsx desktop + mobile switch `case 'my-profile'`; mobile
  bottom Profile block made tappable → `my-profile`.
- No admin gating/endpoints changed. tsc clean (touched), vitest 162/172.
- **2026-05-19 update (Puneet): phone is NOT self-editable.** Phone is the
  account identity (phone login + WhatsApp OTP reset + Panditji
  recognition). `PATCH /api/team/me/profile` now accepts **name only**;
  any `phone` in the body is ignored server-side (verified: employee PATCH
  with `phone:9999999999` → 200, phone unchanged). Frontend shows phone
  read-only ("locked — contact an admin to change"). Admin can still change
  it via `PATCH /members/:id`. Contact-SSOT upsert dropped from the self
  route (phone immutable there). Name remains self-editable; portal email +
  password + Email/Google cards unchanged.
- ✅ **User-confirmed working in the PWA 2026-05-19** ("good. i see now").
  My Profile reachable by employees on desktop + PWA; phone locked; Google
  app links; two-state email activation all verified by Puneet on a real
  employee account. Feature COMPLETE.

**2026-05-19 round 2 (shipped):**
- PWA showed old UI = stale service-worker cache (deployed code was
  correct). Bumped `index.html` SW stamp (v20260519b) per pwa-cache-bust
  runbook; redeployed. Installed apps must be fully closed+reopened once.
- `GoogleAccountCard`: added Google Calendar + Google Tasks **Play Store /
  App Store** links (Android + iPhone).
- Final scope: employee edits **name, password, Google connect** only.
  Portal email → read-only; editable `EmailAccountCard` removed from the
  employee view.
- New **read-only "Your Email Mailbox (set up in Outlook)"** panel in
  MyProfile with the AUTHORITATIVE self-hosted settings (verified from prod
  Postfix/Dovecot): host `mail.realtypandit.in`, IMAP **993 SSL**
  (incoming), SMTP **587 STARTTLS** (outgoing), username = member email.
  Server already supports send+receive — gap was only that members didn't
  know the settings. Constant `MAIL` in `MyProfile.tsx`.
- **Open operational gap:** members need their **mailbox password** (≠ CRM
  login password). Set at provisioning; existing members who don't know it
  currently need an admin reset — no self-service mailbox-password reset
  exists. Flagged to user as a possible follow-up.

**2026-05-19 round 3 — self-service email activation (SHIPPED & E2E):**
User wants new/un-set members to see *"activate your email — first set your
password"*, then reveal the Outlook config once set.
- `Agent.email_mailbox_activated Boolean @default(false)` + idempotent prod
  ALTER; returned by `GET /api/team/me`.
- `POST /api/team/me/mailbox-password` (auth-only): **allow-list** password
  `^[A-Za-z0-9!@#%^*()_\-+=.:?]{8,64}$` (blocks shell/sed-special incl.
  `| \ / & " ' $ \``), **lowercases** the address (mail server keys all
  mailboxes lowercase; `agent.email` can be mixed-case), calls
  `emailProvisioner.provision()` (idempotent — creates Maildir + Postfix
  vmailbox + Dovecot passwd-file entry if missing, else updates pw) — NOT
  `updatePassword()` which silently no-ops when no line exists (→ false
  activation). Sets `email_mailbox_activated=true`. Returns `{mailbox}`.
- `MyProfile.tsx`: mailbox panel is two-state on `email_mailbox_activated`
  — not set → "Activate your email account, first set your mailbox
  password" form; set → Outlook IMAP/SMTP config + "Change mailbox
  password". Username shown is **lowercased** (`mailboxAddr`) to match the
  real mailbox key.
- Dovecot reality (verified): `passwd-file` driver,
  `args = scheme=PLAIN /etc/dovecot/users`, 33 entries `email:{PLAIN}pw`,
  all lowercase local-parts; `mail_location maildir:/var/mail/vhosts/%d/%n`.
- E2E (employee token, Beenu — who had NO mailbox): injection `abc|rm`
  → 400; short → 400; valid → 200 `{mailbox:beenu.chauhan@…}`; verified
  Dovecot line + Maildir + vmailbox **created** + flag true; then **fully
  restored** (removed all 3 + postmap/reload + maildir rm + flag→false).
  tsc/vitest 162/172 clean; GlitchTip clean. SW bumped v20260519d.
- This resolves the earlier "mailbox password" operational gap: members
  self-activate; no admin reset needed. (Admin Team-Management email path
  unchanged.)

## Problem (investigated, verified in code)
Employees have no way to reach their own profile. Team nav gated
`manage_agents` (`DashboardLayout.tsx:75`, `MobileLayout.tsx:51`); employees
lack it (`permissions.ts:47`). `TeamMemberProfile` loads from
`GET /api/team/members/:id` which is `manage_team`-gated (`team.ts:530`).
Mobile `MobileTeamView` has NO profile editor at all. Self `/api/team/me*`
endpoints are already employee-accessible (auth-only).
See [[project_member_self_profile_gap]].

## Backend
1. **`PATCH /api/team/me/profile`** (team.ts `/me` group, `authMiddleware`
   only — NO permission gate). Body `{ name?, phone? }`. Mirror admin
   `PATCH /members/:id` normalization: `phone` → `+91`-prefix unless `+`;
   trim name. Update `prisma.agent.update({ where:{ id: req.agent.id }})`.
   Mirror the **Contact SSOT upsert** (MANAGEMENT) on phone change. Return
   `{id,name,email,phone,role,department,status,personal_email}`.
2. Add `department` to the `GET /api/team/me` select (read-only display).
3. Reuse existing `POST /auth/change-password` (already auth-only) — no new
   password endpoint.

## Frontend
- New **`MyProfile.tsx`** (responsive `isMobile?`): GET `/api/team/me`;
  edit name+phone → PATCH `/me/profile`; Portal Email → existing
  `PATCH /me/portal-email`; Change Password → existing
  `POST /auth/change-password`; render `<EmailAccountCard>` (T9b) +
  `<GoogleAccountCard>` (P1); read-only email/role/department/status.
- Desktop: `DashboardLayout` nav item `{id:'my-profile', permission:null}`;
  `App.tsx` desktop switch `case 'my-profile' → <MyProfile/>`.
- Mobile: `MobileLayout` nav item `{id:'my-profile', permission:null}` +
  make the existing display-only Profile block tap → `setView('my-profile')`;
  `App.tsx` mobile switch `case 'my-profile' → <MobileScrollWrapper><MyProfile
  isMobile/></MobileScrollWrapper>`.
- No change to admin gating or admin endpoints.

## Verify (per phase)
tsc (touched) + vitest baseline 162/172; deploy backend+frontend; API E2E
of `PATCH /me/profile` (name/phone + Contact sync) via script; human
click-test on desktop + PWA as an employee; GlitchTip clean.

## Phases
| P | Work | Verify |
|---|---|---|
| B1 | backend `/me/profile` + `/me` department | tsc/vitest; API E2E script (update name/phone, Contact synced, no perm needed) |
| F1 | `MyProfile.tsx` + desktop nav/switch | tsc; deploy; desktop loads as self |
| F2 | mobile nav/switch + tappable profile block | tsc; deploy; PWA loads as self |
| V | prod E2E + GlitchTip + memory/plan update | employee sees & edits profile both surfaces |
