# 🚀 Realty Pandit - Complete Deployment Guide

**Domain**: realtypandit.in
**Server IP**: 72.62.231.224
**OS**: Ubuntu 24.04 LTS

---

## 📋 Pre-Deployment Checklist

- [ ] VPS Access (SSH)
- [ ] Domain purchased (realtypandit.in)
- [ ] WhatsApp Business API credentials
- [ ] Gemini API key
- [ ] Cloudinary account (for media upload)

---

## 🌐 Step 1: Configure Domain DNS

Before deployment, point your domain to the server:

### **DNS Configuration at your registrar:**

Add these A records:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | 72.62.231.224 | 3600 |
| A | www | 72.62.231.224 | 3600 |
| A | api | 72.62.231.224 | 3600 |
| A | admin | 72.62.231.224 | 3600 |

**Wait 5-10 minutes** for DNS propagation before proceeding.

Verify DNS:
```bash
# From your local machine
nslookup realtypandit.in
nslookup api.realtypandit.in
nslookup admin.realtypandit.in
```

---

## 🔐 Step 2: Initial Server Access

### **Connect to your VPS:**

```bash
ssh root@72.62.231.224
# Enter password when prompted
```

### **Create a non-root user (recommended):**

```bash
# Create new user
adduser realty
usermod -aG sudo realty

# Copy SSH keys (if using)
mkdir -p /home/realty/.ssh
cp ~/.ssh/authorized_keys /home/realty/.ssh/
chown -R realty:realty /home/realty/.ssh
chmod 700 /home/realty/.ssh
chmod 600 /home/realty/.ssh/authorized_keys

# Switch to new user
su - realty
```

---

## ⚙️ Step 3: Run Automated Setup Scripts

### **Upload deployment scripts to server:**

```bash
# From your local machine
scp -r deploy root@72.62.231.224:/tmp/

# On server
ssh root@72.62.231.224
cd /tmp/deploy
chmod +x *.sh
```

### **Run setup scripts in order:**

```bash
# 1. Setup server (Node.js, PostgreSQL, Redis, Nginx, etc.)
./01-setup-server.sh

# 2. Setup PostgreSQL database
./02-setup-database.sh
# ⚠️  SAVE the database password shown!

# 3. Configure Nginx
./03-configure-nginx.sh
```

---

## 📦 Step 4: Deploy Applications

### **4.1 Clone Your Repository**

```bash
cd /var/www/realty-pandit

# Clone your code (replace with actual repo)
git clone <your-git-repo-url> temp
mv temp/agents/backend/* backend/
mv temp/agents/frontend/* frontend/
mv temp/agents/website/* website/
rm -rf temp

# Or upload via SCP
# scp -r agents/backend root@72.62.231.224:/var/www/realty-pandit/
```

---

### **4.2 Deploy Backend API**

```bash
cd /var/www/realty-pandit/backend

# Install dependencies
npm install --production

# Create .env file
cat > .env << 'EOF'
NODE_ENV=production
PORT=7071

# Database (use password from step 3.2)
DATABASE_URL="postgresql://realty_user:RealtyPandit@2024#Secure@localhost:5432/reality_pandit"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# WhatsApp API (replace with your credentials)
WHATSAPP_API_URL=https://graph.facebook.com/v17.0
WHATSAPP_API_TOKEN=YOUR_WHATSAPP_API_TOKEN
WHATSAPP_PHONE_ID=YOUR_PHONE_ID
WHATSAPP_VERIFY_TOKEN=YOUR_VERIFY_TOKEN

# Gemini AI
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

# Security (generate strong random strings)
JWT_SECRET=$(openssl rand -base64 32)
USER_JWT_SECRET=$(openssl rand -base64 32)

# CORS
ALLOWED_ORIGINS=https://realtypandit.in,https://www.realtypandit.in,https://admin.realtypandit.in

# Company
COMPANY_PHONE=+918178491914
COMPANY_EMAIL=info@realtypandit.in
EOF

# Run database migrations
npx prisma migrate deploy
npx prisma generate

# Seed initial data (if you have seed script)
# npx prisma db seed

# Start with PM2
pm2 start npm --name "realty-backend" -- run start
pm2 save
```

---

### **4.3 Deploy Website (Next.js)**

```bash
cd /var/www/realty-pandit/website

# Install dependencies
npm install

# Create .env.local
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=https://api.realtypandit.in
NEXT_PUBLIC_SITE_URL=https://realtypandit.in
EOF

# Build production
npm run build

# Start with PM2
pm2 start npm --name "realty-website" -- run start
pm2 save
```

---

### **4.4 Deploy Admin Dashboard**

