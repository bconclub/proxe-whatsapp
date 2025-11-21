import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Get or create customer by phone number (sessionId)
 */
export async function getOrCreateCustomer(sessionId, profileName = null) {
  try {
    // Try to find existing customer
    const { data: existing, error: fetchError } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', sessionId)
      .single();

    if (existing) {
      logger.info(`Found existing customer: ${existing.id}`);
      return existing;
    }

    // Create new customer
    const { data: newCustomer, error: createError } = await supabase
      .from('customers')
      .insert({
        phone: sessionId,
        name: profileName || `Customer ${sessionId}`,
        created_at: new Date().toISOString(),
        last_contacted: new Date().toISOString(),
        message_count: 0,
        status: 'lead',
        tags: [],
        metadata: {}
      })
      .select()
      .single();

    if (createError) {
      logger.error('Error creating customer:', createError);
      throw createError;
    }

    logger.info(`Created new customer: ${newCustomer.id}`);
    return newCustomer;
  } catch (error) {
    logger.error('Error in getOrCreateCustomer:', error);
    throw error;
  }
}

/**
 * Get customer by ID
 */
export async function getCustomerById(customerId) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  if (error) {
    logger.error('Error fetching customer:', error);
    throw error;
  }

  return data;
}

/**
 * Update customer last contacted timestamp and increment message count
 */
export async function updateCustomerContact(customerId) {
  const { data: customer } = await supabase
    .from('customers')
    .select('message_count')
    .eq('id', customerId)
    .single();

  const { error } = await supabase
    .from('customers')
    .update({
      last_contacted: new Date().toISOString(),
      message_count: (customer?.message_count || 0) + 1
    })
    .eq('id', customerId);

  if (error) {
    logger.error('Error updating customer contact:', error);
    throw error;
  }
}

/**
 * Build full customer context for AI
 */
export async function buildCustomerContext(sessionId) {
  try {
    const customer = await getOrCreateCustomer(sessionId);
    
    // Fetch conversation history
    const { data: messages } = await supabase
      .from('conversation_history')
      .select('*')
      .eq('customer_id', customer.id)
      .order('timestamp', { ascending: false })
      .limit(20);

    // Fetch recent logs for summary
    const { data: logs } = await supabase
      .from('conversation_logs')
      .select('customer_message, ai_response')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Extract interests and patterns from messages
    const previousInterests = extractInterests(messages || []);
    const conversationPhase = determinePhase(messages || [], logs || []);

    return {
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      company: customer.company,
      firstContact: customer.created_at,
      lastContact: customer.last_contacted,
      conversationCount: customer.message_count,
      conversationPhase,
      previousInterests,
      budget: customer.metadata?.budget || null,
      conversationSummary: generateSummary(messages || [], logs || []),
      lastMessages: (messages || []).slice(0, 10).reverse().map(msg => ({
        role: msg.role,
        content: msg.message,
        timestamp: msg.timestamp
      })),
      tags: customer.tags || [],
      metadata: customer.metadata || {}
    };
  } catch (error) {
    logger.error('Error building customer context:', error);
    throw error;
  }
}

/**
 * Extract interests from conversation history
 */
function extractInterests(messages) {
  const interests = [];
  const keywords = ['property', 'properties', 'sqft', 'budget', 'location', 'area', 'rent'];
  
  messages.forEach(msg => {
    const content = msg.message?.toLowerCase() || '';
    keywords.forEach(keyword => {
      if (content.includes(keyword)) {
        const context = extractContext(content, keyword);
        if (context && !interests.includes(context)) {
          interests.push(context);
        }
      }
    });
  });

  return interests.slice(0, 5);
}

function extractContext(text, keyword) {
  const index = text.indexOf(keyword);
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + keyword.length + 20);
  return text.substring(start, end).trim();
}

/**
 * Determine conversation phase
 */
function determinePhase(messages, logs) {
  const messageCount = messages.length;
  if (messageCount === 0) return 'discovery';
  if (messageCount < 3) return 'discovery';
  if (messageCount < 8) return 'evaluation';
  return 'closing';
}

/**
 * Generate conversation summary
 */
function generateSummary(messages, logs) {
  if (messages.length === 0) {
    return 'New customer, no previous conversation.';
  }

  const recentMessages = messages.slice(0, 5).reverse();
  const summary = recentMessages
    .map(msg => `${msg.role}: ${msg.message}`)
    .join(' | ');

  return summary.length > 500 ? summary.substring(0, 500) + '...' : summary;
}

