import {
  formatWhatsAppResponse,
  formatCarouselResponse,
  formatListResponse
} from '../services/responseFormatter.js';

describe('Response Formatter', () => {
  test('formatWhatsAppResponse should format text-only message', () => {
    const result = formatWhatsAppResponse('Hello, world!', 'text_only');

    expect(result).toHaveProperty('messaging_product', 'whatsapp');
    expect(result).toHaveProperty('type', 'text');
    expect(result.text.body).toBe('Hello, world!');
  });

  test('formatWhatsAppResponse should format text with buttons', () => {
    const buttons = ['Option 1', 'Option 2', 'Option 3'];
    const result = formatWhatsAppResponse('Choose an option:', 'text_with_buttons', buttons);

    expect(result).toHaveProperty('type', 'interactive');
    expect(result.interactive).toHaveProperty('type', 'button');
    expect(result.interactive.action.buttons).toHaveLength(3);
  });

  test('formatCarouselResponse should format carousel', () => {
    const items = [
      { id: 'prop1', title: 'Property 1' },
      { id: 'prop2', title: 'Property 2' }
    ];
    const result = formatCarouselResponse(items, 'Properties');

    expect(result).toHaveProperty('type', 'interactive');
    expect(result.interactive).toHaveProperty('type', 'product_list');
  });

  test('formatListResponse should format list', () => {
    const items = [
      { id: '1', title: 'Option 1', description: 'Description 1' },
      { id: '2', title: 'Option 2', description: 'Description 2' }
    ];
    const result = formatListResponse('Select an option:', items);

    expect(result).toHaveProperty('type', 'interactive');
    expect(result.interactive).toHaveProperty('type', 'list');
  });
});

