# Android inventory parity checklist

Source audit: 2026-10-18. Authority: `agents/frontend/src/components/InventoryList.tsx`, `InventoryDetailView.tsx`, `InventoryModal.tsx`, `PersonalWhatsAppShareModal.tsx`, `ShareContentPicker.tsx`, `BookVisitModal.tsx`, `src/api/client.ts`; `agents/backend/prisma/schema.prisma` Inventory/InventoryDocument, taxonomy NodeField definitions, inventory/workflow/team routes. The supplied plan is the visual brief; the five earlier images are not attached in this implementation context.

Scope: super_boss, manager, employee. Partner and builder native sign-in are excluded. Existing app navigation and navy/teal/white tokens remain. Inventory uses a single-column catalogue and grouped native details. Initial/loading/empty/refresh/error/offline states are explicit. Temporary attachments and provider actions are never queued for automatic replay.

Status is implementation coverage, not blanket device acceptance. Android evidence and outstanding external checks are in INVENTORY_EVIDENCE.md. Every schema field is either mapped below or accounted for after the table. iOS JavaScript export is separate from an iOS native build.

| Field | Native location | Permission / behavior | State |
|---|---|---|---|
| `category` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `type` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `property_category` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `property_sub_category` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `property_type_link` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `property_configuration` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `flat_property_type` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `taxonomy_node` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `usage_type` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `investment_type` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `intent` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `status` | Detail → Classification | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `flat_no` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `plot_no` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `apartment_name` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `full_address` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `location` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `sub_locality` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `locality` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `city` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `district` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `state` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `pincode` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `latitude` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `longitude` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `floor_number` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `floor_label` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `display_floor` | Detail → Address and floors | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `customer_price` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `display_price` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `price` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `price_unit` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `description` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `renovated` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `roof_rights` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `pre_rented` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `pre_rented_monthly_rent` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `commercial_use` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `commercial_use_type` | Detail → Pricing and property | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `owner_name` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `contact` | Detail → People and collaboration | Authorized detail projection; direct owner/key-holder calling additionally gated by /contacts (manager/super_boss). | Implemented; native sample inspection |
| `key_holder_type` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `key_holder_name` | Detail → People and collaboration | Authorized detail projection; direct owner/key-holder calling additionally gated by /contacts (manager/super_boss). | Implemented; native sample inspection |
| `key_holder_phone` | Detail → People and collaboration | Authorized detail projection; direct owner/key-holder calling additionally gated by /contacts (manager/super_boss). | Implemented; native sample inspection |
| `uploader_name` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `uploader_phone` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `uploader_email` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `uploaded_by_agent` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `assigned_agent` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `reference_agent` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `referral_partner` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `owning_manager` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `source` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `ownership_type` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `upload_source` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `lead_reference` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `shared_with_ids` | Detail → People and collaboration | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `display_id` | Detail → Record and engagement | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `slug` | Detail → Record and engagement | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `completion_pct` | Detail → Record and engagement | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `is_enriched` | Detail → Record and engagement | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `needs_taxonomy_review` | Detail → Record and engagement | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `needs_owner_fix` | Detail → Record and engagement | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `created_at` | Detail → Record and engagement | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `updated_at` | Detail → Record and engagement | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `stats` | Detail → Record and engagement | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |
| `_count` | Detail → Record and engagement | Staff detail redaction; omitted restricted fields identified by restricted_fields. | Implemented; native sample inspection |

| `specs.*` (every canonical/dynamic key) | Detail → All property specifications; add/edit → taxonomy fields | Preserve nested objects, arrays, false, zero and units; server taxonomy supplies labels/options/required fields | Implemented; residential/commercial/land fixtures tested |
| `media_urls`, `video_urls` | Photo-led cards; detail gallery; media manager; per-file sharing picker | Public listing media only; media writes require own/team + edit_inventory | Implemented; Android build includes expo-video |
| All InventoryDocument metadata | Detail → documents/management | Independent can_access_documents and write capability; authorized download endpoint, no raw document URL handoff | Implemented; private share confirmation retained |
| owner/key-holder direct phone | Connected people | /contacts controls role privacy; employee coordinates with assigned agent | Implemented |

Database identity and relationships: `id` routes to the record; `tenant_id` is an authorization partition, not display content. `owner_id`, `owner_contact_id`, `key_holder_contact_id`, `uploaded_by_agent_id`, `assigned_agent_id`, `reference_agent_id`, `referral_partner_id`, `owning_manager_id` and taxonomy FKs resolve displayed people/classification. `partner_assignee_id` belongs to the excluded partner-team authentication flow. `shared_with_ids` is displayed and managed through team selection. `media_score` is server sorting metadata. Appointments, shares, saved and shortlist relations supply actual counts; task/deal relations remain their existing native destinations. No invented metrics are used.

