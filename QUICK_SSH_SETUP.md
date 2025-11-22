# Quick SSH Setup for GitHub Actions Deployment

## ⚠️ Current Issue
Your deployment is failing with:
```
ssh: handshake failed: ssh: unable to authenticate, attempted methods [none publickey]
```

This means GitHub Actions can't authenticate to your VPS. Follow these steps:

## Step 1: Generate SSH Key (On Your Local Machine)

Open PowerShell or Terminal and run:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
```

**Important:** When prompted for a passphrase, press **Enter** (leave it empty).

This creates:
- `~/.ssh/github_actions_deploy` (private key - you'll add this to GitHub)
- `~/.ssh/github_actions_deploy.pub` (public key - you'll add this to your VPS)

## Step 2: Add Public Key to Your VPS

### Option A: If you have password access to your VPS

```bash
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub username@your-server-ip
```

### Option B: Manual method

1. **Display your public key:**
   ```bash
   cat ~/.ssh/github_actions_deploy.pub
   ```
   Copy the entire output (starts with `ssh-ed25519`)

2. **SSH into your VPS:**
   ```bash
   ssh username@your-server-ip
   ```

3. **On your VPS, add the key:**
   ```bash
   mkdir -p ~/.ssh
   chmod 700 ~/.ssh
   echo "PASTE_YOUR_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

4. **Test the connection:**
   ```bash
   ssh -i ~/.ssh/github_actions_deploy username@your-server-ip
   ```
   Should connect without asking for a password.

## Step 3: Add Secrets to GitHub

1. Go to: **https://github.com/bconclub/whatsapp-proxe/settings/secrets/actions**

2. Click **"New repository secret"** and add these 4 secrets:

### Secret 1: `VPS_HOST`
- **Name:** `VPS_HOST`
- **Value:** Your VPS IP address (e.g., `123.45.67.89`) or hostname

### Secret 2: `VPS_USER`
- **Name:** `VPS_USER`
- **Value:** Your SSH username (e.g., `root`, `ubuntu`, `deploy`)

### Secret 3: `VPS_DEPLOY_KEY`
- **Name:** `VPS_DEPLOY_KEY`
- **Value:** The **entire contents** of your private key file:
  ```bash
  cat ~/.ssh/github_actions_deploy
  ```
  Copy **everything** including:
  ```
  -----BEGIN OPENSSH PRIVATE KEY-----
  ...
  -----END OPENSSH PRIVATE KEY-----
  ```

### Secret 4: `VPS_PORT` (Optional)
- **Name:** `VPS_PORT`
- **Value:** Your SSH port (default is `22`, only set if different)

## Step 4: Verify Setup

1. Go to: **https://github.com/bconclub/whatsapp-proxe/actions**
2. Click on the latest failed workflow run
3. Click **"Re-run jobs"** → **"Re-run failed jobs"**
4. Watch it deploy successfully! 🎉

## Troubleshooting

### Still getting "unable to authenticate"?

1. **Verify the public key is on your VPS:**
   ```bash
   ssh username@your-server-ip
   cat ~/.ssh/authorized_keys
   ```
   Should show your `ssh-ed25519` key.

2. **Check file permissions on VPS:**
   ```bash
   ls -la ~/.ssh/
   ```
   Should show:
   - `~/.ssh` = `700` (drwx------)
   - `~/.ssh/authorized_keys` = `600` (-rw-------)

3. **Verify SSH service allows public key auth:**
   ```bash
   sudo grep PubkeyAuthentication /etc/ssh/sshd_config
   ```
   Should show: `PubkeyAuthentication yes`

4. **Test connection with verbose output:**
   ```bash
   ssh -v -i ~/.ssh/github_actions_deploy username@your-server-ip
   ```
   Look for authentication success messages.

### Common Mistakes

- ❌ Adding the **public key** to GitHub secrets (should be **private key**)
- ❌ Adding the private key with extra spaces or line breaks
- ❌ Wrong username or IP address
- ❌ Firewall blocking SSH port
- ❌ SSH key has a passphrase (should be empty)

## Need Help?

Check the detailed guide: `docs/SSH_SETUP.md`

