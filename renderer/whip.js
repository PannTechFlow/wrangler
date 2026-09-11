'use strict';
// The whip itself: verlet-integrated rope physics, crack detection, and the
// spark/trail/phrase FX a crack triggers. Depends on state.js.

// ── Creation ─────────────────────────────────────────────────────────────
function spawnWhip(mx, my) {
  dropping = false;
  lastCrackTime = 0;
  whipSpawnTime = Date.now();
  const pts = [];
  for (let i = 0; i < P.segments; i++) {
    const t = i / (P.segments - 1);
    // Nice upward arc from handle (mouse) to tip.
    const x = mx + t * P.arcWidth;
    const y = my - Math.sin(t * Math.PI * 0.75) * P.arcHeight;
    pts.push({ x, y, px: x, py: y });
  }
  return pts;
}

// ── Constraint helpers ───────────────────────────────────────────────────
function updateHandleAim() {
  if (dropping) return;
  const mvx = handX - prevHandX;
  const mvy = handY - prevHandY;
  if (Math.abs(mvx) > P.facingFlipSpeed) facing = mvx > 0 ? 1 : -1;
  const base = facing > 0 ? P.baseTargetAngle : -Math.PI - P.baseTargetAngle;
  const delta = clamp(mvx * P.handleAimByMouseX + mvy * P.handleAimByMouseY * facing, -P.handleAimClamp, P.handleAimClamp);
  const target = base + delta;
  const err = wrapPi(target - handleAngle);
  handleAngVel += err * P.handleSpring;
  handleAngVel *= P.handleAngularDamping;
  handleAngle = wrapPi(handleAngle + handleAngVel);
}

function applyBasePose() {
  if (!whip || dropping) return;
  const dx = Math.cos(handleAngle);
  const dy = Math.sin(handleAngle);
  const guided = Math.min(P.basePoseSegments, whip.length - 1);
  for (let i = 1; i <= guided; i++) {
    const t = (i - 1) / Math.max(guided - 1, 1);
    const stiff = lerp(P.basePoseStiffStart, P.basePoseStiffEnd, t);
    const prev = whip[i - 1];
    const p = whip[i];
    const targetLen = segLen(i - 1);
    p.x = lerp(p.x, prev.x + dx * targetLen, stiff);
    p.y = lerp(p.y, prev.y + dy * targetLen, stiff);
  }
}

function applyBendLimits() {
  if (!whip || whip.length < 3) return;
  for (let i = 1; i < whip.length - 1; i++) {
    const a = whip[i - 1], b = whip[i], c = whip[i + 1];
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y) || 0.0001;
    const l2 = Math.hypot(v2x, v2y) || 0.0001;
    const n1x = v1x / l1, n1y = v1y / l1;
    const n2x = v2x / l2, n2y = v2y / l2;

    const dot = clamp(n1x * n2x + n1y * n2y, -1, 1);
    const angle = Math.acos(dot);
    const t = i / (whip.length - 2);
    const maxBend = (lerp(P.handleMaxBendDeg, P.tipMaxBendDeg, t) * Math.PI) / 180;
    const bend = Math.PI - angle; // bend away from a straight line
    if (bend <= maxBend) continue;

    // Clamp to max bend while preserving the side/sign of the bend.
    const cross = n1x * n2y - n1y * n2x;
    const sign = cross >= 0 ? 1 : -1;
    const targetAngle = Math.PI - maxBend;
    const targetA = Math.atan2(n1y, n1x) + sign * targetAngle;
    const rigidity = lerp(P.bendRigidityStart, P.bendRigidityEnd, t);
    c.x = lerp(c.x, b.x + Math.cos(targetA) * l2, rigidity);
    c.y = lerp(c.y, b.y + Math.sin(targetA) * l2, rigidity);
  }
}

