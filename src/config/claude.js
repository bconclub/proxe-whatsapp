import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

if (!process.env.CLAUDE_API_KEY) {
  throw new Error('Missing Claude API key. Please set CLAUDE_API_KEY environment variable.');
}

export const claudeClient = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
export const CLAUDE_MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS) || 2000;

logger.info(`Claude client initialized with model: ${CLAUDE_MODEL}`);

