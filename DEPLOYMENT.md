# Deployment Guide

## Prerequisites

- Node.js 18+ installed
- PM2 installed globally: `npm install -g pm2`
- Supabase project created
- Claude API key obtained
- Server access (VPS at 82.29.167.17)

## Step-by-Step Deployment

### 1. Server Setup

```bash
# SSH into server
ssh user@82.29.167.17

# Clone repository
cd /path/to/project
git clone <repository-url>
cd whatsapp-proxe-backend

# Install dependencies
npm install --production
```

### 2. Environment Configuration

```bash
# Create .env file
cp .env.example .env
nano .env  # Edit with your credentials
```

Required variables:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SERVICE_KEY`
- `CLAUDE_API_KEY`
- `PORT` (default: 3000)

### 3. Database Setup

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `src/database/schema.sql`
3. Execute in SQL Editor
4. Verify tables created:
   - `customers`
   - `conversation_history`
   - `conversation_logs`
   - `knowledge_base`

### 4. Start with PM2

```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow instructions to enable auto-start

# Check status
pm2 status
pm2 logs proxe-whatsapp-backend
```

### 5. Nginx Configuration

Create/update Nginx config:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/whatsapp/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 30s;
    }

    location /health {
        proxy_pass http://localhost:3000;
    }
}
```

Reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Firewall Configuration

```bash
# Allow port 3000 (if needed)
sudo ufw allow 3000/tcp

# Or use Nginx only (recommended)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 7. Verify Deployment

```bash
# Health check
curl http://localhost:3000/health

# Test endpoint (from server)
curl -X POST http://localhost:3000/api/whatsapp/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "9999999999",
    "message": "Test",
    "profileName": "Test User"
  }'
```

### 8. Monitoring

```bash
# View logs
pm2 logs proxe-whatsapp-backend

# Monitor resources
pm2 monit

# Restart if needed
pm2 restart proxe-whatsapp-backend

# Stop
pm2 stop proxe-whatsapp-backend
```

## GitHub Actions Deployment

1. **Configure Secrets:**
   - Go to GitHub repo → Settings → Secrets
   - Add:
     - `SERVER_HOST`: 82.29.167.17
     - `SERVER_USER`: your-ssh-user
     - `SSH_PRIVATE_KEY`: your private SSH key

2. **Update Workflow:**
   - Edit `.github/workflows/deploy.yml`
   - Update `cd /path/to/whatsapp-proxe-backend` with actual path

3. **Push to Branch:**
   ```bash
   git push origin whatsapp-backend
   ```
   - Deployment triggers automatically

## Troubleshooting

### Application won't start
- Check logs: `pm2 logs proxe-whatsapp-backend`
- Verify environment variables: `pm2 env 0`
- Check port availability: `netstat -tulpn | grep 3000`

### Database connection errors
- Verify Supabase URL and keys
- Check network connectivity
- Verify RLS policies allow access

### Claude API errors
- Verify API key is valid
- Check API quota/limits
- Review Claude service status

### High memory usage
- Reduce PM2 instances in `ecosystem.config.js`
- Set `max_memory_restart: '300M'`
- Monitor with `pm2 monit`

## Rollback

```bash
# Stop current version
pm2 stop proxe-whatsapp-backend

# Checkout previous version
git checkout <previous-commit>

# Reinstall and restart
npm install --production
pm2 restart proxe-whatsapp-backend
```

## Maintenance

### Update Application
```bash
git pull origin whatsapp-backend
npm install --production
pm2 reload proxe-whatsapp-backend
```

### Database Migrations
- Run new SQL in Supabase SQL Editor
- Test in staging first
- Backup before production changes

### Log Rotation
PM2 handles log rotation automatically. To manually clear:
```bash
pm2 flush
```

## Security Checklist

- [ ] Environment variables secured (not in git)
- [ ] Firewall configured
- [ ] HTTPS enabled (via Nginx/Let's Encrypt)
- [ ] Rate limiting enabled
- [ ] RLS policies configured in Supabase
- [ ] API keys rotated regularly
- [ ] PM2 running as non-root user
- [ ] Logs don't contain sensitive data

