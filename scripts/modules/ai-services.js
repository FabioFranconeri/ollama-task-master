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
 * Get research results from Perplexity
 * @param {string} prompt - The research prompt
 * @returns {Promise<string>} Research results
 */
async function getPerplexityResearch(prompt) {
  const perplexityClient = getPerplexityClient();
  const model = process.env.PERPLEXITY_MODEL || 'sonar-medium-online';
  
  const response = await perplexityClient.chat.completions.create({
    model: model,
    messages: [{ role: 'user', content: prompt }]
  });
  
  return response.choices[0].message.content;
}

/**
 * Handle Ollama API errors with user-friendly messages
 * @param {Error} error - The error from Ollama API
 * @returns {string} User-friendly error message
 */
function handleOllamaError(error) {
  // Check for connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return `Could not connect to Ollama server at ${OLLAMA_API_URL}. Make sure Ollama is running.`;
  }

  // Check for timeout
  if (error.type === 'request-timeout' || error.message?.toLowerCase().includes('timeout')) {
    return 'The request to Ollama timed out. Your prompt might be too complex or the server is busy.';
  }

  // Check for HTTP errors
  if (error.status) {
    switch (error.status) {
      case 404:
        return `Model "${OLLAMA_MODEL}" not found. You may need to run: ollama pull ${OLLAMA_MODEL}`;
      case 400:
        return 'Bad request to Ollama API. The prompt might be malformed.';
      case 500:
        return 'Ollama server error. Check the Ollama logs for more details.';
      default:
        return `Ollama API error (${error.status}): ${error.message || 'Unknown error'}`;
    }
  }
  
  // Check for network/timeout errors
  if (error.message?.toLowerCase().includes('network')) {
    return 'There was a network error connecting to Ollama. Please check your internet connection and try again.';
  }
  
  // Default error message
  return `Error communicating with Ollama: ${error.message || 'Unknown error'}`;
}

/**
 * Process Ollama's streaming response and fix any JSON escaping issues
 * @param {string} text - Raw response text from Ollama
 * @returns {string} Processed text with fixed JSON escaping
 */
