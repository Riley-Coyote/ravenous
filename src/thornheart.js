// THORNHEART, warden of the Thornwood — the spiked seed pod with pink lasers from the trailer.
// Hangs from the canopy: sweeping lasers, thorn rain, and a vine lash you can counter.
// At half strength its vines snap and it becomes a rolling, bouncing ball of spikes.
// Devour it and its Water Stride is yours.

import { clamp, lerp, rand, TAU, approach, sign, easeOutCubic } from './util.js';

const POD_R = 62;

export class Thornheart {
  constructor(ax, ay, arena) {
    Object.assign(this, {
      isBoss: true, kind: 'thorn', title: 'THORNHEART',
      ax, ay, arena, hp: 80, maxHp: 80, alive: true, state: 'dormant', t: 0, anim: 0,
      px: ax, py: ay + 230, pvx: 0, pvy: 0, restY: ay + 230, swingY: ay + 230,
      open: 0, openTarget: 0, stun: 0, beingDevoured: false, devourK: 0, flash: 0, shake: 0,
      counterable: false, telegraphed: false, glint: 0, phase2: false, pace: 1, idleDur: 1.2,
      lasers: [], laserA: 0, laserDir: 1, beams: false, thornsLeft: 0, thornT: 0,
      lash: null, rollA: 0, rolling: false, lastAttack: '', fade: 1,
      devourTime: 0.95, healAmt: 40, hungerAmt: 0.45, contact: 16, w: POD_R * 2, h: POD_R * 2,
    });
  }

  get x() { return this.px - POD_R; }
  get y() { return this.py - POD_R; }
  get cx() { return this.px; }
  get cy() { return this.py; }
  get visible() { return this.fade > 0.02; }
  get hatOn() { return this.open < 0.5; } // the HUD reads "EXPOSED" while the core is open
  get active() { return !['dormant', 'wake', 'defeated', 'consumed', 'snap'].includes(this.state); }
  get devourable() {
    if (!this.alive || this.beingDevoured || this.state === 'consumed') return false;
    if (this.state === 'defeated') return this.t > 1.2;
    return this.stun > 0;
  }

  setState(s) {
    this.state = s;
    this.t = 0;
    this.counterable = false;
    this.telegraphed = false;
  }

  telegraph(g) {
    if (!this.telegraphed) {
      this.telegraphed = true;
      this.glint = 0.4;
      g.sfx('telegraph');
    }
    this.counterable = true;
  }

  hitbox() {
    const r = POD_R * 0.86;
    return { x: this.px - r, y: this.py - r, w: r * 2, h: r * 2 };
  }

  // the lashing vine tip, or the whole ball while it rolls
  bladeBox() {
    if (this.lash && this.lash.phase === 'slam') return { x: this.lash.x - 26, y: this.lash.y - 30, w: 52, h: 60 };
    return null;
  }

  wake(g) {
    this.setState('wake');
    this.openTarget = 1;
  }

  toIdle(extra = 0) {
    this.setState('idle');
    this.openTarget = 0;
    this.idleDur = (this.phase2 ? rand(0.5, 0.9) : rand(0.9, 1.4)) / this.pace + extra;
  }

  update(g, dt) {
    this.anim += dt;
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.shake > 0) this.shake -= dt;
    if (this.glint > 0) this.glint -= dt;
    this.open = approach(this.open, this.openTarget, dt * 3);
    const p = g.player;
    const A = this.arena;

    if (!this.rolling) {
      // hanging: a damped pendulum toward the rest point
      const tx = this.ax + Math.sin(this.anim * 0.7) * 26;
      const ty = this.swingY;
      this.pvx += ((tx - this.px) * 10 - this.pvx * 3.2) * dt;
      this.pvy += ((ty - this.py) * 10 - this.pvy * 3.6) * dt;
      this.px += this.pvx * dt;
      this.py += this.pvy * dt;
    }

