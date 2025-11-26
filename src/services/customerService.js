import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Normalize phone number for matching and deduplication
 * Removes all non-digits (spaces, +, -, etc.) while preserving country code and number
 * 
 * Examples:
 * - WhatsApp format: "919876543210" → "919876543210" (no change)
 * - Web format: "+91 9876543210" → "919876543210" (removes + and spaces)
 * - Web format: "+1 (555) 123-4567" → "15551234567" (removes all formatting)
 * 
 * This ensures web and WhatsApp numbers match correctly:
 * - Web user enters: "+91 9876543210" → normalized: "919876543210"
 * - WhatsApp message from: "919876543210" → normalized: "919876543210"
 * - System recognizes: SAME PERSON ✅
 * 
 * @param {string} phone - Phone number in any format (original format)
 * @returns {string} Normalized phone number (digits only, country code included)
 */
export function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return '';
  }
  // Remove all non-digit characters (spaces, +, -, parentheses, etc.)
  // This preserves country code and number as digits only
  return phone.replace(/\D/g, '');
}

/**
 * Get or create lead in all_leads by phone number
 * 
 * Phone number handling:
 * 1. Stores the WhatsApp number as-is in 'phone' field (preserves original format)
 * 2. Normalizes it (remove non-digits, keep country code) for 'customer_phone_normalized'
 * 3. Uses normalized version for matching against all_leads
 * 
 * This ensures consistent matching:
 * - Web user enters: "+91 9876543210" → normalized: "919876543210"
 * - WhatsApp message from: "919876543210" → normalized: "919876543210"
 * - System recognizes: SAME PERSON ✅
 * 
 * @param {string} phone - Phone number in original format
 *   - WhatsApp format: "919876543210" (country code + number, no formatting)
 *   - Web format: "+91 9876543210" or "+91-9876543210" (any formatting)
 * @param {string} brand - Brand name ('proxe' or 'windchasers')
 * @param {object} leadData - Optional lead data (name, email, etc.)
 * @returns {Promise<object>} Lead object from all_leads
 */
