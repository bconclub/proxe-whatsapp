// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env files from project root (one level up from src/)
// Priority: .env.local (primary) -> .env (fallback)
const envLocalPath = path.join(__dirname, '..', '.env.local');
const envPath = path.join(__dirname, '..', '.env');

// Load .env.local first (primary configuration)
const envLocalResult = dotenv.config({ path: envLocalPath });

// Load .env as fallback (only if .env.local doesn't exist or for missing vars)
if (envLocalResult.error) {
  const envResult = dotenv.config({ path: envPath });
  if (envResult.error) {
    console.warn('Warning: Neither .env.local nor .env found. Using environment variables only.');
  } else {
    console.log('Loaded .env file (fallback - .env.local not found)');
  }
} else {
  console.log('Loaded .env.local file (primary configuration)');
  // Still load .env for any missing variables (but .env.local takes precedence)
  dotenv.config({ path: envPath, override: false });
}

// Now import other modules that depend on environment variables
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger.js';
import { errorHandler, getRecentErrors } from './middleware/errorHandler.js';

// Routes
import whatsappRoutes from './routes/whatsapp.js';
import customerRoutes from './routes/customer.js';
import conversationRoutes from './routes/conversation.js';
import claudeRoutes from './routes/claude.js';
import responseRoutes from './routes/response.js';
import logsRoutes from './routes/logs.js';
import buttonRoutes from './routes/button.js';
import knowledgeBaseRoutes from './routes/knowledgeBase.js';
import scheduleRoutes from './routes/schedule.js';
import retrainRoutes from './routes/retrain.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware - disable CSP for debug page
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for debug page
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(cors({
  origin: '*', // Allow all origins for debugging
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files (for debug page)
app.use(express.static('public'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Status page
app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'status.html'));
});

// Debug endpoint to see recent errors
app.get('/debug/errors', (req, res) => {
  const errors = getRecentErrors();
  res.json({
    recentErrors: errors.slice(-10), // Last 10 errors
    count: errors.length
  });
});

// Test Claude API key
app.get('/debug/test-claude', async (req, res) => {
  try {
    const { claudeClient, CLAUDE_MODEL } = await import('./config/claude.js');
    
    // Make a simple test call
    const response = await claudeClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: 'Say "test"'
      }]
    });
    
    res.json({
      status: 'success',
      message: 'Claude API key is valid',
      response: response.content[0].text,
      model: CLAUDE_MODEL
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      details: error.toString(),
      apiKeySet: !!process.env.CLAUDE_API_KEY,
      apiKeyPreview: process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY.substring(0, 15) + '...' : 'NOT SET'
    });
  }
});