| Web action / control | Native location / API | Permission and outcome | State |
|---|---|---|---|
| Browse all / my-team | Inventory scope switch; GET inventory `all=true/false` | Staff tenant/redaction enforcement stays server-side | Implemented; bounded 25-row pages |
| Search, status, intent, location, state, type, category, BHK, floor, source, recency, price bounds, area bounds/unit, roof rights, commercial use/type, radius | Inventory filters → canonical GET parameters | No client filtering of a downloaded database | Implemented |
| Taxonomy filter, assigned member | Taxonomy/member controls under inventory filters | Server expands descendants and scopes role access | Implemented |
| Pagination, refresh, selection | Virtualized list; next 25; individual selection across loaded pages | Selection clears when search/scope/filters change | Implemented |
| Add | Inventory → Add property → workflow definition/validation/next-step/summary/commit | edit_inventory + active authenticated staff session; server identity/phone/pricing/ownership logic | Implemented |
| Edit | Detail → Edit property → typed address/classification/specification/scalar form → review → PATCH | actions.edit; checks updated_at before mutation; no automatic replay | Implemented |
| Enrichment | Property actions → Enrichment | Reuses authorized edit and taxonomy form, including amenities/description/area/ownership flags | Implemented alternative native layout |
| Clone | Property actions → Clone → choose cleared values and media copy | edit_inventory + own/team; human confirmation; copies neither photos nor videos unless selected | Implemented |
| Upload/remove photos and videos | Detail → attachments/media manager | Fresh record/owner scope; file size/type validation; ambiguous upload requires review | Implemented |
| Document upload/type/title, rename, download/open, delete, private share | Detail → documents | Own/team paperwork scope separate from general edit; explicit private share confirmation; MIME-specific file handoff | Implemented |
| Assignment/reassignment and bulk transfer | Property actions → Assignment → tenant member chooser → bulk-transfer | transfer_inventory + record authorization; per-record results shown | Implemented |
| Team share/unshare | Property actions → Team share add/remove → multi-member chooser | share_inventory; tenant member validation; server record scope | Implemented |
| Ownership transfer | Property actions → Transfer ownership | manage_inventory is explicitly super_boss-only; own tenant; confirmation | Implemented |
| Matching clients | Property actions → Find matching clients | Server returns bounded authorized/redacted matches; opens existing deal; share by phone or authorized deal | Implemented |
| Schedule visits | Property actions → Schedule visit → existing calendar API | Contact/property/assignee tenant checks; explicit online mutation; ambiguous save blocked | Implemented |
| Sold, hold/follow-up, activate, withdraw | Property actions; status-specific forms | edit_inventory + own/team; confirmation; canonical backend transitions | Implemented |
| Approve/reject | Property actions when pending approval | Server actions.approve; edit_inventory + own/team; harvested listing retains owner-call gate | Implemented |
| Delete | Property actions | delete_inventory + own/team; confirmation; server can withdraw linked properties instead | Implemented |
| Generate single/bulk PDF | Property actions → PDF | Authorized server generation; app handoff reports no confirmed sending | Implemented |
| Template CSV upload and row results | Inventory → Template and bulk upload | bulk_upload; actor tenant; canonical phone normalization; row import/rejection outcomes | Implemented |
| Company share (single/batch) | Share → CRM WhatsApp → contact/files/brochure → review → submit | Authorized recipient/property, explicit file membership/first photo, additive per-item/PDF/provider outcomes; no substitution/replay | Implemented; provider mocked only |
| Personal WhatsApp / Business | Share → My WhatsApp → prepare → per-property media/PDF steps | Android ACTION_SEND_MULTIPLE + narrow FileProvider + temporary grants; agent confirms recipient and Send | Implemented; real WhatsApp apps not installed in AOSP test image |
| Limits, blocked/partial/failed/uncertain results | Share outcome + retained package + My WhatsApp alternative | Accepted is not delivered; uncertain company submissions remain locked; no automatic retries | Implemented |
| Activity after company submission | Recipient lead or deal activity; result retained on Back | Server Interaction records outcome and provider package metadata | Implemented |
| Map / contact calling | Detail → Open map / connected people | Authorized coordinates/phone only, OS app handoff | Implemented |

No production deployment, schema migration, store submission, customer message or phone call was performed. Full real WhatsApp/Business transfer and full per-role device journeys remain external/native acceptance work; unit and API tests are not a substitute.
