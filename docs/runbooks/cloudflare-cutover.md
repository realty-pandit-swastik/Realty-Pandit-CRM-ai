# Runbook — Put Realty Pandit behind Cloudflare (fix "not accessible from some phones/networks")

**Created:** 2026-06-16
**Status:** DRAFT — awaiting owner go-ahead + DNS access
**Problem it fixes:** Intermittent "site not accessible from some phones / some networks." Live evidence (2026-06-16): the single origin `72.62.231.224` was unreachable on **all ports incl. SSH** from 3 independent networks right after a traffic burst, matching Hostinger's upstream DDoS mitigation blackholing source IPs (`feedback_hostinger_ssh_rate_block`). A busy mobile-carrier NAT egress IP (shared by many users) looks "bursty" → whole networks get blackholed. Compounded by: single origin IP (no edge), nginx per-IP rate limits (`web_limit` burst=30 / `api_limit` burst=50) that punish NAT-shared IPs, and aggressive HSTS preload that turns any TLS-trust hiccup into a hard block.

**Core idea:** end-users → Cloudflare edge → origin. Origin only ever sees Cloudflare's steady IPs (no blackhole), real client IPs are restored so rate limits work correctly, and Cloudflare serves broadly-compatible TLS.

---

## Stack facts (must respect)
- 4 names → one VPS `72.62.231.224`, nginx terminates 443 → proxies to apps. One Let's Encrypt cert (`/etc/letsencrypt/live/...`).
  - `realtypandit.in` / `www.realtypandit.in` → Next.js website (:3000, `realty` user PM2)
  - `admin.realtypandit.in` → Vite PWA static (`/var/www/admin/dist`)
  - `api.realtypandit.in` → Express (:7071) — **served on 443**, NOT on :7071 publicly (confirm `VITE_API_BASE_URL=https://api.realtypandit.in`, no port — verified).
- API uses **HttpOnly cookies + CSRF** (same-domain; unaffected by proxying).
- Inbound **webhooks** hit `api.realtypandit.in`: Meta (FB/IG/WhatsApp), 99acres push, MagicBricks push, Housing. These must keep working through Cloudflare.
- PWA service worker (autoUpdate) on admin.

## Prerequisites (owner)
- [ ] Confirm origin is currently UP (hPanel → VPS → Browser Terminal: `pm2 list`, `systemctl status nginx`, `curl -I localhost`).
- [ ] Know where `realtypandit.in` nameservers are managed (Hostinger hPanel domain, or external registrar) and have login.
- [ ] A Cloudflare account (free tier is enough).

---

## Cutover steps

### 1. Add site to Cloudflare (no live impact yet)
1. Cloudflare dashboard → **Add a site** → `realtypandit.in` → Free plan.
2. Let it scan DNS. **Verify every record imported**, especially A records for `@`, `www`, `admin`, `api` → `72.62.231.224`.
3. Set the **orange cloud (Proxied) ON** for `@`, `www`, `admin`, `api`. (errors./other infra subdomains: leave DNS-only/grey if they must bypass.)

### 2. TLS + security settings (BEFORE flipping nameservers)
- **SSL/TLS → Overview → Full (Strict)** (origin has a valid LE cert; do NOT use Flexible — it breaks cookies/redirync loops).
- **SSL/TLS → Edge Certificates:** Minimum TLS = **1.0 or 1.2** (1.2 recommended for security but 1.0 maximizes old-phone reach — pick per audience), TLS 1.3 ON, **Opportunistic Encryption** + **HTTP/3** ON.
- **Security → Settings:** Security Level = **Essentially Off / Low** at first, **Bot Fight Mode = OFF.** ⚠️ Do NOT enable aggressive WAF/bot rules initially — that would re-create the exact "some users blocked" symptom. Tune up later with logs.
- **WAF → custom rules:** add a **Skip** rule for paths `/external/*`, `/webhooks/*`, `/api/*` (skip all managed rules + bot checks) so webhooks + the SPA's API never get challenged.

### 3. Caching (CRM data must stay fresh)
- **Caching → Cache Rules:** add **Bypass cache** for hostnames `api.realtypandit.in` and `admin.realtypandit.in` (live CRM; never serve stale leads/inventory). Cloudflare won't cache cookie'd/non-GET responses anyway, but be explicit.
- Website (`www`) static assets can cache; HTML stays dynamic (Next.js sets cache headers).

### 4. Flip nameservers (the go-live step — at the registrar)
- Replace the domain's nameservers with the two Cloudflare-assigned ones.
- Propagation is usually minutes (can be up to 24h). During propagation some users hit Cloudflare, some still hit origin directly — both work, so **no downtime**.

### 5. Origin hardening (AFTER Cloudflare is serving — via one careful SSH session / hPanel terminal)
- **Restore real client IP** so rate limits + logs see the user, not Cloudflare. In nginx `http{}`:
  - `set_real_ip_from` for each Cloudflare IP range (https://www.cloudflare.com/ips), `real_ip_header CF-Connecting-IP;`
- **Lock the origin to Cloudflare only** (stops attackers hitting the bare IP and re-tripping Hostinger): in each 443 server block, `allow` Cloudflare ranges + `deny all;` (or a firewall rule). Keep SSH open to your own IP.
- Re-check the per-IP rate-limit zones (`web_limit`/`api_limit`) now that they key on real IPs — raise bursts if still tight.
- (Optional) add `listen [::]:443 ssl;` for IPv6 once Cloudflare is in front.

### 6. Verify
- [ ] `https://www`, `/admin`, `/api/health` all 200 **through Cloudflare** (check response header `cf-ray` present).
- [ ] Admin **login works** (cookies + CSRF survive the proxy).
- [ ] A **webhook test** delivers (Meta test event or a portal lead) → lead lands.
- [ ] SSL Labs scan → A, trusted on old Android/iOS.
- [ ] Test from **2–3 mobile carriers** + an affected user's phone.
- [ ] GlitchTip clean; no CSRF/cookie 403 spike.

## Rollback
- Revert nameservers at the registrar to the previous values (or in Cloudflare set the records grey-cloud / DNS-only). DNS TTL applies. Because origin still serves directly, rollback is low-risk.

## Notes / gotchas
- If anything calls the API on **`:7071`** directly, it will break (Cloudflare proxies only standard ports). Confirm nothing uses the port.
- Keep nginx's HSTS OR move it to Cloudflare — don't double up inconsistently.
- Don't enable Cloudflare "Under Attack" mode as a default — it JS-challenges everyone (recreates the symptom).
