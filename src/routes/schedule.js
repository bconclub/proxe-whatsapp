import express from 'express';
import { z } from 'zod';
import { generateBookingLink, getAvailableTimeSlots } from '../services/scheduleService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

// Validation schema
const bookingSchema = z.object({
  customerId: z.string().uuid(),
  type: z.enum(['consultation_call', 'property_viewing', 'meeting']).optional()
});

/**
 * POST /api/schedule/booking
 * Generate booking link for calls/meetings
 * OPEN INTEGRATION: Replace with actual calendar system
 */
router.post('/booking', async (req, res, next) => {
  try {
    const validation = bookingSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError('Invalid request data', 400);
    }

    const { customerId, type = 'consultation_call' } = validation.data;

    const booking = await generateBookingLink(customerId, type);

    res.json({
      status: 'success',
      ...booking
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/schedule/slots
 * Get available time slots
 */
router.get('/slots', async (req, res, next) => {
  try {
    const { date } = req.query;
    const slots = await getAvailableTimeSlots(date || null);

    res.json({
      status: 'success',
      ...slots
    });
  } catch (error) {
    next(error);
  }
});

export default router;

