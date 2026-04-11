#!/bin/bash

# Realty Pandit - Upload Files to Server
# Server: 72.62.231.224
# Usage: ./upload-to-server.sh

set -e

echo "🚀 Uploading Realty Pandit to Server"
echo "====================================="
echo ""

SERVER="root@72.62.231.224"
REMOTE_PATH="/var/www/realtypandit"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}Checking SSH connection to ${SERVER}...${NC}"
if ssh -o ConnectTimeout=5 ${SERVER} "echo 'Connected'" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ SSH connection successful${NC}"
else
    echo -e "${RED}❌ Cannot connect to server${NC}"
    echo "Please ensure:"
    echo "  1. Server is reachable"
    echo "  2. SSH key is configured or you have password access"
    exit 1
fi

echo ""
echo -e "${YELLOW}Creating remote directory...${NC}"
ssh ${SERVER} "mkdir -p ${REMOTE_PATH}"

echo ""
echo -e "${YELLOW}Uploading project files (this may take a few minutes)...${NC}"

# Upload files using rsync (faster than scp, resumes on failure)
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude 'dist' \
    --exclude 'build' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '*.log' \
    ./ ${SERVER}:${REMOTE_PATH}/

echo ""
echo -e "${GREEN}✅ Files uploaded successfully!${NC}"

echo ""
echo -e "${YELLOW}Making deployment script executable...${NC}"
ssh ${SERVER} "chmod +x ${REMOTE_PATH}/deploy-to-server.sh"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ UPLOAD COMPLETE!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo "1. SSH into server:"
echo "   ssh ${SERVER}"
echo ""
echo "2. Navigate to project directory:"
echo "   cd ${REMOTE_PATH}"
echo ""
echo "3. Run deployment script:"
echo "   sudo ./deploy-to-server.sh"
echo ""
echo "Or run all in one command:"
echo ""
echo "   ssh ${SERVER} 'cd ${REMOTE_PATH} && sudo ./deploy-to-server.sh'"
echo ""
echo -e "${YELLOW}⏱️  Deployment will take approximately 15-20 minutes${NC}"
echo ""
