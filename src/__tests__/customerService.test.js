// Mock Supabase for testing
jest.mock('../config/supabase.js', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({
            data: {
              id: 'test-id',
              phone: '9876543210',
              name: 'Test User',
              created_at: new Date().toISOString()
            },
            error: null
          }))
        }))
      }))
    }))
  }
}));

import { getOrCreateCustomer } from '../services/customerService.js';

describe('Customer Service', () => {
  test('getOrCreateCustomer should create new customer', async () => {
    const customer = await getOrCreateCustomer('9876543210', 'Test User');

    expect(customer).toHaveProperty('id');
    expect(customer).toHaveProperty('phone', '9876543210');
    expect(customer).toHaveProperty('name', 'Test User');
  });
});



