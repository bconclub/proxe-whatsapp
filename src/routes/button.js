import express from 'express';
import { z } from 'zod';
import { handleButtonAction } from '../services/buttonService.js';
import { formatWhatsAppResponse } from '../services/responseFormatter.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

// Validation schema
const buttonActionSchema = z.object({
  customerId: z.string().uuid(),
  buttonId: z.string(),
  buttonLabel: z.string()
});

/**
 * POST /api/button/action
 * Handle button click action
 */
router.post('/action', async (req, res, next) => {
  try {
    const validation = buttonActionSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError('Invalid request data', 400);
    }

    const { customerId, buttonId, buttonLabel } = validation.data;

    const result = await handleButtonAction(customerId, buttonId, buttonLabel);

    // Format response for WhatsApp
    const formatted = formatWhatsAppResponse(
      result.message,
      result.responseType || 'text_only',
      result.buttons || []
    );

    res.json({
      status: 'success',
      action: buttonId,
      message: result.message,
      responseType: result.responseType,
      whatsappPayload: formatted,
      metadata: result
    });
  } catch (error) {
    next(error);
  }
});

export default router;



