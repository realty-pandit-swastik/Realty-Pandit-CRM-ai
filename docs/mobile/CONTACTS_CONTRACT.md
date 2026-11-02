# Contacts and conversation contract — next native increment

Source discovery on 2026-10-16, branch `feat/mobile-apps`, HEAD `fb2afd7ad5dc0375b90eb35ebf778175a1c2ee27`, with the existing dirty mobile/backend work preserved. Covers PARITY M012–M014. This document prepares implementation; it neither implements those rows nor proves security, runtime, device or release acceptance. No tests, database, providers, Metro, ADB or native builds were run for this discovery.

Read with [PARITY.md](PARITY.md), [ARCHITECTURE.md](ARCHITECTURE.md), [API_CHANGES.md](API_CHANGES.md), [SECURITY.md](SECURITY.md), and the mobile playbook/plan. Graphify query was used first, followed by actual routes, callers, middleware, schema, migrations and existing tests. Source citations below are relative to this document.

## Scope and real callers

The CRM has two related surfaces:

- **Contacts directory:** `ContactsPage` loads paginated directory rows, opens an overview/edit drawer, loads the owner's listings, and embeds read-only WhatsApp history. Both desktop and PWA render the same component. [ContactsPage.tsx](../../agents/frontend/src/components/ContactsPage.tsx), [client.ts](../../agents/frontend/src/api/client.ts).
- **Chats:** `App` loads the old unpaginated contacts array, selects a contact, loads the full interaction array, and exposes type classification through `ChatView`/`MobileChatView`. These views show other channels too. `getContacts` also feeds `MainDashboard` and `LeadIntelligenceDashboard`; changing its legacy shape breaks more than Contacts. [App.tsx](../../agents/frontend/src/App.tsx), [ChatView.tsx](../../agents/frontend/src/components/ChatView.tsx), [MobileChatView.tsx](../../agents/frontend/src/components/mobile/MobileChatView.tsx).

`WhatsAppChatTab` is shared by Contacts, External Leads and DealWorkspace. It filters `(channel || '').toLowerCase() === 'whatsapp'`, orders oldest first, groups IST days and distinguishes Customer from Panditji / Team. It labels non-message event types and renders `[no text]` for empty content. It is read-only: this contract supplies no compose/send or delivery confirmation. `ExternalLeads` also calls profile update for phone re-keying and consumes `new_phone`. [WhatsAppChatTab.tsx](../../agents/frontend/src/components/WhatsAppChatTab.tsx), [ExternalLeads.tsx](../../agents/frontend/src/components/ExternalLeads.tsx), [DealWorkspace.tsx](../../agents/frontend/src/components/deal/DealWorkspace.tsx).

Build the new native increment only in `agents/mobile/`, with real backend reads/writes and existing transport/session/query patterns. Do not reuse `agents/android`, embed CRM pages, invent business counts or present a provider handoff as delivery.

## Identity, role and record scope

`app.ts` mounts `routes/api.ts` under `/api` with the API limiter. That router applies `authMiddleware` globally. Authentication prefers the browser cookie, then bearer; native uses explicit bearer and no cookies. `AuthService.verifyToken` accepts only `super_boss`, `manager`, `employee`, `partner` access identities, rejects refresh/builder credentials, and native access additionally checks the current device session/account/tenant. Native session creation and the native `Identity` parser currently support **only super_boss, manager and employee**. [app.ts](../../agents/backend/src/app.ts), [auth.ts](../../agents/backend/src/middleware/auth.ts), [auth service](../../agents/backend/src/services/auth.ts), [mobile_session.ts](../../agents/backend/src/services/mobile_session.ts), [native contracts](../../agents/mobile/src/api/contracts.ts).

**Partner is not currently a permitted Contacts role.** None of `/api/contacts`, directory, interactions, classification or profile is in `PARTNER_ALLOWLIST`; all are denied before the handler. CRM `PARTNER_VIEWS` also excludes Contacts/Chats and skips the contacts fetch. Partner-owned lead routes are a separate contract. Builder credentials belong to a separate auth domain and cannot use staff API access. Native partner/builder authentication remains not ready. The matrix's broad “staff / permitted partner” label is not evidence that partner Contacts access exists.

