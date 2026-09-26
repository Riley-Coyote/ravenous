// HOLLOW BRIM, first of the Five. A cloaked duelist under a wide disc hat.
// Draw-cut dash, a thrown hat that boomerangs, a blink behind you, and in phase two, needles.
// Every committed strike flashes. Counter it and it's yours to devour.

import { clamp, lerp, rand, TAU, approach, sign, easeOutCubic, pick } from './util.js';
import { moveEntity } from './level.js';

const G = 2600;

export class HollowBrim {
  constructor(x, y, arena) {
    Object.assign(this, {
      x: x - 24, y, w: 48, h: 108, vx: 0, vy: 0, facing: -1, arena,
      hp: 60, maxHp: 60, alive: true, state: 'dormant', t: 0, anim: 0, kind: 'brim',
      hatOn: true, hatTilt: 0, counterable: false, telegraphed: false, glint: 0,
      stun: 0, beingDevoured: false, devourTime: 0.9, devourK: 0, flash: 0, shake: 0,
      phase2: false, fade: 1, idleDur: 0.8, lastAttack: '', onGround: false,
      contact: 10, healAmt: 30, hungerAmt: 0.35, finalBlow: false, hatDrop: null, spinHat: 0,
      isBoss: true, title: 'HOLLOW BRIM', pace: 1,
    });
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  // once it kneels, it gets its last words before it can be eaten
  get devourable() {
    return this.alive && this.stun > 0 && !this.beingDevoured && this.state !== 'consumed' && (this.state !== 'defeated' || this.t > 1.5);
  }
  get active() { return !['dormant', 'drop', 'pose', 'consumed', 'defeated', 'blinkOut'].includes(this.state); }
  get visible() { return this.state !== 'dormant' && this.fade > 0.02; }

  setState(s) {
    this.state = s;
    this.t = 0;
    if (!['windSlash', 'slash', 'windStab', 'stab'].includes(s)) this.endTelegraph();
  }

  telegraph(g) {
    if (!this.telegraphed) {
      this.telegraphed = true;
      this.glint = 0.4;
      g.sfx('telegraph');
      g.fx.ring(this.cx + this.facing * 20, this.y + 40, 8, 60, 'rgba(255,240,180,A)', 0.32, 3);
    }
    this.counterable = true;
  }
  endTelegraph() {
    this.counterable = false;
    this.telegraphed = false;
  }

  wake(g) {
    this.setState('drop');
    this.vy = 200;
    this.spinHat = 1;
  }

  update(g, dt) {
    this.anim += dt;
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.shake > 0) this.shake -= dt;
    if (this.glint > 0) this.glint -= dt;
    this.spinHat = Math.max(0, this.spinHat - dt * 0.6);
    const p = g.player;
    const dx = p.cx - this.cx;
    const A = this.arena;
    let grav = true;

    switch (this.state) {
      case 'dormant':
        return;
      case 'drop':
        this.vx = 0;
        if (this.onGround) {
          this.setState('pose');
          g.shake(0.8);
          g.sfx('bossLand');
          g.fx.dust(this.cx, this.y + this.h, 18, 1.6, 'rgba(120,110,170,');
          g.fx.ring(this.cx, this.y + this.h, 10, 160, 'rgba(150,180,255,A)', 0.6, 3);
          g.onBossLanded(this);
        }
        break;
      case 'pose':
        this.facing = sign(dx);
        break;
      case 'idle': {
        this.facing = sign(dx);
        this.vx = approach(this.vx, 0, 1800 * dt);
        if (this.t > this.idleDur) this.choose(g);
        break;
      }
      case 'stalk': {
        this.facing = sign(dx);
        const d = Math.abs(dx);
        const want = d > 330 ? 1 : d < 200 ? -1 : 0;
        this.vx = approach(this.vx, want * this.facing * 240, 1600 * dt);
        if (this.t > 0.7 || want === 0) this.choose(g, true);
        break;
      }
      case 'windSlash':
        this.vx = approach(this.vx, 0, 2000 * dt);
        this.facing = sign(dx);
        if (this.t > (this.phase2 ? 0.26 : 0.32)) this.telegraph(g);
        if (this.t > (this.phase2 ? 0.48 : 0.6)) {
          this.setState('slash');
          this.counterable = true;
          this.vx = this.facing * (this.phase2 ? 1400 : 1250);
          g.sfx('slash');
        }
        break;
      case 'slash':
        this.vx = this.facing * (this.phase2 ? 1400 : 1250);
        if (this.t > 0.16) this.endTelegraph();
        if (Math.random() < 0.8) g.fx.add({ kind: 'streak', x: this.cx - this.facing * 20, y: this.y + rand(20, 100), vx: -this.facing * rand(200, 500), vy: 0, life: 0.2, size: 2, color: 'rgba(255,150,70,', add: true });
        if (this.t > 0.34) {
          this.setState('recover');
          this.vx = this.facing * 300;
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 2200 * dt);
        if (this.t > (this.phase2 ? 0.32 : 0.45)) this.toIdle();
        break;
      case 'throwWind':
        this.vx = approach(this.vx, 0, 2000 * dt);
        this.facing = sign(dx);
        this.hatTilt = Math.min(1, this.t / 0.4);
        if (this.t > 0.42) {
          this.hatOn = false;
          this.hatTilt = 0;
          g.spawnDisc(this);
          g.sfx('throwHat');
          this.setState('hatless');
        }
        break;
      case 'hatless':
        this.facing = sign(dx);
        this.vx = approach(this.vx, 0, 1500 * dt);
        if (this.hatOn) this.toIdle(0.3);
        break;
      case 'retrieve': {
        const h = this.hatDrop;
        if (!h) { this.hatOn = true; this.toIdle(); break; }
        this.facing = sign(h.x - this.cx);
        this.vx = approach(this.vx, this.facing * 420, 2400 * dt);
        if (Math.abs(h.x - this.cx) < 30 || this.t > 2.5) {
          this.hatOn = true;
          this.hatDrop = null;
          g.sfx('whiff');
          this.toIdle(0.2);
        }
        break;
      }
      case 'blinkOut':
        this.vx = 0;
        this.fade = 1 - this.t / 0.28;
        if (this.t > 0.28) {
          let nx = p.cx - p.facing * 120 - this.w / 2;
          if (nx < A.x0 + 20 || nx > A.x1 - this.w - 20) nx = p.cx + p.facing * 120 - this.w / 2;
          this.x = clamp(nx, A.x0 + 20, A.x1 - this.w - 20);
          this.y = A.floorY - this.h;
          this.vy = 0;
          this.facing = sign(p.cx - this.cx);
          this.setState('blinkIn');
          g.fx.smoke(this.cx, this.cy, 10, 'rgba(30,20,50,', 22);
          g.sfx('blink');
        }
        break;
      case 'blinkIn':
        this.fade = Math.min(1, this.t / 0.2);
        this.facing = sign(dx);
        if (this.t > 0.22) this.setState('windStab');
        break;
      case 'windStab':
        this.vx = 0;
        this.facing = sign(dx);
        if (this.t > 0.12) this.telegraph(g);
        if (this.t > (this.phase2 ? 0.34 : 0.42)) {
          this.setState('stab');
          this.counterable = true;
          this.vx = this.facing * 760;
          g.sfx('slash');
        }
        break;
      case 'stab':
        this.vx = approach(this.vx, 0, 2600 * dt);
        if (this.t > 0.12) this.endTelegraph();
        if (this.t > 0.22) { this.setState('recover'); }
        break;
      case 'leap':
        if (this.t < 0.02) { this.vy = -1250; this.vx = clamp((A.x0 + A.x1) / 2 - this.cx, -300, 300); this.onGround = false; }
        if (this.vy >= 0 && !this.thrown) {
          this.thrown = true;
          g.spawnNeedles(this);
          this.setState('hang');
        }
        break;
      case 'hang':
        grav = false;
        this.vx = 0;
        this.vy = 0;
        if (this.t > 0.26) { this.setState('fall'); }
        break;
      case 'fall':
        if (this.onGround && this.t > 0.05) {
          g.shake(0.3);
          g.fx.dust(this.cx, this.y + this.h, 8, 1);
          this.setState('recover');
        }
        break;
      case 'stunned':
        this.vx = approach(this.vx, 0, 1200 * dt);
        if (!this.beingDevoured) {
          this.stun -= dt;
          if (this.stun <= 0) {
            this.stun = 0;
            if (!this.hatOn && this.hatDrop) this.setState('retrieve');
            else this.toIdle(0.2);
          }
        }
        break;
      case 'knockback':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.t > 0.7) {
          if (!this.hatOn && this.hatDrop) this.setState('retrieve');
          else this.toIdle(0.15);
        }
        break;
      case 'defeated':
        this.vx = approach(this.vx, 0, 1200 * dt);
        this.stun = 99;
        break;
      case 'consumed':
        this.vx = 0;
        this.fade = Math.max(0, 1 - this.t / 1.8);
        if (this.t > 1.9) this.alive = false;
        break;
    }
    if (grav) this.vy = Math.min(this.vy + G * dt, 1400);
    const r = moveEntity(g.world, this, dt);
    this.onGround = r.ground;
    if (r.hitX && this.state === 'slash') {
      this.setState('recover');
      g.shake(0.25);
    }
  }

  toIdle(extra = 0) {
    this.setState('idle');
    this.idleDur = (this.phase2 ? rand(0.25, 0.55) : rand(0.55, 0.95)) / this.pace + extra;
  }

  choose(g, fromStalk = false) {
    const p = g.player;
    const d = Math.abs(p.cx - this.cx);
    if (!fromStalk && (d > 420 || d < 120) && Math.random() < 0.45) { this.setState('stalk'); return; }
    const opts = [];
    opts.push(['slash', d < 520 ? 4 : 2]);
    if (this.hatOn) opts.push(['throw', d > 220 ? 3 : 1.5]);
    opts.push(['blink', 2.5]);
    if (this.phase2) opts.push(['needles', 2.5]);
    const pool = opts.filter((o) => o[0] !== this.lastAttack || Math.random() < 0.25);
    const total = pool.reduce((s, o) => s + o[1], 0);
    let r = Math.random() * total, pickd = pool[0][0];
    for (const o of pool) { r -= o[1]; if (r <= 0) { pickd = o[0]; break; } }
    this.lastAttack = pickd;
    if (pickd === 'slash') this.setState('windSlash');
    else if (pickd === 'throw') this.setState('throwWind');
    else if (pickd === 'blink') { this.setState('blinkOut'); g.fx.smoke(this.cx, this.cy, 10, 'rgba(30,20,50,', 22); g.sfx('blink'); }
    else { this.thrown = false; this.setState('leap'); }
  }

  hurt(g, dmg, src) {
    if (['dormant', 'defeated', 'consumed', 'blinkOut', 'blinkIn'].includes(this.state) || this.beingDevoured) return false;
    if (this.state === 'drop' || this.state === 'pose') {
      this.flash = 0.06;
      g.fx.sparks(src ? src.x : this.cx, src ? src.y : this.cy, 'rgba(200,210,255,', 5, 200);
      return true;
    }
    return this.applyDamage(g, dmg * (this.hatOn ? 1 : 2), src);
  }

  applyDamage(g, amount, src) {
    if (this.state === 'defeated' || this.state === 'consumed') return false;
    this.hp -= amount;
    this.flash = 0.08;
    this.shake = 0.08;
    g.sfx('enemyHit');
    if (!this.hatOn && src) g.fx.sparks(src.x, src.y, 'rgba(160,255,140,', 6, 300);
    if (!this.phase2 && this.hp <= this.maxHp / 2) {
      this.phase2 = true;
      g.onBossPhase2(this);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.defeat(g);
    }
    return true;
  }

  defeat(g) {
    this.setState('defeated');
    this.stun = 99;
    this.vx = 0;
    g.onBossDefeated(this);
  }

  parried(g, player) {
    this.stun = 2.4;
    this.setState('stunned');
    this.vx = sign(this.cx - player.cx) * 380;
    this.flash = 0.12;
  }

  stunByDisc(g) {
    this.stun = 2.3;
    this.setState('stunned');
    this.hatOn = false;
    this.flash = 0.15;
    this.applyDamage(g, 3, null);
  }

  hitbox() {
    return { x: this.x + 4, y: this.y + 6, w: this.w - 8, h: this.h - 6 };
  }

  // the blade's reach while slashing or stabbing
  bladeBox() {
    if (this.state !== 'slash' && this.state !== 'stab') return null;
    const reach = this.state === 'slash' ? 64 : 76;
    return { x: this.facing > 0 ? this.x + this.w - 6 : this.x - reach + 6, y: this.y + 30, w: reach, h: 50 };
  }

  // ------------------------------------------------------------ drawing

  draw(c, g) {
    if (!this.visible) return;
    const ox = this.shake > 0 || this.beingDevoured ? (Math.random() - 0.5) * (this.beingDevoured ? 6 : 3) : this.state === 'stunned' ? Math.sin(this.anim * 40) : 0;
    const drawAll = (flash) => {
      c.save();
      c.translate(this.cx + ox, this.y + this.h);
      c.scale(this.facing, 1);
      this.drawFigure(c, flash);
      c.restore();
    };
    c.save();
    c.globalAlpha = this.fade * (this.beingDevoured ? 1 - this.devourK * 0.3 : 1);
    drawAll(false);
    if (this.flash > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.7 * this.fade;
      drawAll(true);
    }
    c.restore();
    this.drawStatus(c);
  }

  pose() {
    const s = { crouch: 0, lean: 0, blade: 0.35, bladeGlow: 0.5, arm: 0.6, kneel: 0, sway: Math.sin(this.anim * 1.6) * 0.04, trail: 0 };
    switch (this.state) {
      case 'windSlash': { const k = Math.min(1, this.t / 0.35); s.crouch = 10 * k; s.lean = 0.28 * k; s.blade = lerp(0.35, -2.5, easeOutCubic(k)); s.bladeGlow = 0.6 + 0.4 * k; s.arm = lerp(0.6, -1.9, k); break; }
      case 'slash': s.crouch = 12; s.lean = 0.42; s.blade = 1.2; s.arm = 1.3; s.bladeGlow = 1; s.trail = 1; break;
      case 'recover': s.crouch = 6 * (1 - this.t / 0.45); s.lean = 0.1; s.blade = 1.4; s.arm = 1.2; break;
      case 'windStab': { const k = Math.min(1, this.t / 0.3); s.lean = -0.18 * k; s.blade = lerp(0.35, 3.0, k); s.arm = lerp(0.6, -0.4, k); s.bladeGlow = 0.6 + 0.4 * k; break; }
      case 'stab': s.lean = 0.35; s.blade = Math.PI / 2; s.arm = Math.PI / 2; s.bladeGlow = 1; s.crouch = 4; break;
      case 'throwWind': s.arm = -2.6; s.blade = 0.2; break;
      case 'stunned': case 'knockback': s.lean = 0.5; s.crouch = 14; s.blade = 0.1; s.arm = 0.2; s.bladeGlow = 0.2; break;
      case 'defeated': case 'consumed': s.kneel = 1; s.lean = 0.6; s.crouch = 34; s.blade = 0.05; s.arm = 0.4; s.bladeGlow = 0.1; break;
      case 'leap': case 'hang': case 'fall': s.crouch = 8; s.lean = 0.1; s.blade = -0.8; s.arm = -1.2; break;
      case 'pose': s.blade = -0.6 + Math.sin(this.anim * 2) * 0.05; s.arm = -0.4; break;
    }
    return s;
  }

  drawFigure(c, flash) {
    const s = this.pose();
    const white = '#ffffff';
    const hy = -104 + s.crouch;
    c.rotate(s.sway);
    // cloak
    const swayX = -clamp(this.vx * this.facing, -800, 1400) * 0.02 + Math.sin(this.anim * 2.2) * 2;
    c.save();
    c.translate(0, s.crouch * 0.4);
    const cg = c.createLinearGradient(-30, 0, 30, 0);
    cg.addColorStop(0, flash ? white : '#0b0b10');
    cg.addColorStop(0.55, flash ? white : '#1c1d26');
    cg.addColorStop(1, flash ? white : '#0e0e14');
    c.fillStyle = cg;
    c.beginPath();
    c.moveTo(-12, hy + 20);
    c.quadraticCurveTo(-26, hy + 50, -30 + swayX, -4);
    for (let k = 0; k <= 6; k++) {
      const x = lerp(-30 + swayX, 26 + swayX * 0.5, k / 6);
      c.lineTo(x, (k % 2 ? -12 : 0) + Math.sin(this.anim * 5 + k) * 2);
    }
    c.quadraticCurveTo(24, hy + 50, 14, hy + 20);
    c.closePath();
    c.fill();
    if (!flash) {
      c.strokeStyle = 'rgba(0,0,0,0.7)';
      c.lineWidth = 1;
      c.stroke();
      // cool rim light from the arena, so the cloak separates from the dark
      c.strokeStyle = 'rgba(150,160,255,0.45)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(-12, hy + 20);
      c.quadraticCurveTo(-26, hy + 50, -30 + swayX, -4);
      c.stroke();
      // red lining at the front edge, like the trailer's red-robed one
      c.strokeStyle = '#8c1a26';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(12, hy + 24);
      c.quadraticCurveTo(22, hy + 55, 24 + swayX * 0.5, -6);
      c.stroke();
      // a string of prayer beads
      for (let k = 0; k < 9; k++) {
        const a = 0.25 + k * 0.33;
        const bx = Math.cos(a) * 14 - 2, by = hy + 24 + Math.sin(a) * 9;
        const bg = c.createRadialGradient(bx - 1, by - 1, 0, bx, by, 3.2);
        bg.addColorStop(0, '#f0a060');
        bg.addColorStop(0.5, '#3a2418');
        bg.addColorStop(1, '#120a06');
        c.fillStyle = bg;
        c.beginPath(); c.arc(bx, by, 3.2, 0, TAU); c.fill();
      }
      if (s.kneel) {
        c.fillStyle = 'rgba(0,0,0,0.5)';
        c.beginPath(); c.ellipse(0, 0, 34, 5, 0, 0, TAU); c.fill();
      }
    }
    c.restore();
    // head
    c.save();
    c.translate(4 + s.lean * 18, hy + 10);
    c.rotate(s.lean * 0.5);
    c.fillStyle = flash ? white : '#15151c';
    c.beginPath(); c.ellipse(0, 0, 11, 13, 0, 0, TAU); c.fill();
    if (!flash) {
      if (this.hatOn) {
        c.fillStyle = '#050507';
        c.beginPath(); c.ellipse(1, -2, 10, 7, 0, 0, TAU); c.fill();
        const eg = c.createLinearGradient(-2, 0, 11, 0);
        eg.addColorStop(0, 'rgba(255,140,50,0)');
        eg.addColorStop(1, `rgba(255,${this.counterable ? 240 : 150},${this.counterable ? 200 : 60},1)`);
        c.fillStyle = eg;
        c.fillRect(-1, -1.5, 12, 2.4);
      } else {
        // bare head: a cluster of green eyes, like the trailer's spider-bot face
        c.fillStyle = '#2a0d12';
        c.beginPath(); c.ellipse(1, -1, 10, 10, 0, 0, TAU); c.fill();
        for (const [ex, ey, er] of [[5, -4, 3.2], [-2, -5, 2.6], [2, 3, 2.8], [8, 2, 2]]) {
          c.fillStyle = '#c8ff4a';
          c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill();
          c.fillStyle = '#ffffff';
          c.beginPath(); c.arc(ex + 0.8, ey - 0.8, er * 0.3, 0, TAU); c.fill();
        }
        c.strokeStyle = '#e33a44';
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(-9, 6); c.lineTo(-4, 9); c.stroke();
      }
    }
    c.restore();
    // blade arm
    const shX = 6 + s.lean * 16, shY = hy + 32;
    const ex = shX + Math.sin(s.arm) * 16, ey = shY + Math.cos(s.arm) * 16;
    c.strokeStyle = flash ? white : '#101016';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(ex, ey); c.stroke();
    const bl = 58;
    const ba = s.blade;
    const tipX = ex + Math.sin(ba) * bl, tipY = ey + Math.cos(ba) * bl;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const glow = s.bladeGlow;
    c.strokeStyle = `rgba(255,120,40,${0.35 * glow})`;
    c.lineWidth = 10;
    c.beginPath(); c.moveTo(ex, ey); c.lineTo(tipX, tipY); c.stroke();
    c.strokeStyle = `rgba(255,190,90,${0.8 * glow + 0.1})`;
    c.lineWidth = 3.5;
    c.beginPath(); c.moveTo(ex, ey); c.lineTo(tipX, tipY); c.stroke();
    c.strokeStyle = `rgba(255,250,230,${0.9 * glow + 0.1})`;
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(ex, ey); c.lineTo(tipX, tipY); c.stroke();
    if (s.trail) {
      c.strokeStyle = 'rgba(255,140,60,0.35)';
      c.lineWidth = 26;
      c.beginPath(); c.arc(ex - 10, ey, 50, -1.2, 1.4); c.stroke();
      c.strokeStyle = 'rgba(255,230,190,0.5)';
      c.lineWidth = 3;
      c.beginPath(); c.arc(ex - 10, ey, 60, -1.0, 1.3); c.stroke();
    }
    c.restore();
    c.fillStyle = flash ? white : '#2a2a34';
    c.beginPath(); c.arc(ex, ey, 3.5, 0, TAU); c.fill();
    // the hat
    if (this.hatOn) {
      c.save();
      c.translate(4 + s.lean * 18, hy + 2 - this.hatTilt * 16);
      c.rotate(s.lean * 0.35 - this.hatTilt * 0.4 + (this.state === 'stunned' ? 0.25 : 0));
      drawHat(c, flash, this.anim, this.spinHat);
      c.restore();
    }
  }

  drawStatus(c) {
    if (this.glint > 0 || this.counterable) {
      const k = this.glint > 0 ? this.glint / 0.4 : 0.55 + 0.45 * Math.sin(this.anim * 30);
      const gx = this.cx + this.facing * 26, gy = this.y + 44;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const r = 34 + 24 * k;
      const gr = c.createRadialGradient(gx, gy, 0, gx, gy, r);
      gr.addColorStop(0, `rgba(255,252,220,${0.6 * k + 0.2})`);
      gr.addColorStop(0.4, `rgba(255,200,110,${0.3 * k})`);
      gr.addColorStop(1, 'rgba(255,160,60,0)');
      c.fillStyle = gr;
      c.beginPath(); c.arc(gx, gy, r, 0, TAU); c.fill();
      c.strokeStyle = `rgba(255,255,240,${0.85 * k + 0.15})`;
      c.lineWidth = 2.2;
      const L = 18 + 22 * k;
      c.beginPath();
      c.moveTo(gx - L, gy); c.lineTo(gx + L, gy);
      c.moveTo(gx, gy - L * 0.7); c.lineTo(gx, gy + L * 0.7);
      c.stroke();
      c.restore();
    }
    if (this.stun > 0 && !this.beingDevoured && this.state !== 'consumed') {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + 0.5 * Math.sin(this.anim * 8);
      c.strokeStyle = `rgba(255,70,190,${0.4 + 0.4 * pulse})`;
      c.lineWidth = 2.5;
      c.beginPath();
      c.ellipse(this.cx, this.cy + 8, 42 + 5 * pulse, 64 + 5 * pulse, 0, 0, TAU);
      c.stroke();
      c.restore();
    }
  }
}

