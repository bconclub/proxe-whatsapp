import express from 'express';
import { z } from 'zod';
import { queryKnowledgeBase, formatKnowledgeContext } from '../services/knowledgeBaseService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

// Validation schema
const querySchema = z.object({
  query: z.string().min(1),
  customerId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(10).optional()
});

/**
 * POST /api/knowledge-base/query
 * Query knowledge base for relevant information
 */
router.post('/query', async (req, res, next) => {
  try {
    const validation = querySchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError('Invalid request data', 400);
    }

    const { query, limit = 5 } = validation.data;

    const results = await queryKnowledgeBase(query, limit);
    const formattedContext = formatKnowledgeContext(results);

    res.json({
      status: 'success',
      query,
      resultsCount: results.length,
      results: results.map(r => ({
        id: r.id,
        content: r.content,
        category: r.category
      })),
      formattedContext
    });
  } catch (error) {
    next(error);
  }
});

export default router;

