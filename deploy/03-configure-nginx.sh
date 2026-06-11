#!/bin/bash
#####################################
# Realty Pandit - Nginx Configuration
# Domain: realtypandit.in
#####################################

set -e

echo "🌐 Configuring Nginx for realtypandit.in..."

# Main Website Configuration
cat > /etc/nginx/sites-available/realtypandit.in << 'NGINX_EOF'
server {
    listen 80;
    server_name realtypandit.in www.realtypandit.in;

    # Logs
    access_log /var/www/realty-pandit/logs/website-access.log;
    error_log /var/www/realty-pandit/logs/website-error.log;

    location / {
        proxy_pass http://localhost:7575;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Next.js static files caching
    location /_next/static {
        proxy_pass http://localhost:7575;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Images and media
    location ~* \.(jpg|jpeg|png|gif|ico|svg|webp)$ {
        proxy_pass http://localhost:7575;
        add_header Cache-Control "public, max-age=604800";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
NGINX_EOF

# API Configuration
cat > /etc/nginx/sites-available/api.realtypandit.in << 'NGINX_EOF'
server {
    listen 80;
    server_name api.realtypandit.in;

    # Logs
    access_log /var/www/realty-pandit/logs/api-access.log;
    error_log /var/www/realty-pandit/logs/api-error.log;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;

    location / {
        limit_req zone=api_limit burst=50 nodelay;

        proxy_pass http://localhost:7071;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Extended timeouts for API
        proxy_connect_timeout 90s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
    }

    # CORS headers (if needed)
    add_header Access-Control-Allow-Origin "https://realtypandit.in" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
}
NGINX_EOF

# Admin Dashboard Configuration
cat > /etc/nginx/sites-available/admin.realtypandit.in << 'NGINX_EOF'
server {
    listen 80;
    server_name admin.realtypandit.in;

    # Logs
    access_log /var/www/realty-pandit/logs/admin-access.log;
    error_log /var/www/realty-pandit/logs/admin-error.log;

    # IP whitelist (optional - uncomment and add your IPs)
    # allow 103.x.x.x;  # Your office IP
    # deny all;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Extra security for admin
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
NGINX_EOF

# Enable sites
ln -sf /etc/nginx/sites-available/realtypandit.in /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/api.realtypandit.in /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/admin.realtypandit.in /etc/nginx/sites-enabled/

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t

# Reload Nginx
systemctl reload nginx

echo "✅ Nginx configuration complete!"
echo ""
echo "Configured domains:"
echo "  - realtypandit.in (main website)"
echo "  - api.realtypandit.in (backend API)"
echo "  - admin.realtypandit.in (admin dashboard)"
