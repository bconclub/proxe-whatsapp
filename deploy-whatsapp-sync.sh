#!/bin/bash
# Deployment script for WhatsApp summary sync fix
# Run this on the VPS: /var/www/whatsapp-proxe

set -e

echo "=== WhatsApp Summary Sync Fix Deployment ==="
echo ""

# Navigate to project directory
cd /var/www/whatsapp-proxe || exit 1

echo "1. Checking git status..."
git status
echo ""

echo "2. Checking latest commit..."
git log --oneline -1
echo ""

echo "3. Pulling latest code..."
git pull origin main
echo ""

echo "4. Installing dependencies..."
npm install
echo ""

echo "5. Verifying updateWhatsAppContext call exists..."
if grep -A 10 "updateConversationData" src/routes/whatsapp.js | grep -q "updateWhatsAppContext"; then
    echo "✓ updateWhatsAppContext() call found"
else
    echo "✗ updateWhatsAppContext() call NOT found - fix required!"
    exit 1
fi
echo ""

echo "6. Checking import statement..."
if grep -q "updateWhatsAppContext" src/routes/whatsapp.js; then
    echo "✓ updateWhatsAppContext import found"
else
    echo "✗ updateWhatsAppContext import NOT found - fix required!"
    exit 1
fi
echo ""

echo "7. Restarting PM2 service..."
pm2 restart whatsapp-proxe
echo ""

echo "8. Checking PM2 status..."
pm2 status
echo ""

echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "1. Test by sending a WhatsApp message"
echo "2. Check logs: pm2 logs whatsapp-proxe --lines 100"
echo "3. Look for: 'Synced WhatsApp context to unified_context'"
echo "4. Verify in Supabase:"
echo "   SELECT jsonb_pretty(unified_context->'whatsapp') FROM all_leads WHERE phone = '9731660933';"
