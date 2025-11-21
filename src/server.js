import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

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

