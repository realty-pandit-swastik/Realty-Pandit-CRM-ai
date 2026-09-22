# Engineering progress

## 2026-09-22 — audit hardening batches

### Completed

| Batch | Files changed | Result |
| --- | --- | --- |
| Call-gateway boundary hardening | `agents/call-gateway/src/server.ts`, protocol test, package files, environment example, CI workflow | Requires both tokens, caps request body at 64 KiB, authenticates a WebSocket before it can replace the active handset, and runs the simulator in CI |
| Backend readiness accuracy | `agents/backend/src/utils/redis.ts`, `src/app.ts`, app tests/setup | Health checks Redis with a bounded ping and degrades to 503 when Redis is unavailable |
| Credential source remediation | Compose file, root env example/ignore rules, three admin scripts | Removed tracked password values and password logging; scripts require `ADMIN_PASSWORD` |
| Website build reliability and observability migration | Website layout, CSS, CSP, Sentry configuration, proxy migration | Uses a system font stack, removes font CDN CSP allowances, adopts Next 16 proxy/instrumentation conventions |
| CI coverage | Backend/website/deployment workflows plus frontend, gateway, and secret-scan workflows | Added frontend/gateway PR checks, pinned Gitleaks scanning, Node 24-compatible pinned GitHub actions, least-privilege permissions, and job timeouts |
| Documentation | Audit, functionality matrix, developer/operations guide | Captures baseline ratings, evidence, scope, risks, and next steps |

### Verification evidence

| Command / check | Result |
| --- | --- |
| `agents/backend: npm test -- --reporter=dot` | 49 files, 401 tests passed |
| `agents/backend: npm test -- src/__tests__/app.test.ts` | 11 tests passed |
| `agents/call-gateway: npm test` | 32 simulated protocol checks passed |
| Missing gateway token import probe | Fails closed before binding a listener |
| `agents/frontend: npm run build` | Passed; large-bundle warning remains |
| `agents/website: npx next build --webpack` | Passed after the font change |
| `agents/frontend: npx eslint .` | 0 errors, 892 warnings |
| `agents/website: npx eslint .` | 0 errors, 307 warnings |
| `npm audit --omit=dev --audit-level=high` for backend/frontend/website | All three reported 0 vulnerabilities |
| `POSTGRES_PASSWORD=<local-only value> docker compose config --quiet` | Passed |
| Workflow YAML parse | Passed for all workflows |
| Gitleaks secret-scan workflow | Added and YAML-parsed; not executable outside GitHub Actions |
| `graphify update .` | Passed after repository changes |
| Independent read-only review | No Critical/High regressions found; confirmed the documented integration and live-environment verification gaps |
| `agents/backend: tsc --noEmit` | Fails: 391 errors in 49 files; recorded, not hidden |

### Known limitations and risks

- This work did not access production or send provider traffic.
- The default Next/Turbopack build cannot complete in this execution environment because it cannot bind a local helper port. The webpack production build passes after removing remote font downloads.
- Credential values removed from tracked files may exist in Git history or deployments. Rotate them using approved access and assess history remediation; do not place replacement values in Git.
- Backend typecheck remediation needs independent domain batches. Largest current concentrations: `routes/team.ts` (69), `routes/inventory.ts` (57), `routes/builder.ts` (25), and `routes/public.ts` (23).
- CRM and website lint warnings should be reduced only in files being changed; do not disable rules wholesale.

### Next actionable step

In an approved non-production environment, run a migration/restore rehearsal and the critical browser/API smoke matrix. In parallel, reduce backend TypeScript errors in `routes/team.ts` with focused tests, then make typecheck a required CI gate only when the baseline is clean.
