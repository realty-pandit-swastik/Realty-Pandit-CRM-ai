---
name: Team members cannot view/manage their own profile (employee role) — root cause + fix approach
description: ✅ DONE & user-confirmed 2026-05-19. My Profile (name+password+Google editable; phone/portal/email read-only) + self-service email activation, on desktop + PWA. Full history below.
metadata:
  type: project
---

> **STATUS: ✅ COMPLETE — user-confirmed working in the PWA 2026-05-19**
> ("good. i see now"). Employees reach My Profile on desktop + PWA; phone
> locked; Google Calendar/Tasks app links; two-state email activation
> (set mailbox password → Outlook IMAP/SMTP config revealed). All E2E-
> verified. Detail history retained below for context.

**Requested 2026-05-18 (Puneet):** logged-in team members (employee role)
can't see/manage their profile — neither in the PWA nor the website.

**Root cause (investigated, verified in code 2026-05-18):**
1. **Desktop admin SPA**: the "Team" nav item is gated `permission:
   'manage_agents'` (`DashboardLayout.tsx:75`, filtered at :161). Employees
   lack `manage_agents`/`manage_team` (`backend/src/config/permissions.ts:47`
   employee list) → Team nav hidden → the ONLY entry to
   `TeamMemberProfile` (which holds the self cards) is the 👤 button inside
   `TeamManagement` (`TeamManagement.tsx:572`, itself ungated) → unreachable.
   Also `TeamMemberProfile` loads data via `getTeamMemberProfile(id)` →
   `GET /api/team/members/:id` which is `checkPermission('manage_team')`
   (`team.ts:530`) → employee would 403 even if reached.
2. **Mobile PWA**: same `manage_agents` gate on Team nav
   (`mobile/MobileLayout.tsx:51`). Worse: mobile Team view
   `mobile/MobileTeamView.tsx` is a **read-only member list with NO
   self-profile / NO profile editor** (never renders TeamMemberProfile,
   EmailAccountCard, GoogleAccountCard). The MobileLayout "Profile" block
   (:236) is display-only: avatar + name + role badge + theme + logout.
3. **Website**: `website/src/app/agent/*` is the EXTERNAL partner-agent
   (dealer) portal — different user type; internal staff don't profile-manage
   there by design. Not the gap.

**Key enabler:** the self-service endpoints are already employee-accessible
(only `authMiddleware`, NOT permission-gated): `GET /api/team/me` (:54),
`/me/email-config` (:108), `/me/google/connect` (:214), `/me/google-config`
(:236), `PATCH /api/team/me/portal-email`. So the fix is mostly
frontend surfacing + (maybe) one small self profile-data endpoint; the
admin `manage_team` gating need NOT be touched.

**Recommended approach (Option A — confirm before build):** add a
permission-free **"My Profile"** entry to BOTH desktop `DashboardLayout`
and mobile `MobileLayout` nav → a self-only profile view that reuses the
existing `/api/team/me*` endpoints and renders Portal Email + EmailAccountCard
(T9b) + GoogleAccountCard (P1) [[reference_member_email_config]]
[[project_google_reminder_sync]]. Desktop: new `view:'my-profile'` in
App.tsx. Mobile: new self-profile screen (the editor doesn't exist there
yet). Avoid the `manage_team`-gated `/members/:id` for the self view (use
`/api/team/me`, add fields if needed). Do NOT loosen the admin endpoints.

Open scoping Qs for user: which fields a member may self-edit (name/phone/
department are currently admin-managed via `manage_team`); confirm both
desktop + PWA in scope.

**✅ SHIPPED 2026-05-18** (scope: self-service + edit own name/phone, both
surfaces). Backend `PATCH /api/team/me/profile` (auth-only, phone `+91`
normalize + Contact SSOT upsert mirrored from admin path); `department`
added to `GET /api/team/me`. Frontend `components/MyProfile.tsx`
(responsive) reused by desktop App.tsx + mobile (MobileScrollWrapper);
nav item `{id:'my-profile', permission:null}` added to BOTH
`DashboardLayout` & `MobileLayout` Team section; mobile bottom Profile
block now taps → my-profile. Reuses `/auth/change-password` (already
auth-only). API E2E PASSED with a real employee-role JWT (no admin perm,
Contact synced, reverted). GlitchTip clean. Existing self endpoints
(`/me`, `/me/email-config`, `/me/google-config`, `/me/portal-email`) were
already employee-OK so admin gating untouched. Plan:
`docs/plans/2026-05-18-member-self-profile.md`.