```bash
cd /var/www/realty-pandit/frontend

# Install dependencies
npm install

# Build production
npm run build

# Install serve globally
npm install -g serve

# Start with PM2
pm2 start serve --name "realty-admin" -- -s dist -l 5173
pm2 save
```

---

## 🔒 Step 5: Setup SSL Certificates

```bash
# Install SSL for all domains at once
sudo certbot --nginx \
  -d realtypandit.in \
  -d www.realtypandit.in \
  -d api.realtypandit.in \
  -d admin.realtypandit.in \
  --email sunny@realtypandit.in \
  --agree-tos \
  --no-eff-email

# Test auto-renewal
sudo certbot renew --dry-run
```

---

## 🔧 Step 6: Configure PM2 Startup

```bash
# Set PM2 to start on system boot
pm2 startup systemd
# Run the command it outputs

# Save current process list
pm2 save

# Verify all apps are running
pm2 list
pm2 monit
```

---

## 🗄️ Step 7: Setup Automated Backups

```bash
# Create backup script
cat > /var/www/realty-pandit/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/www/realty-pandit/backups"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U realty_user reality_pandit | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup uploaded files (if any)
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/realty-pandit/backend/uploads 2>/dev/null || true

# Keep only last 7 days of backups
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /var/www/realty-pandit/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /var/www/realty-pandit/backup.sh >> /var/www/realty-pandit/logs/backup.log 2>&1") | crontab -
```

---

## ✅ Step 8: Verify Deployment

### **Check all services:**

```bash
# PM2 processes
pm2 list

# Nginx status
sudo systemctl status nginx

# PostgreSQL status
sudo systemctl status postgresql

# Redis status
sudo systemctl status redis-server

# Check logs
pm2 logs realty-backend --lines 50
pm2 logs realty-website --lines 50
pm2 logs realty-admin --lines 50
```

### **Test URLs:**

Open in browser:
- https://realtypandit.in (Main website)
- https://api.realtypandit.in/health (API health check)
- https://admin.realtypandit.in (Admin dashboard)

---

## 🔐 Step 9: Security Hardening

```bash
# Disable root SSH login (after setting up sudo user)
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
# Set: PasswordAuthentication no (if using SSH keys)
sudo systemctl restart sshd

# Configure fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
# Adjust settings as needed
sudo systemctl restart fail2ban

# Check firewall status
sudo ufw status verbose
```

---

## 📊 Step 10: Monitoring & Maintenance

### **PM2 Commands:**

```bash
pm2 list              # List all processes
pm2 logs              # View all logs
pm2 logs backend      # View backend logs
pm2 monit             # Monitor resources
pm2 restart all       # Restart all apps
pm2 stop all          # Stop all apps
pm2 start all         # Start all apps
pm2 delete all        # Delete all processes
```

### **View Nginx Logs:**

```bash
tail -f /var/www/realty-pandit/logs/website-access.log
tail -f /var/www/realty-pandit/logs/api-error.log
```

### **Database Commands:**

```bash
# Connect to database
psql -U realty_user -d reality_pandit

# Backup database manually
pg_dump -U realty_user reality_pandit > backup.sql

# Restore database
psql -U realty_user -d reality_pandit < backup.sql
```

---

## 🚨 Troubleshooting

### **Website not loading:**
```bash
pm2 logs realty-website
sudo nginx -t
sudo systemctl status nginx
```

### **API errors:**
```bash
pm2 logs realty-backend
# Check database connection
psql -U realty_user -d reality_pandit -c "SELECT 1;"
```

### **SSL certificate issues:**
```bash
sudo certbot certificates
sudo certbot renew --force-renewal
```

---

## 📞 **Important Credentials**

Store these securely:

- **Database Password**: (from step 3.2)
- **JWT Secret**: (from backend .env)
- **WhatsApp API Token**: (your credentials)
- **Gemini API Key**: (your credentials)
- **SSH Access**: root@72.62.231.224

---

## 🎉 **Post-Deployment**

Your Realty Pandit platform is now live at:

- 🌐 **Website**: https://realtypandit.in
- ⚙️ **API**: https://api.realtypandit.in
- 📊 **Admin**: https://admin.realtypandit.in

**Phone**: +91-8178491914
**Email**: info@realtypandit.in

---

## 🔄 **Updating the Application**

```bash
cd /var/www/realty-pandit/backend
git pull origin main
npm install
pm2 restart realty-backend

cd /var/www/realty-pandit/website
git pull origin main
npm install
npm run build
pm2 restart realty-website
```

---

**Support**: If you encounter any issues, check logs with `pm2 logs` and Nginx logs in `/var/www/realty-pandit/logs/`.
