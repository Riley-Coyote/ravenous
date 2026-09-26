// Painters for the moon's wildlife, drawn with the same care as Samus: layered chitin plates
// with a key light from the upper left, sharp specular edges, a rim of the room's light on the
// far side, jointed legs, glossy compound eyes, veined wings and glowing seams.
// Each painter keeps the old animation and hitbox untouched; only the look is new.

const TAU = Math.PI * 2;
let RIM = '255,215,170';
export function setCreatureRim(rgb) { RIM = rgb ? rgb.join(',') : '255,215,170'; }

export const SKINS = {
  sand: { hi: '#c98a5c', base: '#6e3a22', lo: '#1d0c06', belly: '#b99477', seam: 'rgba(20,8,4,0.85)', eye: '255,160,60', frost: false, magma: false },
  ice: { hi: '#e6f4ff', base: '#7c9fc0', lo: '#1a2a3c', belly: '#d7e6f2', seam: 'rgba(10,20,34,0.8)', eye: '120,230,255', frost: true, magma: false },
  magma: { hi: '#5a3a33', base: '#231311', lo: '#070303', belly: '#3c2622', seam: 'rgba(255,110,30,0.95)', eye: '255,190,70', frost: false, magma: true },
};

const OUT = 'rgba(6,4,6,0.85)';

// wrap one enemy's painting with its shake, devour fade and hit flash
export function drawCreature(c, e, paint) {
  const ox = e.offsetShake();
  c.save();
  e.devourTint(c);
  paint(c, e, ox, false);
  if (e.flash > 0) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.8;
    paint(c, e, ox, true);
    c.restore();
  }
  c.restore();
}

// ---------------------------------------------------------------- shared strokes

function grad(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [t, col] of stops) g.addColorStop(t, col);
  return g;
}

