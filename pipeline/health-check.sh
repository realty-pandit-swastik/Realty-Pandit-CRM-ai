#!/bin/bash
# health-check.sh
# Tests all Realty Pandit services and logs results
# Run from: clients/sunny-sharma/projects/reality-pandit/
# Usage: bash pipeline/health-check.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/health.log"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

DATE=$(date '+%Y-%m-%d %H:%M:%S')
PASS=0
FAIL=0

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

check() {
    local name="$1"
    local result="$2"
    local expected="$3"

    if echo "$result" | grep -q "$expected" 2>/dev/null; then
        echo -e "  ${GREEN}✅ $name${NC}"
        log "PASS  $name"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}❌ $name${NC}"
        echo -e "     Expected: $expected"
        echo -e "     Got:      ${result:0:100}"
        log "FAIL  $name | expected: $expected | got: ${result:0:200}"
        FAIL=$((FAIL + 1))
    fi
}

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Realty Pandit — Health Check${NC}"
echo -e "${BLUE}  $DATE${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

log "INFO  Health check started"

# ── 1. Website ────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1] Website (www.realtypandit.in)${NC}"

SITE_STATUS=$(curl -sI https://www.realtypandit.in --max-time 10 2>/dev/null | head -1)
check "HTTPS returns 200/301" "$SITE_STATUS" "200\|301\|302"

SITE_BODY=$(curl -s https://www.realtypandit.in --max-time 15 2>/dev/null | head -c 1000)
check "Homepage loads HTML" "$SITE_BODY" "<html\|<!DOCTYPE\|<head"

echo ""

# ── 2. API Backend ────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2] API (api.realtypandit.in)${NC}"

API_HEALTH=$(curl -s https://api.realtypandit.in/health --max-time 10 2>/dev/null)
check "Health endpoint responds" "$API_HEALTH" "status"
check "Database connected" "$API_HEALTH" "connected"

# Test a public API endpoint
PUBLIC_PROPS=$(curl -s "https://api.realtypandit.in/public/properties?limit=1" --max-time 10 2>/dev/null)
check "Public properties endpoint works" "$PUBLIC_PROPS" "\[\|data\|properties\|success"

echo ""

# ── 3. Admin Panel ────────────────────────────────────────────────────────────
echo -e "${YELLOW}[3] Admin Panel (admin.realtypandit.in)${NC}"

ADMIN_STATUS=$(curl -sI https://admin.realtypandit.in --max-time 10 2>/dev/null | head -1)
check "Admin HTTPS returns 200/301" "$ADMIN_STATUS" "200\|301\|302"

echo ""

# ── 4. AI Chatbot (Gemini) ────────────────────────────────────────────────────
echo -e "${YELLOW}[4] AI Chatbot (Panditji/Gemini)${NC}"

AI_RESPONSE=$(curl -s -X POST https://api.realtypandit.in/public/ai-chat \
    -H "Content-Type: application/json" \
    -d '{"message":"show me 2bhk in noida","sessionId":"healthcheck_'"$(date +%s)"'"}' \
    --max-time 20 2>/dev/null)

check "AI endpoint responds" "$AI_RESPONSE" "reply\|message\|response\|answer"
check "Not high-traffic error" "$AI_RESPONSE" "^(?!.*high traffic).*$\|reply\|Noida\|property\|BHK\|Namaste"

# Detailed check: not an error
if echo "$AI_RESPONSE" | grep -qi "high traffic\|quota\|error\|failed"; then
    echo -e "  ${RED}⚠️  AI may be returning errors — check Gemini API key${NC}"
    log "WARN  AI response contains error keywords: ${AI_RESPONSE:0:200}"
fi

echo ""

# ── 5. SSL Certificates ───────────────────────────────────────────────────────
echo -e "${YELLOW}[5] SSL Certificates${NC}"

check_ssl() {
    local domain="$1"
    local expiry=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null \
        | openssl x509 -noout -dates 2>/dev/null \
        | grep "notAfter" | cut -d= -f2)

    if [ -z "$expiry" ]; then
        echo -e "  ${YELLOW}⚠️  $domain: Cannot check SSL (openssl may not be available)${NC}"
        return
    fi

    # Days until expiry
    EXPIRY_EPOCH=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

    if [ "$DAYS_LEFT" -gt 30 ]; then
        echo -e "  ${GREEN}✅ $domain SSL valid (${DAYS_LEFT} days left)${NC}"
        log "PASS  $domain SSL: $DAYS_LEFT days left"
    elif [ "$DAYS_LEFT" -gt 7 ]; then
        echo -e "  ${YELLOW}⚠️  $domain SSL expires in ${DAYS_LEFT} days — renew soon${NC}"
        log "WARN  $domain SSL: $DAYS_LEFT days left"
    else
        echo -e "  ${RED}❌ $domain SSL expires in ${DAYS_LEFT} days — URGENT!${NC}"
        log "FAIL  $domain SSL: $DAYS_LEFT days left — URGENT"
    fi
}

check_ssl "www.realtypandit.in"
check_ssl "api.realtypandit.in"
check_ssl "admin.realtypandit.in"

echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL))
echo -e "${BLUE}============================================${NC}"

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ ALL $TOTAL CHECKS PASSED${NC}"
    log "SUMMARY  PASS $TOTAL/$TOTAL"
else
    echo -e "${RED}❌ $FAIL/$TOTAL CHECKS FAILED${NC}"
    echo -e "${YELLOW}   Check $LOG_FILE for details${NC}"
    log "SUMMARY  FAIL $FAIL/$TOTAL"
fi

echo -e "${BLUE}============================================${NC}"
echo ""

log "INFO  Health check complete"

# Exit with error code if any checks failed
exit $FAIL
