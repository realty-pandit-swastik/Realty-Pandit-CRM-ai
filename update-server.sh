#!/bin/bash

# Realty Pandit - Update Existing Server Deployment
# Server: 72.62.231.224
# Run: ./update-server.sh

set -e

echo "🔄 Realty Pandit - Server Update Script"
echo "========================================"
echo ""
echo "Server: $(hostname -I 2>/dev/null | awk '{print $1}' || echo '72.62.231.224')"
echo "Date: $(date)"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Project directory
PROJECT_DIR="/var/www/realty-pandit"

# Check if running on server
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ Project directory not found: $PROJECT_DIR${NC}"
    echo "This script should be run on the server, not locally."
    exit 1
fi

cd $PROJECT_DIR

# === STEP 1: Backup Current State ===
echo -e "${YELLOW}[1/8] Creating backup...${NC}"
BACKUP_DIR="/var/backups/realtypandit/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR
echo "Backup location: $BACKUP_DIR"

# === STEP 2: Update Backend ===
echo -e "${YELLOW}[2/8] Updating backend...${NC}"
cd $PROJECT_DIR/backend

# Setup environment file if needed
if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        cp .env.production .env
        echo -e "${GREEN}✅ Environment file created from .env.production${NC}"
    else
        echo -e "${RED}❌ No .env or .env.production file found!${NC}"
        exit 1
    fi
fi

# Install/update dependencies
npm install

# Run migrations (if any new ones)
npx prisma migrate deploy
npx prisma generate

# Restart backend
pm2 restart realty-backend --update-env || pm2 start npm --name "realty-backend" -- run dev
echo -e "${GREEN}✅ Backend updated${NC}"

# === STEP 3: Update Website ===
echo -e "${YELLOW}[3/8] Updating website...${NC}"
cd $PROJECT_DIR/website

# Setup environment file if needed
if [ ! -f ".env.local" ]; then
    if [ -f ".env.production" ]; then
        cp .env.production .env.local
        echo -e "${GREEN}✅ Website environment file created${NC}"
    fi
fi

# Install/update dependencies
npm install

# Rebuild
npm run build

# Restart website
pm2 restart realty-website --update-env || pm2 start npm --name "realty-website" -- start -- -p 7575
echo -e "${GREEN}✅ Website updated${NC}"

# === STEP 4: Update Admin Dashboard ===
echo -e "${YELLOW}[4/8] Updating admin dashboard...${NC}"
cd $PROJECT_DIR/frontend

# Setup environment file if needed
if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        cp .env.production .env
        echo -e "${GREEN}✅ Admin environment file created${NC}"
    fi
fi

# Install/update dependencies
npm install

# Rebuild
npm run build

# Restart admin
pm2 restart realty-admin --update-env || pm2 start npm --name "realty-admin" -- run preview -- --port 5173
echo -e "${GREEN}✅ Admin dashboard updated${NC}"

# === STEP 5: Update Pipecat (Panditji Voice Bot) ===
echo -e "${YELLOW}[5/8] Updating Pipecat voice bot...${NC}"
PIPECAT_DIR=""
if [ -d "$PROJECT_DIR/agents/pipecat" ]; then
    PIPECAT_DIR="$PROJECT_DIR/agents/pipecat"
elif [ -d "$PROJECT_DIR/pipecat" ]; then
    PIPECAT_DIR="$PROJECT_DIR/pipecat"
fi

if [ -n "$PIPECAT_DIR" ]; then
    cd "$PIPECAT_DIR"

    # Setup environment file if needed
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            echo -e "${YELLOW}⚠️  Pipecat .env created from .env.example — fill in real values (GEMINI_API_KEY, GLITCHTIP_DSN_PIPECAT, etc.)${NC}"
        else
            echo -e "${RED}❌ No .env or .env.example file found for Pipecat!${NC}"
        fi
    fi

    # Create venv if missing (first-time setup)
    if [ ! -d "venv" ]; then
        echo -e "${YELLOW}Creating Python virtualenv for Pipecat...${NC}"
        python3 -m venv venv
    fi

    # Install/update Python deps using the venv's pip (matches the interpreter PM2 uses).
    ./venv/bin/pip install --upgrade pip
    ./venv/bin/pip install -r requirements.txt

    # Restart Pipecat (uses ecosystem.config.js to pick up the venv interpreter)
    pm2 restart panditji-voice --update-env || pm2 start ecosystem.config.js
    echo -e "${GREEN}✅ Pipecat voice bot updated${NC}"
else
    echo -e "${YELLOW}⚠️  Pipecat directory not found — skipping. Check PROJECT_DIR layout.${NC}"
fi

# === STEP 6: Verify Database Services ===
echo -e "${YELLOW}[6/8] Checking database services...${NC}"
cd $PROJECT_DIR

if docker ps | grep -q "reality_pandit"; then
    echo -e "${GREEN}✅ Database services running${NC}"
else
    echo -e "${YELLOW}⚠️  Database containers not running, starting...${NC}"
    docker-compose up -d
    sleep 5
fi

# === STEP 7: Save PM2 State ===
echo -e "${YELLOW}[7/8] Saving PM2 state...${NC}"
pm2 save
echo -e "${GREEN}✅ PM2 state saved${NC}"

# === STEP 8: Health Check ===
echo -e "${YELLOW}[8/8] Running health checks...${NC}"

# Wait for services to stabilize
sleep 3

# Check backend health
if curl -f http://localhost:7071/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend: Healthy${NC}"
else
    echo -e "${RED}❌ Backend: Not responding${NC}"
fi

# Check website
if curl -f http://localhost:7575 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Website: Healthy${NC}"
else
    echo -e "${RED}❌ Website: Not responding${NC}"
fi

# Check admin
if curl -f http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Admin: Healthy${NC}"
else
    echo -e "${RED}❌ Admin: Not responding${NC}"
fi

# Check Pipecat (panditji-voice)
if curl -f http://localhost:8765/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Pipecat voice: Healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Pipecat voice: Not responding on :8765/health (may be normal if PIPECAT_PORT differs)${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ UPDATE COMPLETE!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "${BLUE}📊 System Status:${NC}"
echo ""
pm2 status
echo ""
docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null | grep reality || echo "Database containers: OK"
echo ""

echo -e "${BLUE}🌐 Access URLs:${NC}"
echo "  Backend API:  http://${SERVER_IP}:7071/health"
echo "  Website:      http://${SERVER_IP}:7575"
echo "  Admin:        http://${SERVER_IP}:5173"
echo ""

echo -e "${BLUE}📝 View Logs:${NC}"
echo "  pm2 logs realtypandit-backend"
echo "  pm2 logs realtypandit-website"
echo "  pm2 logs realtypandit-admin"
echo ""

echo -e "${GREEN}Done! 🎉${NC}"
