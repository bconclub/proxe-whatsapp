/**
 * Integration Tests
 * 
 * These tests require:
 * - Supabase connection configured
 * - Claude API key configured
 * - Test database with schema
 * 
 * Run with: npm test -- integration.test.js
 */

import request from 'supertest';
import app from '../server.js';

describe('Integration Tests', () => {
  // Skip if environment not configured
  const hasConfig = process.env.SUPABASE_URL && process.env.CLAUDE_API_KEY;

  test.skipIf(!hasConfig)('Full message flow', async () => {
    const response = await request(app)
      .post('/api/whatsapp/message')
      .send({
        sessionId: '9999999999',
        message: 'Hello, I am looking for properties in Bandra',
        profileName: 'Integration Test User'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', 'success');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('responseType');
  });

  test.skipIf(!hasConfig)('Customer context endpoint', async () => {
    // First create a customer
    await request(app)
      .post('/api/whatsapp/message')
      .send({
        sessionId: '8888888888',
        message: 'Test',
        profileName: 'Context Test'
      });

    // Then get context
    const response = await request(app)
      .post('/api/customer/context')
      .send({ sessionId: '8888888888' })
      .expect(200);

    expect(response.body).toHaveProperty('customerId');
    expect(response.body).toHaveProperty('name');
    expect(response.body).toHaveProperty('phone', '8888888888');
  });
});



