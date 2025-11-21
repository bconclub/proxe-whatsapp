import express from 'express';
import { z } from 'zod';
import { getOrCreateCustomer } from '../services/customerService.js';
import { buildCustomerContext } from '../services/customerService.js';
import { getConversationHistory, addToHistory } from '../services/conversationService.js';
import { generateResponse } from '../services/claudeService.js';
import { formatWhatsAppResponse } from '../services/responseFormatter.js';
import { storeConversationLog } from '../services/loggingService.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Validation schema
const messageSchema = z.object({
  sessionId: z.string().min(10).max(15),
  message: z.string().min(1).max(4000),
  profileName: z.string().optional(),
  timestamp: z.string().optional()
});

/**
 * POST /api/whatsapp/message
 * Primary message handler - receives messages from n8n
 */
router.post('/message', async (req, res, next) => {
  try {
    const startTime = Date.now();

    // Validate input
    const validation = messageSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError('Invalid request data', 400);
    }

    const { sessionId, message, profileName, timestamp } = validation.data;

    logger.info(`Processing message from ${sessionId}`);

    // Get or create customer
    const customer = await getOrCreateCustomer(sessionId, profileName);

    // Build customer context
    const context = await buildCustomerContext(sessionId);

    // Get conversation history
    const conversationHistory = await getConversationHistory(customer.id, 10);

    // Add user message to history
    await addToHistory(customer.id, message, 'user', 'text');

    // Generate AI response
    const aiResponse = await generateResponse(context, message, conversationHistory);

    // Add assistant response to history
    await addToHistory(customer.id, aiResponse.rawResponse, 'assistant', 'text');

    // Format response for WhatsApp
    const formattedResponse = formatWhatsAppResponse(
      aiResponse.rawResponse,
      aiResponse.responseType,
      aiResponse.buttons,
      {
        customerId: customer.id,
        conversationId: `conv_${Date.now()}`,
        responseTime: Date.now() - startTime,
        tokensUsed: aiResponse.tokensUsed
      }
    );

    // Store conversation log
    await storeConversationLog({
      customerId: customer.id,
      message,
      response: aiResponse.rawResponse,
      responseType: aiResponse.responseType,
      tokensUsed: aiResponse.tokensUsed,
      responseTime: Date.now() - startTime,
      metadata: {
        buttons: aiResponse.buttons,
        urgency: aiResponse.urgency,
        nextAction: aiResponse.nextAction
      }
    });

    // Return structured response to n8n
    res.json({
      status: 'success',
      responseType: aiResponse.responseType,
      message: aiResponse.rawResponse,
      buttons: aiResponse.buttons.map((btn, idx) => {
        const buttonId = typeof btn === 'string' 
          ? `btn_${idx + 1}_${btn.toLowerCase().replace(/\s+/g, '_')}`
          : btn.id || `btn_${idx + 1}`;
        const buttonLabel = typeof btn === 'string' ? btn : btn.label;
        return {
          id: buttonId,
          label: buttonLabel,
          action: determineAction(buttonId, buttonLabel)
        };
      }),
      whatsappPayload: formattedResponse,
      metadata: {
        customerId: customer.id,
        conversationId: `conv_${Date.now()}`,
        responseTime: Date.now() - startTime,
        tokensUsed: aiResponse.tokensUsed
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper to determine button action
 */
function determineAction(buttonId, label) {
  const lowerId = buttonId.toLowerCase();
  const lowerLabel = label.toLowerCase();

  if (lowerId.includes('prop_') || lowerLabel.includes('property')) {
    return 'view_property';
  }
  if (lowerId.includes('schedule') || lowerId.includes('call')) {
    return 'call';
  }
  if (lowerId.includes('info')) {
    return 'get_info';
  }
  if (lowerId.includes('sales') || lowerId.includes('contact')) {
    return 'contact_sales';
  }
  return 'unknown';
}

export default router;

