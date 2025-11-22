import { claudeClient, CLAUDE_MODEL, CLAUDE_MAX_TOKENS } from '../config/claude.js';
import { logger } from '../utils/logger.js';
import { getProxeSystemPrompt } from '../prompts/proxe-prompt.js';
import { queryKnowledgeBase, formatKnowledgeContext } from './knowledgeBaseService.js';

/**
 * Generate AI response using Claude API
 */
export async function generateResponse(customerContext, message, conversationHistory) {
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
    
    // Parse response for action indicators (pass user message for intent detection)
    const parsed = parseResponse(rawResponse, message);
    
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
  
  if (context.previousInterests && context.previousInterests.length > 0) {
    parts.push(`Interests: ${context.previousInterests.join(', ')}`);
  }
  
  if (context.budget) {
    parts.push(`Budget: ${context.budget}`);
  }
  
  if (context.conversationSummary && context.conversationSummary !== 'New customer, no previous conversation.') {
    parts.push(`Summary: ${context.conversationSummary}`);
  }
  
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Detect user intent and suggest relevant buttons
 */
function detectIntentAndSuggestButtons(userMessage, aiResponse) {
  const lowerMessage = userMessage.toLowerCase();
  const lowerResponse = aiResponse.toLowerCase();
  const suggestedButtons = [];
  
  // Intent patterns and their corresponding buttons
  const intentPatterns = [
    {
      keywords: ['call', 'schedule', 'book', 'appointment', 'meeting', 'demo', 'talk', 'speak'],
      buttons: ['Book a Call', 'Schedule Demo']
    },
    {
      keywords: ['price', 'pricing', 'cost', 'fee', 'charge', 'how much', 'pricing plan', 'plan'],
      buttons: ['View Pricing', 'Get Quote']
    },
    {
      keywords: ['info', 'information', 'details', 'tell me', 'explain', 'what is', 'how does'],
      buttons: ['Learn More', 'Get Info']
    },
    {
      keywords: ['start', 'begin', 'sign up', 'register', 'get started', 'try', 'demo'],
      buttons: ['Get Started', 'Sign Up']
    },
    {
      keywords: ['contact', 'reach', 'email', 'phone', 'support', 'help'],
      buttons: ['Contact Us', 'Get Support']
    },
    {
      keywords: ['property', 'properties', 'listing', 'space', 'office', 'commercial'],
      buttons: ['View Properties', 'Browse Listings']
    }
  ];
  
  // Check user message for intent
  for (const pattern of intentPatterns) {
    if (pattern.keywords.some(keyword => lowerMessage.includes(keyword))) {
      suggestedButtons.push(...pattern.buttons);
      break; // Only add buttons for the first matching intent
    }
  }
  
  // Also check AI response for context
  if (lowerResponse.includes('call') || lowerResponse.includes('schedule')) {
    if (!suggestedButtons.some(b => b.toLowerCase().includes('call'))) {
      suggestedButtons.push('Book a Call');
    }
  }
  
  if (lowerResponse.includes('price') || lowerResponse.includes('cost')) {
    if (!suggestedButtons.some(b => b.toLowerCase().includes('price'))) {
      suggestedButtons.push('View Pricing');
    }
  }
  
  // Remove duplicates and limit to 3 buttons (WhatsApp limit)
  return [...new Set(suggestedButtons)].slice(0, 3);
}

/**
 * Parse Claude response for buttons and metadata
 */
function parseResponse(rawResponse, userMessage = '') {
  const buttonRegex = /→\s*BUTTON:\s*(.+)/gi;
  const buttons = [];
  let text = rawResponse;

  // Extract buttons from Claude response
  let match;
  while ((match = buttonRegex.exec(rawResponse)) !== null) {
    buttons.push(match[1].trim());
    // Remove button markers from text
    text = text.replace(match[0], '').trim();
  }

  // Auto-detect intent and add relevant buttons if none were suggested by Claude
  if (buttons.length === 0 && userMessage) {
    const suggestedButtons = detectIntentAndSuggestButtons(userMessage, rawResponse);
    buttons.push(...suggestedButtons);
  } else if (buttons.length > 0 && userMessage) {
    // Merge Claude's buttons with intent-based suggestions (avoid duplicates)
    const suggestedButtons = detectIntentAndSuggestButtons(userMessage, rawResponse);
    suggestedButtons.forEach(btn => {
      if (!buttons.some(b => b.toLowerCase() === btn.toLowerCase())) {
        buttons.push(btn);
      }
    });
    // Limit to 3 buttons total (WhatsApp limit)
    buttons.splice(3);
  }

  // Determine response type
  let responseType = 'text_only';
  if (buttons.length > 0) {
    responseType = buttons.length <= 3 ? 'text_with_buttons' : 'text_with_list';
  }

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



