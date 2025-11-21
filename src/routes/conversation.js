import express from 'express';
import { getConversationHistory } from '../services/conversationService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/conversation/:customerId
 * Fetch conversation history for a customer
 */
router.get('/:customerId', async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    if (!customerId) {
      throw new AppError('customerId is required', 400);
    }

    const history = await getConversationHistory(customerId, limit);
    res.json({
      customerId,
      messageCount: history.length,
      messages: history
    });
  } catch (error) {
    next(error);
  }
});

export default router;

