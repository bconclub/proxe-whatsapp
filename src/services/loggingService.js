import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { updateLeadContact } from './customerService.js';
import { addToHistory } from './conversationService.js';

/**
 * Store conversation log
 * Now stores analytics data in messages table metadata instead of separate conversation_logs table
 * @param {object} logData - Log data object
 * @param {string} logData.customerId - Lead UUID (mapped from customerId for compatibility)
 * @param {string} logData.message - Customer message
 * @param {string} logData.response - AI response
 * @param {string} logData.responseType - Response type
 * @param {number} logData.tokensUsed - Tokens used
 * @param {number} logData.responseTime - Response time in ms
 * @param {object} logData.metadata - Additional metadata
 */
export async function storeConversationLog(logData) {
  try {
    const leadId = logData.customerId || logData.leadId;
    
    if (!leadId) {
      throw new Error('leadId or customerId is required');
    }

    // The customer message and AI response are already logged via addToHistory
    // This function now just updates the AI response message with analytics metadata
    // We need to find the most recent AI response message and update its metadata
    
    // Get the most recent agent message for this lead
    const { data: recentMessages, error: fetchError } = await supabase
      .from('messages')
      .select('id')
      .eq('lead_id', leadId)
      .eq('channel', 'whatsapp')
      .eq('sender', 'agent')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recentMessages && !fetchError) {
      // Update the most recent AI response message with analytics metadata
      const analyticsMetadata = {
        tokens_used: logData.tokensUsed || 0,
        response_time_ms: logData.responseTime || 0,
        response_type: logData.responseType || 'text_only',
        ...(logData.metadata || {})
      };

      const { error: updateError } = await supabase
        .from('messages')
        .update({
          metadata: analyticsMetadata
        })
        .eq('id', recentMessages.id);

      if (updateError) {
        logger.error('Error updating message metadata:', updateError);
        // Don't throw - logging is not critical
      } else {
        logger.info(`Conversation analytics stored for message ${recentMessages.id}`);
      }
    } else {
      // If we can't find the message, log it as a warning but don't fail
      logger.warn('Could not find recent AI response message to update with analytics');
    }

    // Update lead contact timestamp
    await updateLeadContact(leadId);

    return { success: true, leadId };
  } catch (error) {
    logger.error('Error in storeConversationLog:', error);
    // Don't throw - logging failures shouldn't break the flow
    return { success: false, error: error.message };
  }
}

/**
 * Extract keywords/entities from message for training data
 * @param {string} message - Message text
 * @returns {Array<string>} Array of extracted keywords
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

/**
 * Query messages for analytics/retraining
 * @param {object} filters - Filter options
 * @param {string} filters.brand - Brand filter
 * @param {Date} filters.startDate - Start date
 * @param {Date} filters.endDate - End date
 * @param {number} filters.limit - Result limit
 * @returns {Promise<Array>} Array of message pairs for training
 */
export async function getMessagesForRetraining(filters = {}) {
  try {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false });

    if (filters.brand) {
      // Join with all_leads to filter by brand
      query = query.eq('lead_id', filters.brand); // This would need a proper join in production
    }

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }

    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate.toISOString());
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching messages for retraining:', error);
      throw error;
    }

    // Group messages into customer-agent pairs
    const pairs = [];
    const leadMessages = {};

    (data || []).forEach(msg => {
      if (!leadMessages[msg.lead_id]) {
        leadMessages[msg.lead_id] = [];
      }
      leadMessages[msg.lead_id].push(msg);
    });

    // Create pairs (customer message + following agent response)
    Object.values(leadMessages).forEach(messages => {
      messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i].sender === 'customer' && messages[i + 1].sender === 'agent') {
          pairs.push({
            customer_message: messages[i].content,
            ai_response: messages[i + 1].content,
            metadata: {
              ...messages[i + 1].metadata,
              timestamp: messages[i + 1].created_at
            }
          });
        }
      }
    });

    return pairs;
  } catch (error) {
    logger.error('Error in getMessagesForRetraining:', error);
    throw error;
  }
}

/**
 * Get average response time metrics from the last 5 responses
 * @returns {Promise<object>} Object with average response times
 */
export async function getAverageResponseTimes() {
  try {
    // Get the last 5 agent messages with response_time_ms in metadata
    const { data: messages, error } = await supabase
      .from('messages')
      .select('metadata, created_at')
      .eq('channel', 'whatsapp')
      .eq('sender', 'agent')
      .not('metadata', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      logger.error('Error fetching messages for response time calculation:', error);
      throw error;
    }

    // Extract response times from metadata
    const responseTimes = (messages || [])
      .map(msg => {
        const metadata = msg.metadata || {};
        return metadata.response_time_ms;
      })
      .filter(time => typeof time === 'number' && time > 0);

    if (responseTimes.length === 0) {
      return {
        averageResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        totalRequests: 0,
        sampleSize: 5
      };
    }

    const sum = responseTimes.reduce((acc, time) => acc + time, 0);
    const average = Math.round(sum / responseTimes.length);
    const min = Math.min(...responseTimes);
    const max = Math.max(...responseTimes);

    return {
      averageResponseTime: average,
      minResponseTime: min,
      maxResponseTime: max,
      totalRequests: responseTimes.length,
      sampleSize: 5
    };
  } catch (error) {
    logger.error('Error in getAverageResponseTimes:', error);
    throw error;
  }
}

