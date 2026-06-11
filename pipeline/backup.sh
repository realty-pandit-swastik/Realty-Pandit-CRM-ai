#!/bin/bash
# backup.sh
# Backs up: PostgreSQL DB + server source code to local machine
# Run from: clients/sunny-sharma/projects/reality-pandit/
# Usage: bash pipeline/backup.sh
# Schedule: Add to Windows Task Scheduler or cron

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backups"
SERVER="root@72.62.231.224"
KEY="/tmp/rp_key"
SSH="ssh -i $KEY -o ConnectTimeout=10"
SCP="scp -i $KEY"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$SCRIPT_DIR/backup.log"

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Realty Pandit — Backup Tool${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# ── Step 0: Setup ─────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
log "INFO  Backup started — $DATE"

# Copy SSH key
cp "$HOME/.ssh/realty_pandit_key" /tmp/rp_key 2>/dev/null && chmod 600 /tmp/rp_key
log "INFO  SSH key ready"

# Check connection
log "INFO  Checking server connection..."
if ! $SSH $SERVER "echo ok" > /dev/null 2>&1; then
    log "ERROR Cannot connect to server $SERVER"
    echo -e "${RED}❌ Cannot connect to server${NC}"
    exit 1
fi
log "OK    Connected to $SERVER"

# ── Step 1: PostgreSQL Database Backup ────────────────────────────────────────
echo ""
echo -e "${YELLOW}[1/3] Backing up database...${NC}"

DB_FILE="$BACKUP_DIR/db_${DATE}.sql"

# Use pg_dump on server, stream to local
$SSH $SERVER "pg_dump -U realty_user -d reality_pandit --clean --if-exists" > "$DB_FILE" 2>/dev/null

if [ -s "$DB_FILE" ]; then
    DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
    log "OK    Database backup: db_${DATE}.sql ($DB_SIZE)"
    echo -e "${GREEN}✅ Database backed up: $DB_FILE ($DB_SIZE)${NC}"
else
    log "WARN  Database backup may be empty — check permissions"
    echo -e "${YELLOW}⚠️  Database backup may be empty${NC}"
fi

# ── Step 2: Source Code Backup ────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[2/3] Backing up server source code...${NC}"

CODE_FILE="$BACKUP_DIR/code_${DATE}.tar.gz"

# Tar server source dirs (excluding build artifacts)
$SSH $SERVER "cd /var/www/realty-pandit && tar -czf /tmp/rp-backup-code.tar.gz \
    --exclude='backend/node_modules' \
    --exclude='website/node_modules' \
    --exclude='website/.next' \
    --exclude='frontend/node_modules' \
    --exclude='frontend/dist' \
    backend/src backend/prisma backend/package.json \
    website/src website/public website/package.json \
    frontend/src frontend/package.json \
    2>/dev/null" || true

$SCP $SERVER:/tmp/rp-backup-code.tar.gz "$CODE_FILE" 2>/dev/null
$SSH $SERVER "rm -f /tmp/rp-backup-code.tar.gz" 2>/dev/null || true

if [ -s "$CODE_FILE" ]; then
    CODE_SIZE=$(du -h "$CODE_FILE" | cut -f1)
    log "OK    Code backup: code_${DATE}.tar.gz ($CODE_SIZE)"
    echo -e "${GREEN}✅ Code backed up: $CODE_FILE ($CODE_SIZE)${NC}"
else
    log "WARN  Code backup may be empty"
    echo -e "${YELLOW}⚠️  Code backup may be empty${NC}"
fi

# ── Step 3: Rotate old backups (keep last 7) ──────────────────────────────────
echo ""
echo -e "${YELLOW}[3/3] Rotating old backups (keeping last 7)...${NC}"

# Rotate DB backups
DB_COUNT=$(ls "$BACKUP_DIR"/db_*.sql 2>/dev/null | wc -l)
if [ "$DB_COUNT" -gt 7 ]; then
    ls -t "$BACKUP_DIR"/db_*.sql | tail -n +8 | xargs rm -f
    REMOVED=$((DB_COUNT - 7))
    log "INFO  Removed $REMOVED old DB backups"
fi

# Rotate code backups
CODE_COUNT=$(ls "$BACKUP_DIR"/code_*.tar.gz 2>/dev/null | wc -l)
if [ "$CODE_COUNT" -gt 7 ]; then
    ls -t "$BACKUP_DIR"/code_*.tar.gz | tail -n +8 | xargs rm -f
    REMOVED=$((CODE_COUNT - 7))
    log "INFO  Removed $REMOVED old code backups"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ BACKUP COMPLETE!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Backup files:${NC}"
echo "  DB:   $DB_FILE"
echo "  Code: $CODE_FILE"
echo ""
echo -e "${BLUE}All backups in $BACKUP_DIR:${NC}"
ls -lh "$BACKUP_DIR" 2>/dev/null | grep -v '^total' | grep -v '^d' | head -20
echo ""

log "INFO  Backup complete"
