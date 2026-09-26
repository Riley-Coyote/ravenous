// On-screen controls for tablets and phones. A floating thumb-stick on the left half,
// action buttons under the right thumb. Hidden until the first touch.

import { VIEW_W, VIEW_H } from './art.js';

const BUTTONS = [
  { a: 'jump', x: 1172, y: 606, r: 56, label: 'JUMP' },
  { a: 'fire', x: 1040, y: 640, r: 48, label: 'SHOOT' },
  { a: 'counter', x: 1052, y: 510, r: 40, label: 'COUNTER' },
  { a: 'devour', x: 1180, y: 474, r: 40, label: 'DEVOUR' },
  { a: 'missile', x: 922, y: 656, r: 32, label: 'MISSILE' },
  { a: 'dash', x: 1212, y: 364, r: 32, label: 'DASH' },
  { a: 'pause', x: 1224, y: 150, r: 22, label: 'II' },
];
const STICK_R = 64;

export class Touch {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.input = input;
    this.active = false;
    this.pointers = new Map();
    this.stick = null;
    this.onTap = null;
    this.hidden = new Set();
    this.signal = {};
    const opts = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this.down(e), opts);
    canvas.addEventListener('pointermove', (e) => this.move(e), opts);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(t, (e) => this.up(e), opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
  }

  hit(p) {
    for (const b of BUTTONS) {
      if (this.hidden.has(b.a)) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 14) return b;
    }
    return null;
  }

  down(e) {
    const p = this.pos(e);
    if (e.pointerType !== 'touch') {
      // a mouse click only ever counts as "tap to continue" in menus
      if (this.onTap) this.onTap(p, false);
      return;
    }
    e.preventDefault();
    if (!this.active) {
      this.active = true;
      // on phones, go fullscreen to hide the browser bars (where the browser allows it)
      const el = document.documentElement;
      try { if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (err) {}
    }
    this.input.lastDevice = 'touch';
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (this.onTap && this.onTap(p, true)) return;
    const b = this.hit(p);
    if (b) {
      this.pointers.set(e.pointerId, { kind: 'btn', btn: b });
      this.input.setTouch(b.a, true);
      return;
    }
    if (p.x < VIEW_W * 0.5) {
      const s = { kind: 'stick', x0: p.x, y0: p.y, x: p.x, y: p.y };
      this.pointers.set(e.pointerId, s);
      this.stick = s;
      this.applyStick();
    }
  }

  move(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    e.preventDefault();
    const p = this.pos(e);
    if (ptr.kind === 'stick') {
      ptr.x = p.x;
      ptr.y = p.y;
      // drag the base along if the thumb wanders far, so the stick never "runs out"
      const dx = ptr.x - ptr.x0, dy = ptr.y - ptr.y0, d = Math.hypot(dx, dy);
      if (d > STICK_R * 1.6) {
        ptr.x0 = ptr.x - (dx / d) * STICK_R * 1.6;
        ptr.y0 = ptr.y - (dy / d) * STICK_R * 1.6;
      }
      this.applyStick();
    } else {
      const b = this.hit(p);
      if (b && b !== ptr.btn && b.a !== 'pause') {
        this.input.setTouch(ptr.btn.a, false);
        ptr.btn = b;
        this.input.setTouch(b.a, true);
      }
    }
  }

  up(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    if (ptr.kind === 'btn') this.input.setTouch(ptr.btn.a, false);
    else {
      this.stick = null;
      for (const a of ['left', 'right', 'up', 'down']) this.input.setTouch(a, false);
    }
  }

  applyStick() {
    const s = this.stick;
    const dx = s.x - s.x0, dy = s.y - s.y0;
    this.input.setTouch('left', dx < -20);
    this.input.setTouch('right', dx > 20);
    this.input.setTouch('up', dy < -34);
    this.input.setTouch('down', dy > 34);
  }

  releaseAll() {
    for (const [, ptr] of this.pointers) {
      if (ptr.kind === 'btn') this.input.setTouch(ptr.btn.a, false);
    }
    this.pointers.clear();
    this.stick = null;
    for (const a of ['left', 'right', 'up', 'down']) this.input.setTouch(a, false);
  }

  draw(c, show) {
    if (!this.active || !show) return;
    c.save();
    // stick
    const s = this.stick;
    const bx = s ? s.x0 : 176, by = s ? s.y0 : 566;
    c.globalAlpha = s ? 1 : 0.55;
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.lineWidth = 1;
    c.beginPath(); c.arc(bx, by, STICK_R, 0, Math.PI * 2); c.fill(); c.stroke();
    let kx = bx, ky = by;
    if (s) {
      const dx = s.x - s.x0, dy = s.y - s.y0, d = Math.hypot(dx, dy) || 1;
      const m = Math.min(d, STICK_R);
      kx = bx + (dx / d) * m;
      ky = by + (dy / d) * m;
    }
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.strokeStyle = s ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.22)';
    c.beginPath(); c.arc(kx, ky, 28, 0, Math.PI * 2); c.fill(); c.stroke();
    c.globalAlpha = 1;
    // buttons
    for (const b of BUTTONS) {
      if (this.hidden.has(b.a)) continue;
      const on = this.input.touchActs.has(b.a);
      c.fillStyle = on ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
      c.strokeStyle = on ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
      c.lineWidth = 1;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.10)';
      c.beginPath(); c.arc(b.x, b.y, b.r - 1.5, -2.5, -0.64); c.stroke();
      c.font = `500 ${b.r > 40 ? 12 : 10}px "Inter", system-ui, sans-serif`;
      if ('letterSpacing' in c) c.letterSpacing = '0.12em';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = on ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.78)';
      c.fillText(b.label, b.x + 1, b.y + 1);
      if (this.signal[b.a]) {
        c.fillStyle = 'rgba(255,62,180,0.95)';
        c.beginPath(); c.arc(b.x + b.r * 0.62, b.y - b.r * 0.62, 5, 0, Math.PI * 2); c.fill();
      }
    }
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    c.restore();
  }
}
