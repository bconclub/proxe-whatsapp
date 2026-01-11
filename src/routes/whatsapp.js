import express from 'express';
import { z } from 'zod';
import { getOrCreateLead, buildCustomerContext, generateSummary, extractInterests, updateWhatsAppContext } from '../services/customerService.js';
import { getConversationHistory, addToHistory } from '../services/conversationService.js';
import { 
  getOrCreateWhatsAppSession, 
  linkSessionToLead, 
  incrementSessionMessageCount,
  updateConversationData 
} from '../services/whatsappSessionService.js';
import { generateResponse } from '../services/claudeService.js';
import { formatWhatsAppResponse } from '../services/responseFormatter.js';
import { storeConversationLog } from '../services/loggingService.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Validation schema
const messageSchema = z.object({
  sessionId: z.string().min(10).max(15),
  message: z.string().min(1).max(4000),
  profileName: z.string().optional(),
  timestamp: z.string().optional(),
  brand: z.enum(['proxe', 'windchasers']).optional().default('proxe')
});

/**
 * POST /api/whatsapp/message
 * Primary message handler - receives messages from n8n
 * Uses schema: all_leads, whatsapp_sessions, conversations
 * Messages are logged via logMessage() function which inserts to conversations table
 */
router.post('/message', async (req, res, next) => {
  // Wrap everything in try-catch to ensure errors are caught
  try {
    const inputReceivedAt = Date.now(); // Track when input is received
    const startTime = Date.now();
    
    // Ensure response object is available
    if (!res || typeof res.status !== 'function') {
      throw new Error('Invalid response object');
    }

    // Validate input
    const validation = messageSchema.safeParse(req.body);
    if (!validation.success) {
      logger.error('Validation failed:', validation.error);
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: validation.error.errors 
      });
    }

    const { sessionId, message, profileName, timestamp, brand } = validation.data;

    logger.info(`Processing WhatsApp message from ${sessionId} (brand: ${brand})`);

    // Step 1: Get or create lead in all_leads
    let lead;
    try {
      lead = await getOrCreateLead(sessionId, brand, { profileName });
      logger.info(`Lead retrieved/created: ${lead.id}`);
    } catch (error) {
      console.error('=== ERROR in getOrCreateLead ===');
      console.error('Error:', error);
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
      logger.error('Error in getOrCreateLead:', error);
      return res.status(500).json({ 
        error: 'Failed to get or create lead', 
        details: error.message,
        step: 'getOrCreateLead',
        code: error.code || null
      });
    }

    // Step 2: Get or create WhatsApp session
    let whatsappSession;
    try {
      whatsappSession = await getOrCreateWhatsAppSession(sessionId, brand, {
        profileName,
        whatsappNumber: sessionId
      });
      logger.info(`WhatsApp session retrieved/created: ${whatsappSession.id}`);
    } catch (error) {
      console.error('=== ERROR in getOrCreateWhatsAppSession ===');
      console.error('Error:', error);
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
      logger.error('Error in getOrCreateWhatsAppSession:', error);
      return res.status(500).json({ 
        error: 'Failed to get or create WhatsApp session', 
        details: error.message,
        step: 'getOrCreateWhatsAppSession',
        code: error.code || null
      });
    }

    // Step 3: Link session to lead if not already linked
    try {
      if (!whatsappSession.lead_id && lead.id) {
        await linkSessionToLead(whatsappSession.id, lead.id);
        whatsappSession.lead_id = lead.id;
      }
    } catch (error) {
      console.error('=== ERROR in linkSessionToLead ===', error);
      logger.error('Error linking session to lead:', error);
      // Continue - not critical
    }

    // Step 4: Build customer context (uses all_leads, whatsapp_sessions, messages)
    let context;
    try {
      context = await buildCustomerContext(sessionId, brand);
      logger.info('Customer context built successfully');
    } catch (error) {
      console.error('=== ERROR in buildCustomerContext ===', error);
      logger.error('Error building customer context:', error);
      return res.status(500).json({ 
        error: 'Failed to build customer context', 
        details: error.message,
        step: 'buildCustomerContext',
        code: error.code || null
      });
    }

    // Step 5: Get conversation history from conversations table
    let conversationHistory;
    try {
      conversationHistory = await getConversationHistory(lead.id, 10);
      logger.info(`Retrieved ${conversationHistory.length} messages from history`);
    } catch (error) {
      console.error('=== ERROR in getConversationHistory ===', error);
      logger.error('Error getting conversation history:', error);
      conversationHistory = []; // Continue with empty history
    }

    // Step 6: Add user message to conversations table with input timestamp (via logMessage)
    try {
      console.log('=== Adding user message to history ===');
      console.log('lead.id:', lead.id);
      console.log('lead.id type:', typeof lead.id);
      console.log('message:', message);
      console.log('message length:', message?.length);
      
      const userMessageResult = await addToHistory(lead.id, message, 'user', 'text', {
        input_received_at: inputReceivedAt
      });
      
      console.log('✓ User message added successfully:', userMessageResult?.id);
    } catch (error) {
      console.error('=== ERROR in addToHistory (user) ===');
      console.error('lead.id:', lead?.id);
      console.error('Error message:', error.message);
      console.error('Error details:', error);
      logger.error('Error adding user message to history:', error);
      // Continue - logging is not critical, but log the error for debugging
    }

    // Step 7: Increment session message count
    try {
      await incrementSessionMessageCount(whatsappSession.id);
    } catch (error) {
      console.error('=== ERROR in incrementSessionMessageCount ===', error);
      logger.error('Error incrementing message count:', error);
      // Continue - not critical
    }

    // Step 8: Generate AI response
    let aiResponse;
    try {
      aiResponse = await generateResponse(context, message, conversationHistory);
      logger.info('AI response generated successfully');
    } catch (error) {
      console.error('=== ERROR in generateResponse ===', error);
      logger.error('Error generating AI response:', error);
      return res.status(500).json({ 
        error: 'Failed to generate AI response', 
        details: error.message,
        step: 'generateResponse',
        code: error.code || null
      });
    }

    // Step 9: Calculate time gap between input received and output sent
    const outputSentAt = Date.now();
    const inputToOutputGap = outputSentAt - inputReceivedAt; // Total time from input to output

    // Step 10: Add assistant response to conversations table (via logMessage)
    try {
      console.log('=== Adding assistant message to history ===');
      console.log('lead.id:', lead.id);
      console.log('aiResponse.rawResponse length:', aiResponse.rawResponse?.length);
      
      const assistantMessageResult = await addToHistory(lead.id, aiResponse.rawResponse, 'assistant', 'text', {
        input_received_at: inputReceivedAt,
        output_sent_at: outputSentAt,
        input_to_output_gap_ms: inputToOutputGap
      });
      
      console.log('✓ Assistant message added successfully:', assistantMessageResult?.id);
    } catch (error) {
      console.error('=== ERROR in addToHistory (assistant) ===');
      console.error('lead.id:', lead?.id);
      console.error('Error message:', error.message);
      console.error('Error details:', error);
      logger.error('Error adding assistant message to history:', error);
      // Continue - message was sent, but logging failed
    }

    // Step 11: Increment session message count again
    await incrementSessionMessageCount(whatsappSession.id);

    // Step 11.5: Update conversation summary, context, and user inputs
    try {
      // Get updated conversation history including the new messages
      const updatedHistory = await getConversationHistory(lead.id, 20);
      
      // Generate conversation summary from messages
      const conversationSummary = generateSummary([...updatedHistory].reverse());
      
      // Extract user interests/inputs from messages
      const userInterests = extractInterests([...updatedHistory].reverse());
      
      // Build conversation context object
      const conversationContext = {
        conversationPhase: context?.conversationPhase || 'discovery',
        messageCount: updatedHistory.length,
        lastMessageAt: new Date().toISOString(),
        interests: userInterests,
        previousTopics: userInterests.slice(0, 5),
        metadata: {
          brand: brand,
          leadId: lead.id,
          updatedAt: new Date().toISOString()
        }
      };
      
      // Build user inputs summary
      const userInputsSummary = {
        interests: userInterests,
        totalInputs: userInterests.length,
        recentTopics: userInterests.slice(0, 10),
        extractedAt: new Date().toISOString()
      };
      
      // Update all conversation data in whatsapp_sessions
      await updateConversationData(whatsappSession.id, {
        summary: conversationSummary,
        context: conversationContext,
        userInputsSummary: userInputsSummary
      });

      // Sync to all_leads.unified_context
      await updateWhatsAppContext(lead.id, {
        conversation_summary: conversationSummary,
        conversation_context: conversationContext,
        user_inputs_summary: userInputsSummary,
        message_count: updatedHistory.length,
        last_interaction: new Date().toISOString()
      });

      logger.info('Synced WhatsApp context to unified_context');
      
      logger.info('Updated conversation summary, context, and user inputs summary');

      // Sync to Dashboard
      try {
        await fetch(`${process.env.DASHBOARD_API_URL}/api/integrations/whatsapp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.WHATSAPP_API_KEY,
          },
          body: JSON.stringify({
            name: context.name,
            phone: sessionId,  // WhatsApp phone
            email: lead.email,
            brand: 'proxe',
            conversation_summary: conversationSummary,           // From generateSummary()
            conversation_context: conversationContext,  // From whatsapp_sessions
            user_inputs_summary: userInterests,         // From extractInterests()
            message_count: updatedHistory.length,
            last_interaction: new Date().toISOString()
          })
        });
      } catch (error) {
        console.error('Failed to sync to dashboard:', error);
      }
    } catch (error) {
      console.error('=== ERROR updating conversation data ===', error);
      logger.error('Error updating conversation data:', error);
      // Continue - not critical for message processing
    }

    // Step 12: Format response for WhatsApp
    const formattedResponse = formatWhatsAppResponse(
      aiResponse.rawResponse,
      aiResponse.responseType,
      aiResponse.buttons,
      {
        leadId: lead.id,
        sessionId: whatsappSession.id,
        conversationId: `conv_${Date.now()}`,
        responseTime: Date.now() - startTime,
        tokensUsed: aiResponse.tokensUsed
      }
    );

    // Step 13: Store conversation log (analytics in messages metadata)
    await storeConversationLog({
      customerId: lead.id, // For backward compatibility
      leadId: lead.id,
      message,
      response: aiResponse.rawResponse,
      responseType: aiResponse.responseType,
      tokensUsed: aiResponse.tokensUsed,
      responseTime: Date.now() - startTime,
      inputToOutputGap: inputToOutputGap, // Add the gap here too
      metadata: {
        buttons: aiResponse.buttons,
        urgency: aiResponse.urgency,
        nextAction: aiResponse.nextAction,
        brand: brand,
        input_received_at: inputReceivedAt,
        output_sent_at: outputSentAt
      }
    });

    // Return structured response to n8n
    res.json({
      status: 'success',
      responseType: aiResponse.responseType,
      message: aiResponse.rawResponse,
      buttons: aiResponse.buttons.map((btn, idx) => {
        const buttonId = typeof btn === 'string' 
          ? `btn_${idx + 1}_${btn.toLowerCase().replace(/\s+/g, '_')}`
          : btn.id || `btn_${idx + 1}`;
        const buttonLabel = typeof btn === 'string' ? btn : btn.label;
        return {
          id: buttonId,
          label: buttonLabel,
          action: determineAction(buttonId, buttonLabel)
        };
      }),
      whatsappPayload: formattedResponse,
      metadata: {
        leadId: lead.id,
        sessionId: whatsappSession.id,
        conversationId: `conv_${Date.now()}`,
        responseTime: Date.now() - startTime,
        tokensUsed: aiResponse.tokensUsed,
        brand: brand
      }
    });
  } catch (error) {
    // Log full error details
    console.error('=== WHATSAPP ENDPOINT ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Error stack:', error.stack);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    logger.error('Error in WhatsApp message handler:', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      details: error.details
    });
    
    // Always try to send error response
    try {
      if (res && !res.headersSent) {
        const errorResponse = {
          error: error.message || 'Internal server error',
          statusCode: error.statusCode || 500,
          errorName: error.name,
          path: req.path,
          method: req.method,
          ...(process.env.NODE_ENV !== 'production' && { 
            stack: error.stack,
            details: error.details || null,
            code: error.code || null,
            fullError: error.toString()
          })
        };
        
        console.error('Sending error response:', JSON.stringify(errorResponse, null, 2));
        return res.status(error.statusCode || 500).json(errorResponse);
      } else if (res && res.headersSent) {
        console.error('Response already sent, cannot send error response');
      } else {
        console.error('Response object not available');
      }
    } catch (sendError) {
      console.error('Error sending error response:', sendError);
    }
    
    // Pass to error handler as fallback
    if (next) {
    next(error);
    }
  }
});

/**
 * Helper to determine button action
 */
function determineAction(buttonId, label) {
  const lowerId = buttonId.toLowerCase();
  const lowerLabel = label.toLowerCase();

  if (lowerId.includes('prop_') || lowerLabel.includes('property')) {
    return 'view_property';
  }
  if (lowerId.includes('schedule') || lowerId.includes('call')) {
    return 'call';
  }
  if (lowerId.includes('info')) {
    return 'get_info';
  }
  if (lowerId.includes('sales') || lowerId.includes('contact')) {
    return 'contact_sales';
  }
  return 'unknown';
}

export default router;

