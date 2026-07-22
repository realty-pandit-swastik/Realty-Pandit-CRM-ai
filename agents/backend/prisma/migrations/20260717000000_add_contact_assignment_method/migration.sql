-- CONTACT ASSIGNMENT-METHOD PERSISTENCE (2026-07-17 — Phase 5C)
-- Additive + isolated: one new nullable column on contacts, nothing else touched. Safe to apply
-- BEFORE the code that uses it (old code ignores the extra column). Idempotent, mirrors the style of
-- 20260713000000_partner_teams / 20260716000000_add_targets. No index (low cardinality; the by_method
-- panel scans an already role-scoped active set). No backfill — legacy rows stay NULL ("Unknown (legacy)").

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "assignment_method" TEXT;
