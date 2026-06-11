# 🚀 Server Update Guide - Realty Pandit

**Server**: 72.62.231.224
**Status**: ✅ Already Deployed

---

## Quick Update (Most Common)

### Windows:
**Double-click**: `PUSH-UPDATE.bat`

### Mac/Linux or Git Bash:
```bash
./push-update.sh
```

**What it does**:
1. Uploads your latest code changes to server
2. Rebuilds backend, website, and admin dashboard
3. Restarts all services with PM2
4. Shows status and access URLs

**Time**: ~5-7 minutes

---

## Alternative: Manual SSH Update

If you prefer to run commands manually on the server:

### Step 1: SSH into server
```bash
ssh root@72.62.231.224
```

### Step 2: Navigate to project
```bash
cd /var/www/realtypandit
```

### Step 3: Pull latest changes (if using Git)
```bash
git pull origin main
```

Or upload files from your computer:
```bash
# Run this from your local machine
./upload-to-server.sh
```

### Step 4: Run update script
```bash
sudo ./update-server.sh
```

---

## What Each Script Does

| Script | Purpose | When to Use |
|--------|---------|-------------|
| **PUSH-UPDATE.bat** | Windows one-click update | After making code changes |
| **push-update.sh** | Upload + rebuild + restart | Same as above (Mac/Linux) |
| **update-server.sh** | Rebuild & restart on server | Already SSH'd into server |
| **upload-to-server.sh** | Just upload files | Manual deployment |
| **deploy-to-server.sh** | Full fresh deployment | Initial setup only |

---

## After Update - Verify

### Check Services Status
```bash
ssh root@72.62.231.224 'pm2 status'
```

### View Logs
```bash
# Website logs
ssh root@72.62.231.224 'pm2 logs realtypandit-website'

# Backend logs
ssh root@72.62.231.224 'pm2 logs realtypandit-backend'

# Admin logs
ssh root@72.62.231.224 'pm2 logs realtypandit-admin'
```

### Access URLs
After update, your website is available at:
- **Website**: http://72.62.231.224:7575
- **Backend API**: http://72.62.231.224:7071/health
- **Admin Panel**: http://72.62.231.224:5173

*(Or use your domain names if DNS is configured)*

---

## Troubleshooting

### If PM2 services won't start:
```bash
ssh root@72.62.231.224
cd /var/www/realtypandit/agents/backend
pm2 logs realtypandit-backend --err
```

### If database is down:
```bash
ssh root@72.62.231.224
cd /var/www/realtypandit
docker-compose up -d
docker ps
```

### If build fails:
```bash
ssh root@72.62.231.224
cd /var/www/realtypandit/agents/website
npm install
npm run build
```

### Clear PM2 and restart fresh:
```bash
ssh root@72.62.231.224
pm2 delete all
cd /var/www/realtypandit
sudo ./update-server.sh
```

---

## File Structure on Server

```
/var/www/realtypandit/
├── agents/
│   ├── backend/          # Express.js API (Port 7071)
│   ├── website/          # Next.js Website (Port 7575)
│   └── frontend/         # React Admin (Port 5173)
├── docker-compose.yml    # PostgreSQL + Redis
├── update-server.sh      # Update script
└── deploy-to-server.sh   # Initial deployment script
```

---

## Important Notes

✅ **Database**: PostgreSQL and Redis run in Docker containers (managed by docker-compose.yml)
✅ **Process Manager**: PM2 manages all Node.js apps (auto-restart on crash)
✅ **Backups**: Update script creates automatic backup before changes
✅ **Zero Downtime**: PM2 restarts services with minimal interruption

⚠️ **Before updating production**:
- Test changes locally first
- Commit changes to Git (if using version control)
- Update during low-traffic hours if possible

---

## Quick Reference Commands

```bash
# Full one-command update from Windows
PUSH-UPDATE.bat

# Full one-command update from Mac/Linux/Git Bash
./push-update.sh

# Check server status
ssh root@72.62.231.224 'pm2 status && docker ps'

# Restart specific service
ssh root@72.62.231.224 'pm2 restart realtypandit-website'

# View real-time logs
ssh root@72.62.231.224 'pm2 logs'

# SSH into server
ssh root@72.62.231.224
```

---

**Need help?** Check [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) or [DEPLOYMENT_READY.md](DEPLOYMENT_READY.md) for detailed documentation.
