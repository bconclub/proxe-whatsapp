import express from 'express';
import { z } from 'zod';
import {
  formatWhatsAppResponse,
  formatCarouselResponse,
  formatListResponse,
  formatTemplateResponse
} from '../services/responseFormatter.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

// Validation schema
const formatSchema = z.object({
  text: z.string().min(1),
  responseType: z.enum(['text_only', 'text_with_buttons', 'carousel', 'list', 'template']),
  buttons: z.array(z.union([z.string(), z.object({
    id: z.string(),
    label: z.string()
  })])).optional(),
  customerId: z.string().uuid().optional(),
  items: z.array(z.any()).optional(), // For carousel/list
  templateName: z.string().optional(), // For template
  templateParams: z.array(z.any()).optional() // For template
});

/**
 * POST /api/response/format
 * Format response for WhatsApp
 */
router.post('/format', async (req, res, next) => {
  try {
    const validation = formatSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError('Invalid request data', 400);
    }

    const { text, responseType, buttons, items, templateName, templateParams } = validation.data;

    let formatted;

    switch (responseType) {
      case 'text_only':
        formatted = formatWhatsAppResponse(text, 'text_only');
        break;

      case 'text_with_buttons':
        formatted = formatWhatsAppResponse(text, 'text_with_buttons', buttons || []);
        break;

      case 'carousel':
        if (!items || items.length === 0) {
          throw new AppError('Items required for carousel response', 400);
        }
        formatted = formatCarouselResponse(items, text);
        break;

      case 'list':
        if (!items || items.length === 0) {
          throw new AppError('Items required for list response', 400);
        }
        formatted = formatListResponse(text, items);
        break;

      case 'template':
        if (!templateName) {
          throw new AppError('templateName required for template response', 400);
        }
        formatted = formatTemplateResponse(templateName, 'en', templateParams || []);
        break;

      default:
        formatted = formatWhatsAppResponse(text, 'text_only');
    }

    res.json({
      status: 'success',
      whatsappPayload: formatted,
      responseType
    });
  } catch (error) {
    next(error);
  }
});

export default router;