    switch (this.state) {
      case 'dormant':
        this.openTarget = 0;
        return;
      case 'wake':
        if (this.t > 2.4) this.openTarget = 0;
        break;
      case 'idle':
        if (this.t > this.idleDur) this.choose(g);
        break;
      case 'lasers': this.updateLasers(g, dt); break;
      case 'thorns': this.updateThorns(g, dt); break;
      case 'lash': this.updateLash(g, dt); break;
      case 'stunned':
        this.swingY = A.floorY - POD_R - 18;
        this.openTarget = 1;
        if (!this.beingDevoured) {
          this.stun -= dt;
          if (this.stun <= 0) {
            this.stun = 0;
            this.swingY = this.restY;
            this.toIdle(0.3);
          }
        }
        break;
      case 'recoil':
        if (this.t > 0.8) { this.swingY = this.restY; this.toIdle(0.2); }
        break;
      case 'snap':
        // the vines give way
        if (this.t > 0.7 && !this.rolling) {
          this.rolling = true;
          this.pvx = sign(p.cx - this.px) * 200;
          this.pvy = 0;
          g.sfx('explode');
          g.shake(0.6);
        }
        if (this.rolling) this.updateRoll(g, dt, false);
        if (this.rolling && this.t > 1.6) this.setState('roll');
        break;
      case 'roll':
        this.updateRoll(g, dt, true);
        break;
      case 'dazed':
        this.updateRoll(g, dt, false);
        if (this.t > 1.3 / this.pace) this.setState('roll');
        break;
      case 'rollStun':
        this.updateRoll(g, dt, false);
        this.openTarget = 1;
        if (!this.beingDevoured) {
          this.stun -= dt;
          if (this.stun <= 0) { this.stun = 0; this.setState('roll'); this.openTarget = 0; }
        }
        break;
      case 'defeated':
        this.openTarget = 1;
        if (this.rolling) this.updateRoll(g, dt, false);
        else this.swingY = A.floorY - POD_R - 10;
        this.stun = 99;
        break;
      case 'consumed':
        this.fade = Math.max(0, 1 - this.t / 1.8);
        if (this.t > 1.9) this.alive = false;
        break;
    }
  }

  choose(g) {
    const opts = [['lasers', 3], ['thorns', 2], ['lash', 3]].filter((o) => o[0] !== this.lastAttack || Math.random() < 0.3);
    const total = opts.reduce((s, o) => s + o[1], 0);
    let r = Math.random() * total, pick = opts[0][0];
    for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
    this.lastAttack = pick;
    this.setState(pick);
    if (pick === 'lasers') {
      this.laserDir = g.player.cx < this.px ? -1 : 1;
      this.laserA = Math.PI / 2 - this.laserDir * 0.75;
      this.beams = false;
      g.sfx('bossVoice');
    }
    if (pick === 'thorns') { this.thornsLeft = this.phase2 ? 8 : 6; this.thornT = 0.6; g.sfx('throwHat'); }
    if (pick === 'lash') this.lash = null;
  }

  // three pink beams fan out of the open core and sweep across the floor
  updateLasers(g, dt) {
    this.openTarget = 1;
    const tel = 0.9 / this.pace, fire = 1.8;
    if (this.t < 0.4) return;
    const on = this.t > 0.4 + tel && this.t < 0.4 + tel + fire;
    if (on && !this.beams) { this.beams = true; g.sfx('charged'); g.shake(0.3); }
    if (on) this.laserA += this.laserDir * 0.82 * this.pace * dt;
    this.lasers = [-0.42, 0, 0.42].map((o) => this.laserA + o);
    this.laserEnds = this.lasers.map((a) => beamEnd(g, this.px, this.py, a));
    if (on) {
      const p = g.player;
      this.lasers.forEach((a, i) => {
        const hit = this.laserEnds[i];
        const len = Math.hypot(hit.x - this.px, hit.y - this.py);
        if (segHitsBox(this.px, this.py, a, len, p, 10)) p.damage(g, 18, this.px);
        if (Math.random() < 0.5) g.fx.sparks(hit.x, hit.y, 'rgba(255,120,220,', 1, 260, { dir: a + Math.PI, spread: 1 });
        g.fx.light(hit.x, hit.y, 60, '255,80,200', 0.6);
      });
    }
    if (this.t > 0.4 + tel + fire) {
      this.lasers = [];
      this.beams = false;
      this.toIdle(0.2);
    }
  }

  updateThorns(g, dt) {
    this.openTarget = 0.3;
    this.shake = 0.1;
    this.thornT -= dt;
    if (this.thornsLeft > 0 && this.thornT <= 0) {
      this.thornT = 0.22 / this.pace;
      this.thornsLeft--;
      const A = this.arena;
      const aim = Math.random() < 0.4 ? g.player.cx : rand(A.x0 + 30, A.x1 - 30);
      g.spawnThorn(clamp(aim + rand(-40, 40), A.x0 + 20, A.x1 - 20), A.ceilY);
    }
    if (this.thornsLeft <= 0 && this.t > 2) this.toIdle();
  }

  // a vine rears up above you, glows, then slams down. That glow is the counter window.
  updateLash(g, dt) {
    const p = g.player;
    const A = this.arena;
    if (!this.lash) {
      this.lash = { x: p.cx, y: A.ceilY + 40, phase: 'rise', t: 0, ax: clamp(p.cx + rand(-120, 120), A.x0, A.x1) };
      g.sfx('whiff');
    }
    const L = this.lash;
    L.t += dt;
    const floor = A.floorY - 30;
    if (L.phase === 'rise') {
      L.x = lerp(L.x, p.cx, 1 - Math.exp(-dt * 3));
      L.y = lerp(L.y, floor - 260, 1 - Math.exp(-dt * 5));
      if (L.t > 0.75 / this.pace) { L.phase = 'slam'; L.t = 0; g.sfx('slash'); }
    } else if (L.phase === 'slam') {
      L.y = lerp(L.y, floor, 1 - Math.exp(-dt * 16));
      if (Math.abs(p.cx - L.x) < 170) this.telegraph(g);
      if (L.t > 0.2 && !L.hit) {
        L.hit = true;
        g.shake(0.4);
        g.fx.dust(L.x, A.floorY, 10, 1.2, 'rgba(120,150,80,');
        this.counterable = false;
      }
      if (L.t > 0.7) { L.phase = 'back'; L.t = 0; }
    } else if (L.phase === 'back') {
      L.y = lerp(L.y, A.ceilY, 1 - Math.exp(-dt * 4));
      if (L.t > 0.6) { this.lash = null; this.toIdle(); }
    }
  }

  updateRoll(g, dt, hunting) {
    const A = this.arena;
    const p = g.player;
    if (hunting) {
      this.openTarget = 0;
      const want = sign(p.cx - this.px) * 430 * this.pace;
      this.pvx = approach(this.pvx, want, 520 * dt);
      if (Math.abs(p.cx - this.px) < 170 && Math.abs(this.pvx) > 250 && sign(this.pvx) === sign(p.cx - this.px)) this.telegraph(g);
      else this.counterable = false;
      if (this.t > 2.4 && this.onFloor && Math.random() < dt * 0.8) {
        this.pvy = -980;
        this.pvx = sign(p.cx - this.px) * 380;
        this.onFloor = false;
        g.sfx('jump');
      }
    } else {
      this.pvx = approach(this.pvx, 0, 700 * dt);
      this.counterable = false;
    }
    this.pvy = Math.min(this.pvy + 2400 * dt, 1500);
    this.px += this.pvx * dt;
    this.py += this.pvy * dt;
    const floorC = A.floorY - POD_R;
    this.onFloor = false;
    if (this.py > floorC) {
      if (this.pvy > 500) { g.shake(0.35); g.fx.dust(this.px, A.floorY, 8, 1, 'rgba(120,150,80,'); g.sfx('land'); }
      this.py = floorC;
      this.pvy = this.pvy > 500 ? -this.pvy * 0.3 : 0;
      this.onFloor = true;
    }
    const lo = A.x0 + POD_R, hi = A.x1 - POD_R;
    if (this.px < lo || this.px > hi) {
      this.px = clamp(this.px, lo, hi);
      if (Math.abs(this.pvx) > 300 && this.state === 'roll') {
        g.shake(0.5);
        g.sfx('explode');
        g.fx.sparks(this.px + sign(this.pvx) * POD_R, this.py, 'rgba(220,255,160,', 14, 420);
        this.setState('dazed');
      }
      this.pvx = -this.pvx * 0.35;
    }
    this.rollA += (this.pvx * dt) / POD_R;
  }

  hurt(g, dmg, src) {
    if (['dormant', 'defeated', 'consumed'].includes(this.state) || this.beingDevoured) return false;
    if (this.state === 'wake') {
      this.flash = 0.05;
      return true;
    }
    let mult = this.open > 0.5 ? 2 : 1;
    if (this.state === 'dazed') mult = 2;
    return this.applyDamage(g, dmg * mult, src);
  }

  applyDamage(g, amount, src) {
    if (this.state === 'defeated' || this.state === 'consumed') return false;
    this.hp -= amount;
    this.flash = 0.08;
    this.shake = 0.08;
    g.sfx('enemyHit');
    if (src && this.open > 0.5) g.fx.sparks(src.x, src.y, 'rgba(255,140,230,', 6, 300);
    if (this.hp <= 0) {
      this.hp = 0;
      this.lasers = [];
      this.lash = null;
      this.setState('defeated');
      this.stun = 99;
      g.onBossDefeated(this);
      return true;
    }
    if (!this.phase2 && this.hp <= this.maxHp / 2 && this.state !== 'stunned' && this.state !== 'rollStun') {
      this.phase2 = true;
      this.lasers = [];
      this.lash = null;
      this.setState('snap');
      g.onBossPhase2(this);
    }
    return true;
  }

  parried(g, player) {
    this.lash = null;
    if (this.rolling) {
      this.stun = 2.6;
      this.setState('rollStun');
      this.pvx = sign(this.px - player.cx) * 420;
      this.pvy = -300;
    } else {
      this.stun = 2.8;
      this.setState('stunned');
    }
    this.flash = 0.12;
  }

  drawStatus() {}

  // ------------------------------------------------------------ drawing

  draw(c, g) {
    if (!this.visible) return;
    const t = this.anim;
    const ox = this.shake > 0 || this.beingDevoured ? (Math.random() - 0.5) * 6 : 0;
    c.save();
    c.globalAlpha = this.fade;
    if (!this.rolling) this.drawVines(c, t);
    if (this.lash) this.drawLash(c, t);
    c.translate(this.px + ox, this.py);
    this.drawPod(c, t, false);
    if (this.flash > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.6 * this.fade;
      this.drawPod(c, t, true);
    }
    c.restore();
    this.drawLasers(c, t);
    // counter glint and stun ring
    if (this.glint > 0 || this.counterable) {
      const k = this.glint > 0 ? this.glint / 0.4 : 0.55 + 0.45 * Math.sin(t * 30);
      const gp = this.lash && this.lash.phase === 'slam' ? { x: this.lash.x, y: this.lash.y } : { x: this.px, y: this.py };
      c.save();
      c.globalCompositeOperation = 'lighter';
      const r = 40 + 26 * k;
      const gr = c.createRadialGradient(gp.x, gp.y, 0, gp.x, gp.y, r);
      gr.addColorStop(0, `rgba(255,252,220,${0.6 * k + 0.2})`);
      gr.addColorStop(1, 'rgba(255,200,80,0)');
      c.fillStyle = gr;
      c.beginPath(); c.arc(gp.x, gp.y, r, 0, TAU); c.fill();
      c.strokeStyle = `rgba(255,255,240,${0.85 * k + 0.15})`;
      c.lineWidth = 2.2;
      const L = 20 + 24 * k;
      c.beginPath();
      c.moveTo(gp.x - L, gp.y); c.lineTo(gp.x + L, gp.y);
      c.moveTo(gp.x, gp.y - L * 0.7); c.lineTo(gp.x, gp.y + L * 0.7);
      c.stroke();
      c.restore();
    }
    if (this.stun > 0 && !this.beingDevoured && this.state !== 'consumed') {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + 0.5 * Math.sin(t * 8);
      c.strokeStyle = `rgba(255,70,190,${0.4 + 0.4 * pulse})`;
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(this.px, this.py, POD_R + 12 + 5 * pulse, 0, TAU); c.stroke();
      c.restore();
    }
  }

  drawVines(c, t) {
    const top = this.ay - 90;
    for (let k = -1; k <= 1; k++) {
      const x0 = this.ax + k * 70, y0 = top;
      const x1 = this.px + k * 26, y1 = this.py - POD_R * 0.8;
      const mx = (x0 + x1) / 2 + Math.sin(t * 0.9 + k) * 30, my = (y0 + y1) / 2;
      c.strokeStyle = '#141d0b';
      c.lineWidth = 13 - Math.abs(k) * 3;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke();
      c.strokeStyle = 'rgba(150,200,90,0.28)';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0 - 3, y0); c.quadraticCurveTo(mx - 3, my, x1 - 3, y1); c.stroke();
      for (let s = 1; s < 8; s++) {
        const u = s / 8;
        const bx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1;
        const by = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1;
        c.fillStyle = '#e8d070';
        c.beginPath(); c.moveTo(bx + 5, by); c.lineTo(bx + 13, by - 3); c.lineTo(bx + 5, by + 3); c.fill();
      }
    }
  }

  drawLash(c, t) {
    const L = this.lash;
    const x0 = L.ax, y0 = this.arena.ceilY;
    c.save();
    c.strokeStyle = '#141d0b';
    c.lineWidth = 12;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo((x0 + L.x) / 2 + Math.sin(t * 6) * 20, (y0 + L.y) / 2, L.x, L.y);
    c.stroke();
    c.fillStyle = '#2c3a14';
    c.beginPath(); c.ellipse(L.x, L.y, 20, 26, 0, 0, TAU); c.fill();
    c.fillStyle = '#e8d070';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      c.beginPath();
      c.moveTo(L.x + Math.cos(a) * 18, L.y + Math.sin(a) * 22);
      c.lineTo(L.x + Math.cos(a) * 32, L.y + Math.sin(a) * 36);
      c.lineTo(L.x + Math.cos(a + 0.3) * 18, L.y + Math.sin(a + 0.3) * 22);
      c.fill();
    }
    if (L.phase === 'rise') {
      c.globalCompositeOperation = 'lighter';
      const k = clamp(L.t / 0.75, 0, 1);
      c.fillStyle = `rgba(255,120,220,${0.25 + 0.35 * k})`;
      c.beginPath(); c.ellipse(L.x, this.arena.floorY - 2, 40 + 20 * k, 7, 0, 0, TAU); c.fill();
    }
    c.restore();
  }

  drawPod(c, t, flash) {
    const R = POD_R;
    const open = this.open;
    c.save();
    if (this.rolling) c.rotate(this.rollA);
    // spikes
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU + (this.rolling ? 0 : Math.sin(t + k) * 0.03);
      const len = 22 + (k % 2) * 12 + (this.state === 'thorns' ? 6 * Math.sin(t * 30 + k) : 0);
      c.fillStyle = flash ? '#fff' : '#e3c35a';
      c.beginPath();
      c.moveTo(Math.cos(a - 0.12) * R * 0.92, Math.sin(a - 0.12) * R * 0.92);
      c.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len));
      c.lineTo(Math.cos(a + 0.12) * R * 0.92, Math.sin(a + 0.12) * R * 0.92);
      c.fill();
    }
    // the core, glimpsed as the petals part
    if (!flash) {
      const coreA = 0.35 + open * 0.65;
      const core = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.72);
      core.addColorStop(0, `rgba(255,240,250,${coreA})`);
      core.addColorStop(0.3, `rgba(255,70,190,${coreA})`);
      core.addColorStop(1, 'rgba(90,10,60,0.9)');
      c.fillStyle = core;
      c.beginPath(); c.arc(0, 0, R * 0.74, 0, TAU); c.fill();
      c.fillStyle = `rgba(30,0,20,${0.8 * open})`;
      c.beginPath(); c.ellipse(0, 0, 5 + 3 * Math.sin(t * 2), 18 * open, 0, 0, TAU); c.fill();
    }
    // armored petals
    for (let k = 0; k < 5; k++) {
      const base = (k / 5) * TAU - Math.PI / 2;
      c.save();
      c.rotate(base);
      c.translate(0, -R * 0.1 * open);
      c.rotate(open * 0.5 * (k % 2 ? 1 : -1));
      const grd = c.createLinearGradient(0, -R, 0, 0);
      grd.addColorStop(0, flash ? '#fff' : '#5c7a2e');
      grd.addColorStop(0.6, flash ? '#fff' : '#2d4415');
      grd.addColorStop(1, flash ? '#fff' : '#142008');
      c.fillStyle = grd;
      const spread = 0.72 - open * 0.34;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, R, -Math.PI / 2 - spread, -Math.PI / 2 + spread);
      c.closePath();
      c.fill();
      if (!flash) {
        c.strokeStyle = 'rgba(190,230,120,0.35)';
        c.lineWidth = 1.4;
        c.beginPath(); c.arc(0, 0, R - 2, -Math.PI / 2 - spread, -Math.PI / 2 + spread); c.stroke();
        c.strokeStyle = 'rgba(10,16,4,0.6)';
        c.beginPath(); c.moveTo(0, -R * 0.2); c.lineTo(0, -R + 4); c.stroke();
      }
      c.restore();
    }
    c.restore();
  }

  drawLasers(c, t) {
    const tel = 0.9 / this.pace;
    if (this.state !== 'lasers' || this.t < 0.4) return;
    const firing = this.beams;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.lasers.length; i++) {
      const end = (this.laserEnds && this.laserEnds[i]) || { x: this.px, y: this.py };
      if (!firing) {
        const k = clamp((this.t - 0.4) / tel, 0, 1);
        c.strokeStyle = `rgba(255,110,210,${0.2 + 0.5 * k})`;
        c.lineWidth = 1 + k;
        c.setLineDash([10, 8]);
        c.beginPath(); c.moveTo(this.px, this.py); c.lineTo(end.x, end.y); c.stroke();
        c.setLineDash([]);
      } else {
        const flick = 0.85 + 0.15 * Math.sin(t * 60);
        for (const [w, a2] of [[30, 0.18], [12, 0.55], [4, 0.95]]) {
          c.strokeStyle = w === 4 ? `rgba(255,245,252,${a2 * flick})` : `rgba(255,70,200,${a2 * flick})`;
          c.lineWidth = w;
          c.beginPath(); c.moveTo(this.px, this.py); c.lineTo(end.x, end.y); c.stroke();
        }
      }
    }
    c.restore();
  }
}

function segHitsBox(x0, y0, a, len, b, rad) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const tt = clamp((cx - x0) * dx + (cy - y0) * dy, 0, len);
  const px = x0 + dx * tt, py = y0 + dy * tt;
  const qx = clamp(px, b.x, b.x + b.w), qy = clamp(py, b.y, b.y + b.h);
  return Math.hypot(px - qx, py - qy) < rad;
}

function beamEnd(g, x0, y0, a) {
  const dx = Math.cos(a), dy = Math.sin(a);
  for (let d = 60; d < 1400; d += 12) {
    const x = x0 + dx * d, y = y0 + dy * d;
    if (g.world.solidAtPx(x, y)) return { x, y };
  }
  return { x: x0 + dx * 1400, y: y0 + dy * 1400 };
}
