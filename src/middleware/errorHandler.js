import { logger } from '../utils/logger.js';

// Store recent errors for debugging
let recentErrors = [];

export const errorHandler = (err, req, res, next) => {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode: err.statusCode || 500,
    name: err.name,
    details: err.details || null
  };
  
  // Store error for debugging
  recentErrors.push(errorInfo);
  if (recentErrors.length > 50) {
    recentErrors = recentErrors.slice(-50); // Keep last 50
  }
  
  logger.error('Error occurred', errorInfo);

  const statusCode = err.statusCode || 500;
  // Always show error details for debugging
  const message = err.message || 'Internal server error';

  // Make sure response hasn't been sent
  if (!res.headersSent) {
    res.status(statusCode).json({
      error: message,
      statusCode: statusCode,
      path: req.path,
      method: req.method,
      ...(process.env.NODE_ENV !== 'production' && { 
        stack: err.stack,
        details: err.details || null,
        name: err.name
      })
    });
  }
};

// Export function to get recent errors
export function getRecentErrors() {
  return recentErrors;
}

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}



