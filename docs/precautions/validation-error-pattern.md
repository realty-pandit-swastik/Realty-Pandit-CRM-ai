# Precaution — User-input rejections must be `ValidationError`, never plain `Error` + `captureRouteError`

**Established:** 2026-06-25 (GlitchTip error-remediation pass — see `plans/2026-06-25-glitchtip-error-remediation.md`)

## The trap

A business-rule rejection (bad user input, illegal state, forbidden action) thrown as a plain `Error` from a service/workflow, then caught by a route's manual `try/catch`, gets:
1. **Returned as HTTP 500** (the catch-all maps every thrown error to 500), and
2. **Captured to GlitchTip** as if it were a server crash.

The result: the admin app shows a scary "AxiosError 500", the user gets no useful message, and the error tracker fills with non-actionable noise that buries real bugs.

**Real example (the issues that triggered this):**
- `workflow_engine.commit()` threw `new Error('You cannot use your own number as the property owner…')` → `POST /api/workflow/commit` returned **500** → backend GlitchTip **#105** + admin axios **#16** (the *same* event, double-counted). It's just an agent mistyping the owner number — a 400, not a crash.
- `transaction_state_machine` threw `new Error('Invalid transition: …')`. The route mapped it to **400** correctly, but still called `captureRouteError` first → GlitchTip **#97** for a perfectly valid rejection.

## The rule

There is already a typed-error system in [`middleware/error_handler.ts`](../../agents/backend/src/middleware/error_handler.ts). **Use it.**

1. **Throw a typed error, not a plain `Error`,** for any expected user-facing rejection:
   - `ValidationError(msg)` → 400 (bad/again input, business-rule violation)
   - `AuthError(msg)` → 401, `ForbiddenError(msg)` → 403, `NotFoundError(msg)` → 404
   - These all extend `AppError` (carries `statusCode`).
2. **In the route catch, honor `AppError.statusCode`** — return `err.statusCode`, not a blanket 500:
   ```ts
   } catch (err) {
       captureRouteError(err, req, { route: '…' });   // now safely skips 4xx
       if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
       logger.error('…', err);
       res.status(500).json({ error: 'Internal server error' });
   }
   ```
   (Or simply `next(err)` and let the global `errorHandler` map it.)
3. **`captureRouteError` skips 4xx `AppError`** (since 2026-06-25): if `err instanceof AppError && err.statusCode < 500`, it logs a `warn` and does **not** send to GlitchTip. So even a route that forgets step 2 won't pollute the tracker — but still do step 2 so the client gets the right status.

## How to apply

- **New validation/business-rule logic** in services, workflows, or routes → `throw new ValidationError(...)` (or the right `AppError` subclass). Never `throw new Error(...)` for something the user can cause.
- **Reviewing a route's `catch`** → if it does `captureRouteError(...)` then `res.status(500)` unconditionally, it will mislabel and over-report any thrown 4xx. Add the `AppError`-aware branch.
- **GlitchTip triage** → if an "error" is actually expected user input (own-number, invalid transition, duplicate, bad format), the fix is to *re-type the throw*, not to ignore the issue.
- The good reference already in the tree: the inventory **edit** path (`routes/inventory.ts:868`) returns a clean `res.status(400)` for the same own-number rule — that's the target shape; the **add/commit** path was the one that was wrong.

Related: [[workflow-engine-traps]] (the own-number guard lives in the same commit path), `utils/capture.ts` (`captureBackgroundError` has the analogous benign-skip for OAuth-scope errors).
