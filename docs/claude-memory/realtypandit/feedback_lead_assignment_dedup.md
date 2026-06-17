---
name: Lead assignment — never reassign an assigned lead; dedup all ingest paths
description: Round-robin is non-idempotent; an already-assigned contact must never be reassigned on re-ingestion. All ingestion paths must normalize+resolve phone or duplicate rows split a person across team members.
metadata:
  type: feedback
---

Two rules, learned from the "same lead from 2 platforms → different team
member" bug (shipped 2026-05-17):

1. **`assignViaRoundRobin()` / `assignViaManagerRoundRobin()`
   (`services/lead_assignment.ts`) are NON-idempotent** — they advance
   `agent.last_assigned_at` every call, so re-calling for the same person
   yields a *different* agent. NEVER call them for a contact that already has
   `assigned_agent_id`. `ensureDealForLead` was fixed to only round-robin when
   `!assignedAgentId` (the old "portal lead held by manager → RR to employee"
   override was removed — D1). Any new ingestion assignment code must guard the
   same way (99acres poller `if(isNew)`, housing `if(!finalAgentId)`,
   external_leads `!assigned_agent_id` are the correct pattern).

2. **Every ingestion path must `normalizePhone` + `resolveStoredContactPhone`
   before upserting the contact.** A 2nd source storing a different phone
   format (bulk-import `+91-…` dash, bare 10-digit) creates a SECOND contact
   row (PK = phone_number) that is round-robined independently → one person,
   two members. Paths fixed: `/public/*` (earlier), `email_lead_parser.ts`,
   `routes/external_leads.ts`. 99acres/MagicBricks/Housing/Facebook/
   webhook_processor already normalize.

**Contact-merge gotcha:** `contacts(phone_number)` is referenced by **23 FK
columns** across 20+ tables (leads, builder_leads, conversation_sessions,
emails, inventory ×3, lead_property_shortlists, lead_scores, owners,
partner_agents, property_shares, saved_properties, scheduled_visits,
staff_calls, tasks, tasks_followups, transactions ×2, voice_calls,
whatsapp_messages, interactions, appointments). Any contact dedup/merge must
repoint ALL of them (prune the 1:1 unique-risk ones: lead_scores,
conversation_sessions, partner_agents) before `DELETE FROM contacts`, inside a
per-pair transaction. Enumerate via information_schema, don't hand-list.

Detail: `docs/plans/2026-05-17-duplicate-lead-reassignment.md`. Related:
[[feedback_phone_normalization]], [[feedback_visit_models_split]].
