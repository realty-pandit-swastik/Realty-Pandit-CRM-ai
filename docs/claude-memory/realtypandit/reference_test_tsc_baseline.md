---
name: Backend test + tsc known baseline (distinguish pre-existing from regressions)
description: realty-pandit backend has a stable pre-existing failing-test + tsc-error baseline; the app ships via transpile-only. Use this to tell "my change broke it" from "already broken".
metadata:
  type: reference
---

`agents/backend` carries a large **pre-existing** noise baseline. Don't
re-investigate it every session; diff against it.

**Full `npx vitest run` baseline (as of 2026-05-17): 162 passed / 10 failed (172 total).**
The 10 failures live in exactly these files and are unrelated to lead/contact/
visit code:
- `src/__tests__/app.test.ts` (health, root route, "rejects login invalid email")
- `src/__tests__/internal_tools.test.ts`
- `src/__tests__/ownership_service.test.ts`
- `src/__tests__/partner_auto_create.test.ts`
- `src/__tests__/validators.test.ts` → `loginSchema > accepts valid login`
  (Zod-version typing issue; the rest of validators passes)

If your change keeps the count at 162/172 with the **same 5 files**, you
introduced no regressions. A new failing file/test = your regression.

**tsc:** `npx tsc` emits hundreds of pre-existing strict errors
(`string | string[]` from Express req, `possibly null/undefined`, Prisma
`*CreateInput` shape, Zod `required_error`/`coerce` object-option typing,
`Property 'default' does not exist on .../whatsapp`). **`noEmitOnError` is
unset → tsc still emits `dist/`**, so the deploy (`npx tsc` in
`deploy-agent.js`) succeeds despite them and the app runs via this same
pipeline. To check your files only: `npx tsc --noEmit 2>&1 | grep <file>` then
filter the known patterns; a NEW error at YOUR added line numbers is the only
thing that matters.

Verify behavior with targeted `npx vitest run <file>` on the suites you
touched, not the whole-suite pass/fail.
