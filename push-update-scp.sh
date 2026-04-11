#!/bin/bash

# Realty Pandit - Push Updates to Server (SCP Version)
# One-command update: Upload changes + Rebuild + Restart
# Usage: ./push-update-scp.sh

set -e

SERVER="root@72.62.231.224"
REMOTE_PATH="/var/www/realty-pandit"
SSH_KEY="$HOME/.ssh/realty_pandit_key"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🚀 Pushing Updates to Realty Pandit Server"
echo "==========================================="
echo ""

# Check SSH connection
echo -e "${YELLOW}Checking SSH connection...${NC}"
if ! ssh -i "${SSH_KEY}" -o ConnectTimeout=5 ${SERVER} "echo 'Connected'" > /dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to server${NC}"
    echo "Please check:"
    echo "  1. Server is online"
    echo "  2. SSH key is configured"
    echo "  3. Network connectivity"
    exit 1
fi
echo -e "${GREEN}✅ Connected${NC}"
echo ""

# Step 1: Create temp archive
echo -e "${YELLOW}📦 Creating deployment package...${NC}"
TEMP_FILE="/tmp/realtypandit-update-$(date +%s).tar.gz"

tar -czf "$TEMP_FILE" \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='dist' \
    --exclude='build' \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='*.log' \
    --exclude='upload-to-server.sh' \
    --exclude='deploy-to-server.sh' \
    --exclude='*.tar.gz' \
    .

echo -e "${GREEN}✅ Package created: $(du -h "$TEMP_FILE" | cut -f1)${NC}"

# Step 2: Upload archive
echo ""
echo -e "${YELLOW}📤 Uploading to server...${NC}"
scp -i "${SSH_KEY}" "$TEMP_FILE" ${SERVER}:/tmp/realtypandit-update.tar.gz
echo -e "${GREEN}✅ Uploaded${NC}"

# Step 3: Extract on server
echo ""
echo -e "${YELLOW}📂 Extracting files on server...${NC}"
ssh -i "${SSH_KEY}" ${SERVER} "cd ${REMOTE_PATH} && tar -xzf /tmp/realtypandit-update.tar.gz && rm /tmp/realtypandit-update.tar.gz"
echo -e "${GREEN}✅ Files extracted${NC}"

# Cleanup local temp file
rm "$TEMP_FILE"

# Step 4: Make update script executable
echo ""
echo -e "${YELLOW}🔧 Preparing update script...${NC}"
ssh -i "${SSH_KEY}" ${SERVER} "chmod +x ${REMOTE_PATH}/update-server.sh"

echo ""
echo -e "${YELLOW}🔄 Running update on server...${NC}"
echo ""

# Step 5: Run update script on server
ssh -i "${SSH_KEY}" ${SERVER} "cd ${REMOTE_PATH} && sudo ./update-server.sh"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ UPDATE DEPLOYED SUCCESSFULLY!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Get server IP
SERVER_IP=$(ssh -i "${SSH_KEY}" ${SERVER} "hostname -I | awk '{print \$1}'" 2>/dev/null || echo "72.62.231.224")

echo -e "${BLUE}🌐 Your website is now updated:${NC}"
echo ""
echo "  Website:      http://${SERVER_IP}:7575"
echo "  Backend API:  http://${SERVER_IP}:7071/health"
echo "  Admin Panel:  http://${SERVER_IP}:5173"
echo ""
echo -e "${BLUE}📊 Check status:${NC}"
echo "  ssh -i "${SSH_KEY}" ${SERVER} 'pm2 status'"
echo ""
echo -e "${BLUE}📝 View logs:${NC}"
echo "  ssh -i "${SSH_KEY}" ${SERVER} 'pm2 logs realtypandit-website'"
echo ""
