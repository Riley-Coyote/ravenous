// Screen-space type and instruments: energy, hunger, minimap, boss gauge, subtitles,
// prompts and cards. Type sits on a left grid line (x = 96), never centered by default.

import { clamp, lerp, TAU, easeOutCubic } from './util.js';
import { VIEW_W, VIEW_H, roundRect } from './art.js';
import { TILE } from './level.js';

const GX = 96;
const DISPLAY = '"Inter Tight", "Inter", system-ui, sans-serif';
const TEXT = '"Inter", system-ui, sans-serif';
const MAGENTA = '255,62,180';
const ACTIONS = new Set(['move', 'aim', 'down', 'jump', 'fire', 'counter', 'devour', 'missile', 'dash', 'pause', 'confirm', 'map']);

function font(c, weight, size, fam = TEXT, spacing = '0px') {
  c.font = `${weight} ${size}px ${fam}`;
  if ('letterSpacing' in c) c.letterSpacing = spacing;
}

function resetSpacing(c) {
  if ('letterSpacing' in c) c.letterSpacing = '0px';
}

export function keycap(c, x, y, label, alpha = 1) {
  font(c, 500, 12, TEXT);
  const w = Math.max(26, c.measureText(label).width + 14);
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(c, x, y, w, 26, 6);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.2)';
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(x + 5, y + 1, w - 10, 1);
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, x + w / 2, y + 13.5);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.restore();
  return w;
}

export class HUD {
  constructor() {
    this.subs = [];
    this.sub = null;
    this.prompts = [];
    this.shown = new Set();
    this.banner = null;
    this.card = null;
    this.roomName = null;
    this.flashRav = 0;
    this.t = 0;
    this.input = null;
  }

  // prompts name an action; the keycap shows whatever the player is using right now
  keyLabel(k) {
    return this.input && ACTIONS.has(k) ? this.input.label(k) : k;
  }

  say(speaker, text, dur = 3.2, delay = 0) {
    this.subs.push({ speaker, text, dur, delay });
  }

  clearSubs() {
    this.subs.length = 0;
    this.sub = null;
  }

  get talking() {
    return !!this.sub || this.subs.length > 0;
  }

  prompt(id, key, text, dur = 6) {
    if (this.shown.has(id)) return;
    this.shown.add(id);
    this.prompts.push({ id, key, text, t: 0, dur });
  }

  dismissPrompt(id) {
    for (const p of this.prompts) if (p.id === id && p.t < p.dur - 0.4) p.t = Math.max(p.t, p.dur - 0.4);
  }

  showBanner(kicker, title, line, key, dur = 3.4) {
    this.banner = { kicker, title, line, key, t: 0, dur };
  }

  showCard(kicker, title, dur = 3) {
    this.card = { kicker, title, t: 0, dur };
  }

  showRoom(name) {
    this.roomName = { name, t: 0 };
  }

  update(dt, g) {
    this.t += dt;
    if (!this.sub && this.subs.length) {
      const s = this.subs[0];
      if (s.delay > 0) s.delay -= dt;
      else {
        this.sub = this.subs.shift();
        this.sub.t = 0;
        this.sub.ticks = 0;
      }
    }
    if (this.sub) {
      this.sub.t += dt;
      const shown = Math.floor(this.sub.t * 46);
      if (shown > this.sub.ticks && shown <= this.sub.text.length) {
        if (shown % 2 === 0) g.sfx('typeTick');
        this.sub.ticks = shown;
      }
      if (this.sub.t > this.sub.dur) this.sub = null;
    }
    for (const p of this.prompts) p.t += dt;
    this.prompts = this.prompts.filter((p) => p.t < p.dur);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    if (this.card) {
      this.card.t += dt;
      if (this.card.t > this.card.dur) this.card = null;
    }
    if (this.roomName) {
      this.roomName.t += dt;
      if (this.roomName.t > 3.2) this.roomName = null;
    }
    if (this.flashRav > 0) this.flashRav -= dt;
  }

  // ------------------------------------------------------------ instruments

