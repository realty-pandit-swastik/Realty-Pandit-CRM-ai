-- Additive only. Review and back up before applying to production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;
DO $guard$
DECLARE expected_cluster TEXT; approval_expires TIMESTAMPTZ;
BEGIN
  IF current_database() = 'reality_pandit' THEN
    expected_cluster := current_setting('rp.contact_expected_cluster', true);
    approval_expires := current_setting('rp.contact_approval_expires_at', true)::timestamptz;
    IF expected_cluster IS NULL OR expected_cluster <> (SELECT system_identifier::text FROM pg_catalog.pg_control_system())
       OR approval_expires IS NULL OR approval_expires <= clock_timestamp() OR approval_expires > clock_timestamp() + interval '15 minutes'
       OR current_setting('rp.contact_migration_approved', true) IS DISTINCT FROM '20261026093000_property_contact_designations' THEN
      RAISE EXCEPTION 'Reviewed session approval and exact cluster identity are required';
    END IF;
  ELSIF current_database() !~ '^rp_contact_rehearsal_[0-9]{14}_[a-f0-9]{6}$' THEN
    RAISE EXCEPTION 'Refusing unrecognized migration database';
  END IF;
  IF NOT pg_try_advisory_xact_lock(119731, 1) THEN
    RAISE EXCEPTION 'Another guarded contact change is running';
  END IF;
END $guard$;
ALTER TABLE public."contacts" ADD COLUMN "client_role_label" TEXT, ADD COLUMN "source_label" TEXT;
ALTER TABLE public."inventory"
  ADD COLUMN "key_holder_role" TEXT,
  ADD COLUMN "key_holder_role_label" TEXT,
  ADD COLUMN "property_contact_role" TEXT,
  ADD COLUMN "property_contact_role_label" TEXT;
ALTER TABLE public."transactions" ADD COLUMN "source_label" TEXT;
-- No guessed backfill: same-person key holders resolve their property role at read time.
COMMIT;
