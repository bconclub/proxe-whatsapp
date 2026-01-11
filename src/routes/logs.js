import express from 'express';
import { z } from 'zod';
import { storeConversationLog, getAverageResponseTimes } from '../services/loggingService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

// Validation schema
const logSchema = z.object({
  customerId: z.string().uuid(),
  sessionId: z.string().optional(),
  message: z.string(),
  response: z.string(),
  responseType: z.string().optional(),
  responseTime: z.number().optional(),
  tokensUsed: z.number().optional(),
  timestamp: z.string().optional()
});

/**
 * POST /api/logs/store
 * Store conversation log
 */
router.post('/store', async (req, res, next) => {
  try {
    const validation = logSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError('Invalid request data', 400);
    }

    const logData = validation.data;

    const log = await storeConversationLog({
      customerId: logData.customerId,
      message: logData.message,
      response: logData.response,
      responseType: logData.responseType || 'text_only',
      tokensUsed: logData.tokensUsed || 0,
      responseTime: logData.responseTime || 0,
      metadata: {
        sessionId: logData.sessionId,
        timestamp: logData.timestamp || new Date().toISOString()
      }
    });

    res.json({
      status: 'logged',
      logId: log.id,
      inserted: true
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/logs/metrics
 * Get average response time metrics from last 5 responses
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const metrics = await getAverageResponseTimes();
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

export default router;