  draw(c, g) {
    const p = g.player;
    if (g.showHud) {
      this.drawEnergy(c, p);
      if (g.boss && g.bossFight && g.boss.state !== 'consumed') this.drawBossGauge(c, g.boss);
      else this.drawMinimap(c, g);
    }
    this.drawRoomName(c);
    this.drawSub(c);
    this.drawPrompts(c);
    this.drawCard(c);
    this.drawBanner(c);
    this.drawRavenousFlash(c);
  }

  drawEnergy(c, p) {
    const low = p.energy < 40;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 8);
    const cx = 62, cy = 62, R = 30;
    c.save();
    // hunger, rising like liquid inside the emblem
    c.save();
    c.beginPath();
    c.arc(cx, cy, R - 4, 0, TAU);
    c.clip();
    c.fillStyle = 'rgba(8,6,12,0.72)';
    c.fillRect(cx - R, cy - R, R * 2, R * 2);
    const lvl = p.ravenousT > 0 ? 1 : clamp(p.hunger, 0, 1);
    const top = cy + R - 4 - lvl * (R * 2 - 8);
    const lg = c.createLinearGradient(0, top, 0, cy + R);
    lg.addColorStop(0, `rgba(${MAGENTA},0.95)`);
    lg.addColorStop(1, 'rgba(110,10,70,0.95)');
    c.fillStyle = lg;
    c.beginPath();
    c.moveTo(cx - R, cy + R);
    for (let x = -R; x <= R; x += 3) c.lineTo(cx + x, top + Math.sin(x * 0.2 + this.t * 4) * (lvl > 0.02 && lvl < 0.98 ? 1.6 : 0));
    c.lineTo(cx + R, cy + R);
    c.closePath();
    c.fill();
    c.restore();
    // ring
    c.lineWidth = 1.5;
    c.strokeStyle = low ? `rgba(255,80,80,${0.5 + 0.4 * pulse})` : 'rgba(255,255,255,0.28)';
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      c.strokeStyle = 'rgba(255,255,255,0.22)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3));
      c.lineTo(cx + Math.cos(a) * (R + (k % 6 === 0 ? 7 : 5)), cy + Math.sin(a) * (R + (k % 6 === 0 ? 7 : 5)));
      c.stroke();
    }
    if (p.ravenousT > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const gl = c.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.8);
      gl.addColorStop(0, `rgba(${MAGENTA},${0.35 + 0.25 * pulse})`);
      gl.addColorStop(1, `rgba(${MAGENTA},0)`);
      c.fillStyle = gl;
      c.beginPath(); c.arc(cx, cy, R * 1.8, 0, TAU); c.fill();
      c.restore();
    }
    // the maw glyph
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(cx - 8, cy - 4); c.lineTo(cx, cy + 7); c.lineTo(cx + 8, cy - 4);
    c.moveTo(cx - 4, cy - 4); c.lineTo(cx, cy + 1); c.lineTo(cx + 4, cy - 4);
    c.stroke();
    // energy: tanks, bar, number
    const x0 = 106;
    const tanks = Math.floor(p.maxEnergy / 100);
    const full = Math.floor(p.energy / 100);
    for (let k = 0; k < tanks; k++) {
      const x = x0 + k * 22;
      c.beginPath();
      c.moveTo(x + 3, 38); c.lineTo(x + 19, 38); c.lineTo(x + 16, 47); c.lineTo(x, 47); c.closePath();
      if (k < full) { c.fillStyle = 'rgba(244,196,64,0.95)'; c.fill(); }
      else { c.strokeStyle = 'rgba(244,196,64,0.45)'; c.lineWidth = 1; c.stroke(); }
    }
    const cur = p.energy >= p.maxEnergy ? 99 : p.energy % 100;
    const segs = 20, bw = 188, sw = bw / segs;
    const filled = Math.ceil((cur / 99) * segs);
    for (let k = 0; k < segs; k++) {
      const x = x0 + k * sw;
      c.beginPath();
      c.moveTo(x + 3, 53); c.lineTo(x + sw - 1, 53); c.lineTo(x + sw - 4, 64); c.lineTo(x, 64); c.closePath();
      if (k < filled) {
        c.fillStyle = low ? `rgba(255,${70 + 60 * pulse},80,0.95)` : 'rgba(244,196,64,0.95)';
        c.fill();
      } else {
        c.fillStyle = 'rgba(244,196,64,0.12)';
        c.fill();
      }
    }
    font(c, 400, 22, DISPLAY, '-0.01em');
    c.fillStyle = 'rgba(255,255,255,0.94)';
    c.fillText(String(Math.floor(cur)).padStart(2, '0'), x0 + bw + 10, 65);
    // missiles
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath();
    c.moveTo(x0, 80); c.lineTo(x0 + 13, 80); c.lineTo(x0 + 18, 83); c.lineTo(x0 + 13, 86); c.lineTo(x0, 86); c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,90,80,0.9)';
    c.fillRect(x0 + 12, 80, 2, 6);
    font(c, 500, 13, TEXT, '0.02em');
    c.fillStyle = p.missiles ? 'rgba(255,255,255,0.9)' : 'rgba(255,120,120,0.9)';
    c.fillText(String(p.missiles).padStart(2, '0'), x0 + 26, 88);
    c.fillStyle = 'rgba(255,255,255,0.38)';
    c.fillText(`/ ${p.maxMissiles}`, x0 + 48, 88);
    resetSpacing(c);
    c.restore();
  }

  drawMinimap(c, g) {
    const W = 170, H = 96, x = VIEW_W - 28 - W, y = 28;
    const sc = 1.7;
    c.save();
    c.fillStyle = 'rgba(4,12,14,0.72)';
    c.fillRect(x, y, W, H);
    c.strokeStyle = 'rgba(63,208,200,0.75)';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    c.beginPath();
    c.rect(x + 1, y + 1, W - 2, H - 2);
    c.clip();
    const p = g.player;
    const ptx = p.cx / TILE, pty = p.cy / TILE;
    const ox = x + W / 2 - ptx * sc, oy = y + H / 2 - pty * sc;
    for (const r of g.world.rooms) {
      if (!r.seen) continue;
      const cur = g.room && r.id === g.room.id;
      c.fillStyle = cur ? 'rgba(63,208,200,0.28)' : 'rgba(63,120,200,0.22)';
      c.fillRect(ox + r.tx * sc, oy + r.ty * sc, r.w * sc, r.h * sc);
      c.strokeStyle = 'rgba(120,230,220,0.65)';
      c.strokeRect(ox + r.tx * sc + 0.5, oy + r.ty * sc + 0.5, r.w * sc - 1, r.h * sc - 1);
    }
    for (const d of g.world.doors) {
      const r = g.world.room(d.room);
      if (!r || !r.seen) continue;
      c.fillStyle = d.locked ? 'rgba(255,90,100,0.95)' : 'rgba(120,190,255,0.95)';
      c.fillRect(ox + d.tx * sc, oy + d.ty * sc, sc, (d.h / TILE) * sc);
    }
    if (g.itemPos && !g.itemTaken) {
      c.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(this.t * 5)})`;
      c.beginPath(); c.arc(ox + (g.itemPos.x / TILE) * sc, oy + (g.itemPos.y / TILE) * sc, 2, 0, TAU); c.fill();
    }
    c.fillStyle = `rgba(255,70,70,${0.6 + 0.4 * Math.sin(this.t * 6)})`;
    c.beginPath(); c.arc(x + W / 2, y + H / 2, 2.6, 0, TAU); c.fill();
    c.restore();
  }

  drawBossGauge(c, b) {
    const cx = VIEW_W - 62, cy = 62, R = 30;
    const k = b.hp / b.maxHp;
    c.save();
    c.fillStyle = 'rgba(10,6,8,0.72)';
    c.beginPath(); c.arc(cx, cy, R - 3, 0, TAU); c.fill();
    const core = c.createRadialGradient(cx, cy + 4, 0, cx, cy, R - 4);
    core.addColorStop(0, 'rgba(255,200,120,0.95)');
    core.addColorStop(0.45, 'rgba(255,110,40,0.75)');
    core.addColorStop(1, 'rgba(120,20,10,0.3)');
    c.fillStyle = core;
    c.beginPath();
    c.moveTo(cx, cy - 14);
    c.quadraticCurveTo(cx + 12, cy, cx + 6, cy + 12);
    c.quadraticCurveTo(cx, cy + 16, cx - 6, cy + 12);
    c.quadraticCurveTo(cx - 12, cy, cx, cy - 14);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(255,120,60,0.95)';
    c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
    font(c, 500, 11, TEXT, '0.22em');
    c.textAlign = 'right';
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillText(b.title || 'HOLLOW BRIM', cx - R - 16, 52);
    const bw = 200, bx = cx - R - 16 - bw;
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fillRect(bx, 62, bw, 3);
    c.fillStyle = b.phase2 ? 'rgba(255,90,60,0.95)' : 'rgba(255,150,70,0.95)';
    c.fillRect(bx + bw * (1 - k), 62, bw * k, 3);
    if (!b.hatOn && b.state !== 'defeated') {
      font(c, 500, 10, TEXT, '0.2em');
      c.fillStyle = `rgba(160,255,140,${0.6 + 0.4 * Math.sin(this.t * 8)})`;
      c.fillText('EXPOSED', cx - R - 16, 82);
    }
    c.textAlign = 'left';
    resetSpacing(c);
    c.restore();
  }

  // ------------------------------------------------------------ type

  drawSub(c) {
    const s = this.sub;
    if (!s) return;
    const fadeIn = clamp(s.t / 0.25, 0, 1), fadeOut = clamp((s.dur - s.t) / 0.4, 0, 1);
    const a = Math.min(fadeIn, fadeOut);
    const shown = s.text.slice(0, Math.floor(s.t * 46));
    c.save();
    c.globalAlpha = a;
    const grad = c.createLinearGradient(0, VIEW_H - 170, 0, VIEW_H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = grad;
    c.fillRect(0, VIEW_H - 170, VIEW_W, 170);
    if (s.speaker) {
      font(c, 500, 11, TEXT, '0.24em');
      c.fillStyle = s.speaker === 'SAMUS' ? 'rgba(255,255,255,0.5)' : 'rgba(255,150,90,0.75)';
      c.fillText(s.speaker, GX, VIEW_H - 96);
    }
    font(c, 300, 28, DISPLAY, '-0.005em');
    c.fillStyle = 'rgba(255,255,255,0.94)';
    c.shadowColor = 'rgba(0,0,0,0.8)';
    c.shadowBlur = 12;
    c.fillText(shown, GX, VIEW_H - 62);
    c.restore();
    resetSpacing(c);
  }

  // bottom-right normally; on touch screens the thumbs live there, so hints move up under the map
  drawPrompts(c) {
    const top = this.input && this.input.lastDevice === 'touch';
    let y = top ? 214 : VIEW_H - 64;
    const list = top ? this.prompts : [...this.prompts].reverse();
    for (const p of list) {
      const a = Math.min(clamp(p.t / 0.3, 0, 1), clamp((p.dur - p.t) / 0.4, 0, 1));
      const key = this.keyLabel(p.key);
      font(c, 400, 14, TEXT);
      const tw = c.measureText(p.text).width;
      font(c, 500, 12, TEXT);
      const kw = Math.max(26, c.measureText(key).width + 14);
      const x = VIEW_W - (top ? 28 : 64) - tw - kw - 12;
      c.save();
      c.globalAlpha = a;
      const slide = (1 - easeOutCubic(clamp(p.t / 0.3, 0, 1))) * 12;
      keycap(c, x + slide, y - 18, key);
      font(c, 400, 14, TEXT);
      c.fillStyle = 'rgba(255,255,255,0.82)';
      c.fillText(p.text, x + kw + 12 + slide, y);
      c.restore();
      y += top ? 38 : -38;
    }
  }

  drawBanner(c) {
    const b = this.banner;
    if (!b) return;
    const inK = easeOutCubic(clamp(b.t / 0.5, 0, 1));
    const out = clamp((b.dur - b.t) / 0.5, 0, 1);
    const a = Math.min(inK, out);
    c.save();
    c.globalAlpha = a;
    c.fillStyle = 'rgba(2,2,4,0.68)';
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    font(c, 500, 11, TEXT, '0.3em');
    c.fillStyle = `rgba(${MAGENTA},0.95)`;
    c.fillText(b.kicker, GX, 300);
    font(c, 200, 88, DISPLAY, '-0.02em');
    c.fillStyle = 'rgba(255,255,255,0.97)';
    c.fillText(b.title, GX - 4 + (1 - inK) * -30, 386);
    const tw = c.measureText(b.title).width;
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(GX, 410, (tw + 180) * inK, 1);
    let x = GX;
    if (b.key) x += keycap(c, GX, 428, this.keyLabel(b.key)) + 12;
    font(c, 400, 16, TEXT);
    c.fillStyle = 'rgba(255,255,255,0.72)';
    c.fillText(b.line, x, 446);
    resetSpacing(c);
    c.restore();
  }

  drawCard(c) {
    const k = this.card;
    if (!k) return;
    const inK = easeOutCubic(clamp(k.t / 0.6, 0, 1));
    const a = Math.min(inK, clamp((k.dur - k.t) / 0.6, 0, 1));
    c.save();
    c.globalAlpha = a;
    const grad = c.createLinearGradient(0, 0, VIEW_W * 0.7, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad;
    c.fillRect(0, 440, VIEW_W, 200);
    font(c, 500, 11, TEXT, '0.3em');
    c.fillStyle = 'rgba(255,150,90,0.9)';
    c.fillText(k.kicker, GX, 500);
    font(c, 200, 104, DISPLAY, '-0.025em');
    c.fillStyle = 'rgba(255,255,255,0.97)';
    c.fillText(k.title, GX - 6 + (1 - inK) * -60, 596);
    const tw = c.measureText(k.title).width;
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(GX, 616, tw * inK, 1);
    resetSpacing(c);
    c.restore();
  }

  drawRoomName(c) {
    const r = this.roomName;
    if (!r) return;
    const a = Math.min(clamp(r.t / 0.5, 0, 1), clamp((3.2 - r.t) / 0.8, 0, 1));
    c.save();
    c.globalAlpha = a * 0.85;
    font(c, 500, 11, TEXT, '0.32em');
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText(r.name.toUpperCase(), GX, 150);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(GX, 160, 40 * clamp(r.t / 0.6, 0, 1), 1);
    resetSpacing(c);
    c.restore();
  }

  drawRavenousFlash(c) {
    if (this.flashRav <= 0) return;
    const t = 1.6 - this.flashRav;
    const a = Math.min(clamp(t / 0.15, 0, 1), clamp(this.flashRav / 0.5, 0, 1));
    c.save();
    c.globalAlpha = a;
    font(c, 200, 132, DISPLAY, '0.02em');
    c.fillStyle = `rgba(${MAGENTA},0.95)`;
    c.shadowColor = `rgba(${MAGENTA},0.8)`;
    c.shadowBlur = 30;
    c.fillText('RAVENOUS', GX - 8 + t * 20, 320);
    c.shadowBlur = 0;
    font(c, 500, 11, TEXT, '0.3em');
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillText('HUNGER FULL · BEAM EMPOWERED', GX, 356);
    resetSpacing(c);
    c.restore();
  }

  // world-space devour prompt above a stunned target
  drawDevourPrompt(c, x, y, t, label = 'V') {
    c.save();
    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(${MAGENTA},${0.6 + 0.4 * pulse})`;
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(x, y, 15 + pulse * 2, 0, TAU); c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(20,4,14,0.75)';
    c.beginPath(); c.arc(x, y, 12, 0, TAU); c.fill();
    font(c, 500, 13, TEXT);
    c.fillStyle = 'rgba(255,220,245,0.98)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, x, y + 0.5);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.restore();
  }
}

