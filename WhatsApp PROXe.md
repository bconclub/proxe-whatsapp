# WhatsApp PROXe - Master Build Architecture

**Version:** 1.0.0  
**Last Updated:** 2025-01-22  
**Status:** Production Ready

> **This document is the single source of truth for the WhatsApp PROXe Backend build architecture.**

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Technology Stack](#technology-stack)
4. [Directory Structure](#directory-structure)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [Service Layer Architecture](#service-layer-architecture)
8. [Data Flow](#data-flow)
9. [Configuration System](#configuration-system)
10. [Performance Optimizations](#performance-optimizations)
11. [Deployment Architecture](#deployment-architecture)
12. [Monitoring & Status](#monitoring--status)
13. [Integration Points](#integration-points)
14. [Security & Authentication](#security--authentication)
15. [Environment Variables](#environment-variables)

---

## System Overview

**WhatsApp PROXe Backend** is an AI-powered message processing service that transforms raw customer WhatsApp messages into contextual, personalized responses using Claude AI and Supabase.

### Core Purpose
- Receive WhatsApp messages via n8n webhooks
- Enrich messages with customer context from Supabase
- Generate intelligent responses using Claude AI
- Format responses for WhatsApp (text, buttons, carousels)
- Log all interactions for analytics and retraining

### Key Capabilities
- ✅ Multi-brand support (PROXe, Windchasers)
- ✅ Real-time AI chat with Claude Sonnet 4
- ✅ Customer context enrichment
- ✅ Conversation history management
- ✅ Knowledge base integration
- ✅ Automatic button generation based on intent
- ✅ Performance monitoring and metrics
- ✅ Comprehensive logging and analytics

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         WhatsApp Business API                    │
└────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                            n8n Workflow                          │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │ Webhook      │────────▶│ HTTP Request │                      │
│  │ (Receive)    │         │ (To Backend) │                      │
│  └──────────────┘         └──────┬───────┘                      │
└──────────────────────────────────┼──────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│              WhatsApp PROXe Backend Service                      │
│                   (Express.js + Node.js)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  API Layer (Routes)                                      │   │
│  │  ├── /api/whatsapp/message  (Primary Handler)          │   │
│  │  ├── /api/customer/*                                   │   │
│  │  ├── /api/claude/*                                     │   │
│  │  ├── /api/button/*                                     │   │
│  │  └── /status/* (Monitoring)                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                      │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Service Layer                                          │   │
│  │  ├── customerService      (Lead/Session Management)    │   │
│  │  ├── claudeService        (AI Response Generation)      │   │
│  │  ├── conversationService  (History Management)          │   │
│  │  ├── knowledgeBaseService (KB Search)                   │   │
│  │  ├── responseFormatter    (WhatsApp Formatting)         │   │
│  │  ├── loggingService      (Analytics)                    │   │
│  │  └── buttonService       (Action Handling)             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                      │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Data Layer                                              │   │
│  │  ├── Supabase Client (PostgreSQL)                        │   │
│  │  └── Claude API Client                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│      Supabase            │    │    Claude API            │
│  (PostgreSQL + pgvector) │    │  (Anthropic Sonnet 4)    │
│                          │    │                          │
│  • all_leads             │    │  • AI Response Gen       │
│  • whatsapp_sessions     │    │  • Context Processing    │
│  • messages               │    │  • Token Management      │
│  • knowledge_base         │    │                          │
└──────────────────────────┘    └──────────────────────────┘
```

---

## Technology Stack

### Runtime & Framework
- **Node.js**: 18+ (ES Modules)
- **Express.js**: 4.18.2 (Web framework)
- **PM2**: Process manager (cluster mode, 2 instances)

### Database & Storage
- **Supabase**: PostgreSQL with pgvector
- **Database**: PostgreSQL 15+
- **Vector Search**: pgvector extension

### AI & Machine Learning
- **Claude API**: Anthropic Sonnet 4 (`claude-sonnet-4-20250514`)
- **Max Tokens**: 300 (configurable, optimized for short responses)
- **Model**: Claude Haiku 4.5 (configurable via `CLAUDE_MODEL`)

### Validation & Security
- **Zod**: 3.22.4 (Schema validation)
- **Helmet**: 7.1.0 (Security headers)
- **CORS**: 2.8.5 (Cross-origin resource sharing)
- **express-rate-limit**: 7.1.5 (Rate limiting)

### Logging & Monitoring
- **Winston**: 3.11.0 (Structured logging)
- **Custom Status Dashboard**: Real-time monitoring

### Testing
- **Jest**: 29.7.0 (Testing framework)
- **Supertest**: 6.3.3 (HTTP assertions)

---

## Directory Structure

```
whatsapp-proxe-backend/
├── src/
│   ├── server.js                    # Express app entry point
│   │
│   ├── config/                      # Configuration modules
│   │   ├── claude.js                # Claude API client & config
│   │   └── supabase.js              # Supabase client & config
│   │
│   ├── services/                    # Business logic layer
│   │   ├── customerService.js       # Lead/session management
│   │   ├── claudeService.js         # AI response generation
│   │   ├── conversationService.js   # Message history
│   │   ├── knowledgeBaseService.js  # KB search & formatting
│   │   ├── responseFormatter.js    # WhatsApp message formatting
│   │   ├── loggingService.js        # Analytics & metrics
│   │   ├── buttonService.js         # Button action handling
│   │   ├── whatsappSessionService.js # WhatsApp session management
│   │   ├── scheduleService.js       # Calendar integration (open)
│   │   └── retrainService.js        # Training data (open)
│   │
│   ├── routes/                      # API route handlers
│   │   ├── whatsapp.js              # POST /api/whatsapp/message
│   │   ├── customer.js              # Customer endpoints
│   │   ├── conversation.js          # Conversation endpoints
│   │   ├── claude.js                # Claude endpoints
│   │   ├── response.js               # Response formatting
│   │   ├── logs.js                  # Logging & metrics
│   │   ├── button.js                # Button actions
│   │   ├── knowledgeBase.js         # KB queries
│   │   ├── schedule.js              # Booking endpoints
│   │   └── retrain.js                # Retraining endpoints
│   │
│   ├── middleware/                  # Express middleware
│   │   └── errorHandler.js          # Error handling & logging
│   │
│   ├── prompts/                     # AI prompts
│   │   └── proxe-prompt.js          # PROXe system prompt
│   │
│   ├── utils/                       # Utilities
│   │   └── logger.js                # Winston logger config
│   │
│   ├── database/                    # Database schemas
│   │   ├── schema.sql               # Main schema (legacy)
│   │   ├── knowledge_base_schema.sql # KB schema
│   │   └── migrate.js               # Migration helper
│   │
│   └── __tests__/                   # Test suite
│       ├── server.test.js
│       ├── whatsapp.test.js
│       ├── customerService.test.js
│       ├── responseFormatter.test.js
│       └── integration.test.js
│
├── public/                          # Static files
│   ├── status.html                  # Status dashboard
│   └── debug.html                   # Debug page
│
├── scripts/                         # Utility scripts
│   ├── setup.sh                     # Setup script
│   ├── check-env.sh                 # Environment checker
│   └── populate-knowledge-base.js   # KB population
│
├── logs/                            # Application logs
│   ├── pm2-error.log
│   ├── pm2-out.log
│   ├── error.log
│   └── combined.log
│
├── .github/
│   └── workflows/
│       └── deploy.yml               # CI/CD deployment
│
├── docs/                            # Documentation
│   ├── n8n-integration.md
│   └── SSH_SETUP.md
│
├── package.json                     # Dependencies
├── package-lock.json                # Lock file
├── ecosystem.config.cjs             # PM2 configuration
├── jest.config.js                   # Jest configuration
├── env.template                     # Environment template
│
└── Documentation Files:
    ├── README.md                    # Quick start guide
    ├── MASTER_BUILD_ARCHITECTURE.md # This file (SINGLE SOURCE OF TRUTH)
    ├── API_USAGE.md                 # API usage examples
    ├── DEPLOYMENT.md                # Deployment guide
    ├── VPS_ENV_SETUP.md             # VPS environment setup
    ├── SETUP_ENV.md                 # Environment setup
    └── BUILD_STRUCTURE.md           # Legacy build docs
```

---

## Database Schema

### Unified Schema Architecture

The system uses a **unified multi-channel schema** that supports WhatsApp, Web, Voice, and Social channels:

#### Core Tables

##### `all_leads`
**Purpose**: Unifier table - one record per unique customer per brand

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `customer_name` | TEXT | Customer's name |
| `email` | TEXT | Customer's email |
| `phone` | TEXT | Original phone format |
| `customer_phone_normalized` | TEXT | Normalized (digits only) for deduplication |
| `first_touchpoint` | ENUM | `'web'`, `'whatsapp'`, `'voice'`, `'social'` |
| `last_touchpoint` | ENUM | Most recent channel |
| `last_interaction_at` | TIMESTAMP | Last interaction timestamp |
| `brand` | ENUM | `'proxe'` or `'windchasers'` |
| `unified_context` | JSONB | Aggregated context from all channels |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Deduplication Key**: `(customer_phone_normalized, brand)`

##### `whatsapp_sessions`
**Purpose**: WhatsApp-specific session data

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `lead_id` | UUID | Foreign key to `all_leads.id` |
| `brand` | ENUM | `'proxe'` or `'windchasers'` |
| `external_session_id` | TEXT | WhatsApp phone number (unique) |
| `customer_name` | TEXT | Profile name |
| `whatsapp_number` | TEXT | WhatsApp number |
| `conversation_summary` | TEXT | AI-generated summary |
| `message_count` | INTEGER | Total messages in session |
| `last_message_at` | TIMESTAMP | Last message timestamp |
| `session_status` | TEXT | `'active'`, `'completed'`, `'abandoned'` |
| `channel_data` | JSONB | Additional metadata |
| `created_at` | TIMESTAMP | Session creation |
| `updated_at` | TIMESTAMP | Last update |

##### `messages`
**Purpose**: Universal append-only message log (all channels)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `lead_id` | UUID | Foreign key to `all_leads.id` |
| `channel` | ENUM | `'web'`, `'whatsapp'`, `'voice'`, `'social'` |
| `sender` | ENUM | `'customer'`, `'agent'`, `'system'` |
| `content` | TEXT | Message content |
| `message_type` | TEXT | `'text'`, `'button_click'`, `'image'`, etc. |
| `metadata` | JSONB | Analytics data (response_time_ms, tokens_used, etc.) |
| `created_at` | TIMESTAMP | Message timestamp |

**Key Metadata Fields**:
- `response_time_ms`: Processing time
- `input_to_output_gap_ms`: Time from input received to output sent
- `tokens_used`: Claude API tokens consumed
- `response_type`: `'text_only'`, `'text_with_buttons'`, etc.
- `buttons`: Array of button labels
- `input_received_at`: Timestamp when input was received
| `output_sent_at`: Timestamp when output was sent

##### `knowledge_base`
**Purpose**: Company knowledge with vector embeddings

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `content` | TEXT | Knowledge content |
| `embedding` | vector(1536) | Vector embedding for semantic search |
| `category` | TEXT | Knowledge category |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update |

**Indexes**:
- Vector similarity search index (ivfflat)
- Category index
- Full-text search index (GIN)

### Row Level Security (RLS)

All tables have RLS enabled:
- **Service Role**: Full access to all tables
- **Anonymous Key**: Read/write access for API operations
- **Authenticated**: Full access for dashboard

---

## API Endpoints

### Primary Endpoints

#### 1. `POST /api/whatsapp/message`
**Purpose**: Primary message handler - receives messages from n8n

**Request**:
```json
{
  "sessionId": "9876543210",
  "message": "What properties do you have?",
  "profileName": "John Doe",
  "timestamp": "1748299381",
  "brand": "proxe"
}
```

**Response**:
```json
{
  "status": "success",
  "responseType": "text_with_buttons",
  "message": "Great! Here are some premium properties...",
  "buttons": [
    {
      "id": "btn_1_view_properties",
      "label": "View Properties",
      "action": "view_property"
    }
  ],
  "whatsappPayload": {
    "messaging_product": "whatsapp",
    "type": "interactive",
    "interactive": { ... }
  },
  "metadata": {
    "leadId": "uuid",
    "sessionId": "uuid",
    "responseTime": 1234,
    "tokensUsed": 456,
    "inputToOutputGap": 2345
  }
}
```

**Process Flow**:
1. Validate input (Zod schema)
2. Get/create lead in `all_leads`
3. Get/create WhatsApp session
4. Link session to lead
5. Build customer context
6. Get conversation history (last 10 messages)
7. Add user message to `messages` table
8. Generate AI response (Claude)
9. Add assistant response to `messages` table
10. Format for WhatsApp
11. Store analytics metadata
12. Return structured response

#### 2. `GET /api/customer/:sessionId`
Fetch customer profile by phone number

#### 3. `GET /api/conversation/:customerId`
Fetch conversation history for a customer

#### 4. `POST /api/claude/generate-response`
Generate AI response using Claude API

#### 5. `POST /api/response/format`
Format response for WhatsApp Business API

#### 6. `POST /api/logs/store`
Store conversation log for analytics

#### 7. `POST /api/button/action`
Handle button click actions

#### 8. `POST /api/knowledge-base/query`
Query knowledge base for relevant information

#### 9. `POST /api/schedule/booking`
Generate booking link (open integration)

#### 10. `POST /api/nightly/retrain`
Aggregate logs for model retraining (open integration)

### Status & Monitoring Endpoints

#### `GET /health`
Health check endpoint

#### `GET /status`
Status dashboard page

#### `GET /status/env`
Environment variables status

#### `GET /status/database`
Database connection status

#### `GET /status/api`
API status (Claude, Supabase)

#### `GET /status/metrics`
Response time metrics (last 5 responses)

### Debug Endpoints

#### `GET /debug/env`
Detailed environment variable information

#### `GET /debug/errors`
Recent errors

#### `GET /debug/metrics`
Message metadata inspection

---

## Service Layer Architecture

### Service Responsibilities

#### `customerService.js`
- **Purpose**: Lead and session management
- **Key Functions**:
  - `getOrCreateLead(phone, brand, leadData)` - Create/get lead in `all_leads`
  - `buildCustomerContext(sessionId, brand)` - Build full customer context
  - `getLeadById(leadId)` - Fetch lead by ID
  - `updateLeadContact(leadId)` - Update last interaction timestamp

#### `claudeService.js`
- **Purpose**: AI response generation
- **Key Functions**:
  - `generateResponse(customerContext, message, conversationHistory)` - Main AI generation
  - Intent detection and automatic button generation
  - Response parsing (buttons, urgency, next action)
- **Optimizations**:
  - Skips knowledge base for simple greetings
  - Limits KB results to 2 (reduced from 5)
  - Max tokens: 300 (short responses)

#### `conversationService.js`
- **Purpose**: Message history management
- **Key Functions**:
  - `getConversationHistory(leadId, limit)` - Fetch message history
  - `addToHistory(leadId, message, role, messageType, metadata)` - Add message
  - `getRecentMessages(leadId, limit)` - Get recent messages

#### `knowledgeBaseService.js`
- **Purpose**: Knowledge base search
- **Key Functions**:
  - `queryKnowledgeBase(query, limit)` - Search KB (vector or text)
  - `formatKnowledgeContext(results)` - Format for Claude context
- **Search Methods**:
  - Vector similarity search (pgvector)
  - Full-text search (fallback)

#### `responseFormatter.js`
- **Purpose**: WhatsApp message formatting
- **Key Functions**:
  - `formatWhatsAppResponse(text, responseType, buttons, metadata)` - Format text/buttons
  - `formatCarouselResponse(items, headerText)` - Format carousel
  - `formatListResponse(text, items)` - Format list
  - `formatTemplateResponse(templateName, languageCode, parameters)` - Format template
  - `cleanWhatsAppText(text)` - Remove markdown formatting

#### `loggingService.js`
- **Purpose**: Analytics and metrics
- **Key Functions**:
  - `storeConversationLog(logData)` - Store analytics in message metadata
  - `getAverageResponseTimes()` - Calculate metrics from last 5 responses
  - `getMessagesForRetraining(filters)` - Aggregate training data

#### `whatsappSessionService.js`
- **Purpose**: WhatsApp session management
- **Key Functions**:
  - `getOrCreateWhatsAppSession(externalSessionId, brand, sessionData)` - Create/get session
  - `linkSessionToLead(sessionId, leadId)` - Link session to lead
  - `incrementSessionMessageCount(sessionId)` - Update message count

#### `buttonService.js`
- **Purpose**: Button action handling
- **Key Functions**:
  - `handleButtonAction(customerId, buttonId, buttonLabel)` - Route button clicks
  - Action types: `view_property`, `schedule_call`, `get_info`, `contact_sales`

---

## Data Flow

### Message Processing Flow

```
1. WhatsApp Message Received
   ↓
2. n8n Webhook → POST /api/whatsapp/message
   ↓
3. Input Validation (Zod)
   ↓
4. Get/Create Lead (all_leads)
   ↓
5. Get/Create WhatsApp Session (whatsapp_sessions)
   ↓
6. Link Session to Lead
   ↓
7. Build Customer Context
   ├── Fetch from all_leads
   ├── Fetch from whatsapp_sessions
   └── Fetch from messages (history)
   ↓
8. Get Conversation History (last 10 messages)
   ↓
9. Add User Message to messages table
   ↓
10. Generate AI Response
    ├── Detect Intent (for auto-buttons)
    ├── Query Knowledge Base (if not greeting)
    ├── Build System Prompt
    ├── Call Claude API
    └── Parse Response (buttons, urgency)
    ↓
11. Add Assistant Response to messages table
    ↓
12. Format for WhatsApp
    ├── Clean markdown
    ├── Add buttons (Claude + intent-based)
    └── Format payload
    ↓
13. Store Analytics Metadata
    ├── response_time_ms
    ├── input_to_output_gap_ms
    ├── tokens_used
    └── buttons, urgency, etc.
    ↓
14. Return JSON Response to n8n
    ↓
15. n8n → WhatsApp Business API
```

### Context Building Flow

```
Customer Context = {
  name: from all_leads.customer_name,
  conversationCount: count from messages,
  conversationPhase: determined from history,
  previousInterests: extracted from messages,
  budget: extracted from messages,
  conversationSummary: AI-generated summary
}
```

---

## Configuration System

### Environment Variable Loading

**Priority Order**:
1. `.env.local` (primary - loaded first)
2. `.env` (fallback - loaded if .env.local missing)
3. System environment variables

**Supported Naming Conventions**:
- `SUPABASE_URL` OR `NEXT_PUBLIC_SUPABASE_URL` OR `NEXT_PUBLIC_PROXE_SUPABASE_URL`
- `SUPABASE_KEY` OR `NEXT_PUBLIC_SUPABASE_ANON_KEY` OR `NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY` OR `SUPABASE_SERVICE_ROLE_KEY`

### Configuration Files

#### `src/config/claude.js`
- Claude API client initialization
- Model configuration (`CLAUDE_MODEL`)
- Max tokens (`CLAUDE_MAX_TOKENS` = 300)
- Lazy initialization with Proxy pattern

#### `src/config/supabase.js`
- Supabase client initialization
- Supports multiple environment variable naming conventions
- Service role client for admin operations
- Lazy initialization with Proxy pattern

#### `ecosystem.config.cjs`
- PM2 process configuration
- Cluster mode (2 instances)
- Port: 3002
- Memory limits: 500MB
- Auto-restart settings

---

## Performance Optimizations

### Implemented Optimizations

#### 1. Knowledge Base Query Optimization
- **Skip KB for greetings**: Detects simple greetings (`hi`, `hello`, `thanks`, etc.) and skips KB query
- **Reduced results**: Changed from 5 to 2 KB results
- **Time saved**: ~1-2 seconds per greeting

#### 2. Response Time Optimization
- **Max tokens**: Reduced from 2000 to 300 tokens
- **Short responses**: 1-2 sentences maximum
- **Faster processing**: Less tokens = faster generation

#### 3. Intent-Based Button Generation
- **Automatic detection**: Detects user intent and adds relevant buttons
- **No manual configuration**: Buttons added on-the-fly
- **Examples**: "Book a Call", "View Pricing", "Learn More"

#### 4. Markdown Cleaning
- **Removes formatting**: Strips asterisks, underscores, code blocks
- **Clean WhatsApp text**: Plain text output
- **Better display**: No formatting artifacts

#### 5. Input-to-Output Gap Tracking
- **End-to-end timing**: Tracks time from input received to output sent
- **Performance insights**: Identifies bottlenecks
- **Metrics dashboard**: Real-time monitoring

### Performance Metrics

**Current Targets**:
- **Greetings**: < 1 second (KB skipped)
- **Regular messages**: < 3 seconds (with KB)
- **Average gap**: < 5 seconds (green), 5-10s (yellow), > 10s (red)

---

## Deployment Architecture

### Production Setup

#### VPS Configuration
- **Server**: VPS at configured IP
- **Port**: 3002 (production)
- **Process Manager**: PM2 (cluster mode, 2 instances)
- **Auto-deploy**: GitHub Actions on push to `main`

#### Deployment Flow

```
Git Push → GitHub Actions → SSH to VPS → 
  ├── Git Pull
  ├── npm install --production
  ├── PM2 Reload (zero-downtime)
  └── Health Check
```

#### PM2 Configuration
```javascript
{
  name: 'whatsapp-proxe',
  instances: 2,              // Cluster mode
  exec_mode: 'cluster',
  port: 3002,
  max_memory_restart: '500M',
  autorestart: true
}
```

### Environment Setup

**Required Files on VPS**:
- `.env.local` - Environment variables (NOT in git)
- `ecosystem.config.cjs` - PM2 config
- `package.json` - Dependencies

**Environment Variables** (see [Environment Variables](#environment-variables) section)

---

## Monitoring & Status

### Status Dashboard

**URL**: `http://your-server:3002/status`

**Sections**:
1. **System Health**: Online/Offline status
2. **Environment Keys**: Variable status (with source detection)
3. **Database**: Connection status
4. **API Status**: Claude & Supabase validation
5. **Input to Output Gap**: Performance metrics (last 5 responses)
6. **Recent Errors**: Error log

### Metrics Tracked

#### Response Time Metrics
- **Average Gap**: Average time from input to output
- **Fastest**: Minimum gap time
- **Slowest**: Maximum gap time
- **Sample**: X/5 responses with data

#### Performance Thresholds
- **Green**: < 5 seconds
- **Yellow**: 5-10 seconds
- **Red**: > 10 seconds

### Debug Endpoints

- `/debug/env` - Detailed environment info
- `/debug/errors` - Recent errors
- `/debug/metrics` - Message metadata inspection

---

## Integration Points

### n8n Integration

**Workflow**:
1. WhatsApp webhook receives message
2. HTTP Request node → `POST /api/whatsapp/message`
3. Process response
4. Send to WhatsApp Business API

**See**: `docs/n8n-integration.md` for detailed setup

### Open Integration Points

#### 1. Calendar System (`scheduleService.js`)
- **Status**: Placeholder ready
- **Integration**: Cal.com, Calendly, or custom
- **Function**: `generateBookingLink()`

#### 2. Fine-tuning Pipeline (`retrainService.js`)
- **Status**: Data aggregation ready
- **Integration**: Connect to training pipeline
- **Function**: `aggregateTrainingData()`

#### 3. Vector Embeddings (`knowledgeBaseService.js`)
- **Status**: Text search implemented
- **Integration**: Connect embedding generation
- **Function**: `match_knowledge_base()` in schema

---

## Security & Authentication

### Security Measures

1. **Helmet.js**: Security headers
2. **CORS**: Configurable origins (currently `*` for debugging)
3. **Rate Limiting**: 100 requests per 60 seconds
4. **Input Validation**: Zod schema validation
5. **Error Handling**: Comprehensive error catching
6. **RLS Policies**: Row-level security in Supabase

### API Key Management

- **Claude API Key**: Stored in `.env.local` (not in git)
- **Supabase Keys**: Service role key for admin operations
- **Environment Variables**: Loaded securely via `dotenv`

---

## Environment Variables

### Required Variables

```env
# Supabase Configuration (supports multiple naming conventions)
SUPABASE_URL=https://your-project.supabase.co
# OR
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# OR
NEXT_PUBLIC_PROXE_SUPABASE_URL=https://your-project.supabase.co

SUPABASE_KEY=your-anon-key
# OR
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# OR
NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY=your-anon-key

SUPABASE_SERVICE_KEY=your-service-role-key
# OR
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Claude API Configuration
CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
CLAUDE_MODEL=claude-sonnet-4-20250514
CLAUDE_MAX_TOKENS=300

# Server Configuration
PORT=3002
NODE_ENV=production

# Rate Limiting (optional)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging (optional)
LOG_LEVEL=info
```

### Variable Detection

The system automatically detects variables using multiple naming conventions:
- Checks `NEXT_PUBLIC_PROXE_*` first
- Falls back to `NEXT_PUBLIC_*`
- Falls back to standard `SUPABASE_*`

**Status endpoint** (`/status/env`) shows which variable names are being used.

---

## Key Features & Capabilities

### ✅ Implemented Features

- [x] Multi-brand support (PROXe, Windchasers)
- [x] AI-powered message processing (Claude Sonnet 4)
- [x] Customer context enrichment
- [x] Conversation history management
- [x] Knowledge base integration
- [x] Automatic button generation (intent-based)
- [x] WhatsApp message formatting (text, buttons, carousels)
- [x] Performance monitoring (input-to-output gap)
- [x] Comprehensive logging and analytics
- [x] Rate limiting and security
- [x] Error handling and recovery
- [x] Real-time status dashboard
- [x] Markdown cleaning for WhatsApp
- [x] Response time optimization

### 🔧 Open for Integration

- [ ] Calendar system integration
- [ ] Fine-tuning pipeline connection
- [ ] Vector embedding generation
- [ ] CRM webhooks (HubSpot, Pipedrive)
- [ ] Sales alerts (Slack, Discord)

---

## Quick Reference

### Start Development
```bash
npm install
cp env.template .env.local
# Edit .env.local with your credentials
npm run dev
```

### Start Production
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Check Status
```bash
curl http://localhost:3002/health
curl http://localhost:3002/status/metrics
```

### View Logs
```bash
pm2 logs whatsapp-proxe
# Or
tail -f logs/combined.log
```

### Test API
```bash
curl -X POST http://localhost:3002/api/whatsapp/message \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "9876543210", "message": "Hello"}'
```

---

## Version History

- **v1.0.0** (2025-01-22): Master architecture document created
  - Consolidated all architecture documentation
  - Added performance optimizations
  - Added monitoring and metrics
  - Documented unified schema

---

## Support & Maintenance

### Troubleshooting

1. **Check Status Dashboard**: `http://your-server:3002/status`
2. **Check Environment**: `http://your-server:3002/debug/env`
3. **Check Logs**: `pm2 logs whatsapp-proxe`
4. **Check Metrics**: `http://your-server:3002/status/metrics`

### Documentation References

- **API Usage**: `API_USAGE.md`
- **Deployment**: `DEPLOYMENT.md`
- **Environment Setup**: `VPS_ENV_SETUP.md`
- **n8n Integration**: `docs/n8n-integration.md`

---

**This document is maintained as the single source of truth for the WhatsApp PROXe Backend architecture.**

**Last Updated**: 2025-01-22  
**Maintained By**: Development Team

