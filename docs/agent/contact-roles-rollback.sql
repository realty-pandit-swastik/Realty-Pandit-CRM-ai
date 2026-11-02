-- MANUAL ONLY. Drops newly captured labels/designations. Export these columns first.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;
DO $guard$
BEGIN
  IF current_database() !~ '^rp_contact_rehearsal_[0-9]{14}_[a-f0-9]{6}$' THEN
    RAISE EXCEPTION 'Automatic schema downgrade is rehearsal-only; retain production nullable columns';
  END IF;
  IF NOT pg_try_advisory_xact_lock(119731, 1) THEN RAISE EXCEPTION 'Another guarded contact change is running'; END IF;
  IF EXISTS (SELECT 1 FROM public.contacts WHERE client_role_label IS NOT NULL OR source_label IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.inventory WHERE key_holder_role IS NOT NULL OR key_holder_role_label IS NOT NULL OR property_contact_role IS NOT NULL OR property_contact_role_label IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.transactions WHERE source_label IS NOT NULL) THEN
    RAISE EXCEPTION 'Rollback would discard newly captured data; export and review it instead';
  END IF;
END $guard$;
ALTER TABLE public."transactions" DROP COLUMN "source_label";
ALTER TABLE public."inventory" DROP COLUMN "key_holder_role", DROP COLUMN "key_holder_role_label",
  DROP COLUMN "property_contact_role", DROP COLUMN "property_contact_role_label";
ALTER TABLE public."contacts" DROP COLUMN "client_role_label", DROP COLUMN "source_label";
COMMIT;
