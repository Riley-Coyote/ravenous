// The opening movie, drawn in code. Four shots:
//   1. space: the gunship in an asteroid field, ambushed, shield broken, hit
//   2. descent: a fireball over the dunes, impact
//   3. the surface, in grey: Samus rises, the Five blink in on the ridge, the ground swallows her
//   4. overhead: five hats around the hole (the trailer's opening shot, made our own)

import { clamp, lerp, rand, TAU, easeOutCubic, easeInOutCubic, mulberry32, makeCanvas, makeNoise2D } from './util.js';
import { VIEW_W, VIEW_H } from './art.js';
import { drawSamus } from './player.js';

const W = VIEW_W, H = VIEW_H;
const SHOTS = [
  { name: 'space', t0: 0, t1: 6.4 },
  { name: 'descent', t0: 6.4, t1: 10.6 },
  { name: 'surface', t0: 10.6, t1: 20.2 },
  { name: 'overhead', t0: 20.2, t1: 24.0 },
];
const END = 24.0;

const HUNTERS = [
  { x: 150, s: 0.78, eye: '255,150,60', rim: '232,51,63', robe: 'dark', t: 12.6 },
  { x: 290, s: 0.86, eye: '200,255,90', rim: '232,51,63', robe: 'red', t: 13.0 },
  { x: 760, s: 1.0, eye: '255,170,80', rim: '232,51,63', robe: 'dark', t: 13.4, lead: true },
  { x: 920, s: 0.84, eye: '255,230,150', rim: '232,51,63', robe: 'gold', t: 13.8 },
  { x: 1060, s: 0.76, eye: '140,220,255', rim: '232,51,63', robe: 'white', t: 14.2 },
];

export class Cinematic {
  constructor(g) {
    this.g = g;
    this.t = 0;
    this.done = false;
    this.parts = [];
    const rng = mulberry32(1234);
    this.stars = Array.from({ length: 260 }, () => ({ x: rng() * W, y: rng() * H, s: rng() * 1.6 + 0.3, l: rng() < 0.7 ? 0 : rng() < 0.7 ? 1 : 2, tw: rng() * TAU }));
    this.rocks = Array.from({ length: 26 }, (_, i) => {
      const r = 8 + rng() * (i < 6 ? 60 : 30);
      const pts = Array.from({ length: 9 }, (_, k) => 0.72 + rng() * 0.4);
      return { x0: rng() * W * 1.6, y: rng() * H, r, v: 40 + rng() * 160 + (r > 40 ? 90 : 0), a: rng() * TAU, va: (rng() - 0.5) * 0.8, pts, near: r > 40 };
    });
    this.nebula = paintNebula();
    this.moon = paintMoon();
    this.sand = paintSandTop();
    this.cues = [
      [0.4, () => g.sfx('start')],
      [2.5, () => g.sfx('charged')],
      [2.75, () => { g.sfx('counter'); this.shake = 0.5; }],
      [3.1, () => g.hud.say('SAMUS', 'Shields holding. No, failing.', 1.9)],
      [3.95, () => g.sfx('charged')],
      [4.25, () => { g.sfx('explode'); this.shake = 1; this.burst(this.shipPos(4.25), 60, ['255,200,120', '255,120,60', '255,255,230']); }],
      [4.9, () => g.hud.say('SAMUS', "I'm hit. Going down.", 1.6)],
      [6.5, () => g.sfx('missile')],
      [8.7, () => { g.sfx('bigLand'); g.sfx('explode'); this.shake = 1; }],
      [11.2, () => g.sfx('land')],
      ...HUNTERS.map((h) => [h.t, () => g.sfx('blink')]),
      [14.7, () => g.hud.say('SAMUS', 'Company.', 1.3)],
      [15.9, () => { g.sfx('bossVoice'); g.hud.say('HOLLOW BRIM', 'The hunter falls here.', 2.0); }],
      [17.5, () => { g.sfx('telegraph'); this.shake = 0.3; }],
      [17.9, () => { g.sfx('crumble'); this.shake = 0.6; }],
      [18.6, () => { g.sfx('bigLand'); this.shake = 1; }],
      [20.4, () => g.sfx('crumble')],
    ];
    this.cueIdx = 0;
    this.shake = 0;
    g.hud.clearSubs();
  }

