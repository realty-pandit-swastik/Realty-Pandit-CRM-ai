---
name: Always use shared axios client for mutations
description: Any component doing POST/PUT/PATCH/DELETE must use shared client from src/api/client.ts — raw axios bypasses CSRF interceptors and causes 403
type: feedback
---

Always use `import client from '../api/client'` (or the correct relative path) for ALL API calls in the admin panel frontend. Never use raw `import axios from 'axios'` directly in components.

**Why:** The shared `client` (created via `axios.create()`) has two critical interceptors:
1. Reads the `rp_csrf` cookie and attaches it as `X-CSRF-Token` on every POST/PUT/PATCH/DELETE
2. Auto-retries with a fresh CSRF token if the server returns a 403 CSRF error

Raw axios bypasses both. Every mutation call made with raw axios will return 403 in production because the backend CSRF middleware requires the `X-CSRF-Token` header.

**How to apply:** When writing or reviewing any admin panel component that makes API calls — especially POST/PUT/PATCH/DELETE — check the import. If it says `import axios from 'axios'`, replace it with the shared client. Also remove `{ withCredentials: true }` and `${API_BASE_URL}` prefixes since the shared client already sets both globally.
