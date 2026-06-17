---
name: reference_contact_rekey_cascade
description: All 23 FKs on contacts.phone_number are ON UPDATE CASCADE — re-keying a contact is a single UPDATE that cascades; only a MERGE (target PK already exists) needs manual child repoint
metadata:
  type: reference
---

`contacts.phone_number` is the contact PK, referenced by **23 FK columns — ALL `ON UPDATE CASCADE`** (verified via `information_schema` 2026-06-06): `appointments.contact_id`, `builder_leads.contact_phone`, `conversation_sessions.phone_number`, `emails.phone_number`, `interactions.phone_number`, `inventory.{owner_contact_id, owner_phone, key_holder_contact_id}`, `lead_property_shortlists.contact_phone`, `lead_scores.phone_number`, `leads.contact_phone`, `owners.contact_phone`, `partner_agents.phone_number`, `property_shares.client_phone`, `saved_properties.contact_id`, `scheduled_visits.contact_id`, `staff_calls.phone_number`, `tasks.contact_phone`, `tasks_followups.phone_number`, `transactions.{supply_contact_id, demand_contact_id}`, `voice_calls.phone_number`, `whatsapp_messages.phone_number`.

**Changing a contact's phone (re-key):**
- **Re-key (target PK does NOT exist):** just `UPDATE contacts SET phone_number=$new WHERE phone_number=$old` — Postgres **cascades to all 23 child tables automatically**, no manual repoint. (This refines [[feedback_lead_assignment_dedup]], whose "repoint all 23 FKs" rule applies to the MERGE case below.)
- **Merge (target PK already exists):** cascade can't help (PK collision). Move children per table `UPDATE "<child>" SET "<col>"=$new WHERE "<col>"=$old`, and on a unique-constraint collision (1:1 tables like `lead_scores`) `DELETE` the old row instead; then `DELETE FROM contacts WHERE phone_number=$old`.
- Always `pg_dump` first ([[reference_prod_db_backup]]); run via the working-DB-url discovery + Node/Prisma from the backend dir ([[reference_prod_db_script_pattern]]); single SSH connection ([[feedback_hostinger_ssh_rate_block]]).

Used 2026-06-06 to canonicalize **110 malformed contact keys** (106 re-key, 2 merge, 2 → `PENDING-` placeholder; backup `/root/contacts_premigration_20260606_135836.sql`). See [[feedback_phone_dialable_guard]].