  skip() {
    if (this.done) return;
    this.done = true;
    this.g.hud.clearSubs();
    this.g.endCinematic();
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    while (this.cueIdx < this.cues.length && this.cues[this.cueIdx][0] <= this.t) this.cues[this.cueIdx++][1]();
    this.g.hud.update(dt, this.g);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += (p.grav || 0) * dt;
      p.vx *= 1 - (p.drag || 0) * dt;
      p.vy *= 1 - (p.drag || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grow) p.r += p.grow * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    this.emit(dt);
    if (this.t > END) this.skip();
  }

  burst(pos, n, cols) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = rand(80, 520);
      this.parts.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 1), max: 1, r: rand(1.5, 4), col: cols[i % cols.length], add: true, drag: 1.5, shot: 'space' });
    }
  }

  shot() {
    return SHOTS.find((s) => this.t >= s.t0 && this.t < s.t1) || SHOTS[SHOTS.length - 1];
  }

  // continuous emitters for smoke, fire, sand
  emit(dt) {
    const t = this.t;
    const s = this.shot();
    if (s.name === 'space' && t > 4.25) {
      const sp = this.shipPos(t);
      if (Math.random() < dt * 40) this.parts.push({ x: sp.x - 30, y: sp.y, vx: rand(-160, -60), vy: rand(-20, 20), life: rand(0.6, 1.2), max: 1.2, r: rand(6, 12), grow: 20, col: '90,90,100', alpha: 0.5, shot: 'space' });
      if (Math.random() < dt * 30) this.parts.push({ x: sp.x - 20, y: sp.y, vx: rand(-200, -80), vy: rand(-30, 30), life: rand(0.2, 0.5), max: 0.5, r: rand(3, 7), col: '255,150,60', add: true, shot: 'space' });
    }
    if (s.name === 'descent' && t < 8.7) {
      const fp = this.firePos(t);
      if (Math.random() < dt * 60) this.parts.push({ x: fp.x, y: fp.y, vx: rand(-40, 40), vy: rand(-40, 10), life: rand(0.8, 1.6), max: 1.6, r: rand(8, 16), grow: 18, col: '70,60,60', alpha: 0.45, shot: 'descent' });
    }
    if (s.name === 'descent' && t > 8.7 && t < 9.6) {
      for (let k = 0; k < 3; k++) this.parts.push({ x: 880 + rand(-60, 60), y: 520, vx: rand(-60, 60), vy: rand(-260, -80), life: rand(1.2, 2.2), max: 2.2, r: rand(20, 40), grow: 40, col: '190,160,140', alpha: 0.45, drag: 0.8, shot: 'descent' });
    }
    if (s.name === 'surface') {
      if (Math.random() < dt * 50) this.parts.push({ x: W + 10, y: rand(200, H), vx: -rand(500, 900), vy: rand(-10, 10), life: 2.5, max: 2.5, r: rand(0.8, 1.6), streak: rand(20, 60), col: '235,232,225', alpha: 0.4, shot: 'surface' });
      if (Math.random() < dt * 8) this.parts.push({ x: 1010 + rand(-20, 20), y: 470, vx: rand(-30, -10), vy: rand(-60, -30), life: rand(2, 3), max: 3, r: rand(8, 14), grow: 12, col: '80,80,80', alpha: 0.4, shot: 'surface' });
      if (t > 18.6) {
        for (let k = 0; k < 4; k++) this.parts.push({ x: rand(330, 510), y: 560 + rand(-6, 6), vx: rand(-40, 40), vy: rand(60, 240), grav: 600, life: rand(0.6, 1.2), max: 1.2, r: rand(1, 2.4), col: '200,196,188', alpha: 0.8, shot: 'surface' });
      }
    }
    if (s.name === 'overhead') {
      for (let k = 0; k < 2; k++) {
        const a = rand(TAU), rr = rand(160, 260);
        this.parts.push({ x: W / 2 + Math.cos(a) * rr, y: H / 2 + Math.sin(a) * rr * 0.9, sp: true, a, rr, life: 2, max: 2, r: rand(1, 2.2), col: '214,210,200', alpha: 0.7, shot: 'overhead' });
      }
    }
  }

  // ------------------------------------------------------------ paths

  shipPos(t) {
    if (t < 2.2) return { x: lerp(-220, 520, easeOutCubic(t / 2.2)), y: 330 + Math.sin(t * 1.4) * 6, rot: 0 };
    if (t < 4.25) return { x: 520 + (t - 2.2) * 30, y: 330 + Math.sin(t * 1.4) * 6, rot: Math.sin(t * 2) * 0.03 };
    const k = t - 4.25;
    return { x: 581 + k * 260, y: 330 + k * k * 60, rot: k * 2.4 };
  }

  firePos(t) {
    const k = clamp((t - 6.4) / 2.3, 0, 1);
    return { x: lerp(120, 880, k), y: lerp(-40, 520, k * k) };
  }

  // ------------------------------------------------------------ drawing

  // the picture itself: goes through the lens
  drawWorld(c) {
    const s = this.shot();
    const t = this.t;
    c.save();
    if (this.shake > 0) c.translate((Math.random() - 0.5) * 18 * this.shake * this.shake, (Math.random() - 0.5) * 14 * this.shake * this.shake);
    if (s.name === 'space') this.drawSpace(c, t);
    else if (s.name === 'descent') this.drawDescent(c, t);
    else if (s.name === 'surface') this.drawSurface(c, t);
    else this.drawOverhead(c, t);
    this.drawParts(c, s.name);
    c.restore();
    // cuts: quick dips to black between shots, a fade at each end
    let fade = 0;
    for (const sh of SHOTS) {
      if (t >= sh.t0 && t < sh.t0 + 0.35) fade = Math.max(fade, 1 - (t - sh.t0) / 0.35);
      if (t > sh.t1 - 0.2 && t <= sh.t1) fade = Math.max(fade, (t - (sh.t1 - 0.2)) / 0.2);
    }
    if (t < 0.8) fade = Math.max(fade, 1 - t / 0.8);
    if (t > END - 1.4) fade = Math.max(fade, (t - (END - 1.4)) / 1.2);
    if (s.name === 'descent' && t > 8.7 && t < 9.0) {
      c.fillStyle = `rgba(255,250,235,${1 - (t - 8.7) / 0.3})`;
      c.fillRect(0, 0, W, H);
    }
    if (fade > 0) {
      c.fillStyle = `rgba(3,3,5,${clamp(fade, 0, 1)})`;
      c.fillRect(0, 0, W, H);
    }
  }

  // bars, subtitles and the skip hint: stay sharp on top
  drawUI(c) {
    // letterbox bars: this is a movie
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, 54);
    c.fillRect(0, H - 54, W, 54);
    this.g.hud.drawSub(c);
    c.font = '500 11px "Inter", system-ui, sans-serif';
    if ('letterSpacing' in c) c.letterSpacing = '0.2em';
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.fillText(this.g.input.lastDevice === 'touch' ? 'TAP TO SKIP' : `${this.g.input.label('confirm').toUpperCase()} TO SKIP`, W - 200, 34);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
  }

  drawParts(c, shot) {
    for (const p of this.parts) {
      if (p.shot !== shot) continue;
      const k = p.life / p.max;
      if (p.sp) {
        // sand spiralling into the hole
        const age = 1 - k;
        const rr = p.rr * (1 - age * 0.9);
        const a = p.a + age * 2.4;
        p.x = W / 2 + Math.cos(a) * rr;
        p.y = H / 2 + Math.sin(a) * rr * 0.9;
      }
      c.save();
      if (p.add) c.globalCompositeOperation = 'lighter';
      const alpha = (p.alpha ?? 1) * (p.add ? k : Math.min(1, k * 2));
      if (p.streak) {
        c.strokeStyle = `rgba(${p.col},${alpha})`;
        c.lineWidth = p.r;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + p.streak, p.y); c.stroke();
      } else {
        c.fillStyle = `rgba(${p.col},${alpha})`;
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
      }
      c.restore();
    }
  }

  drawSpace(c, t) {
    const bg = c.createRadialGradient(W * 0.7, H * 0.4, 0, W * 0.7, H * 0.4, W);
    bg.addColorStop(0, '#141231');
    bg.addColorStop(0.5, '#080816');
    bg.addColorStop(1, '#020206');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.85;
    c.drawImage(this.nebula, -((t * 8) % 40), 0, W + 40, H);
    c.globalAlpha = 1;
    for (const s of this.stars) {
      const sp = [6, 18, 40][s.l];
      const x = ((s.x - t * sp) % W + W) % W;
      c.fillStyle = `rgba(230,235,255,${0.35 + 0.35 * Math.sin(t * 2 + s.tw) * (s.l === 0 ? 1 : 0.3) + s.l * 0.15})`;
      c.fillRect(x, s.y, s.s, s.s);
    }
    // the moon ahead, growing
    const ms = 1 + t * 0.02;
    c.save();
    c.translate(1130, 600);
    c.scale(ms, ms);
    c.drawImage(this.moon, -400, -400);
    c.restore();
    // far asteroids behind the ship
    for (const r of this.rocks) if (!r.near) this.drawRock(c, r, t);
    this.drawShip(c, t);
    for (const r of this.rocks) if (r.near) this.drawRock(c, r, t);
    // enemy fire from off-screen
    for (const [t0, n] of [[2.45, 3], [3.9, 4]]) {
      for (let i = 0; i < n; i++) {
        const k = (t - t0 - i * 0.05) / 0.3;
        if (k < 0 || k > 1) continue;
        const sp = this.shipPos(t0 + 0.3);
        const x0 = W + 60 - i * 30, y0 = -40 + i * 40;
        const x = lerp(x0, sp.x + 20, k), y = lerp(y0, sp.y - 10, k);
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = 'rgba(255,90,70,0.9)';
        c.lineWidth = 4;
        const ang = Math.atan2(sp.y - y0, sp.x - x0);
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - Math.cos(ang) * 70, y - Math.sin(ang) * 70); c.stroke();
        c.strokeStyle = 'rgba(255,230,210,0.9)';
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - Math.cos(ang) * 40, y - Math.sin(ang) * 40); c.stroke();
        c.restore();
      }
    }
  }

  drawRock(c, r, t) {
    const x = ((r.x0 - t * r.v) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3;
    c.save();
    c.translate(x, r.y);
    c.rotate(r.a + t * r.va);
    const gr = c.createLinearGradient(-r.r, -r.r, r.r, r.r);
    gr.addColorStop(0, r.near ? '#7c9294' : '#4a5a60');
    gr.addColorStop(0.5, r.near ? '#34413f' : '#222b30');
    gr.addColorStop(1, '#0c1012');
    c.fillStyle = gr;
    c.beginPath();
    r.pts.forEach((m, k) => {
      const a = (k / r.pts.length) * TAU;
      const px = Math.cos(a) * r.r * m, py = Math.sin(a) * r.r * m;
      if (k === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    });
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath(); c.arc(r.r * 0.2, r.r * 0.1, r.r * 0.22, 0, TAU); c.fill();
    c.restore();
  }

  drawShip(c, t) {
    const sp = this.shipPos(t);
    const hit = t > 4.25;
    c.save();
    c.translate(sp.x, sp.y);
    c.rotate(sp.rot);
    // engine glow
    c.save();
    c.globalCompositeOperation = 'lighter';
    const flick = 0.8 + 0.2 * Math.sin(t * 50);
    const eg = c.createRadialGradient(-96, 0, 0, -96, 0, 70);
    eg.addColorStop(0, `rgba(200,230,255,${hit ? 0.3 : 0.9 * flick})`);
    eg.addColorStop(0.3, `rgba(90,150,255,${hit ? 0.2 : 0.5 * flick})`);
    eg.addColorStop(1, 'rgba(60,90,255,0)');
    c.fillStyle = eg;
    c.beginPath(); c.arc(-96, 0, 70, 0, TAU); c.fill();
    c.restore();
    // wings
    c.fillStyle = '#1f1a3f';
    c.beginPath(); c.moveTo(-40, -8); c.lineTo(-100, -60); c.lineTo(-70, -64); c.lineTo(10, -12); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-40, 8); c.lineTo(-100, 58); c.lineTo(-70, 62); c.lineTo(10, 12); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(160,140,255,0.6)';
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-100, -60); c.lineTo(10, -12); c.moveTo(-100, 58); c.lineTo(10, 12); c.stroke();
    // hull
    const hg = c.createLinearGradient(0, -24, 0, 24);
    hg.addColorStop(0, '#6a5bb0');
    hg.addColorStop(0.45, '#2c255a');
    hg.addColorStop(1, '#0e0c22');
    c.fillStyle = hg;
    c.beginPath();
    c.moveTo(110, 0);
    c.quadraticCurveTo(60, -22, -30, -20);
    c.lineTo(-96, -12);
    c.lineTo(-100, 12);
    c.lineTo(-30, 20);
    c.quadraticCurveTo(60, 22, 110, 0);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(180,170,255,0.5)';
    c.lineWidth = 1;
    c.stroke();
    // canopy
    const cg = c.createLinearGradient(40, -14, 80, 0);
    cg.addColorStop(0, 'rgba(160,240,255,0.95)');
    cg.addColorStop(1, 'rgba(40,120,200,0.9)');
    c.fillStyle = cg;
    c.beginPath(); c.moveTo(82, -2); c.quadraticCurveTo(60, -16, 34, -12); c.lineTo(40, -2); c.closePath(); c.fill();
    c.fillStyle = `rgba(255,${hit ? 80 : 200},${hit ? 80 : 120},${0.6 + 0.4 * Math.sin(t * 6)})`;
    c.beginPath(); c.arc(-60, -30, 2.4, 0, TAU); c.arc(-60, 30, 2.4, 0, TAU); c.fill();
    if (hit) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const fg = c.createRadialGradient(-10, 4, 0, -10, 4, 40);
      fg.addColorStop(0, 'rgba(255,220,150,0.9)');
      fg.addColorStop(1, 'rgba(255,100,40,0)');
      c.fillStyle = fg;
      c.beginPath(); c.arc(-10, 4, 40, 0, TAU); c.fill();
      c.restore();
    }
    // the shield bubble, flaring when struck
    const sh = t > 2.7 && t < 3.3 ? 1 - (t - 2.7) / 0.6 : t > 4.1 && t < 4.3 ? 1 : 0;
    if (sh > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const R = 120;
      const bg = c.createRadialGradient(0, 0, R * 0.7, 0, 0, R);
      bg.addColorStop(0, 'rgba(120,200,255,0)');
      bg.addColorStop(1, `rgba(140,210,255,${0.55 * sh})`);
      c.fillStyle = bg;
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
      c.strokeStyle = `rgba(170,230,255,${0.4 * sh})`;
      c.lineWidth = 1;
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * TAU, rr = R * (0.55 + 0.4 * ((k * 7) % 5) / 5);
        c.beginPath();
        for (let s = 0; s <= 6; s++) {
          const an = (s / 6) * TAU;
          const px = Math.cos(a) * rr + Math.cos(an) * 9, py = Math.sin(a) * rr + Math.sin(an) * 9;
          if (s === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.stroke();
      }
      c.restore();
    }
    c.restore();
  }

  drawDescent(c, t) {
    // an alien dusk above the desert, a ringed giant hanging in the sky
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#26243a');
    sky.addColorStop(0.55, '#8a7a88');
    sky.addColorStop(0.75, '#d8b8a0');
    sky.addColorStop(1, '#e8d2b8');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    c.save();
    c.translate(300, 170);
    c.rotate(-0.25);
    c.strokeStyle = 'rgba(240,230,250,0.28)';
    c.lineWidth = 6;
    c.beginPath(); c.ellipse(0, 0, 260, 46, 0, Math.PI, TAU); c.stroke();
    const pg = c.createRadialGradient(-60, -60, 20, 0, 0, 170);
    pg.addColorStop(0, 'rgba(230,220,240,0.9)');
    pg.addColorStop(1, 'rgba(120,110,150,0.8)');
    c.fillStyle = pg;
    c.beginPath(); c.arc(0, 0, 150, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(240,230,250,0.55)';
    c.beginPath(); c.ellipse(0, 0, 260, 46, 0, 0, Math.PI); c.stroke();
    c.restore();
    // dunes, far to near
    dunes(c, 470, '#b99c86', 0.6, 30, 1);
    dunes(c, 520, '#9c7e6a', 1.0, 40, 2);
    // the fireball
    if (t < 8.7) {
      const fp = this.firePos(t);
      const prev = this.firePos(t - 0.25);
      c.save();
      c.globalCompositeOperation = 'lighter';
      const trail = c.createLinearGradient(prev.x, prev.y, fp.x, fp.y);
      trail.addColorStop(0, 'rgba(255,120,40,0)');
      trail.addColorStop(1, 'rgba(255,230,180,0.95)');
      c.strokeStyle = trail;
      c.lineWidth = 16;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(prev.x - 120, prev.y - 90); c.lineTo(fp.x, fp.y); c.stroke();
      const fg = c.createRadialGradient(fp.x, fp.y, 0, fp.x, fp.y, 46);
      fg.addColorStop(0, 'rgba(255,255,240,1)');
      fg.addColorStop(0.3, 'rgba(255,190,90,0.8)');
      fg.addColorStop(1, 'rgba(255,90,30,0)');
      c.fillStyle = fg;
      c.beginPath(); c.arc(fp.x, fp.y, 46, 0, TAU); c.fill();
      c.restore();
    } else {
      // impact: a glow behind the dune and a rising ring
      const k = clamp((t - 8.7) / 1.6, 0, 1);
      c.save();
      c.globalCompositeOperation = 'lighter';
      const ig = c.createRadialGradient(880, 520, 0, 880, 520, 260 * (0.4 + k));
      ig.addColorStop(0, `rgba(255,200,130,${0.8 * (1 - k)})`);
      ig.addColorStop(1, 'rgba(255,120,60,0)');
      c.fillStyle = ig;
      c.fillRect(0, 0, W, H);
      c.strokeStyle = `rgba(255,230,200,${0.6 * (1 - k)})`;
      c.lineWidth = 3;
      c.beginPath(); c.ellipse(880, 520, 40 + 500 * k, 10 + 70 * k, 0, 0, TAU); c.stroke();
      c.restore();
    }
    dunes(c, 575, '#5e4636', 1.4, 50, 3);
  }

  drawSurface(c, t) {
    // the trailer opened in grey; so does this. Only the hunters' red rims and Samus keep their color.
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#b9bab6');
    sky.addColorStop(0.6, '#d9d9d4');
    sky.addColorStop(1, '#c9c8c2');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    const sun = c.createRadialGradient(W * 0.72, 150, 0, W * 0.72, 150, 380);
    sun.addColorStop(0, 'rgba(255,255,252,0.9)');
    sun.addColorStop(1, 'rgba(255,255,250,0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, W, H);
    dunes(c, 380, '#a9a8a2', 0.5, 26, 4);
    dunes(c, 430, '#97968f', 0.8, 30, 5);
    // the wreck, smouldering on the far rise
    c.fillStyle = '#4a4946';
    c.beginPath();
    c.moveTo(930, 480); c.lineTo(980, 440); c.lineTo(1060, 452); c.lineTo(1100, 430); c.lineTo(1090, 470); c.lineTo(1120, 482);
    c.closePath();
    c.fill();
    // the ridge the hunters stand on
    const ridgeY = (x) => 474 + Math.sin(x * 0.006 + 1) * 10 + Math.sin(x * 0.017) * 4;
    c.fillStyle = '#86857e';
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) c.lineTo(x, ridgeY(x));
    c.lineTo(W, H);
    c.closePath();
    c.fill();
    for (const h of HUNTERS) this.drawHunter(c, h, ridgeY(h.x), t);
    // the ground Samus stands on
    const collapse = clamp((t - 18.6) / 1.2, 0, 1);
    c.fillStyle = '#9b9a93';
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) c.lineTo(x, 560 + Math.sin(x * 0.01) * 6);
    c.lineTo(W, H);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 1;
    for (let y = 580; y < H; y += 14) {
      c.beginPath();
      for (let x = 0; x <= W; x += 20) c.lineTo(x, y + Math.sin(x * 0.02 + y) * 3);
      c.stroke();
    }
    if (collapse > 0) {
      const hg = c.createRadialGradient(420, 566, 0, 420, 566, 150 * collapse);
      hg.addColorStop(0, '#040404');
      hg.addColorStop(0.7, '#1a1a18');
      hg.addColorStop(1, 'rgba(155,154,147,0)');
      c.fillStyle = hg;
      c.beginPath(); c.ellipse(420, 566, 170 * collapse, 36 * collapse, 0, 0, TAU); c.fill();
    }
    // Samus
    const kneelT = t - 10.6;
    const pose = { x: 0, y: 0, facing: t > 14.4 ? -1 : 1, state: 'normal', t: 0, onGround: true, vx: 0, vy: 0, runPhase: 0, aimAngle: 0, spin: false, spinA: 0, landT: 0, charge: 0, rav: false, animT: t, reachAngle: 0, kneelDur: 1.6, ball: false };
    if (kneelT < 1.6) { pose.state = 'kneel'; pose.t = kneelT + 0.2; }
    let sy = 562;
    if (t > 18.6) {
      const f = t - 18.6;
      sy = 562 + f * f * 900;
      pose.state = 'intro';
    }
    if (sy < H + 200) {
      c.save();
      if (t > 18.6) {
        c.beginPath();
        c.rect(0, 0, W, 566);
        c.ellipse(420, 566, 170 * collapse, 36 * collapse, 0, 0, TAU);
        c.clip();
      }
      c.translate(420, sy);
      c.scale(1.5, 1.5);
      drawSamus(c, pose);
      c.restore();
    }
    // a grey wash keeps it all in one tone
    c.save();
    c.globalCompositeOperation = 'saturation';
    c.fillStyle = 'rgba(128,128,128,0.55)';
    c.fillRect(0, 0, W, H);
    c.restore();
    // but the Five keep their red, and the ground splits in magenta
    c.save();
    c.globalCompositeOperation = 'lighter';
    if (t > 17.9) {
      const k = clamp((t - 17.9) / 0.7, 0, 1);
      c.strokeStyle = `rgba(255,70,190,${0.9 * (1 - collapse)})`;
      c.lineWidth = 2.2;
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        const len = 40 + 140 * k * (0.6 + ((i * 37) % 10) / 20);
        c.beginPath();
        c.moveTo(420, 562);
        c.lineTo(420 + Math.cos(a) * len, 562 + Math.abs(Math.sin(a)) * len * 0.18);
        c.stroke();
      }
    }
    for (const h of HUNTERS) {
      if (t < h.t) continue;
      const y = ridgeY(h.x) - 112 * h.s;
      c.strokeStyle = `rgba(${h.rim},0.8)`;
      c.lineWidth = 2;
      c.beginPath(); c.ellipse(h.x, y, 50 * h.s, 9 * h.s, 0, 0, TAU); c.stroke();
      c.fillStyle = `rgba(${h.eye},0.9)`;
      c.fillRect(h.x - 6 * h.s, y + 16 * h.s, 12 * h.s, 2.5);
      if (t > 17.4) {
        const k = clamp((t - 17.4) / 0.3, 0, 1);
        c.strokeStyle = `rgba(255,170,80,${0.8 * k})`;
        c.lineWidth = 3;
        c.beginPath(); c.moveTo(h.x + 16 * h.s, y + 40 * h.s); c.lineTo(h.x + 30 * h.s, y - 20 * h.s * k); c.stroke();
      }
    }
    c.restore();
  }

  drawHunter(c, h, groundY, t) {
    if (t < h.t - 0.25) return;
    const k = clamp((t - h.t) / 0.25, 0, 1);
    const s = h.s;
    c.save();
    if (k < 1) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = `rgba(255,255,255,${1 - k})`;
      c.fillRect(h.x - 2 - 30 * k, groundY - 150 * s, 4 + 60 * k, 150 * s);
      c.globalCompositeOperation = 'source-over';
    }
    c.globalAlpha = k;
    c.translate(h.x, groundY);
    c.scale(s, s);
    const cloak = h.robe === 'red' ? '#3a1316' : h.robe === 'gold' ? '#3a3120' : h.robe === 'white' ? '#5a5a5c' : '#121216';
    c.fillStyle = cloak;
    c.beginPath();
    c.moveTo(-10, -96);
    c.quadraticCurveTo(-26, -60, -28, 0);
    for (let i = 0; i <= 5; i++) c.lineTo(-28 + i * 11, i % 2 ? -8 : 0);
    c.quadraticCurveTo(24, -60, 10, -96);
    c.closePath();
    c.fill();
    c.fillStyle = '#0a0a0c';
    c.beginPath(); c.ellipse(0, -102, 10, 12, 0, 0, TAU); c.fill();
    c.fillStyle = '#1c1c22';
    c.beginPath(); c.ellipse(0, -112, 50, 9, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(0, -116, 20, 9, 0, Math.PI, 0); c.fill();
    c.restore();
  }

  drawOverhead(c, t) {
    const k = clamp((t - 20.2) / 3.8, 0, 1);
    c.save();
    c.translate(W / 2, H / 2);
    c.scale(1 + k * 0.15, 1 + k * 0.15);
    c.translate(-W / 2, -H / 2);
    c.drawImage(this.sand, 0, 0, W, H);
    const hole = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 210);
    hole.addColorStop(0, '#020202');
    hole.addColorStop(0.5, '#141413');
    hole.addColorStop(0.8, 'rgba(60,60,58,0.7)');
    hole.addColorStop(1, 'rgba(90,90,86,0)');
    c.fillStyle = hole;
    c.beginPath(); c.ellipse(W / 2, H / 2, 230, 205, 0, 0, TAU); c.fill();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * TAU + 0.2;
      const x = W / 2 + Math.cos(a) * 250, y = H / 2 + Math.sin(a) * 222;
      c.save();
      c.translate(x + 10, y + 12);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath(); c.arc(0, 0, 62, 0, TAU); c.fill();
      c.restore();
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = '#1a1a1e';
      c.beginPath(); c.ellipse(-30, 0, 30, 22, 0, 0, TAU); c.fill();
      const dg = c.createRadialGradient(-14, -14, 4, 0, 0, 60);
      dg.addColorStop(0, '#5a5a62');
      dg.addColorStop(1, '#1e1e24');
      c.fillStyle = dg;
      c.beginPath(); c.arc(0, 0, 58, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(170,170,180,0.35)';
      c.lineWidth = 1.2;
      for (let r = 16; r < 56; r += 12) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
      c.fillStyle = '#2a2a30';
      c.beginPath(); c.arc(0, 0, 12, 0, TAU); c.fill();
      c.restore();
    }
    c.save();
    c.globalCompositeOperation = 'saturation';
    c.fillStyle = 'rgba(128,128,128,0.6)';
    c.fillRect(0, 0, W, H);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * TAU + 0.2;
      const x = W / 2 + Math.cos(a) * 250, y = H / 2 + Math.sin(a) * 222;
      c.strokeStyle = `rgba(232,51,63,${0.75 + 0.2 * Math.sin(t * 3 + i)})`;
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, 58, 0, TAU); c.stroke();
    }
    c.restore();
    c.restore();
  }
}

