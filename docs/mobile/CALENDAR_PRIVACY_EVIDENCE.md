# Calendar and nested task response privacy — 2026-10-16

## Confirmed defects and changes

An employee assigned an appointment could read the linked same-tenant property's owner phone/ID, key-holder phone and exact unit/plot through appointment detail GET and PATCH, even when another employee assigned/uploaded the property and had not shared it. The inventory detail route correctly omitted those fields. A real-auth/PostgreSQL regression reproduced the discrepancy before the fix (`owner_phone` remained in the appointment response).

`agents/backend/src/routes/calendar.ts` now applies the existing `sanitizationService.redactInventoryForStaff` with the existing `getTeamIds` at the response boundary for detail GET, PATCH and creation POST. Internal appointment/property objects remain available to logging, reminders and notifications before response redaction. This reuses the canonical owner/uploader/team/shared/super-boss policy without copying its field list. Calendar list already selects only property ID, location, type, price and specs. No schema or provider behavior changes were required. Staff `customer_price` visibility is intentional and is preserved; it was not a price leak finding. The included Tenant has no secret fields.

A second independently identified disclosure affected `GET /api/tasks/:id`: an assigned task exposed the full linked project even if the assignee could not read the project. The regression creates the private project and delegated task through the manager APIs, confirms employee project GET returns 404, then reproduced task GET exposing the project's description, owner, membership and dates. Task detail now selects only `project: { id, name }`, matching list/create/PATCH. Task access and project membership rules are unchanged. Authorized managers still receive full project details through the scoped project endpoint.

## Caller/contract checks

- CRM `CalendarView` uses the safe calendar list projection, reads property type/location/price, and ignores PATCH response data; `mobile/MobileCalendar`, `ExternalLeads` visit history and `LogActionModal` retain their list/status/rescheduling contracts. `api/client.ts` wrappers and `BookVisitModal` creation were traced.
- Native Home/Visits list, visit detail and outcome update use `visitFrom`, which reads appointment ID/title/time/status/location/contact name/notes; these fields remain. No native appointment creation/rescheduling UI is enabled.
- CRM `TaskBoard` uses the task list's existing project ID/name label. Native task detail/edit use `taskRecordFrom`/`taskFrom`, retaining all task fields and project name/ID; project details use the separately scoped project endpoint. No client change was needed.

## Reproducible checks

Only existing synthetic containers `rp-mobile-postgres` (`postgres:15-alpine`, loopback 55432) and `rp-mobile-redis` (`redis:7-alpine`, loopback 56379) were started after inspecting them. Existing disposable `mobile_test` schema was sufficient; no migration/schema push was run. Integration uses real auth middleware, Prisma and PostgreSQL with the separate config, no global auth/Prisma mocks. Notification/catalog provider seams are mocked; regression mutations send notes only or use mocked task notifications.

From `agents/backend`, with the synthetic database credential documented in `BUILD.md`:

```sh
env -i PATH="$PATH" NODE_ENV=test \
  DATABASE_URL=postgresql://mobile_test:local_disposable@127.0.0.1:55432/mobile_test \
  REDIS_HOST=127.0.0.1 REDIS_PORT=56379 \
  ./node_modules/.bin/vitest run --config vitest.mobile-integration.config.ts --maxWorkers=2

env -i PATH="$PATH" NODE_ENV=test \
  DATABASE_URL=postgresql://mobile_test:local_disposable@127.0.0.1:55432/mobile_test \
  REDIS_HOST=127.0.0.1 REDIS_PORT=56379 \
  ./node_modules/.bin/vitest run --maxWorkers=2

NODE_OPTIONS=--max-old-space-size=8192 ./node_modules/.bin/tsc --noEmit --pretty false
```

| Check | Observed result |
| --- | --- |
| Calendar focused regression before source fix | Failed on appointment `owner_phone` disclosure; inventory endpoint omitted it |
| Calendar object suite after fix | 9/9 passed |
| Task focused regression before projection fix | Failed: full 10-key project returned instead of ID/name |
| Final real-auth integration | **30/30 passed**, 3 files, 6.31s |
| Ordinary backend suite | **700 passed, 4 skipped**, 100 files passed/2 skipped, 27.02s |
| Backend TypeScript | **390 diagnostics**, matches preceding current-workspace count reported by independent verification; no diagnostics in new helper or regression tests. Whole backend remains failing. Initial default-heap attempt exhausted memory; 8GiB heap completed with exit 2. |
| Targeted diff whitespace check | Passed |
| `graphify update .` | Completed: 17,211 nodes/27,788 edges; AST-only. Existing SQL-parser and old Android Gradle extraction warnings remain. |

The calendar regression checks GET/PATCH omission of `owner_phone`, `owner_id`, `key_holder_phone`, `flat_no`, `plot_no`; preserves visit/contact/listing data and both price fields; verifies stored property data remains; and checks assigned, uploading, shared and super-boss access retain private fields. Existing object tests cover no-property responses, tenant/link rejection and safe assignee projection. The task regression verifies task details and project label remain usable and manager project access remains intact. Fixtures clean up their synthetic rows.

## Limits

No production, provider delivery, physical-device, iOS, store or release acceptance was performed in this privacy increment. POST calendar serialization uses the same helper, but its legacy creation/provider authorization and acceptance remain an explicit separate gap; no appointment creation was exercised. Manager-team inventory behavior delegates to the existing canonical helper and was traced, not separately added as a new real-DB fixture here. Native preview ownership/restart was coordinated with the native acceptance agent; this increment did not control ADB or start `server.ts`/workers. No commit, push or deployment was performed.