function processOllamaResponse(text) {
  try {
    // 1. Fix common escape issues with single quotes inside JSON strings
    // Replace problematic escape sequence \' with properly escaped \"'\"
    text = text.replace(/\\'/g, "'");
    
    // 2. Fix other common JSON escaping issues
    // Properly escape backslashes
    text = text.replace(/\\(?=[^"ntbfr\/])/g, "\\\\");
    
    // 3. Fix broken quote escaping
    // Replace \" with \\"
    text = text.replace(/(?<!\\)\\"/g, '\\"');
    
    if (CONFIG.debug) {
      log('debug', `Fixed JSON escaping issues`);
    }
    
    return text;
  } catch (error) {
    log('error', `Error processing Ollama response: ${error.message}`);
    return text; // Return original text if processing fails
  }
}

/**
 * Call Ollama to generate tasks from a PRD
 * @param {string} prdContent - PRD content
 * @param {string} prdPath - Path to the PRD file
 * @param {number} numTasks - Number of tasks to generate
 * @param {number} retryCount - Retry count
 * @returns {Object} Ollama's response
 */
async function callClaude(prdContent, prdPath, numTasks, retryCount = 0) {
  try {
    log('info', 'Calling Ollama...');
    
    // Build the system prompt
    const systemPrompt = `You are an AI assistant helping to break down a Product Requirements Document (PRD) into a set of sequential development tasks. 
Your goal is to create ${numTasks} well-structured, actionable development tasks based on the PRD provided.

Each task should follow this JSON structure:
{
  "id": number,
  "title": string,
  "description": string,
  "status": "pending",
  "dependencies": number[] (IDs of tasks this depends on),
  "priority": "high" | "medium" | "low",
  "details": string (implementation details),
  "testStrategy": string (validation approach)
}

Guidelines:
1. Create exactly ${numTasks} tasks, numbered from 1 to ${numTasks}
2. Each task should be atomic and focused on a single responsibility
3. Order tasks logically - consider dependencies and implementation sequence
4. Early tasks should focus on setup, core functionality first, then advanced features
5. Include clear validation/testing approach for each task
6. Set appropriate dependency IDs (a task can only depend on tasks with lower IDs)
7. Assign priority (high/medium/low) based on criticality and dependency order
8. Include detailed implementation guidance in the "details" field

Expected output format:
{
  "tasks": [
    {
      "id": 1,
      "title": "Setup Project Repository",
      "description": "...",
      ...
    },
    ...
  ],
  "metadata": {
    "projectName": "PRD Implementation",
    "totalTasks": ${numTasks},
    "sourceFile": "${prdPath}",
    "generatedAt": "YYYY-MM-DD"
  }
}

Important: Your response must be valid JSON only, with no additional explanation or comments.`;

    // Use streaming request to handle large responses and show progress
    return await handleStreamingRequest(prdContent, prdPath, numTasks, CONFIG.maxTokens, systemPrompt);
  } catch (error) {
    // Get user-friendly error message
    const userMessage = handleOllamaError(error);
    log('error', userMessage);

    // Retry logic for certain errors
    if (retryCount < 2 && (
      error.code === 'ECONNREFUSED' || 
      error.code === 'ENOTFOUND' ||
      error.message?.toLowerCase().includes('timeout') ||
      error.message?.toLowerCase().includes('network')
    )) {
      const waitTime = (retryCount + 1) * 5000; // 5s, then 10s
      log('info', `Waiting ${waitTime/1000} seconds before retry ${retryCount + 1}/2...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return await callClaude(prdContent, prdPath, numTasks, retryCount + 1);
    } else {
      console.error(chalk.red(userMessage));
      if (CONFIG.debug) {
        log('debug', 'Full error:', error);
      }
      throw new Error(userMessage);
    }
  }
}

/**
 * Handle streaming request to Ollama
 * @param {string} prdContent - PRD content
 * @param {string} prdPath - Path to the PRD file
 * @param {number} numTasks - Number of tasks to generate
 * @param {number} maxTokens - Maximum tokens
 * @param {string} systemPrompt - System prompt
 * @returns {Object} Ollama's response
 */
async function handleStreamingRequest(prdContent, prdPath, numTasks, maxTokens, systemPrompt) {
  const loadingIndicator = startLoadingIndicator('Generating tasks from PRD...');
  let responseText = '';
  let streamingInterval = null;
  
  try {
    // Use streaming for handling large responses
    const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Here's the Product Requirements Document (PRD) to break down into ${numTasks} tasks:\n\n${prdContent}`
          }
        ],
        stream: true
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw { 
        status: response.status, 
        message: error.error || `HTTP error ${response.status}` 
      };
    }
    
    // Update loading indicator to show streaming progress
    let dotCount = 0;
    const readline = await import('readline');
    streamingInterval = setInterval(() => {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`Generating tasks from PRD${'.'.repeat(dotCount)}`);
      dotCount = (dotCount + 1) % 4;
    }, 500);
    
    // Process the stream
    if (typeof response.body.getReader !== 'function') {
      // Handle node-fetch response body format
      const chunks = [];
      response.body.on('data', chunk => chunks.push(chunk));
      
      await new Promise((resolve, reject) => {
        response.body.on('end', () => resolve());
        response.body.on('error', err => reject(err));
      });
      
      const responseBuffer = Buffer.concat(chunks);
      const responseString = responseBuffer.toString('utf-8');
      
      // Save raw response for debugging
      if (CONFIG.debug) {
        log('debug', `Raw Ollama response (first 500 chars): ${responseString.substring(0, 500)}`);
        
        // Write to file for complete examination
        const fs = await import('fs');
        fs.promises.writeFile('ollama_response_debug.txt', responseString);
        log('debug', 'Full response written to ollama_response_debug.txt');
      }
      
      // Parse the response lines - concatenate the content instead of adding it directly
      const lines = responseString.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.message && data.message.content) {
            responseText += data.message.content;
          }
        } catch (e) {
          // Skip invalid JSON
          if (CONFIG.debug) {
            log('debug', `Error parsing JSON line: ${e.message}, Line: ${line}`);
          }
        }
      }
    } else {
      // Handle browser-like response body format with getReader
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let fullResponse = '';  // Store the full response for debugging
      
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;  // Add to full response
          
          try {
            // Ollama returns each chunk as a JSON object with a "message" field
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.message && data.message.content) {
                  responseText += data.message.content;
                }
              } catch (e) {
                // Skip invalid JSON
                if (CONFIG.debug) {
                  log('debug', `Error parsing JSON: ${e.message}, Line: ${line}`);
                }
              }
            }
          } catch (e) {
            // If parsing fails, just append the raw chunk
            responseText += chunk;
          }
        }
      }
      
      // Save raw response for debugging
      if (CONFIG.debug) {
        log('debug', `Raw Ollama response (first 500 chars): ${fullResponse.substring(0, 500)}`);
        
        // Write to file for complete examination
        const fs = await import('fs');
        fs.promises.writeFile('ollama_response_debug.txt', fullResponse);
        log('debug', 'Full response written to ollama_response_debug.txt');
      }
    }
    
    if (streamingInterval) clearInterval(streamingInterval);
    stopLoadingIndicator(loadingIndicator);
    
    log('info', 'Response received, processing...');
    
    // Process the raw response text to fix JSON escaping issues
    const processedText = processOllamaResponse(responseText);
    
    // Write accumulated responseText to a debug file
    if (CONFIG.debug) {
      const fs = await import('fs');
      fs.promises.writeFile('ollama_accumulated_debug.txt', responseText);
      fs.promises.writeFile('ollama_processed_debug.txt', processedText);
      log('debug', 'Accumulated response written to ollama_accumulated_debug.txt');
      log('debug', 'Processed response written to ollama_processed_debug.txt');
      log('debug', `Accumulated response (first 500 chars): ${responseText.substring(0, 500)}`);
      log('debug', `Processed response (first 500 chars): ${processedText.substring(0, 500)}`);
    }
    
    try {
      // Parse the response JSON
      // First try to parse as-is
      try {
        const jsonResponse = JSON.parse(processedText);
        return jsonResponse;
      } catch (e) {
        log('debug', `Failed to parse response as JSON: ${e.message}`);
        
        // Not valid JSON, try to extract JSON
        const jsonStart = processedText.indexOf('{');
        const jsonEnd = processedText.lastIndexOf('}');
        
        log('debug', `JSON start index: ${jsonStart}, JSON end index: ${jsonEnd}`);
        
        if (jsonStart >= 0 && jsonEnd >= 0 && jsonEnd > jsonStart) {
          const jsonText = processedText.substring(jsonStart, jsonEnd + 1);
          log('debug', `Extracted JSON (first 500 chars): ${jsonText.substring(0, 500)}`);
          
          try {
            const extractedJson = JSON.parse(jsonText);
            return extractedJson;
          } catch (e) {
            // Couldn't parse extracted JSON either
            log('debug', `Failed to parse extracted JSON: ${e.message}`);
            
            // Create a basic valid response to return instead of failing
            log('warn', 'Creating fallback tasks structure');
            return {
              tasks: Array.from({ length: numTasks }, (_, i) => ({
                id: i + 1,
                title: `Task ${i + 1}`,
                description: `Auto-generated fallback task ${i + 1}`,
                status: 'pending',
                dependencies: [],
                priority: 'medium',
                details: 'This task was auto-generated due to parsing issues with the AI response.',
                testStrategy: 'Manual verification'
              })),
              metadata: {
                projectName: process.env.PROJECT_NAME || "Task Master Project",
                totalTasks: numTasks,
                sourceFile: prdPath,
                generatedAt: new Date().toISOString().split('T')[0],
                note: "Tasks were generated as fallbacks due to AI response parsing issues."
              }
            };
          }
        } else {
          // Create a fallback tasks structure if no JSON can be extracted
          log('warn', 'Creating fallback tasks structure due to missing JSON markers');
          return {
            tasks: Array.from({ length: numTasks }, (_, i) => ({
              id: i + 1,
              title: `Task ${i + 1}`,
              description: `Auto-generated fallback task ${i + 1}`,
              status: 'pending',
              dependencies: [],
              priority: 'medium',
              details: 'This task was auto-generated due to parsing issues with the AI response.',
              testStrategy: 'Manual verification'
            })),
            metadata: {
              projectName: process.env.PROJECT_NAME || "Task Master Project",
              totalTasks: numTasks,
              sourceFile: prdPath,
              generatedAt: new Date().toISOString().split('T')[0],
              note: "Tasks were generated as fallbacks due to AI response parsing issues."
            }
          };
        }
      }
    } catch (e) {
      log('error', `Error parsing Ollama response: ${e.message}`);
      
      // Create a fallback tasks structure in case of error
      log('warn', 'Creating fallback tasks structure due to parsing error');
      return {
        tasks: Array.from({ length: numTasks }, (_, i) => ({
          id: i + 1,
          title: `Task ${i + 1}`,
          description: `Auto-generated fallback task ${i + 1}`,
          status: 'pending',
          dependencies: [],
          priority: 'medium',
          details: 'This task was auto-generated due to parsing issues with the AI response.',
          testStrategy: 'Manual verification'
        })),
        metadata: {
          projectName: process.env.PROJECT_NAME || "Task Master Project",
          totalTasks: numTasks,
          sourceFile: prdPath,
          generatedAt: new Date().toISOString().split('T')[0],
          note: "Tasks were generated as fallbacks due to error: " + e.message
        }
      };
    }
  } catch (error) {
    if (streamingInterval) clearInterval(streamingInterval);
    stopLoadingIndicator(loadingIndicator);
    throw error;
  }
}

