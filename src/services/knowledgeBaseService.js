import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Query knowledge base using vector similarity search
 */
export async function queryKnowledgeBase(query, limit = 5) {
  try {
    // For now, using text search until pgvector is set up
    // TODO: Implement proper vector similarity search with embeddings
    
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('*')
      .textSearch('content', query, {
        type: 'websearch',
        config: 'english'
      })
      .limit(limit);

    if (error) {
      logger.warn('Vector search not available, falling back to text search:', error);
      
      // Fallback to simple text search
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('knowledge_base')
        .select('*')
        .ilike('content', `%${query}%`)
        .limit(limit);

      if (fallbackError) {
        logger.error('Error querying knowledge base:', fallbackError);
        throw fallbackError;
      }

      return fallbackData || [];
    }

    return data || [];
  } catch (error) {
    logger.error('Error in queryKnowledgeBase:', error);
    return [];
  }
}

/**
 * Format knowledge base results for Claude context
 */
export function formatKnowledgeContext(results) {
  if (!results || results.length === 0) {
    return 'No relevant information found in knowledge base.';
  }

  return results
    .map((item, index) => `[${index + 1}] ${item.content}`)
    .join('\n\n');
}

