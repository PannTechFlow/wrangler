'use strict';
// OS-level keystroke automation: interrupt (Ctrl-C) + type text + Enter,
// and "refocus previous app" so a click on the tray doesn't steal focus.
//
// macOS: AppleScript "System Events" (needs Accessibility permission for the app).
// Windows: raw keybd_event via the user32.dll FFI (koffi).
// Linux: xdotool (must be installed separately).

const { execFile } = require('child_process');

const VK_CONTROL = 0x11;
const VK_RETURN = 0x0d;
const VK_C = 0x43;
const VK_MENU = 0x12; // Alt
const VK_TAB = 0x09;
const KEYUP = 0x0002;

let keybdEvent = null;
let vkKeyScanA = null;

function loadWin32() {
  if (process.platform !== 'win32') return;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    keybdEvent = user32.func(
      'void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)'
    );
    vkKeyScanA = user32.func('int16_t __stdcall VkKeyScanA(int ch)');
  } catch (err) {
    console.warn('wrangler: koffi unavailable, keystroke automation disabled on Windows:', err.message);
  }
}
loadWin32();

function tapVk(vk) {
  keybdEvent(vk, 0, 0, 0);
  keybdEvent(vk, 0, KEYUP, 0);
}

function tapCharWin32(ch) {
  const packed = vkKeyScanA(ch.charCodeAt(0));
  if (packed === -1) return;
  const vk = packed & 0xff;
  const shifted = (packed >> 8) & 1;
  if (shifted) keybdEvent(0x10, 0, 0, 0); // Shift down
  tapVk(vk);
  if (shifted) keybdEvent(0x10, 0, KEYUP, 0); // Shift up
}

function typeWin32(text, { interrupt }) {
  if (!keybdEvent || !vkKeyScanA) return;
  if (interrupt) {
    keybdEvent(VK_CONTROL, 0, 0, 0);
    tapVk(VK_C);
    keybdEvent(VK_CONTROL, 0, KEYUP, 0);
  }
  for (const ch of text) tapCharWin32(ch);
  tapVk(VK_RETURN);
}

function escapeForAppleScript(text) {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runAppleScript(script, label) {
  execFile('osascript', ['-e', script], (err) => {
    if (err) console.warn(`wrangler: ${label} failed (grant Accessibility access to Wrangler):`, err.message);
  });
}

function typeMac(text, { interrupt }) {
  const escaped = escapeForAppleScript(text);
  const typeScript = [
    'tell application "System Events"',
    `  keystroke "${escaped}"`,
    '  delay 0.25',
    '  key code 36', // Enter
    '  delay 0.15',
    'end tell',
  ].join('\n');

  if (!interrupt) {
    runAppleScript(typeScript, 'typing');
    return;
  }

  const interruptScript = [
    'tell application "System Events"',
    '  key code 8 using {control down}', // Ctrl+C
    'end tell',
  ].join('\n');
  execFile('osascript', ['-e', interruptScript], (err) => {
    if (err) {
      console.warn('wrangler: interrupt failed (grant Accessibility access to Wrangler):', err.message);
      return;
    }
    setTimeout(() => runAppleScript(typeScript, 'typing'), 300);
  });
}

function typeLinux(text, { interrupt }) {
  const args = interrupt ? ['key', '--clearmodifiers', 'ctrl+c'] : [];
  args.push('type', '--delay', '1', '--clearmodifiers', '--', text, 'key', 'Return');
  execFile('xdotool', args, (err) => {
    if (err) console.warn('wrangler: xdotool failed. Install it with your package manager:', err.message);
  });
}

/** Type `text` into whatever app has focus, optionally preceded by a Ctrl-C interrupt. */
function sendText(text, { interrupt = false } = {}) {
  if (process.platform === 'win32') typeWin32(text, { interrupt });
  else if (process.platform === 'darwin') typeMac(text, { interrupt });
  else if (process.platform === 'linux') typeLinux(text, { interrupt });
}

/** One Alt+Tab / Cmd+Tab so focus returns to the previously active app after a tray click. */
function refocusPreviousApp() {
  setTimeout(() => {
    if (process.platform === 'win32') {
      if (!keybdEvent) return;
      keybdEvent(VK_MENU, 0, 0, 0);
      tapVk(VK_TAB);
      keybdEvent(VK_MENU, 0, KEYUP, 0);
    } else if (process.platform === 'darwin') {
      runAppleScript(
        ['tell application "System Events"', '  key down command', '  key code 48', '  key up command', 'end tell'].join('\n'),
        'refocus previous app (Cmd+Tab)'
      );
    } else if (process.platform === 'linux') {
      execFile('xdotool', ['key', '--clearmodifiers', 'alt+Tab'], (err) => {
        if (err) console.warn('wrangler: refocus (Alt+Tab) failed. Install xdotool:', err.message);
      });
    }
  }, 80);
}

module.exports = { sendText, refocusPreviousApp };
