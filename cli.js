#!/usr/bin/env node

import { Command } from 'commander';
import { version, registerCommands } from './index.js';

// This file serves as the entry point for the CLI command
// It is referenced in package.json under the "bin" field

// Create a new Commander program instance
const program = new Command();

// Set program metadata
program
  .name('task-master')
  .description('AI-powered CLI task management system')
  .version(version);

// Register all commands from the index.js module
registerCommands(program);

// Parse command line arguments
program.parse(process.argv); 