Directory and legacy list use `tenant_id = actor.tenant_id` plus `buildFullContactVisibilityFilter`:

| Staff role | Contact visibility in those lists |
| --- | --- |
| super_boss | All contacts **inside their tenant** |
| manager | Assigned to or created by self/direct reports; explicitly shared with self; contact has a demand transaction coordinated/executed by self/direct reports |
| employee | Assigned to or created by self; explicitly shared with self; contact has a demand transaction coordinated/executed by self |

The full helper additionally admits a managed partner's contact phone when `created_by` is null. This is a narrow phone condition, not every contact created by that partner. Manager scope is direct reports, not recursive hierarchy. `Contact.owning_manager_id` exists but is not consulted by this list helper. Do not substitute `isContactVisibleTo`: its current implementation differs (including sharing coverage). [contact_visibility.ts](../../agents/backend/src/middleware/contact_visibility.ts).

Profile/history handlers currently have different, narrower assignment checks and missing tenant checks; see prerequisites below. Permission strings alone cannot determine actions: `edit_contact` exists for super_boss/manager/partner, not employee, yet the profile handler applies no permission gate and explicitly permits an employee's assigned contact. Do not hide employee parity merely by checking that string, or expand writes to every visible record by assuming list visibility implies edit authority. Preserve the current assigned-employee use case while establishing one tested server policy for the intended actions. [permissions.ts](../../agents/backend/src/config/permissions.ts).

## Existing HTTP contracts

These are current source shapes, including limits and defects; proposed fixes are listed separately. Encode the **stored** `phone_number` in paths. Contact phone is the global primary key, not a per-tenant composite key or an independent numeric id.

### Directory — `GET /api/contacts/directory`

Query:

- `page`: `parseInt(String(value)) || 1`, minimum 1.
- `limit`: default 25, bounded 1–50.
- `type`: optional exact ContactType string. No explicit allow-list validation before Prisma; malformed enum input can return 500.
- `search`: trimmed; case-insensitive name contains OR phone contains all digits extracted by `replace(/\D/g, '')`. It does not search email, manager or listings. Search narrowing is AND-composed with visibility, retaining its OR.

Response: `{ data: DirectoryContact[], total: number, page: number, totalPages: number, type_counts: Record<string, number> }`.

| Row field | Actual shape and meaning |
| --- | --- |
| `phone_number` | string, stored primary identity; may be legacy formatted or a placeholder |
| `name`, `email` | nullable strings; email uses `c.email || null` |
| `contact_type` | BUYER, TENANT, LANDLORD, PARTNER_AGENT, REAL_ESTATE_BUILDER, MANAGEMENT, UNKNOWN; fallback UNKNOWN |
| `manager` | nullable assigned agent **name only**, not owning-manager object or necessarily a manager role |
| `last_interaction` | date serialized as string; falls back to `updated_at` |
| `inventory_count` | number of listings with `owner_phone` equal to the exact stored phone; currently an unscoped aggregation, see below |
| `demand` | null or `{ intent: string|null, budget_min: number|null, budget_max: number|null, location: string|null }`; budget Decimals converted with `Number` |
| `is_partner` | boolean, whether type is PARTNER_AGENT; describes the contact, not the signed-in identity |

Demand exists for any intent, non-null budget bound or preferred location, independent of type; an owner/buyer can display both listings and demand. Contact budgets are rupees (see source-backed budget correction in `docs/PROJECT_STATUS.md`); do not introduce a new lakh conversion. Directory has no `formatted_budget` contract. Reuse an established formatter or add a narrowly tested backend display field if the native design needs it.

