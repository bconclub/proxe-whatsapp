# n8n Integration Guide

This guide explains how to integrate the WhatsApp PROXe Backend with n8n workflows.

## Overview

The backend service receives messages from n8n, processes them with AI, and returns structured responses that n8n can send directly to WhatsApp Business API.

## Workflow Setup

### 1. Webhook Trigger

Create a webhook node in n8n that receives WhatsApp messages:

**Settings:**
- HTTP Method: POST
- Path: `/webhook/whatsapp` (or your custom path)
- Response Mode: Respond to Webhook

### 2. HTTP Request to Backend

Add an HTTP Request node after the webhook:

**Configuration:**
- Method: POST
- URL: `http://your-backend-server:3000/api/whatsapp/message`
- Authentication: None (or add API key if implemented)
- Body Content Type: JSON

**Body (JSON):**
```json
{
  "sessionId": "{{ $json.from }}",
  "message": "{{ $json.text.body }}",
  "profileName": "{{ $json.profile.name }}",
  "timestamp": "{{ $json.timestamp }}"
}
```

**Field Mapping:**
- `sessionId`: WhatsApp phone number (from `$json.from`)
- `message`: Message text (from `$json.text.body`)
- `profileName`: Customer name (from `$json.profile.name` or `$json.profile.name`)
- `timestamp`: Message timestamp

### 3. Process Backend Response

The backend returns:
```json
{
  "status": "success",
  "responseType": "text_with_buttons",
  "message": "...",
  "buttons": [...],
  "whatsappPayload": {...},
  "metadata": {...}
}
```

### 4. Send to WhatsApp Business API

Use the `whatsappPayload` field directly, or construct your own:

**Option A: Use whatsappPayload directly**
```json
{{ $json.whatsappPayload }}
```

**Option B: Custom formatting**
```json
{
  "messaging_product": "whatsapp",
  "to": "{{ $('Webhook').item.json.from }}",
  "type": "{{ $json.responseType }}",
  "text": {
    "body": "{{ $json.message }}"
  }
}
```

### 5. Handle Buttons

If `responseType` is `text_with_buttons`, format interactive message:

```json
{
  "messaging_product": "whatsapp",
  "to": "{{ $('Webhook').item.json.from }}",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": {
      "text": "{{ $json.message }}"
    },
    "action": {
      "buttons": {{ $json.buttons }}
    }
  }
}
```

## Complete n8n Workflow Example

```
1. Webhook (WhatsApp incoming)
   ↓
2. HTTP Request (POST /api/whatsapp/message)
   ↓
3. IF Node (Check responseType)
   ├─ text_only → Simple WhatsApp API call
   ├─ text_with_buttons → Interactive WhatsApp API call
   └─ carousel → Product list WhatsApp API call
   ↓
4. HTTP Request (POST to Meta Graph API)
   ↓
5. Log Response (Optional)
```

## Button Click Handling

When a customer clicks a button, WhatsApp sends an interactive message:

**n8n Webhook receives:**
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button_reply",
    "button_reply": {
      "id": "btn_1_schedule_call",
      "title": "Schedule Call"
    }
  }
}
```

**Send to backend:**
```json
{
  "customerId": "{{ $json.from }}",
  "buttonId": "{{ $json.interactive.button_reply.id }}",
  "buttonLabel": "{{ $json.interactive.button_reply.title }}"
}
```

**Endpoint:** `POST /api/button/action`

## Error Handling

Add error handling in n8n:

1. **Try-Catch Node** around HTTP Request
2. **IF Node** to check `status === 'error'`
3. **Send fallback message** if backend fails:
   ```json
   {
     "messaging_product": "whatsapp",
     "to": "{{ $json.from }}",
     "type": "text",
     "text": {
       "body": "Sorry, I'm having trouble processing your message. Please try again later."
     }
   }
   ```

## Rate Limiting

The backend has rate limiting (100 requests/minute by default). If you hit limits:

1. Add delays between requests in n8n
2. Use n8n's queue system
3. Adjust `RATE_LIMIT_MAX_REQUESTS` in backend `.env`

## Testing

1. **Test webhook locally:**
   - Use ngrok: `ngrok http 3000`
   - Set n8n webhook URL to ngrok URL

2. **Test backend directly:**
   ```bash
   curl -X POST http://localhost:3000/api/whatsapp/message \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "9876543210",
       "message": "Hello",
       "profileName": "Test User"
     }'
   ```

## Advanced: Custom Context

You can add custom context before sending to backend:

```json
{
  "sessionId": "{{ $json.from }}",
  "message": "{{ $json.text.body }}",
  "profileName": "{{ $json.profile.name }}",
  "customContext": {
    "source": "whatsapp",
    "campaign": "{{ $json.campaign }}",
    "metadata": {{ $json.metadata }}
  }
}
```

## Monitoring

Monitor backend health in n8n:

1. **Health Check Node:**
   - URL: `http://your-backend:3000/health`
   - Schedule: Every 5 minutes
   - Alert if status !== 'ok'

2. **Log Backend Responses:**
   - Store in database
   - Track response times
   - Monitor error rates

## Best Practices

1. **Always validate** webhook data before sending to backend
2. **Handle timeouts** - set HTTP request timeout to 5 seconds
3. **Retry logic** - retry failed requests up to 3 times
4. **Logging** - log all requests/responses for debugging
5. **Error messages** - provide user-friendly error messages

## Troubleshooting

**Backend returns 400:**
- Check request format matches schema
- Verify `sessionId` is valid phone number
- Ensure `message` is not empty

**Backend returns 500:**
- Check backend logs: `pm2 logs proxe-whatsapp-backend`
- Verify Supabase connection
- Check Claude API key

**Slow responses:**
- Check Claude API status
- Verify Supabase query performance
- Consider caching customer context



