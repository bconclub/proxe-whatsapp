import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { getMessagesForRetraining } from './loggingService.js';

/**
 * Aggregate logs from past 24 hours for model retraining
 * Now uses messages table instead of conversation_logs
 * OPEN INTEGRATION: Send to fine-tuning pipeline
 */
export async function aggregateTrainingData(hours = 24, brand = null) {
  try {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Fetch messages from past N hours using messages table
    let query = supabase
      .from('messages')
      .select(`
        *,
        all_leads (
          id,
          customer_name,
          phone,
          brand,
          unified_context
        )
      `)
      .eq('channel', 'whatsapp')
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: true });

    // Filter by brand if provided
    if (brand) {
      // Note: This requires a join, which Supabase handles via the select above
      // We'll filter in JavaScript for now, or use a more complex query
      query = query.eq('all_leads.brand', brand);
    }

    const { data: messages, error } = await query;

    if (error) {
      logger.error('Error fetching training data:', error);
      throw error;
    }

    // Group messages into conversation pairs (customer -> agent)
    const conversationPairs = [];
    const leadMessages = {};

    // Group messages by lead
    (messages || []).forEach(msg => {
      if (!leadMessages[msg.lead_id]) {
        leadMessages[msg.lead_id] = [];
      }
      leadMessages[msg.lead_id].push(msg);
    });

    // Create conversation pairs
    Object.values(leadMessages).forEach(msgs => {
      msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      for (let i = 0; i < msgs.length - 1; i++) {
        if (msgs[i].sender === 'customer' && msgs[i + 1].sender === 'agent') {
          conversationPairs.push({
            customer_message: msgs[i].content,
            ai_response: msgs[i + 1].content,
            lead: msgs[i].all_leads,
            metadata: {
              ...msgs[i + 1].metadata,
              timestamp: msgs[i + 1].created_at,
              message_type: msgs[i + 1].message_type
            }
          });
        }
      }
    });

    // Group by customer segment
    const segments = groupBySegment(conversationPairs);

    // Prepare training dataset
    const trainingData = {
      timestamp: new Date().toISOString(),
      period: `${hours} hours`,
      totalConversations: conversationPairs.length,
      segments,
      dataset: formatForTraining(conversationPairs)
    };

    logger.info(`Aggregated ${conversationPairs.length} conversations for training`);

    // TODO: Send to fine-tuning pipeline or data warehouse
    // await sendToTrainingPipeline(trainingData);

    return trainingData;
  } catch (error) {
    logger.error('Error aggregating training data:', error);
    throw error;
  }
}

/**
 * Group conversations by customer segment
 */
function groupBySegment(conversationPairs) {
  const segments = {
    new_customers: [],
    hot_leads: [],
    evaluation_phase: [],
    closing_phase: []
  };

  conversationPairs.forEach(pair => {
    const lead = pair.lead;
    if (!lead) return;

    const messageCount = lead.unified_context?.message_count || 0;
    const tags = lead.unified_context?.tags || [];
    const phase = lead.unified_context?.phase;

    if (messageCount <= 3) {
      segments.new_customers.push(pair);
    } else if (tags.includes('hot_lead') || tags.includes('hot')) {
      segments.hot_leads.push(pair);
    } else if (phase === 'evaluation') {
      segments.evaluation_phase.push(pair);
    } else if (phase === 'closing') {
      segments.closing_phase.push(pair);
    }
  });

  return segments;
}

/**
 * Format conversation pairs for training dataset
 */
function formatForTraining(conversationPairs) {
  return conversationPairs.map(pair => ({
    customer_context: {
      name: pair.lead?.customer_name,
      phone: pair.lead?.phone,
      brand: pair.lead?.brand,
      tags: pair.lead?.unified_context?.tags || [],
      metadata: pair.lead?.unified_context || {}
    },
    input: pair.customer_message,
    output: pair.ai_response,
    metadata: {
      response_type: pair.metadata?.response_type || 'text_only',
      tokens_used: pair.metadata?.tokens_used || 0,
      response_time: pair.metadata?.response_time_ms || 0,
      message_type: pair.metadata?.message_type || 'text'
    }
  }));
}
