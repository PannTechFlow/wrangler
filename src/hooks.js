'use strict';

// `agentwrangler install-hooks` / `uninstall-hooks`: merges the busy/idle
// status hooks into ~/.claude/settings.json so nobody has to hand-edit JSON.

const path = require('path');
const fs = require('fs');
const os = require('os');

const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const MARKER = '.agent-wrangler/claude-status.json'; // identifies our hook entries

const HOOK_COMMANDS = {
  UserPromptSubmit: `mkdir -p ~/.agent-wrangler && printf '{"status":"busy","since":%s}' "$(date +%s000)" > ~/${MARKER}`,
  Stop: `mkdir -p ~/.agent-wrangler && printf '{"status":"idle"}' > ~/${MARKER}`,
};

const isOurs = (group) => (group.hooks || []).some((h) => typeof h.command === 'string' && h.command.includes(MARKER));

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return {};
  const text = fs.readFileSync(SETTINGS_FILE, 'utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${SETTINGS_FILE} isn't valid JSON (${err.message}) — fix it first, nothing was changed.`);
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  if (fs.existsSync(SETTINGS_FILE)) fs.copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.wrangler-backup`);
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
}

/** Drops any existing Wrangler hook groups, so install is idempotent. */
function withoutOurs(settings) {
  const hooks = { ...(settings.hooks || {}) };
  for (const event of Object.keys(HOOK_COMMANDS)) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = hooks[event].filter((group) => !isOurs(group));
    if (hooks[event].length === 0) delete hooks[event];
  }
  return hooks;
}

function installHooks() {
  const settings = readSettings();
  const hooks = withoutOurs(settings);
  for (const [event, command] of Object.entries(HOOK_COMMANDS)) {
    hooks[event] = [...(hooks[event] || []), { hooks: [{ type: 'command', command }] }];
  }
  writeSettings({ ...settings, hooks });
  return SETTINGS_FILE;
}

function uninstallHooks() {
  const settings = readSettings();
  const hooks = withoutOurs(settings);
  const next = { ...settings, hooks };
  if (Object.keys(hooks).length === 0) delete next.hooks;
  writeSettings(next);
  return SETTINGS_FILE;
}

module.exports = { installHooks, uninstallHooks };