// ---------------------------------------------------------------- full-screen type

export const DIFF_ORDER = ['easy', 'normal', 'hard'];

// shared by drawing and tap handling, so the pills are where your finger lands
export function titleLayout(options) {
  const out = [];
  let x = GX;
  const y = 628, h = 32;
  for (const o of options) {
    const w = 22 + o.name.length * 8.6;
    out.push({ ...o, x, y, w, h });
    x += w + 10;
  }
  return out;
}

export function drawTitle(c, t, info) {
  const a = clamp(t / 1.2, 0, 1);
  c.save();
  c.globalAlpha = a;
  font(c, 500, 11, TEXT, '0.34em');
  c.fillStyle = 'rgba(255,255,255,0.62)';
  c.fillText('FOR LIAM', GX, 392);
  font(c, 200, 150, DISPLAY, '-0.03em');
  c.fillStyle = 'rgba(255,255,255,0.97)';
  c.fillText('RAVENOUS', GX - 8, 540);
  const tw = c.measureText('RAVENOUS').width;
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillRect(GX, 566, Math.min(tw, 220), 1);
  font(c, 400, 14, TEXT);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillText('A fan demo made after the Metroid Ravenous reveal trailer. Not affiliated with Nintendo.', GX, 596);
  // difficulty (and continue, when there's a save)
  const pills = titleLayout(info.options);
  pills.forEach((p, i) => {
    const on = i === info.sel;
    c.fillStyle = on ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.035)';
    roundRect(c, p.x, p.y, p.w, p.h, 7);
    c.fill();
    c.strokeStyle = on ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.14)';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.fillRect(p.x + 6, p.y + 1, p.w - 12, 1);
    font(c, on ? 500 : 400, 13, TEXT);
    c.fillStyle = on ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.6)';
    c.fillText(p.name, p.x + 11, p.y + 21);
  });
  const selP = pills[info.sel];
  if (selP) {
    const last = pills[pills.length - 1];
    font(c, 400, 13, TEXT);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillText(selP.hint || '', last.x + last.w + 18, 649);
  }
  const blink = 0.55 + 0.45 * Math.sin(t * 3);
  font(c, 400, 14, TEXT);
  const txt = info.touch ? 'Tap to begin' : 'to begin';
  const tww = c.measureText(txt).width;
  if (info.touch) {
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillText(txt, VIEW_W - 96 - tww, 650);
    c.fillStyle = `rgba(${MAGENTA},${blink})`;
    c.beginPath(); c.arc(VIEW_W - 96 - tww - 14, 645, 3, 0, TAU); c.fill();
  } else {
    const label = info.label('confirm');
    font(c, 500, 12, TEXT);
    const kw0 = Math.max(26, c.measureText(label).width + 14);
    const kx = VIEW_W - 96 - tww - 12 - kw0;
    const kw = keycap(c, kx, 631, label);
    font(c, 400, 14, TEXT);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillText(txt, kx + kw + 12, 649);
    c.fillStyle = `rgba(${MAGENTA},${blink})`;
    c.beginPath(); c.arc(kx - 14, 644, 3, 0, TAU); c.fill();
  }
  resetSpacing(c);
  c.restore();
}

