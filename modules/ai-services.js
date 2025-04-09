/**
 * ai-services.js
 * AI service interactions for the Task Master CLI
 */

// NOTE/TODO: Include the beta header output-128k-2025-02-19 in your API request to increase the maximum output token length to 128k tokens for Claude 3.7 Sonnet.

import fetch from 'node-fetch';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { CONFIG, log, sanitizePrompt } from './utils.js';
import { startLoadingIndicator, stopLoadingIndicator } from './ui.js';
import chalk from 'chalk';

// Import Perplexity provider
import { perplexity as perplexityProvider } from '@ai-sdk/perplexity';
import { generateText } from '@ai-sdk/core';

// Load environment variables
dotenv.config();

// Configure Ollama client settings
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

// Lazy-loaded Perplexity client
let perplexity = null;

/**
 * Get or initialize the Perplexity client
 * @returns {OpenAI} Perplexity client
 */
function getPerplexityClient() {
  if (!perplexity) {
    if (!process.env.PERPLEXITY_API_KEY) {
      throw new Error("PERPLEXITY_API_KEY environment variable is missing. Set it to use research-backed features.");
    }
    
    // Initialize with OpenAI client for backward compatibility
    perplexity = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai',
    });
  }
  return perplexity;
}

/**
 * Use the new @ai-sdk/perplexity package for research
 * @param {string} prompt - The research prompt
 * @returns {Promise<string>} Research results
 */
async function getPerplexityResearch(prompt) {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY environment variable is missing. Set it to use research-backed features.");
  }
  
  const model = process.env.PERPLEXITY_MODEL || 'sonar-medium-online';
  
  const { text } = await generateText({
    model: perplexityProvider(model, {
      apiKey: process.env.PERPLEXITY_API_KEY
    }),
    prompt: prompt
  });
  
  return text;
}

// ... existing code ... 