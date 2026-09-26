// Particles, rings, crescents, afterimages and dynamic light.

import { rand, TAU, clamp, lerp, easeOutCubic } from './util.js';

const MAX_PARTS = 2600;

export class FX {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.arcs = [];
    this.ghosts = [];
    this.lights = [];
    this.hands = [];
  }

  clear() {
    this.parts.length = 0;
    this.rings.length = 0;
    this.arcs.length = 0;
    this.ghosts.length = 0;
    this.hands.length = 0;
  }

  add(p) {
    if (this.parts.length >= MAX_PARTS) this.parts.splice(0, 200);
    p.life = p.life ?? 0.5;
    p.max = p.life;
    p.vx = p.vx ?? 0;
    p.vy = p.vy ?? 0;
    p.size = p.size ?? 2;
    p.drag = p.drag ?? 0;
    p.grav = p.grav ?? 0;
    p.rot = p.rot ?? 0;
    p.vr = p.vr ?? 0;
    this.parts.push(p);
    return p;
  }

  light(x, y, r, color, a = 1) {
    this.lights.push({ x, y, r, color, a });
  }

  sparks(x, y, color, n = 10, speed = 400, opts = {}) {
    const sp = opts.spread ?? 0.8;
    for (let i = 0; i < n; i++) {
      const a = opts.dir !== undefined ? opts.dir + rand(-sp, sp) : rand(TAU);
      const s = speed * rand(0.35, 1);
      this.add({ kind: 'streak', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.15, 0.4), size: rand(1, 2.2), color, drag: 5, grav: opts.grav ?? 500, add: true });
    }
  }

  dust(x, y, n = 8, power = 1, color = 'rgba(190,150,110,') {
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.add({ kind: 'smoke', x: x + rand(-8, 8), y: y - rand(0, 4), vx: dir * rand(40, 220) * power, vy: -rand(10, 90) * power, life: rand(0.35, 0.8), size: rand(5, 12) * (0.7 + power * 0.4), grow: 22, color, alpha: 0.35, drag: 4 });
    }
  }

  smoke(x, y, n = 6, color = 'rgba(40,36,44,', size = 14) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'smoke', x: x + rand(-10, 10), y: y + rand(-10, 10), vx: rand(-60, 60), vy: rand(-80, 10), life: rand(0.4, 0.9), size: rand(size * 0.6, size), grow: 30, color, alpha: 0.6, drag: 2 });
    }
  }

  shards(x, y, colors, n = 14, speed = 380, pullTo = null) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = speed * rand(0.3, 1);
      this.add({ kind: 'shard', x: x + rand(-10, 10), y: y + rand(-10, 10), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rand(0.5, 1.1), size: rand(3, 8), color: colors[i % colors.length], drag: 2.2, grav: pullTo ? 0 : 600, rot: rand(TAU), vr: rand(-12, 12), pull: pullTo, add: !!pullTo });
    }
  }

  ring(x, y, r0, r1, color, life = 0.3, width = 2) {
    this.rings.push({ x, y, r0, r1, color, life, max: life, width });
  }

  crescent(x, y, facing, color, life = 0.26, radius = 74, parry = false) {
    this.arcs.push({ x, y, facing, color, life, max: life, radius, parry });
  }

  ghost(pose, color = [110, 200, 255]) {
    this.ghosts.push({ pose, life: 0.3, max: 0.3, color });
  }

  // magenta "hand" reaching out to grip whatever is being devoured
  hand(from, to, life, getFrom, getTo) {
    const h = { life, max: life, getFrom, getTo };
    this.hands.push(h);
    return h;
  }

  muzzle(x, y, dx, dy, big, rav) {
    const col = rav ? 'rgba(255,90,200,' : 'rgba(255,220,140,';
    this.add({ kind: 'flash', x, y, life: big ? 0.12 : 0.06, size: big ? 34 : 16, color: col, add: true });
    for (let i = 0; i < (big ? 10 : 3); i++) {
      const a = Math.atan2(dy, dx) + rand(-0.5, 0.5);
      const s = rand(150, big ? 700 : 400);
      this.add({ kind: 'streak', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.06, 0.16), size: 1.4, color: col, drag: 8, add: true });
    }
  }

  update(dt, pullTargets) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      if (p.pull) {
        const tgt = typeof p.pull === 'function' ? p.pull() : p.pull;
        if (tgt) {
          const age = 1 - p.life / p.max;
          if (age > 0.25) {
            const dx = tgt.x - p.x, dy = tgt.y - p.y;
            const d = Math.hypot(dx, dy) + 1;
            const k = 2600 * (age - 0.2);
            p.vx += (dx / d) * k * dt;
            p.vy += (dy / d) * k * dt;
            p.vx *= 1 - 3 * dt;
            p.vy *= 1 - 3 * dt;
            if (d < 14) { p.life = Math.min(p.life, 0.03); }
          }
        }
      }
      if (p.home) {
        const tgt = p.home();
        if (tgt) {
          const t = 1 - p.life / p.max;
          const e = easeOutCubic(clamp(t, 0, 1));
          const cx = lerp(p.sx, tgt.x, e) + p.wob * Math.sin(t * Math.PI) ;
          const cy = lerp(p.sy, tgt.y, e) - p.arc * Math.sin(t * Math.PI);
          p.vx = (cx - p.x) / Math.max(dt, 1e-4);
          p.vy = (cy - p.y) / Math.max(dt, 1e-4);
          p.x = cx; p.y = cy;
          continue;
        }
      }
      if (p.drag) { p.vx *= 1 - Math.min(1, p.drag * dt); p.vy *= 1 - Math.min(1, p.drag * dt); }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.grow) p.size += p.grow * dt;
    }
    for (const list of [this.rings, this.arcs, this.ghosts, this.hands]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= dt;
        if (list[i].life <= 0) list.splice(i, 1);
      }
    }
  }

  drawParts(c, additive) {
    for (const p of this.parts) {
      if (!!p.add !== additive) continue;
      const k = p.life / p.max;
      switch (p.kind) {
        case 'streak': {
          const len = Math.min(26, Math.hypot(p.vx, p.vy) * 0.03 + 2);
          const a = Math.atan2(p.vy, p.vx);
          c.strokeStyle = p.color + k + ')';
          c.lineWidth = p.size;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
          c.stroke();
          break;
        }
        case 'dot': {
          c.fillStyle = p.color + (p.alpha ?? 1) * k + ')';
          c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, TAU); c.fill();
          break;
        }
        case 'mote': {
          const tw = 0.5 + 0.5 * Math.sin((p.max - p.life) * p.tw + p.ph);
          c.fillStyle = p.color + (p.alpha ?? 0.5) * Math.sin(Math.PI * k) * tw + ')';
          c.fillRect(p.x, p.y, p.size, p.size);
          break;
        }
        case 'smoke': {
          c.fillStyle = p.color + (p.alpha ?? 0.4) * k * k + ')';
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
          break;
        }
        case 'shard': {
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.fillStyle = p.color.replace('A', Math.min(1, k * 1.5).toFixed(3));
          c.beginPath();
          c.moveTo(-p.size, -p.size * 0.35);
          c.lineTo(p.size, 0);
          c.lineTo(-p.size * 0.4, p.size * 0.5);
          c.closePath();
          c.fill();
          c.restore();
          break;
        }
        case 'flash': {
          const r = p.size * (1.2 - k * 0.2);
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, p.color + k + ')');
          g.addColorStop(1, p.color + '0)');
          c.fillStyle = g;
          c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill();
          break;
        }
        case 'sand': {
          c.fillStyle = p.color + (p.alpha ?? 0.5) * Math.min(1, k * 3) + ')';
          c.fillRect(p.x, p.y, p.size, p.size * 3);
          break;
        }
        case 'text': {
          c.fillStyle = p.color + k + ')';
          c.font = p.font;
          c.fillText(p.text, p.x, p.y);
          break;
        }
      }
    }
  }

  drawRings(c) {
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const rad = lerp(r.r0, r.r1, easeOutCubic(t));
      c.strokeStyle = r.color.replace('A', (1 - t).toFixed(3));
      c.lineWidth = r.width * (1 - t * 0.6);
      c.beginPath(); c.arc(r.x, r.y, rad, 0, TAU); c.stroke();
    }
  }

  // The counter's blue crescent swoosh, in the spirit of the trailer.
  drawArcs(c) {
    for (const a of this.arcs) {
      const t = 1 - a.life / a.max;
      const sweep = easeOutCubic(Math.min(1, t * 2.2));
      const fade = 1 - t;
      c.save();
      c.translate(a.x, a.y);
      c.scale(a.facing, 1);
      const R = a.radius * (0.85 + 0.25 * sweep);
      const start = -2.1, end = lerp(-2.1, 1.25, sweep);
      const grad = c.createRadialGradient(0, 0, R * 0.45, 0, 0, R);
      grad.addColorStop(0, `rgba(${a.color},0)`);
      grad.addColorStop(0.7, `rgba(${a.color},${0.35 * fade})`);
      grad.addColorStop(0.93, `rgba(235,248,255,${0.95 * fade})`);
      grad.addColorStop(1, `rgba(${a.color},0)`);
      c.fillStyle = grad;
      c.beginPath();
      c.arc(0, 0, R, start, end);
      c.arc(R * 0.18, 0, R * 0.8, end, start, true);
      c.closePath();
      c.fill();
      if (a.parry) {
        c.strokeStyle = `rgba(255,255,255,${0.9 * fade})`;
        c.lineWidth = 2;
        for (let k = 0; k < 9; k++) {
          const an = -1.3 + k * 0.3;
          const r0 = R * (1.05 + 0.2 * t), r1 = r0 + 18 + 30 * (1 - t);
          c.beginPath();
          c.moveTo(Math.cos(an) * r0, Math.sin(an) * r0);
          c.lineTo(Math.cos(an) * r1, Math.sin(an) * r1);
          c.stroke();
        }
      }
      c.restore();
    }
  }

  drawHands(c, drawHand) {
    for (const h of this.hands) {
      const from = h.getFrom(), to = h.getTo();
      if (!from || !to) continue;
      drawHand(c, from, to, 1 - h.life / h.max);
    }
  }

  drawLights(c) {
    for (const L of this.lights) {
      const g = c.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      g.addColorStop(0, `rgba(${L.color},${0.5 * L.a})`);
      g.addColorStop(0.4, `rgba(${L.color},${0.16 * L.a})`);
      g.addColorStop(1, `rgba(${L.color},0)`);
      c.fillStyle = g;
      c.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    this.lights.length = 0;
  }
}
