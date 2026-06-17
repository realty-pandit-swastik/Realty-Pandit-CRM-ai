---
name: feedback_hostinger_ssh_rate_block
description: Many rapid SSH/curl connections trip Hostinger's upstream mitigation and blackhole my IP (all ports incl. ping time out while the server is healthy); batch into single SSH connections, recover via the hPanel browser Terminal
metadata:
  type: feedback
---

Symptom (hit 2026-06-05): from my machine, **every** connection to the prod VPS `72.62.231.224` (ping/ICMP, SSH:22, HTTPS:443) times out at once — `banner exchange: Connection to UNKNOWN port -1` / `connect ... timed out` — while the server stays perfectly healthy (35-day uptime, CPU 3%) and reachable for everyone else (WhatsApp voice calls keep working). The `realty-pandit-qa` MCP (`server_health`) times out the same way.

**Cause:** it is NOT a server-side block. My source IP (dynamic, was `103.127.224.165`) is clean in `fail2ban` (all 4 jails 0 banned), `iptables`, `ipset`, and `ufw`. The block is **Hostinger's upstream network / DDoS mitigation**, which blackholes the source IP at their edge after too many rapid SSH/curl connections in a short window — invisible to the server OS. That's why ICMP dies too. It is **time-based and auto-clears in ~2 minutes**; re-bursting re-trips it (verified — a second flurry of diagnostic SSH calls re-blocked me immediately).

**How to apply:**
- **Prevent:** batch ALL prod work into **single consolidated SSH connections** — one `ssh ... "echo <b64> | base64 -d | bash"` running a whole script — never many rapid sequential `ssh`/`scp`/curl calls. Space connections out. Use the MCP `deploy` tool (its own connection) for deploys.
- **Don't spam retries** while blocked — it prolongs the blackhole. Wait ~2 min, then a single retry.
- **Out-of-band access while blocked** (bypasses my IP entirely): Hostinger hPanel → **VPS** (srv1344620, id `1344620`) → **Manage** → **Terminal** button → opens a browser web console at `mum.hostingervps.com` as `root`, routed through Hostinger's backplane. Login `realtypandit2026@gmail.com` (the user logs in — saved pw was stale). It's a canvas terminal: drive it via Playwright `page.mouse.click` + `page.keyboard.type` + screenshot (no a11y tree). hPanel VPS Overview also confirms server health + firewall rules at a glance.

Related: [[reference_prod_db_script_pattern]] (single-connection Node+Prisma pattern), [[feedback_prod_backend_paths]] (pm2 runs from `/var/www/realty-pandit/backend/`).
