# Focused security review evidence — 2026-10-16

Local source and disposable synthetic fixtures only. No production access, deployment, migration, provider send or customer contact occurred. Existing unrelated workspace edits were preserved.

## Backend follow-up fixes

| Finding | Fix | Executed evidence |
| --- | --- | --- |
| Native credentials with an extra Authorization component bypassed the global boundary while legacy optional-identity workflows extracted the first component. | Inspect the first bearer credential even in a malformed header, then reject native headers with extra components before routing. Valid browser-cookie and public workflow paths retain existing CSRF behavior. | `mobile_sessions.test.ts`: real login/session persistence and actual `/api/workflow/commit` route reject revoked access, refresh credentials and active access with extra header data before `WorkflowEngine.commit` is called. Valid native access, browser-cookie login plus CSRF and anonymous public submission plus CSRF reach the stubbed persistence/provider seam. Existing native revocation/rotation/account/tenant/browser tests also pass. |
| Error telemetry retained camelCase refresh credentials, serialized bodies and differently cased credential headers. | Omit authentication request bodies and opaque string bodies; remove Authorization/Cookie/CSRF/API-key headers case-insensitively; normalize snake/camel-case secret keys in structured data. | `instrument_privacy.test.ts` invokes the real `beforeSend` callback captured from `SentrySDK.init`, with only the SDK transport mocked. Object/string native refresh bodies, mixed-case headers and nested camel/snake-case credentials are absent; safe metadata remains. |
| Calendar detail/create/update serialized every assigned Agent scalar, including password/provider credential fields. | Explicitly select `id`, `name`, `email`, `phone`, matching the existing list contract. Internal provider queries remain unchanged. | `mobile_objects.test.ts` seeds synthetic noncredential sentinels in password, refresh, setup, Google and SMTP fields. Actual PostgreSQL-backed GET/PATCH responses contain exactly the four permitted assignee keys. Existing object scope, pagination, mutation and document checks pass. POST uses the same explicit selection; creation/provider execution was not exercised. |

Commands executed from `agents/backend/`:

```sh
env -i PATH="$PATH" NODE_ENV=test DATABASE_URL=postgresql://mobile_test:local_disposable@127.0.0.1:55432/mobile_test ./node_modules/.bin/vitest run --config vitest.mobile-integration.config.ts src/integration/mobile_sessions.test.ts src/integration/mobile_objects.test.ts --maxWorkers=2 --silent
./node_modules/.bin/vitest run src/__tests__/instrument_privacy.test.ts --maxWorkers=2
```

Results: integration **19/19 passed** across two files; telemetry **1/1 passed**. Integration setup refuses any database except disposable `127.0.0.1:55432/mobile_test` and fixes Redis to loopback port `56379`; fixtures use synthetic accounts and no worker/server bootstrap. Initial integration run found a missing CSRF cookie/header in the new anonymous control; the test setup was corrected without changing CSRF enforcement. Vite emitted its existing CommonJS-config/native-loader compatibility warning.

`NODE_OPTIONS=--max-old-space-size=6144 ./node_modules/.bin/tsc --noEmit --pretty false` remains blocked by **390 existing diagnostics**. The preceding paired baseline/current comparison reported 401 baseline and 396 current diagnostics, including six new test-fixture diagnostics; explicit SDK error-event types and readonly fixture tuples remove those six, with no additional diagnostics relative to that current run. Full output is local `/tmp/rp-mobile-backend-security-tsc.log`. Scoped tracked-file whitespace validation passes; whole-workspace validation reports existing CRLF whitespace in unrelated earlier edits. `graphify update .` completed (17,175 nodes, 27,737 edges); it warned about missing SQL extraction support and legacy Android Gradle syntax.

This is focused regression evidence, not whole-backend certification. Production telemetry delivery, legacy logging beyond these fields, all provider workflows and release acceptance were not tested.
