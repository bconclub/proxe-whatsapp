import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run database migrations
 * This script reads schema.sql and executes it
 */
async function runMigrations() {
  try {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not configured. Set SUPABASE_SERVICE_KEY.');
    }

    logger.info('Reading schema file...');
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Split by semicolons and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    logger.info(`Executing ${statements.length} SQL statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length < 10) continue; // Skip very short statements

      try {
        // Note: Supabase JS client doesn't support raw SQL execution
        // You'll need to run this in Supabase SQL Editor or use psql
        logger.info(`[${i + 1}/${statements.length}] Statement length: ${statement.length} chars`);
      } catch (error) {
        logger.error(`Error executing statement ${i + 1}:`, error.message);
      }
    }

    logger.warn('⚠️  Supabase JS client cannot execute raw SQL.');
    logger.warn('⚠️  Please run src/database/schema.sql in your Supabase SQL Editor.');
    logger.info('Migration script completed. Check Supabase dashboard for schema execution.');

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}

export { runMigrations };

