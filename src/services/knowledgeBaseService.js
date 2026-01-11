import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Query knowledge base using the search function or fallback to text search
 */
export async function queryKnowledgeBase(query, limit = 5) {
  try {
    // Try using the search_knowledge_base function first (if it exists)
    const { data: functionResults, error: functionError } = await supabase
      .rpc('search_knowledge_base', {
        search_query: query,
        limit_results: limit
      });

    if (!functionError && functionResults && functionResults.length > 0) {
      logger.info(`Found ${functionResults.length} results using search function`);
      return functionResults;
    }

    // Fallback to direct table query with multiple search fields
    logger.warn('Search function not available, using direct table query');
    
    // Search across question, answer, content, and tags
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('*')
      .or(`question.ilike.%${query}%,answer.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(limit);

    if (error) {
      logger.warn('Error with OR query, trying simpler search:', error);
      
      // Simpler fallback - search content field only
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
 * Prioritizes answer field if available, falls back to content
 */
export function formatKnowledgeContext(results) {
  if (!results || results.length === 0) {
    return 'No relevant information found in knowledge base.';
  }

  return results
    .map((item, index) => {
      // Use answer if available (more detailed), otherwise use content
      const text = item.answer || item.content || '';
      const question = item.question ? `Q: ${item.question}\n` : '';
      const category = item.category ? `[${item.category}]` : '';
      
      return `${category} ${question}A: ${text}`.trim();
    })
    .join('\n\n');
}



