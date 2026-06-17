---
name: reference_origin_accessibility_diagnosis
description: "Site/PWA 'not accessible from some phones/networks' = Hostinger UPSTREAM blackhole, NOT a server-side issue. Origin (nginx/TLS/cert/rate-limits) verified fully clean 2026-06-17 — don't re-chase those. Fix = Cloudflare edge or Hostinger ticket; origin tuning can't lift an upstream block."
metadata:
  type: project
---

# "Not accessible from some phones/networks" — diagnosed 2026-06-17

Root cause = **Hostinger's UPSTREAM (network-edge) DDoS mitigation blackholing source IPs**, NOT the server. Proven: a client IP got full timeouts on **all ports (22/80/443)** while the VPS was healthy, and that IP was **not** in fail2ban or iptables → the drop is above the VPS. A shared mobile-carrier NAT egress IP (many users) can look "bursty" and trip it → that whole network loses access. See [[feedback_hostinger_ssh_rate_block]].

**The origin is CLEAN — do NOT re-investigate these (all verified on the box 2026-06-17):**
- Server healthy: 47d uptime, nginx active, all PM2 apps online (realty-backend ×2 cluster, realty-admin, panditji-voice, website next-server :3000, api :7071).
- **Rate limits NOT biting:** `api_limit` 30r/s burst 50, `web_limit` 60r/s burst 30 (keyed on `$binary_remote_addr`); **0× 503 in access logs, 0 "limiting requests" events.** Generous; not the cause.
- **TLS broadly compatible:** `ssl_protocols TLSv1.2 TLSv1.3`; modern AEAD ciphers (AES-GCM + CHACHA20). Fine for Android 5+/iOS.
- **Cert optimally configured:** `realtypandit.in` cert covers apex+www+admin+api (one cert), **ECDSA P-256**, served as a **4-cert chain → LE "YE2" → "ISRG Root YE" → ISRG Root X2 → cross-signed by ISRG Root X1**, `Verify return code: 0`. Max-compat modern LE chain (works ≥ ~Android 7.1.1 / iOS 9). Only pre-2016 Android can't trust any LE cert post-2024 (industry-wide, unfixable here). `key_type=ecdsa` in renewal conf.
- DNS: all 4 names → single IPv4 `72.62.231.224`, **no AAAA/IPv6** (80/443 are IPv4-only; box has IPv6 on :22 only).
- No CDN/edge — single origin IP, so it IS the thing getting blackholed.

**Therefore origin-only hardening CANNOT fix this** (an upstream block isn't liftable from nginx). Real levers:
1. **Cloudflare in front** (definitive fix — hides origin IP so end-users hit CF, Hostinger only sees CF's steady IPs; restores real client IP; compatible TLS). Runbook: `docs/runbooks/cloudflare-cutover.md`. (Owner declined 2026-06-16; re-pitch now that origin is proven clean. DNS is at Hostinger hPanel — CF just needs a nameserver change.)
2. **Hostinger support ticket / hPanel DDoS settings** — ask them to relax/whitelist the auto-blackhole threshold for this VPS (draft in the 2026-06-16 chat).
3. (Minor) add IPv6 AAAA + `listen [::]:443` — gives a second path that may dodge the IPv4-focused mitigation.

**Cannot "unblock the old IP" server-side** — it's not banned on the box; the block is upstream and auto-clears in minutes.
