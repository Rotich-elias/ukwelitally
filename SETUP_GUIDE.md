# UkweliTally Setup Guide

Complete guide to set up and deploy UkweliTally for production use.

---

## Prerequisites

### System Requirements
- **Server**: Ubuntu 20.04+ or similar Linux distribution
- **RAM**: Minimum 2GB, recommended 4GB+
- **Storage**: Minimum 20GB
- **Node.js**: v18 or higher
- **PostgreSQL**: v14 or higher
- **npm**: v9 or higher

### Required Accounts (Optional)
- Google Cloud account (for Vision OCR API)
- SMS gateway account (for SMS fallback)
- Domain name and SSL certificate

---

## Step 1: Server Setup

### 1.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 1.3 Install PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 1.4 Create Database User
```bash
sudo -u postgres psql

# Inside PostgreSQL shell:
CREATE USER ukwelitally WITH PASSWORD 'your_secure_password';
CREATE DATABASE ukwelitally OWNER ukwelitally;
GRANT ALL PRIVILEGES ON DATABASE ukwelitally TO ukwelitally;
\q
```

---

## Step 2: Application Setup

### 2.1 Clone/Copy Project
```bash
cd /var/www
# Copy your ukwelitally directory here
sudo chown -R $USER:$USER ukwelitally
cd ukwelitally
```

### 2.2 Install Dependencies
```bash
npm install
```

### 2.3 Configure Environment Variables
```bash
cp .env.example .env
nano .env
```

**Required environment variables:**
```env
# Database
DATABASE_URL=postgresql://ukwelitally:your_secure_password@localhost:5432/ukwelitally

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your_generated_secret_here

# App URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=/var/www/ukwelitally/uploads

# Optional: Google Vision OCR
GOOGLE_VISION_API_KEY=your_api_key

# Optional: SMS Gateway
SMS_API_KEY=your_sms_api_key
SMS_SENDER_ID=UkweliTally
```

### 2.4 Run Database Migrations
```bash
psql -U ukwelitally -d ukwelitally -f src/db/migrations/001_initial_schema.sql
```

### 2.5 Verify Database Setup
```bash
psql -U ukwelitally -d ukwelitally -c "\dt"
```

You should see all 15 tables listed.

---

## Step 3: Seed Geographic Data

### 3.1 Prepare Kenya Electoral Data
Create a CSV file with Kenya's electoral geography:

**counties.csv:**
```csv
name,code,registered_voters
Mombasa,001,750000
Kwale,002,450000
...
```

**constituencies.csv:**
```csv
county_code,name,code,registered_voters
001,Changamwe,001,100000
...
```

**wards.csv** and **polling_stations.csv** similarly.

### 3.2 Import Data
```bash
# Import counties
psql -U ukwelitally -d ukwelitally -c "\COPY counties(name,code,registered_voters) FROM 'counties.csv' CSV HEADER"

# Import constituencies
psql -U ukwelitally -d ukwelitally -c "\COPY constituencies(county_id,name,code,registered_voters) FROM 'constituencies.csv' CSV HEADER"

# Repeat for wards and polling_stations
```

### 3.3 Update GPS Coordinates
You'll need to add latitude/longitude for each polling station:
```sql
UPDATE polling_stations
SET latitude = -1.286389, longitude = 36.817223
WHERE code = 'PS001';
```

---

## Step 4: Create Admin User

```bash
node -e "
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('admin_password_here', 10);
console.log(hash);
"
```

Then insert into database:
```sql
INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
VALUES (
  'admin@ukwelitally.ke',
  '+254700000000',
  'hashed_password_from_above',
  'System Administrator',
  'admin',
  '12345678',
  TRUE,
  TRUE
);
```

---

## Step 5: Build for Production

```bash
npm run build
```

---

## Step 6: Set Up PM2 (Process Manager)

### 6.1 Install PM2
```bash
sudo npm install -g pm2
```

### 6.2 Start Application
```bash
pm2 start npm --name "ukwelitally" -- start
pm2 save
pm2 startup
```

### 6.3 Monitor Application
```bash
pm2 status
pm2 logs ukwelitally
pm2 monit
```

---

## Step 7: Set Up Nginx (Reverse Proxy)

### 7.1 Install Nginx
```bash
sudo apt install -y nginx
```

