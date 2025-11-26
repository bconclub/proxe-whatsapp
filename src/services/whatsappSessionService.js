import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { normalizePhoneNumber } from './customerService.js';

/**
 * Get or create WhatsApp session
 * @param {string} externalSessionId - WhatsApp session identifier (phone number)
 *   - WhatsApp format: "919876543210" (country code + number, no formatting)
 * @param {string} brand - Brand name ('proxe' or 'windchasers')
 * @param {object} sessionData - Optional session data (name, phone, etc.)
 * @returns {Promise<object>} WhatsApp session object
 */
export async function getOrCreateWhatsAppSession(externalSessionId, brand = 'proxe', sessionData = {}) {
  try {
    // Normalize phone number for deduplication (consistent with all_leads normalization)
    // This ensures web and WhatsApp numbers can be matched correctly
    const normalizedPhone = normalizePhoneNumber(externalSessionId);
    
    // Try to find existing session
    // Note: Check what columns actually exist - might be 'chat_session_id' or 'session_id' instead of 'external_session_id'
    const { data: existing, error: fetchError } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('customer_phone', externalSessionId)
      .eq('brand', brand)
      .single();

    if (existing) {
      logger.info(`Found existing WhatsApp session: ${existing.id}`);
      return existing;
    }

    // Create new WhatsApp session
    // Use only columns that exist in the actual schema (removed session_status if it doesn't exist)
    const insertData = {
      brand: brand,
      customer_name: sessionData.profileName || sessionData.name || null,
      customer_email: sessionData.email || null,
      customer_phone: externalSessionId, // Store original format as-is
      customer_phone_normalized: normalizedPhone, // Normalized: digits only for matching
      message_count: 0,
      last_message_at: new Date().toISOString(),
      channel_data: sessionData.channelData || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Only add external_session_id if the column exists (will be caught by error if it doesn't)
    // Try with external_session_id first, fallback to just customer_phone if it fails
    const { data: newSession, error: createError } = await supabase
      .from('whatsapp_sessions')
      .insert(insertData)
      .select()
      .single();

    if (createError) {
      logger.error('Error creating WhatsApp session:', createError);
      throw createError;
    }

    logger.info(`Created new WhatsApp session: ${newSession.id}`);
    return newSession;
  } catch (error) {
    logger.error('Error in getOrCreateWhatsAppSession:', error);
    throw error;
  }
}

/**
 * Get WhatsApp session by ID
 * @param {string} sessionId - Session UUID
 * @returns {Promise<object>} WhatsApp session object
 */
export async function getWhatsAppSessionById(sessionId) {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    logger.error('Error fetching WhatsApp session:', error);
    throw error;
  }

  return data;
}

/**
 * Get WhatsApp session by external session ID
 * @param {string} externalSessionId - WhatsApp session identifier
 * @param {string} brand - Brand name
 * @returns {Promise<object>} WhatsApp session object
 */
export async function getWhatsAppSessionByExternalId(externalSessionId, brand = 'proxe') {
  // Use customer_phone instead of external_session_id
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('customer_phone', externalSessionId)
    .eq('brand', brand)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    logger.error('Error fetching WhatsApp session:', error);
    throw error;
  }

  return data;
}

/**
 * Update WhatsApp session
 * @param {string} sessionId - Session UUID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated session object
 */
export async function updateWhatsAppSession(sessionId, updates) {
  // Remove session_status from updates if it doesn't exist in schema
  const cleanUpdates = { ...updates };
  delete cleanUpdates.session_status; // Remove if column doesn't exist
  
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .update({
      ...cleanUpdates,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    logger.error('Error updating WhatsApp session:', error);
    throw error;
  }

  return data;
}

/**
 * Update session message count and last message timestamp
 * @param {string} sessionId - Session UUID
 */
export async function incrementSessionMessageCount(sessionId) {
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('message_count')
    .eq('id', sessionId)
    .single();

  const { error } = await supabase
    .from('whatsapp_sessions')
    .update({
      message_count: (session?.message_count || 0) + 1,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  if (error) {
    logger.error('Error incrementing session message count:', error);
    throw error;
  }
}

/**
 * Link WhatsApp session to lead
 * @param {string} sessionId - Session UUID
 * @param {string} leadId - Lead UUID from all_leads
 */
export async function linkSessionToLead(sessionId, leadId) {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .update({
      lead_id: leadId,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  if (error) {
    logger.error('Error linking session to lead:', error);
    throw error;
  }
}

/**
 * Update conversation summary in session
 * @param {string} sessionId - Session UUID
 * @param {string} summary - Conversation summary text
 */
export async function updateConversationSummary(sessionId, summary) {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .update({
      conversation_summary: summary,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  if (error) {
    logger.error('Error updating conversation summary:', error);
    throw error;
  }
}