export async function getOrCreateLead(phone, brand = 'proxe', leadData = {}) {
  try {
    // Normalize phone number for matching (removes all non-digits)
    // This ensures web and WhatsApp numbers match correctly
    const normalizedPhone = normalizePhoneNumber(phone);
    
    if (!normalizedPhone) {
      throw new Error('Invalid phone number: phone number cannot be empty after normalization');
    }
    
    // Try to find existing lead using normalized phone number
    // This matches both web and WhatsApp formats (e.g., "+91 9876543210" matches "919876543210")
    const { data: existing, error: fetchError } = await supabase
      .from('all_leads')
      .select('*')
      .eq('customer_phone_normalized', normalizedPhone)
      .eq('brand', brand)
      .single();

    if (existing) {
      logger.info(`Found existing lead: ${existing.id} for phone ${phone} (normalized: ${normalizedPhone})`);
      
      // Update last interaction
      const { data: updated } = await supabase
        .from('all_leads')
        .update({
          last_touchpoint: 'whatsapp',
          last_interaction_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();
      
      return updated || existing;
    }

    // Create new lead
    // Store original phone format as-is, normalized version for matching
    const { data: newLead, error: createError } = await supabase
      .from('all_leads')
      .insert({
        customer_phone_normalized: normalizedPhone, // Normalized: digits only for matching
        phone: phone, // Original format: stored as-is (e.g., "919876543210" or "+91 9876543210")
        customer_name: leadData.profileName || leadData.name || null,
        email: leadData.email || null,
        first_touchpoint: 'whatsapp',
        last_touchpoint: 'whatsapp',
        brand: brand,
        last_interaction_at: new Date().toISOString(),
        unified_context: leadData.metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      logger.error('Error creating lead:', createError);
      throw createError;
    }

    logger.info(`Created new lead: ${newLead.id} for phone ${phone} (normalized: ${normalizedPhone})`);
    return newLead;
  } catch (error) {
    logger.error('Error in getOrCreateLead:', error);
    throw error;
  }
}

/**
 * Get or create customer by phone number (sessionId) - Legacy compatibility
 * Maps to getOrCreateLead for backward compatibility
 */
export async function getOrCreateCustomer(sessionId, profileName = null, brand = 'proxe') {
  const lead = await getOrCreateLead(sessionId, brand, { profileName, name: profileName });
  
  // Map lead to customer-like object for backward compatibility
  return {
    id: lead.id,
    phone: lead.phone,
    name: lead.customer_name,
    company: null, // Not in all_leads schema
    created_at: lead.created_at,
    last_contacted: lead.last_interaction_at,
    message_count: 0, // Will be tracked in whatsapp_sessions
    status: 'lead', // Default
    tags: [], // Store in unified_context if needed
    metadata: lead.unified_context || {}
  };
}

/**
 * Get lead by ID
 * @param {string} leadId - Lead UUID
 * @returns {Promise<object>} Lead object
 */
export async function getLeadById(leadId) {
  const { data, error } = await supabase
    .from('all_leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (error) {
    logger.error('Error fetching lead:', error);
    throw error;
  }

  return data;
}

/**
 * Get customer by ID - Legacy compatibility
 */
export async function getCustomerById(customerId) {
  const lead = await getLeadById(customerId);
  
  // Map to customer-like object
  return {
    id: lead.id,
    phone: lead.phone,
    name: lead.customer_name,
    company: null,
    created_at: lead.created_at,
    last_contacted: lead.last_interaction_at,
    message_count: 0,
    status: 'lead',
    tags: [],
    metadata: lead.unified_context || {}
  };
}

/**
 * Update lead last interaction
 * @param {string} leadId - Lead UUID
 */
export async function updateLeadContact(leadId) {
  const { error } = await supabase
    .from('all_leads')
    .update({
      last_touchpoint: 'whatsapp',
      last_interaction_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId);

  if (error) {
    logger.error('Error updating lead contact:', error);
    throw error;
  }
}

/**
 * Update customer last contacted - Legacy compatibility
 */
export async function updateCustomerContact(customerId) {
  await updateLeadContact(customerId);
}

/**
 * Get full customer context from all_leads table
 * Fetches unified_context including web conversations, bookings, and user inputs
 * 
 * Uses normalized phone number for matching to ensure web and WhatsApp numbers are recognized as the same person
 * 
 * @param {string} phone - Phone number in original format (e.g., "919876543210" or "+91 9876543210")
 * @param {string} brand - Brand name ('proxe' or 'windchasers')
 * @returns {Promise<object>} Enriched context object with web conversations, booking info, and user inputs
 */
export async function getCustomerFullContext(phone, brand = 'proxe') {
  try {
    // Normalize phone number for matching (ensures web and WhatsApp formats match)
    const normalizedPhone = normalizePhoneNumber(phone);
    
    // Fetch lead from all_leads table
    const { data: lead, error } = await supabase
      .from('all_leads')
      .select('*')
      .eq('customer_phone_normalized', normalizedPhone)
      .eq('brand', brand)
      .single();

    if (error) {
      // If lead doesn't exist, return empty context
      if (error.code === 'PGRST116') {
        logger.info(`No lead found for phone ${phone} (brand: ${brand})`);
        return {
          conversationSummary: null,
          booking: null,
          userInputs: [],
          webConversations: null
        };
      }
      logger.error('Error fetching lead for full context:', error);
      throw error;
    }

    if (!lead) {
      return {
        conversationSummary: null,
        booking: null,
        userInputs: [],
        webConversations: null
      };
    }

    const unifiedContext = lead.unified_context || {};
    const webContext = unifiedContext.web || {};
    
    // Extract web conversation summary
    const conversationSummary = webContext.conversation_summary 
      || webContext.summary 
      || webContext.last_conversation_summary 
      || null;

    // Extract booking information
    const booking = {
      booking_date: unifiedContext.booking_date || webContext.booking_date || null,
      booking_time: unifiedContext.booking_time || webContext.booking_time || null,
      booking_status: unifiedContext.booking_status || webContext.booking_status || null,
      exists: !!(unifiedContext.booking_date || webContext.booking_date || 
                unifiedContext.booking_time || webContext.booking_time)
    };

    // Extract user inputs from web conversations
    const userInputs = webContext.user_inputs 
      || webContext.inputs 
      || webContext.past_interests 
      || webContext.interests 
      || [];
    
    // Extract full web conversations if available
    const webConversations = webContext.conversations 
      || webContext.messages 
      || webContext.chat_history 
      || null;

    logger.info(`Retrieved full context for phone ${phone}: booking exists=${booking.exists}, user inputs=${userInputs.length}`);

    return {
      conversationSummary,
      booking: booking.exists ? booking : null,
      userInputs: Array.isArray(userInputs) ? userInputs : [],
      webConversations
    };
  } catch (error) {
    logger.error('Error in getCustomerFullContext:', error);
    throw error;
  }
}

/**
 * Build full customer context for AI
 * Enhanced flow: Gets customer, checks all_leads, fetches unified_context,
 * checks for bookings, and builds enriched context
 * Uses all_leads, whatsapp_sessions, and messages tables
 */
export async function buildCustomerContext(sessionId, brand = 'proxe') {
  try {
    // Step 1: Get or create lead
    const lead = await getOrCreateLead(sessionId, brand);
    
    // Step 2: Get full context from all_leads (unified_context with web conversations, bookings)
    const fullContext = await getCustomerFullContext(sessionId, brand);
    
    // Step 3: Get WhatsApp session
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('external_session_id', sessionId)
      .eq('brand', brand)
      .single();
    
    // Step 4: Fetch conversation history from messages table (WhatsApp channel)
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .limit(20);

    // Step 5: Extract interests and patterns from messages
    const previousInterests = extractInterests(messages || []);
    const conversationPhase = determinePhase(messages || []);

    // Combine web conversation summary with WhatsApp summary
    const webSummary = fullContext.conversationSummary || '';
    const whatsappSummary = session?.conversation_summary || generateSummary(messages || []);
    const combinedSummary = webSummary 
      ? (whatsappSummary !== 'New customer, no previous conversation.' 
          ? `Web: ${webSummary}\nWhatsApp: ${whatsappSummary}` 
          : `Web: ${webSummary}`)
      : whatsappSummary;

    // Merge web user inputs with WhatsApp interests
    const allInterests = [
      ...(fullContext.userInputs || []),
      ...previousInterests
    ].filter((value, index, self) => 
      self.indexOf(value) === index && value && value.trim()
    ).slice(0, 10);

    // Build enriched context object
    const context = {
      customerId: lead.id,
      leadId: lead.id, // Add leadId for clarity
      name: lead.customer_name || session?.customer_name,
      phone: lead.phone,
      brand: lead.brand,
      firstTouchpoint: lead.first_touchpoint,
      lastTouchpoint: lead.last_touchpoint,
      firstContact: lead.created_at,
      lastContact: lead.last_interaction_at,
      conversationCount: session?.message_count || 0,
      conversationPhase,
      previousInterests: allInterests,
      budget: lead.unified_context?.budget || null,
      conversationSummary: combinedSummary,
      lastMessages: (messages || []).slice(0, 10).reverse().map(msg => ({
        role: msg.sender === 'customer' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.created_at
      })),
      tags: lead.unified_context?.tags || [],
      metadata: lead.unified_context || {},
      // Enhanced context from unified_context
      webConversationSummary: fullContext.conversationSummary,
      booking: fullContext.booking,
      webUserInputs: fullContext.userInputs,
      webConversations: fullContext.webConversations,
      sessionData: session ? {
        sessionId: session.id,
        conversationStatus: session.conversation_status || 'active', // Use conversation_status instead of session_status
        lastMessageAt: session.last_message_at
      } : null
    };

    return context;
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
    const content = msg.content?.toLowerCase() || '';
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
function determinePhase(messages) {
  const messageCount = messages.length;
  if (messageCount === 0) return 'discovery';
  if (messageCount < 3) return 'discovery';
  if (messageCount < 8) return 'evaluation';
  return 'closing';
}

/**
 * Generate conversation summary
 */
function generateSummary(messages) {
  if (messages.length === 0) {
    return 'New customer, no previous conversation.';
  }

  const recentMessages = messages.slice(0, 5).reverse();
  const summary = recentMessages
    .map(msg => `${msg.sender}: ${msg.content}`)
    .join(' | ');

  return summary.length > 500 ? summary.substring(0, 500) + '...' : summary;
}

