'use strict';

// User settings, persisted to ~/.agent-wrangler/config.json so they work for
// installer builds too (apps launched from a .dmg/.exe never see env vars).
// Env vars still win at startup, for dev/testing.

const path = require('path');
const fs = require('fs');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.agent-wrangler');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  autoTrigger: true,
  slowThresholdMs: 20000,
  voice: true,
};

function readFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Defaults, overlaid with config.json, overlaid with env vars. */
function loadConfig() {
  const config = { ...DEFAULTS, ...readFile() };
  const envThreshold = Number(process.env.WRANGLER_SLOW_THRESHOLD_MS);
  if (envThreshold > 0) config.slowThresholdMs = envThreshold;
  if (process.env.WRANGLER_DISABLE_AUTOTRIGGER === '1') config.autoTrigger = false;
  return config;
}

/** Merges `changes` into config.json, keeping any keys we don't know about. */
function saveConfig(changes) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...readFile(), ...changes }, null, 2) + '\n');
  } catch (err) {
    console.warn('wrangler: could not save config:', err.message);
  }
}

module.exports = { loadConfig, saveConfig, CONFIG_FILE };
