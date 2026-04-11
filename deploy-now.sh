#!/bin/bash
# deploy-now.sh - Direct deployment to server
# Syncs agents/* source code to active server directories

set -e

SERVER="root@72.62.231.224"
REMOTE="/var/www/realty-pandit"
KEY="/tmp/rp_key"
SSH="ssh -i $KEY"
SCP="scp -i $KEY"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🚀 Realty Pandit - Direct Deploy to Server"
echo "============================================"
echo "Server: 72.62.231.224"
echo "Date: $(date)"
echo ""

# ── STEP 1: Verify connection ──────────────────────────────────────────────────
echo -e "${YELLOW}[1/6] Checking connection...${NC}"
if ! $SSH -o ConnectTimeout=5 $SERVER "echo ok" > /dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to server${NC}"; exit 1
fi
echo -e "${GREEN}✅ Connected${NC}"

# ── STEP 2: Package & upload source code ──────────────────────────────────────
echo -e "${YELLOW}[2/6] Packaging source code...${NC}"

TMPFILE="/tmp/rp-deploy-$(date +%s).tar.gz"

# Create tar with ONLY source files (not node_modules, builds, etc.)
tar -czf "$TMPFILE" \
    --exclude='agents/backend/node_modules' \
    --exclude='agents/website/node_modules' \
    --exclude='agents/website/.next' \
    --exclude='agents/frontend/node_modules' \
    --exclude='agents/frontend/dist' \
    --exclude='.git' \
    agents/backend/src \
    agents/backend/prisma \
    agents/backend/package.json \
    agents/backend/tsconfig.json \
    agents/website/src \
    agents/website/public \
    agents/website/package.json \
    agents/website/next.config.* \
    agents/website/tsconfig.json \
    agents/website/tailwind.config.* \
    agents/website/postcss.config.* \
    agents/frontend/src \
    agents/frontend/public \
    agents/frontend/package.json \
    agents/frontend/vite.config.* \
    agents/frontend/tsconfig.json \
    agents/frontend/index.html \
    2>/dev/null || true

FILESIZE=$(du -h "$TMPFILE" | cut -f1)
echo -e "${GREEN}✅ Package ready: $FILESIZE${NC}"

echo -e "${YELLOW}📤 Uploading...${NC}"
$SCP "$TMPFILE" $SERVER:/tmp/rp-deploy.tar.gz
rm "$TMPFILE"
echo -e "${GREEN}✅ Uploaded${NC}"

# ── STEP 3: Extract and sync on server ────────────────────────────────────────
echo -e "${YELLOW}[3/6] Extracting and syncing files on server...${NC}"

$SSH $SERVER << 'REMOTE_SYNC'
set -e

REMOTE="/var/www/realty-pandit"
TMP_EXTRACT="/tmp/rp-deploy-extract"

# Clean up and extract
rm -rf $TMP_EXTRACT
mkdir -p $TMP_EXTRACT
cd $TMP_EXTRACT
tar -xzf /tmp/rp-deploy.tar.gz
rm /tmp/rp-deploy.tar.gz