const CONTROL_ROWS = [
  ['move', 'move'], ['aim', 'aim up / down'], ['jump', 'jump'], ['fire', 'shoot · hold to charge'], ['missile', 'missile'],
  ['counter', 'counter the flash'], ['devour', 'devour the stunned'], ['dash', 'phase shift dash'], ['down', 'morph ball (tap twice)'], ['pause', 'pause & map'],
];

export function drawControls(c, x, y, label, alpha = 1, cols = 1) {
  c.save();
  c.globalAlpha = alpha;
  CONTROL_ROWS.forEach(([act, text], i) => {
    const col = cols === 2 ? (i < 5 ? 0 : 1) : 0;
    const row = cols === 2 ? i % 5 : i;
    const px = x + col * 300, py = y + row * 36;
    const w = keycap(c, px, py, label(act));
    font(c, 400, 14, TEXT);
    c.fillStyle = 'rgba(255,255,255,0.78)';
    c.fillText(text, px + Math.max(w, 52) + 12, py + 18);
  });
  resetSpacing(c);
  c.restore();
}

export function drawPause(c, label, drawMap, info) {
  c.save();
  c.fillStyle = 'rgba(3,3,6,0.84)';
  c.fillRect(0, 0, VIEW_W, VIEW_H);
  font(c, 500, 11, TEXT, '0.32em');
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillText('PAUSED', GX, 112);
  font(c, 200, 56, DISPLAY, '-0.02em');
  c.fillStyle = 'rgba(255,255,255,0.96)';
  c.fillText(info.roomName || 'Controls', GX - 3, 172);
  c.fillStyle = 'rgba(255,255,255,0.2)';
  c.fillRect(GX, 194, 220, 1);
  drawControls(c, GX, 222, label, 1, 1);
  font(c, 400, 13, TEXT);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillText(info.touch ? 'Tap II to resume.' : `${label('pause')} to resume · M mutes sound`, GX, 604);
  if (drawMap) drawMap(c, 520, 112, 664, 420);
  // items and time, under the map
  font(c, 500, 10, TEXT, '0.26em');
  c.fillStyle = 'rgba(255,255,255,0.45)';
  const stats = info.stats || [];
  stats.forEach((s, i) => c.fillText(s[0], 520 + i * 170, 574));
  font(c, 300, 26, DISPLAY);
  c.fillStyle = 'rgba(255,255,255,0.92)';
  stats.forEach((s, i) => c.fillText(s[1], 520 + i * 170, 606));
  resetSpacing(c);
  c.restore();
}

