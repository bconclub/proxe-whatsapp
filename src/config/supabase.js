import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_KEY environment variables.');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Service role client for admin operations
export const supabaseAdmin = process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// Test connection
supabase.from('customers').select('count').limit(1)
  .then(() => {
    logger.info('Supabase connection established');
  })
  .catch((err) => {
    logger.warn('Supabase connection test failed:', err.message);
  });