### 7.2 Configure Nginx
```bash
sudo nano /etc/nginx/sites-available/ukwelitally
```

**Configuration:**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    client_max_body_size 10M;
}
```

### 7.3 Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/ukwelitally /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Step 8: SSL Certificate (Let's Encrypt)

### 8.1 Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 8.2 Obtain Certificate
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 8.3 Auto-Renewal
```bash
sudo systemctl status certbot.timer
```

---

## Step 9: Set Up Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## Step 10: Configure Backups

### 10.1 Database Backup Script
```bash
sudo nano /usr/local/bin/backup-ukwelitally.sh
```

**Script:**
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/ukwelitally"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U ukwelitally ukwelitally > $BACKUP_DIR/db_$DATE.sql

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/ukwelitally/uploads

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

### 10.2 Schedule Daily Backups
```bash
sudo chmod +x /usr/local/bin/backup-ukwelitally.sh
sudo crontab -e

# Add:
0 2 * * * /usr/local/bin/backup-ukwelitally.sh
```

---

## Step 11: Monitoring & Logging

### 11.1 Set Up Log Rotation
```bash
sudo nano /etc/logrotate.d/ukwelitally
```

**Configuration:**
```
/var/www/ukwelitally/.next/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
}
```

### 11.2 Application Monitoring
- Use PM2 monitoring: `pm2 monit`
- Set up uptime monitoring (e.g., UptimeRobot)
- Configure error tracking (e.g., Sentry)

---

## Step 12: Testing

### 12.1 API Testing
```bash
# Test registration
curl -X POST https://yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "phone": "+254700000001",
    "password": "Test1234!",
    "full_name": "Test User",
    "role": "agent",
    "id_number": "12345679"
  }'

# Test login
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234!"
  }'
```

### 12.2 Load Testing
```bash
# Install Apache Bench
sudo apt install -y apache2-utils

# Test with 1000 requests, 10 concurrent
ab -n 1000 -c 10 https://yourdomain.com/
```

---

## Step 13: Security Hardening

### 13.1 Fail2Ban (Prevent Brute Force)
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
```

### 13.2 PostgreSQL Security
```bash
sudo nano /etc/postgresql/14/main/pg_hba.conf
```

Ensure only local connections allowed:
```
local   all             all                                     peer
host    all             all             127.0.0.1/32            md5
```

### 13.3 Disable Directory Listing (Nginx)
Already handled in nginx config with `location /`

---

## Step 14: Performance Optimization

### 14.1 Enable Gzip Compression (Nginx)
```bash
sudo nano /etc/nginx/nginx.conf
```

Add/uncomment:
```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

### 14.2 PostgreSQL Tuning
```bash
sudo nano /etc/postgresql/14/main/postgresql.conf
```

Adjust based on RAM:
```
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
```

Restart:
```bash
sudo systemctl restart postgresql
```

---

## Maintenance

### Regular Tasks
- **Daily**: Check PM2 logs, monitor disk space
- **Weekly**: Review error logs, check backup success
- **Monthly**: Update dependencies, security patches
- **Before Election**: Full system test, load test, backup verification

### Update Application
```bash
cd /var/www/ukwelitally
git pull  # or copy new files
npm install
npm run build
pm2 restart ukwelitally
```

---

## Troubleshooting

### Application Won't Start
```bash
pm2 logs ukwelitally --lines 100
```

### Database Connection Issues
```bash
psql -U ukwelitally -d ukwelitally -c "SELECT 1;"
```

### High Memory Usage
```bash
pm2 restart ukwelitally
# Or increase Node.js memory:
pm2 delete ukwelitally
pm2 start npm --name "ukwelitally" --node-args="--max-old-space-size=4096" -- start
```

---

## Support

For issues:
1. Check logs: `pm2 logs ukwelitally`
2. Check database: `psql -U ukwelitally -d ukwelitally`
3. Review this guide
4. Contact support team

---

**Production Checklist**

- [ ] Database created and migrated
- [ ] Environment variables configured
- [ ] Geographic data seeded
- [ ] Admin user created
- [ ] Application built for production
- [ ] PM2 configured and running
- [ ] Nginx reverse proxy configured
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Backups scheduled
- [ ] Monitoring set up
- [ ] Load tested
- [ ] Security hardened
- [ ] Documentation reviewed

---

Ready for Kenya 2027 Elections! 🇰🇪
