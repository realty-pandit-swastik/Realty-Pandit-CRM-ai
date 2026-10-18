# Native staff Tasks and Work projects increment

Date: 2026-10-16. Branch: `feat/mobile-apps`. Synthetic local/test data only. Source frozen with the native acceptance agent; Android acceptance results are recorded separately by that agent. Native iOS compilation/inspection remains blocked by absent full Xcode/CocoaPods. This increment is not full CRM or release acceptance.

## Scope and design

Continue the existing Operate/daily-agenda world: native stack routes, scannable rows, existing labeled fields and 52-unit buttons, navy `#10243A`, teal `#087F75`, soft white `#F7F9FB`, slate `#526174`. No new dependencies, provider calls, custom animation or old Android implementation. Task detail leads with title/state/due date, then linked context and actions. Work project detail scrolls project fields/actions above its paginated authorized tasks; long content does not pin an oversized toolbar above the list. Status/priority selection uses a native modal, system Back and accessible buttons rather than Android Alert lists with unsupported button counts.

Implemented staff actions:

- Tasks: server pagination; self list; managers/super administrators can switch to their server-authorized team; status and priority filters; linked lead/property/project navigation; edit title, description, due date, canonical status and priority; complete/reopen; confirmed deletion.
- Work projects: paginated list and status filter; detail; paginated tasks within the caller's task scope; create self-owned projects; edit name/description/status/start/end dates; confirmed deletion. Project deletion retains tasks and clears only their project association through the existing Prisma `onDelete: SetNull` relation.
- Task edits omit assignment, tags and contact/property/project links so unrelated changes cannot silently overwrite them. Project edits omit owner/team membership. Exact existing timestamps survive unrelated date-field edits; changed dates use the existing web-compatible `YYYY-MM-DD` contract. Real-date checks reject impossible dates such as February 30.
- Loading, retryable errors, empty lists, refresh and explicit offline state. Lists keep loaded rows on refresh errors. Edit input survives failed/ambiguous writes while the screen remains open. Offline disables writes. Mutation retries are explicitly disabled. Network/5xx ambiguity, or an unreadable successful mutation response, blocks another write and offers current-record/list review. Task complete/delete and project delete require successful server refresh before retry after ambiguity. A confirmed save updates the record cache before invalidation, preventing a failed follow-up read from replacing known saved values with stale ones.

## Verified flow and callers

`app/_layout.tsx` protects staff routes with the existing session boundary. Tasks uses `RecordList`, scoped by `[scope, 'tasks', filters]`; Work projects uses `[scope, 'projects', filters]`; record reads use the existing `useRecord` and centralized API transport. Identity/session scope remains owned by SessionProvider. Every task/project mutation invalidates task, tasks, home-tasks, project and projects queries under the same scope. Draft/session source and `task/new.tsx` were not modified by this increment.

Current server authority: `agents/backend/src/app.ts` mounts the task router at `/api`; `routes/tasks.ts` applies real `authMiddleware` and `resolveTaskScope` to both resource families. Scope in `services/task_scope.ts` accepts staff roles only. Task/WorkProject have no tenant column: current Agent tenant ownership supplies the tenant boundary. Employee scope is self, manager scope is self/direct reports, super administrator scope is tenant staff. Project owner must belong to the same tenant, and project access additionally requires a scoped owner or scoped team membership. Task scope also checks linked contact/property tenant and linked project owner tenant. Write reference validation rejects out-of-scope assignees, owner/member IDs, projects, contacts and inventory. UI affordances do not replace these server checks.

Traced consumers before modification: backend tasks router and scope service; Prisma Task/WorkProject relation; existing mobile task detail/list/create and Home query keys; `agents/frontend/src/components/TaskBoard.tsx` (`GET /api/tasks`, `GET /api/projects`, `GET /api/tasks/stats/summary`, task create/edit/delete/status and project create). The web TaskBoard currently requests the unpaginated project list and date-only writes; those contracts remain supported. No website consumer of `/api/projects` was found in the focused source search. Property-marketplace Project models are separate from WorkProject.

## Exact API use and additive server changes

| Action | Contract |
| --- | --- |
| Task list | `GET /api/tasks?view=calendar&page=N&limit=25`, optional `assigned_to`, `status`, `priority` |
| Task detail/edit/complete/delete | `GET`, `PATCH`, `DELETE /api/tasks/:id`; existing scoped endpoints |
| Project list | `GET /api/projects?page=N&limit=25`, optional `status` |
| Project detail | `GET /api/projects/:id?include_tasks=false` |
| Project linked tasks | `GET /api/tasks?project_id=:id&view=calendar&page=N&limit=25` |
| Project create | `POST /api/projects`; self owner, no team members |
| Project edit/delete | `PATCH`, `DELETE /api/projects/:id`; existing scoped endpoints |

Project pagination is opt-in and preserves `{projects,total}` for old callers. Page is bounded to 1–100000, limit to 1–100; ordering adds ID as a stable tie-breaker. `include_tasks=false` avoids loading an unbounded nested task collection; omission retains the old scoped `tasks` response. Project list `_count.tasks` now uses the same task scope as actual task reads, preventing a count of hidden peer tasks. Project descriptions are validated as nullable strings up to 20000 characters at the shared boundary; invalid objects fail before Prisma writes. No schema change/migration was needed.

Existing task creation/reassignment notification dispatch remains in the backend and was not duplicated in native code. Native general edit omits `assigned_to` and therefore does not create reassignment notifications. The current backend completion block contains comments but no completion notification dispatch; this increment does not claim to implement such notifications. Real DB tests mock only external `notify` delivery, never auth, Prisma or scope.

