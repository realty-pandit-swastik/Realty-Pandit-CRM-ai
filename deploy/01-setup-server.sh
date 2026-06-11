#!/bin/bash
#####################################
# Realty Pandit - Server Setup Script
# Ubuntu 24.04 LTS
# Domain: realtypandit.in
#####################################

set -e  # Exit on error

echo "🚀 Starting Realty Pandit Server Setup..."

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install essential tools
echo "🔧 Installing essential tools..."
apt install -y curl wget git build-essential software-properties-common ufw fail2ban

# Set timezone
echo "🕐 Setting timezone to Asia/Kolkata..."
timedatectl set-timezone Asia/Kolkata

# Install Node.js 20.x LTS
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL 16
echo "🗄️ Installing PostgreSQL 16..."
apt install -y postgresql postgresql-contrib

# Install Redis
echo "⚡ Installing Redis..."
apt install -y redis-server

# Configure Redis for production
echo "⚙️ Configuring Redis..."
sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
systemctl restart redis-server
systemctl enable redis-server

# Install Nginx
echo "🌐 Installing Nginx..."
apt install -y nginx

# Install PM2
echo "⚙️ Installing PM2..."
npm install -g pm2

# Install Certbot for SSL
echo "🔒 Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# Configure Firewall
echo "🔥 Configuring firewall..."
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw --force enable

# Configure fail2ban
echo "🛡️ Setting up fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# Create app directories
echo "📁 Creating application directories..."
mkdir -p /var/www/realty-pandit/{backend,frontend,website,logs,backups}

# Install unattended-upgrades
echo "🔄 Setting up automatic security updates..."
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure PostgreSQL database"
echo "2. Deploy applications"
echo "3. Configure Nginx"
echo "4. Set up SSL certificates"
