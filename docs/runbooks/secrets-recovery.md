# Runbook — Encrypted-secret & OAuth credential recovery

Two silent, long-running outages have been caused by secrets in `.env` changing or disappearing.
Both broke Google Calendar/Tasks sync for the whole team while the admin panel looked perfectly fine.

## What depends on which secret

| Secret | Used for | Breaks if changed/lost |
|---|---|---|
| `JWT_SECRET` | **Also the AES key** for `utils/crypto.ts` (`scryptSync`) | Every value encrypted with `encryptSecret()` — `agents.google_refresh_token`, `agents.email_smtp_password` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth token exchange | All Calendar/Tasks sync + "Sign in with Google" |

⚠ **`JWT_SECRET` is dual-purpose.** Rotating it to invalidate sessions *also* silently orphans every
stored encrypted secret. `crypto.ts` documents this ("rotating JWT_SECRET invalidates stored
secrets") but the failure is invisible — it surfaces only as a background error flood.

---

## Fault A — decrypt fails: "Unsupported state or unable to authenticate data"

That message is Node's AES-256-GCM auth-tag failure = **wrong key**, i.e. `JWT_SECRET` changed.

### Diagnose
```bash
cd /var/www/realty-pandit/backend
grep -hc "Unsupported state" logs/error-$(date +%Y-%m-%d).log
# per-hour, to see whether it is ongoing
grep -h "Unsupported state" logs/error-<date>.log | grep -oE '"timestamp":"[^ ]+ [0-9]{2}' | \
  grep -oE '[0-9]{2}$' | sort | uniq -c
```

### Recover — do NOT force users to re-authorize
The old secret is usually still on disk. **Find it, then re-encrypt the data under the new key.**

```bash
ls -la .env*            # .env.backup.*, .env.bak-*, .env.production, .env.broken-*
```
Test each candidate's `JWT_SECRET` against a stored ciphertext; whichever decrypts is the old key.
Then, for each row: `decrypt(old)` → `encrypt(current)` → write back.

**Rules:** back up the column into a `*_bak_<date>` table first; dry-run the whole set and require
0 failures before writing; re-encrypt the *data* — **never** restore the old `JWT_SECRET`, which
would invalidate every live session.

### Do not change `JWT_SECRET` without
1. re-encrypting `agents.google_refresh_token` + `agents.email_smtp_password`, or
2. accepting that all 15 members must reconnect Google and re-enter email passwords.

---

## Fault B — `invalid_request: Could not determine client ID from request`

The tokens decrypt fine; Google rejects the exchange because the **OAuth client credentials are
missing**. Check before assuming tokens are revoked:

```bash
grep -cE "^GOOGLE_CLIENT_ID=|^GOOGLE_CLIENT_SECRET=" .env   # expect 2
```

### Where they live
GCP project **Panditji** (`gen-lang-client-0714891689`, number `1007436351560`) →
**APIs & Services → Credentials → OAuth 2.0 Client IDs → "RealtyPandit Web"** (Web application).

Registered redirect URIs — these must match `google_oauth.ts` exactly:
- `https://api.realtypandit.in/api/team/google/callback` (Calendar/Tasks connect)
- `https://api.realtypandit.in/auth/google/callback` (Sign-in)

Both are the code's built-in defaults, so `GOOGLE_OAUTH_REDIRECT` / `GOOGLE_SIGNIN_REDIRECT` only
need setting if they ever diverge.

### Recovering a lost client secret
Google **no longer lets you view an existing secret** — only the last 4 characters. You must
**Add secret** on the same client.

**This is safe:** refresh tokens are bound to the **client ID**, not the secret, so existing tokens
keep working. Google allows 2 secrets for rotation and the old one stays enabled meanwhile.
Afterwards, **disable + delete the old secret** — Google warns that holding two raises risk.

### Verify (the only proof that counts)
Run a real refresh-token exchange for every agent against `https://oauth2.googleapis.com/token`.
Expect `token refresh OK: N / N`.

---

## ⚠ Verification discipline (learned the hard way)

These errors are driven by **5-minute cron sweeps**, so a short sample lands between runs and shows
zero. A 90-second window once "proved" a fix that was still fully broken.

**Watch for at least 5 minutes, and compare against the known rate.** At ~1.5 errors/min, a clean
5-minute window means ~8 expected errors did not occur — that is evidence. Better still, break the
counts down **per hour** and show the drop to zero at the moment of the fix.

---

## Outage history

### 2026-07-13 → 2026-07-22 — Calendar/Tasks dead for all 15 members
Two stacked faults, each masking the other:
1. `JWT_SECRET` had been rotated → all 15 `google_refresh_token` values undecryptable
   (168–208 errors/hour, ~2,200/day).
2. `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` were **absent** from `.env`, all 6 `.env` backups,
   all 3 ecosystem configs, the pm2 dump and the running process env.

Fixing (1) alone just revealed (2). Root cause of the disappearance: an environment rebuild on
**13 July** — the server still carries `.env.broken-1783916302` and
`ecosystem.config.js.bak-1783916439` from that day (the same day the WABA lock began).

**Fix:** old `JWT_SECRET` recovered from `.env.backup.1778681772`; 15 tokens decrypted and
re-encrypted under the current key (backup `agents_gtoken_bak_20260722`); client ID read from the
GCP console and a new client secret added to "RealtyPandit Web".
**Confirmed:** `token refresh OK: 15/15`; **+0** errors over a 5-minute window; sweeps succeeding.
**No user re-authorization was required.**

**Action still open:** store these credentials in a password manager. They vanished once with no
copy anywhere on the server.
