# Mobile enquiry, contact relationship and activities design

## Contract
- Each new portal enquiry is its own Transaction, linked to the existing normalized Contact.
  Transport replay guards in portal pollers remain; a new enquiry is not a replay just because
  its phone/property repeats. Existing chat/workflow calls may still reuse their active deal.
- Tile matching uses that enquiry's requirements and sends via the existing WhatsApp services.
  Persist an idempotent operation receipt in Interaction (unique request UUID), distinguish provider
  acceptance from delivery, and never log a personal deep-link launch as a confirmed message.
- A full-screen relationship overlay leaves the originating list mounted. Native browser Back
  closes the overlay, preserving filter and scroll state. The boxed C uses accessible button text.
- Header, all visible enquiry records, linked inventory and a paginated chronological timeline
  are served by tenant/assignment-scoped APIs. Inventory redaction remains authoritative.
- Activities combines Task, TaskFollowup, Appointment and legacy ScheduledVisit. Native records
  remain the source of truth; completing/rescheduling updates those records and writes Interaction
  events atomically. Stage-specific workflow work must use its existing guided completion flow.
- Reuse theme tokens and native controls. Preserve the five bottom-nav items; Tasks remains in
  the existing menu, now opening the consolidated activity list. Existing project board stays reachable.

## Security and verification
New routes require staff authentication, tenant checks, assignment/team/contact visibility,
bounded pagination and validated inputs. Retry receipts are scoped to tenant/contact/enquiry.
Synthetic provider mocks cover success, partial sends, failure/retry and concurrent clicks.
Tests cover same-contact/different-enquiry snapshots, normalized identity, record visibility,
activity completion/rescheduling and pagination. CRM build/lint and local mobile browser checks
cover dark/light modes, keyboard/back navigation and preserved scroll. No production sends,
schema changes or deployment are assumed.
