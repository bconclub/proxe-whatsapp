# Git Login Instructions

## Method 1: Personal Access Token (PAT) - Recommended

### Step 1: Create Token on GitHub
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a name: "WhatsApp PROXe Push"
4. Select scopes: Check "repo" (gives full repository access)
5. Click "Generate token"
6. **COPY THE TOKEN** (you'll only see it once!)

### Step 2: Configure Git Credential Helper
Run in terminal:
```bash
git config --global credential.helper store
```

### Step 3: Push (will prompt for credentials)
```bash
git push origin main
```
- Username: `bconclub` (or your GitHub username)
- Password: **Paste your Personal Access Token** (not your GitHub password!)

### Alternative: Set token directly in URL (less secure)
```bash
git remote set-url origin https://YOUR_TOKEN@github.com/bconclub/whatsapp-proxe.git
git push origin main
```

---

## Method 2: SSH Keys (More Secure)

### Step 1: Generate SSH Key (if you don't have one)
```bash
ssh-keygen -t ed25519 -C "bconclubx@gmail.com"
# Press Enter to accept default location
# Enter a passphrase (optional but recommended)
```

### Step 2: Add SSH Key to SSH Agent
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

### Step 3: Copy Public Key
```bash
cat ~/.ssh/id_ed25519.pub
# Copy the entire output
```

### Step 4: Add Key to GitHub
1. Go to: https://github.com/settings/keys
2. Click "New SSH key"
3. Title: "WhatsApp PROXe"
4. Key: Paste the copied public key
5. Click "Add SSH key"

### Step 5: Switch Remote to SSH
```bash
git remote set-url origin git@github.com:bconclub/whatsapp-proxe.git
git push origin main
```

---

## Method 3: GitHub CLI (If installed)

```bash
# Install (Ubuntu/Debian)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Login
gh auth login
# Follow prompts: GitHub.com → HTTPS → Authenticate → Login with web browser

# Then push
git push origin main
```

---

## Quick Check Commands

```bash
# Check current remote URL
git remote -v

# Check git config
git config --list | grep user

# Test SSH connection (if using SSH)
ssh -T git@github.com
```
