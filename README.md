# WhatsApp PROXe Backend Service

Intelligence layer that transforms raw customer messages into contextual, personalized responses using Claude AI and Supabase.

## Architecture

```
n8n Webhook → Backend Service → Supabase → Claude API → JSON Response → n8n → WhatsApp
```

## Features

- ✅ AI-powered message processing with Claude Sonnet 4.5
- ✅ Customer context enrichment from Supabase
- ✅ Conversation history management
- ✅ WhatsApp message formatting (text, buttons, carousels, templates)
- ✅ Comprehensive logging for analytics and retraining
- ✅ Knowledge base integration (with vector search support)
- ✅ Button action handling
- ✅ Calendar booking integration (open for customization)

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account and project
- Claude API key
- PM2 (for production)

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Set up Supabase database:**
   - Go to your Supabase project SQL Editor
   - Run `src/database/schema.sql` to create all tables

4. **Start the server:**
   ```bash
   # Development
   npm run dev

   # Production with PM2
   pm2 start ecosystem.config.js
   ```

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=production

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_SERVICE_KEY=your-supabase-service-key

# Claude API
CLAUDE_API_KEY=your-claude-api-key
CLAUDE_MODEL=claude-sonnet-4-20250514
CLAUDE_MAX_TOKENS=2000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## API Endpoints

### 1. POST `/api/whatsapp/message`
Primary message handler - receives messages from n8n.

**Request:**
```json
{
  "sessionId": "9876543210",
  "message": "What properties do you have in Bandra?",
  "profileName": "John Doe",
  "timestamp": "1748299381"
}
```

**Response:**
```json
{
  "status": "success",
  "responseType": "text_with_buttons",
  "message": "Great! Here are some premium properties...",
  "buttons": [...],
  "whatsappPayload": {...},
  "metadata": {...}
}
```

### 2. POST `/api/customer/context`
Build full customer context for AI.

### 3. POST `/api/claude/generate-response`
Generate AI response using Claude API.

### 4. POST `/api/response/format`
Format response for WhatsApp Business API.

### 5. POST `/api/logs/store`
Store conversation log for analytics.

### 6. GET `/api/customer/:sessionId`
Fetch customer profile by phone number.

### 7. GET `/api/conversation/:customerId`
Fetch conversation history.

### 8. POST `/api/button/action`
Handle button click actions.

### 9. POST `/api/knowledge-base/query`
Query knowledge base for relevant information.

### 10. POST `/api/schedule/booking`
Generate booking link (open integration).

### 11. POST `/api/nightly/retrain`
Aggregate logs for model retraining (open integration).

## Database Schema

The database includes:
- `customers` - Customer profiles and metadata
- `conversation_history` - Message history
- `conversation_logs` - Analytics and training data
- `knowledge_base` - Company knowledge with vector embeddings

See `src/database/schema.sql` for full schema.

## n8n Integration

1. **Webhook Setup:**
   - Create HTTP Request node in n8n
   - URL: `http://your-server:3000/api/whatsapp/message`
   - Method: POST
   - Body: Map WhatsApp message data to request format

2. **Response Handling:**
   - Backend returns structured JSON
   - Use `whatsappPayload` field for direct WhatsApp API calls
   - Or use `message` + `buttons` fields for custom formatting

## Deployment

### PM2 (Recommended)

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Nginx Reverse Proxy

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
        proxy_cache_bypass $http_upgrade;
    }
}
```

### GitHub Actions

Automatic deployment on push to `whatsapp-backend` branch. Configure secrets:
- `SERVER_HOST`
- `SERVER_USER`
- `SSH_PRIVATE_KEY`

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

## Open Integration Points

1. **Calendar Integration** (`src/services/scheduleService.js`)
   - Replace with Cal.com, Calendly, or custom system

2. **Knowledge Base Vector Search** (`src/services/knowledgeBaseService.js`)
   - Implement proper embedding generation
   - Use `match_knowledge_base()` function from schema

3. **Fine-tuning Pipeline** (`src/services/retrainService.js`)
   - Connect to your model training pipeline
   - Or export to data warehouse

4. **CRM Integration**
   - Add webhooks to HubSpot/Pipedrive
   - Trigger on high-priority leads

5. **Sales Alerts**
   - Integrate Slack/Discord notifications
   - Alert on hot leads or button clicks

## Project Structure

```
src/
├── server.js              # Express app entry point
├── config/                # Configuration (Supabase, Claude)
├── services/              # Business logic
│   ├── customerService.js
│   ├── claudeService.js
│   ├── conversationService.js
│   └── ...
├── routes/                # API route handlers
│   ├── whatsapp.js
│   ├── customer.js
│   └── ...
├── middleware/            # Express middleware
├── utils/                 # Utilities (logger, etc.)
└── database/              # Schema and migrations
```

## License

MIT

