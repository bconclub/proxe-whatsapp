import { claudeClient, CLAUDE_MODEL, CLAUDE_MAX_TOKENS } from '../config/claude.js';
import { logger } from '../utils/logger.js';
import { getProxeSystemPrompt } from '../prompts/proxe-prompt.js';
import { queryKnowledgeBase, formatKnowledgeContext } from './knowledgeBaseService.js';

/**
 * Generate AI response using Claude API
 */
export async function generateResponse(customerContext, message, conversationHistory, isNewUser = false) {
  try {
    // Skip knowledge base for simple greetings (saves ~1-2s per request)
    const simpleGreeting = /^(hi|hello|hey|hii+|good\s*(morning|evening|afternoon)|thanks|thank you|ok|okay|bye)[\s!.]*$/i.test(message.trim());
    
    // Query knowledge base for relevant information (reduced from 5 to 2 results for faster queries)
    // The knowledge base now contains PROXe AI Operating System information
    const knowledgeResults = simpleGreeting ? [] : await queryKnowledgeBase(message, 2);
    let knowledgeContext = formatKnowledgeContext(knowledgeResults);
    
    // If no results found and question is about PROXe, add clarification
    const isProxeQuestion = /what\s+is\s+proxe|tell\s+me\s+about\s+proxe|explain\s+proxe|proxe\s+is|proxe\s+does/i.test(message);
    if (isProxeQuestion && (!knowledgeResults || knowledgeResults.length === 0)) {
      knowledgeContext = 'Note: When asked about PROXe, refer ONLY to the AI Operating System definition above. PROXe is the AI Operating System for Businesses, NOT a property or commercial project.';
    }
    
    // Build customer context string
    const customerContextStr = buildCustomerContextNote(customerContext);
    
    // Combine knowledge base and customer context
    const fullContext = customerContextStr 
      ? `${knowledgeContext}\n\n=================================================================================\nCUSTOMER CONTEXT\n=================================================================================\n${customerContextStr}`
      : knowledgeContext;
    
    // Build PROXe system prompt with full context
    const systemPrompt = getProxeSystemPrompt(fullContext);
    
    // Build messages array for Claude
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      {
        role: 'user',
        content: message
      }
    ];

    const startTime = Date.now();
    
    const response = await claudeClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: systemPrompt,
      messages: messages
    });

    const responseTime = Date.now() - startTime;
    const rawResponse = response.content[0].text;
    
    // Parse response for action indicators (pass user message, conversation history length, and new user status)
    // Count previous exchanges: conversationHistory has alternating user/assistant messages
    // Count assistant messages to get number of previous responses
    const messageCount = conversationHistory 
      ? conversationHistory.filter(msg => msg.role === 'assistant').length 
      : 0;
    const parsed = parseResponse(rawResponse, message, messageCount, isNewUser, customerContext);
    
    logger.info('Claude response generated', {
      tokensUsed: response.usage?.output_tokens || 0,
      responseTime
    });

    return {
      rawResponse: parsed.text,
      responseType: parsed.responseType,
      buttons: parsed.buttons,
      urgency: parsed.urgency,
      nextAction: parsed.nextAction,
      tokensUsed: response.usage?.output_tokens || 0,
      responseTime
    };
  } catch (error) {
    logger.error('Error generating Claude response:', error);
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'Unknown error';
    if (error.status === 401 || errorMessage.includes('authentication') || errorMessage.includes('invalid x-api-key')) {
      errorMessage = `Claude API authentication failed. Please check your CLAUDE_API_KEY in .env.local. Error: ${errorMessage}`;
    } else if (error.status === 429) {
      errorMessage = `Claude API rate limit exceeded. Please try again later.`;
    } else if (error.status >= 500) {
      errorMessage = `Claude API server error (${error.status}). Please try again later.`;
    }
    
    const enhancedError = new Error(errorMessage);
    enhancedError.originalError = error;
    enhancedError.statusCode = error.status || 500;
    throw enhancedError;
  }
}

