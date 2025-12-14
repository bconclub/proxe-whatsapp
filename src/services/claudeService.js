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
    const parsed = parseResponse(rawResponse, message, messageCount, isNewUser);
    
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
  
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Determine dynamic 2-button pair based on context and user journey stage
 * @param {string} userMessage - User's message
 * @param {string} aiResponse - AI's response text
 * @param {number} messageCount - Number of messages in conversation
 * @param {boolean} isNewUser - Whether this is a new user (first message)
 * @returns {Array<string>} Array of exactly 2 button labels
 */
function determineButtonPair(userMessage, aiResponse, messageCount = 0, isNewUser = false) {
  const lowerMessage = userMessage.toLowerCase();
  const lowerResponse = aiResponse.toLowerCase();
  
  // New User (first message): Always "Learn More" + "Book Demo"
  if (isNewUser || messageCount === 0) {
    return ["Learn More", "Book Demo"];
  }
  
  // After Multiple Messages (engaged): "Deploy PROXe" + "Book Demo"
  if (messageCount >= 3) {
    return ["Deploy PROXe", "Book Demo"];
  }
  
  // Pricing Questions: "View Plans" + "Book Demo"
  const pricingKeywords = ['price', 'pricing', 'cost', 'fee', 'charge', 'how much', 'pricing plan', 'plan', 'subscription', 'monthly', 'yearly', 'afford'];
  if (pricingKeywords.some(keyword => lowerMessage.includes(keyword) || lowerResponse.includes(keyword))) {
    return ["View Plans", "Book Demo"];
  }
  
  // Feature/Technical Questions: "See Demo" + "Schedule Call"
  const featureKeywords = ['feature', 'how does', 'how it works', 'technical', 'integration', 'api', 'setup', 'implement', 'function', 'capability', 'what can', 'does it'];
  if (featureKeywords.some(keyword => lowerMessage.includes(keyword) || lowerResponse.includes(keyword))) {
    return ["See Demo", "Schedule Call"];
  }
  
  // General Questions: "Deploy PROXe" + "Schedule Call"
  // This is the default for any other questions
  return ["Deploy PROXe", "Schedule Call"];
}

/**
 * Parse Claude response for buttons and metadata
 * Always returns exactly 2 buttons based on context and user journey
 */
function parseResponse(rawResponse, userMessage = '', messageCount = 0, isNewUser = false) {
  const buttonRegex = /→\s*BUTTON:\s*(.+)/gi;
  let text = rawResponse;

  // Remove button markers from text (Claude may suggest buttons, but we override with dynamic system)
  let match;
  while ((match = buttonRegex.exec(rawResponse)) !== null) {
    text = text.replace(match[0], '').trim();
  }

  // Always use dynamic 2-button system based on context
  const buttons = determineButtonPair(userMessage, rawResponse, messageCount, isNewUser);

  // Determine response type (always text_with_buttons since we always have 2 buttons)
  const responseType = 'text_with_buttons';

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



