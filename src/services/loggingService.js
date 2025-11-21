import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { updateCustomerContact } from './customerService.js';

/**
 * Store conversation log
 */
export async function storeConversationLog(logData) {
  try {
    const { data, error } = await supabase
      .from('conversation_logs')
      .insert({
        customer_id: logData.customerId,
        customer_message: logData.message,
        ai_response: logData.response,
        response_type: logData.responseType || 'text_only',
        tokens_used: logData.tokensUsed || 0,
        response_time_ms: logData.responseTime || 0,
        created_at: new Date().toISOString(),
        metadata: logData.metadata || {}
      })
      .select()
      .single();

    if (error) {
      logger.error('Error storing conversation log:', error);
      throw error;
    }

    // Update customer contact timestamp
    await updateCustomerContact(logData.customerId);

    logger.info(`Conversation log stored: ${data.id}`);
    return data;
  } catch (error) {
    logger.error('Error in storeConversationLog:', error);
    throw error;
  }
}

/**
 * Extract keywords/entities from message for training data
 */
export function extractKeywords(message) {
  const keywords = [];
  const patterns = [
    /\b\d+\s*(sqft|sq\.?\s*ft\.?|square\s*feet)\b/gi,
    /\b₹?\s*[\d,]+(\s*(lakh|lac|cr|crore|k|thousand))?\b/gi,
    /\b(bandra|bkc|worli|mumbai|delhi|bangalore|pune)\b/gi,
    /\b(rent|lease|buy|purchase|property|properties|office|commercial|residential)\b/gi
  ];

  patterns.forEach(pattern => {
    const matches = message.match(pattern);
    if (matches) {
      keywords.push(...matches.map(m => m.toLowerCase()));
    }
  });

  return [...new Set(keywords)];
}