function capSegmentStretch() {
  if (!whip || whip.length < 2) return;
  for (let i = 0; i < whip.length - 1; i++) {
    const a = whip[i], b = whip[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const maxLen = segLen(i) * P.maxStretchRatio;
    if (dist <= maxLen) continue;
    const k = maxLen / dist;
    b.x = a.x + dx * k;
    b.y = a.y + dy * k;
  }
}

function applyWallCollisions() {
  if (!whip || dropping) return; // disable collisions while dropping
  for (let i = 1; i < whip.length; i++) { // i=0 (handle) stays pinned
    const p = whip[i];
    let vx = p.x - p.px, vy = p.y - p.py;
    let hit = false;

    if (p.x < 0) { p.x = 0; if (vx < 0) vx = -vx * P.wallBounce; vy *= P.wallFriction; hit = true; }
    else if (p.x > W) { p.x = W; if (vx > 0) vx = -vx * P.wallBounce; vy *= P.wallFriction; hit = true; }

    if (p.y < 0) { p.y = 0; if (vy < 0) vy = -vy * P.wallBounce; vx *= P.wallFriction; hit = true; }
    else if (p.y > H) { p.y = H; if (vy > 0) vy = -vy * P.wallBounce; vx *= P.wallFriction; hit = true; }

    if (hit) { p.px = p.x - vx; p.py = p.y - vy; }
  }
}

// ── Physics step ─────────────────────────────────────────────────────────
function integrate(hx, hy, N) {
  const g = (dropping ? P.dropGravity : P.gravity) / (N * N);
  const handSpeed = Math.hypot(handX - prevHandX, handY - prevHandY);
  const handMix = dropping ? 1 : clamp(handSpeed / (P.restHandSpeed * 2), 0, 1);
  const damp = Math.pow(P.damping, 1 / N);
  const restDamp = Math.pow(P.restDamping, 1 / N);
  const start = dropping ? 0 : 1;

  for (let i = start; i < whip.length; i++) {
    const p = whip[i];
    const linkMix = clamp((Math.hypot(p.x - p.px, p.y - p.py) * N) / P.restLinkSpeed, 0, 1);
    const d = lerp(restDamp, damp, Math.max(handMix, linkMix));
    let vx = (p.x - p.px) * d;
    let vy = (p.y - p.py) * d;
    const drag = 1 - Math.min(P.maxAirDrag, P.airDrag * Math.hypot(vx, vy) * N) / N;
    vx *= drag;
    vy *= drag;
    if (Math.abs(vx) < P.sleepSpeed) vx = 0;
    if (Math.abs(vy) < P.sleepSpeed) vy = 0;
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy + g;
  }

  if (!dropping) {
    whip[0].x = hx; whip[0].y = hy;
    whip[0].px = hx; whip[0].py = hy;
  }

  capSegmentStretch();
  applyWallCollisions();
  applyBasePose();

  const iters = Math.max(1, Math.round(P.constraintIters / N));
  for (let iter = 0; iter < iters; iter++) {
    for (let i = 0; i < whip.length - 1; i++) {
      const a = whip[i], b = whip[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      const diff = ((dist - segLen(i)) / dist) * 0.5;
      const ox = dx * diff, oy = dy * diff;
      if (i === 0 && !dropping) {
        // Handle is pinned to the hand — only the next link moves.
        b.x -= ox * 2; b.y -= oy * 2;
      } else {
        const wa = segMass(i + 1) / (segMass(i) + segMass(i + 1));
        a.x += ox * 2 * wa; a.y += oy * 2 * wa;
        b.x -= ox * 2 * (1 - wa); b.y -= oy * 2 * (1 - wa);
      }
    }
    applyBendLimits();
    if (!dropping) applyBasePose();
    capSegmentStretch();
    applyWallCollisions();
  }
}

function tipSpeed(N) {
  let best = 0;
  for (let i = Math.max(1, whip.length - P.crackLinks); i < whip.length; i++) {
    const p = whip[i];
    best = Math.max(best, Math.hypot(p.x - p.px, p.y - p.py) * N);
  }
  return best;
}

/** One whip-mode simulation step: hand smoothing, substeps, crack/strike detection. */
function updateWhip() {
  if (!whip) return;
  for (const p of whip) { p.rx = p.x; p.ry = p.y; }

  const N = P.substeps;
  handX += (mouseX - handX) * P.handSmoothing;
  handY += (mouseY - handY) * P.handSmoothing;
  updateHandleAim();

  let peak = 0;
  for (let k = 1; k <= N; k++) {
    const t = k / N;
    integrate(lerp(prevHandX, handX, t), lerp(prevHandY, handY, t), N);
    if (!dropping) peak = Math.max(peak, tipSpeed(N));
  }

  const tip = whip[whip.length - 1];
  if (!dropping && peak > P.strikeSpeed * speedScale()) lastFastTime = Date.now();
  if (!dropping && peak > P.crackSpeed * speedScale()) {
    const now = Date.now();
    if (now - whipSpawnTime >= P.firstCrackGraceMs && now - lastCrackTime > P.crackCooldownMs) {
      lastCrackTime = now;
      playCrackSound();
      crackFx(tip.x, tip.y, tip.x - tip.px, tip.y - tip.py);
    }
  }

  if (dropping && whip.every((p) => p.y > H + 60)) {
    whip = null;
    dropping = false;
    window.bridge.hideOverlay();
  }
  updateFx();
  prevMouseX = mouseX; prevMouseY = mouseY;
  prevHandX = handX; prevHandY = handY;
}

/** A click while the tip is still fast enough: crack + send the macro. */
function strike() {
  const tip = whip[whip.length - 1];
  lastCrackTime = Date.now();
  playCrackSound();
  crackFx(tip.x, tip.y, tip.x - tip.px || 1, tip.y - tip.py);
  window.bridge.whipCrack();
}

// ── Crack FX: sparks, shockwave ring, motion trail, phrase banner ─────────
function crackFx(x, y, vx, vy) {
  const sp = Math.hypot(vx, vy) || 1;
  const dirX = vx / sp, dirY = vy / sp;
  for (let k = 0; k < P.sparkCount; k++) {
    const spread = (Math.random() - 0.5) * 1.6;
    const c = Math.cos(spread), s = Math.sin(spread);
    const speed = 4 + Math.random() * 10;
    sparks.push({
      x, y,
      vx: (dirX * c - dirY * s) * speed,
      vy: (dirX * s + dirY * c) * speed,
      life: 1,
      size: 1.5 + Math.random() * 2.5,
      hot: Math.random() < 0.5,
    });
  }
  rings.push({ x, y, r: 6, life: 1 });
}

function updateFx() {
  if (whip && !dropping) {
    const tip = whip[whip.length - 1];
    trail.push({ x: tip.x, y: tip.y, sp: Math.hypot(tip.x - tip.px, tip.y - tip.py) * P.substeps });
    if (trail.length > P.trailLength) trail.shift();
  } else {
    trail = [];
  }
  for (const s of sparks) {
    s.vy += 0.35; s.vx *= 0.94; s.vy *= 0.94;
    s.x += s.vx; s.y += s.vy;
    s.life -= 0.045;
  }
  sparks = sparks.filter((s) => s.life > 0);
  for (const r of rings) { r.r += 18; r.life -= 0.05; }
  rings = rings.filter((r) => r.life > 0);
  if (phrase && Date.now() - phrase.t > P.phraseMs) phrase = null;
}

function drawTrail() {
  if (trail.length < 3) return;
  if (trail.filter((t) => t.sp > P.trailMinSpeed).length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff';
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    const t = i / trail.length;
    const k = Math.min(1, b.sp / (P.crackSpeed * speedScale()));
    ctx.globalAlpha = 0.16 * t * k;
    ctx.lineWidth = 1.5 + 3 * t * k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFx() {
  for (const r of rings) {
    ctx.save();
    ctx.globalAlpha = r.life * 0.7;
    ctx.lineWidth = 3 + 6 * r.life;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    ctx.restore();
  }
  for (const s of sparks) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, s.life);
    ctx.fillStyle = s.hot ? '#ffd54a' : '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (phrase) {
    const age = (Date.now() - phrase.t) / P.phraseMs;
    const pop = 1 + 0.4 * Math.max(0, 1 - age * 4);
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1 - age) * 2);
    ctx.translate(W / 2, H * 0.18 - age * 30);
    ctx.scale(pop, pop);
    ctx.font = '900 72px -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = phrase.kind === 'pat' ? '#2e7d32' : '#c62828';
    ctx.strokeText(phrase.text, 0, 0);
    ctx.fillText(phrase.text, 0, 0);
    ctx.restore();
  }
}

