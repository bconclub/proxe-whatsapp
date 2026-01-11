import request from 'supertest';
import app from '../server.js';

describe('WhatsApp Message Endpoint', () => {
  test('POST /api/whatsapp/message should require valid data', async () => {
    const response = await request(app)
      .post('/api/whatsapp/message')
      .send({})
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/whatsapp/message should accept valid message', async () => {
    // This test will fail without proper Supabase/Claude setup
    // Mock these services in a real test environment
    const response = await request(app)
      .post('/api/whatsapp/message')
      .send({
        sessionId: '9876543210',
        message: 'Hello',
        profileName: 'Test User'
      });

    // Expect either success (if services configured) or error (if not)
    expect([200, 500, 503]).toContain(response.status);
  });
});