**2026-05-19 refinement (Puneet):** phone is NOT self-editable — it's the
account identity (phone login + WhatsApp OTP reset). `PATCH
/api/team/me/profile` is now **name-only**; `phone` in body is silently
ignored server-side (verified via employee token: bogus phone → 200, phone
unchanged). Frontend phone is read-only ("locked — contact an admin").
Contact-SSOT upsert removed from the self route (phone immutable there);
admin `/members/:id` still changes phone + syncs Contact. Also answered:
Google OAuth = effectively permanent (consent screen "In production" so no
7-day expiry; Calendar/Tasks scopes so no password-change revoke; access
tokens auto-refresh; only dies on user-revoke / 6-mo idle / security reset
→ P4 `handleDeadToken` clears + pushes `google_disconnected` reconnect
nudge). Remaining: human click-test as employee on desktop + PWA.

**2026-05-19 round 2 (Puneet PWA feedback):**
- "Phone still editable" = **stale PWA service-worker cache**, NOT a bug
  (deployed bundle was correct). Fix: bump `frontend/index.html` version
  comment per `docs/runbooks/pwa-cache-bust.md` on every frontend deploy
  reaching installed apps (done v20260519b). Users must fully close+reopen
  the PWA once.
- Added Google Calendar + Google Tasks **Play Store / App Store** links
  (Android + iPhone) to `GoogleAccountCard`.
- Final edit scope: employee edits **name, password, Google connect** only;
  phone + portal email + email config **read-only**.
- **Mail server (authoritative — verified prod Postfix/Dovecot 2026-05-19):**
  self-hosted; Postfix myhostname + MX `mail.realtypandit.in`; Dovecot
  IMAPS **993** (ssl required)/143; Postfix submission **587** STARTTLS;
  25 inbound; POP3 110/995 up. Same for ALL @realtypandit.in mailboxes.
  App has NO IMAP feature itself (T9b = CRM-outgoing-SMTP only). MyProfile
  now shows a **read-only "set up in Outlook" panel** (constant `MAIL` in
  `MyProfile.tsx`: host mail.realtypandit.in, imap 993 SSL, smtp 587
  STARTTLS, username=email) + removed the editable `EmailAccountCard` from
  the employee view (screenshot's Outlook.com preset was a wrong self-set
  value). `EmailAccountCard` gained an unused `readOnly` prop; still
  editable in admin TeamMemberProfile path.
- **Operational note (flagged to user):** members need their **mailbox
  password** for Outlook. Set at provisioning ("Create Member & Provision
  Email" credentials modal); existing members who don't know it need an
  **admin reset**. NO self-service mailbox-password reset exists; CRM
  "Change Password" is the LOGIN password (different credential). Possible
  follow-up.

**2026-05-19 round 3 — self-service email activation (SHIPPED & E2E,
resolves the above gap):** `Agent.email_mailbox_activated` flag (+prod
ALTER, in GET /me). `POST /api/team/me/mailbox-password` (auth-only):
allow-list pw `^[A-Za-z0-9!@#%^*()_\-+=.:?]{8,64}$` (blocks shell/sed
injection — emailProvisioner shells `sed`), **lowercases** the address
(all mailboxes are lowercase-keyed; agent.email is mixed-case), calls
`emailProvisioner.provision()` (idempotent create-or-update; NOT
`updatePassword()` which no-ops if the dovecot line is missing → false
activation), sets flag. `MyProfile` mailbox card two-state: not-activated
→ "activate, set password" form; activated → Outlook IMAP/SMTP config +
"Change mailbox password". Username displayed lowercased. Dovecot =
passwd-file `/etc/dovecot/users` `email:{PLAIN}pw` (33 entries, lowercase),
maildir `/var/mail/vhosts/%d/%n`. E2E with Beenu (had NO mailbox):
injection→400, valid→200 created Dovecot+Maildir+vmailbox+flag, then
**fully restored**. Plan doc has full detail. KEY GOTCHA:
`emailProvisioner.updatePassword()` only `sed`-replaces an existing line —
use `provision()` for guaranteed activation; and always lowercase the
mailbox address before touching Postfix/Dovecot.