/**
 * Generate subtasks for a task
 * @param {Object} task - Task object
 * @param {number} numSubtasks - Number of subtasks to generate
 * @param {number} nextSubtaskId - Starting subtask ID
 * @param {string} additionalContext - Additional context
 * @returns {Array} Generated subtasks
 */
async function generateSubtasks(task, numSubtasks = 3, nextSubtaskId = 1, additionalContext = '') {
  try {
    const loadingIndicator = startLoadingIndicator(`Generating ${numSubtasks} subtasks for task ${task.id}: ${task.title}`);
    let streamingInterval = null;
    let responseText = '';
    
    const systemPrompt = `You are an AI assistant helping with task breakdown for software development.
You need to break down a high-level task into ${numSubtasks} specific subtasks that can be implemented one by one.

Subtasks should:
1. Be specific and actionable implementation steps
2. Follow a logical sequence
3. Each handle a distinct part of the parent task
4. Include clear guidance on implementation approach
5. Have appropriate dependency chains between subtasks
6. Collectively cover all aspects of the parent task

For each subtask, provide:
- A clear, specific title
- Detailed implementation steps
- Dependencies on previous subtasks
- Testing approach

Each subtask should be implementable in a focused coding session.`;

    const userPrompt = `Please break down this task into ${numSubtasks} specific, actionable subtasks:

Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description}
Current details: ${task.details || 'None provided'}

${additionalContext ? 'Additional context: ' + additionalContext : ''}

Return exactly ${numSubtasks} subtasks with the following JSON structure:
[
  {
    "id": ${nextSubtaskId},
    "title": "First subtask title",
    "description": "Detailed description",
    "dependencies": [], 
    "details": "Implementation details"
  },
  ...more subtasks...
]

Note on dependencies: Subtasks can depend on other subtasks with lower IDs. Use an empty array if there are no dependencies.`;

    try {
      // Update loading indicator to show streaming progress
      let dotCount = 0;
      const readline = await import('readline');
      streamingInterval = setInterval(() => {
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`Generating subtasks for task ${task.id}${'.'.repeat(dotCount)}`);
        dotCount = (dotCount + 1) % 4;
      }, 500);
      
      // Use streaming API call
      const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          stream: true
        })
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw { 
          status: response.status, 
          message: error.error || `HTTP error ${response.status}` 
        };
      }
      
      // Process the stream
      if (typeof response.body.getReader !== 'function') {
        // Handle node-fetch response body format
        const chunks = [];
        response.body.on('data', chunk => chunks.push(chunk));
        
        await new Promise((resolve, reject) => {
          response.body.on('end', () => resolve());
          response.body.on('error', err => reject(err));
        });
        
        const responseBuffer = Buffer.concat(chunks);
        const responseString = responseBuffer.toString('utf-8');
        
        // Save raw response for debugging
        if (CONFIG.debug) {
          log('debug', `Raw subtask response (first 500 chars): ${responseString.substring(0, 500)}`);
          
          // Write to file for complete examination
          const fs = await import('fs');
          fs.promises.writeFile('ollama_subtask_debug.txt', responseString);
          log('debug', 'Full subtask response written to ollama_subtask_debug.txt');
        }
        
        // Parse the response lines
        const lines = responseString.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message && data.message.content) {
              responseText += data.message.content;
            }
          } catch (e) {
            // Skip invalid JSON
            if (CONFIG.debug) {
              log('debug', `Error parsing JSON line: ${e.message}, Line: ${line}`);
            }
          }
        }
      } else {
        // Handle browser-like response body format with getReader
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let done = false;
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            try {
              // Ollama returns each chunk as a JSON object with a "message" field
              const lines = chunk.split('\n').filter(line => line.trim());
              
              for (const line of lines) {
                try {
                  const data = JSON.parse(line);
                  if (data.message && data.message.content) {
                    responseText += data.message.content;
                  }
                } catch (e) {
                  // Skip invalid JSON
                  if (CONFIG.debug) {
                    log('debug', `Error parsing JSON: ${e.message}, Line: ${line}`);
                  }
                }
              }
            } catch (e) {
              // If parsing fails, just append the raw chunk
              responseText += chunk;
            }
          }
        }
      }
      
      if (streamingInterval) clearInterval(streamingInterval);
      stopLoadingIndicator(loadingIndicator);
      
      log('info', `Completed generating subtasks for task ${task.id}`);
      
      // Process the response text to fix JSON escaping issues
      const processedText = processOllamaResponse(responseText);
      
      // Write accumulated responseText to a debug file
      if (CONFIG.debug) {
        const fs = await import('fs');
        fs.promises.writeFile('ollama_subtasks_accumulated_debug.txt', responseText);
        fs.promises.writeFile('ollama_subtasks_processed_debug.txt', processedText);
        log('debug', 'Accumulated subtasks response written to ollama_subtasks_accumulated_debug.txt');
        log('debug', 'Processed subtasks response written to ollama_subtasks_processed_debug.txt');
      }
      
      return parseSubtasksFromText(processedText, nextSubtaskId, numSubtasks, task.id);
    } catch (error) {
      if (streamingInterval) clearInterval(streamingInterval);
      stopLoadingIndicator(loadingIndicator);
      throw error;
    }
  } catch (error) {
    log('error', `Error generating subtasks: ${error.message}`);
    throw error;
  }
}

