#!/usr/bin/env node

// This script fixes the missing boxen module error for scripts/modules/commands.js

import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';

const execAsync = promisify(exec);

async function installMissingModules() {
  console.log('Installing missing modules...');
  
  try {
    // Install boxen which is missing
    console.log('Installing boxen...');
    await execAsync('npm install --save boxen');
    
    console.log('Successfully installed missing modules!');
  } catch (error) {
    console.error('Error installing modules:', error.message);
  }
}

installMissingModules(); 