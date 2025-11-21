import { logger } from '../utils/logger.js';

/**
 * Format response for WhatsApp Business API
 */
export function formatWhatsAppResponse(text, responseType, buttons = [], metadata = {}) {
  const basePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    type: 'text',
    text: {
      body: text
    }
  };

  // Add buttons if provided
  if (buttons.length > 0 && responseType === 'text_with_buttons') {
    // WhatsApp supports up to 3 quick reply buttons
    const quickReplies = buttons.slice(0, 3).map((button, index) => {
      const buttonId = typeof button === 'string' 
        ? `btn_${index + 1}_${button.toLowerCase().replace(/\s+/g, '_')}`
        : button.id || `btn_${index + 1}`;
      
      const buttonLabel = typeof button === 'string' ? button : button.label;

      return {
        type: 'reply',
        reply: {
          id: buttonId,
          title: buttonLabel.length > 20 ? buttonLabel.substring(0, 20) : buttonLabel
        }
      };
    });

    basePayload.text.body = text;
    basePayload.type = 'interactive';
    basePayload.interactive = {
      type: 'button',
      body: {
        text: text
      },
      action: {
        buttons: quickReplies
      }
    };
  }

  // Add metadata
  if (Object.keys(metadata).length > 0) {
    basePayload.metadata = metadata;
  }

  return basePayload;
}

/**
 * Format carousel response (for property listings)
 */
export function formatCarouselResponse(items, headerText = 'Available Properties') {
  return {
    messaging_product: 'whatsapp',
    type: 'interactive',
    interactive: {
      type: 'product_list',
      header: {
        type: 'text',
        text: headerText
      },
      body: {
        text: 'Here are the properties matching your criteria:'
      },
      action: {
        catalog_id: 'property_catalog',
        sections: [
          {
            title: 'Properties',
            product_items: items.map(item => ({
              product_retailer_id: item.id
            }))
          }
        ]
      }
    }
  };
}

/**
 * Format list response
 */
export function formatListResponse(text, items, buttonText = 'Select Option') {
  return {
    messaging_product: 'whatsapp',
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: text
      },
      action: {
        button: buttonText,
        sections: [
          {
            title: 'Options',
            rows: items.map((item, index) => ({
              id: item.id || `item_${index}`,
              title: item.title || item.label,
              description: item.description || ''
            }))
          }
        ]
      }
    }
  };
}

/**
 * Format template message
 */
export function formatTemplateResponse(templateName, languageCode = 'en', parameters = []) {
  return {
    messaging_product: 'whatsapp',
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      },
      components: parameters.length > 0 ? [
        {
          type: 'body',
          parameters: parameters.map(param => ({
            type: typeof param === 'string' ? 'text' : param.type || 'text',
            text: typeof param === 'string' ? param : param.text
          }))
        }
      ] : []
    }
  };
}