/**
 * Generate subtasks with Perplexity research
 * @param {Object} task - Task object
 * @param {number} numSubtasks - Number of subtasks to generate
 * @param {number} nextSubtaskId - Starting subtask ID
 * @param {string} additionalContext - Additional context
 * @returns {Array} Generated subtasks
 */
async function generateSubtasksWithPerplexity(task, numSubtasks = 3, nextSubtaskId = 1, additionalContext = '') {
  try {
    // First, perform research to get context
    log('info', `Researching context for task ${task.id}: ${task.title}`);
    const researchLoadingIndicator = startLoadingIndicator('Researching best practices with Perplexity AI...');
    
    // Formulate research query based on task
    const researchQuery = `I need to implement "${task.title}" which involves: "${task.description}". 
What are current best practices, libraries, design patterns, and implementation approaches? 
Include concrete code examples and technical considerations where relevant.`;
    
    // Query Perplexity for research using the new function
    const researchResult = await getPerplexityResearch(researchQuery);
    
    stopLoadingIndicator(researchLoadingIndicator);
    log('info', 'Research completed, now generating subtasks with additional context');
    
    // Use the research result as additional context for Ollama to generate subtasks
    const combinedContext = `
RESEARCH FINDINGS:
${researchResult}

ADDITIONAL CONTEXT PROVIDED BY USER:
${additionalContext || "No additional context provided."}
`;
    
    // Now generate subtasks with Ollama
    const loadingIndicator = startLoadingIndicator(`Generating research-backed subtasks for task ${task.id}...`);
    let streamingInterval = null;
    let responseText = '';
    
    const systemPrompt = `You are an AI assistant helping with task breakdown for software development.
You need to break down a high-level task into ${numSubtasks} specific subtasks that can be implemented one by one.

You have been provided with research on current best practices and implementation approaches.
Use this research to inform and enhance your subtask breakdown.

Subtasks should:
1. Be specific and actionable implementation steps
2. Follow a logical sequence
3. Each handle a distinct part of the parent task
4. Include clear guidance on implementation approach
5. Have appropriate dependency chains between subtasks
6. Collectively cover all aspects of the parent task

For each subtask, provide:
- A clear, specific title
- Detailed implementation steps that incorporate best practices from the research
- Dependencies on previous subtasks
- Testing approach

Each subtask should be implementable in a focused coding session.`;

    const userPrompt = `Please break down this task into ${numSubtasks} specific, well-researched, actionable subtasks:

Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description}
Current details: ${task.details || 'None provided'}

${combinedContext}

Return exactly ${numSubtasks} subtasks with the following JSON structure:
[
  {
    "id": ${nextSubtaskId},
    "title": "First subtask title",
    "description": "Detailed description incorporating research",
    "dependencies": [], 
    "details": "Implementation details with best practices"
  },
  ...more subtasks...
]

Note on dependencies: Subtasks can depend on other subtasks with lower IDs. Use an empty array if there are no dependencies.`;

    try {
      // Update loading indicator to show streaming progress
      let dotCount = 0;
      const readline = await import('readline');
      streamingInterval = setInterval(() => {
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`Generating research-backed subtasks for task ${task.id}${'.'.repeat(dotCount)}`);
        dotCount = (dotCount + 1) % 4;
      }, 500);
      
      // Use streaming API call
      const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          stream: true
        })
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw { 
          status: response.status, 
          message: error.error || `HTTP error ${response.status}` 
        };
      }
      
      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          try {
            // Ollama returns each chunk as a JSON object with a "message" field
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.message && data.message.content) {
                  responseText += data.message.content;
                }
              } catch (e) {
                // Skip invalid JSON
                if (CONFIG.debug) {
                  log('debug', `Error parsing JSON: ${e.message}, Line: ${line}`);
                }
              }
            }
          } catch (e) {
            // If parsing fails, just append the raw chunk
            responseText += chunk;
          }
        }
      }
      
      if (streamingInterval) clearInterval(streamingInterval);
      stopLoadingIndicator(loadingIndicator);
      
      log('info', `Completed generating research-backed subtasks for task ${task.id}`);
      
      return parseSubtasksFromText(responseText, nextSubtaskId, numSubtasks, task.id);
    } catch (error) {
      if (streamingInterval) clearInterval(streamingInterval);
      stopLoadingIndicator(loadingIndicator);
      throw error;
    }
  } catch (error) {
    log('error', `Error generating research-backed subtasks: ${error.message}`);
    throw error;
  }
}