function glow(c, x, y, r, rgb, a) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
  g.addColorStop(0.2, `rgba(${rgb},${0.8 * a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.restore();
}

// a jointed leg: thigh, shin, a small claw; near legs brighter than far legs
function jointLeg(c, a, k, f, w, col, hl, flash) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = flash ? '#fff' : col;
  c.lineWidth = w;
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(k.x, k.y); c.stroke();
  c.lineWidth = w * 0.72;
  c.beginPath(); c.moveTo(k.x, k.y); c.lineTo(f.x, f.y); c.stroke();
  if (flash) return;
  c.strokeStyle = hl;
  c.lineWidth = Math.max(0.6, w * 0.28);
  c.beginPath(); c.moveTo(a.x, a.y - w * 0.2); c.lineTo(k.x, k.y - w * 0.25); c.stroke();
  c.fillStyle = col;
  c.beginPath(); c.arc(k.x, k.y, w * 0.55, 0, TAU); c.fill();
  c.strokeStyle = col;
  c.lineWidth = w * 0.5;
  c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x + w * 0.9, f.y + 0.4); c.stroke();
}

// ---------------------------------------------------------------- crawler

export function paintCrawler(c, e, ox, flash) {
  const sk = SKINS[e.skin || 'sand'];
  const W = '#fff';
  c.save();
  c.translate(e.cx + ox, e.y + e.h);
  c.scale(e.facing, 1);
  const walk = e.state === 'patrol' ? e.anim * 14 : e.state === 'stunned' ? e.anim * 30 : 0;
  const legAt = (k, side) => {
    const bx = -12 + k * 11, ph = walk + k * 1.9 + (side > 0 ? Math.PI : 0);
    const lift = Math.max(0, Math.sin(ph)) * 5;
    return [{ x: bx, y: -9.5 }, { x: bx + 5 + Math.cos(ph) * 3, y: -12.5 - lift }, { x: bx + 9 + Math.cos(ph) * 5, y: -lift * 0.3 }];
  };
  for (let k = 0; k < 3; k++) {
    const [a, kn, f] = legAt(k, 1);
    jointLeg(c, a, kn, f, 2.3, sk.lo, 'rgba(255,255,255,0.12)', flash);
  }
  const rear = e.state === 'windup' ? Math.min(1, e.t / 0.4) : 0;
  c.rotate(-0.25 * rear);
  // pale underside
  c.fillStyle = flash ? W : sk.belly;
  c.beginPath(); c.ellipse(-2, -9, 20, 4.6, 0, 0, TAU); c.fill();
  // five overlapping carapace plates, tail to head, each one catching the light on its crest
  const plates = [[-24, -12], [-17, -4], [-9, 3], [-1, 10], [6, 16]];
  for (let i = 0; i < plates.length; i++) {
    const [x0, x1] = plates[i];
    const mid = (x0 + x1) / 2;
    const hgt = 11 + (i === 2 ? 1.5 : i === 1 || i === 3 ? 1 : 0) - (i === 0 ? 2 : 0);
    c.beginPath();
    c.moveTo(x0 - 1, -8.5);
    c.bezierCurveTo(x0 - 1, -8.5 - hgt * 0.9, x1 + 1, -8.5 - hgt * 1.05, x1 + 2.5, -8.5);
    c.closePath();
    c.fillStyle = flash ? W : grad(c, mid - 4, -8.5 - hgt, mid + 3, -8.5, [[0, sk.hi], [0.45, sk.base], [1, sk.lo]]);
    c.fill();
    if (flash) continue;
    c.strokeStyle = OUT;
    c.lineWidth = 0.8;
    c.stroke();
    // specular crest
    c.strokeStyle = sk.frost ? 'rgba(255,255,255,0.85)' : 'rgba(255,230,210,0.55)';
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(x0 + 1, -8.5 - hgt * 0.55);
    c.quadraticCurveTo(mid - 1, -8.5 - hgt * 0.92, x1 - 1, -8.5 - hgt * 0.7);
    c.stroke();
    // seam where this plate meets the next
    c.strokeStyle = sk.seam;
    c.lineWidth = sk.magma ? 1.4 : 1;
    c.beginPath(); c.moveTo(x1 + 2.2, -8.8); c.quadraticCurveTo(x1 + 1.2, -8.5 - hgt * 0.6, x1 - 0.5, -8.5 - hgt * 0.95); c.stroke();
    // rim light on the far edge
    c.strokeStyle = `rgba(${RIM},0.45)`;
    c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(x0 + 0.5, -9.5); c.lineTo(x0 + 0.2, -8.5 - hgt * 0.45); c.stroke();
    if (sk.frost) {
      c.fillStyle = 'rgba(255,255,255,0.7)';
      for (let d = 0; d < 3; d++) c.fillRect(x0 + 2 + d * 2.6, -8.5 - hgt * (0.7 + (d % 2) * 0.1), 0.9, 0.9);
    }
  }
  if (sk.magma && !flash) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(255,120,40,${0.5 + 0.3 * Math.sin(e.anim * 5)})`;
    c.lineWidth = 2.4;
    for (const [, x1] of plates.slice(0, 4)) {
      c.beginPath(); c.moveTo(x1 + 2.2, -8.8); c.quadraticCurveTo(x1 + 1.2, -15, x1, -19); c.stroke();
    }
    c.restore();
  }
  // head: a hard faceplate with mandibles and a cluster of eyes
  c.fillStyle = flash ? W : grad(c, 14, -20, 20, -5, [[0, sk.hi], [0.5, sk.base], [1, sk.lo]]);
  c.beginPath();
  c.moveTo(13, -8);
  c.quadraticCurveTo(13, -18, 19, -18);
  c.quadraticCurveTo(25, -17, 25, -11);
  c.quadraticCurveTo(24, -6, 19, -6);
  c.closePath();
  c.fill();
  if (!flash) {
    c.strokeStyle = OUT;
    c.lineWidth = 0.8;
    c.stroke();
    c.strokeStyle = sk.lo;
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    const bite = e.state === 'lunge' || e.state === 'windup' ? 1 : 0.3 + 0.2 * Math.sin(e.anim * 6);
    c.beginPath(); c.moveTo(23, -8.5); c.quadraticCurveTo(28 + bite, -8, 27, -4 + bite * 0.5); c.stroke();
    c.beginPath(); c.moveTo(22, -7); c.quadraticCurveTo(26, -4.5 - bite, 24.5, -2.5); c.stroke();
    // antennae
    c.strokeStyle = 'rgba(20,10,6,0.9)';
    c.lineWidth = 0.8;
    const wig = Math.sin(e.anim * 7) * 1.5;
    c.beginPath(); c.moveTo(20, -17); c.quadraticCurveTo(25, -24 + wig, 31, -22 + wig); c.stroke();
    c.beginPath(); c.moveTo(18, -17.5); c.quadraticCurveTo(21, -25 - wig, 27, -26 - wig); c.stroke();
    const eye = e.counterable ? '255,250,210' : sk.eye;
    for (const [x, y, r] of [[21.5, -13.5, 1.5], [18.8, -15.2, 1.1], [22.6, -10.8, 1]]) {
      c.fillStyle = `rgb(${eye})`;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillRect(x - r * 0.3, y - r * 0.6, 0.6, 0.6);
    }
    glow(c, 21, -13, 7, eye, e.counterable ? 0.9 : 0.45);
  }
  c.rotate(0.25 * rear);
  for (let k = 0; k < 3; k++) {
    const [a, kn, f] = legAt(k, -1);
    jointLeg(c, a, kn, f, 2.2, sk.lo, `rgba(${RIM},0.35)`, flash);
  }
  c.restore();
  if (sk.magma && !flash && !e.beingDevoured) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(255,110,30,${0.18 + 0.1 * Math.sin(e.anim * 6)})`;
    c.beginPath(); c.ellipse(e.cx, e.y + e.h - 4, 22, 5, 0, 0, TAU); c.fill();
    c.restore();
  }
}

// ---------------------------------------------------------------- wingblade

export function paintWingblade(c, e, ox, flash) {
  const W = '#fff';
  c.save();
  c.translate(e.cx + ox, e.cy);
  c.scale(e.facing, 1);
  const tilt = e.state === 'swoop' ? Math.max(-0.6, Math.min(0.6, e.vy / 900)) : e.state === 'stunned' ? 0.9 : 0.1 * Math.sin(e.anim * 2);
  c.rotate(tilt);
  const rate = e.state === 'windup' ? 50 : 26;
  const flap = e.state === 'stunned' ? 0.2 : Math.sin(e.anim * rate);
  // wings: veined membranes, smeared by their own speed
  const wing = (back, f, alpha) => {
    c.save();
    c.translate(-2, -7);
    c.rotate((back ? -0.55 : -0.25) + f * 0.55);
    c.globalAlpha *= alpha;
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(-8, -20, -30, -34, -48, -30);
    c.bezierCurveTo(-40, -22, -24, -10, 0, 0);
    if (flash) { c.fillStyle = 'rgba(255,255,255,0.9)'; c.fill(); c.restore(); return; }
    const g = c.createLinearGradient(0, 0, -48, -30);
    g.addColorStop(0, 'rgba(160,220,230,0.42)');
    g.addColorStop(0.5, 'rgba(150,140,230,0.26)');
    g.addColorStop(1, 'rgba(220,200,255,0.12)');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(230,245,255,0.5)';
    c.lineWidth = 0.8;
    c.stroke();
    c.strokeStyle = 'rgba(20,30,40,0.5)';
    c.lineWidth = 0.6;
    c.beginPath(); c.moveTo(-2, -2); c.quadraticCurveTo(-22, -22, -44, -29); c.stroke();
    for (let v = 1; v <= 4; v++) {
      const t = v / 5;
      c.beginPath(); c.moveTo(-6 - 30 * t, -6 - 18 * t); c.lineTo(-10 - 30 * t, -1 - 16 * t); c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.moveTo(-10, -12); c.quadraticCurveTo(-26, -26, -40, -30); c.stroke();
    c.restore();
  };
  const blur = e.state === 'stunned' ? 0 : 1;
  for (const back of [true, false]) {
    wing(back, flap, 1);
    if (blur) {
      wing(back, Math.sin(e.anim * rate - 0.45), 0.35);
      wing(back, Math.sin(e.anim * rate - 0.9), 0.18);
    }
  }
  // abdomen: tapered segments ending in a stinger
  const segs = 6;
  for (let i = segs - 1; i >= 0; i--) {
    const t = i / (segs - 1);
    const x = -2 - t * 24, y = 3 + t * 6 + Math.sin(e.anim * 5 + i * 0.6) * 0.8;
    const r = 6.2 - t * 3.6;
    c.fillStyle = flash ? W : grad(c, x, y - r, x, y + r, [[0, '#6f8c90'], [0.4, '#243236'], [1, '#080c0e']]);
    c.beginPath(); c.ellipse(x, y, r * 1.1, r, 0.25, 0, TAU); c.fill();
    if (flash) continue;
    c.strokeStyle = OUT;
    c.lineWidth = 0.7;
    c.stroke();
    c.strokeStyle = i % 2 ? 'rgba(255,200,80,0.55)' : 'rgba(200,235,240,0.35)';
    c.lineWidth = 0.8;
    c.beginPath(); c.arc(x, y, r * 0.8, -2.3, -1.1); c.stroke();
  }
  if (!flash) {
    c.strokeStyle = '#0a0e10';
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(-26, 9); c.lineTo(-33, 12 + Math.sin(e.anim * 4) * 1.5); c.stroke();
  }
  // thorax
  c.fillStyle = flash ? W : grad(c, 2, -8, 4, 7, [[0, '#8fb0b4'], [0.45, '#2c3c40'], [1, '#090d0f']]);
  c.beginPath(); c.ellipse(3, -0.5, 7.5, 6.8, 0, 0, TAU); c.fill();
  if (!flash) {
    c.strokeStyle = OUT;
    c.lineWidth = 0.8;
    c.stroke();
    c.strokeStyle = 'rgba(235,250,255,0.55)';
    c.lineWidth = 0.9;
    c.beginPath(); c.arc(3, -0.5, 5.6, -2.6, -1.2); c.stroke();
    c.strokeStyle = `rgba(${RIM},0.5)`;
    c.beginPath(); c.arc(3, -0.5, 7, 0.3, 1.4); c.stroke();
    // legs tucked under
    c.strokeStyle = '#0c1214';
    c.lineWidth = 1.1;
    for (let k = 0; k < 3; k++) {
      const bx = -1 + k * 4;
      c.beginPath(); c.moveTo(bx, 5); c.lineTo(bx - 2, 11 + Math.sin(e.anim * 6 + k) * 1.4); c.lineTo(bx + 1, 15); c.stroke();
    }
  }
  // head with a huge glossy compound eye
  c.fillStyle = flash ? W : '#10171a';
  c.beginPath(); c.ellipse(11.5, -1, 6.5, 6, 0, 0, TAU); c.fill();
  if (!flash) {
    const eye = e.counterable ? '255,250,215' : '255,200,70';
    const g = c.createRadialGradient(12.5, -3, 0.5, 12, -1.5, 5.2);
    g.addColorStop(0, `rgba(${eye},1)`);
    g.addColorStop(0.55, e.counterable ? 'rgba(255,230,160,1)' : 'rgba(200,110,20,1)');
    g.addColorStop(1, 'rgba(40,16,4,1)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(12.8, -1.8, 4.6, 4.4, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, rr = 1 + (i % 3) * 1.1;
      c.fillRect(12.8 + Math.cos(a) * rr, -1.8 + Math.sin(a) * rr, 0.7, 0.7);
    }
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath(); c.ellipse(11.4, -3.6, 1.5, 0.9, -0.5, 0, TAU); c.fill();
    c.strokeStyle = '#0c1214';
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(16, 2); c.quadraticCurveTo(20, 5, 18.5, 9); c.stroke();
    glow(c, 13, -1.8, 9, eye, e.counterable ? 0.9 : 0.4);
  }
  c.restore();
}

// ---------------------------------------------------------------- husk brute

export function paintBrute(c, e, ox, flash) {
  const W = '#fff';
  c.save();
  c.translate(e.cx + ox, e.y + e.h);
  c.scale(e.facing, 1);
  const moving = e.state === 'patrol' || e.state === 'charge';
  const sp = e.state === 'charge' ? 22 : 7;
  const ph = moving ? e.anim * sp : 0;
  const rear = e.state === 'windup' ? Math.min(1, e.t / 0.5) : 0;
  c.rotate(-0.22 * rear + (e.state === 'charge' ? 0.08 : 0));
  const leg = (bx, off, near) => {
    const q = ph + off + (near ? Math.PI * 0.5 : 0);
    const kx = bx + Math.sin(q) * 7, ky = -18 - Math.max(0, Math.cos(q)) * 6;
    const fx = kx + 4 + Math.sin(q) * 4;
    const col = near ? '#3a1a12' : '#1e0c08';
    c.lineCap = 'round';
    c.strokeStyle = flash ? W : col;
    c.lineWidth = near ? 9 : 8;
    c.beginPath(); c.moveTo(bx, -30); c.lineTo(kx, ky); c.stroke();
    c.lineWidth = near ? 7 : 6;
    c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, -2); c.stroke();
    if (flash) return;
    if (near) {
      c.strokeStyle = 'rgba(255,200,170,0.22)';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(bx - 2, -29); c.lineTo(kx - 2, ky); c.stroke();
    }
    // claws
    c.fillStyle = '#d9cdb4';
    for (let t = 0; t < 3; t++) {
      c.beginPath(); c.moveTo(fx - 2 + t * 3, -1.5); c.lineTo(fx + 1.5 + t * 3, -1.5); c.lineTo(fx + 3 + t * 3, 1); c.closePath(); c.fill();
    }
  };
  leg(-22, 0, false);
  leg(16, Math.PI, false);
  // the body: a scaled hide with a paler belly
  const body = () => {
    c.beginPath();
    c.moveTo(-38, -26);
    c.quadraticCurveTo(-36, -58, -6, -60);
    c.quadraticCurveTo(22, -62, 30, -40);
    c.quadraticCurveTo(34, -24, 18, -22);
    c.lineTo(-30, -20);
    c.closePath();
  };
  body();
  c.fillStyle = flash ? W : grad(c, -10, -62, 0, -20, [[0, '#a4523a'], [0.5, '#5a1d13'], [1, '#1c0705']]);
  c.fill();
  if (!flash) {
    c.save();
    body();
    c.clip();
    // scales, in offset rows, each catching a little light on top
    for (let row = 0; row < 8; row++) {
      const y = -58 + row * 5;
      for (let x = -40 + (row % 2) * 3; x < 34; x += 6) {
        c.strokeStyle = 'rgba(20,4,2,0.55)';
        c.lineWidth = 0.9;
        c.beginPath(); c.arc(x, y, 3.3, 0.15, Math.PI - 0.15); c.stroke();
        c.strokeStyle = 'rgba(255,190,150,0.14)';
        c.beginPath(); c.arc(x, y + 1.2, 2.2, -2.6, -0.5); c.stroke();
      }
    }
    c.fillStyle = grad(c, 0, -30, 0, -20, [[0, 'rgba(220,170,120,0)'], [1, 'rgba(220,170,120,0.4)']]);
    c.fillRect(-40, -34, 76, 16);
    c.restore();
    body();
    c.strokeStyle = OUT;
    c.lineWidth = 1;
    c.stroke();
    c.strokeStyle = `rgba(${RIM},0.5)`;
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-37, -28); c.quadraticCurveTo(-35, -56, -8, -59); c.stroke();
    // bristling quills down the spine
    for (let k = 0; k < 13; k++) {
      const t = k / 12;
      const x0 = -34 + t * 54, y0 = -54 - Math.sin(t * Math.PI) * 6;
      const len = 9 + Math.sin(t * Math.PI) * 5 + (rear ? 4 : 0);
      const sway = Math.sin(e.anim * 3 + k) * 1.4;
      const g = c.createLinearGradient(x0, y0 + 6, x0 - 6, y0 - len);
      g.addColorStop(0, '#0e2a12');
      g.addColorStop(0.6, k % 2 ? '#2f7a36' : '#236a2c');
      g.addColorStop(1, '#bfe6a0');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x0 - 1.8, y0 + 6);
      c.lineTo(x0 - 6 + sway, y0 - len);
      c.lineTo(x0 + 1.8, y0 + 6);
      c.closePath();
      c.fill();
    }
  } else {
    for (let k = 0; k < 13; k++) {
      const t = k / 12;
      const x0 = -34 + t * 54, y0 = -54 - Math.sin(t * Math.PI) * 6;
      c.fillStyle = W;
      c.beginPath(); c.moveTo(x0 - 1.8, y0 + 6); c.lineTo(x0 - 6, y0 - 10); c.lineTo(x0 + 1.8, y0 + 6); c.closePath(); c.fill();
    }
  }
  leg(-22, 0, true);
  leg(16, Math.PI, true);
  // the skull: a bone plate with a curling horn and a burning eye
  c.save();
  c.translate(30, -34 - rear * 10);
  c.rotate(0.2 - rear * 0.5);
  c.beginPath();
  c.moveTo(-8, -11);
  c.quadraticCurveTo(14, -16, 24, -3);
  c.lineTo(22, 6);
  c.quadraticCurveTo(6, 11, -7, 6);
  c.closePath();
  c.fillStyle = flash ? W : grad(c, 0, -14, 4, 10, [[0, '#f2e6cc'], [0.5, '#a6947a'], [1, '#3e3226']]);
  c.fill();
  if (!flash) {
    c.strokeStyle = OUT;
    c.lineWidth = 1;
    c.stroke();
    c.strokeStyle = 'rgba(60,40,24,0.7)';
    c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(2, -12); c.lineTo(5, -6); c.lineTo(3, -2); c.moveTo(12, -11); c.lineTo(10, -5); c.stroke();
    // horn
    c.fillStyle = grad(c, -6, -12, -2, -26, [[0, '#6c5a44'], [1, '#efe2c4']]);
    c.beginPath(); c.moveTo(-5, -9); c.quadraticCurveTo(-10, -24, 2, -27); c.quadraticCurveTo(-3, -20, 1, -10); c.closePath(); c.fill();
    c.fillStyle = '#120604';
    c.beginPath(); c.ellipse(7, -3, 4.2, 3.2, 0, 0, TAU); c.fill();
    const eye = e.counterable ? '255,250,215' : '255,200,60';
    c.fillStyle = `rgb(${eye})`;
    c.beginPath(); c.arc(7.6, -3, 1.9, 0, TAU); c.fill();
    glow(c, 7.6, -3, 9, eye, e.counterable ? 0.95 : 0.5);
    c.fillStyle = '#efe4cc';
    for (let k = 0; k < 5; k++) {
      const x = 7 + k * 3.2, open = e.state === 'charge' ? 2.5 : 0.5;
      c.beginPath(); c.moveTo(x, 5.5); c.lineTo(x + 1.6, 5.5); c.lineTo(x + 0.8, 9 + open); c.closePath(); c.fill();
    }
    c.strokeStyle = `rgba(${RIM},0.5)`;
    c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(-7, 5); c.quadraticCurveTo(6, 10.5, 21, 5.5); c.stroke();
  }
  c.restore();
  c.restore();
}

// ---------------------------------------------------------------- ice jelly

export function paintJelly(c, e, ox, flash) {
  const t = e.anim;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
  c.save();
  c.translate(e.cx + ox, e.cy);
  const squash = 1 + 0.12 * Math.sin(t * 5.2);
  c.scale(1 / squash, squash);
  if (!flash) {
    // tentacles: long trailing ribbons with little lights
    c.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      const x0 = -15 + k * 5;
      const len = 30 + (k % 3) * 8;
      c.strokeStyle = `rgba(190,160,255,${0.22 + 0.12 * pulse})`;
      c.lineWidth = 2.2 - (k % 2) * 0.8;
      c.beginPath();
      c.moveTo(x0, 5);
      c.bezierCurveTo(x0 + Math.sin(t * 3 + k) * 7, 5 + len * 0.4, x0 + Math.sin(t * 2.2 + k * 2) * 8, 5 + len * 0.75, x0 + Math.sin(t * 1.7 + k) * 5, 5 + len);
      c.stroke();
      if (k % 2 === 0) glow(c, x0 + Math.sin(t * 2.2 + k * 2) * 6, 5 + len * 0.7, 3.4, '200,170,255', 0.4 + 0.3 * pulse);
    }
  }
  // the bell: translucent, with a frilled rim
  c.beginPath();
  c.moveTo(-21, 5);
  c.bezierCurveTo(-23, -24, 23, -24, 21, 5);
  for (let k = 0; k <= 12; k++) {
    const x = 21 - (k * 42) / 12;
    c.quadraticCurveTo(x + 1.75, 9 + Math.sin(t * 6 + k) * 1.2, x, 5);
  }
  c.closePath();
  if (flash) {
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.fill();
    c.restore();
    return;
  }
  const bell = c.createRadialGradient(-4, -12, 2, 0, -2, 26);
  bell.addColorStop(0, 'rgba(245,230,255,0.8)');
  bell.addColorStop(0.45, 'rgba(170,130,245,0.45)');
  bell.addColorStop(1, 'rgba(80,50,170,0.18)');
  c.fillStyle = bell;
  c.fill();
  c.strokeStyle = 'rgba(245,235,255,0.6)';
  c.lineWidth = 1;
  c.stroke();
  // ribs of the bell
  c.strokeStyle = 'rgba(255,255,255,0.18)';
  c.lineWidth = 0.8;
  for (let k = -2; k <= 2; k++) {
    c.beginPath(); c.moveTo(k * 7, 4); c.quadraticCurveTo(k * 5, -10, k * 2, -17); c.stroke();
  }
  // inner organ: a glowing core, brighter as it flares
  const core = e.state === 'flare' ? 1 : pulse;
  const col = e.counterable ? '255,250,215' : '255,140,235';
  glow(c, 0, -7, 10 + core * 6, col, 0.6 + core * 0.4);
  c.fillStyle = `rgba(${col},0.95)`;
  c.beginPath(); c.arc(0, -7, 3.6, 0, TAU); c.fill();
  // glints on the dome
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.beginPath(); c.ellipse(-8, -13, 3.2, 1.6, -0.6, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.5)';
  for (let k = 0; k < 6; k++) {
    const a = -2.9 + k * 0.5;
    c.beginPath(); c.arc(Math.cos(a) * 16, -2 + Math.sin(a) * 13, 0.9, 0, TAU); c.fill();
  }
  c.restore();
  if (!flash) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const halo = c.createRadialGradient(e.cx, e.cy - 4, 4, e.cx, e.cy - 4, 40);
    halo.addColorStop(0, `rgba(190,140,255,${0.16 + 0.1 * pulse})`);
    halo.addColorStop(1, 'rgba(190,140,255,0)');
    c.fillStyle = halo;
    c.beginPath(); c.arc(e.cx, e.cy - 4, 40, 0, TAU); c.fill();
    c.restore();
  }
}

// ---------------------------------------------------------------- magma spitter

export function paintSpitter(c, e, ox, flash) {
  const sw = e.state === 'swell' ? Math.min(1, e.t / 0.6) : 0;
  const W = '#fff';
  c.save();
  c.translate(e.cx + ox, e.y + e.h);
  c.scale(e.facing, 1);
  // a craggy basalt husk
  const pts = [[-21, 0], [-24, -12], [-20, -26], [-12, -37 - sw * 4], [-2, -42 - sw * 6], [10, -43 - sw * 4], [19, -34], [22, -20], [21, -8], [20, 0]];
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = flash ? W : grad(c, -18, -42, 12, 0, [[0, '#6a4238'], [0.4, '#2b1612'], [1, '#080303']]);
  c.fill();
  if (!flash) {
    c.strokeStyle = OUT;
    c.lineWidth = 1;
    c.stroke();
    // facets
    c.strokeStyle = 'rgba(255,220,200,0.18)';
    c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(-20, -26); c.lineTo(-8, -20); c.lineTo(-12, -37); c.moveTo(-8, -20); c.lineTo(4, -30); c.stroke();
    c.strokeStyle = `rgba(${RIM},0.45)`;
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(19, -34); c.lineTo(22, -20); c.lineTo(21, -8); c.stroke();
    // glowing fissures, hotter as it swells
    c.save();
    c.globalCompositeOperation = 'lighter';
    const heat = 0.45 + 0.35 * Math.sin(e.anim * 4) + sw * 0.6;
    c.strokeStyle = `rgba(255,120,40,${Math.min(1, heat)})`;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(-17, -2); c.lineTo(-14, -7); c.lineTo(-15.5, -11); c.lineTo(-11, -16); c.lineTo(-12.5, -21);
    c.moveTo(-11, -16); c.lineTo(-6, -17.5); c.lineTo(-3, -22);
    c.moveTo(7, -3); c.lineTo(9.5, -9); c.lineTo(8, -13); c.lineTo(11, -19);
    c.moveTo(8, -13); c.lineTo(3, -15);
    c.stroke();
    c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(-2, -30); c.lineTo(1, -34); c.lineTo(0, -38); c.stroke();
    c.restore();
    // the maw at the top
    const mx = 6, my = -38 - sw * 5;
    c.fillStyle = '#0a0302';
    c.beginPath(); c.ellipse(mx, my, 7 + sw * 3, 3.5 + sw * 2, -0.15, 0, TAU); c.fill();
    const g = c.createRadialGradient(mx, my, 0, mx, my, 12 + sw * 8);
    g.addColorStop(0, `rgba(255,245,200,${0.7 + 0.3 * sw})`);
    g.addColorStop(0.35, `rgba(255,140,40,${0.6 + 0.3 * sw})`);
    g.addColorStop(1, 'rgba(255,60,0,0)');
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.beginPath(); c.arc(mx, my, 12 + sw * 8, 0, TAU); c.fill();
    c.restore();
    c.fillStyle = '#d9c7a8';
    for (let k = 0; k < 5; k++) {
      const a = Math.PI + 0.3 + k * 0.6;
      const x = mx + Math.cos(a) * (6 + sw * 3), y = my + Math.sin(a) * (3 + sw * 2) * 0.6;
      c.beginPath(); c.moveTo(x - 1, y); c.lineTo(x + 1, y); c.lineTo(x, y + 2.6); c.closePath(); c.fill();
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- lab drone

export function paintDrone(c, e, ox, flash) {
  const W = '#fff';
  c.save();
  c.translate(e.cx + ox, e.cy);
  c.rotate(e.state === 'stunned' ? 0.6 : Math.sin(e.anim * 3) * 0.06);
  // thrusters underneath
  if (!flash) {
    for (const sx of [-9, 9]) {
      const f = 0.7 + 0.3 * Math.sin(e.anim * 40 + sx);
      c.save();
      c.globalCompositeOperation = 'lighter';
      const g = c.createLinearGradient(sx, 8, sx, 22);
      g.addColorStop(0, `rgba(200,230,255,${0.9 * f})`);
      g.addColorStop(0.4, `rgba(110,170,255,${0.5 * f})`);
      g.addColorStop(1, 'rgba(80,120,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(sx - 3, 8); c.lineTo(sx + 3, 8); c.lineTo(sx, 20 + 4 * f); c.closePath(); c.fill();
      c.restore();
    }
  }
  // hull: a beveled wedge of dark metal
  c.beginPath();
  c.moveTo(-19, -3); c.lineTo(-11, -12); c.lineTo(11, -12); c.lineTo(19, -3); c.lineTo(13, 8); c.lineTo(-13, 8);
  c.closePath();
  c.fillStyle = flash ? W : grad(c, 0, -12, 0, 8, [[0, '#6c64a0'], [0.35, '#2c2648'], [1, '#0c0a16']]);
  c.fill();
  if (!flash) {
    c.strokeStyle = OUT;
    c.lineWidth = 1;
    c.stroke();
    c.strokeStyle = 'rgba(220,210,255,0.6)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(-18, -3.5); c.lineTo(-10.5, -11.5); c.lineTo(10.5, -11.5); c.stroke();
    c.strokeStyle = 'rgba(8,6,16,0.8)';
    c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(-15, -1); c.lineTo(15, -1); c.moveTo(-6, -12); c.lineTo(-6, -1); c.moveTo(6, -12); c.lineTo(6, -1); c.stroke();
    c.fillStyle = 'rgba(200,190,255,0.5)';
    for (const [x, y] of [[-12, 4], [12, 4], [-9, -9], [9, -9]]) c.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    c.strokeStyle = `rgba(${RIM},0.5)`;
    c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(19, -3); c.lineTo(13, 8); c.stroke();
    // side fins
    c.fillStyle = '#120f22';
    c.beginPath(); c.moveTo(-19, -3); c.lineTo(-26, -1); c.lineTo(-24, 3); c.lineTo(-16, 3); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(19, -3); c.lineTo(26, -1); c.lineTo(24, 3); c.lineTo(16, 3); c.closePath(); c.fill();
    // antenna with a blinking tip
    c.strokeStyle = '#1a1630';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(4, -12); c.lineTo(7, -19); c.stroke();
    if (Math.sin(e.anim * 5) > 0.3) glow(c, 7, -19.5, 4, '255,90,120', 0.9);
    // the lens: a ring and an iris that tracks you
    const aiming = e.state === 'aim' || e.counterable;
    const col = e.counterable ? '255,250,215' : aiming ? '255,70,110' : '120,200,255';
    c.fillStyle = '#05040a';
    c.beginPath(); c.arc(e.facing * 3, -4, 5.4, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(160,150,220,0.8)';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = `rgb(${col})`;
    c.beginPath(); c.arc(e.facing * 4, -4, 2.6, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(e.facing * 3, -5.4, 0.9, 0, TAU); c.fill();
    glow(c, e.facing * 4, -4, aiming ? 14 : 9, col, aiming ? 0.9 : 0.5);
  }
  c.restore();
}
