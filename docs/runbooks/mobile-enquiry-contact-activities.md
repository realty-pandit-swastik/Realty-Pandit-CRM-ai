# Mobile enquiry, contact relationship and Tasks changes

## What changed

The five mobile bottom-nav items are retained. Open **menu → Tasks** for the consolidated
activity page. The existing project/kanban board remains under **Projects / add task**.
The implementation reuses Contact, Transaction, Interaction, Task, TaskFollowup, Appointment
and ScheduledVisit. No database migration, new dependency or provider configuration change
is required. The existing client-role/cycle migrations remain prerequisites of this branch.

### Backend files (under `agents/backend/src/`)

| File | Change |
|---|---|
| `services/ensure_deal.ts` | Every explicit/new portal enquiry creates its own Transaction, including same-listing repeats; snapshots its requirements; atomically records creation. Chat/workflow ensure calls retain active-deal reuse. |
| `services/portal_reenquiry.ts` | Passes explicit new-enquiry intent and that enquiry's demand into creation. |
| `services/ninety_nine_acres_poller.ts` | Reuses normalized existing contact keys; forwards fresh budget/location/taxonomy snapshots and awaits creation. |
| `services/housing_poller.ts` | Reuses contact keys; forwards incoming requirements without inheriting another enquiry's missing budget; awaits creation. |
| `integrations/magicbricks.ts` | Both intake paths create separate enquiries for known contacts; preserve source property IDs and demand; avoid rejecting the known phone as a duplicate. |
| `routes/external_leads.ts` | Single/batch intake normalizes/reuses Contact, validates budget/tenant and awaits separate enquiry creation. |
| `routes/leads.ts` | Exposes per-enquiry snapshots; keeps new enquiries discoverable under source/active filters; manual new requirements also create a separate enquiry. |
| `services/match_dispatch.ts` | Matches the selected enquiry, sends via existing WhatsApp sharing, records a durable request receipt, resumes unsent properties on retry; supports legacy contact-only tiles. |
| `services/contact_relationship.ts` | Shared tenant/team visibility, relationship inventory/enquiries, and a paginated chronological feed of interactions, calls, WhatsApp records, visits and status logs. Strips raw provider metadata. |
| `routes/contact_relationship.ts` | Authenticated relationship and one-tap matching endpoints with input/permission checks. |
| `services/activity_feed.ts` | Combines scheduled activity sources, IST grouping, type/contact filters, pagination and atomic native-record/timeline mutations; keeps Google reminder sync consistent. |
| `routes/activities.ts` | Validated staff-scoped list, completion and reschedule endpoints. |
| `routes/workflow_tasks.ts` | Completion/snooze use the same task scope; authenticated actor cannot be overridden in the body. |
| `app.ts` | Mounts `/api/crm` and `/api/activities` behind existing API middleware. |

### Frontend files (under `agents/frontend/src/`)

| File | Change |
|---|---|
| `components/ExternalLeads.tsx` | Desktop/mobile rows show every accessible enquiry with its own source, stage, date and budget/location; dispatches matching immediately and displays send/retry state. |
| `components/leads/LeadCard.tsx` | Boxed C, in-flight disabling, Matched/Retry labels and personal Hi fallback. Contact temperature is no longer misrepresented as an enquiry-specific status. |
| `hooks/useSendMatches.ts` | Same-tick double-tap guard, stable request UUID across retries, success/failure toasts and WhatsApp deep-link fallback. |
| `components/InventoryList.tsx` | Boxed C beside the source name using only the permitted source phone. |
| `components/mobile/MobileInventoryList.tsx` | Same Contact action on mobile inventory tiles. |
| `components/ContactButton.tsx` | Shared accessible C button, disabled when the contact key is unavailable/redacted. |
| `lib/contactNavigation.ts` | Shared open-contact event retaining the trigger for focus restoration. |
| `components/ContactRelationshipPage.tsx` | Header, Leads/Inventory/Timeline sections, earlier-event pagination, retry states and native-dialog history handling. Keeps the previous list mounted. |
| `components/ActivitiesPage.tsx` | Overdue/Today/Upcoming/Done groups; type/contact filters; native quick actions, completion and reschedule form. |
| `components/LeadWorkflowPage.tsx` | Existing guided workflow can focus one selected task and return after successful completion. |
| `components/ContactSearchField.tsx` | Optional autofocus; Tasks opts out of opening the keyboard on initial load. |
| `components/crmRelationships.css` | Shared theme-token styles, visible focus and mobile-safe controls/layout. |
| `api/client.ts` | Relationship, dispatch and activity API functions. |
| `App.tsx` | Routes Tasks to the new activity page and mounts the relationship host above existing screens. |

Tests in `agents/backend/src/__tests__/`: new `external_enquiry_intake`, `match_dispatch`,
`contact_relationship`, `activity_feed`, `workflow_activity_scope`; updated `per_enquiry_leads`,
`per_enquiry_leads.db`, `ensure_deal_multi_requirement`, `lead_recent_external_search`, `lead_stage_filter` and shared
transaction mocks in `setup.ts`.

## How to test

Use an isolated test database and mocked WhatsApp provider, or a consenting test contact.
Do not send messages to arbitrary sample numbers on a production provider account.

