#!/bin/bash
# watch-and-deploy.sh
# Watches agents/ directory for changes and auto-deploys to server
# Run from: clients/sunny-sharma/projects/reality-pandit/
# Usage: bash pipeline/watch-and-deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$SCRIPT_DIR/deploy.log"
DEPLOY_SCRIPT="$PROJECT_DIR/deploy-now.sh"
WATCH_DIR="$PROJECT_DIR/agents"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "$msg" | tee -a "$LOG_FILE"
}

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Realty Pandit — Auto Deploy Watcher${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "  Watching: $WATCH_DIR"
echo -e "  Log:      $LOG_FILE"
echo -e "  Deploy:   $DEPLOY_SCRIPT"
echo -e "${BLUE}  Press Ctrl+C to stop${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

log "INFO  Watch-and-deploy started"

# Copy SSH key once at startup
log "INFO  Preparing SSH key..."
cp "$HOME/.ssh/realty_pandit_key" /tmp/rp_key 2>/dev/null && chmod 600 /tmp/rp_key
if [ $? -eq 0 ]; then
    log "INFO  SSH key ready at /tmp/rp_key"
else
    log "WARN  Could not copy SSH key — deploy may fail"
fi

# ── Method 1: inotifywait (Linux/WSL) ─────────────────────────────────────────
deploy_with_inotify() {
    log "INFO  Using inotifywait for file watching (WSL/Linux mode)"

    if ! command -v inotifywait &>/dev/null; then
        log "WARN  inotifywait not found — install: sudo apt-get install inotify-tools"
        return 1
    fi

    LAST_DEPLOY=0
    COOLDOWN=30  # seconds between deploys

    while true; do
        # Watch for any changes in agents/ (excluding build artifacts)
        inotifywait -r -e close_write,create,delete,move \
            --exclude '(node_modules|\.next|dist|\.git|\.env|\.log)' \
            "$WATCH_DIR" 2>/dev/null

        NOW=$(date +%s)
        ELAPSED=$((NOW - LAST_DEPLOY))

        if [ $ELAPSED -lt $COOLDOWN ]; then
            log "INFO  Change detected but cooldown active (${ELAPSED}s/${COOLDOWN}s) — skipping"
            continue
        fi

        log "INFO  Change detected! Starting deploy..."
        LAST_DEPLOY=$NOW

        if bash "$DEPLOY_SCRIPT" >> "$LOG_FILE" 2>&1; then
            log "OK    Deploy succeeded"
        else
            log "ERROR Deploy failed — check $LOG_FILE for details"
        fi
    done
}

# ── Method 2: Polling loop (Git Bash/Windows) ─────────────────────────────────
deploy_with_polling() {
    log "INFO  Using polling for file watching (Git Bash/Windows mode)"

    POLL_INTERVAL=10  # seconds between polls
    COOLDOWN=60       # seconds between deploys
    LAST_DEPLOY=0

    # Get initial checksum of agents/ directory
    get_checksum() {
        find "$WATCH_DIR" -type f \
            ! -path "*/node_modules/*" \
            ! -path "*/.next/*" \
            ! -path "*/dist/*" \
            ! -path "*/.git/*" \
            ! -name "*.log" \
            -newer "$SCRIPT_DIR/deploy.log" 2>/dev/null \
            -exec stat -c '%Y %n' {} \; 2>/dev/null | md5sum | cut -d' ' -f1
    }

    # Alternative: track modification times
    get_latest_mtime() {
        find "$WATCH_DIR" -type f \
            ! -path "*/node_modules/*" \
            ! -path "*/.next/*" \
            ! -path "*/dist/*" \
            ! -path "*/.git/*" \
            ! -name "*.log" \
            -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1
    }

    LAST_MTIME=$(get_latest_mtime)
    log "INFO  Initial state captured. Polling every ${POLL_INTERVAL}s..."

    while true; do
        sleep $POLL_INTERVAL

        CURRENT_MTIME=$(get_latest_mtime)

        if [ "$CURRENT_MTIME" != "$LAST_MTIME" ]; then
            NOW=$(date +%s)
            ELAPSED=$((NOW - LAST_DEPLOY))

            if [ $ELAPSED -lt $COOLDOWN ]; then
                log "INFO  Change detected (cooldown: ${ELAPSED}s/${COOLDOWN}s) — waiting..."
                LAST_MTIME=$CURRENT_MTIME
                continue
            fi

            log "INFO  Change detected! Starting deploy..."
            LAST_MTIME=$CURRENT_MTIME
            LAST_DEPLOY=$NOW

            echo "" >> "$LOG_FILE"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$LOG_FILE"
            log "INFO  DEPLOY START"

            if bash "$DEPLOY_SCRIPT" >> "$LOG_FILE" 2>&1; then
                log "OK    DEPLOY SUCCESS"
                echo -e "${GREEN}✅ Deploy succeeded at $(date '+%H:%M:%S')${NC}"
            else
                log "ERROR DEPLOY FAILED"
                echo -e "${RED}❌ Deploy failed at $(date '+%H:%M:%S') — check pipeline/deploy.log${NC}"
            fi

            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$LOG_FILE"
        fi
    done
}

# Choose method based on available tools
if command -v inotifywait &>/dev/null; then
    deploy_with_inotify
else
    deploy_with_polling
fi
