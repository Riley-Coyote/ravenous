// Samus, drawn like hard-surface armor: tapered plates with panel lines, a key light from the
// upper left, a sharp specular edge, a colored rim light from the room behind her, a dark undersuit
// at the joints, and small emissive suit lights. The same shapes also paint a normal map, so the
// cinematic pass can light her from the side when a beam or lava is near.

const TAU = Math.PI * 2;
const V = (x, y) => ({ x, y });
const add = (a, b) => V(a.x + b.x, a.y + b.y);
const sub = (a, b) => V(a.x - b.x, a.y - b.y);
const mul = (a, k) => V(a.x * k, a.y * k);
const mix = (a, b, t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const unit = (a) => { const l = Math.hypot(a.x, a.y) || 1; return V(a.x / l, a.y / l); };
const perp = (a) => V(-a.y, a.x);

const C = {
  blue: { hi: '#8fb6ee', base: '#2753b0', lo: '#07142f' },
  blueB: { hi: '#5a7fc2', base: '#1a3a82', lo: '#050d22' },
  red: { hi: '#ffa184', base: '#cc432f', lo: '#3c0b06' },
  redB: { hi: '#c86650', base: '#8c2d21', lo: '#280704' },
  white: { hi: '#ffffff', base: '#d4dcea', lo: '#56637a' },
  whiteB: { hi: '#c5cfe0', base: '#8f9bb2', lo: '#2e3748' },
  under: { hi: '#454b5e', base: '#1b1e29', lo: '#06070b' },
  gunmetal: { hi: '#7c8aa6', base: '#2c3448', lo: '#0a0d16' },
};
const OUT = 'rgba(4,6,14,0.85)';

// the painter: color mode draws the armor, normal mode encodes which way each surface faces
const R = { mode: 'color', facing: 1, light: V(-0.8, -0.6), rim: '255,220,180', mat: 239 };

function ncol(nx, ny) {
  const x = nx * R.facing;
  const s = 1 / Math.sqrt(x * x + ny * ny + 1);
  return `rgb(${(128 + 127 * x * s) | 0},${(128 + 127 * ny * s) | 0},${R.mat})`;
}

function smoothPath(c, pts, round = 0.3) {
  const n = pts.length;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const a = mix(p1, p0, round), b = mix(p1, p2, round);
    if (i === 0) c.moveTo(a.x, a.y);
    else c.lineTo(a.x, a.y);
    c.quadraticCurveTo(p1.x, p1.y, b.x, b.y);
  }
  c.closePath();
}

function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return V(x / pts.length, y / pts.length);
}

// a plate: polygon filled with a gradient across `axis` (the direction its surface curves along)
function plate(c, pts, col, o = {}) {
  const round = o.round ?? 0.3;
  const cen = o.center ?? centroid(pts);
  const ax = unit(o.axis ?? perp(R.light));
  const ext = o.ext ?? 10;
  smoothPath(c, pts, round);
  if (R.mode === 'normal') {
    const g = c.createLinearGradient(cen.x - ax.x * ext, cen.y - ax.y * ext, cen.x + ax.x * ext, cen.y + ax.y * ext);
    const tilt = o.tilt ?? V(0, -0.15);
    g.addColorStop(0, ncol(-ax.x * 0.9 + tilt.x, -ax.y * 0.9 + tilt.y));
    g.addColorStop(0.5, ncol(tilt.x, tilt.y));
    g.addColorStop(1, ncol(ax.x * 0.9 + tilt.x, ax.y * 0.9 + tilt.y));
    c.fillStyle = g;
    c.fill();
    return;
  }
  // which end of the axis faces the light
  const lit = ax.x * R.light.x + ax.y * R.light.y > 0 ? 1 : -1;
  const g = c.createLinearGradient(cen.x + ax.x * ext * lit, cen.y + ax.y * ext * lit, cen.x - ax.x * ext * lit, cen.y - ax.y * ext * lit);
  g.addColorStop(0, col.hi);
  g.addColorStop(0.42, col.base);
  g.addColorStop(1, col.lo);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = OUT;
  c.lineWidth = 0.9;
  c.stroke();
}

