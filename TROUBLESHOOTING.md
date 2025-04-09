# Task Master CLI Troubleshooting Guide

## Common Installation Issues

### Global Installation Fails with Husky Error

**Problem**: When installing the package globally with `npm install -g .`, the installation fails with an error related to husky.

**Solution**: The package.json has been updated to skip husky installation when installed globally. If you encounter this issue, update your package.json "prepare" script to:

```json
"prepare": "node -e \"try { if(process.env.npm_config_global !== 'true') { require('fs').statSync('./node_modules/husky'); require('child_process').spawnSync('npx', ['husky', 'install'], { stdio: 'inherit' }); } } catch(e) { console.log('Skipping husky install'); }\""
```

### Missing Dependencies

**Problem**: Commands fail with errors about missing modules like `boxen` or `gradient-string`.

**Solution**: Install the missing dependencies:

```bash
npm install --save boxen gradient-string
```

### Command Not Found After Global Installation

**Problem**: After installing globally, the `task-master` command is not found.

**Solution**: 

1. Make sure npm's global bin directory is in your PATH.
2. Try using the full path to the command: `%APPDATA%\npm\task-master` (Windows) or `~/.npm-global/bin/task-master` (Linux/Mac).
3. Re-install globally: `npm install -g .`

## Running Issues

### Commands Not Found

**Problem**: The CLI reports "unknown command" for valid commands like `list` or `next`.

**Solution**: The CLI may not have all commands properly registered. Check that cli.js is properly importing and using the registerCommands function from index.js:

```javascript
#!/usr/bin/env node

import { Command } from 'commander';
import { version, registerCommands } from './index.js';

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
```

### Module Not Found Errors

**Problem**: When running commands, you get "Cannot find module" errors.

**Solution**: Double check your package.json dependencies and make sure all required packages are installed:

```bash
npm install
```

## Cross-Platform Compatibility

### Windows Path Issues

**Problem**: Commands fail on Windows with path-related errors.

**Solution**: Make sure to use path.join() or path.resolve() for file paths in the code to handle different operating system path formats. For CLI scripts, use cross-platform shebang:

```javascript
#!/usr/bin/env node
```

### Line Ending Issues

**Problem**: Scripts fail with syntax errors on different platforms.

**Solution**: Make sure your `.gitattributes` file includes proper line ending normalization:

```
* text=auto eol=lf
```

## Environment Variables

**Problem**: Configuration values are not being picked up correctly.

**Solution**: Check that your .env file is properly formatted and loaded. Use the dotenv package and ensure it's loaded early in your application:

```javascript
import dotenv from 'dotenv';
dotenv.config();
``` 