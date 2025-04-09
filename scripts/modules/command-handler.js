/**
 * command-handler.js
 * Handlers for CLI commands
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { CONFIG, log, readJSON, writeJSON, findTaskById, isOllamaAvailable, isModelAvailable } from './utils.js';

/**
 * Parse PRD handler
 * @param {Object} options Command options
 */
async function parsePRDHandler(options) {
  try {
    // Check if Ollama is available before proceeding
    if (!(await isOllamaAvailable())) {
      console.error(chalk.red('Error: Ollama is not available.'));
      console.log(chalk.yellow('Please make sure Ollama is installed and running at ' + (process.env.OLLAMA_API_URL || 'http://localhost:11434')));
      console.log(chalk.yellow('You can download Ollama from https://ollama.com/'));
      process.exit(1);
    }
    
    // Check if the specified model is available
    const model = process.env.OLLAMA_MODEL || 'llama3';
    if (!(await isModelAvailable(model))) {
      console.error(chalk.red(`Error: The model '${model}' is not available in Ollama.`));
      console.log(chalk.yellow(`Please pull the model using: ollama pull ${model}`));
      process.exit(1);
    }
    
    // Default values
    const prdPath = options.input || 'sample-prd.txt';
    const tasksPath = options.output || 'tasks/tasks.json';
    const numTasks = options.numTasks || parseInt(process.env.DEFAULT_NUM_TASKS || '10', 10);
  
    // Validate options
    if (!fs.existsSync(prdPath)) {
      console.error(chalk.red(`Error: PRD file not found: ${prdPath}`));
      process.exit(1);
    }
    
    // Parse the PRD
    await parsePRD(prdPath, tasksPath, numTasks);
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    
    if (CONFIG.debug) {
      console.error(error);
    }
    
    process.exit(1);
  }
} 