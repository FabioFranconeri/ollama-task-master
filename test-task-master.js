#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';

console.log('Testing Task Master CLI');

// Define the paths to try
const paths = [
  './node_modules/.bin/task-master',
  'task-master',
  './cli.js',
  './index.js'
];

// Test each path
async function testPaths() {
  for (const cmd of paths) {
    console.log(`\nTrying to execute: ${cmd} --version`);
    
    try {
      const child = spawn(cmd, ['--version'], {
        stdio: 'inherit',
        shell: true
      });
      
      await new Promise((resolve) => {
        child.on('close', (code) => {
          console.log(`Exit code: ${code}`);
          resolve();
        });
      });
    } catch (err) {
      console.error(`Error executing ${cmd}:`, err.message);
    }
  }

  // Try direct execution from scripts folder
  console.log('\nTrying to execute: node ./scripts/dev.js --version');
  try {
    const child = spawn('node', ['./scripts/dev.js', '--version'], {
      stdio: 'inherit',
      shell: true
    });
    
    await new Promise((resolve) => {
      child.on('close', (code) => {
        console.log(`Exit code: ${code}`);
        resolve();
      });
    });
  } catch (err) {
    console.error('Error executing node ./scripts/dev.js:', err.message);
  }
}

testPaths(); 