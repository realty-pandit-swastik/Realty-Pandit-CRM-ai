# Live CRM testing

Production API origin: `https://api.realtypandit.in` (same backend as the web CRM).

The Android staff app uses the existing staff phone number and password. Super administrators, managers and employees retain server-side tenant, ownership and team permissions. Partner and builder native sign-in is not part of this release.

Use Inventory → All tenant inventory to browse the records your account may access. My/team narrows the list. Inventory edits, uploads, visits and sharing use the same production records as the web CRM. A successful provider submission does not confirm delivery; personal WhatsApp opens a user-confirmed handoff.

The sideload APK embeds the live HTTPS origin and its JavaScript bundle; it does not require Metro. It is a test-distribution build, not a Play Store publication. No production account is seeded and no credentials are shipped.

## Deployment gates

Use the protected Deploy to Hostinger workflow. For the first mobile release dispatch with `run_migrations=true`; the workflow first backs up the database/uploads and restores into an isolated database, rehearses pending reviewed SQL, checks record counts and restores/verifies the uploads archive. The release refuses pending migrations without fresh proof bound to the currently active revision and exact SQL.

The mobile migration creates only `mobile_sessions` and its indexes/agent foreign key. Existing tables/data remain unchanged. A code rollback may leave this additive table in place; never drop it or restore over production automatically. Revoke native sessions if the mobile release must be withdrawn.

## Release verification

Check the active revision, both PM2 owners, nginx targets, DB/Redis, worker queues, website/admin/API health, mobile login validation and unauthenticated session protection. An authenticated inventory comparison requires the account holder to sign in; do not create/reset a real staff password for testing. No real customer calls or messages are deployment smoke tests.

Deployment status and actual checks will be recorded after the production workflow finishes. Remaining native/web parity is tracked in [PARITY.md](PARITY.md); this release does not certify every web administration screen or partner/builder workflow.
