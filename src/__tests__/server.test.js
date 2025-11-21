import request from 'supertest';
import app from '../server.js';

describe('Server Health Check', () => {
  test('GET /health should return 200', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
  });

  test('GET /unknown should return 404', async () => {
    await request(app)
      .get('/unknown')
      .expect(404);
  });
});

