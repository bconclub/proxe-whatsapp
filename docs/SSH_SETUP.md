# SSH Setup Guide for GitHub Actions Deployment

This guide will help you set up SSH authentication for automated deployments from GitHub Actions to your VPS.

## Problem: SSH Authentication Failed

If you see this error:
```
ssh: handshake failed: ssh: unable to authenticate, attempted methods [none publickey], no supported methods remain
```

It means GitHub Actions cannot authenticate to your VPS server. Follow these steps to fix it.

## Step 1: Generate SSH Key Pair

On your **local machine** (or on the VPS), generate a new SSH key pair:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
```

**Important:** 
- Do NOT set a passphrase (press Enter when prompted)
- This creates two files:
  - `~/.ssh/github_actions_deploy` (private key - keep secret!)
  - `~/.ssh/github_actions_deploy.pub` (public key - add to server)

## Step 2: Add Public Key to VPS

Copy the **public key** to your VPS server's authorized_keys:

### Option A: Using ssh-copy-id (if you have password access)

```bash
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub username@your-server-ip
```

### Option B: Manual Copy

1. Display your public key:
   ```bash
   cat ~/.ssh/github_actions_deploy.pub
   ```

2. SSH into your VPS:
   ```bash
   ssh username@your-server-ip
   ```

3. On the VPS, add the public key:
   ```bash
   mkdir -p ~/.ssh
   chmod 700 ~/.ssh
   echo "YOUR_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

## Step 3: Test SSH Connection

Test that the key works:

```bash
ssh -i ~/.ssh/github_actions_deploy username@your-server-ip
```

If it connects without asking for a password, you're good!

## Step 4: Add Secrets to GitHub

1. Go to your GitHub repository: `https://github.com/bconclub/whatsapp-proxe`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add these three secrets:

### Secret 1: `VPS_HOST`
- **Name:** `VPS_HOST`
- **Value:** Your VPS IP address or hostname (e.g., `123.45.67.89` or `vps.example.com`)

### Secret 2: `VPS_USER`
- **Name:** `VPS_USER`
- **Value:** Your SSH username (e.g., `root` or `ubuntu` or `deploy`)

### Secret 3: `VPS_DEPLOY_KEY`
- **Name:** `VPS_DEPLOY_KEY`
- **Value:** The **entire contents** of your **private key** file:
  ```bash
  cat ~/.ssh/github_actions_deploy
  ```
  
  Copy everything including:
  ```
  -----BEGIN OPENSSH PRIVATE KEY-----
  ...
  -----END OPENSSH PRIVATE KEY-----
  ```

### Optional: Secret 4: `VPS_PORT`
- **Name:** `VPS_PORT`
- **Value:** Your SSH port (default is `22`, only set if different)

## Step 5: Verify Server Permissions

On your VPS, ensure the deployment user has the necessary permissions:

```bash
# Check if user can write to /var/www/whatsapp-proxe
sudo mkdir -p /var/www/whatsapp-proxe
sudo chown -R $USER:$USER /var/www/whatsapp-proxe

# Ensure PM2 is accessible
which pm2  # Should show PM2 path
pm2 --version  # Should show version
```

## Step 6: Test Deployment

1. Make a small change to your repository
2. Push to `main` branch
3. Go to **Actions** tab in GitHub
4. Watch the deployment workflow run

## Troubleshooting

### Still getting authentication errors?

1. **Check key format:**
   - Private key must start with `-----BEGIN OPENSSH PRIVATE KEY-----`
   - Public key must start with `ssh-ed25519` or `ssh-rsa`

2. **Verify server allows public key auth:**
   On VPS, check `/etc/ssh/sshd_config`:
   ```bash
   sudo grep PubkeyAuthentication /etc/ssh/sshd_config
   ```
   Should show: `PubkeyAuthentication yes`

3. **Check file permissions on VPS:**
   ```bash
   ls -la ~/.ssh/
   ```
   Should show:
   - `~/.ssh` directory: `700` (drwx------)
   - `~/.ssh/authorized_keys`: `600` (-rw-------)

4. **Test connection manually:**
   ```bash
   ssh -v -i ~/.ssh/github_actions_deploy username@your-server-ip
   ```
   The `-v` flag shows detailed connection info

5. **Check GitHub Actions logs:**
   - Go to repository → Actions → Latest workflow run
   - Expand the "Deploy to VPS" step
   - Look for detailed error messages

### Common Issues

**Issue:** "Permission denied (publickey)"
- **Fix:** Public key not in `~/.ssh/authorized_keys` on server

**Issue:** "Connection refused"
- **Fix:** Check firewall, SSH port, and server IP address

**Issue:** "Host key verification failed"
- **Fix:** Add `strict_host_key_checking: false` to workflow (not recommended for production)

## Security Best Practices

1. **Use a dedicated deploy user** (not root):
   ```bash
   sudo adduser deploy
   sudo usermod -aG sudo deploy
   ```

2. **Restrict SSH key usage** (optional):
   In `~/.ssh/authorized_keys` on server, prefix the key with:
   ```
   command="/var/www/whatsapp-proxe/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 ...
   ```

3. **Rotate keys periodically**

4. **Monitor deployment logs**

## Alternative: Use SSH Agent Forwarding

If you prefer not to store private keys in GitHub secrets, you can use SSH agent forwarding, but this requires a more complex setup with a self-hosted GitHub Actions runner.

