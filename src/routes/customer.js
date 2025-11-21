import express from 'express';
import { z } from 'zod';
import { getOrCreateCustomer, buildCustomerContext } from '../services/customerService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * POST /api/customer/context
 * Build full customer context for AI
 */
router.post('/context', async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      throw new AppError('sessionId is required', 400);
    }

    const context = await buildCustomerContext(sessionId);
    res.json(context);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/customer/:sessionId
 * Fetch customer profile by phone number (sessionId)
 */
router.get('/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId || sessionId.length < 10) {
      throw new AppError('Invalid sessionId', 400);
    }

    const customer = await getOrCreateCustomer(sessionId);
    res.json(customer);
  } catch (error) {
    next(error);
  }
});


export default router;