/**
 * Build customer context note for inclusion in messages
 * This provides context about the customer without cluttering the system prompt
 * Enhanced to include web conversations, bookings, and user inputs from unified_context
 */
function buildCustomerContextNote(context) {
  if (!context) return null;
  
  const parts = [];
  
  if (context.name) {
    parts.push(`Customer: ${context.name}`);
  }
  
  if (context.conversationCount > 0) {
    parts.push(`Previous conversations: ${context.conversationCount}`);
  }
  
  if (context.conversationPhase) {
    parts.push(`Phase: ${context.conversationPhase}`);
  }
  
  // Include web conversation summary if available
  if (context.webConversationSummary) {
    parts.push(`Web conversation summary: ${context.webConversationSummary}`);
  }
  
  // Include user input summary if available
  if (context.userInputSummary) {
    parts.push(`User input summary: ${context.userInputSummary}`);
  }
  
  // Include booking information if exists
  if (context.booking && context.booking.exists) {
    const bookingInfo = [];
    if (context.booking.booking_date) {
      bookingInfo.push(`Date: ${context.booking.booking_date}`);
    }
    if (context.booking.booking_time) {
      bookingInfo.push(`Time: ${context.booking.booking_time}`);
    }
    if (context.booking.booking_status) {
      bookingInfo.push(`Status: ${context.booking.booking_status}`);
    }
    if (bookingInfo.length > 0) {
      parts.push(`Existing booking: ${bookingInfo.join(', ')}`);
    }
  }
  
  // Include web user inputs/interests
  if (context.webUserInputs && context.webUserInputs.length > 0) {
    parts.push(`Previous interests/questions from web: ${context.webUserInputs.join(', ')}`);
  }
  
  // Include channel data if available
  if (context.channelData && typeof context.channelData === 'object' && Object.keys(context.channelData).length > 0) {
    try {
      const channelDataStr = JSON.stringify(context.channelData);
      if (channelDataStr && channelDataStr !== '{}') {
        parts.push(`Channel data: ${channelDataStr}`);
      }
    } catch (error) {
      // Skip if channel data can't be stringified
    }
  }
  
  // Include combined interests (from web and WhatsApp)
  if (context.previousInterests && context.previousInterests.length > 0) {
    parts.push(`All interests: ${context.previousInterests.join(', ')}`);
  }
  
  if (context.budget) {
    parts.push(`Budget: ${context.budget}`);
  }
  
  if (context.conversationSummary && context.conversationSummary !== 'New customer, no previous conversation.') {
    parts.push(`Conversation summary: ${context.conversationSummary}`);
  }
  
  // Add greeting instruction based on customer context
  if (context.booking && context.booking.exists) {
    const bookingDate = context.booking.booking_date || 'the scheduled date';
    const bookingTime = context.booking.booking_time || 'the scheduled time';
    parts.push(`GREETING INSTRUCTION: This is a returning customer with a confirmed booking on ${bookingDate} at ${bookingTime}. Greet them by name and acknowledge their booking. Do NOT ask 'What brings you here today?'`);
  } else if (context.webConversationSummary) {
    parts.push(`GREETING INSTRUCTION: This is a returning customer who previously chatted on the website. Greet them by name and reference you've chatted before. Do NOT treat them as new.`);
  } else if (context.conversationCount > 0) {
    parts.push(`GREETING INSTRUCTION: This is a returning customer. Greet them warmly by name if available. Do NOT ask generic questions like 'What brings you here today?'`);
  } else {
    parts.push(`GREETING INSTRUCTION: This is a new customer. Welcome them warmly and ask how you can help.`);
  }
  
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Determine single context-aware button based on customer context and conversation
 * @param {string} userMessage - User's message
 * @param {string} aiResponse - AI's response text
 * @param {number} messageCount - Number of messages in conversation
 * @param {boolean} isNewUser - Whether this is a new user (first message)
 * @param {object} customerContext - Customer context object with booking info, etc.
 * @returns {Array<string>} Array with exactly 1 button label
 */
function determineButtonPair(userMessage, aiResponse, messageCount = 0, isNewUser = false, customerContext = {}) {
  const lowerMessage = userMessage.toLowerCase();
  const lowerResponse = aiResponse.toLowerCase();
  
  // Check if user has existing booking
  const hasBooking = customerContext?.booking?.exists || 
                     lowerResponse.includes('booking confirmed') || 
                     lowerResponse.includes('demo is confirmed') || 
                     lowerResponse.includes('already have a demo');
  
  // If user has booking and asks about reschedule
  if (hasBooking && (lowerMessage.includes('reschedule') || lowerMessage.includes('change time') || lowerMessage.includes('different time'))) {
    return ["Confirm Reschedule"];
  }
  
  // If user has booking and asks about cancel
  if (hasBooking && (lowerMessage.includes('cancel') || lowerMessage.includes('cancel booking') || lowerMessage.includes('cancel demo'))) {
    return ["Confirm Cancel"];
  }
  
  // If user has booking (default) - never show "Book Demo"
  if (hasBooking) {
    return ["Ask a Question"];
  }
  
  // If response mentions pricing ($99, $199, cost)
  if (lowerResponse.includes('$99') || lowerResponse.includes('$199') || 
      lowerResponse.includes('99/month') || lowerResponse.includes('199/month') ||
      (lowerMessage.includes('price') || lowerMessage.includes('pricing') || lowerMessage.includes('cost')) &&
      (lowerResponse.includes('$') || lowerResponse.includes('month'))) {
    return ["Book Demo"];
  }
  
  // If user asks how/features/what can
  const howFeatureKeywords = ['how', 'feature', 'what can', 'what does', 'how does', 'how it works', 'capability', 'can it'];
  if (howFeatureKeywords.some(keyword => lowerMessage.includes(keyword) || lowerResponse.includes(keyword))) {
    return ["See Demo"];
  }
  
  // If user says thanks/ok/bye
  if (/^(thanks|thank you|ok|okay|bye|goodbye|see you|ttyl)[\s!.]*$/i.test(lowerMessage.trim())) {
    return ["Book Demo"];
  }
  
  // If new user or first message
  if (isNewUser || messageCount === 0) {
    return ["Learn More"];
  }
  
  // If engaged user (3+ messages) without booking
  if (messageCount >= 3) {
    return ["Book Demo"];
  }
  
  // Default
  return ["Learn More"];
}

/**
 * Parse Claude response for buttons and metadata
 * Returns exactly 1 context-aware button based on customer context
 */
function parseResponse(rawResponse, userMessage = '', messageCount = 0, isNewUser = false, customerContext = {}) {
  const buttonRegex = /→\s*BUTTON:\s*(.+)/gi;
  let text = rawResponse;

  // Remove button markers from text (Claude may suggest buttons, but we override with dynamic system)
  let match;
  while ((match = buttonRegex.exec(rawResponse)) !== null) {
    text = text.replace(match[0], '').trim();
  }

  // Use context-aware single button system
  const buttons = determineButtonPair(userMessage, rawResponse, messageCount, isNewUser, customerContext);

  // Determine response type (text_with_buttons if we have a button, text_only otherwise)
  const responseType = buttons.length > 0 ? 'text_with_buttons' : 'text_only';

  // Determine urgency (simple heuristic)
  const urgencyKeywords = {
    urgent: ['urgent', 'asap', 'immediately', 'emergency'],
    high: ['important', 'soon', 'today', 'quickly'],
    normal: []
  };
  
  let urgency = 'normal';
  const lowerText = text.toLowerCase();
  if (urgencyKeywords.urgent.some(kw => lowerText.includes(kw))) {
    urgency = 'urgent';
  } else if (urgencyKeywords.high.some(kw => lowerText.includes(kw))) {
    urgency = 'high';
  }

  return {
    text: text.trim(),
    responseType,
    buttons,
    urgency,
    nextAction: buttons.length > 0 ? 'wait_for_response' : 'continue_conversation'
  };
}



