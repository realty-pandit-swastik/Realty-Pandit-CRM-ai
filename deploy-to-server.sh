#!/bin/bash

# Realty Pandit - Complete Auto-Deployment Script
# Server: 72.62.231.224
# Run: curl -fsSL https://your-repo/deploy-to-server.sh | bash
# Or: chmod +x deploy-to-server.sh && ./deploy-to-server.sh

set -e  # Exit on error

echo "🚀 Realty Pandit - Auto Deployment Script"
echo "=========================================="
echo ""
echo "Server: $(hostname -I | awk '{print $1}')"
echo "Date: $(date)"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# === STEP 1: System Update ===
echo -e "${YELLOW}[1/12] Updating system packages...${NC}"
apt update -y && apt upgrade -y

# === STEP 2: Install Node.js ===
echo -e "${YELLOW}[2/12] Installing Node.js 20.x...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    echo -e "${GREEN}✅ Node.js installed: $(node -v)${NC}"
else
    echo -e "${GREEN}✅ Node.js already installed: $(node -v)${NC}"
fi

# === STEP 3: Install PM2 ===
echo -e "${YELLOW}[3/12] Installing PM2...${NC}"
npm install -g pm2

# === STEP 4: Install Docker ===
echo -e "${YELLOW}[4/12] Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    apt install -y docker-compose
    echo -e "${GREEN}✅ Docker installed: $(docker -v)${NC}"
else
    echo -e "${GREEN}✅ Docker already installed: $(docker -v)${NC}"
fi

# === STEP 5: Install Nginx ===
echo -e "${YELLOW}[5/12] Installing Nginx...${NC}"
apt install -y nginx

# === STEP 6: Install Certbot ===
echo -e "${YELLOW}[6/12] Installing Certbot for SSL...${NC}"
apt install -y certbot python3-certbot-nginx

# === STEP 7: Create Project Directory ===
echo -e "${YELLOW}[7/12] Setting up project directory...${NC}"
mkdir -p /var/www/realtypandit
cd /var/www/realtypandit

# Check if files already exist
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}⚠️  Project files not found!${NC}"
    echo "Please upload your project files to /var/www/realtypandit"
    echo "You can use: scp -r . root@72.62.231.224:/var/www/realtypandit"
    exit 1
fi

# === STEP 8: Start Database Services ===
echo -e "${YELLOW}[8/12] Starting PostgreSQL & Redis...${NC}"
docker-compose down 2>/dev/null || true
docker-compose up -d
sleep 5

# Verify containers
if docker ps | grep -q "reality_pandit"; then
    echo -e "${GREEN}✅ Database services started${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}" | grep reality
else
    echo -e "${RED}❌ Database containers failed to start${NC}"
    docker-compose logs
    exit 1
fi

# === STEP 9: Backend Setup ===
echo -e "${YELLOW}[9/12] Setting up backend...${NC}"
cd /var/www/realtypandit/agents/backend

# Check if .env exists, if not copy from .env.production
if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        cp .env.production .env
        echo -e "${GREEN}✅ Environment file created from .env.production${NC}"
    else
        echo -e "${RED}❌ No .env or .env.production file found!${NC}"
        exit 1
    fi
fi

# Install dependencies
echo "Installing backend dependencies..."
npm install

# Run migrations
echo "Running database migrations..."
npx prisma migrate deploy
npx prisma generate

# Start backend with PM2
pm2 delete realtypandit-backend 2>/dev/null || true
pm2 start npm --name "realtypandit-backend" -- run dev
echo -e "${GREEN}✅ Backend started${NC}"

# === STEP 10: Website Setup ===
echo -e "${YELLOW}[10/12] Setting up website...${NC}"
cd /var/www/realtypandit/agents/website

# Setup environment
if [ ! -f ".env.local" ]; then
    if [ -f ".env.production" ]; then
        cp .env.production .env.local
        echo -e "${GREEN}✅ Website environment file created${NC}"
    fi
fi

# Install and build
echo "Installing website dependencies..."
npm install
echo "Building website..."
npm run build

# Start with PM2
pm2 delete realtypandit-website 2>/dev/null || true
pm2 start npm --name "realtypandit-website" -- start -- -p 7575
echo -e "${GREEN}✅ Website started${NC}"

# === STEP 11: Admin Dashboard Setup ===
echo -e "${YELLOW}[11/12] Setting up admin dashboard...${NC}"
cd /var/www/realtypandit/agents/frontend

# Setup environment
if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        cp .env.production .env
        echo -e "${GREEN}✅ Admin environment file created${NC}"
    fi
fi

# Install and build
echo "Installing admin dependencies..."
npm install
echo "Building admin dashboard..."
npm run build

# Start with PM2
pm2 delete realtypandit-admin 2>/dev/null || true
pm2 start npm --name "realtypandit-admin" -- run preview -- --port 5173
echo -e "${GREEN}✅ Admin dashboard started${NC}"

# === STEP 12: Final Setup ===
echo -e "${YELLOW}[12/12] Finalizing deployment...${NC}"

# Save PM2 processes
pm2 save

# Setup PM2 to start on boot
pm2 startup | tail -1 | bash
pm2 save

# Configure firewall
echo "Configuring firewall..."
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw --force enable

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "${BLUE}📊 System Status:${NC}"
echo ""
pm2 status
echo ""
docker ps --format "table {{.Names}}\t{{.Status}}"
echo ""

echo -e "${BLUE}🌐 Access URLs:${NC}"
echo "  Backend API:  http://${SERVER_IP}:7071/health"
echo "  Website:      http://${SERVER_IP}:7575"
echo "  Admin:        http://${SERVER_IP}:5173"
echo ""

echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "1. Point your domains to this IP: ${SERVER_IP}"
echo "   - realtypandit.in → ${SERVER_IP}"
echo "   - www.realtypandit.in → ${SERVER_IP}"
echo "   - api.realtypandit.in → ${SERVER_IP}"
echo "   - admin.realtypandit.in → ${SERVER_IP}"
echo ""
echo "2. Update environment variables in:"
echo "   - /var/www/realtypandit/agents/backend/.env"
echo "   (Add WhatsApp, VAPI, JWT secrets)"
echo ""
echo "3. Setup Nginx & SSL (after DNS is configured):"
echo "   - nano /etc/nginx/sites-available/realtypandit"
echo "   - certbot --nginx -d api.realtypandit.in -d realtypandit.in -d www.realtypandit.in -d admin.realtypandit.in"
echo ""

echo -e "${BLUE}🔧 Useful Commands:${NC}"
echo "  View logs:     pm2 logs"
echo "  Restart all:   pm2 restart all"
echo "  Check status:  pm2 status"
echo "  DB logs:       docker logs reality_pandit_db"
echo ""

echo -e "${GREEN}Done! 🎉${NC}"
