'use strict';
// App shell: input handling, mode switching, the top-level draw dispatcher,
// the fixed-timestep main loop, and IPC wiring to the main process.
// Depends on state.js, whip.js, hand.js.

// ── Input ────────────────────────────────────────────────────────────────
document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
document.addEventListener('contextmenu', (e) => e.preventDefault());

let lastSwapTime = 0;
function swapMode() {
  if (Date.now() - lastSwapTime < 800) return;
  lastSwapTime = Date.now();
  if (mode === 'pat') enterWhip();
  else enterPat();
  window.bridge.modeChanged(mode);
}
document.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) + Math.abs(e.deltaX) > 4) swapMode(); }, { passive: true });

document.addEventListener('mousedown', (e) => {
  if (e.button === 1) { swapMode(); return; } // middle click: swap mode
  if (mode === 'pat') {
    if (!hand || hand.leaving) return;
    if (e.button === 2) { hand.leaving = true; hand.leaveT = Date.now(); return; } // right click: wave goodbye
    pat();
    return;
  }
  if (!whip || dropping) return;
  if (e.button === 2) { dropping = true; return; } // right click: drop whip
  if (Date.now() - lastFastTime <= P.strikeWindowMs) strike();
});

// ── Mode entry points, driven by IPC from the main process ────────────────
function enterWhip(opts) {
  mode = 'whip';
  hand = null;
  hearts = [];
  resize();
  const targetX = mouseX || W / 2;
  const targetY = mouseY || H / 2;
  // Auto-triggered (Claude's slow) spawns slide in from off-screen left instead
  // of appearing at the cursor; manual spawns keep the usual cursor-attach.
  const startX = opts && opts.fromLeft ? -80 : targetX;
  handX = prevHandX = startX;
  handY = prevHandY = targetY;
  whip = spawnWhip(startX, targetY);
  dropping = false;
  prevMouseX = mouseX;
  prevMouseY = mouseY;
  handleAngle = P.baseTargetAngle;
  handleAngVel = 0;
}

function enterPat() {
  resize();
  mode = 'pat';
  whip = null;
  dropping = false;
  hand = { x: mouseX || W / 2, y: mouseY || H / 2, vx: 0, vy: 0, press: 0, bob: 0, leaving: false, leaveT: 0 };
}

window.bridge.onSpawnWhip(enterWhip);
window.bridge.onSpawnHand(enterPat);
window.bridge.onDropWhip(() => {
  if (mode === 'pat') {
    if (hand && !hand.leaving) { hand.leaving = true; hand.leaveT = Date.now(); }
    return;
  }
  if (whip && !dropping) dropping = true;
});
window.bridge.onCrackPhrase((text, kind) => { phrase = { text, kind: kind || 'whip', t: Date.now() }; });

// ── Update / draw ───────────────────────────────────────────────────────
function update() {
  if (mode === 'pat') { updateHand(); updateFx(); return; }
  updateWhip();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  renderWhip = whip ? whip.map((p) => ({ x: lerp(p.rx ?? p.x, p.x, renderAlpha), y: lerp(p.ry ?? p.y, p.y, renderAlpha) })) : null;

  // Near-invisible fill so the window still captures mouse events on Windows.
  ctx.fillStyle = `rgba(0,0,0,${P.bgAlpha})`;
  ctx.fillRect(0, 0, W, H);

  if (mode === 'pat') {
    drawHand();
    drawFx();
    drawPatHud();
    return;
  }
  drawHud();
  drawFx();
  if (whip) drawWhip();
}

// ── Fixed-timestep main loop ────────────────────────────────────────────
let simAccumulator = 0;
let lastFrameTime = performance.now();
function loop(now) {
  if (!P.simHz) {
    update();
  } else {
    const step = 1000 / P.simHz;
    simAccumulator = Math.min(simAccumulator + (now - lastFrameTime), step * 4);
    while (simAccumulator >= step) {
      update();
      simAccumulator -= step;
    }
    renderAlpha = clamp(simAccumulator / step, 0, 1);
  }
  lastFrameTime = now;
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
