# Realty Pandit — Deployment Pipeline

**Server**: 72.62.231.224
**Project**: `clients/sunny-sharma/projects/reality-pandit/`

---

## Quick Start

### Windows (double-click to run):

| File | Action |
|------|--------|
| `START-PIPELINE.bat` | Start auto-deploy watcher (watches agents/ for changes) |
| `BACKUP-NOW.bat` | Create immediate backup of DB + code |
| `HEALTH-CHECK.bat` | Check all 3 domains and services |

### Git Bash / WSL:

```bash
# Auto-deploy watcher
bash pipeline/watch-and-deploy.sh

# Backup now
bash pipeline/backup.sh

# Health check
bash pipeline/health-check.sh
```

---

## Tool Details

### 1. watch-and-deploy.sh (Auto Deploy)

Watches the `agents/` directory for file changes and automatically deploys to the server.

**Features:**
- Uses `inotifywait` on WSL/Linux for instant detection
- Falls back to polling (every 10s) on Git Bash/Windows
- 60-second cooldown between deploys (prevents rapid-fire)
- Logs all activity to `pipeline/deploy.log`

**How it works:**
1. Detects any `.ts`, `.tsx`, `.json` change in `agents/`
2. Waits for cooldown (60s) to batch multiple changes
3. Runs `deploy-now.sh` automatically
4. Logs result (success/failure) to `deploy.log`

**Usage:**
```bash
# Start watcher (runs forever until Ctrl+C)
bash pipeline/watch-and-deploy.sh

# Or on Windows, double-click:
START-PIPELINE.bat
```

---

### 2. backup.sh (Database + Code Backup)

Creates timestamped backups of the production database and server source code.

**What gets backed up:**
- PostgreSQL database (`reality_pandit`) → `pipeline/backups/db_YYYYMMDD_HHMMSS.sql`
- Server source code → `pipeline/backups/code_YYYYMMDD_HHMMSS.tar.gz`

**Auto-rotation:** Keeps last 7 backups, deletes older ones automatically.

**Usage:**
```bash
bash pipeline/backup.sh
# Or double-click: BACKUP-NOW.bat
```

**Schedule daily backups (Windows Task Scheduler):**
1. Open Task Scheduler
2. Create Basic Task
3. Name: "Realty Pandit Daily Backup"
4. Trigger: Daily at 2:00 AM
5. Action: Start a program
6. Program: `C:\Program Files\Git\bin\bash.exe`
7. Arguments: `"C:\Users\Varchasv Bhardwaj\Project\clients\sunny-sharma\projects\reality-pandit\pipeline\backup.sh"`

---

### 3. health-check.sh (Service Monitor)

Tests all Realty Pandit services and reports pass/fail.

**Checks:**
1. Website (`https://www.realtypandit.in`) — returns 200 OK?
2. API health (`https://api.realtypandit.in/health`) — DB connected?
3. Public API (`/public/properties`) — endpoint works?
4. Admin panel (`https://admin.realtypandit.in`) — returns 200?
5. AI Chatbot (Gemini) — real response (not "high traffic")?
6. SSL certificates — days until expiry?

**Usage:**
```bash
bash pipeline/health-check.sh
# Or double-click: HEALTH-CHECK.bat
```

**Exit code:** 0 if all pass, >0 if any fail (can use in scripts)

---

## Log Files

| Log | Contents |
|-----|---------|
| `pipeline/deploy.log` | All auto-deploy activity |
| `pipeline/backup.log` | All backup activity |
| `pipeline/health.log` | Health check history |

---

## Backup Files

Located in `pipeline/backups/`:

```
pipeline/backups/
├── db_20260216_143022.sql      ← PostgreSQL dump
├── db_20260217_143022.sql
├── code_20260216_143022.tar.gz ← Source code archive
├── code_20260217_143022.tar.gz
└── ...
```

**Restore from backup:**
```bash
# Restore database
scp -i /tmp/rp_key pipeline/backups/db_20260216_143022.sql root@72.62.231.224:/tmp/
ssh -i /tmp/rp_key root@72.62.231.224 "psql -U realty_user reality_pandit < /tmp/db_20260216_143022.sql"

# Restore code
scp -i /tmp/rp_key pipeline/backups/code_20260216_143022.tar.gz root@72.62.231.224:/tmp/
ssh -i /tmp/rp_key root@72.62.231.224 "cd /var/www/realty-pandit && tar -xzf /tmp/code_20260216_143022.tar.gz"
```

---

## Troubleshooting

### "Cannot connect to server"
```bash
# Verify SSH key
cp "$HOME/.ssh/realty_pandit_key" /tmp/rp_key && chmod 600 /tmp/rp_key
ssh -i /tmp/rp_key root@72.62.231.224 "echo connected"
```

### "inotifywait not found" (WSL)
```bash
sudo apt-get install inotify-tools
```

### "bash not found" (Windows)
Install Git for Windows: https://git-scm.com/download/win

### Deploy fails
Check the log:
```bash
tail -50 pipeline/deploy.log
```

### Backup empty
Check database credentials on server:
```bash
ssh -i /tmp/rp_key root@72.62.231.224 "cat /var/www/realty-pandit/backend/.env | grep DATABASE"
```
