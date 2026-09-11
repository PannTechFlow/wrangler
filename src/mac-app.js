'use strict';
// macOS only: repackages the bundled Electron binary as "Wrangler.app" so the
// OS shows an app named Wrangler (with its own icon) instead of "Electron",
// and so Accessibility permission prompts are attributed to the right app.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP_NAME = 'Wrangler';
const BUNDLE_ID = 'com.agentwrangler.app';

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

function setPlistString(appPath, key, value) {
  run('plutil', ['-replace', key, '-string', value, path.join(appPath, 'Contents', 'Info.plist')]);
}

function isUpToDate(appPath, electronAppPath) {
  try {
    return fs.statSync(appPath).mtimeMs >= fs.statSync(electronAppPath).mtimeMs;
  } catch {
    return false;
  }
}

/** Builds (or reuses a cached) Wrangler.app next to the package, returns its path. */
function ensureMacApp(electronBinaryPath, packageRoot) {
  const electronAppPath = path.resolve(electronBinaryPath, '..', '..', '..');
  const appPath = path.join(packageRoot, `${APP_NAME}.app`);
  if (isUpToDate(appPath, electronAppPath)) return appPath;

  fs.rmSync(appPath, { recursive: true, force: true });
  run('cp', ['-Rc', electronAppPath, appPath]);

  const macosDir = path.join(appPath, 'Contents', 'MacOS');
  fs.renameSync(path.join(macosDir, 'Electron'), path.join(macosDir, APP_NAME));
  fs.copyFileSync(path.join(packageRoot, 'icon', 'AppIcon.icns'), path.join(appPath, 'Contents', 'Resources', 'electron.icns'));

  setPlistString(appPath, 'CFBundleName', APP_NAME);
  setPlistString(appPath, 'CFBundleDisplayName', APP_NAME);
  setPlistString(appPath, 'CFBundleExecutable', APP_NAME);
  setPlistString(appPath, 'CFBundleIdentifier', BUNDLE_ID);

  run('codesign', ['--force', '--deep', '--sign', '-', appPath]);
  run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', appPath]);
  fs.utimesSync(appPath, new Date(), new Date());
  return appPath;
}

module.exports = { ensureMacApp };
