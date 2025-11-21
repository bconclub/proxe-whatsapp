import express from 'express';
import { z } from 'zod';
import { generateResponse } from '../services/claudeService.js';
import { buildCustomerContext } from '../services/customerService.js';
import { getConversationHistory } from '../services/conversationService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

// Validation schema
const generateSchema = z.object({
  customerId: z.string().uuid(),
  message: z.string().min(1),
  context: z.object({
    name: z.string().optional(),
    phase: z.string().optional(),
    previousInterests: z.array(z.string()).optional()
  }).optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional()
});

/**
 * POST /api/claude/generate-response
 * Generate AI response using Claude API
 */
router.post('/generate-response', async (req, res, next) => {
  try {
    const validation = generateSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError('Invalid request data', 400);
    }

    const { customerId, message, context: providedContext, conversationHistory: providedHistory } = validation.data;

    // Build context if not provided
    let context = providedContext;
    if (!context) {
      // Need to get sessionId from customer
      const { supabase } = await import('../config/supabase.js');
      const { data: customer } = await supabase
        .from('customers')
        .select('phone')
        .eq('id', customerId)
        .single();
      
      if (customer) {
        context = await buildCustomerContext(customer.phone);
      }
    }

    // Get conversation history if not provided
    let conversationHistory = providedHistory;
    if (!conversationHistory) {
      conversationHistory = await getConversationHistory(customerId, 10);
    }

    // Generate response
    const response = await generateResponse(context, message, conversationHistory);

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