## Checks executed

From `agents/mobile/`:

```sh
npm test -- --runTestsByPath src/features/tasks/contracts.test.ts src/features/tasks/Workflows.test.tsx
npx eslint app/task/\[id\].tsx app/task/edit.tsx 'app/(crm)/tasks.tsx' app/projects src/features/tasks app/_layout.tsx
```

Result: 2 suites / 7 tests passed; focused ESLint passed with no findings. Tests prove linked-context/tag parsing, real calendar dates and exact timestamp retention, scoped project count parsing, task edit input retention/no link or assignment rewrite, confirmed task deletion and refresh-required ambiguous recovery, project edit input/team preservation, and reconciliation after an unreadable successful response. These component tests do not establish native UI or server authorization by themselves.

From `agents/backend/`:

```sh
DATABASE_URL=postgresql://mobile_test:local_disposable@127.0.0.1:55432/mobile_test npx vitest run --config vitest.mobile-integration.config.ts src/integration/mobile_tasks.test.ts
```

Result: 1 suite / 9 tests passed against disposable PostgreSQL and Redis. Guarded setup rejects any other DB endpoint. Real auth/scope/Prisma cases cover unauthenticated/partner denial; self/team/tenant task read/stat scope; foreign/peer read/edit/delete negatives; project nested-task and owner/team/reference boundaries; date-only web compatibility/completion metadata; task pagination; project stable pagination/unpaginated compatibility/scoped hidden counts/no nested tasks option; task edit link/tag/assignment/time preservation; reopen completion metadata; status/priority filtering; task delete; project unauthorized edit/delete and invalid description/date rejection; project edit owner/team preservation and deletion retaining linked tasks. Fixtures use synthetic `mobile-scope-*` IDs, are cleaned up, and do not send providers. Vitest emitted its existing CJS config-loader deprecation warning; it did not affect results.

Full mobile typecheck/lint/tests, Android captures and combined backend/web regressions are coordinated by the parent/native acceptance agents after source freeze. Graphify's required update is delegated by the parent to the consolidated post-review freeze so parallel work does not race graph generation. No commit/push/deployment/store submission occurred.

## Parity update suggestions

Apply platform status after checking the separate native acceptance record; source/component evidence alone is not device verification.

| Parity ID | Source state and remaining acceptance |
| --- | --- |
| M073 Task filters/pagination | Automated verified for status/priority/self/team query construction and server scope/pagination; Android device acceptance pending separately. Due-date range, tags and project filters are not exposed in the Tasks tab; project detail has a scoped project-task list. Large-data device pagination remains open. |
| M074 Task detail | Existing detail plus linked property/project navigation; retain previous device evidence and add new captures only when actually inspected. |
| M075 Task create | No source change here; encrypted self-create draft evidence belongs to the separate drafts increment. |
| M076 Task edit/completion | Automated verified for general title/description/date/status/priority edit and uncertain-write protection; complete/reopen server behavior retained. Assignee/tag/link editing and reassignment UI remain open. |
| M077 Task delete | Implemented/automated verified including confirmation, uncertain-write refresh and scoped real DB deletion; native acceptance pending separately. |
| M078 Task bulk import | Not started in native UI; existing server route is not native parity. |
| M079 Task summary | Not started in native UI; no fabricated metrics. |
| M080 Work project list/detail | Implemented/automated verified: pagination/status filter, detail and scoped paginated tasks/counts; native acceptance pending separately. |
| M081 Work project create | Implemented/automated verified self-owned basic fields; native acceptance pending separately; owner/member selectors remain open. |
| M082 Work project edit/delete | Implemented/automated verified basic fields and preserved ownership/membership/tasks; native acceptance pending separately. Ownership/member management remains open. |

All new iOS routes are source implemented/automated verified but native compilation/inspection remains unverified. Staff role source is accepted only; partner/builder journeys stay separate and open.

## Deliberate limits and risks

No new team directory API/owner/assignee/member selector, task tag/link editing, project-task creation/association selector, task bulk import or summary screen was invented. Project detail can open existing authorized linked tasks; assigning an existing/new task to a project remains a native gap. Edit inputs remain component state and are not encrypted process-death drafts; those guarantees apply only to the separately implemented draft surfaces. The current PATCH APIs have no version/ETag precondition, so simultaneous edits retain existing last-write-wins behavior. No physical device, native iOS, live notification/provider delivery, performance/release signing or production verification was performed by this increment.

## Navigation correction verified — 2026-10-17

The patched Android runtime exposed a create → edit → save → delete → Back path that reopened a cached deleted project detail. The same return pattern exists in task editing. Keep the current Operate layout, roles, controls and loading/error/offline behavior. Return to an existing detail/list by unwinding its native stack rather than replacing only the top screen; deletion still requires confirmation and removes the record cache. Add a real Expo Router history regression for both task and project journeys, then inspect the corrected Android Back path. No backend contract or permission change is needed.

Correction result: eight return calls now use `dismissTo`. The new real-router tests reproduced both project and task failures before the fix; afterward6 focused tests and the full65-test/13-suite package pass with strict types/lint/both exports. Both dedicated synthetic create/edit/save/delete/Android Back journeys passed on the patched SDK debug client via current Metro JS; six captures opened. See NATIVE_ACCEPTANCE.md and VERIFICATION.md. No backend/dependency/layout change or expanded workflow claim.