function dunes(c, base, col, amp, height, seed) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(0, H);
  for (let x = 0; x <= W; x += 12) {
    const y = base - height * amp * (0.5 + 0.5 * Math.sin(x * 0.004 * (1 + seed * 0.3) + seed * 1.7)) - Math.sin(x * 0.013 + seed) * 8 * amp;
    c.lineTo(x, y);
  }
  c.lineTo(W, H);
  c.closePath();
  c.fill();
}

function paintNebula() {
  const cv = makeCanvas(W / 2, H / 2);
  const c = cv.getContext('2d');
  const nz = makeNoise2D(99);
  const img = c.createImageData(cv.width, cv.height);
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const n = nz.fbm(x * 0.012, y * 0.012, 5);
      const m = nz.fbm(x * 0.02 + 40, y * 0.02, 4);
      const v = Math.max(0, n - 0.45) * 2.2;
      const o = (y * cv.width + x) * 4;
      img.data[o] = 120 * v + 40 * m * v;
      img.data[o + 1] = 40 * v + 90 * m * v;
      img.data[o + 2] = 160 * v + 60 * m * v;
      img.data[o + 3] = 255 * Math.min(1, v * 0.8);
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

function paintMoon() {
  const cv = makeCanvas(800, 800);
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(260, 260, 40, 400, 400, 400);
  g.addColorStop(0, '#d9d4cc');
  g.addColorStop(0.6, '#8f887e');
  g.addColorStop(1, '#2a2622');
  c.fillStyle = g;
  c.beginPath(); c.arc(400, 400, 390, 0, TAU); c.fill();
  const rng = mulberry32(5);
  for (let i = 0; i < 40; i++) {
    const a = rng() * TAU, d = rng() * 360, r = 6 + rng() * 40;
    const x = 400 + Math.cos(a) * d, y = 400 + Math.sin(a) * d;
    c.fillStyle = 'rgba(40,36,32,0.25)';
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,250,240,0.12)';
    c.beginPath(); c.arc(x - 2, y - 2, r, Math.PI, Math.PI * 1.6); c.stroke();
  }
  const sh = c.createRadialGradient(560, 560, 100, 400, 400, 420);
  sh.addColorStop(0, 'rgba(0,0,0,0.6)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh;
  c.globalCompositeOperation = 'source-atop';
  c.fillRect(0, 0, 800, 800);
  return cv;
}

function paintSandTop() {
  const cv = makeCanvas(W / 2, H / 2);
  const c = cv.getContext('2d');
  const nz = makeNoise2D(17);
  const img = c.createImageData(cv.width, cv.height);
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const n = nz.fbm(x * 0.02, y * 0.02, 5);
      const grain = nz.noise(x * 0.5, y * 0.5);
      const rip = 0.5 + 0.5 * Math.sin((x * 0.8 + y * 0.25) * 0.12 + n * 9);
      const v = 150 + n * 50 + rip * 7 + (grain - 0.5) * 14;
      const o = (y * cv.width + x) * 4;
      img.data[o] = v; img.data[o + 1] = v - 4; img.data[o + 2] = v - 12; img.data[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}