export function drawHat(c, flash, anim, spin = 0) {
  const white = '#ffffff';
  const hg = c.createLinearGradient(0, -16, 0, 6);
  hg.addColorStop(0, flash ? white : '#4a4c58');
  hg.addColorStop(0.5, flash ? white : '#2a2b34');
  hg.addColorStop(1, flash ? white : '#101116');
  c.fillStyle = hg;
  c.beginPath();
  c.ellipse(0, 0, 58, 11, 0, 0, TAU);
  c.fill();
  c.beginPath();
  c.ellipse(0, -5, 24, 10, 0, Math.PI, 0);
  c.fill();
  if (flash) return;
  c.strokeStyle = 'rgba(160,165,185,0.45)';
  c.lineWidth = 1;
  for (let k = 1; k <= 3; k++) {
    c.beginPath(); c.ellipse(0, -1, 58 - k * 11, 11 - k * 2.2, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  }
  const ticks = 16;
  for (let k = 0; k < ticks; k++) {
    const a = (k / ticks) * TAU + anim * spin * 12;
    const x = Math.cos(a) * 44, y = Math.sin(a) * 8.4;
    if (Math.sin(a) > 0.2) continue;
    c.fillStyle = 'rgba(200,205,220,0.5)';
    c.fillRect(x - 1, y - 0.5, 2, 1);
  }
  c.strokeStyle = '#e8333f';
  c.lineWidth = 2.2;
  c.beginPath(); c.ellipse(0, 0, 58, 11, 0, 0, TAU); c.stroke();
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = 'rgba(255,60,70,0.35)';
  c.lineWidth = 5;
  c.beginPath(); c.ellipse(0, 0, 58, 11, 0, 0.1, Math.PI - 0.1); c.stroke();
  c.restore();
}