`total` respects type/search; `type_counts` respects tenant/visibility but deliberately ignores type/search. “All” can sum these counts; it must not claim that sum is the filtered result total. Missing type keys mean no rows for that type. Zero results return `totalPages: 0`. A page past the end can return `data: []` with a nonzero total. Order is only `updated_at desc` (no stable tie-breaker). [routes/api.ts:53](../../agents/backend/src/routes/api.ts#L53).

### Existing detail choices

There is **no `GET /api/contacts/:phone`** handler. The web directory detail is its selected directory row plus owner-filtered inventory and interactions; it is not a fresh single-contact fetch.

`GET /api/leads/:phone` is an existing fresh read usable for visible Contact records: `router.param('phone')` resolves the stored key, then enforces tenant + full visibility (or partner ownership on partner routes). It does not restrict ContactType. Response spreads Contact scalars and `lead_score`, plus `recent_interactions` (newest 10), `lead_history` (team-scoped enquiry summaries) and `associated_users` (`id`, `name`). It does not return the directory's `manager`, `inventory_count`, `demand` object or edit capability. Treat raw scalar fields as a boundary response; parse only the necessary fields. Do not call its 10-item recent list “full conversation.” [leads.ts parameter guard](../../agents/backend/src/routes/leads.ts#L63), [detail handler](../../agents/backend/src/routes/leads.ts#L1996).

For independently navigable native Contact detail, choose deliberately between this existing read and a narrow scoped Contact detail endpoint that reuses directory projection/capabilities. A transient route payload alone cannot authorize a reopened/deep-linked record or reconcile an ambiguous save. Do not guess a nonexistent Contact GET route.

Owner listings currently use `GET /api/inventory?owner_phone=<phone>&page=1&limit=50`. Inventory list enforces tenant and existing team visibility/redaction, pagination (default 20, max 100), and returns `{ data, total, page, totalPages }`. Staff defaults are own/team/upload/reference/share/managed-partner listings; `all=true` is a separate browse-all capability. Do not add it merely to make a count match. `owner_phone` is normalized and **ignored if invalid**, so a placeholder can accidentally yield the general list. Native must never display unrelated listings under an invalid/placeholder owner; the backend filter should reject it or safely resolve the stored key. Paginate beyond the web drawer's first 50; reuse native property parsing/navigation. [inventory.ts](../../agents/backend/src/routes/inventory.ts#L552).

### History — `GET /api/contacts/:phone/interactions`

Response is a bare array, oldest-first by `created_at`; no pagination, channel query, total, cursor or stable tie-breaker. Every Interaction scalar is returned: `id`, `tenant_id`, `phone_number`, `channel`, `direction`, `event_type`, `content: string|null`, `metadata: JSON|null`, `created_at`. No nested Agent is included. Channel/direction/event type are unconstrained strings in schema, not closed enums. For WhatsApp parity apply the existing channel filter and preserve unknown event labels; a general timeline may show all channels explicitly. Do not infer delivery state, sender identity or playable media from arbitrary metadata. [api.ts:142](../../agents/backend/src/routes/api.ts#L142), [Interaction schema](../../agents/backend/prisma/schema.prisma#L262).

Current checks: employee requires exact assignment; manager requires assignment to self/direct reports; missing Contact returns 404 for those roles and assignment denial returns 403. Super_boss skips Contact lookup. Query is only `where: { phone_number: phone }`, without tenant. There is no normalization/resolution in this handler. It needs hardening before integration. To bound native history, an additive opt-in paginated contract can retain the legacy bare-array behavior when paging is omitted; trace all consumers above and test both shapes. A virtualized native list alone does not bound this backend response.

### Profile — `PATCH /api/contacts/:phone/profile`

Body fields are optional `{ name, new_phone, email }`; web sends all three as trimmed strings. Current behavior:

- Global exact-phone lookup; 404 when missing.
- PARTNER_AGENT and MANAGEMENT are always blocked with 403 (“edited on their own page”). REAL_ESTATE_BUILDER is not blocked by this check.
- Employee requires exact assignment; manager requires assignment to self/direct reports; super_boss has no assignment restriction. No `checkPermission('edit_contact')` gate.
- Truthy, nonblank `new_phone` is coerced to string then passed through canonical backend `normalizePhone`. Invalid normalization => 400; target already exists anywhere => 409, explicitly no merge. Blank/null new phone leaves identity unchanged.
- Transaction re-keys Contact using parameterized raw SQL, then updates email and synchronizes name. Omitted name/email are unchanged; falsey supplied values clear to null; truthy values are `String(...).trim()`. There is no string/type/length/email-shape validator or optimistic base/version check.
- Response `{ success: true, contact: Contact|null, rekeyed: boolean, new_phone: string }`. Error fallback is 500 `{ error: error.message }`; do not expose raw backend errors as trusted user copy.

On success native must adopt `new_phone`, invalidate account-scoped directory/detail/history/linked lead/inventory queries and leave no actionable route/query pointing at the previous key. On 409 preserve the form and explain that merge is unsupported. A timeout is ambiguous: refresh authoritative scoped state before a further write; do not retry automatically. Profile has no idempotency key or expected-version contract. [api.ts:213](../../agents/backend/src/routes/api.ts#L213).

### Classification — `PATCH /api/contacts/:phone`

Accepts `{ contact_type }` with the seven types above and returns the raw updated Contact. Truthy invalid values => 400. Currently lacks tenant/object/role/permission checks beyond authentication; missing record and invalid null can reach 500. Existing web Chats expose this action. Preserve the workflow in the increment, but only after a tested server boundary and deliberate writable-type policy (type changes can affect other workflow classification). Do not use classification as a way around the PARTNER_AGENT/MANAGEMENT profile restriction. [api.ts:187](../../agents/backend/src/routes/api.ts#L187).

### Adjacent endpoints are not safe substitutes

`GET /api/contacts` returns all visible tenant Contacts plus lead_score and latest Interaction, unpaginated. Do not use it as the new native directory to avoid pagination. `/contacts/search` and `/identify` find global phone variants without Contact visibility/tenant conditions; `/recent` filters tenant only; `/ensure` globally upserts the normalized phone and can rename an existing Contact. These are current modal/intake helpers, not a safe shortcut for native detail/create/lookup. No contact creation workflow is established by M012–M014; if adding one later, trace and repair its separate trust boundary. [api.ts](../../agents/backend/src/routes/api.ts).

## Identity integrity and response privacy

`Contact.phone_number` is globally `@id`; `tenant_id` is a separate scalar. A phone change is a server identity change, never a second contact or client-side merge. Keep canonical normalization on the backend, preserve exact stored keys for navigation, and use the existing placeholder rules for `TEMP_`/`PENDING-`. They are non-dialable ids and must not be normalized into recipients. The frontend's tested pure `toDialablePhone` handles legacy formatting/Indian country code and rejects placeholders/junk; reuse its established semantics rather than stripping all non-digits. [schema](../../agents/backend/prisma/schema.prisma#L45), [backend phone utility](../../agents/backend/src/utils/phone.ts), [web phone utility](../../agents/frontend/src/lib/phone.ts).

`syncContactName` updates Contact, same-phone PartnerAgent and denormalized inventory uploader/key-holder names only when the old name matches. This is intentional preservation of legitimately different names. Profile re-key precedes this in one transaction. It relies on actual database ON UPDATE CASCADE constraints: historical migrations explicitly cascade interactions, WhatsApp, voice, email, inventory, scores, sessions and contact shares. Do not repeat the route comment's “all 23 FKs” as verified truth. [contact_identity.ts](../../agents/backend/src/services/contact_identity.ts).

**Concrete re-key blocker:** `20261003213000_persistent_calling/migration.sql` creates `calling_work_contact_fkey` with ON DELETE CASCADE but no ON UPDATE CASCADE. PostgreSQL therefore blocks updating a referenced phone when a calling_work row exists. `CallingWork` in Prisma contains a bare `contact_phone` scalar, so schema inspection alone misses that constraint. No later tracked migration found here repairs it. This is a source-supported expected failure, not a reproduced database result. A future focused fix needs reviewed additive SQL and a disposable database regression with a calling_work row before allowing native phone-edit acceptance; no production migration is authorized by this document. [migration](../../agents/backend/prisma/migrations/20261003213000_persistent_calling/migration.sql), [schema](../../agents/backend/prisma/schema.prisma#L2793).

Direct Contacts responses inspected here do **not** include a raw Agent object: directory explicitly selects assigned-agent name, legacy list includes only score/latest interaction, profile/classification return Contact scalars, and lead detail selects associated user id/name and coordinator id/name. Inventory's included staff relations use explicit public field selects. Preserve those projections; never add `assigned_agent: true`/`owning_manager: true` for convenient form labels. Agent scalars include password_hash, refresh_token, setup_token, encrypted SMTP password and Google refresh token; encrypted provider credentials remain private. Native must parse an allow-list rather than retain arbitrary nested responses. Interaction `metadata` is opaque, unprojected JSON; provider/log writers need a focused payload audit before any metadata-based UI or downloads. No claim is made that every historical metadata payload is safe. [Agent schema](../../agents/backend/prisma/schema.prisma#L428).

## Narrow prerequisite changes and required regression evidence

All issues below are observed in the pre-existing source being discovered, not introduced by this documentation. The current mobile object integration suite mounts leads/deals/inventory/calendar, **not `routes/api.ts`**, so its successful prior evidence does not establish Contact route safety. Existing `contact_profile_rekey.test.ts` mocks both auth and Prisma/raw SQL: it checks route branching, not tenant isolation or FK cascade. No tests were executed for this discovery.

| Trigger / current gap | Smallest complete next action and meaningful regression |
| --- | --- |
| Tenant A super_boss requests Tenant B phone history/profile; classification accepts any signed-in staff's arbitrary phone | Reuse one tenant + appropriate record-scope guard at the Contacts boundary and retain the predicate through writes/raw SQL. Test real auth with own, same-tenant hidden, foreign-tenant and missing phones for every read/write; super_boss is tenant-bounded too. Assert no side effects. Include revoked native, refresh, partner and builder credential denial. |
| Directory-created/shared/deal-visible contact appears, but history/profile deny because only assignment is checked | Explicitly separate read visibility from write policy at the server. At minimum history must preserve the intended canonical read boundary; profile should preserve assigned employee/team restrictions unless a deliberate policy change is justified. Test creator-only, shared-only, deal-owned, managed-partner, self/direct-report and unrelated contacts. Return an authoritative edit capability if the native form needs it; current directory fields cannot safely derive it. |
| Directory inventory_count counts every inventory row with page phones; no tenant/team predicate | Scope aggregate consistently with the inventory rows users can actually open, reusing their established policy; test foreign-tenant linked inventory and same-tenant out-of-team listings. Do not invent zeros or load hidden inventory to reconcile the count. |
| Equal updated_at timestamps across directory pages; history unbounded | Add stable identity tie-breakers and bounded opt-in history pagination that retains legacy callers. Test no gaps/duplicates with tied timestamps, page boundaries, zero/out-of-range pages and overlapping requests. Validate type/page/limit inputs with useful 400 errors. |
| Profile coerces objects/numbers and accepts unlimited names/emails; concurrent requests can race target lookup | Add focused boundary validation compatible with web string/clear/omit semantics and canonical phone utility. Test malformed types, oversized fields, clear/unchanged values, invalid/conflicting targets, concurrent same-target rekeys and no partial name/email writes. Decide bounded text/email constraints in code; do not invent them in clients. |
| calling_work row references the phone to re-key | Add reviewed FK correction plus actual database test proving related identity follows the change, uniqueness conflicts roll back and tenant does not change. Check other current FKs using database metadata in the disposable environment rather than relying on the historical “23” count. |
| Invalid/placeholder owner_phone is ignored by inventory filtering | Fail safely or resolve the stored owner key before query. Test placeholder/junk request never returns general inventory; preserve valid legacy/canonical owner lookup. |
| Metadata and error messages returned wholesale | Keep native display to declared text/date/channel/event fields, with safe generic server-failure copy; audit/restrict metadata only where the feature needs it. Assert nested credential/provider fields are absent from actual route JSON using sentinel-valued Agent fixtures. |

Retain existing browser response compatibility, CSRF behavior and separate identities. Do not add a blanket `edit_contact` gate that silently removes the assigned-employee profile workflow; align and test the exact allowed role/action instead. Do not weaken tests or widen partner allow-lists to make the native screen load.

## Native screen direction and minimal implementation checklist

This is a proposed implementation direction grounded in existing behavior and the established Operate design, not an implemented UI. Impeccable context read the current mobile PRODUCT/DESIGN and adaptive platform guidance; no UI was edited or inspected in this discovery.

1. **Directory purpose:** find the person and the next record/action. Add Contacts under More for the three supported staff roles. Use a virtualized list; search/name-or-phone, type filters and authoritative result total lead. Row hierarchy: name (fallback “Unnamed contact”), display phone or “No phone”, type, manager, requirement and accessible listing count. Both demand and supply facets can appear. Retain last activity in overview. Reset page on search/type changes, debounce/cancel stale requests, keep visible rows during refresh and expose load-more/retry without fetching all contacts at boot.
2. **Detail purpose:** understand that person before acting. Native stack with name/type/phone/email/manager, requirement, owned listings, and Conversation; revalidate the stored key on open/focus. Link listings to existing authorized native inventory detail. Edit is a focused native form with labeled name, phone and email, Save/Cancel, keyboard avoidance and dirty-form leave confirmation. PARTNER_AGENT/MANAGEMENT explain their own management destinations instead of presenting dead edit controls. Server denial remains authoritative for every role.
3. **Conversation purpose:** read actual recorded history. Preserve a WhatsApp view equivalent to the current shared tab; if also showing the Chats all-channel timeline, label the channels and distinction. Use bounded pagination and a virtualized timeline with date separators, sender/direction and event labels; null content is a textless event, not a missing request. Do not render arbitrary metadata as HTML, playable recording, attachment link or delivery receipt. No compose/send action belongs to this read contract.
4. **Actions:** classification remains a real, server-validated action where permitted; confirmed profile writes adopt `new_phone`. Call opens a user-initiated system dialler only for a dialable number; personal WhatsApp opens the supported explicit handoff with unavailable/cancel handling. They require no contacts-book mutation or hidden send and do not prove a call/message occurred. Company sending and calling outcomes remain their separately traced workflows.
5. **State and native behavior:** initial loading; true empty/search-no-match; retryable failed load; retained rows with refresh error; separate history/listing failures; 401 session recovery; 403/404 access unavailable; 409 phone conflict; saving and ambiguous-save review. Retain input after errors. Offline shows stale in-memory context and disables authoritative writes/sends; do not claim a durable Contact snapshot/draft until encrypted account/tenant/session-partitioned storage is actually implemented and tested. Recheck server permission/state before submission. No automatic write queue/retry.
6. **Interaction floor:** current navy/teal/soft-white/slate tokens, system fonts, accessible names, text scaling, safe areas, keyboard/email/phone behavior, 44pt iOS/48dp Android targets, Android Back and iOS back gesture. Short functional feedback and reduced-motion support; no new marketing layout or decoration. Use existing native components/query/transport, and no new dependency unless necessary.
7. **Checks before claiming parity:** focused real-auth isolated-DB route tests above; contract parsers with null/unknown/decimal-to-number/date/malformed-envelope cases; native component tests for search/type/page/reset, obsolete-response suppression, identity-change cache purge, denied edit, clear/save/re-key/conflict/timeout and each async state; relevant existing web callers/rekey tests/build. Run source checks then Graphify update after code changes. Inspect actual Android/iOS screens, keyboard, large text, long list/history, offline/reconnect and role/session changes. Record separate platform evidence and tooling blockers in PARITY/EVIDENCE; neither bundles nor mocked tests prove native acceptance.

The next agent should repair and test the affected shared Contact boundaries first, implement this bounded staff increment, then update API_CHANGES/PARITY and the mobile handoff with actual results. Partner/builder Contacts access requires separate authenticated contracts, never reuse a staff token or relax default deny.