/**
 * Parse subtasks from Ollama's response text
 * @param {string} text - Response text
 * @param {number} startId - Starting subtask ID
 * @param {number} expectedCount - Expected number of subtasks
 * @param {number} parentTaskId - Parent task ID
 * @returns {Array} Parsed subtasks
 */
function parseSubtasksFromText(text, startId, expectedCount, parentTaskId) {
  try {
    // Locate JSON array in the text
    const jsonStartIndex = text.indexOf('[');
    const jsonEndIndex = text.lastIndexOf(']');
    
    if (jsonStartIndex === -1 || jsonEndIndex === -1 || jsonEndIndex < jsonStartIndex) {
      throw new Error("Could not locate valid JSON array in the response");
    }
    
    // Extract and parse the JSON
    const jsonText = text.substring(jsonStartIndex, jsonEndIndex + 1);
    let subtasks = JSON.parse(jsonText);
    
    // Validate
    if (!Array.isArray(subtasks)) {
      throw new Error("Parsed content is not an array");
    }
    
    // Log warning if count doesn't match expected
    if (subtasks.length !== expectedCount) {
      log('warn', `Expected ${expectedCount} subtasks, but parsed ${subtasks.length}`);
    }
    
    // Normalize subtask IDs if they don't match
    subtasks = subtasks.map((subtask, index) => {
      // Assign the correct ID if it doesn't match
      if (subtask.id !== startId + index) {
        log('warn', `Correcting subtask ID from ${subtask.id} to ${startId + index}`);
        subtask.id = startId + index;
      }
      
      // Convert dependencies to numbers if they are strings
      if (subtask.dependencies && Array.isArray(subtask.dependencies)) {
        subtask.dependencies = subtask.dependencies.map(dep => {
          return typeof dep === 'string' ? parseInt(dep, 10) : dep;
        });
      } else {
        subtask.dependencies = [];
      }
      
      // Ensure status is 'pending'
      subtask.status = 'pending';
      
      // Add parentTaskId
      subtask.parentTaskId = parentTaskId;
      
      return subtask;
    });
    
    return subtasks;
  } catch (error) {
    log('error', `Error parsing subtasks: ${error.message}`);
    
    // Create a fallback array of empty subtasks if parsing fails
    log('warn', 'Creating fallback subtasks');
    
    const fallbackSubtasks = [];
    
    for (let i = 0; i < expectedCount; i++) {
      fallbackSubtasks.push({
        id: startId + i,
        title: `Subtask ${startId + i}`,
        description: "Auto-generated fallback subtask",
        dependencies: [],
        details: "This is a fallback subtask created because parsing failed. Please update with real details.",
        status: 'pending',
        parentTaskId: parentTaskId
      });
    }
    
    return fallbackSubtasks;
  }
}

