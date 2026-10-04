'use strict';

// Recorded reactions for whip hits, punch-the-boss-toy style. Drop audio clips
// into sounds/whimpers/ named by intensity: 1-* (whimper), 2-* (yelp),
// 3-* (scream). Rapid hits escalate; a pause calms it back down to 1.

const path = require('path');
const fs = require('fs');

const CLIP_DIR = path.join(__dirname, '..', 'sounds', 'whimpers');
const CLIP_EXT = /\.(mp3|wav|m4a|ogg)$/i;
const STREAK_MS = 2500;
const MAX_LEVEL = 3;

let streak = 0;
let lastHitAt = 0;

/** Re-read on every hit so new clips work without a restart. */
function listClips() {
  try {
    return fs.readdirSync(CLIP_DIR).filter((f) => CLIP_EXT.test(f));
  } catch {
    return [];
  }
}

/**
 * Registers a hit and returns a clip URL (relative to renderer/) for the
 * current intensity, falling back to quieter levels, then to any clip.
 * Null when the folder has no clips.
 */
function nextHitClip() {
  const now = Date.now();
  streak = now - lastHitAt < STREAK_MS ? streak + 1 : 1;
  lastHitAt = now;

  const clips = listClips();
  for (let level = Math.min(streak, MAX_LEVEL); level >= 1; level--) {
    const matches = clips.filter((f) => f.startsWith(`${level}-`));
    if (matches.length) return toUrl(matches);
  }
  return clips.length ? toUrl(clips) : null;
}

function toUrl(clips) {
  const name = clips[Math.floor(Math.random() * clips.length)];
  return `../sounds/whimpers/${encodeURIComponent(name)}`;
}

module.exports = { nextHitClip };
