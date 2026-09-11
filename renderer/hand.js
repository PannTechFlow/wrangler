'use strict';
// Pat-on-the-shoulder mode: a hand follows the cursor, a click pats and
// sends a kind word (no interrupt), floating hearts, a wave goodbye.
// Depends on state.js.

function pat() {
  hand.press = 1;
  pats++;
  for (let k = 0; k < 7; k++) {
    hearts.push({
      x: hand.x + (Math.random() - 0.5) * 110,
      y: hand.y - 95 - Math.random() * 30,
      vx: (Math.random() - 0.5) * 1.6,
      vy: -1.8 - Math.random() * 1.6,
      life: 1,
      size: 18 + Math.random() * 16,
      glyph: Math.random() < 0.7 ? '❤️' : '✨',
      wob: Math.random() * Math.PI * 2,
    });
  }
  window.bridge.handPat();
}

function updateHand() {
  if (!hand) return;
  const k = 0.18;
  hand.vx = (hand.vx + (mouseX - hand.x) * k) * 0.72;
  hand.vy = (hand.vy + (mouseY - hand.y) * k) * 0.72;
  hand.x += hand.vx;
  hand.y += hand.vy;
  hand.bob += 0.06;
  hand.press *= 0.86;
  for (const h of hearts) {
    h.wob += 0.12;
    h.x += h.vx + Math.sin(h.wob) * 0.6;
    h.y += h.vy;
    h.vy *= 0.985;
    h.life -= 0.012;
  }
  hearts = hearts.filter((h) => h.life > 0);
  if (hand.leaving && Date.now() - hand.leaveT > 700 && !hearts.length) {
    hand = null;
    mode = 'whip';
    window.bridge.hideOverlay();
  }
}

function heartPath(x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.9, y - r * 1.3, x, y - r * 0.5);
  ctx.bezierCurveTo(x + r * 0.9, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.closePath();
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawHandShape(scale, waving) {
  const skin = '#f1c27d', edge = '#8d5524';
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineWidth = 3 / scale;
  ctx.strokeStyle = edge;
  ctx.fillStyle = skin;
  roundedRect(-34, -20, 68, 70, 18);
  ctx.fill();
  ctx.stroke();
  const fingers = [[-30, 62, 14], [-12, 70, 15], [6, 66, 15], [24, 56, 14]];
  for (const [fx, len, fw] of fingers) {
    const spread = waving ? Math.sin(Date.now() / 90 + fx) * 3 : 0;
    roundedRect(fx - fw / 2 + spread, -len, fw, len + 10, fw / 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(-40, 14);
  ctx.rotate(-0.9);
  roundedRect(-8, -30, 16, 44, 8);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(141,85,36,0.35)';
  ctx.lineWidth = 2 / scale;
  ctx.beginPath();
  ctx.moveTo(-18, 10);
  ctx.quadraticCurveTo(0, 30, 20, 8);
  ctx.stroke();
  ctx.restore();
}

function drawHand() {
  for (const h of hearts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, h.life);
    if (h.glyph === '✨') {
      ctx.fillStyle = '#ffd54a';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      const r = h.size * 0.35;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        const rr = i % 2 ? r * 0.35 : r;
        ctx.lineTo(h.x + Math.cos(ang) * rr, h.y + Math.sin(ang) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      heartPath(h.x, h.y, h.size * 0.45);
      ctx.fillStyle = '#e53950';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fill();
    }
    ctx.restore();
  }
  if (!hand) return;
  const leaving = hand.leaving ? Math.min(1, (Date.now() - hand.leaveT) / 700) : 0;
  const scale = 1.1 * (1 - 0.2 * hand.press) * (1 - leaving * 0.5);
  const tilt = Math.sin(hand.bob) * 0.06 + (hand.leaving ? Math.sin(Date.now() / 70) * 0.45 : 0) + hand.vx * 0.01;
  ctx.save();
  ctx.globalAlpha = 1 - leaving;
  ctx.translate(hand.x, hand.y + hand.press * 26 + Math.sin(hand.bob) * 3);
  ctx.rotate(tilt);
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8 + hand.press * 6;
  drawHandShape(scale, hand.leaving);
  ctx.restore();
}

function drawPatHud() {
  if (!hand) return;
  const text = `Pats ${pats}`;
  ctx.save();
  ctx.font = 'bold 28px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#2e7d32';
  ctx.strokeText(text, W - 28, 24);
  ctx.fillText(text, W - 28, 24);
  drawSwapHint('scroll or middle click: whip', 62);
  ctx.restore();
}