// Test endpoint that tries to create a lead and session to see what fails
app.post('/debug/test-whatsapp-flow', async (req, res) => {
  try {
    const { getOrCreateLead } = await import('./services/customerService.js');
    const { getOrCreateWhatsAppSession } = await import('./services/whatsappSessionService.js');
    
    const sessionId = req.body.sessionId || "9876543210";
    const brand = req.body.brand || "proxe";
    const profileName = req.body.profileName || "Test User";
    
    const results = {
      step1_lead: null,
      step2_session: null,
      errors: []
    };
    
    // Test Step 1: Create lead
    try {
      results.step1_lead = await getOrCreateLead(sessionId, brand, { profileName });
      results.step1_lead.success = true;
    } catch (error) {
      results.step1_lead = {
        success: false,
        error: error.message,
        code: error.code,
        stack: error.stack
      };
      results.errors.push({ step: 'getOrCreateLead', error: error.message });
    }
    
    // Test Step 2: Create session
    try {
      results.step2_session = await getOrCreateWhatsAppSession(sessionId, brand, { profileName });
      results.step2_session.success = true;
    } catch (error) {
      results.step2_session = {
        success: false,
        error: error.message,
        code: error.code,
        stack: error.stack
      };
      results.errors.push({ step: 'getOrCreateWhatsAppSession', error: error.message });
    }
    
    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Simple test endpoint that shows what happens when we call the WhatsApp endpoint
app.get('/debug/test-whatsapp', async (req, res) => {
  try {
    const testBody = {
      sessionId: "9876543210",
      message: "What commercial spaces do you have in Mumbai?",
      profileName: "Rajesh Kumar",
      timestamp: "1748299381"
    };
    
    // Simulate the request internally
    const { default: whatsappRouter } = await import('./routes/whatsapp.js');
    
    // Create a mock request/response
    const mockReq = {
      body: testBody,
      method: 'POST',
      path: '/api/whatsapp/message'
    };
    
    const mockRes = {
      statusCode: 200,
      headers: {},
      jsonData: null,
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        this.jsonData = data;
        return this;
      },
      headersSent: false
    };
    
    res.json({
      message: 'Test endpoint - check /debug/errors for actual errors',
      testBody: testBody,
      note: 'Use POST /api/whatsapp/message directly to test'
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Debug endpoint to see what environment variables are actually loaded
app.get('/debug/env', (req, res) => {
  const envVars = {};
  const relevantKeys = [
    'CLAUDE_API_KEY',
    'CLAUDE_MODEL',
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_PROXE_SUPABASE_URL',
    'SUPABASE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'PORT',
    'NODE_ENV'
  ];
  
  relevantKeys.forEach(key => {
    const value = process.env[key];
    envVars[key] = {
      exists: !!value,
      length: value ? value.length : 0,
      isEmpty: value ? (value.trim().length === 0) : true,
      preview: value ? `${value.substring(0, 15)}...` : null,
      firstChars: value ? value.substring(0, 10) : null
    };
  });
  
  // Also check .env.local file location
  const envLocalPath = path.join(__dirname, '..', '.env.local');
  const envPath = path.join(__dirname, '..', '.env');
  
  res.json({
    envVars,
    filePaths: {
      envLocal: envLocalPath,
      envLocalExists: existsSync(envLocalPath),
      env: envPath,
      envExists: existsSync(envPath),
      cwd: process.cwd(),
      __dirname: __dirname
    }
  });
});

// Clear errors endpoint
// Status endpoints
app.get('/status/env', (req, res) => {
  // Check for environment variables, supporting multiple naming conventions
  const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || 
                      process.env.NEXT_PUBLIC_SUPABASE_URL || 
                      process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || 
                      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                      process.env.SUPABASE_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Determine which variable name is being used
  let supabaseUrlSource = null;
  if (process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL) supabaseUrlSource = 'NEXT_PUBLIC_PROXE_SUPABASE_URL';
  else if (process.env.NEXT_PUBLIC_SUPABASE_URL) supabaseUrlSource = 'NEXT_PUBLIC_SUPABASE_URL';
  else if (process.env.SUPABASE_URL) supabaseUrlSource = 'SUPABASE_URL';
  
  let supabaseKeySource = null;
  if (process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY) supabaseKeySource = 'NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY';
  else if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) supabaseKeySource = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
  else if (process.env.SUPABASE_KEY) supabaseKeySource = 'SUPABASE_KEY';
  
  const keys = [
    {
      name: 'SUPABASE_URL',
      set: !!supabaseUrl,
      preview: supabaseUrl ? `${supabaseUrl.substring(0, 10)}...` : null,
      source: supabaseUrlSource
    },
    {
      name: 'SUPABASE_KEY',
      set: !!supabaseKey,
      preview: supabaseKey ? `${supabaseKey.substring(0, 10)}...` : null,
      source: supabaseKeySource
    },
    {
      name: 'SUPABASE_SERVICE_KEY',
      set: !!supabaseServiceKey,
      preview: supabaseServiceKey ? `${supabaseServiceKey.substring(0, 10)}...` : null,
      source: process.env.SUPABASE_SERVICE_KEY ? 'SUPABASE_SERVICE_KEY' : (process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : null)
    },
    {
      name: 'CLAUDE_API_KEY',
      set: !!process.env.CLAUDE_API_KEY,
      preview: process.env.CLAUDE_API_KEY ? `${process.env.CLAUDE_API_KEY.substring(0, 10)}...` : null,
      length: process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY.length : 0,
      isEmpty: process.env.CLAUDE_API_KEY ? (process.env.CLAUDE_API_KEY.trim().length === 0) : true
    },
    {
      name: 'CLAUDE_MODEL',
      set: !!process.env.CLAUDE_MODEL,
      preview: process.env.CLAUDE_MODEL || null
    },
    {
      name: 'PORT',
      set: !!process.env.PORT,
      preview: process.env.PORT || null
    },
    {
      name: 'NODE_ENV',
      set: !!process.env.NODE_ENV,
      preview: process.env.NODE_ENV || null
    }
  ];
  
  res.json({ keys });
});

app.get('/status/database', async (req, res) => {
  try {
    const { supabase } = await import('./config/supabase.js');
    const { data, error } = await supabase.from('all_leads').select('count').limit(1);
    
    if (error) {
      res.json({ connected: false, message: error.message });
    } else {
      res.json({ connected: true, message: 'Database connection successful' });
    }
  } catch (error) {
    res.json({ connected: false, message: error.message });
  }
});

app.get('/status/metrics', async (req, res) => {
  try {
    const { getAverageResponseTimes } = await import('./services/loggingService.js');
    const metrics = await getAverageResponseTimes();
    res.json(metrics);
  } catch (error) {
    res.json({
      averageResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      totalRequests: 0,
      sampleSize: 5,
      error: error.message
    });
  }
});

app.get('/status/api', async (req, res) => {
  const apis = {};
  
  // Check Claude API
  try {
    // First check if the key exists in environment
    const hasKey = !!process.env.CLAUDE_API_KEY && process.env.CLAUDE_API_KEY.trim().length > 0;
    
    if (!hasKey) {
      apis.Claude = { 
        valid: false, 
        error: 'API key not configured',
        debug: {
          exists: !!process.env.CLAUDE_API_KEY,
          length: process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY.length : 0,
          isEmpty: process.env.CLAUDE_API_KEY ? (process.env.CLAUDE_API_KEY.trim().length === 0) : true
        }
      };
    } else {
      // Try to import and use the client
      const { claudeClient, CLAUDE_MODEL } = await import('./config/claude.js');
      if (claudeClient) {
        apis.Claude = { valid: true, model: CLAUDE_MODEL };
      } else {
        apis.Claude = { valid: false, error: 'Client initialization failed' };
      }
    }
  } catch (error) {
    apis.Claude = { 
      valid: false, 
      error: error.message,
      debug: {
        hasKey: !!process.env.CLAUDE_API_KEY,
        keyLength: process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY.length : 0
      }
    };
  }
  
  // Check Supabase API
  try {
    const { supabase } = await import('./config/supabase.js');
    // Check for multiple naming conventions
    const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || 
                        process.env.NEXT_PUBLIC_SUPABASE_URL || 
                        process.env.SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || 
                        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                        process.env.SUPABASE_KEY;
    if (supabase && supabaseUrl && supabaseKey) {
      apis.Supabase = { valid: true };
    } else {
      apis.Supabase = { valid: false, error: 'Credentials not configured' };
    }
  } catch (error) {
    apis.Supabase = { valid: false, error: error.message };
  }
  
  res.json({ apis });
});

app.post('/debug/clear-errors', (req, res) => {
  // This would need to be implemented in errorHandler
  res.json({ message: 'Use error handler clear function' });
});

// Database test endpoint
app.get('/test-db', async (req, res) => {
  try {
    // Check environment variables (prioritize NEXT_PUBLIC_* vars from .env.local)
    const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    const envCheck = {
      SUPABASE_URL: supabaseUrl ? (supabaseUrl.substring(0, 30) + '...') : 'MISSING',
      SUPABASE_KEY: supabaseKey ? (supabaseKey.substring(0, 30) + '...') : 'MISSING',
      SUPABASE_SERVICE_KEY: serviceKey ? 'SET' : 'MISSING',
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY ? 'SET' : 'MISSING',
      usingNextPublicVars: !!(process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL && !process.env.SUPABASE_URL)
    };
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: 'Missing Supabase configuration',
        env: envCheck
      });
    }
    
    const { supabase } = await import('./config/supabase.js');
    
    // Test all_leads table
    let leadsResult = { ok: false, error: null };
    try {
      const { data: leads, error: leadsError } = await supabase
        .from('all_leads')
        .select('count')
        .limit(1);
      leadsResult = leadsError ? { ok: false, error: leadsError.message, code: leadsError.code } : { ok: true };
    } catch (err) {
      leadsResult = { ok: false, error: err.message, type: err.constructor.name };
    }
    
    // Test whatsapp_sessions table
    let sessionsResult = { ok: false, error: null };
    try {
      const { data: sessions, error: sessionsError } = await supabase
        .from('whatsapp_sessions')
        .select('count')
        .limit(1);
      sessionsResult = sessionsError ? { ok: false, error: sessionsError.message, code: sessionsError.code } : { ok: true };
    } catch (err) {
      sessionsResult = { ok: false, error: err.message, type: err.constructor.name };
    }
    
    // Test messages table
    let messagesResult = { ok: false, error: null };
    try {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('count')
        .limit(1);
      messagesResult = messagesError ? { ok: false, error: messagesError.message, code: messagesError.code } : { ok: true };
    } catch (err) {
      messagesResult = { ok: false, error: err.message, type: err.constructor.name };
    }
    
    res.json({
      status: 'ok',
      env: envCheck,
      tables: {
        all_leads: leadsResult,
        whatsapp_sessions: sessionsResult,
        messages: messagesResult
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      name: error.name
    });
  }
});

// API Routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/conversation', conversationRoutes);
app.use('/api/claude', claudeRoutes);
app.use('/api/response', responseRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/button', buttonRoutes);
app.use('/api/knowledge-base', knowledgeBaseRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/nightly', retrainRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`WhatsApp PROXe Backend running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

