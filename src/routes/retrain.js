import express from 'express';
import { z } from 'zod';
import { aggregateTrainingData } from '../services/retrainService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * POST /api/nightly/retrain
 * Aggregate logs from past 24 hours for model retraining
 * OPEN INTEGRATION: Send to fine-tuning pipeline
 */
router.post('/retrain', async (req, res, next) => {
  try {
    const { hours = 24 } = req.body;

    if (typeof hours !== 'number' || hours < 1 || hours > 168) {
      throw new AppError('Hours must be between 1 and 168', 400);
    }

    const trainingData = await aggregateTrainingData(hours);

    res.json({
      status: 'success',
      ...trainingData,
      note: 'Training data aggregated. Send to fine-tuning pipeline manually or via webhook.'
    });
  } catch (error) {
    next(error);
  }
});

export default router;



