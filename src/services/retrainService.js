import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Aggregate logs from past 24 hours for model retraining
 * OPEN INTEGRATION: Send to fine-tuning pipeline
 */
export async function aggregateTrainingData(hours = 24) {
  try {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Fetch logs from past N hours
    const { data: logs, error } = await supabase
      .from('conversation_logs')
      .select(`
        *,
        customers (
          id,
          name,
          phone,
          company,
          tags,
          metadata
        )
      `)
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Error fetching training data:', error);
      throw error;
    }

    // Group by customer segment
    const segments = groupBySegment(logs || []);

    // Prepare training dataset
    const trainingData = {
      timestamp: new Date().toISOString(),
      period: `${hours} hours`,
      totalConversations: logs?.length || 0,
      segments,
      dataset: formatForTraining(logs || [])
    };

    logger.info(`Aggregated ${logs?.length || 0} conversations for training`);

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
function groupBySegment(logs) {
  const segments = {
    new_customers: [],
    hot_leads: [],
    evaluation_phase: [],
    closing_phase: []
  };

  logs.forEach(log => {
    const customer = log.customers;
    if (!customer) return;

    if (customer.message_count <= 3) {
      segments.new_customers.push(log);
    } else if (customer.tags?.includes('hot_lead')) {
      segments.hot_leads.push(log);
    } else if (customer.metadata?.phase === 'evaluation') {
      segments.evaluation_phase.push(log);
    } else if (customer.metadata?.phase === 'closing') {
      segments.closing_phase.push(log);
    }
  });

  return segments;
}

/**
 * Format logs for training dataset
 */
function formatForTraining(logs) {
  return logs.map(log => ({
    customer_context: {
      name: log.customers?.name,
      company: log.customers?.company,
      tags: log.customers?.tags,
      message_count: log.customers?.message_count
    },
    input: log.customer_message,
    output: log.ai_response,
    metadata: {
      response_type: log.response_type,
      tokens_used: log.tokens_used,
      response_time: log.response_time_ms
    }
  }));
}

