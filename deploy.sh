#!/bin/bash

# Realty Pandit - Quick Deployment Script
# Run this script on your production server

set -e  # Exit on error

echo "🚀 Realty Pandit Deployment Script"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
   echo -e "${RED}Please run as root (sudo ./deploy.sh)${NC}"
   exit 1
fi

echo -e "${YELLOW}Step 1: Installing system dependencies...${NC}"
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx
npm install -g pm2

echo ""
echo -e "${YELLOW}Step 2: Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    apt install -y docker-compose
else
    echo "Docker already installed"
fi

echo ""
echo -e "${YELLOW}Step 3: Starting database services...${NC}"
cd /var/www/realtypandit
docker-compose up -d

echo ""
echo -e "${YELLOW}Step 4: Installing backend dependencies...${NC}"
cd /var/www/realtypandit/agents/backend
npm install

echo ""
echo -e "${YELLOW}Step 5: Running database migrations...${NC}"
npx prisma migrate deploy
npx prisma generate

echo ""
echo -e "${YELLOW}Step 6: Building & starting backend...${NC}"
npm run build || echo "No build script, continuing..."
pm2 delete realtypandit-backend 2>/dev/null || true
pm2 start npm --name "realtypandit-backend" -- run dev
pm2 save

echo ""
echo -e "${YELLOW}Step 7: Installing website dependencies...${NC}"
cd /var/www/realtypandit/agents/website
npm install

echo ""
echo -e "${YELLOW}Step 8: Building & starting website...${NC}"
npm run build
pm2 delete realtypandit-website 2>/dev/null || true
pm2 start npm --name "realtypandit-website" -- start -- -p 7575
pm2 save

echo ""
echo -e "${YELLOW}Step 9: Installing admin dashboard dependencies...${NC}"
cd /var/www/realtypandit/agents/frontend
npm install

echo ""
echo -e "${YELLOW}Step 10: Building & starting admin dashboard...${NC}"
npm run build
pm2 delete realtypandit-admin 2>/dev/null || true
pm2 start npm --name "realtypandit-admin" -- run preview -- --port 5173
pm2 save

echo ""
echo -e "${YELLOW}Step 11: Setting up PM2 startup...${NC}"
pm2 startup
pm2 save

echo ""
echo -e "${YELLOW}Step 12: Configuring firewall...${NC}"
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Services Status:"
pm2 status
echo ""
echo "Database Status:"
docker ps
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Configure your domain DNS to point to this server"
echo "2. Run: certbot --nginx -d api.realtypandit.in -d realtypandit.in -d www.realtypandit.in -d admin.realtypandit.in"
echo "3. Test your application:"
echo "   - API: http://YOUR_SERVER_IP:7071/health"
echo "   - Website: http://YOUR_SERVER_IP:7575"
echo "   - Admin: http://YOUR_SERVER_IP:5173"
echo ""
echo -e "${GREEN}Done! 🎉${NC}"