### 1. One-tap Matches
1. Open Ext. Leads, pick an enquiry with sufficient requirements and available stock, and tap
   Matches. It must start sending without opening the lead-detail matching drawer.
2. Double-tap: one request owns the send, the button disables and reads Sending, then Matched ✓.
3. Verify the brief `Matching sent to <name>` toast and a contact timeline entry with the
   successfully sent inventory IDs and timestamp.
4. With a provider failure after one property, retry using the tile. Already accepted properties
   and an already accepted Hi are not repeated. The failure is never shown as a completed match.
5. A legacy contact-only tile creates/reuses an accessible enquiry in the same action.

### 2. Multiple enquiries, one Contact
1. Ingest a new MagicBricks enquiry for one test phone/property `85225923`, then a 99acres
   enquiry for that same phone/property `84110871`, with different budgets/locations.
2. Use bare, `91` and `+91`/spaced forms of the same test phone. Contact identity is reused;
   each new enquiry has a different Transaction ID and preserves its own snapshot.
3. Ingest a genuinely new enquiry for the same property again: another enquiry is created.
   Replaying the identical provider event is still subject to the provider's transport replay guard.
4. Verify separate mobile and desktop rows, and that source/stage/date filters do not collapse
   the visible enquiries. Counts distinguish enquiries from contacts.

### 3. Contact Relationship
1. Scroll down a lead list and tap boxed C. Check name/phone/email/roles and quick contact links.
2. Check both enquiry rows with their distinct properties/budgets/stages; check owned/enquired
   inventory and external portal references.
3. Check Timeline for creation, matches, calls, WhatsApp, visit and status/note events. Load earlier
   entries when present. Records outside the viewer's tenant/team permissions must remain hidden.
4. Use browser/device Back, the page's Back button and Escape on desktop. The original list
   remains mounted; its filter and exact scroll position are retained.
5. Repeat from an inventory tile. Redacted source phones cannot be used to bypass contact access.

### 4. Tasks
1. Open menu → Tasks. Schedule a generic task, contact follow-up and visit using the existing
   Leads/Pipeline/Visits surfaces. Refresh Tasks and check the corresponding groups.
2. Filter by activity type and by an existing contact. Clear the filters and load more rows.
3. Complete a regular task: its original record changes, it appears in Done, and the contact
   timeline gains completion. Repeated completion must not create duplicate completion events.
4. Reschedule using the labelled local-time input: stored time is sent as ISO; display/grouping
   uses IST. Invalid/past times are rejected and the original activity remains unchanged.
5. For stage-specific workflow tasks use Open workflow. Complete required qualification/share/
   visit/negotiation fields through the existing form. A raw generic Done action cannot bypass them.

## Assumptions and edges

- Cloud API Hi sends use the configured company WhatsApp account and require an active messaging
  session. Outside that window, approved property sharing can still run, and the UI attempts a
  `wa.me` chat with Hi prefilled. Browsers may block that asynchronous popup, so **Send Hi** stays
  available. A personal `wa.me` link always requires the user to tap Send; it cannot prove delivery
  or automatically reorder the user's personal chat list. WhatsApp Web/sign-in may be used when
  the handset app is unavailable.
- Matched/Sent means the existing provider integration accepted the share, not that the recipient
  read it. Provider delivery states remain visible in WhatsApp history where available.
- A request UUID prevents browser retries/double taps from replaying a successful send. Partial
  failures retain accepted IDs. A processing receipt is not reset automatically after a network
  timeout/crash because provider delivery may be uncertain; check its timeline before retrying.
- Matching uses the existing top-10 lead matching limit. Zero matches do not produce a false
  Matches sent event. Missing client phone/placeholders require a real number before sending;
  the relationship page can still show an existing placeholder contact without dial links.
- Enquiry status is the existing Transaction pipeline status. The Contact's cold/warm/hot
  temperature remains a person-level attribute rather than being copied as each enquiry's status.
- All scheduled items are grouped using India time. Overdue includes items due earlier today.
  Untyped general work appears under Other. Unlinked work has no call/chat/contact action.
- This changes new intake behavior; it does not fabricate past enquiries already merged by older
  code or physically merge pre-existing duplicate legacy Contact records.
- The relationship/activity read models merge existing sources before response pagination, so
  older records are not silently dropped by independent source limits. Very large tenant histories
  may warrant a dedicated indexed read model later; there is no new mirrored task table now.

## Verification record

- Full backend run (`npm test -- --maxWorkers=2`): 715 assertions passed, 3 DB-gated tests skipped;
  the existing `wa_image_route` Windows `EPERM` cleanup hook failed after its assertions passed.
- After the final legacy-contact and guided-workflow changes: 60 focused assertions passed,
  including app security, workflow authorization, receipt retry and source/filter regressions.
- CRM TypeScript/Vite build and scoped ESLint error gate passed. Existing bundle-size and lint
  warnings remain. Backend TypeScript was compared against the unchanged base, not claimed clean.
- Local real-browser checks with synthetic API fixtures covered 390px mobile, dark/light styling,
  duplicate enquiry tiles, double taps/in-flight state, relationship sections, exact scroll retention,
  task completion/rescheduling and type/contact filters. No real messages/calls were sent.
- No production deployment or database-backed/provider-delivery acceptance test was performed.
- `graphify update .` was attempted but the Graphify CLI is unavailable on PATH in this shell.