/**
 * Generate a prompt for complexity analysis
 * @param {Object} tasksData - Tasks data object containing tasks array
 * @returns {string} Generated prompt
 */
function generateComplexityAnalysisPrompt(tasksData) {
  return `Analyze the complexity of the following tasks and provide recommendations for subtask breakdown:

${tasksData.tasks.map(task => `
Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description}
Details: ${task.details}
Dependencies: ${JSON.stringify(task.dependencies || [])}
Priority: ${task.priority || 'medium'}
`).join('\n---\n')}

Analyze each task and return a JSON array with the following structure for each task:
[
  {
    "taskId": number,
    "taskTitle": string,
    "complexityScore": number (1-10),
    "recommendedSubtasks": number (${Math.max(3, CONFIG.defaultSubtasks - 1)}-${Math.min(8, CONFIG.defaultSubtasks + 2)}),
    "expansionPrompt": string (a specific prompt for generating good subtasks),
    "reasoning": string (brief explanation of your assessment)
  },
  ...
]

IMPORTANT: Make sure to include an analysis for EVERY task listed above, with the correct taskId matching each task's ID.
`;
}

// Export AI service functions
export {
  getPerplexityClient,
  callClaude,
  handleStreamingRequest,
  generateSubtasks,
  generateSubtasksWithPerplexity,
  parseSubtasksFromText,
  generateComplexityAnalysisPrompt,
  handleOllamaError
}; 