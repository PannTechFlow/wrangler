'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, globalShortcut, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { sendText, refocusPreviousApp } = require('./src/keystroke');
const { randomWhipPhrase, randomKindPhrase } = require('./src/phrases');

const TOGGLE_SHORTCUT = 'Alt+Shift+W';
const PAT_SHORTCUT = 'Alt+Shift+P';

// Claude Code hooks (see ~/.claude/settings.json) write busy/idle status here;
// we poll it to auto-spawn the whip when a prompt has been running too long.
const CLAUDE_STATUS_FILE = path.join(os.homedir(), '.agent-wrangler', 'claude-status.json');
const SLOW_THRESHOLD_MS = Number(process.env.WRANGLER_SLOW_THRESHOLD_MS) || 20000;
// Kill switch for dev/testing: launching the real app auto-spawns a real,
// screen-covering overlay that captures real clicks and sends real Ctrl-C +
// keystrokes to whatever's focused. Set this when iterating on the app itself.
const AUTO_TRIGGER_DISABLED = process.env.WRANGLER_DISABLE_AUTOTRIGGER === '1';
let autoTriggeredForThisBusySpan = false;

let tray = null;
let overlay = null;
let overlayReady = false;
let readyAt = 0;

// ── Ambient tray status: icon badge reflects Claude's busy/idle state ───────
const DONE_FLASH_MS = 4000; // how long the "just finished" badge stays up
let trayIcons = null; // { idle, busy, done } | null when unsupported (win32)
let trayStatusKind = 'idle';
let wasBusy = false;
let doneUntil = 0;
let defaultTooltip = '';

// A toggle can arrive before the overlay window has finished loading; queue it.
let pendingSpawn = null; // { kind, refocus } | null
let lastKind = 'whip';

// ── Tray icon ────────────────────────────────────────────────────────────────

function loadTemplateIcon() {
  const file = path.join(__dirname, 'icon', 'Template.png');
  if (!fs.existsSync(file)) {
    console.warn('wrangler: icon/Template.png missing');
    return nativeImage.createEmpty();
  }
  const img = nativeImage.createFromPath(file);
  if (process.platform === 'darwin') img.setTemplateImage(true);
  return img;
}

async function getTrayIcon() {
  // macOS: always the template mark (icon/Template.png) — a template image
  // lets the OS recolor it automatically for the light/dark menu bar.
  if (process.platform === 'darwin') return loadTemplateIcon();
  if (process.platform === 'win32') {
    const icoPath = path.join(__dirname, 'icon', 'icon.ico');
    if (fs.existsSync(icoPath)) {
      const img = nativeImage.createFromPath(icoPath);
      if (!img.isEmpty()) return img;
    }
  }
  return loadTemplateIcon();
}

/**
 * Loads the busy/done badge variants for the ambient tray status (a colored
 * dot composited onto Template.png at build time — see icon/Tray-Busy.png,
 * icon/Tray-Done.png). Skipped on win32, whose tray icon (icon.ico) is a
 * different base image the badge wouldn't align with.
 */
function loadTrayStatusIcons(idleIcon) {
  if (process.platform === 'win32') return null;
  const busyPath = path.join(__dirname, 'icon', 'Tray-Busy.png');
  const donePath = path.join(__dirname, 'icon', 'Tray-Done.png');
  if (!fs.existsSync(busyPath) || !fs.existsSync(donePath)) return null;
  let busy = nativeImage.createFromPath(busyPath);
  let done = nativeImage.createFromPath(donePath);
  if (process.platform === 'darwin') {
    busy = busy.resize({ width: 18, height: 18 });
    done = done.resize({ width: 18, height: 18 });
  }
  return { idle: idleIcon, busy, done };
}

/** Switches the tray icon between idle/busy/done, skipping redundant updates. */
function setTrayStatus(kind) {
  if (!trayIcons || !tray || trayStatusKind === kind) return;
  trayStatusKind = kind;
  tray.setImage(trayIcons[kind]);
}

// ── Overlay window ───────────────────────────────────────────────────────────

function cursorDisplayBounds() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
}

function createOverlay(bounds) {
  overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true);
  overlayReady = false;
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));

  overlay.webContents.on('did-finish-load', () => {
    overlayReady = true;
    if (pendingSpawn && overlay && overlay.isVisible()) {
      const { kind, refocus, opts } = pendingSpawn;
      pendingSpawn = null;
      overlay.webContents.send(kind === 'pat' ? 'spawn-hand' : 'spawn-whip', kind === 'pat' ? undefined : { fromLeft: !!(opts && opts.fromLeft) });
      if (refocus) refocusPreviousApp();
    }
  });
  overlay.on('closed', () => {
    overlay = null;
    overlayReady = false;
    pendingSpawn = null;
  });
}

/** Show the overlay in the given mode, already attached to the current cursor position. */
function showOverlay(kind, refocus, opts = {}) {
  lastKind = kind;
  const bounds = cursorDisplayBounds();
  if (!overlay) createOverlay(bounds);
  else overlay.setBounds(bounds);
  if (!overlay.isVisible()) overlay.showInactive();

  if (overlayReady) {
    overlay.webContents.send(kind === 'pat' ? 'spawn-hand' : 'spawn-whip', kind === 'pat' ? undefined : { fromLeft: !!opts.fromLeft });
    if (refocus) refocusPreviousApp();
  } else {
    pendingSpawn = { kind, refocus, opts };
  }
}

