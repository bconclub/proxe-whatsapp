import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Get conversation history for a customer
 */
export async function getConversationHistory(customerId, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('conversation_history')
      .select('*')
      .eq('customer_id', customerId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching conversation history:', error);
      throw error;
    }

    return (data || []).reverse().map(msg => ({
      role: msg.role,
      content: msg.message,
      timestamp: msg.timestamp
    }));
  } catch (error) {
    logger.error('Error in getConversationHistory:', error);
    throw error;
  }
}

/**
 * Add message to conversation history
 */
export async function addToHistory(customerId, message, role = 'user', messageType = 'text') {
  try {
    const { error } = await supabase
      .from('conversation_history')
      .insert({
        customer_id: customerId,
        message,
        role,
        timestamp: new Date().toISOString(),
        message_type: messageType
      });

    if (error) {
      logger.error('Error adding to conversation history:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Error in addToHistory:', error);
    throw error;
  }
}

