#!/bin/bash
# Test script for /api/whatsapp/message endpoint
# This simulates a real WhatsApp message from n8n

echo "Testing /api/whatsapp/message endpoint..."
echo ""

# Default values
PORT=${PORT:-3001}
BASE_URL="http://localhost:${PORT}"

# Test with a real WhatsApp message format
curl -X POST "${BASE_URL}/api/whatsapp/message" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "919876543210",
    "message": "Hello, I want to know more about PROXe",
    "profileName": "John Doe",
    "timestamp": "'$(date +%s)'",
    "brand": "proxe"
  }' | jq .

echo ""
echo "Check the console logs for detailed debugging information"
echo "Look for '=== addToHistory DEBUG ===' sections"

