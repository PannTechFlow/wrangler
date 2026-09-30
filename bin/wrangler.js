#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawn } = require('child_process');

const command = process.argv[2];
if (command === 'install-hooks' || command === 'uninstall-hooks') {
  const { installHooks, uninstallHooks } = require('../src/hooks');
  try {
    const file = command === 'install-hooks' ? installHooks() : uninstallHooks();
    const verb = command === 'install-hooks' ? 'Added' : 'Removed';
    console.log(`${verb} Wrangler's Claude Code hooks in ${file} (backup: ${file}.wrangler-backup)`);
    if (command === 'install-hooks') console.log('Restart any running Claude Code sessions to pick them up.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  process.exit(0);
}

let electronBinary;
try {
  electronBinary = require('electron');
} catch (err) {
  console.error('Could not load Electron. Try: npm install');
  process.exit(1);
}

const appPath = path.resolve(__dirname, '..');
const extraArgs = process.argv.slice(2); // "whip" or "pat" to pick a starting mode

const spawnOpts = { detached: true, stdio: 'ignore', windowsHide: true };
let child;
if (process.platform === 'darwin') {
  const { ensureMacApp } = require('../src/mac-app');
  child = spawn('open', ['-n', ensureMacApp(electronBinary, appPath), '--args', appPath, ...extraArgs], spawnOpts);
} else {
  child = spawn(electronBinary, [appPath, ...extraArgs], spawnOpts);
}

child.on('error', (err) => {
  console.error('Failed to start wrangler:', err.message);
  process.exit(1);
});

child.unref();
