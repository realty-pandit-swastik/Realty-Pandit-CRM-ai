-- DEPLOY ORDER (read before shipping): this migration MUST be applied BEFORE the code
-- that selects contacts.client_role / transactions.client_role_override goes live
-- (routes/leads.ts recent-external + sort). The app does NOT auto-migrate on boot, so a
-- code-only deploy 500s the entire leads list with an unknown-column error. Review, backup,
-- and approval required per repo policy; rollback is DROP COLUMN on both tables (data loss
-- limited to the new nullable column).
--
-- Client role (who a contact IS) + per-enquiry override.
--
-- contacts.client_role: primary standing identity — CLIENT | AGENT | BUILDER | FINANCER | CHOKIDAR
--   (extensible). Nullable; historical rows stay NULL (unclassified) — no backfill here.
--   Deliberately separate from contacts.contact_type, which is load-bearing for lead queues,
--   visibility scopes and filters.
-- transactions.client_role_override: temporary role FOR THIS ENQUIRY ONLY (e.g. a chokidar on
--   this particular lead). Wins over contacts.client_role wherever the row is rendered.
--
-- Plain nullable TEXT columns: no enum change, no data rewrite, no index needed (never a
-- WHERE predicate in the current design; only selected and sorted on the leads list).
ALTER TABLE "contacts" ADD COLUMN "client_role" TEXT;
ALTER TABLE "transactions" ADD COLUMN "client_role_override" TEXT;