/** Small HUD line for whip mode. */
function drawHud() {
  drawSwapHint('scroll or middle click: pat', 24);
}

// ── Rope + grip rendering ───────────────────────────────────────────────
function drawGrip() {
  const rw = renderWhip;
  if (!rw || rw.length < 3) return;
  const a = rw[0], b = rw[2];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 6, ny = (dx / len) * 6;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = P.lineWidthHandle + P.handleExtraWidth + 6;
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.lineWidth = P.lineWidthHandle + P.handleExtraWidth + 2;
  ctx.strokeStyle = '#6d3f1c';
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,220,160,0.55)';
  for (let i = 1; i < 4; i++) {
    const x = lerp(a.x, b.x, i / 4), y = lerp(a.y, b.y, i / 4);
    ctx.beginPath();
    ctx.moveTo(x - nx, y - ny);
    ctx.lineTo(x + nx, y + ny);
    ctx.stroke();
  }
  ctx.restore();
}

/** Forearm + fist gripping the handle end — the hand actually cracking the whip. */
function drawGripHand() {
  if (dropping) return;
  const rw = renderWhip;
  if (!rw || rw.length < 2) return;
  const a = rw[0], b = rw[1];
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const skin = '#f1c27d', edge = '#8d5524';

  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(angle);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = edge;
  ctx.fillStyle = skin;
  ctx.lineWidth = 2.5;

  // Forearm trails away from the grip, toward the body holding it. Its near
  // edge is square and buried under the fist below so the two merge cleanly.
  ctx.beginPath();
  ctx.roundRect(-110, -17, 100, 34, [17, 0, 0, 17]);
  ctx.fill();
  ctx.stroke();

  // Rolled t-shirt sleeve cuff where the bare forearm meets the shirt.
  ctx.fillStyle = '#eef0ef';
  ctx.strokeStyle = '#b9bcb8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-124, -21, 22, 42, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = skin;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2.5;

  // Fist base — the palm heel wrapped around the handle.
  ctx.beginPath();
  ctx.roundRect(-28, -14, 44, 28, 14);
  ctx.fill();
  ctx.stroke();

  // Four curled-over finger knuckles gripping across the top of the rod.
  for (let i = 0; i < 4; i++) {
    const x = -22 + i * 11;
    ctx.beginPath();
    ctx.roundRect(x, -24, 9, 18, 4.5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(141,85,36,0.45)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    const x = -22 + i * 11 - 1;
    ctx.beginPath();
    ctx.moveTo(x, -22);
    ctx.lineTo(x, 12);
    ctx.stroke();
  }

  // Thumb wraps over the near side of the fist, crossing the fingers.
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2.5;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(14, -8, 15, 8, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/** Draws the rope itself (trail, bezier stroke, grip). Assumes `renderWhip` is current. */
function drawWhip() {
  drawTrail();
  if (!renderWhip || renderWhip.length < 2) return;

  // White halo on the full spline, plus extra thickness over the handle links.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(renderWhip[0].x, renderWhip[0].y);
  for (let i = 0; i < renderWhip.length - 1; i++) {
    const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(renderWhip, i);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
  }
  ctx.lineWidth = P.lineWidthTip + P.outlineWidth * 2;
  ctx.stroke();

  const thickLinks = Math.min(P.handleThickSegments, renderWhip.length - 1);
  if (thickLinks > 0 && P.handleExtraWidth > 0) {
    ctx.beginPath();
    ctx.moveTo(renderWhip[0].x, renderWhip[0].y);
    for (let i = 0; i < thickLinks; i++) {
      const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(renderWhip, i);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    }
    ctx.lineWidth = P.lineWidthHandle + P.handleExtraWidth + P.outlineWidth * 2;
    ctx.stroke();
  }

  ctx.strokeStyle = '#111';
  for (let i = 0; i < renderWhip.length - 1; i++) {
    const t = i / Math.max(1, renderWhip.length - 2);
    const extra = i < P.handleThickSegments ? P.handleExtraWidth : 0;
    ctx.lineWidth = lerp(P.lineWidthHandle, P.lineWidthTip, t) + extra;
    const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(renderWhip, i);
    ctx.beginPath();
    ctx.moveTo(renderWhip[i].x, renderWhip[i].y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    ctx.stroke();
  }
  drawGrip();
  drawGripHand();
}
