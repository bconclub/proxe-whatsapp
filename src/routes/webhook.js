import express from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Send WhatsApp message via Meta API
 * @param {string} to - Recipient phone number
 * @param {string} message - Message text to send
 * @param {Array<string>} buttons - Optional array of button labels
 * @returns {Promise<Object>} - API response
 */
async function sendWhatsAppMessage(to, message, buttons = null) {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error('Meta WhatsApp API credentials not configured', {
      hasPhoneNumberId: !!phoneNumberId,
      hasAccessToken: !!accessToken
    });
    throw new Error('WhatsApp API credentials not configured');
  }

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
  
  let payload;
  
  // If buttons provided, send interactive message
  if (buttons && buttons.length > 0 && buttons.length <= 3) {
    payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: message
        },
        action: {
          buttons: buttons.slice(0, 3).map((label, index) => ({
            type: 'reply',
            reply: {
              id: `btn_${index + 1}`,
              title: label.length > 20 ? label.substring(0, 20) : label
            }
          }))
        }
      }
    };
  } else {
    // Plain text message
    payload = {
      messaging_product: 'whatsapp',
      to: to,
      text: {
        body: message
      }
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      logger.error('Failed to send WhatsApp message', {
        status: response.status,
        statusText: response.statusText,
        error: responseData
      });
      throw new Error(`WhatsApp API error: ${responseData.error?.message || response.statusText}`);
    }

    logger.info('WhatsApp message sent successfully', {
      to,
      messageId: responseData.messages?.[0]?.id,
      messageLength: message.length,
      hasButtons: !!(buttons && buttons.length > 0)
    });

    return responseData;
  } catch (error) {
    logger.error('Error sending WhatsApp message', {
      to,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

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
    // Debug: Check if req.body is a Buffer
    const bodyType = typeof req.body;
    const isBuffer = Buffer.isBuffer(req.body);
    logger.info('Webhook body debug', { 
      bodyType, 
      isBuffer,
      isObject: typeof req.body === 'object' && req.body !== null && !isBuffer
    });

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

    // Get raw body for signature validation
    // If express.raw() worked, req.body should be a Buffer
    // If not, we need to convert the parsed JSON back to string
    let rawBody;
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
      logger.info('Using req.body as Buffer for signature validation');
    } else {
      // Body was parsed as JSON, convert back to string
      rawBody = Buffer.from(JSON.stringify(req.body), 'utf8');
      logger.warn('Body was parsed as JSON, converting to Buffer for signature validation');
    }

    // Validate signature using raw body
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

    // Parse webhook data
    let webhookData;
    try {
      if (Buffer.isBuffer(req.body)) {
        // Body is already a Buffer, parse it
        webhookData = JSON.parse(rawBody.toString('utf8'));
      } else {
        // Body was already parsed as JSON, use it directly
        webhookData = req.body;
        logger.info('Using already-parsed JSON body');
      }
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
          let buttonId = null;
          let buttonTitle = null;
          
          if (message.text && message.text.body) {
            // Regular text message
            messageText = message.text.body;
          } else if (message.type === 'interactive' && message.interactive) {
            // Interactive message (button click)
            if (message.interactive.type === 'button_reply' && message.interactive.button_reply) {
              buttonId = message.interactive.button_reply.id;
              buttonTitle = message.interactive.button_reply.title;
              messageText = buttonTitle; // Use button title as message text
              logger.info('Button click detected', { buttonId, buttonTitle, phone });
            } else if (message.interactive.type === 'list_reply' && message.interactive.list_reply) {
              // Handle list reply if needed
              buttonId = message.interactive.list_reply.id;
              buttonTitle = message.interactive.list_reply.title;
              messageText = buttonTitle;
              logger.info('List reply detected', { buttonId, buttonTitle, phone });
            } else {
              logger.warn('Unsupported interactive message type', { 
                type: message.interactive.type,
                phone 
              });
              continue;
            }
          } else if (message.type === 'button' && message.button) {
            // Legacy button format (fallback)
            messageText = message.button.text || message.button.payload || '';
            buttonId = message.button.id;
            buttonTitle = message.button.text;
          } else {
            logger.warn('Message missing text content', { 
              type: message.type,
              phone,
              hasText: !!(message.text && message.text.body),
              hasInteractive: !!(message.interactive)
            });
            continue;
          }

          if (!messageText || messageText.trim().length === 0) {
            logger.warn('Message text is empty', { phone, buttonId, buttonTitle });
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
            brand: 'proxe', // Default brand, can be made configurable
            buttonId: buttonId, // Include button ID if it's a button click
            buttonTitle: buttonTitle // Include button title if it's a button click
          };

          logger.info('Processing Meta webhook message', {
            sessionId: phone,
            messageLength: messageText.length,
            hasProfileName: !!profileName,
            isButtonClick: !!buttonId,
            buttonId: buttonId,
            buttonTitle: buttonTitle
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

    // Step 3.5: Check if this is a NEW or RETURNING user
    // Check if lead has existing messages BEFORE adding current message
    const { supabase } = await import('../config/supabase.js');
    const { data: existingMessages, error: messagesError } = await supabase
      .from('conversations')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('channel', 'whatsapp')
      .limit(1);

    if (messagesError) {
      logger.warn('Error checking existing messages, defaulting to returning user', { error: messagesError.message });
    }

    // Check for web history and bookings in unified_context
    const hasWebHistory = lead.unified_context?.web?.user_inputs?.length > 0 || 
                          lead.unified_context?.web?.conversation_summary;
    const hasBooking = lead.unified_context?.web?.booking_status === 'confirmed';
    const hasWhatsAppHistory = existingMessages && existingMessages.length > 0;

    // User is only "new" if they have NO history across any channel
    const isNewUser = !hasWebHistory && !hasBooking && !hasWhatsAppHistory;
    
    logger.info(`User type detected: ${isNewUser ? 'NEW' : 'RETURNING'}`, {
      leadId: lead.id,
      hasWebHistory,
      hasBooking,
      hasWhatsAppHistory,
      existingMessagesCount: existingMessages?.length || 0
    });

    // Step 4: Add user message to conversations table (via logMessage)
    await addToHistory(lead.id, message, 'user', 'text', {
      input_received_at: inputReceivedAt
    });

    // Step 5: Increment session message count
    await incrementSessionMessageCount(whatsappSession.id);

    let aiResponse;
    let outputSentAt;
    let inputToOutputGap;

    // Step 6: Handle NEW vs RETURNING users
    if (isNewUser) {
      // NEW USER: Send template response with buttons, skip Claude
      logger.info('New user detected - sending template welcome message');
      
      const welcomeMessage = "Hey! I'm PROXe. What brings you here today?";
      // New user gets: "Learn More" button (single button)
      const welcomeButtons = ["Learn More"];
      
      // Send welcome message with buttons
      try {
        await sendWhatsAppMessage(sessionId, welcomeMessage, welcomeButtons);
        logger.info('Welcome message sent to new user', { sessionId });
      } catch (error) {
        logger.error('Failed to send welcome message', {
          sessionId,
          error: error.message
        });
        throw error;
      }

      // Create mock AI response for logging consistency
      outputSentAt = Date.now();
      inputToOutputGap = outputSentAt - inputReceivedAt;
      
      aiResponse = {
        rawResponse: welcomeMessage,
        responseType: 'text_with_buttons',
        buttons: welcomeButtons,
        urgency: 'low',
        nextAction: 'wait_for_user_selection',
        tokensUsed: 0,
        responseTime: outputSentAt - startTime
      };
    } else {
      // RETURNING USER (has web history, booking, or WhatsApp history): Use Claude to generate personalized response
      logger.info('Returning user detected - using Claude AI response with context-aware greeting');
      
      // Build customer context
      const context = await buildCustomerContext(sessionId, brand);
      logger.info('Customer context built successfully');

      // Get conversation history (includes the message we just added)
      const conversationHistory = await getConversationHistory(lead.id, 10);
      logger.info(`Retrieved ${conversationHistory.length} messages from history`);

      // Calculate message count for button logic (exclude current message from count)
      // conversationHistory includes user messages and assistant responses
      // For button logic, we want the count of previous exchanges
      const messageCount = Math.floor(conversationHistory.length / 2); // Each exchange = user + assistant

      // Generate AI response (pass isNewUser=false since we already checked)
      // Claude will use the greeting instructions we added to generate context-aware greeting
      aiResponse = await generateResponse(context, message, conversationHistory, false);
      logger.info('AI response generated successfully');

      // Calculate time gap
      outputSentAt = Date.now();
      inputToOutputGap = outputSentAt - inputReceivedAt;
    }

    // Step 7: Add assistant response to conversations table (via logMessage)
    await addToHistory(lead.id, aiResponse.rawResponse, 'assistant', 'text', {
      input_received_at: inputReceivedAt,
      output_sent_at: outputSentAt,
      input_to_output_gap_ms: inputToOutputGap
    });

    // Step 8: Increment session message count again
    await incrementSessionMessageCount(whatsappSession.id);

    // Step 9: Update conversation summary, context, and user inputs (only for returning users)
    if (!isNewUser) {
      try {
        const updatedHistory = await getConversationHistory(lead.id, 20);
        const conversationSummary = generateSummary([...updatedHistory].reverse());
        const userInterests = extractInterests([...updatedHistory].reverse());
        
        // Build context for returning users
        const context = await buildCustomerContext(sessionId, brand);
        
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

    // Step 10: Send WhatsApp message via Meta API
    // For new users, message already sent with buttons
    // For returning users, send Claude response
    if (!isNewUser) {
      try {
        // Send message with buttons if available
        await sendWhatsAppMessage(sessionId, aiResponse.rawResponse, aiResponse.buttons);
        logger.info('WhatsApp message sent successfully', { sessionId });
      } catch (error) {
        logger.error('Failed to send WhatsApp message', {
          sessionId,
          error: error.message
        });
        // Don't throw - we still want to store the log even if sending fails
      }
    }

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

