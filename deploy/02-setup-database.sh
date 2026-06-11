#!/bin/bash
#####################################
# Realty Pandit - Database Setup
#####################################

set -e

echo "🗄️ Setting up PostgreSQL database..."

# Generate strong password (or use your own)
DB_PASSWORD="RealtyPandit@2024#Secure"

# Create database and user
sudo -u postgres psql << EOF
-- Drop existing database if exists (CAUTION: only for fresh setup)
-- DROP DATABASE IF EXISTS reality_pandit;
-- DROP USER IF EXISTS realty_user;

-- Create database and user
CREATE DATABASE reality_pandit;
CREATE USER realty_user WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE reality_pandit TO realty_user;
ALTER DATABASE reality_pandit OWNER TO realty_user;

-- Connect to database and grant schema privileges
\c reality_pandit
GRANT ALL ON SCHEMA public TO realty_user;
ALTER SCHEMA public OWNER TO realty_user;

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO realty_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO realty_user;

EOF

echo "✅ Database setup complete!"
echo ""
echo "Database Connection Details:"
echo "Host: localhost"
echo "Port: 5432"
echo "Database: reality_pandit"
echo "User: realty_user"
echo "Password: $DB_PASSWORD"
echo ""
echo "Connection String:"
echo "postgresql://realty_user:$DB_PASSWORD@localhost:5432/reality_pandit"
echo ""
echo "⚠️  IMPORTANT: Save these credentials securely!"
