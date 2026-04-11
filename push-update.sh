#!/bin/bash

# Realty Pandit - Push Updates to Server
# One-command update: Upload changes + Rebuild + Restart
# Usage: ./push-update.sh

set -e

SERVER="root@72.62.231.224"
REMOTE_PATH="/var/www/realtypandit"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🚀 Pushing Updates to Realty Pandit Server"
echo "==========================================="
echo ""

# Step 1: Upload files
echo -e "${YELLOW}📤 Uploading changed files...${NC}"

rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude 'dist' \
    --exclude 'build' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '*.log' \
    --exclude 'upload-to-server.sh' \
    --exclude 'deploy-to-server.sh' \
    ./ ${SERVER}:${REMOTE_PATH}/

echo -e "${GREEN}✅ Files uploaded${NC}"
echo ""

# Step 2: Make update script executable
echo -e "${YELLOW}🔧 Preparing update script...${NC}"
ssh ${SERVER} "chmod +x ${REMOTE_PATH}/update-server.sh"

echo ""
echo -e "${YELLOW}🔄 Running update on server...${NC}"
echo ""

# Step 3: Run update script on server
ssh ${SERVER} "cd ${REMOTE_PATH} && sudo ./update-server.sh"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ UPDATE DEPLOYED SUCCESSFULLY!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Get server IP
SERVER_IP=$(ssh ${SERVER} "hostname -I | awk '{print \$1}'")

echo -e "${BLUE}🌐 Your website is now updated:${NC}"
echo ""
echo "  Website:      http://${SERVER_IP}:7575"
echo "  Backend API:  http://${SERVER_IP}:7071/health"
echo "  Admin Panel:  http://${SERVER_IP}:5173"
echo ""
echo -e "${BLUE}📊 Check status:${NC}"
echo "  ssh ${SERVER} 'pm2 status'"
echo ""
echo -e "${BLUE}📝 View logs:${NC}"
echo "  ssh ${SERVER} 'pm2 logs realtypandit-website'"
echo ""
