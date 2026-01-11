import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Safely convert a value to a trimmed string
 * Handles null, undefined, numbers, and other types gracefully
 * 
 * @param {any} value - Value to convert to string
 * @returns {string} Trimmed string (empty string if value is null/undefined)
 */
function safeString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value).trim();
}

/**
 * Normalize phone number for matching and deduplication
 * Returns the last 10 digits of the phone number (removes country code)
 * 
 * This ensures web and WhatsApp numbers match correctly:
 * - Web user with "9876543210" matches WhatsApp user with "919876543210"
 * - Both normalize to: "9876543210" (last 10 digits)
 * 
 * @param {string} phone - Phone number in any format
 * @returns {string|null} Normalized phone number (last 10 digits only) or null if invalid
 */
function normalizePhone(phone) {
  if (!phone) return null;
  
  // Convert to string and remove all non-digits
  const phoneStr = safeString(phone);
  if (!phoneStr) return null;
  
  const digits = phoneStr.replace(/\D/g, '');
  
  if (!digits || digits.length < 10) return null;
  
  // Return last 10 digits as string (handles both 9876543210 and 919876543210)
  return String(digits.slice(-10));
}

/**
 * Normalize phone number - alias for normalizePhone (exported for backward compatibility)
 * @param {string} phone - Phone number in any format
 * @returns {string|null} Normalized phone number (last 10 digits only) or null if invalid
 */
export function normalizePhoneNumber(phone) {
  return normalizePhone(phone);
}

/**
 * Get or create lead in all_leads by phone number
 * 
 * Phone number handling:
 * 1. Stores the WhatsApp number as-is in 'phone' field (preserves original format)
 * 2. Normalizes it to last 10 digits for 'customer_phone_normalized' (removes country code)
 * 3. Uses normalized version for matching against all_leads
 * 
 * This ensures consistent matching:
 * - Web user enters: "9876543210" → normalized: "9876543210"
 * - WhatsApp message from: "919876543210" → normalized: "9876543210" (last 10 digits)
 * - System recognizes: SAME PERSON ✅
 * 
 * @param {string} phone - Phone number in original format
 *   - WhatsApp format: "919876543210" (country code + number, no formatting)
 *   - Web format: "9876543210" or "+91 9876543210" (any formatting)
 * @param {string} brand - Brand name ('proxe' or 'windchasers')
 * @param {object} leadData - Optional lead data (name, email, etc.)
 * @returns {Promise<object>} Lead object from all_leads
 */