export function drawEnd(c, t, stats, touch) {
  c.save();
  c.fillStyle = `rgba(3,3,5,${clamp(t / 1.2, 0, 1)})`;
  c.fillRect(0, 0, VIEW_W, VIEW_H);
  const a1 = clamp((t - 1.0) / 1.0, 0, 1);
  const a2 = clamp((t - 2.6) / 1.0, 0, 1);
  const a3 = clamp((t - 3.8) / 1.0, 0, 1);
  const a4 = clamp((t - 5.2) / 1.0, 0, 1);
  c.globalAlpha = a1;
  font(c, 500, 11, TEXT, '0.32em');
  c.fillStyle = 'rgba(255,150,90,0.85)';
  c.fillText('ONE OF FIVE', GX, 232);
  font(c, 200, 96, DISPLAY, '-0.025em');
  c.fillStyle = 'rgba(255,255,255,0.97)';
  c.fillText('Four hats left.', GX - 5, 322);
  c.globalAlpha = a2;
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillRect(GX, 350, 220, 1);
  font(c, 400, 17, TEXT);
  c.fillStyle = 'rgba(255,255,255,0.86)';
  c.fillText('Thanks for playing, Liam. This one was made for you.', GX, 388);
  font(c, 400, 14, TEXT);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillText('The real Metroid Ravenous comes to Nintendo Switch 2 on January 28, 2027.', GX, 414);
  c.globalAlpha = a3;
  (stats || []).forEach((s, i) => {
    const x = GX + i * 190;
    font(c, 500, 10, TEXT, '0.28em');
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.fillText(s[0], x, 474);
    font(c, 200, 44, DISPLAY, '-0.01em');
    c.fillStyle = i === (stats.length - 1) ? `rgba(${MAGENTA},0.98)` : 'rgba(255,255,255,0.95)';
    c.fillText(s[1], x - 2, 522);
  });
  c.globalAlpha = a4;
  if (touch) {
    font(c, 400, 14, TEXT);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText('Tap to play again', GX, 598);
  } else {
    const kw = keycap(c, GX, 580, 'Enter');
    font(c, 400, 14, TEXT);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText('to play again', GX + kw + 12, 598);
  }
  resetSpacing(c);
  c.restore();
}

export function drawDeath(c, t) {
  c.save();
  c.fillStyle = `rgba(2,1,2,${clamp(t / 0.8, 0, 1) * 0.9})`;
  c.fillRect(0, 0, VIEW_W, VIEW_H);
  c.globalAlpha = clamp((t - 0.5) / 0.6, 0, 1);
  font(c, 500, 11, TEXT, '0.32em');
  c.fillStyle = 'rgba(255,90,90,0.9)';
  c.fillText('SUIT FAILURE', GX, 340);
  font(c, 300, 30, DISPLAY);
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.fillText('Not here. Not like this.', GX, 384);
  resetSpacing(c);
  c.restore();
}

export function drawRotate(c) {
  c.save();
  c.fillStyle = 'rgba(3,3,6,0.94)';
  c.fillRect(0, 0, VIEW_W, VIEW_H);
  font(c, 500, 12, TEXT, '0.3em');
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillText('ONE THING', GX, 300);
  font(c, 200, 64, DISPLAY, '-0.02em');
  c.fillStyle = 'rgba(255,255,255,0.96)';
  c.fillText('Turn it sideways.', GX - 3, 378);
  resetSpacing(c);
  c.restore();
}