# Sync backend source
echo "→ Syncing backend source..."
cp -r $TMP_EXTRACT/agents/backend/src/* $REMOTE/backend/src/ 2>/dev/null || true
cp $TMP_EXTRACT/agents/backend/package.json $REMOTE/backend/ 2>/dev/null || true
cp $TMP_EXTRACT/agents/backend/tsconfig.json $REMOTE/backend/ 2>/dev/null || true

# Sync prisma migrations
echo "→ Syncing database schema..."
if [ -d "$TMP_EXTRACT/agents/backend/prisma" ]; then
    cp -r $TMP_EXTRACT/agents/backend/prisma/* $REMOTE/backend/prisma/ 2>/dev/null || true
fi

# Sync website source
echo "→ Syncing website source..."
if [ -d "$TMP_EXTRACT/agents/website/src" ]; then
    rm -rf $REMOTE/website/src
    cp -r $TMP_EXTRACT/agents/website/src $REMOTE/website/
fi
if [ -d "$TMP_EXTRACT/agents/website/public" ]; then
    cp -r $TMP_EXTRACT/agents/website/public/* $REMOTE/website/public/ 2>/dev/null || true
fi
cp $TMP_EXTRACT/agents/website/package.json $REMOTE/website/ 2>/dev/null || true
cp $TMP_EXTRACT/agents/website/tsconfig.json $REMOTE/website/ 2>/dev/null || true
for f in next.config.ts next.config.js next.config.mjs; do
    [ -f "$TMP_EXTRACT/agents/website/$f" ] && cp "$TMP_EXTRACT/agents/website/$f" "$REMOTE/website/" || true
done
for f in tailwind.config.ts tailwind.config.js postcss.config.js postcss.config.mjs; do
    [ -f "$TMP_EXTRACT/agents/website/$f" ] && cp "$TMP_EXTRACT/agents/website/$f" "$REMOTE/website/" || true
done

# Sync admin frontend source
echo "→ Syncing admin source..."
if [ -d "$TMP_EXTRACT/agents/frontend/src" ]; then
    rm -rf $REMOTE/frontend/src
    cp -r $TMP_EXTRACT/agents/frontend/src $REMOTE/frontend/
fi
[ -f "$TMP_EXTRACT/agents/frontend/index.html" ] && cp "$TMP_EXTRACT/agents/frontend/index.html" "$REMOTE/frontend/" || true
cp $TMP_EXTRACT/agents/frontend/package.json $REMOTE/frontend/ 2>/dev/null || true
cp $TMP_EXTRACT/agents/frontend/tsconfig*.json $REMOTE/frontend/ 2>/dev/null || true
for f in vite.config.ts vite.config.js; do
    [ -f "$TMP_EXTRACT/agents/frontend/$f" ] && cp "$TMP_EXTRACT/agents/frontend/$f" "$REMOTE/frontend/" || true
done

rm -rf $TMP_EXTRACT
echo "✅ Files synced"
REMOTE_SYNC

echo -e "${GREEN}✅ Files synced to server${NC}"

# ── STEP 4: Update backend ─────────────────────────────────────────────────────
echo -e "${YELLOW}[4/6] Updating backend...${NC}"

$SSH $SERVER << 'BACKEND_UPDATE'
set -e
cd /var/www/realty-pandit/backend

# Install dependencies (only if package.json changed)
npm install --silent 2>/dev/null

# Apply any new Prisma migrations
npx prisma migrate deploy 2>/dev/null
npx prisma generate 2>/dev/null

# Run seed for flat property types (idempotent - safe to run multiple times)
if [ -f "prisma/seed_flat_types.ts" ]; then
    echo "→ Running flat property types seed..."
    npx ts-node prisma/seed_flat_types.ts 2>/dev/null || echo "Seed already run or skipped"
fi

# Restart backend with updated env
pm2 restart realty-backend --update-env
sleep 3

# Verify it started
if curl -sf http://localhost:7071/health > /dev/null 2>&1; then
    echo "✅ Backend healthy: $(curl -s http://localhost:7071/health)"
else
    echo "⚠️  Backend health check pending..."
fi
BACKEND_UPDATE

echo -e "${GREEN}✅ Backend updated${NC}"

# ── STEP 5: Rebuild & restart website ─────────────────────────────────────────
echo -e "${YELLOW}[5/6] Rebuilding website...${NC}"

$SSH $SERVER << 'WEBSITE_UPDATE'
set -e
cd /var/www/realty-pandit/website

# Install any new dependencies
npm install --silent 2>/dev/null

# Build Next.js
echo "Building Next.js..."
npm run build

# Restart on port 3000 (Nginx proxies to this)
pm2 delete realty-website 2>/dev/null || true
pm2 start npm --name realty-website -- start
sleep 3

# Verify
LOGS=$(pm2 logs realty-website --lines 3 --nostream 2>/dev/null | tail -3)
echo "✅ Website restarted"
echo "$LOGS" | grep -E "localhost|Ready|Error" | head -3 || true
WEBSITE_UPDATE

echo -e "${GREEN}✅ Website rebuilt${NC}"

# ── STEP 6: Rebuild & restart admin ───────────────────────────────────────────
echo -e "${YELLOW}[6/6] Rebuilding admin dashboard...${NC}"

$SSH $SERVER << 'ADMIN_UPDATE'
set -e
cd /var/www/realty-pandit/frontend

# Install any new dependencies
npm install --silent 2>/dev/null

# Build Vite
npm run build

# Restart admin
pm2 restart realty-admin --update-env
sleep 2

echo "✅ Admin rebuilt"
ADMIN_UPDATE

echo -e "${GREEN}✅ Admin dashboard rebuilt${NC}"

# ── Final verification ─────────────────────────────────────────────────────────
echo ""
$SSH $SERVER << 'VERIFY'
# Save PM2 state
pm2 save > /dev/null 2>&1

# Reload Nginx to clear any stale connections
systemctl reload nginx 2>/dev/null || true

echo "=== PM2 Status ==="
pm2 list

echo ""
echo "=== Health Checks ==="
echo -n "Website   (https://www.realtypandit.in):  "
curl -sI https://www.realtypandit.in 2>/dev/null | head -1 || curl -sI http://localhost:3000 2>/dev/null | head -1 || echo "pending..."

echo -n "API       (https://api.realtypandit.in):   "
curl -s https://api.realtypandit.in/health 2>/dev/null || curl -s http://localhost:7071/health 2>/dev/null || echo "pending..."

echo -n "Admin     (https://admin.realtypandit.in): "
curl -sI https://admin.realtypandit.in 2>/dev/null | head -1 || echo "pending..."
VERIFY

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}🌐 Live URLs:${NC}"
echo "  https://www.realtypandit.in"
echo "  https://api.realtypandit.in/health"
echo "  https://admin.realtypandit.in"
echo ""
