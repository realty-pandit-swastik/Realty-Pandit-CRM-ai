# Realty Pandit — Claude Project Knowledge Base
> READ THIS FILE AT THE START OF EVERY SESSION
> Last updated: 2026-02-16

---

## 1. PROJECT IDENTITY

| Field | Value |
|-------|-------|
| Client | Sunny Sharma |
| Project | Realty Pandit (formerly Reality Pandit) |
| Domain | https://www.realtypandit.in |
| Bot Name | Panditji (AI Property Assistant) |
| AI Brain | Google Gemini (`gemini-2.5-pro`) |
| Local Path | `clients/sunny-sharma/projects/reality-pandit/` |

---

## 2. SERVER ACCESS

| Field | Value |
|-------|-------|
| Server IP | 72.62.231.224 |
| OS | Ubuntu 24.04 LTS |
| SSH User | root |
| SSH Key (local) | `~/.ssh/realty_pandit_key` (has spaces in path!) |
| SSH Key (workaround) | Copy to `/tmp/rp_key` before use |

**CRITICAL — SSH Key Has Spaces in Path:**
```bash
# Run this BEFORE any SSH/SCP command
cp "$HOME/.ssh/realty_pandit_key" /tmp/rp_key && chmod 600 /tmp/rp_key

# Then SSH with:
ssh -i /tmp/rp_key root@72.62.231.224

# Or SCP with:
scp -i /tmp/rp_key file.txt root@72.62.231.224:/path/
```

---

## 3. SERVER DIRECTORY STRUCTURE

```
/var/www/realty-pandit/           ← ROOT (NOT realtypandit, NOT realty_pandit)
├── backend/                       ← Express.js API — PM2: realty-backend (port 7071)
│   ├── src/                       ← TypeScript source
│   ├── prisma/                    ← Schema + migrations
│   ├── node_modules/
│   ├── dist/                      ← Compiled JS (built by tsc)
│   ├── .env                       ← PRODUCTION env vars (never overwrite!)
│   └── package.json
├── website/                       ← Next.js 16 — PM2: realty-website (port 3000)
│   ├── src/                       ← TypeScript source
│   ├── .next/                     ← Built output
│   ├── node_modules/
│   ├── .env.local                 ← PRODUCTION env vars
│   └── package.json
└── frontend/                      ← React/Vite Admin — PM2: realty-admin (port 5173)
    ├── src/                       ← TypeScript source
    ├── dist/                      ← Vite build output
    ├── node_modules/
    └── package.json
```

