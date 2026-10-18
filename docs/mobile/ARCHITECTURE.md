# Mobile architecture decision — 2026-10-16

Selected: a fresh Expo/React Native app in `agents/mobile`, generated independently of `agents/android`. Capacitor would reuse DOM components, browser cookie assumptions and a large CRM bundle, while still needing native sharing, storage and lifecycle work. React Native permits native lists, stacks, controls and OS storage without transporting the DOM application. Neither framework has measured launch evidence here.

Contracts come from backend routes and validators. Feature routes call one bounded, cancellable transport. Queries are keyed by identity and held only in memory. Access credentials remain in memory; rotating refresh credentials use SecureStore. No sensitive persistent query cache or automatic mutation queue. A timeout after a write is ambiguous and must be reconciled by loading current state before another attempt.

Mobile sessions are additive and separate from browser refresh tokens/cookies. Each device has its own session identifier, hashed rotating refresh credential, absolute expiry and server-side revocation. A signed previously used refresh credential revokes the session. Concurrent refresh is serialized with a database compare-and-swap; the client uses a single refresh promise. Staff, partner and builder authentication remain separate domains; unsupported domains are explicit parity gaps until their prerequisites pass.

The API remains the authority for normalization, taxonomy, prices, matching, stage transitions, provider sends and permissions. No production environment is required for local tests. Database changes are reviewed SQL and tested only in disposable local PostgreSQL. Redis-down behavior is tested separately from mocked unit tests.

Toolchain selection follows the current [Expo compatibility table](https://docs.expo.dev/versions/latest/), [Router installation](https://docs.expo.dev/router/installation/) and [SecureStore guidance](https://docs.expo.dev/versions/latest/sdk/securestore/). Exact installed versions and platform build outcomes belong in EVIDENCE.md. Native runtime proof requires development builds; JavaScript bundles do not satisfy it.
