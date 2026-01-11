import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

// Lazy initialization - only check when actually creating client
let _claudeClient = null;
function getClaudeClient() {
  if (!process.env.CLAUDE_API_KEY) {
    throw new Error('Missing Claude API key. Please set CLAUDE_API_KEY environment variable.');
  }
  
  if (!_claudeClient) {
    _claudeClient = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
  }
  
  return _claudeClient;
}

export const claudeClient = new Proxy({}, {
  get(target, prop) {
    return getClaudeClient()[prop];
  }
});

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
export const CLAUDE_MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS) || 300; // Reduced for short WhatsApp responses

// Log initialization after dotenv loads
setTimeout(() => {
  if (process.env.CLAUDE_API_KEY) {
    logger.info(`Claude client initialized with model: ${CLAUDE_MODEL}`);
  }
}, 100);



