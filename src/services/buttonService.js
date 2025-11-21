import { logger } from '../utils/logger.js';
import { addToHistory } from './conversationService.js';
import { queryKnowledgeBase } from './knowledgeBaseService.js';
import { generateResponse } from './claudeService.js';
import { buildCustomerContext } from './customerService.js';
import { getConversationHistory } from './conversationService.js';

/**
 * Handle button click action
 */
export async function handleButtonAction(customerId, buttonId, buttonLabel) {
  try {
    logger.info(`Button clicked: ${buttonId} by customer ${customerId}`);

    // Log button click
    await addToHistory(customerId, `Clicked: ${buttonLabel}`, 'user', 'button_click');

    // Route based on action type
    const action = determineAction(buttonId, buttonLabel);

    switch (action.type) {
      case 'view_property':
        return await handleViewProperty(customerId, action.propertyId);
      
      case 'schedule_call':
        return await handleScheduleCall(customerId);
      
      case 'get_info':
        return await handleGetInfo(customerId, action.query);
      
      case 'contact_sales':
        return await handleContactSales(customerId);
      
      default:
        return {
          message: 'Thank you for your interest! How can I help you further?',
          responseType: 'text_only'
        };
    }
  } catch (error) {
    logger.error('Error handling button action:', error);
    throw error;
  }
}

/**
 * Determine action type from button ID/label
 */
function determineAction(buttonId, label) {
  const lowerId = buttonId.toLowerCase();
  const lowerLabel = label.toLowerCase();

  if (lowerId.includes('prop_') || lowerId.includes('property_') || lowerLabel.includes('property')) {
    const propertyId = lowerId.match(/prop[erty_]*(\d+)/)?.[1] || null;
    return { type: 'view_property', propertyId };
  }

  if (lowerId.includes('schedule') || lowerId.includes('call') || lowerLabel.includes('schedule') || lowerLabel.includes('call')) {
    return { type: 'schedule_call' };
  }

  if (lowerId.includes('info') || lowerLabel.includes('info') || lowerLabel.includes('more')) {
    return { type: 'get_info', query: label };
  }

  if (lowerId.includes('sales') || lowerId.includes('contact') || lowerLabel.includes('sales')) {
    return { type: 'contact_sales' };
  }

  return { type: 'unknown' };
}

/**
 * Handle view property action
 */
async function handleViewProperty(customerId, propertyId) {
  // TODO: Fetch actual property data from database
  // For now, generate a response using Claude
  
  // Get customer to find sessionId
  const { supabase } = await import('../config/supabase.js');
  const { data: customer } = await supabase
    .from('customers')
    .select('phone')
    .eq('id', customerId)
    .single();
  
  if (!customer) {
    throw new Error('Customer not found');
  }
  
  const context = await buildCustomerContext(customer.phone);
  const history = await getConversationHistory(customerId);
  
  const response = await generateResponse(
    context,
    `Show me details about property ${propertyId}`,
    history
  );

  return {
    message: response.rawResponse,
    responseType: response.responseType,
    buttons: response.buttons
  };
}

/**
 * Handle schedule call action
 */
async function handleScheduleCall(customerId) {
  // This will be handled by the schedule service
  return {
    message: 'Great! Let me help you schedule a call. Please provide your preferred date and time.',
    responseType: 'text_only',
    action: 'schedule_call',
    customerId
  };
}

/**
 * Handle get info action
 */
async function handleGetInfo(customerId, query) {
  const kbResults = await queryKnowledgeBase(query);
  
  if (kbResults.length > 0) {
    return {
      message: kbResults[0].content,
      responseType: 'text_only',
      source: 'knowledge_base'
    };
  }

  return {
    message: 'I\'m looking that up for you. Could you provide more details about what you need?',
    responseType: 'text_only'
  };
}

/**
 * Handle contact sales action
 */
async function handleContactSales(customerId) {
  // TODO: Integrate with CRM/Slack for sales team notification
  return {
    message: 'I\'ve flagged your request for our sales team. They will reach out to you shortly!',
    responseType: 'text_only',
    flagged: true,
    customerId
  };
}

