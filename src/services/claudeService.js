import { claudeClient, CLAUDE_MODEL, CLAUDE_MAX_TOKENS } from '../config/claude.js';
import { logger } from '../utils/logger.js';

/**
 * Generate AI response using Claude API
 */
export async function generateResponse(customerContext, message, conversationHistory) {
  try {
    const systemPrompt = buildSystemPrompt(customerContext);
    
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
    
    // Parse response for action indicators
    const parsed = parseResponse(rawResponse);
    
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
    throw error;
  }
}

/**
 * Build system prompt with customer context
 */
function buildSystemPrompt(context) {
  return `You are GVS Ventures' AI agent for WhatsApp customer support. You are knowledgeable, friendly, and professional.

CUSTOMER CONTEXT:
- Name: ${context.name}
- Phone: ${context.phone}
- Company: ${context.company || 'Not provided'}
- First Contact: ${context.firstContact}
- Conversation Count: ${context.conversationCount}
- Phase: ${context.conversationPhase}
- Previous Interests: ${context.previousInterests.join(', ') || 'None yet'}
- Budget: ${context.budget || 'Not specified'}
- Tags: ${context.tags.join(', ') || 'None'}

CONVERSATION SUMMARY:
${context.conversationSummary}

YOUR ROLE:
1. Talk like you've known them forever - reference past conversations naturally
2. Provide specific, valuable information (not generic responses)
3. Ask clarifying questions to move them toward decision
4. When appropriate, suggest scheduling a call
5. Use their name occasionally to feel personal
6. Be concise but warm - WhatsApp messages should be readable

RESPONSE FORMATTING:
- Write naturally, but you can indicate button suggestions using this format:
  → BUTTON: [Button Label]
- For multiple buttons, use multiple lines:
  → BUTTON: View Properties
  → BUTTON: Schedule Call
- If no buttons needed, just write the text response

Keep responses conversational and helpful.`;
}

/**
 * Parse Claude response for buttons and metadata
 */
function parseResponse(rawResponse) {
  const buttonRegex = /→\s*BUTTON:\s*(.+)/gi;
  const buttons = [];
  let text = rawResponse;

  // Extract buttons
  let match;
  while ((match = buttonRegex.exec(rawResponse)) !== null) {
    buttons.push(match[1].trim());
    // Remove button markers from text
    text = text.replace(match[0], '').trim();
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

