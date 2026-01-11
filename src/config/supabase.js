import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

// Lazy initialization - only check when actually creating client
function getSupabaseClient() {
  // Support multiple naming conventions (in order of priority):
  // 1. NEXT_PUBLIC_PROXE_SUPABASE_URL (project-specific)
  // 2. NEXT_PUBLIC_SUPABASE_URL (generic Next.js pattern)
  // 3. SUPABASE_URL (standard)
  const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || 
                      process.env.NEXT_PUBLIC_SUPABASE_URL || 
                      process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || 
                      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                      process.env.SUPABASE_KEY;
  
  // Validate that we have real values, not placeholders
  if (!supabaseUrl || !supabaseKey || 
      supabaseUrl.includes('your-project') || 
      supabaseKey.includes('your-supabase')) {
    throw new Error('Missing or invalid Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_KEY) environment variables with real values.');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

// Create client lazily
let _supabase = null;
export const supabase = new Proxy({}, {
  get(target, prop) {
    if (!_supabase) {
      _supabase = getSupabaseClient();
    }
    return _supabase[prop];
  }
});

// Service role client for admin operations (lazy)
let _supabaseAdmin = null;
export const supabaseAdmin = new Proxy({}, {
  get(target, prop) {
    if (!_supabaseAdmin) {
      const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) {
        return null;
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || 
                          process.env.NEXT_PUBLIC_SUPABASE_URL || 
                          process.env.SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Missing SUPABASE_URL for service role client');
      }
      _supabaseAdmin = createClient(supabaseUrl, serviceKey);
    }
    return _supabaseAdmin ? _supabaseAdmin[prop] : null;
  }
});

// Test connection (using all_leads table from unified schema) - only after dotenv loads
setTimeout(() => {
  const supabaseUrl = process.env.NEXT_PUBLIC_PROXE_SUPABASE_URL || 
                      process.env.NEXT_PUBLIC_SUPABASE_URL || 
                      process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY || 
                      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                      process.env.SUPABASE_KEY;
  
  if (_supabase || (supabaseUrl && supabaseKey)) {
    supabase.from('all_leads').select('count').limit(1)
      .then(() => {
        logger.info('Supabase connection established');
      })
      .catch((err) => {
        logger.warn('Supabase connection test failed:', err.message);
      });
  }
}, 100);