**LOCAL DEV directories (agents/* prefix):**
```
agents/backend/   →  syncs to →  /var/www/realty-pandit/backend/
agents/website/   →  syncs to →  /var/www/realty-pandit/website/
agents/frontend/  →  syncs to →  /var/www/realty-pandit/frontend/
```

---

## 4. PM2 PROCESS NAMES (EXACT)

| PM2 Name | Port | Service |
|----------|------|---------|
| `realty-backend` | 7071 | Express.js API |
| `realty-website` | 3000 | Next.js Website |
| `realty-admin` | 5173 | React/Vite Admin |

**CRITICAL — Website MUST run on port 3000 (Nginx proxies to it)**

---

## 5. NGINX → PORT MAPPINGS

| Domain | Proxies To |
|--------|------------|
| https://www.realtypandit.in | localhost:3000 |
| https://realtypandit.in | localhost:3000 |
| https://api.realtypandit.in | localhost:7071 |
| https://admin.realtypandit.in | localhost:5173 |

SSL: Let's Encrypt, auto-renews, certs at `/etc/letsencrypt/live/`

---

## 6. DATABASE

| Field | Value |
|-------|-------|
| Engine | PostgreSQL 16 (native install, NOT Docker) |
| Port | 5432 (default) |
| Database | `reality_pandit` |
| User | `realty_user` |
| Host | `localhost` |

**No Docker on this server.** PostgreSQL runs as a native systemd service.

```bash
# Check DB status
ssh -i /tmp/rp_key root@72.62.231.224 "systemctl status postgresql"

# Connect to DB
ssh -i /tmp/rp_key root@72.62.231.224 "sudo -u postgres psql -d reality_pandit"

# Backup DB
ssh -i /tmp/rp_key root@72.62.231.224 "pg_dump -U realty_user reality_pandit > /tmp/backup.sql"
```

---

## 7. GEMINI AI

| Field | Value |
|-------|-------|
| Model | `gemini-2.5-pro` |
| Working Key | `AIzaSyBrV65qRcUvY_eudk-D8VeZvB6bBpszIE4` |
| Old Key (broken) | `AIzaSyBTHWYANUIrO-RJh7EphAT2LQ8XMRrLwSs` (quota exceeded) |
| Status | FIXED (2026-02-16) |

**Test Gemini AI:**
```bash
curl -X POST https://api.realtypandit.in/public/ai-chat \
  -H "Content-Type: application/json" \
  -d '{"message":"2bhk flat in Noida","sessionId":"test123"}'
```
Expected: Real property recommendations, NOT "high traffic" error

---

## 8. DEPLOY COMMAND (FROM LOCAL MACHINE)

```bash
# Step 1: Copy SSH key (do this every time)
cp "$HOME/.ssh/realty_pandit_key" /tmp/rp_key && chmod 600 /tmp/rp_key

# Step 2: Deploy
cd "c:\Users\Varchasv Bhardwaj\Project\clients\sunny-sharma\projects\reality-pandit"
bash deploy-now.sh
```

**What deploy-now.sh does:**
1. Packages agents/* source code (no node_modules)
2. Uploads to server via SCP
3. Syncs to active server directories
4. Runs npm install + prisma migrate
5. Rebuilds website (Next.js build)
6. Rebuilds admin (Vite build)
7. Restarts all PM2 processes

**Time: ~5-8 minutes**

---

## 9. QUICK FIX COMMANDS

```bash
KEY=/tmp/rp_key
SERVER=root@72.62.231.224

# Check all services
ssh -i $KEY $SERVER "pm2 list"

# View logs
ssh -i $KEY $SERVER "pm2 logs realty-backend --lines 50"
ssh -i $KEY $SERVER "pm2 logs realty-website --lines 50"
ssh -i $KEY $SERVER "pm2 logs realty-admin --lines 50"

# Restart services
ssh -i $KEY $SERVER "pm2 restart realty-backend --update-env"
ssh -i $KEY $SERVER "pm2 restart realty-website --update-env"
ssh -i $KEY $SERVER "pm2 restart realty-admin --update-env"
ssh -i $KEY $SERVER "pm2 restart all"

# Health check
curl https://api.realtypandit.in/health
curl -I https://www.realtypandit.in

# View backend env
ssh -i $KEY $SERVER "cat /var/www/realty-pandit/backend/.env"

# Edit server env (CAREFUL - production!)
ssh -i $KEY $SERVER "nano /var/www/realty-pandit/backend/.env"

# Nginx status + reload
ssh -i $KEY $SERVER "systemctl status nginx"
ssh -i $KEY $SERVER "systemctl reload nginx"

# Database backup
ssh -i $KEY $SERVER "pg_dump -U realty_user reality_pandit" > pipeline/backups/manual_$(date +%Y%m%d).sql

# Fix restart loop (PM2 count climbing)
ssh -i $KEY $SERVER "pm2 describe realty-backend | grep restart"
```

---

## 10. SSOT RULES (SINGLE SOURCE OF TRUTH)

**Every data write MUST follow this pattern:**
1. **Upsert Contact** — phone_number is PRIMARY KEY (E.164 format: +91XXXXXXXXXX)
2. **Write to domain table** — (ScheduledVisit, WebsiteLead, NewsletterSubscriber, etc.)
3. **Log to Interaction** — with channel, direction, content, metadata

**Contact Types:** BUYER_TENANT, SELLER_LANDLORD, PARTNER_AGENT, MANAGEMENT, UNKNOWN

**Terminology (DEC-001):**
- Sale = Buyer/Sell/Purchase
- Rent = Tenant/Rent/Lease

**Never create a record without logging an Interaction.**

---

## 11. ARCHITECTURE OVERVIEW

```
WhatsApp/SMS → Twilio → /webhooks → message_router.ts → Panditji AI → LLM (Gemini)
Website Chat → /public/ai-chat → ai_chat.ts → llm.ts → Gemini
Admin Panel → /api/* → JWT auth → RBAC → Prisma → PostgreSQL
External Leads → /external/* → API key auth → Lead intake → SSOT
```

**Stack:**
- Backend: Express.js + TypeScript + Prisma ORM
- Website: Next.js 16 App Router + Tailwind CSS v4 + Framer Motion 12
- Admin: React 19 + Vite + TypeScript
- DB: PostgreSQL 16
- AI: Google Gemini 2.5 Pro
- Process Manager: PM2
- Reverse Proxy: Nginx
- SSL: Let's Encrypt

---

## 12. PENDING CLIENT DELIVERABLES

| Item | Status | Impact |
|------|--------|--------|
| WhatsApp Business API credentials | NOT PROVIDED | Panditji WhatsApp bot offline |
| Cloudinary API keys | NOT PROVIDED | Photo upload shows "coming soon" |
| Real property listings | NOT PROVIDED | City/locality pages use mock data |
| Social media links | NOT PROVIDED | JSON-LD schema incomplete |
| Google Analytics ID | NOT PROVIDED | No traffic tracking |

---

## 13. KNOWN BUGS & ISSUES

| Bug | File | Status |
|-----|------|--------|
| Trust proxy causing 4000+ restarts/day | `agents/backend/src/app.ts` | FIXED 2026-02-16 |
| dealer.ts wrong import path | `agents/backend/src/routes/dealer.ts` | Pre-existing, non-blocking |
| voice.ts duplicate prisma | `agents/backend/src/routes/voice.ts` | Pre-existing, non-blocking |
| WhatsApp placeholder number | `agents/website/src/components/home/ServiceTiles.tsx` | Needs real number |
| Gemini key quota exceeded | Server .env | FIXED 2026-02-16 |

---

## 14. PIPELINE TOOLS

Located at: `pipeline/` directory

| Script | Purpose |
|--------|---------|
| `watch-and-deploy.sh` | Auto-deploy on file save (Git Bash/WSL) |
| `backup.sh` | DB + code backup to local machine |
| `health-check.sh` | Monitor all 3 domains |
| `START-PIPELINE.bat` | Windows: start auto-deploy watcher |
| `BACKUP-NOW.bat` | Windows: one-click backup |

---

## 15. PREVIOUS SESSION LOG

| Date | Action | Result |
|------|--------|--------|
| 2026-02-16 | Fixed website port (was 7575, now 3000) | All 3 domains working |
| 2026-02-16 | Updated Gemini API key on server | AI chat working |
| 2026-02-16 | Created deploy-now.sh | Deployment working |
| 2026-02-16 | Fixed trust proxy bug in app.ts | Backend restarts should stop |

---

*This file is maintained by Claude. Update the "Previous Session Log" after each session.*
