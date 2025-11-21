# Environment Setup Guide

## Quick Setup

1. **Copy the template:**
   ```bash
   copy env.template .env
   ```
   Or on PowerShell:
   ```powershell
   Copy-Item env.template .env
   ```

2. **Edit `.env` file** and add your actual API keys:

## Required API Keys

### Claude API Key
1. Go to: https://console.anthropic.com/
2. Sign in or create an account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and paste it in `.env`:
   ```
   CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
   ```

### Supabase Keys
1. Go to: https://app.supabase.com/
2. Select your project (or create a new one)
3. Go to **Settings** → **API**
4. Copy the following:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_KEY`
   - **service_role** key → `SUPABASE_SERVICE_KEY`

   Update in `.env`:
   ```
   SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

## Example .env File

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzODk2NzI4MCwiZXhwIjoxOTU0NTQzMjgwfQ.example
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjM4OTY3MjgwLCJleHAiOjE5NTQ1NDMyODB9.example

# Claude API Configuration
CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLAUDE_MODEL=claude-sonnet-4-20250514
CLAUDE_MAX_TOKENS=2000

# WhatsApp Configuration
WHATSAPP_VERIFY_TOKEN=your-webhook-verify-token

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

## Verify Setup

After adding your keys, test the configuration:

```bash
npm run dev
```

The server should start without errors. If you see connection errors, verify:
- Supabase URL and keys are correct
- Claude API key is valid
- Internet connection is active

## Security Notes

⚠️ **Never commit `.env` to git!** It's already in `.gitignore`.

- Keep your API keys secret
- Don't share `.env` file
- Rotate keys if exposed
- Use different keys for development and production