// a tapered armored segment from joint a to joint b
function limb(c, a, b, wa, wb, col, o = {}) {
  const d = unit(sub(b, a)), n = perp(d);
  const bt = o.bulgeAt ?? 0.4;
  const m = mix(a, b, bt);
  const wm = ((wa + wb) / 2) * (1 + (o.bulge ?? 0.1));
  const ea = sub(a, mul(d, o.capA ?? 1.5)), eb = add(b, mul(d, o.capB ?? 1.5));
  const pts = [
    add(ea, mul(n, wa * 0.3)), add(a, mul(n, wa / 2)), add(m, mul(n, wm / 2)), add(b, mul(n, wb / 2)), add(eb, mul(n, wb * 0.3)),
    add(eb, mul(n, -wb * 0.3)), add(b, mul(n, -wb / 2)), add(m, mul(n, -wm / 2)), add(a, mul(n, -wa / 2)), add(ea, mul(n, -wa * 0.3)),
  ];
  plate(c, pts, col, { axis: n, center: m, ext: wm / 2, round: 0.35 });
  if (R.mode !== 'color') return;
  const lit = n.x * R.light.x + n.y * R.light.y > 0 ? 1 : -1;
  // sharp specular edge on the lit side
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(235,245,255,0.75)';
  c.lineWidth = Math.max(0.8, wm * 0.09);
  c.beginPath();
  const s0 = add(mix(a, b, 0.14), mul(n, (wa / 2) * 0.62 * lit)), s1 = add(mix(a, b, 0.82), mul(n, (wb / 2) * 0.62 * lit));
  c.moveTo(s0.x, s0.y);
  c.quadraticCurveTo(m.x + n.x * (wm / 2) * 0.7 * lit, m.y + n.y * (wm / 2) * 0.7 * lit, s1.x, s1.y);
  c.stroke();
  // rim light: the room's glow catching the far edge
  if (o.rim !== false) {
    c.strokeStyle = `rgba(${R.rim},0.55)`;
    c.lineWidth = 1.1;
    c.beginPath();
    const r0 = add(mix(a, b, 0.1), mul(n, (-wa / 2) * 0.92 * lit)), r1 = add(mix(a, b, 0.9), mul(n, (-wb / 2) * 0.92 * lit));
    c.moveTo(r0.x, r0.y);
    c.quadraticCurveTo(m.x - n.x * (wm / 2) * 0.95 * lit, m.y - n.y * (wm / 2) * 0.95 * lit, r1.x, r1.y);
    c.stroke();
  }
  // panel lines across the plate
  for (const t of o.bands || []) {
    const p = mix(a, b, t);
    const w = wa + (wb - wa) * t;
    c.strokeStyle = 'rgba(3,6,16,0.7)';
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(p.x + n.x * w * 0.46, p.y + n.y * w * 0.46);
    c.lineTo(p.x - n.x * w * 0.46, p.y - n.y * w * 0.46);
    c.stroke();
  }
  // a colored trim ring, like the white bands on her cannon
  for (const tr of o.trim || []) {
    const p = mix(a, b, tr.t);
    const w = (wa + (wb - wa) * tr.t) * 0.52;
    c.strokeStyle = tr.col;
    c.lineWidth = tr.w || 2;
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo(p.x + n.x * w, p.y + n.y * w);
    c.lineTo(p.x - n.x * w, p.y - n.y * w);
    c.stroke();
  }
}

