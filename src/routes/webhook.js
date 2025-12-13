import express from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /webhook/whatsapp
 * Meta webhook verification endpoint
 * Meta sends: hub.mode, hub.verify_token, hub.challenge
 */
router.get('/whatsapp', (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logger.info('Meta webhook verification request', {
      mode,
      hasToken: !!token,
      hasChallenge: !!challenge
    });

    // Check if this is a verification request
    if (mode === 'subscribe') {
      // Verify the token matches our configured token
      const verifyToken = process.env.META_VERIFY_TOKEN;
      
      if (!verifyToken) {
        logger.error('META_VERIFY_TOKEN not configured');
        return res.status(500).json({ error: 'Webhook verification not configured' });
      }

      if (token === verifyToken) {
        logger.info('Meta webhook verification successful');
        // Return the challenge to complete verification
        return res.status(200).send(challenge);
      } else {
        logger.warn('Meta webhook verification failed - invalid token');
        return res.status(403).json({ error: 'Invalid verification token' });
      }
    }

    // If not a subscribe request, return 403
    logger.warn('Meta webhook verification failed - invalid mode', { mode });
    return res.status(403).json({ error: 'Invalid request' });
  } catch (error) {
    logger.error('Error in Meta webhook verification:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /webhook/whatsapp
 * Receive messages from Meta WhatsApp webhook
 * Validates signature, parses webhook format, and processes message
 */
router.post('/whatsapp', async (req, res) => {
  try {
    // Step 1: Validate Meta signature
    // req.body is a Buffer (raw body) because we use express.raw() middleware
    const signature = req.headers['x-hub-signature-256'];
    const appSecret = process.env.META_APP_SECRET;

    if (!appSecret) {
      logger.error('META_APP_SECRET not configured');
      return res.status(500).json({ error: 'Webhook signature validation not configured' });
    }

    if (!signature) {
      logger.warn('Meta webhook request missing signature');
      return res.status(403).json({ error: 'Missing signature' });
    }

    // Validate signature using raw body (Buffer)
    const rawBody = req.body;
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn('Meta webhook signature validation failed', {
        received: signature.substring(0, 20) + '...',
        expected: expectedSignature.substring(0, 20) + '...'
      });
      return res.status(403).json({ error: 'Invalid signature' });
    }

    logger.info('Meta webhook signature validated successfully');

    // Step 2: Parse Meta webhook format from raw body
    // Meta webhook structure:
    // {
    //   "object": "whatsapp_business_account",
    //   "entry": [{
    //     "changes": [{
    //       "value": {
    //         "messages": [{
    //           "from": "phone_number",
    //           "text": { "body": "message text" },
    //           "timestamp": "timestamp"
    //         }],
    //         "contacts": [{
    //           "profile": { "name": "profile name" }
    //         }]
    //       }
    //     }]
    //   }]
    // }

    let webhookData;
    try {
      webhookData = JSON.parse(rawBody.toString('utf8'));
    } catch (parseError) {
      logger.error('Failed to parse webhook JSON:', parseError);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    
    // Return 200 immediately (don't wait for processing)
    res.status(200).json({ status: 'received' });

    // Process webhook asynchronously
    processWebhook(webhookData).catch(error => {
      logger.error('Error processing Meta webhook:', error);
    });

  } catch (error) {
    logger.error('Error in Meta webhook POST handler:', error);
    // Still return 200 to Meta to avoid retries for processing errors
    return res.status(200).json({ status: 'received', error: 'Processing error' });
  }
});

/**
 * Process Meta webhook data and transform to existing format
 * Calls the existing message handler logic
 */
async function processWebhook(webhookData) {
  try {
    // Extract messages from Meta webhook format
    if (!webhookData.entry || !Array.isArray(webhookData.entry)) {
      logger.warn('Invalid webhook format: missing entry array');
      return;
    }

    for (const entry of webhookData.entry) {
      if (!entry.changes || !Array.isArray(entry.changes)) {
        continue;
      }

      for (const change of entry.changes) {
        const value = change.value;
        if (!value || !value.messages || !Array.isArray(value.messages)) {
          continue;
        }

        // Process each message
        for (const message of value.messages) {
          // Extract phone number (remove country code prefix if present)
          let phone = message.from;
          if (!phone) {
            logger.warn('Message missing from field');
            continue;
          }

          // Extract message text
          let messageText = '';
          if (message.text && message.text.body) {
            messageText = message.text.body;
          } else if (message.type === 'button' && message.button) {
            // Handle button responses
            messageText = message.button.text || message.button.payload || '';
          } else {
            logger.warn('Message missing text content', { type: message.type });
            continue;
          }

          if (!messageText || messageText.trim().length === 0) {
            logger.warn('Message text is empty');
            continue;
          }

          // Extract profile name from contacts
          let profileName = null;
          if (value.contacts && Array.isArray(value.contacts)) {
            const contact = value.contacts.find(c => c.wa_id === phone);
            if (contact && contact.profile && contact.profile.name) {
              profileName = contact.profile.name;
            }
          }

          // Extract timestamp
          const timestamp = message.timestamp || Math.floor(Date.now() / 1000).toString();

          // Transform to existing format
          const transformedMessage = {
            sessionId: phone,
            message: messageText,
            profileName: profileName,
            timestamp: timestamp,
            brand: 'proxe' // Default brand, can be made configurable
          };

          logger.info('Processing Meta webhook message', {
            sessionId: phone,
            messageLength: messageText.length,
            hasProfileName: !!profileName
          });

          // Call existing message handler
          // Import the handler function and call it directly
          await handleMessage(transformedMessage);
        }
      }
    }
  } catch (error) {
    logger.error('Error in processWebhook:', error);
    throw error;
  }
}

/**
 * Handle message using existing message handler logic
 * Reuses the logic from /api/whatsapp/message endpoint
 */
async function handleMessage(messageData) {
  try {
    // Import the message handler logic
    const { getOrCreateLead, buildCustomerContext, generateSummary, extractInterests } = await import('../services/customerService.js');
    const { getConversationHistory, addToHistory } = await import('../services/conversationService.js');
    const { 
      getOrCreateWhatsAppSession, 
      linkSessionToLead, 
      incrementSessionMessageCount,
      updateConversationData 
    } = await import('../services/whatsappSessionService.js');
    const { generateResponse } = await import('../services/claudeService.js');
    const { formatWhatsAppResponse } = await import('../services/responseFormatter.js');
    const { storeConversationLog } = await import('../services/loggingService.js');

    const inputReceivedAt = Date.now();
    const startTime = Date.now();
    
    const { sessionId, message, profileName, timestamp, brand } = messageData;

    logger.info(`Processing WhatsApp message from ${sessionId} (brand: ${brand})`);

    // Step 1: Get or create lead
    const lead = await getOrCreateLead(sessionId, brand, { profileName });
    logger.info(`Lead retrieved/created: ${lead.id}`);

    // Step 2: Get or create WhatsApp session
    const whatsappSession = await getOrCreateWhatsAppSession(sessionId, brand, {
      profileName,
      whatsappNumber: sessionId
    });
    logger.info(`WhatsApp session retrieved/created: ${whatsappSession.id}`);

    // Step 3: Link session to lead if not already linked
    if (!whatsappSession.lead_id && lead.id) {
      await linkSessionToLead(whatsappSession.id, lead.id);
      whatsappSession.lead_id = lead.id;
    }

    // Step 4: Build customer context
    const context = await buildCustomerContext(sessionId, brand);
    logger.info('Customer context built successfully');

    // Step 5: Get conversation history
    const conversationHistory = await getConversationHistory(lead.id, 10);
    logger.info(`Retrieved ${conversationHistory.length} messages from history`);

    // Step 6: Add user message to messages table
    await addToHistory(lead.id, message, 'user', 'text', {
      input_received_at: inputReceivedAt
    });

    // Step 7: Increment session message count
    await incrementSessionMessageCount(whatsappSession.id);

    // Step 8: Generate AI response
    const aiResponse = await generateResponse(context, message, conversationHistory);
    logger.info('AI response generated successfully');

    // Step 9: Calculate time gap
    const outputSentAt = Date.now();
    const inputToOutputGap = outputSentAt - inputReceivedAt;

    // Step 10: Add assistant response to messages table
    await addToHistory(lead.id, aiResponse.rawResponse, 'assistant', 'text', {
      input_received_at: inputReceivedAt,
      output_sent_at: outputSentAt,
      input_to_output_gap_ms: inputToOutputGap
    });

    // Step 11: Increment session message count again
    await incrementSessionMessageCount(whatsappSession.id);

    // Step 12: Update conversation summary, context, and user inputs
    try {
      const updatedHistory = await getConversationHistory(lead.id, 20);
      const conversationSummary = generateSummary([...updatedHistory].reverse());
      const userInterests = extractInterests([...updatedHistory].reverse());
      
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
      
      const userInputsSummary = {
        interests: userInterests,
        totalInputs: userInterests.length,
        recentTopics: userInterests.slice(0, 10),
        extractedAt: new Date().toISOString()
      };
      
      await updateConversationData(whatsappSession.id, {
        summary: conversationSummary,
        context: conversationContext,
        userInputsSummary: userInputsSummary
      });
      
      logger.info('Updated conversation summary, context, and user inputs summary');
    } catch (error) {
      logger.error('Error updating conversation data:', error);
    }

    // Step 13: Format response for WhatsApp
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

    // Step 14: Store conversation log
    await storeConversationLog({
      customerId: lead.id,
      leadId: lead.id,
      message,
      response: aiResponse.rawResponse,
      responseType: aiResponse.responseType,
      tokensUsed: aiResponse.tokensUsed,
      responseTime: Date.now() - startTime,
      inputToOutputGap: inputToOutputGap,
      metadata: {
        buttons: aiResponse.buttons,
        urgency: aiResponse.urgency,
        nextAction: aiResponse.nextAction,
        brand: brand,
        input_received_at: inputReceivedAt,
        output_sent_at: outputSentAt
      }
    });

    logger.info('Message processed successfully', {
      sessionId,
      responseType: aiResponse.responseType,
      responseTime: Date.now() - startTime
    });

    // Note: The formatted response is available but not sent back to Meta
    // Meta webhook is one-way - responses should be sent via WhatsApp Business API
    // The formattedResponse.whatsappPayload can be used to send the response

  } catch (error) {
    logger.error('Error in handleMessage:', error);
    throw error;
  }
}

export default router;