/** Starts the drop animation on whatever's currently out (no-op if nothing is). */
function dropOverlay() {
  if (overlay && overlay.isVisible()) overlay.webContents.send('drop-whip');
}

/** Keyboard-shortcut entry point: show if hidden, drop if already out. */
function toggleOverlay(refocus = false, kind = lastKind) {
  if (overlay && overlay.isVisible()) dropOverlay();
  else showOverlay(kind, refocus);
}

// ── Auto-trigger when Claude Code is slow ───────────────────────────────────

/** Polls the status file Claude Code hooks write to; auto-whips once per slow prompt. */
function pollClaudeStatus() {
  fs.readFile(CLAUDE_STATUS_FILE, 'utf8', (err, data) => {
    if (err) return;
    let status;
    try { status = JSON.parse(data); } catch { return; }
    const busy = status.status === 'busy';
    const since = Number(status.since || 0);

    if (busy) {
      wasBusy = true;
      setTrayStatus('busy');
      tray?.setToolTip(`Wrangler — Claude's been at it for ${Math.round((Date.now() - since) / 1000)}s`);
    } else {
      if (wasBusy) { wasBusy = false; doneUntil = Date.now() + DONE_FLASH_MS; }
      if (Date.now() < doneUntil) {
        setTrayStatus('done');
      } else {
        setTrayStatus('idle');
        tray?.setToolTip(defaultTooltip);
      }
    }

    if (!busy) {
      autoTriggeredForThisBusySpan = false;
      return;
    }
    if (AUTO_TRIGGER_DISABLED) return;
    if (autoTriggeredForThisBusySpan) return;
    if (Date.now() - since < SLOW_THRESHOLD_MS) return;
    autoTriggeredForThisBusySpan = true;
    if (!(overlay && overlay.isVisible())) showOverlay('whip', false, { fromLeft: true });
  });
}

// ── IPC from the overlay ─────────────────────────────────────────────────────

ipcMain.on('hide-overlay', () => overlay?.hide());
ipcMain.on('mode-changed', (_e, mode) => { lastKind = mode === 'pat' ? 'pat' : 'whip'; });

ipcMain.on('whip-crack', () => {
  const phrase = randomWhipPhrase();
  overlay?.webContents.send('crack-phrase', phrase, 'whip');
  try {
    sendText(phrase, { interrupt: true });
  } catch (err) {
    console.warn('wrangler: whip-crack keystroke failed:', err.message);
  }
});

ipcMain.on('hand-pat', () => {
  const phrase = randomKindPhrase();
  overlay?.webContents.send('crack-phrase', phrase, 'pat');
  try {
    sendText(phrase, { interrupt: false });
  } catch (err) {
    console.warn('wrangler: hand-pat keystroke failed:', err.message);
  }
});

// ── App lifecycle ────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const kind = argv.includes('pat') ? 'pat' : argv.includes('whip') ? 'whip' : lastKind;
    toggleOverlay(false, kind);
  });
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    systemPreferences.isTrustedAccessibilityClient(true);
    app.dock.hide(); // menu-bar only — no Dock icon, no Cmd+Tab entry
  }
  readyAt = Date.now();

  const icon = await getTrayIcon();
  const idleIcon = process.platform === 'darwin' ? icon.resize({ width: 18, height: 18 }) : icon;
  tray = new Tray(idleIcon);
  trayIcons = loadTrayStatusIcons(idleIcon);
  const hint = process.platform === 'darwin' ? 'hold to whip' : `click or ${TOGGLE_SHORTCUT}`;
  defaultTooltip = `Wrangler — ${hint}; right-click for more, scroll on the overlay to switch whip/pat`;
  tray.setToolTip(defaultTooltip);

  const modeMenuItems = [
    { label: `Whip (${TOGGLE_SHORTCUT})`, click: () => toggleOverlay(true, 'whip') },
    { label: `Pat on the shoulder (${PAT_SHORTCUT})`, click: () => toggleOverlay(true, 'pat') },
  ];
  const trayMenu = Menu.buildFromTemplate([...modeMenuItems, { type: 'separator' }, { label: 'Quit', click: () => app.quit() }]);

  if (process.platform === 'darwin') {
    // Press-and-hold: the whip appears already attached to the cursor on
    // mouse-down and drops the instant you let go — no separate summon click.
    tray.on('mouse-down', () => showOverlay('whip', true));
    tray.on('mouse-up', () => dropOverlay());
  } else {
    tray.on('click', () => toggleOverlay(true));
  }
  tray.on('right-click', () => tray.popUpContextMenu(trayMenu));

  if (!globalShortcut.register(TOGGLE_SHORTCUT, () => toggleOverlay(false, 'whip'))) {
    console.warn(`wrangler: could not register shortcut ${TOGGLE_SHORTCUT}`);
  }
  if (!globalShortcut.register(PAT_SHORTCUT, () => toggleOverlay(false, 'pat'))) {
    console.warn(`wrangler: could not register shortcut ${PAT_SHORTCUT}`);
  }

  setInterval(pollClaudeStatus, 1000);
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep alive in tray
app.on('activate', () => {
  if (overlay && overlay.isVisible()) return;
  if (Date.now() - readyAt > 1000) toggleOverlay(true);
});