// the big shoulder guard: a layered armored dome with a trim lip, lit like metal
function pauldron(c, x, y, r) {
  if (R.mode === 'normal') {
    shell(c, x, y, r, C.blue);
    return;
  }
  const L = R.light;
  const la = Math.atan2(L.y, L.x);
  // under-layer peeking out below
  c.fillStyle = C.blue.lo;
  c.beginPath(); c.ellipse(x + 0.5, y + r * 0.55, r * 0.95, r * 0.55, 0, 0, TAU); c.fill();
  // main dome: broad soft falloff, no mirror highlight
  const g = c.createLinearGradient(x + L.x * r, y + L.y * r, x - L.x * r, y - L.y * r);
  g.addColorStop(0, '#6f97d6');
  g.addColorStop(0.35, C.blue.base);
  g.addColorStop(0.75, '#16336e');
  g.addColorStop(1, C.blue.lo);
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.strokeStyle = OUT;
  c.lineWidth = 0.9;
  c.stroke();
  // the inner plate, slightly raised
  const g2 = c.createLinearGradient(x + L.x * r * 0.7, y + L.y * r * 0.7, x - L.x * r * 0.7, y - L.y * r * 0.7);
  g2.addColorStop(0, '#86aee8');
  g2.addColorStop(0.5, '#2e5cbc');
  g2.addColorStop(1, '#0d2154');
  c.fillStyle = g2;
  c.beginPath(); c.arc(x + 0.6, y - 0.6, r * 0.66, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(4,10,30,0.8)';
  c.lineWidth = 1;
  c.stroke();
  // white trim along the lit edge, dark panel seam on the other
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(232,240,255,0.92)';
  c.lineWidth = 1.7;
  c.beginPath(); c.arc(x, y, r * 0.83, la - 1.3, la + 1.0); c.stroke();
  c.strokeStyle = 'rgba(4,10,30,0.75)';
  c.lineWidth = 1;
  c.beginPath(); c.arc(x, y, r * 0.83, la + 1.3, la + 3.6); c.stroke();
  // a thin specular glint, not a blob
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.lineWidth = 1;
  c.beginPath(); c.arc(x + 0.6, y - 0.6, r * 0.5, la - 0.5, la + 0.15); c.stroke();
  c.strokeStyle = `rgba(${R.rim},0.6)`;
  c.lineWidth = 1.2;
  c.beginPath(); c.arc(x, y, r - 0.7, la + Math.PI - 0.9, la + Math.PI + 0.7); c.stroke();
}

// a rounded shell: the helmet dome, knee caps, the ball
function shell(c, x, y, r, col, o = {}) {
  if (R.mode === 'normal') {
    const g = c.createLinearGradient(x - r, y, x + r, y);
    g.addColorStop(0, ncol(-0.85, -0.2));
    g.addColorStop(0.5, ncol(0, -0.25));
    g.addColorStop(1, ncol(0.85, -0.2));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    return;
  }
  const L = R.light;
  const g = c.createRadialGradient(x + L.x * r * 0.42, y + L.y * r * 0.42, r * 0.08, x, y, r * 1.02);
  g.addColorStop(0, col.hi);
  g.addColorStop(0.5, col.base);
  g.addColorStop(1, col.lo);
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.strokeStyle = OUT;
  c.lineWidth = 0.9;
  c.stroke();
  const la = Math.atan2(L.y, L.x);
  for (let k = 0; k < (o.bands || 0); k++) {
    const rr = r * (0.82 - k * 0.22);
    c.strokeStyle = k === 0 ? 'rgba(236,242,255,0.9)' : 'rgba(10,18,44,0.75)';
    c.lineWidth = k === 0 ? 1.6 : 1;
    c.beginPath(); c.arc(x, y, rr, la + 1.2, la + 4.2); c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = Math.max(0.9, r * 0.12);
  c.lineCap = 'round';
  c.beginPath(); c.arc(x, y, r * 0.74, la - 0.55, la + 0.35); c.stroke();
  if (o.rim !== false) {
    c.strokeStyle = `rgba(${R.rim},0.6)`;
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(x, y, r - 0.7, la + Math.PI - 0.8, la + Math.PI + 0.8); c.stroke();
  }
}

function glowDot(c, x, y, r, rgb, a = 1) {
  if (R.mode !== 'color') return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 0, x, y, r * 3.2);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
  g.addColorStop(0.25, `rgba(${rgb},${0.85 * a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r * 3.2, 0, TAU); c.fill();
  c.restore();
}

// ---------------------------------------------------------------- parts

function leg(c, hip, L, back) {
  const TH = 20, SH = 21;
  const k = V(hip.x + Math.sin(L.th) * TH, hip.y + Math.cos(L.th) * TH);
  const sa = L.th - L.kn;
  const an = V(k.x + Math.sin(sa) * SH, k.y + Math.cos(sa) * SH);
  const col = back ? C.blueB : C.blue;
  if (R.mode === 'color') {
    c.fillStyle = C.under.base;
    c.beginPath(); c.arc(hip.x, hip.y, 5.6, 0, TAU); c.fill();
    c.beginPath(); c.arc(k.x, k.y, 4.4, 0, TAU); c.fill();
  }
  limb(c, hip, k, 12, 9, col, { bulge: 0.14, bands: [0.64], rim: !back });
  limb(c, k, an, 8.4, 7.4, col, { bulge: 0.24, bulgeAt: 0.34, bands: [0.58], rim: !back });
  // boot
  const d = unit(sub(an, k)), f = V(d.y, -d.x);
  const P = (fx, dy) => add(an, add(mul(f, fx), mul(d, dy)));
  plate(c, [P(-4.5, -3), P(3, -3.5), P(8.5, -0.5), P(12, 2.2), P(11.5, 4.2), P(-5.5, 4.2), P(-6, 0)], back ? C.blueB : C.blue, { axis: d, ext: 5, round: 0.28, tilt: V(0, -0.3) });
  if (R.mode === 'color') {
    c.fillStyle = back ? '#10131c' : '#171b27';
    smoothPath(c, [P(-5.5, 2.8), P(12, 2.8), P(11.5, 4.4), P(-5.5, 4.4)], 0.3);
    c.fill();
    c.strokeStyle = 'rgba(235,245,255,0.55)';
    c.lineWidth = 0.9;
    c.beginPath(); const t0 = P(-2, -2.6), t1 = P(8, -0.2); c.moveTo(t0.x, t0.y); c.lineTo(t1.x, t1.y); c.stroke();
  }
  shell(c, k.x + 1.2, k.y + 0.2, back ? 4 : 4.6, back ? C.redB : C.red, { rim: !back });
  if (!back) glowDot(c, k.x + 2.8, k.y + 0.6, 0.8, '190,255,120', 0.9);
}

function offArm(c, sh, A, reachGlow) {
  const UL = 12.5, FL = 12.5;
  const e = V(sh.x + Math.sin(A.sh) * UL, sh.y + Math.cos(A.sh) * UL);
  const fa = A.sh + A.el;
  const h = V(e.x + Math.sin(fa) * FL, e.y + Math.cos(fa) * FL);
  limb(c, sh, e, 8, 7, C.blueB, { bulge: 0.08, rim: false });
  limb(c, e, h, 8.5, 9.2, C.blueB, { bulge: 0.12, bulgeAt: 0.6, bands: [0.35], rim: false });
  if (reachGlow > 0 && R.mode === 'color') {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(h.x, h.y, 0, h.x, h.y, 16);
    g.addColorStop(0, `rgba(255,120,220,${0.9 * reachGlow})`);
    g.addColorStop(1, 'rgba(255,60,180,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(h.x, h.y, 16, 0, TAU); c.fill();
    c.restore();
  }
  shell(c, h.x, h.y, 4.4, C.redB, { rim: false });
}

function torso(c, H, lean) {
  const u = V(Math.sin(lean), -Math.cos(lean)), n = V(Math.cos(lean), Math.sin(lean));
  const P = (a, b) => V(H.x + u.x * a + n.x * b, H.y + u.y * a + n.y * b);
  if (R.mode === 'color') {
    // undersuit behind everything
    c.fillStyle = C.under.base;
    smoothPath(c, [P(-4, -7), P(-4, 7), P(27, 7), P(27, -8)], 0.3);
    c.fill();
  }
  // hip armor: a belt with side plates
  plate(c, [P(-4.5, -8.2), P(-4, 8.5), P(3.5, 9.5), P(4.5, -8.6)], C.blue, { axis: n, ext: 9, round: 0.3 });
  // abdomen: pale segmented plating
  plate(c, [P(2.5, -5.8), P(2.5, 6.6), P(12.5, 7.8), P(13, -5)], C.white, { axis: n, ext: 7, round: 0.25 });
  if (R.mode === 'color') {
    c.strokeStyle = 'rgba(30,40,60,0.75)';
    c.lineWidth = 0.9;
    for (const a of [5.4, 8.4, 11.2]) {
      const p0 = P(a, -5), p1 = P(a + 0.4, 7);
      c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
    }
    const m0 = P(3, 1.2), m1 = P(12.5, 1.2);
    c.beginPath(); c.moveTo(m0.x, m0.y); c.lineTo(m1.x, m1.y); c.stroke();
  }
  // chest plate: a shield shape, broad at the shoulders
  const chest = [P(11.5, -7.6), P(12.2, 8.6), P(18.5, 12.2), P(25.5, 11.8), P(28.3, 4.2), P(28, -8.4), P(21.5, -10.8), P(14.5, -9.4)];
  plate(c, chest, C.red, { axis: n, ext: 11, round: 0.28, tilt: V(0, -0.25) });
  if (R.mode === 'color') {
    // plate seams and a bright upper edge
    c.strokeStyle = 'rgba(40,6,4,0.8)';
    c.lineWidth = 0.9;
    const s0 = P(19, -9.8), s1 = P(18.5, 11.6);
    c.beginPath(); c.moveTo(s0.x, s0.y); c.quadraticCurveTo(P(19.5, 1).x, P(19.5, 1).y, s1.x, s1.y); c.stroke();
    c.strokeStyle = 'rgba(255,215,200,0.7)';
    c.lineWidth = 1.1;
    const h0 = P(27.4, -6), h1 = P(27.6, 3.5);
    c.beginPath(); c.moveTo(h0.x, h0.y); c.lineTo(h1.x, h1.y); c.stroke();
    c.strokeStyle = `rgba(${R.rim},0.55)`;
    c.lineWidth = 1.1;
    const b0 = P(13, -8.6), b1 = P(26, -9.4);
    c.beginPath(); c.moveTo(b0.x, b0.y); c.lineTo(b1.x, b1.y); c.stroke();
    const lp = P(21.5, 6.2);
    c.fillStyle = '#0d1a0a';
    c.beginPath(); c.arc(lp.x, lp.y, 1.9, 0, TAU); c.fill();
    glowDot(c, lp.x, lp.y, 1.1, '170,255,110', 1);
  }
  return P;
}

function helmet(c, hc, rav) {
  if (R.mode === 'color') {
    c.fillStyle = C.under.base;
    c.beginPath(); c.ellipse(hc.x - 1, hc.y + 8, 6.5, 4, 0.1, 0, TAU); c.fill();
  }
  shell(c, hc.x, hc.y, 10.8, C.red, {});
  if (R.mode !== 'color') return;
  // crest ridge along the dome
  c.strokeStyle = 'rgba(60,8,4,0.7)';
  c.lineWidth = 1;
  c.beginPath(); c.arc(hc.x + 0.5, hc.y + 1, 9.2, -2.9, -1.35); c.stroke();
  // side vent
  c.fillStyle = '#5a130c';
  c.beginPath(); c.arc(hc.x - 3.2, hc.y + 1.4, 3.3, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,190,170,0.55)';
  c.lineWidth = 0.8;
  c.beginPath(); c.arc(hc.x - 3.2, hc.y + 1.4, 3.3, -2.6, -0.6); c.stroke();
  // visor frame, then the glass
  const vc = rav ? ['#ffd6f4', '#ff4fbf', '#5a0b3e'] : ['#f6ffc2', '#b8ee4a', '#2c5e0c'];
  c.fillStyle = '#0c0d12';
  c.beginPath();
  c.moveTo(hc.x - 0.6, hc.y - 5.6);
  c.quadraticCurveTo(hc.x + 11.4, hc.y - 8.2, hc.x + 13, hc.y + 0.4);
  c.quadraticCurveTo(hc.x + 9.2, hc.y + 6.2, hc.x + 0.8, hc.y + 4);
  c.closePath();
  c.fill();
  const g = c.createLinearGradient(hc.x + 2, hc.y - 6, hc.x + 11, hc.y + 5);
  g.addColorStop(0, vc[0]);
  g.addColorStop(0.45, vc[1]);
  g.addColorStop(1, vc[2]);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(hc.x + 0.8, hc.y - 4.4);
  c.quadraticCurveTo(hc.x + 10.4, hc.y - 6.6, hc.x + 11.6, hc.y + 0.4);
  c.quadraticCurveTo(hc.x + 8.4, hc.y + 4.8, hc.x + 1.8, hc.y + 2.8);
  c.closePath();
  c.fill();
  // horizon reflection: the lower half of the glass is darker
  c.save();
  c.clip();
  c.fillStyle = 'rgba(10,30,10,0.35)';
  c.fillRect(hc.x, hc.y + 0.6, 14, 6);
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 1.05;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(hc.x + 3, hc.y - 3.8);
  c.quadraticCurveTo(hc.x + 7.8, hc.y - 5.2, hc.x + 10, hc.y - 2.6);
  c.stroke();
  glowDot(c, hc.x + 7, hc.y - 0.5, 2.2, rav ? '255,90,210' : '190,255,110', 0.35);
  // chin guard
  c.fillStyle = '#8c2418';
  c.beginPath();
  c.moveTo(hc.x + 1.5, hc.y + 5);
  c.quadraticCurveTo(hc.x + 7, hc.y + 7.2, hc.x + 10.5, hc.y + 3.6);
  c.lineTo(hc.x + 8.5, hc.y + 7.8);
  c.quadraticCurveTo(hc.x + 4, hc.y + 9.6, hc.x + 0.5, hc.y + 7.4);
  c.closePath();
  c.fill();
}

function cannon(c, pv, ang, p) {
  const d = V(Math.cos(ang), Math.sin(ang)), n = perp(d);
  const A = (t) => add(pv, mul(d, t));
  limb(c, A(-1), A(12), 14.2, 15.4, C.blue, { bulge: 0.05, capA: 2, trim: [{ t: 0.95, col: 'rgba(230,238,250,0.95)', w: 2.2 }], bands: [0.45] });
  limb(c, A(12), A(29), 14.4, 12.8, C.blue, { bulge: 0.03, capA: 0.5, capB: 0.5, bands: [0.3, 0.55], trim: [{ t: 0.8, col: 'rgba(12,22,50,0.9)', w: 1.5 }] });
  // muzzle ring
  limb(c, A(29), A(33), 13.8, 13.6, C.gunmetal, { bulge: 0, capA: 0.3, capB: 0.6, rim: false });
  if (R.mode !== 'color') return;
  const mz = A(33.5);
  c.fillStyle = '#05070c';
  c.beginPath(); c.ellipse(mz.x, mz.y, 3.4, 6.2, ang, 0, TAU); c.fill();
  const glowA = 0.5 + p.charge * 0.5;
  const col = p.rav ? '255,110,210' : '190,255,120';
  c.strokeStyle = `rgba(${col},${0.55 + 0.45 * glowA})`;
  c.lineWidth = 1.1;
  c.beginPath(); c.ellipse(mz.x, mz.y, 2.4, 4.6, ang, 0, TAU); c.stroke();
  const lt = add(A(7), mul(n, -7.6));
  glowDot(c, lt.x, lt.y, 1, col, 0.9);
  if (p.charge > 0.05) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const r = 5 + p.charge * 12 + Math.sin(p.animT * 40) * 1.5 * p.charge;
    const g = c.createRadialGradient(mz.x, mz.y, 0, mz.x, mz.y, r * 1.8);
    const cc = p.rav ? '255,100,210' : '255,210,120';
    g.addColorStop(0, `rgba(255,255,255,${0.9 * p.charge})`);
    g.addColorStop(0.3, `rgba(${cc},${0.8 * p.charge})`);
    g.addColorStop(1, `rgba(${cc},0)`);
    c.fillStyle = g;
    c.beginPath(); c.arc(mz.x, mz.y, r * 1.8, 0, TAU); c.fill();
    c.restore();
  }
}

// ---------------------------------------------------------------- the whole suit

export function drawSuit(c, p, s, mode = 'color') {
  R.mode = mode;
  R.facing = p.facing;
  R.light = V(-0.78 * p.facing, -0.62);
  R.rim = p.rim ? p.rim.join(',') : '255,215,170';
  c.save();
  c.translate(p.x, p.y);
  c.scale(p.facing, 1);
  if (p.landT > 0) {
    const k = p.landT / 0.12;
    c.scale(1 + 0.07 * k, 1 - 0.09 * k);
  }
  if (p.spin) {
    c.translate(0, -44);
    c.rotate(p.spinA);
    c.translate(0, 44);
  }
  const H = V(0, s.hipY);
  const up = (d, side = 0) => V(H.x + Math.sin(s.lean) * d + Math.cos(s.lean) * side, H.y - Math.cos(s.lean) * d + Math.sin(s.lean) * side);
  const shoulder = up(25, 1);
  const head = up(36.5, 3);
  head.y += s.headY;

  leg(c, V(H.x - 3, H.y), s.bk, true);
  offArm(c, V(shoulder.x - 5, shoulder.y + 2), s.off, s.off.reach ? 1 : 0);
  shell(c, shoulder.x - 7, shoulder.y + 1, 9.2, C.blueB, { rim: false });
  torso(c, H, s.lean);
  leg(c, V(H.x + 2, H.y), s.fr, false);
  helmet(c, head, p.rav);
  // the cannon comes out from under the big front pauldron
  cannon(c, V(shoulder.x + 3, shoulder.y + 8), s.arm, p);
  if (mode === 'color') {
    c.fillStyle = 'rgba(2,6,18,0.5)';
    c.beginPath(); c.ellipse(shoulder.x + 3.5, shoulder.y + 10.5, 9.5, 3.2, 0, 0, TAU); c.fill();
  }
  pauldron(c, shoulder.x + 2, shoulder.y + 2.5, 11.6);
  c.restore();
  R.mode = 'color';
}

// ---------------------------------------------------------------- the Morph Ball

export function drawBall(c, p, mode = 'color') {
  R.mode = mode;
  R.facing = 1;
  R.light = V(-0.78, -0.62);
  R.rim = p.rim ? p.rim.join(',') : '255,215,170';
  const x = p.x, y = p.y - 14, r = 14;
  if (mode === 'normal') {
    shell(c, x, y, r, C.blue);
    R.mode = 'color';
    return;
  }
  c.save();
  c.globalCompositeOperation = 'lighter';
  const gl = c.createRadialGradient(x, y, 0, x, y, r * 2.4);
  gl.addColorStop(0, p.rav ? 'rgba(255,90,200,0.35)' : 'rgba(255,170,110,0.25)');
  gl.addColorStop(1, 'rgba(255,120,80,0)');
  c.fillStyle = gl;
  c.beginPath(); c.arc(x, y, r * 2.4, 0, TAU); c.fill();
  c.restore();
  pauldron(c, x, y, r);
  c.save();
  c.translate(x, y);
  c.rotate(p.rollA);
  // four armored segments with red caps, rolling
  for (let k = 0; k < 4; k++) {
    c.save();
    c.rotate((k * Math.PI) / 2);
    const g = c.createLinearGradient(0, -r, 0, -r * 0.4);
    g.addColorStop(0, k % 2 ? '#ff8f74' : '#dfe7f4');
    g.addColorStop(1, k % 2 ? '#7c1c12' : '#56637a');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, r - 1.6, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42);
    c.arc(0, 0, r * 0.52, -Math.PI / 2 + 0.42, -Math.PI / 2 - 0.42, true);
    c.closePath();
    c.fill();
    c.strokeStyle = OUT;
    c.lineWidth = 0.8;
    c.stroke();
    c.restore();
  }
  c.strokeStyle = 'rgba(4,10,30,0.9)';
  c.lineWidth = 1.4;
  c.beginPath(); c.arc(0, 0, r * 0.5, 0, TAU); c.stroke();
  c.restore();
  // the energy core in the seam
  const pulse = 0.6 + 0.4 * Math.sin(p.animT * 8);
  glowDot(c, x, y, 2.6, p.rav ? '255,110,220' : '190,255,120', pulse);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath(); c.ellipse(x - 5, y - 6, 4, 2.2, -0.6, 0, TAU); c.fill();
}
