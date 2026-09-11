'use strict';
// Shared canvas, tunable physics/visual settings, mutable simulation state,
// and small math/geometry helpers used across whip.js, hand.js and app.js.
// Loaded first so everything below can rely on it.

// ══════════════════════════════════════════════════════════════════════════
//  SETTINGS — tweak the feel of the whip and pat mode here
// ══════════════════════════════════════════════════════════════════════════
const P = {
  // Rope structure
  segments: 36, // number of chain links
  segmentLength: 25, // base length of each link (px)
  taper: 0.6, // tip segment is this fraction of base length

  // Physics
  gravity: 2.0,
  dropGravity: 2.6, // gravity while dropping/despawning
  damping: 0.94, // velocity retention per frame (1 = no loss)
  restDamping: 0.8, // damping while the hand is still, so the whip settles
  restHandSpeed: 0.6, // hand speed (px/frame) under which the whip is "at rest"
  restLinkSpeed: 6, // only links slower than this get rest damping, so falls stay fast
  sleepSpeed: 0.03, // velocities below this are zeroed
  constraintIters: 20, // higher = stiffer chain
  maxStretchRatio: 1.2, // hard cap for per-link stretch during fast whips

  // Dynamic handle aim (target angle + restoring spring, not a static lock)
  baseTargetAngle: -1.12, // radians, resting direction when facing right (mirrored when facing left)
  facingFlipSpeed: 4.5, // horizontal hand speed (px/step) that flips which way the handle leans
  handleAimByMouseX: 0.25,
  handleAimByMouseY: 0.12,
  handleAimClamp: 1.4, // max radians target can deviate from base angle
  handleSpring: 0.35, // restoring force toward target angle
  handleAngularDamping: 0.5, // angular velocity retained per step
  basePoseSegments: 2, // how many early segments are strongly guided
  basePoseStiffStart: 0.9,
  basePoseStiffEnd: 0.8,

  // Elastic bend limits by chain position (handle stiff, tip floppy)
  handleMaxBendDeg: 60,
  tipMaxBendDeg: 45, // low = no tangles
  bendRigidityStart: 0.85,
  bendRigidityEnd: 0.65,

  // Screen-edge slap
  wallBounce: 0.42,
  wallFriction: 0.86,

  // Crack / strike detection
  crackSpeed: 340, // tip speed (px/frame) that triggers a crack
  crackLinks: 2, // trailing links whose speed counts toward a crack
  strikeSpeed: 180, // tip speed that "arms" a click to type
  strikeWindowMs: 300, // how long after a fast tip a click still counts
  substeps: 2, // physics sub-steps per simulation step
  simHz: 60, // fixed simulation rate; 0 = one step per rendered frame
  handSmoothing: 0.55, // how fast the handle follows the mouse (1 = instant)
  crackCooldownMs: 450,
  firstCrackGraceMs: 350, // no crack (macro) until this long after spawn

  // Visuals
  lineWidthHandle: 7,
  lineWidthTip: 5,
  outlineWidth: 3,
  handleExtraWidth: 5,
  handleThickSegments: 2,
  bgAlpha: 0.011, // barely-visible bg so the window still captures mouse events

  // Mass taper + air drag (heavier handle, light fast tip)
  tipMass: 0.25,
  airDrag: 0.0003,
  maxAirDrag: 0.12,

  // Crack FX
  trailLength: 12,
  trailMinSpeed: 40,
  sparkCount: 22,
  phraseMs: 1600,

  // Initial arc shape
  arcWidth: 260,
  arcHeight: 185,
};

// ══════════════════════════════════════════════════════════════════════════
//  Canvas
// ══════════════════════════════════════════════════════════════════════════
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H;
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ══════════════════════════════════════════════════════════════════════════
//  Mutable simulation state
// ══════════════════════════════════════════════════════════════════════════
let mouseX = 0, mouseY = 0;
let prevMouseX = 0, prevMouseY = 0;
let handX = 0, handY = 0;
let prevHandX = 0, prevHandY = 0;

let mode = 'whip'; // 'whip' | 'pat'
let whip = null;
let dropping = false;
let lastCrackTime = 0;
let lastFastTime = 0;
let whipSpawnTime = 0;
let handleAngle = P.baseTargetAngle;
let handleAngVel = 0;
let facing = 1;

let hand = null;
let hearts = [];
let pats = 0;

let trail = [];
let sparks = [];
let rings = [];
let phrase = null;
let renderWhip = null;
let renderAlpha = 1;

const WHIP_CRACK_SOUNDS = ['../sounds/A.mp3', '../sounds/B.mp3', '../sounds/C.mp3', '../sounds/D.mp3', '../sounds/E.mp3'];
function playCrackSound() {
  const src = WHIP_CRACK_SOUNDS[Math.floor(Math.random() * WHIP_CRACK_SOUNDS.length)];
  new Audio(src).play().catch(() => {});
}

// ══════════════════════════════════════════════════════════════════════════
//  Math / geometry helpers
// ══════════════════════════════════════════════════════════════════════════
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

function speedScale() {
  return Math.min(1, Math.min(W, H) / 1080);
}
function segMass(i) {
  return lerp(1, P.tipMass, i / (P.segments - 1));
}
function segLen(i) {
  const t = i / (P.segments - 1);
  return P.segmentLength * (1 - t * (1 - P.taper));
}

/** Point on a Catmull–Rom spline (extrapolated past the ends) for index i in `pts`. */
function catmullPoint(pts, i) {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  if (i < 0) {
    if (n >= 2) return { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y };
    return { x: pts[0].x, y: pts[0].y };
  }
  if (i >= n) {
    if (n >= 2) {
      const a = pts[n - 2], b = pts[n - 1];
      return { x: 2 * b.x - a.x, y: 2 * b.y - a.y };
    }
    return { x: pts[n - 1].x, y: pts[n - 1].y };
  }
  return pts[i];
}

/**
 * Cubic Bézier from p1→p2 matching a uniform Catmull–Rom through p0,p1,p2,p3.
 * Control points: C1 = p1 + (p2-p0)/6, C2 = p2 - (p3-p1)/6.
 */
function whipSegmentBezier(pts, i) {
  const p0 = catmullPoint(pts, i - 1);
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = catmullPoint(pts, i + 2);
  return {
    cp1x: p1.x + (p2.x - p0.x) / 6,
    cp1y: p1.y + (p2.y - p0.y) / 6,
    cp2x: p2.x - (p3.x - p1.x) / 6,
    cp2y: p2.y - (p3.y - p1.y) / 6,
    x2: p2.x,
    y2: p2.y,
  };
}

/** Small HUD label in the bottom-right, used by both the whip and pat HUDs. */
function drawSwapHint(text, y) {
  ctx.font = '600 13px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(text, W - 28, y);
  ctx.fillText(text, W - 28, y);
}