export async function getOrCreateLead(phone, brand = 'proxe', leadData = {}) {
  try {
    // Normalize phone number to last 10 digits (removes country code)
    // This ensures web and WhatsApp numbers match correctly
    const normalizedPhone = normalizePhone(phone);
    
    if (!normalizedPhone) {
      throw new Error('Invalid phone number: phone number must have at least 10 digits');
    }
    
    // Try to find existing lead using normalized phone number (last 10 digits)
    // This matches both web and WhatsApp formats (e.g., "9876543210" matches "919876543210")
    const { data: existingLead, error: fetchError } = await supabase
      .from('all_leads')
      .select('*')
      .eq('customer_phone_normalized', normalizedPhone)
      .eq('brand', brand)
      .single();

    if (existingLead) {
      logger.info(`Found existing lead: ${existingLead.id} for phone ${phone} (normalized: ${normalizedPhone})`);
      
      // UPDATE existing lead - merge WhatsApp data into unified_context
      const existingContext = existingLead.unified_context || {};
      
      // Merge WhatsApp data into unified_context
      const updatedContext = {
        ...existingContext,
        whatsapp: {
          ...(existingContext.whatsapp || {}),
          last_interaction: new Date().toISOString(),
          conversation_summary: leadData.conversation_summary || existingContext.whatsapp?.conversation_summary,
          message_count: (existingContext.whatsapp?.message_count || 0) + 1
        }
      };

      // Update the lead
      const { data: updatedLead, error: updateError } = await supabase
        .from('all_leads')
        .update({
          last_touchpoint: 'whatsapp',
          last_interaction_at: new Date().toISOString(),
          unified_context: updatedContext,
          // Also update name if provided and currently null
          customer_name: existingLead.customer_name || leadData.profileName || leadData.name || null,
          email: existingLead.email || leadData.email || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingLead.id)
        .select()
        .single();

      if (updateError) {
        logger.error('Error updating lead:', updateError);
        return existingLead; // Return existing if update fails
      }

      return updatedLead;
    }

    // Create new lead if doesn't exist
    // Store original phone format as-is, normalized version for matching
    const { data: newLead, error: createError } = await supabase
      .from('all_leads')
      .insert({
        customer_name: leadData.profileName || leadData.name || null,
        email: leadData.email || null,
        phone: phone, // Original format: stored as-is (e.g., "919876543210" or "+91 9876543210")
        customer_phone_normalized: normalizedPhone, // Normalized: last 10 digits only (removes country code)
        first_touchpoint: 'whatsapp',
        last_touchpoint: 'whatsapp',
        last_interaction_at: new Date().toISOString(),
        brand: brand,
        unified_context: {
          whatsapp: {
            last_interaction: new Date().toISOString(),
            conversation_summary: leadData.conversation_summary || null,
            message_count: 1
          },
          ...(leadData.metadata || {})
        },
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
 * Update WhatsApp context in unified_context for a lead
 * Merges WhatsApp conversation summary and booking data into all_leads.unified_context.whatsapp
 * @param {string} leadId - Lead UUID
 * @param {object} summaryData - Object containing conversation_summary, conversation_context, user_inputs_summary, message_count, last_interaction, booking_status, booking_date, booking_time
 */
export async function updateWhatsAppContext(leadId, summaryData) {
  try {
    const { data: lead, error: fetchError } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .single();

    if (fetchError) {
      logger.error('Error fetching lead for WhatsApp context update:', fetchError);
      return;
    }

    const existingContext = lead?.unified_context || {};
    
    const updatedContext = {
      ...existingContext,
      whatsapp: {
        ...(existingContext.whatsapp || {}),
        conversation_summary: summaryData.conversation_summary || summaryData.summary || existingContext.whatsapp?.conversation_summary,
        conversation_context: summaryData.conversation_context || existingContext.whatsapp?.conversation_context,
        user_inputs_summary: summaryData.user_inputs_summary || existingContext.whatsapp?.user_inputs_summary,
        message_count: summaryData.message_count !== undefined ? summaryData.message_count : existingContext.whatsapp?.message_count,
        last_interaction: summaryData.last_interaction || new Date().toISOString(),
        booking_status: summaryData.booking_status || existingContext.whatsapp?.booking_status,
        booking_date: summaryData.booking_date || existingContext.whatsapp?.booking_date,
        booking_time: summaryData.booking_time || existingContext.whatsapp?.booking_time
      }
    };

    const { error } = await supabase
      .from('all_leads')
      .update({
        unified_context: updatedContext,
        last_touchpoint: 'whatsapp',
        last_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    if (error) {
      logger.error('Error updating WhatsApp context:', error);
    } else {
      logger.info(`Updated WhatsApp context for lead ${leadId}`);
    }
  } catch (error) {
    logger.error('Error in updateWhatsAppContext:', error);
  }
}

/**
 * Get full customer context from all_leads table
 * Fetches unified_context including web conversations, bookings, and user inputs
 * 
 * Uses normalized phone number (last 10 digits) for matching to ensure web and WhatsApp numbers are recognized as the same person
 * 
 * @param {string} phone - Phone number in original format (e.g., "919876543210" or "9876543210")
 * @param {string} brand - Brand name ('proxe' or 'windchasers')
 * @returns {Promise<object>} Enriched context object with web conversations, booking info, and user inputs
 */
export async function getCustomerFullContext(phone, brand = 'proxe') {
  try {
    // Normalize phone number to last 10 digits (ensures web and WhatsApp formats match)
    const normalizedPhone = normalizePhone(phone);
    
    if (!normalizedPhone) {
      logger.warn(`Invalid phone number for full context lookup: ${phone}`);
      return {
        conversationSummary: null,
        userInputSummary: null,
        booking: null,
        userInputs: [],
        webConversations: null,
        channelData: null
      };
    }
    
    // Fetch lead from all_leads table using normalized phone
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
        userInputSummary: null,
        booking: null,
        userInputs: [],
        webConversations: null,
        channelData: null
      };
    }

    const unifiedContext = lead.unified_context || {};
    const webContext = unifiedContext.web || {};
    const whatsappContext = unifiedContext.whatsapp || {};
    
    // Extract conversation summary from web or WhatsApp
    const conversationSummary = webContext.conversation_summary 
      || webContext.summary 
      || webContext.last_conversation_summary
      || whatsappContext.conversation_summary
      || whatsappContext.summary
      || null;

    // Extract user input summary (from web or WhatsApp)
    const userInputSummary = webContext.user_input_summary
      || whatsappContext.user_input_summary
      || unifiedContext.user_input_summary
      || null;

    // Extract booking information
    const booking = {
      booking_date: unifiedContext.booking_date || webContext.booking_date || null,
      booking_time: unifiedContext.booking_time || webContext.booking_time || null,
      booking_status: unifiedContext.booking_status || webContext.booking_status || null,
      exists: !!(unifiedContext.booking_date || webContext.booking_date || 
                unifiedContext.booking_time || webContext.booking_time)
    };

    // Extract user inputs from web and WhatsApp conversations
    const webUserInputs = webContext.user_inputs 
      || webContext.inputs 
      || webContext.past_interests 
      || webContext.interests 
      || [];
    
    const whatsappUserInputs = whatsappContext.user_inputs
      || whatsappContext.inputs
      || whatsappContext.past_interests
      || whatsappContext.interests
      || [];
    
    // Combine and convert all user inputs to safe strings
    const rawUserInputs = [...webUserInputs, ...whatsappUserInputs];
    const userInputs = Array.isArray(rawUserInputs) 
      ? rawUserInputs.map(input => safeString(input)).filter(input => input.length > 0)
      : [];
    
    // Extract full web conversations if available
    const webConversations = webContext.conversations 
      || webContext.messages 
      || webContext.chat_history 
      || null;

    // Extract channel data from unified_context
    const channelData = unifiedContext.channel_data
      || webContext.channel_data
      || whatsappContext.channel_data
      || null;

    logger.info(`Retrieved full context for phone ${phone}: booking exists=${booking.exists}, user inputs=${userInputs.length}, has channel data=${!!channelData}`);

    return {
      conversationSummary: safeString(conversationSummary),
      userInputSummary: safeString(userInputSummary),
      booking: booking.exists ? booking : null,
      userInputs,
      webConversations,
      channelData
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
 * Uses all_leads, whatsapp_sessions, and conversations tables
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
    
    // Step 4: Fetch conversation history from conversations table (WhatsApp channel)
    const { data: messages } = await supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .limit(20);

    // Step 5: Extract interests and patterns from messages
    const previousInterests = extractInterests(messages || []);
    const conversationPhase = determinePhase(messages || []);

    // Combine web conversation summary with WhatsApp summary
    const webSummary = safeString(fullContext.conversationSummary);
    const whatsappSummary = safeString(session?.conversation_summary || generateSummary(messages || []));
    const combinedSummary = webSummary 
      ? (whatsappSummary !== 'New customer, no previous conversation.' 
          ? `Web: ${webSummary}\nWhatsApp: ${whatsappSummary}` 
          : `Web: ${webSummary}`)
      : whatsappSummary;

    // Merge web user inputs with WhatsApp interests
    // Use safeString to handle any non-string values safely
    const allInterests = [
      ...(fullContext.userInputs || []),
      ...previousInterests
    ]
      .map(value => safeString(value)) // Convert all values to safe strings
      .filter((value, index, self) => 
        self.indexOf(value) === index && value // Remove duplicates and empty strings
      )
      .slice(0, 10);

    // Build enriched context object with safe string handling
    const context = {
      customerId: lead.id,
      leadId: lead.id, // Add leadId for clarity
      name: safeString(lead.customer_name || session?.customer_name),
      phone: safeString(lead.phone),
      brand: lead.brand,
      firstTouchpoint: lead.first_touchpoint,
      lastTouchpoint: lead.last_touchpoint,
      firstContact: lead.created_at,
      lastContact: lead.last_interaction_at,
      conversationCount: session?.message_count || 0,
      conversationPhase,
      previousInterests: allInterests,
      budget: lead.unified_context?.budget || null,
      conversationSummary: safeString(combinedSummary),
      lastMessages: (messages || []).slice(0, 10).reverse().map(msg => ({
        role: msg.sender === 'customer' ? 'user' : 'assistant',
        content: safeString(msg.content),
        timestamp: msg.created_at
      })),
      tags: lead.unified_context?.tags || [],
      metadata: lead.unified_context || {},
      // Enhanced context from unified_context
      webConversationSummary: safeString(fullContext.conversationSummary),
      userInputSummary: safeString(fullContext.userInputSummary),
      booking: fullContext.booking,
      webUserInputs: fullContext.userInputs,
      webConversations: fullContext.webConversations,
      channelData: fullContext.channelData || session?.channel_data || null,
      sessionData: session ? {
        sessionId: session.id,
        conversationStatus: safeString(session.conversation_status || 'active'),
        lastMessageAt: session.last_message_at,
        channelData: session.channel_data || null
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
export function extractInterests(messages) {
  const interests = [];
  const keywords = ['property', 'properties', 'sqft', 'budget', 'location', 'area', 'rent'];
  
  if (!messages || !Array.isArray(messages)) {
    return interests;
  }
  
  messages.forEach(msg => {
    // Use safeString to ensure content is a string before calling toLowerCase
    const content = safeString(msg.content).toLowerCase();
    if (!content) return;
    
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
  // Ensure text is a string before processing
  const safeText = safeString(text);
  if (!safeText) return '';
  
  const index = safeText.indexOf(keyword);
  if (index === -1) return '';
  
  const start = Math.max(0, index - 20);
  const end = Math.min(safeText.length, index + keyword.length + 20);
  return safeText.substring(start, end);
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
 * Generate conversation summary from messages
 * Extracts key information instead of just concatenating messages
 */
export function generateSummary(messages) {
  if (!messages || messages.length === 0) {
    return 'New customer, no previous conversation.';
  }

  const recentMessages = messages.slice(0, 10); // Get last 10 messages for better context
  // Handle both standard and "unknown" sender formats
  const customerMessages = recentMessages.filter(msg => 
    msg.sender === 'customer' || 
    msg.role === 'user' ||
    (msg.sender === 'unknown' && msg.content && !msg.content.includes('PROXe') && !msg.content.includes('starts at'))
  );
  const assistantMessages = recentMessages.filter(msg => 
    msg.sender === 'agent' || 
    msg.role === 'assistant' ||
    (msg.sender === 'unknown' && msg.content && (msg.content.includes('PROXe') || msg.content.includes('starts at') || msg.content.includes('demo') || msg.content.includes('booked')))
  );
  
  // Extract key information
  const keyPoints = [];
  
  // Extract customer questions/topics
  const customerTopics = [];
  customerMessages.forEach(msg => {
    const content = safeString(msg.content).toLowerCase();
    
    // Extract pricing questions
    if (content.match(/price|cost|pricing|how much|₹|rupee|fee|charge/)) {
      customerTopics.push('Pricing inquiry');
    }
    
    // Extract booking/scheduling
    if (content.match(/book|schedule|appointment|call|demo|meeting|tomorrow|today|time/)) {
      customerTopics.push('Booking/scheduling');
    }
    
    // Extract product/service questions
    if (content.match(/what|how|explain|tell me|information|details|features|about/)) {
      customerTopics.push('Product inquiry');
    }
  });
  
  // Extract key information from assistant responses
  assistantMessages.forEach(msg => {
    const content = safeString(msg.content);
    
    // Extract pricing mentioned (more comprehensive pattern)
    if (content.match(/₹|rupee|pricing|starts? at|cost|monthly|per month/i)) {
      const pricePatterns = [
        /₹\s*[\d,]+/g,
        /\d+[\d,]*\s*rupee/i,
        /\d+[\d,]*\s*\/month/i,
        /\d+[\d,]*\s*per month/i,
        /starts? at\s*[₹\d,]+/i
      ];
      
      for (const pattern of pricePatterns) {
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
          const priceText = matches[0].trim();
          if (!keyPoints.some(p => p.toLowerCase().includes('pricing') || p.includes('₹'))) {
            keyPoints.push(`Pricing: ${priceText}`);
            break;
          }
        }
      }
    }
    
    // Extract booking/demo information (more comprehensive patterns)
    // Pattern 1: "demo call booked for tomorrow at 6 PM"
    const demoBookedPattern = /(?:demo|call).*?(?:booked|scheduled|you've got).*?(?:tomorrow|today).*?at\s*\d+\s*(?:PM|AM|pm|am)/i;
    let demoMatch = content.match(demoBookedPattern);
    if (demoMatch) {
      const bookingText = demoMatch[0].trim();
      if (!keyPoints.some(p => p.toLowerCase().includes('demo') || p.toLowerCase().includes('call') || p.toLowerCase().includes('book'))) {
        keyPoints.push(`Demo call booked: ${bookingText}`);
      }
    }
    
    // Pattern 2: "tomorrow at X PM" (standalone)
    if (!demoMatch) {
      const timePattern = content.match(/(?:tomorrow|today).*?at\s*\d+\s*(?:PM|AM|pm|am)/i);
      if (timePattern && !keyPoints.some(p => p.toLowerCase().includes('tomorrow') || p.toLowerCase().includes('today'))) {
        // Check if context mentions demo or call
        const hasDemoContext = content.toLowerCase().includes('demo') || content.toLowerCase().includes('call');
        if (hasDemoContext) {
          keyPoints.push(`Demo call scheduled: ${timePattern[0]}`);
        } else {
          keyPoints.push(`Scheduled: ${timePattern[0]}`);
        }
      }
    }
    
    // Pattern 3: "booked for tomorrow" or "scheduled for tomorrow"
    if (!demoMatch) {
      const bookedForPattern = content.match(/(?:booked|scheduled).*?for.*?(?:tomorrow|today)/i);
      if (bookedForPattern && !keyPoints.some(p => p.toLowerCase().includes('book') || p.toLowerCase().includes('schedule'))) {
        keyPoints.push(`Booking: ${bookedForPattern[0]}`);
      }
    }
  });
  
  // Build summary with prioritized information
  // Prioritize: 1) Bookings/Demos, 2) Pricing, 3) Topics
  const summaryParts = [];
  
  // First, add booking/demo info if present
  const bookingInfo = keyPoints.filter(p => 
    p.toLowerCase().includes('demo') || 
    p.toLowerCase().includes('call') || 
    p.toLowerCase().includes('book') || 
    p.toLowerCase().includes('schedule')
  );
  if (bookingInfo.length > 0) {
    summaryParts.push(...bookingInfo);
  }
  
  // Then add pricing info
  const pricingInfo = keyPoints.filter(p => 
    p.toLowerCase().includes('pricing') || 
    p.includes('₹')
  );
  if (pricingInfo.length > 0) {
    summaryParts.push(...pricingInfo);
  }
  
  // Add customer topics
  if (customerTopics.length > 0) {
    const uniqueTopics = [...new Set(customerTopics)];
    summaryParts.push(`Customer inquired about: ${uniqueTopics.join(', ')}`);
  }
  
  // Add any other key points not already included
  const otherPoints = keyPoints.filter(p => 
    !summaryParts.includes(p) && 
    !p.toLowerCase().includes('demo') && 
    !p.toLowerCase().includes('call') && 
    !p.toLowerCase().includes('pricing') &&
    !p.includes('₹')
  );
  if (otherPoints.length > 0) {
    summaryParts.push(...otherPoints);
  }
  
  // If we have key points, create a summary
  if (summaryParts.length > 0) {
    const summary = summaryParts.join('. ');
    // Limit to 300 chars for readability
    return summary.length > 300 ? summary.substring(0, 300).trim() + '...' : summary;
  }
  
  // Fallback: Extract main topic from last customer message
  if (customerMessages.length > 0) {
    const lastCustomerMsg = safeString(customerMessages[customerMessages.length - 1].content);
    if (lastCustomerMsg.length > 0 && lastCustomerMsg.length < 150) {
      // Use the message if it's reasonably short
      return lastCustomerMsg;
    } else if (lastCustomerMsg.length > 0) {
      // Truncate to first sentence or 100 chars
      const firstSentence = lastCustomerMsg.split(/[.!?]/)[0].trim();
      return firstSentence.length > 100 
        ? firstSentence.substring(0, 100) + '...' 
        : firstSentence;
    }
  }
  
  // Final fallback: Simple message count
  return `${messages.length} message${messages.length > 1 ? 's' : ''} exchanged.`;
}

