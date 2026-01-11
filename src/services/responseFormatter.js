import { logger } from '../utils/logger.js';

/**
 * Clean and format text for WhatsApp
 * Preserves WhatsApp formatting: *bold*, _italic_, ~strikethrough~
 * Removes: code blocks (```), headers (#), links ([](url))
 */
function cleanWhatsAppText(text) {
  if (!text) return '';
  
  let cleaned = text
    // Remove markdown code blocks (```code```)
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`([^`]+)`/g, '$1') // Remove inline code, keep content
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Remove markdown headers (# Header)
    .replace(/^#{1,6}\s+/gm, '') // Remove header markers
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
    .trim();
  
  // Note: *bold*, _italic_, ~strikethrough~ are PRESERVED (WhatsApp supports these)
  
  return cleaned;
}

/**
 * Format response for WhatsApp Business API
 */
export function formatWhatsAppResponse(text, responseType, buttons = [], metadata = {}) {
  // Clean the text before formatting
  const cleanedText = cleanWhatsAppText(text);
  
  const basePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    type: 'text',
    text: {
      body: cleanedText
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

    basePayload.text.body = cleanedText;
    basePayload.type = 'interactive';
    basePayload.interactive = {
      type: 'button',
      body: {
        text: cleanedText
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
  const cleanedHeader = cleanWhatsAppText(headerText);
  
  return {
    messaging_product: 'whatsapp',
    type: 'interactive',
    interactive: {
      type: 'product_list',
      header: {
        type: 'text',
        text: cleanedHeader
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
  const cleanedText = cleanWhatsAppText(text);
  
  return {
    messaging_product: 'whatsapp',
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: cleanedText
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



