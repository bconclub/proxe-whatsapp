import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Get conversation history for a lead from messages table
 * @param {string} leadId - Lead UUID from all_leads
 * @param {number} limit - Maximum number of messages to return
 * @returns {Promise<Array>} Array of message objects formatted for Claude
 */
export async function getConversationHistory(leadId, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching conversation history:', error);
      throw error;
    }

    // Map messages to Claude format (role: 'user' or 'assistant')
    return (data || []).reverse().map(msg => ({
      role: msg.sender === 'customer' ? 'user' : 'assistant',
      content: msg.content,
      timestamp: msg.created_at
    }));
  } catch (error) {
    logger.error('Error in getConversationHistory:', error);
    throw error;
  }
}

/**
 * Add message to conversation history (messages table)
 * @param {string} leadId - Lead UUID from all_leads
 * @param {string} message - Message content
 * @param {string} role - 'user' or 'assistant' (maps to 'customer' or 'agent' in DB)
 * @param {string} messageType - Message type ('text', 'button_click', 'image', etc.)
 * @param {object} metadata - Additional metadata to store
 */
export async function addToHistory(leadId, message, role = 'user', messageType = 'text', metadata = {}) {
  try {
    // Map role: 'user' -> 'customer', 'assistant' -> 'agent'
    const sender = role === 'user' ? 'customer' : 'agent';
    
    const { error } = await supabase
      .from('messages')
      .insert({
        lead_id: leadId,
        channel: 'whatsapp',
        sender: sender,
        content: message,
        message_type: messageType,
        metadata: metadata,
        created_at: new Date().toISOString()
      });

    if (error) {
      logger.error('Error adding to conversation history:', error);
      throw error;
    }
    
    logger.info(`Message logged to messages table for lead ${leadId}`);
  } catch (error) {
    logger.error('Error in addToHistory:', error);
    throw error;
  }
}

/**
 * Get recent messages for a lead
 * @param {string} leadId - Lead UUID
 * @param {number} limit - Number of messages to return
 * @returns {Promise<Array>} Array of message objects
 */
export async function getRecentMessages(leadId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching recent messages:', error);
      throw error;
    }

    return (data || []).reverse();
  } catch (error) {
    logger.error('Error in getRecentMessages:', error);
    throw error;
  }
}

