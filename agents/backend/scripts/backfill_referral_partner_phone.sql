-- Backfill: canonical referral_partner_phone from the authoritative PartnerAgent record.
--
-- Why: partner-referral leads stored referral_partner_phone RAW (bare 10-digit, no +91, sometimes with
-- spaces) → the "Call partner" link dialed a wrong number. PartnerAgent.phone_number is canonical (+91…),
-- linked via referral_partner_id. This copies the canonical value onto contacts + leads. Going forward,
-- routes/leads.ts now stores the canonical value at write time (referralPartnerPhoneStored).
--
-- Safety: run AFTER a DB backup. Wrapped in a transaction. Only touches rows that have a
-- referral_partner_id AND currently differ from the canonical value. Reversible from the backup.
--
-- Usage (prod):
--   pg_dump ... > backup_before_partner_phone_backfill.sql   # backup first
--   psql "$DATABASE_URL" -f backfill_referral_partner_phone.sql

\echo '=== BEFORE: rows that will change ==='
SELECT 'contacts' AS tbl, count(*) AS to_update
FROM contacts c JOIN partner_agents p ON p.id = c.referral_partner_id
WHERE c.referral_partner_id IS NOT NULL
  AND c.referral_partner_phone IS DISTINCT FROM p.phone_number
UNION ALL
SELECT 'leads', count(*)
FROM leads l JOIN partner_agents p ON p.id = l.referral_partner_id
WHERE l.referral_partner_id IS NOT NULL
  AND l.referral_partner_phone IS DISTINCT FROM p.phone_number;

BEGIN;

UPDATE contacts c
SET referral_partner_phone = p.phone_number
FROM partner_agents p
WHERE c.referral_partner_id = p.id
  AND c.referral_partner_id IS NOT NULL
  AND c.referral_partner_phone IS DISTINCT FROM p.phone_number;

UPDATE leads l
SET referral_partner_phone = p.phone_number
FROM partner_agents p
WHERE l.referral_partner_id = p.id
  AND l.referral_partner_id IS NOT NULL
  AND l.referral_partner_phone IS DISTINCT FROM p.phone_number;

COMMIT;

\echo '=== AFTER: remaining mismatches (should be 0) ==='
SELECT 'contacts' AS tbl, count(*) AS still_mismatched
FROM contacts c JOIN partner_agents p ON p.id = c.referral_partner_id
WHERE c.referral_partner_id IS NOT NULL
  AND c.referral_partner_phone IS DISTINCT FROM p.phone_number
UNION ALL
SELECT 'leads', count(*)
FROM leads l JOIN partner_agents p ON p.id = l.referral_partner_id
WHERE l.referral_partner_id IS NOT NULL
  AND l.referral_partner_phone IS DISTINCT FROM p.phone_number;
