// The moon's wildlife: skittering crawlers, wingblades that dive, and a husk brute that charges.
// Each one flashes before it commits to an attack. That flash is the counter window.

import { clamp, lerp, rand, TAU, approach, sign } from './util.js';
import { moveEntity, groundAhead, wallAhead } from './level.js';

const G = 2400;

export class Enemy {
  constructor(x, y, w, h) {
    Object.assign(this, {
      x, y, w, h, vx: 0, vy: 0, facing: -1, alive: true, state: 'idle', t: 0,
      flash: 0, stun: 0, counterable: false, beingDevoured: false, onGround: false,
      hp: 3, maxHp: 3, contact: 10, devourTime: 0.6, healAmt: 25, hungerAmt: 0.25,
      anim: rand(10), shake: 0, glint: 0, telegraphed: false, dying: 0,
    });
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get devourable() { return this.alive && this.stun > 0 && !this.beingDevoured; }

  setState(s) { this.state = s; this.t = 0; }

  baseUpdate(g, dt) {
    this.anim += dt;
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.shake > 0) this.shake -= dt;
    if (this.glint > 0) this.glint -= dt;
    if (this.stun > 0 && !this.beingDevoured) {
      this.stun -= dt;
      this.counterable = false;
      if (this.stun <= 0) { this.stun = 0; this.setState('idle'); }
    }
  }

  // a sharp glint + chime the first frame an attack becomes counterable
  telegraph(g) {
    if (!this.telegraphed) {
      this.telegraphed = true;
      this.glint = 0.35;
      g.sfx('telegraph');
      g.fx.ring(this.cx, this.cy, 6, 46, 'rgba(255,240,170,A)', 0.3, 2.5);
    }
    this.counterable = true;
  }

  endTelegraph() {
    this.counterable = false;
    this.telegraphed = false;
  }

  hurt(g, dmg, src) {
    if (!this.alive || this.beingDevoured) return false;
    this.hp -= dmg;
    this.flash = 0.08;
    this.shake = 0.1;
    if (this.hp <= 0) { g.killEnemy(this, src); return true; }
    if (src && src.stun && this.canStunByCharge()) this.stunFor(g, 1.8);
    g.sfx('enemyHit');
    return true;
  }

  canStunByCharge() { return true; }

  stunFor(g, s) {
    this.stun = s;
    this.endTelegraph();
    this.setState('stunned');
  }

  parried(g, player) {
    this.stunFor(g, this.parryStun || 2.4);
    this.vx = sign(this.cx - player.cx) * 260;
    this.vy = -260;
    this.flash = 0.12;
  }

  drawStatus(c, g) {
    if (this.glint > 0 || this.counterable) {
      const k = this.glint > 0 ? this.glint / 0.35 : 0.5 + 0.5 * Math.sin(this.anim * 30);
      c.save();
      c.globalCompositeOperation = 'lighter';
      const r = 26 + 18 * k;
      const gr = c.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, r);
      gr.addColorStop(0, `rgba(255,250,210,${0.55 * k + 0.25})`);
      gr.addColorStop(0.35, `rgba(255,220,120,${0.35 * k})`);
      gr.addColorStop(1, 'rgba(255,200,80,0)');
      c.fillStyle = gr;
      c.beginPath(); c.arc(this.cx, this.cy, r, 0, TAU); c.fill();
      c.strokeStyle = `rgba(255,255,235,${0.8 * k + 0.2})`;
      c.lineWidth = 2;
      const L = 14 + 16 * k;
      c.beginPath();
      c.moveTo(this.cx - L, this.cy); c.lineTo(this.cx + L, this.cy);
      c.moveTo(this.cx, this.cy - L * 0.7); c.lineTo(this.cx, this.cy + L * 0.7);
      c.stroke();
      c.restore();
    }
    if (this.stun > 0 && !this.beingDevoured) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + 0.5 * Math.sin(this.anim * 9);
      c.strokeStyle = `rgba(255,70,190,${0.35 + 0.4 * pulse})`;
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(this.cx, this.cy, this.w * 0.62 + 4 * pulse, this.h * 0.66 + 4 * pulse, 0, 0, TAU);
      c.stroke();
      for (let k = 0; k < 3; k++) {
        const a = this.anim * 4 + (k * TAU) / 3;
        c.fillStyle = 'rgba(255,150,230,0.9)';
        c.beginPath();
        c.arc(this.cx + Math.cos(a) * this.w * 0.55, this.y - 6 + Math.sin(a) * 5, 2, 0, TAU);
        c.fill();
      }
      c.restore();
    }
  }

  // bodies desaturate and crack while being eaten
  devourTint(c) {
    if (!this.beingDevoured) return;
    const k = clamp(this.devourK || 0, 0, 1);
    c.globalAlpha *= 1 - k * 0.35;
  }

  offsetShake() {
    if (this.shake > 0 || this.beingDevoured) return (Math.random() - 0.5) * (this.beingDevoured ? 5 : 3);
    if (this.stun > 0) return Math.sin(this.anim * 50) * 0.8;
    return 0;
  }

  hitFlash(c, draw) {
    if (this.flash > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.8;
      draw(true);
      c.restore();
    }
  }
}

// ---------------------------------------------------------------- crawler

export class Crawler extends Enemy {
  constructor(x, y) {
    super(x, y, 44, 26);
    Object.assign(this, { hp: 3, maxHp: 3, contact: 12, devourTime: 0.55, healAmt: 25, hungerAmt: 0.25, cd: rand(0.5, 1.5), kind: 'crawler', parryStun: 2.4 });
  }

  update(g, dt) {
    this.baseUpdate(g, dt);
    const p = g.player;
    if (this.cd > 0) this.cd -= dt;
    switch (this.state) {
      case 'idle':
      case 'patrol': {
        this.state = 'patrol';
        this.vx = this.facing * 70;
        if (!groundAhead(g.world, this, this.facing) || wallAhead(g.world, this, this.facing)) {
          this.facing *= -1;
          this.vx = 0;
        }
        const dx = p.cx - this.cx, dy = p.cy - this.cy;
        if (this.cd <= 0 && Math.abs(dx) < 240 && Math.abs(dy) < 70 && p.state !== 'dead') {
          this.facing = sign(dx);
          this.setState('windup');
          this.vx = 0;
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        if (this.t > 0.32) this.telegraph(g);
        if (this.t > 0.5) {
          this.setState('lunge');
          this.vx = this.facing * 470;
          this.vy = -420;
          this.onGround = false;
        }
        break;
      case 'lunge':
        this.telegraph(g);
        if (this.onGround && this.t > 0.1) {
          this.endTelegraph();
          this.setState('patrol');
          this.cd = rand(1.4, 2.4) / (this.pace || 1);
        }
        break;
      case 'stunned':
        this.vx = approach(this.vx, 0, 900 * dt);
        break;
    }
    this.vy = Math.min(this.vy + G * dt, 1000);
    const r = moveEntity(g.world, this, dt);
    this.onGround = r.ground;
    if (r.hitX && this.state === 'lunge') this.vx = 0;
  }

  draw(c) {
    const ox = this.offsetShake();
    const drawBody = (flash) => {
      c.save();
      c.translate(this.cx + ox, this.y + this.h);
      c.scale(this.facing, 1);
      const walk = this.state === 'patrol' ? this.anim * 14 : this.state === 'stunned' ? this.anim * 30 : 0;
      c.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        for (const side of [-1, 1]) {
          const bx = -12 + k * 11, ph = walk + k * 1.9 + (side > 0 ? Math.PI : 0);
          const lift = Math.max(0, Math.sin(ph)) * 5;
          c.strokeStyle = flash ? '#fff' : side > 0 ? '#2a1712' : '#1a0d0a';
          c.lineWidth = 2.4;
          c.beginPath();
          c.moveTo(bx, -12);
          c.lineTo(bx + 6 + Math.cos(ph) * 3, -18 - lift);
          c.lineTo(bx + 10 + Math.cos(ph) * 5, -lift * 0.3);
          c.stroke();
        }
      }
      const rear = this.state === 'windup' ? Math.min(1, this.t / 0.4) : 0;
      c.rotate(-0.25 * rear);
      const g2 = c.createLinearGradient(0, -26, 0, -6);
      const sk = SKINS[this.skin || 'sand'];
      g2.addColorStop(0, flash ? '#fff' : sk[0]);
      g2.addColorStop(0.5, flash ? '#fff' : sk[1]);
      g2.addColorStop(1, flash ? '#fff' : sk[2]);
      c.fillStyle = g2;
      c.beginPath();
      c.ellipse(-2, -14, 22, 11, 0, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 1;
      c.stroke();
      if (!flash) {
        c.strokeStyle = sk[3];
        for (let k = 0; k < 3; k++) {
          c.beginPath();
          c.arc(-10 + k * 8, -14, 10, -2.2, -0.9);
          c.stroke();
        }
        c.fillStyle = '#1a0c08';
        c.beginPath(); c.ellipse(17, -12, 7, 6, 0, 0, TAU); c.fill();
        c.fillStyle = this.counterable ? '#fff6c8' : sk[4];
        c.beginPath(); c.arc(20, -13, 1.8, 0, TAU); c.arc(17, -15, 1.4, 0, TAU); c.fill();
        c.strokeStyle = '#1a0c08';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(22, -9); c.quadraticCurveTo(27, -8, 26, -4); c.stroke();
      }
      c.restore();
    };
    c.save();
    this.devourTint(c);
    drawBody(false);
    this.hitFlash(c, drawBody);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = this.skin === 'ice' ? 'rgba(120,220,255,0.35)' : 'rgba(255,140,60,0.35)';
    c.beginPath(); c.arc(this.cx + this.facing * 18, this.y + this.h - 13, 8, 0, TAU); c.fill();
    if (this.skin === 'magma' && !this.beingDevoured) {
      c.fillStyle = `rgba(255,110,30,${0.25 + 0.15 * Math.sin(this.anim * 6)})`;
      c.beginPath(); c.ellipse(this.cx, this.y + this.h - 14, 20, 9, 0, 0, TAU); c.fill();
    }
    c.restore();
  }
}

// carapace colors per region: top, mid, belly, seam, eye
const SKINS = {
  sand: ['#9a5a3c', '#5a2e1e', '#23110b', 'rgba(220,160,110,0.35)', '#ff9a3a'],
  ice: ['#cfe6f5', '#6f93b3', '#223449', 'rgba(230,248,255,0.5)', '#7fe8ff'],
  magma: ['#4a2320', '#23100e', '#0c0505', 'rgba(255,120,40,0.7)', '#ffb040'],
};

// ---------------------------------------------------------------- wingblade

export class Wingblade extends Enemy {
  constructor(x, y) {
    super(x, y, 40, 30);
    Object.assign(this, { hp: 4, maxHp: 4, contact: 15, devourTime: 0.6, healAmt: 30, hungerAmt: 0.3, homeX: x, homeY: y, cd: rand(0.8, 1.6), kind: 'wingblade', tx: 0, ty: 0, parryStun: 2.6 });
  }

  update(g, dt) {
    this.baseUpdate(g, dt);
    const p = g.player;
    if (this.cd > 0) this.cd -= dt;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    const d = Math.hypot(dx, dy);
    switch (this.state) {
      case 'idle':
      case 'hover': {
        this.state = 'hover';
        this.facing = sign(dx);
        const bx = this.homeX + Math.sin(this.anim * 0.9) * 40, by = this.homeY + Math.sin(this.anim * 1.7) * 14;
        this.vx = (bx - this.x) * 2.5;
        this.vy = (by - this.y) * 2.5;
        if (this.cd <= 0 && d < 420 && p.state !== 'dead') this.setState('windup');
        break;
      }
      case 'windup':
        this.facing = sign(dx);
        this.vx *= 0.9;
        this.vy = -40;
        if (this.t > 0.55) {
          this.setState('swoop');
          const tx = p.cx - this.w / 2, ty = p.y + 10;
          const ang = Math.atan2(ty - this.y, tx - this.x);
          this.vx = Math.cos(ang) * 660;
          this.vy = Math.sin(ang) * 660;
        }
        break;
      case 'swoop': {
        if (d < 230) this.telegraph(g);
        else if (this.t > 0.05) this.telegraph(g);
        const r = this.t > 1.0;
        if (r) { this.endTelegraph(); this.setState('recover'); this.cd = rand(1.6, 2.6) / (this.pace || 1); }
        break;
      }
      case 'recover': {
        const hx = this.homeX - this.x, hy = this.homeY - this.y;
        const hd = Math.hypot(hx, hy);
        this.vx = (hx / (hd + 1)) * 260;
        this.vy = (hy / (hd + 1)) * 260;
        if (hd < 20) this.setState('hover');
        break;
      }
      case 'stunned':
        this.vx = approach(this.vx, 0, 500 * dt);
        this.vy = Math.min(this.vy + G * dt, 900);
        break;
    }
    const r = moveEntity(g.world, this, dt);
    if (this.state === 'swoop' && (r.hitX || r.hitY)) {
      this.endTelegraph();
      this.setState('recover');
      this.cd = rand(1.5, 2.4) / (this.pace || 1);
    }
  }

  draw(c) {
    const ox = this.offsetShake();
    const drawBody = (flash) => {
      c.save();
      c.translate(this.cx + ox, this.cy);
      c.scale(this.facing, 1);
      const tilt = this.state === 'swoop' ? clamp(this.vy / 900, -0.6, 0.6) : this.state === 'stunned' ? 0.9 : 0.1 * Math.sin(this.anim * 2);
      c.rotate(tilt);
      const flap = this.state === 'stunned' ? 0.2 : Math.sin(this.anim * (this.state === 'windup' ? 50 : 26));
      for (const back of [true, false]) {
        c.save();
        c.translate(-2, -8);
        c.rotate((back ? -0.5 : -0.25) + flap * 0.55);
        c.fillStyle = flash ? 'rgba(255,255,255,0.9)' : back ? 'rgba(120,150,170,0.22)' : 'rgba(170,200,220,0.32)';
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(-14, -34, -46, -30);
        c.quadraticCurveTo(-28, -12, 0, 0);
        c.fill();
        if (!flash) {
          c.strokeStyle = 'rgba(210,235,255,0.45)';
          c.lineWidth = 1;
          c.stroke();
          c.beginPath(); c.moveTo(-4, -4); c.lineTo(-38, -27); c.stroke();
        }
        c.restore();
      }
      const bg = c.createLinearGradient(0, -12, 0, 12);
      bg.addColorStop(0, flash ? '#fff' : '#5b6f78');
      bg.addColorStop(1, flash ? '#fff' : '#161d22');
      c.fillStyle = bg;
      c.beginPath(); c.ellipse(-8, 4, 17, 7, 0.25, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(8, -1, 9, 8, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(-8, 4, 17, 7, 0.25, 0, TAU); c.stroke();
      if (!flash) {
        c.strokeStyle = 'rgba(160,190,200,0.35)';
        for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(-16 + k * 6, 6, 5, -1.9, -1.1); c.stroke(); }
        c.strokeStyle = '#0f1417'; c.lineWidth = 1.8; c.lineCap = 'round';
        c.beginPath(); c.moveTo(14, 3); c.quadraticCurveTo(22, 6, 20, 13); c.stroke();
        c.beginPath(); c.moveTo(12, 5); c.quadraticCurveTo(15, 12, 11, 16); c.stroke();
        for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-2 + k * 5, 8); c.lineTo(-6 + k * 5, 18 + Math.sin(this.anim * 6 + k) * 2); c.stroke(); }
        c.fillStyle = this.counterable ? '#fffbe0' : '#ffd24a';
        c.beginPath(); c.arc(12, -2, 2.6, 0, TAU); c.fill();
      }
      c.restore();
    };
    c.save();
    this.devourTint(c);
    drawBody(false);
    this.hitFlash(c, drawBody);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,210,90,0.3)';
    c.beginPath(); c.arc(this.cx + this.facing * 12, this.cy - 2, 9, 0, TAU); c.fill();
    c.restore();
  }
}

// ---------------------------------------------------------------- husk brute

export class Brute extends Enemy {
  constructor(x, y) {
    super(x, y, 72, 58);
    Object.assign(this, { hp: 12, maxHp: 12, contact: 20, devourTime: 0.85, healAmt: 45, hungerAmt: 0.45, cd: 1, kind: 'brute', parryStun: 3.0, homeX: x });
  }

  canStunByCharge() { return this.hp <= this.maxHp / 2; }

  update(g, dt) {
    this.baseUpdate(g, dt);
    const p = g.player;
    if (this.cd > 0) this.cd -= dt;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    switch (this.state) {
      case 'idle':
      case 'patrol': {
        this.state = 'patrol';
        const toHome = this.homeX - this.x;
        if (Math.abs(toHome) > 140) this.facing = sign(toHome);
        this.vx = this.facing * 55;
        if (!groundAhead(g.world, this, this.facing) || wallAhead(g.world, this, this.facing)) { this.facing *= -1; this.vx = 0; }
        if (this.cd <= 0 && Math.abs(dx) < 360 && Math.abs(dy) < 90 && p.state !== 'dead') {
          this.facing = sign(dx);
          this.setState('windup');
          this.vx = 0;
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        if (this.t > 0.4) this.telegraph(g);
        if (this.t > 0.7) {
          this.setState('charge');
          g.sfx('whiff');
        }
        break;
      case 'charge':
        this.telegraph(g);
        this.vx = this.facing * 560;
        if (this.t > 1.1 || !groundAhead(g.world, this, this.facing)) {
          this.endTelegraph();
          this.setState('patrol');
          this.cd = rand(1.4, 2.2) / (this.pace || 1);
          this.vx = 0;
        }
        break;
      case 'dazed':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.t > 1.0) { this.setState('patrol'); this.cd = 1; }
        break;
      case 'stunned':
        this.vx = approach(this.vx, 0, 900 * dt);
        break;
    }
    this.vy = Math.min(this.vy + G * dt, 1000);
    const r = moveEntity(g.world, this, dt);
    this.onGround = r.ground;
    if (r.hitX && this.state === 'charge') {
      this.endTelegraph();
      this.setState('dazed');
      g.shake(0.35);
      g.fx.dust(this.facing > 0 ? this.x + this.w : this.x, this.cy, 10, 1);
      g.sfx('land');
    }
  }

  draw(c) {
    const ox = this.offsetShake();
    const drawBody = (flash) => {
      c.save();
      c.translate(this.cx + ox, this.y + this.h);
      c.scale(this.facing, 1);
      const moving = this.state === 'patrol' || this.state === 'charge';
      const sp = this.state === 'charge' ? 22 : 7;
      const ph = moving ? this.anim * sp : 0;
      const rear = this.state === 'windup' ? Math.min(1, this.t / 0.5) : 0;
      c.rotate(-0.22 * rear + (this.state === 'charge' ? 0.08 : 0));
      c.lineCap = 'round';
      const legCol = flash ? '#fff' : '#2a140f';
      for (const [bx, off] of [[-22, 0], [16, Math.PI]]) {
        for (const near of [false, true]) {
          const q = ph + off + (near ? Math.PI * 0.5 : 0);
          c.strokeStyle = near ? legCol : flash ? '#fff' : '#170a07';
          c.lineWidth = near ? 8 : 7;
          const kx = bx + Math.sin(q) * 7, ky = -18 - Math.max(0, Math.cos(q)) * 6;
          c.beginPath();
          c.moveTo(bx, -30);
          c.lineTo(kx, ky);
          c.lineTo(kx + 4 + Math.sin(q) * 4, -1);
          c.stroke();
        }
      }
      const bg = c.createLinearGradient(0, -62, 0, -18);
      bg.addColorStop(0, flash ? '#fff' : '#8a3b2a');
      bg.addColorStop(0.6, flash ? '#fff' : '#4a1a12');
      bg.addColorStop(1, flash ? '#fff' : '#1f0906');
      c.fillStyle = bg;
      c.beginPath();
      c.moveTo(-38, -26);
      c.quadraticCurveTo(-36, -58, -6, -60);
      c.quadraticCurveTo(22, -62, 30, -40);
      c.quadraticCurveTo(34, -24, 18, -22);
      c.lineTo(-30, -20);
      c.closePath();
      c.fill();
      if (!flash) {
        c.strokeStyle = 'rgba(0,0,0,0.6)';
        c.lineWidth = 1;
        c.stroke();
        // bristled green-black plumage down the spine, like the trailer's lizard
        for (let k = 0; k < 11; k++) {
          const t = k / 10;
          const x0 = lerp(-34, 20, t), y0 = -54 + Math.sin(t * Math.PI) * -6;
          c.strokeStyle = k % 2 ? '#123a1a' : '#1f5a28';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(x0, y0 + 6);
          c.lineTo(x0 - 6, y0 - 8 - Math.sin(this.anim * 3 + k) * 1.5);
          c.stroke();
        }
      }
      c.save();
      c.translate(30, -34 - rear * 10);
      c.rotate(0.2 - rear * 0.5);
      const hg = c.createLinearGradient(0, -12, 0, 10);
      hg.addColorStop(0, flash ? '#fff' : '#d9c7a4');
      hg.addColorStop(1, flash ? '#fff' : '#6a5a44');
      c.fillStyle = hg;
      c.beginPath();
      c.moveTo(-6, -10);
      c.quadraticCurveTo(14, -14, 22, -2);
      c.lineTo(20, 6);
      c.quadraticCurveTo(6, 10, -6, 6);
      c.closePath();
      c.fill();
      if (!flash) {
        c.strokeStyle = 'rgba(0,0,0,0.65)';
        c.lineWidth = 1;
        c.stroke();
        c.fillStyle = '#140806';
        c.beginPath(); c.ellipse(6, -3, 4, 3, 0, 0, TAU); c.fill();
        c.fillStyle = this.counterable ? '#fffbe0' : '#ffd23a';
        c.beginPath(); c.arc(7, -3, 1.8, 0, TAU); c.fill();
        c.strokeStyle = '#efe4cc';
        c.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(8 + k * 3.5, 6); c.lineTo(9 + k * 3.5, 10 + (this.state === 'charge' ? 2 : 0)); c.stroke(); }
      }
      c.restore();
      c.restore();
    };
    c.save();
    this.devourTint(c);
    drawBody(false);
    this.hitFlash(c, drawBody);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,200,60,0.3)';
    c.beginPath(); c.arc(this.cx + this.facing * 38, this.y + this.h - 37, 10, 0, TAU); c.fill();
    c.restore();
  }
}

// ---------------------------------------------------------------- ice jelly

// Drifts toward you through the Frostvault, flares, then stings.
export class Jelly extends Enemy {
  constructor(x, y) {
    super(x, y, 40, 36);
    Object.assign(this, { hp: 5, maxHp: 5, contact: 14, devourTime: 0.6, healAmt: 30, hungerAmt: 0.3, homeX: x, homeY: y, cd: rand(1, 2), kind: 'jelly', parryStun: 2.6 });
  }

  update(g, dt) {
    this.baseUpdate(g, dt);
    const p = g.player;
    if (this.cd > 0) this.cd -= dt;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy);
    switch (this.state) {
      case 'idle':
      case 'drift': {
        this.state = 'drift';
        const pulse = Math.max(0, Math.sin(this.anim * 2.6));
        const toward = d < 460 ? 1 : 0;
        const tx = toward ? dx / (d + 1) : (this.homeX - this.x) * 0.01;
        const ty = toward ? dy / (d + 1) : (this.homeY - this.y) * 0.01;
        this.vx = approach(this.vx, tx * 90 * (0.4 + pulse), 200 * dt);
        this.vy = approach(this.vy, ty * 70 * (0.4 + pulse) - 12 * pulse, 200 * dt);
        this.facing = Math.sign(dx) || 1;
        if (this.cd <= 0 && d < 170 && p.state !== 'dead') this.setState('flare');
        break;
      }
      case 'flare':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.t > 0.3) this.telegraph(g);
        if (this.t > 0.52) {
          this.setState('sting');
          this.vx = (dx / (d + 1)) * 560;
          this.vy = (dy / (d + 1)) * 560;
          g.sfx('whiff');
        }
        break;
      case 'sting':
        this.telegraph(g);
        this.vx *= 1 - 2.4 * dt;
        this.vy *= 1 - 2.4 * dt;
        if (this.t > 0.5) {
          this.endTelegraph();
          this.setState('drift');
          this.cd = rand(1.6, 2.6) / (this.pace || 1);
        }
        break;
      case 'stunned':
        this.vx = approach(this.vx, 0, 500 * dt);
        this.vy = Math.min(this.vy + 900 * dt, 400);
        break;
    }
    const r = moveEntity(g.world, this, dt);
    if (this.state === 'sting' && (r.hitX || r.hitY)) { this.endTelegraph(); this.setState('drift'); this.cd = 1.8; }
  }

  draw(c) {
    const ox = this.offsetShake();
    const t = this.anim;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    const drawBody = (flash) => {
      c.save();
      c.translate(this.cx + ox, this.cy);
      const squash = 1 + 0.12 * Math.sin(t * 5.2);
      c.scale(1 / squash, squash);
      const bell = c.createRadialGradient(0, -6, 2, 0, 0, 24);
      bell.addColorStop(0, flash ? 'rgba(255,255,255,0.95)' : 'rgba(230,200,255,0.75)');
      bell.addColorStop(0.6, flash ? 'rgba(255,255,255,0.8)' : 'rgba(160,110,230,0.45)');
      bell.addColorStop(1, 'rgba(90,60,180,0.1)');
      c.fillStyle = bell;
      c.beginPath();
      c.moveTo(-20, 4);
      c.bezierCurveTo(-22, -22, 22, -22, 20, 4);
      for (let k = 0; k <= 6; k++) c.lineTo(20 - (k * 40) / 6, 4 + (k % 2 ? 4 : 0));
      c.closePath();
      c.fill();
      if (!flash) {
        c.strokeStyle = 'rgba(240,225,255,0.55)';
        c.lineWidth = 1;
        c.stroke();
        c.strokeStyle = `rgba(200,170,255,${0.35 + 0.25 * pulse})`;
        c.lineCap = 'round';
        for (let k = 0; k < 5; k++) {
          const x0 = -14 + k * 7;
          c.beginPath();
          c.moveTo(x0, 6);
          c.quadraticCurveTo(x0 + Math.sin(t * 3 + k) * 6, 20, x0 + Math.sin(t * 2 + k * 2) * 4, 32 + k % 2 * 4);
          c.stroke();
        }
        c.fillStyle = this.counterable ? 'rgba(255,255,230,0.95)' : `rgba(255,150,240,${0.6 + 0.4 * pulse})`;
        c.beginPath(); c.arc(0, -6, 4.5, 0, TAU); c.fill();
      }
      c.restore();
    };
    c.save();
    this.devourTint(c);
    drawBody(false);
    this.hitFlash(c, drawBody);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(190,140,255,${0.18 + 0.12 * pulse})`;
    c.beginPath(); c.arc(this.cx, this.cy - 4, 34, 0, TAU); c.fill();
    c.restore();
  }
}

// ---------------------------------------------------------------- magma spitter

// Rooted in the rock, it lobs molten globs in an arc. Shoot the globs, or charge-shot it still.
export class Spitter extends Enemy {
  constructor(x, y) {
    super(x, y, 40, 44);
    Object.assign(this, { hp: 6, maxHp: 6, contact: 12, devourTime: 0.7, healAmt: 35, hungerAmt: 0.35, cd: rand(1, 2), kind: 'spitter', parryStun: 2.6 });
  }

  update(g, dt) {
    this.baseUpdate(g, dt);
    const p = g.player;
    if (this.cd > 0) this.cd -= dt;
    this.facing = Math.sign(p.cx - this.cx) || 1;
    const d = Math.hypot(p.cx - this.cx, p.cy - this.cy);
    if (this.state === 'idle') {
      if (this.cd <= 0 && d < 620 && p.state !== 'dead') this.setState('swell');
    } else if (this.state === 'swell') {
      if (this.t > 0.6) {
        const tx = p.cx, ty = p.cy;
        const T = 0.9;
        const vx = (tx - this.cx) / T;
        const vy = (ty - (this.y + 6) - 0.5 * 1400 * T * T) / T;
        g.spawnGlob(this.cx, this.y + 6, vx, vy);
        g.sfx('missile');
        this.setState('idle');
        this.cd = rand(1.6, 2.4) / (this.pace || 1);
      }
    }
  }

  draw(c) {
    const ox = this.offsetShake();
    const sw = this.state === 'swell' ? Math.min(1, this.t / 0.6) : 0;
    const drawBody = (flash) => {
      c.save();
      c.translate(this.cx + ox, this.y + this.h);
      c.scale(this.facing, 1);
      const g2 = c.createLinearGradient(0, -44, 0, 0);
      g2.addColorStop(0, flash ? '#fff' : '#3a1a14');
      g2.addColorStop(1, flash ? '#fff' : '#0e0604');
      c.fillStyle = g2;
      c.beginPath();
      c.moveTo(-20, 0);
      c.quadraticCurveTo(-24, -30, -4, -40 - sw * 6);
      c.quadraticCurveTo(16, -44 - sw * 4, 20, -24);
      c.quadraticCurveTo(22, -8, 20, 0);
      c.closePath();
      c.fill();
      if (!flash) {
        c.strokeStyle = 'rgba(255,120,40,0.55)';
        c.lineWidth = 1.2;
        for (let k = 0; k < 4; k++) {
          c.beginPath();
          c.moveTo(-14 + k * 8, -4);
          c.lineTo(-10 + k * 7 + Math.sin(k) * 3, -20 - k * 3);
          c.stroke();
        }
        const mouth = c.createRadialGradient(8, -36 - sw * 5, 0, 8, -36 - sw * 5, 10 + sw * 6);
        mouth.addColorStop(0, `rgba(255,240,180,${0.6 + 0.4 * sw})`);
        mouth.addColorStop(0.5, `rgba(255,120,30,${0.5 + 0.4 * sw})`);
        mouth.addColorStop(1, 'rgba(255,60,0,0)');
        c.fillStyle = mouth;
        c.beginPath(); c.arc(8, -36 - sw * 5, 10 + sw * 6, 0, TAU); c.fill();
      }
      c.restore();
    };
    c.save();
    this.devourTint(c);
    drawBody(false);
    this.hitFlash(c, drawBody);
    c.restore();
  }
}

// ---------------------------------------------------------------- lab drone

// Hovers, paints you with a targeting line, fires. Every few volleys it rams, flashing first.
export class Drone extends Enemy {
  constructor(x, y) {
    super(x, y, 36, 28);
    Object.assign(this, { hp: 5, maxHp: 5, contact: 14, devourTime: 0.6, healAmt: 30, hungerAmt: 0.3, homeX: x, homeY: y, cd: rand(1, 2), kind: 'drone', shots: 0, aimX: 0, aimY: 0, parryStun: 2.6 });
  }

  update(g, dt) {
    this.baseUpdate(g, dt);
    const p = g.player;
    if (this.cd > 0) this.cd -= dt;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy);
    this.facing = Math.sign(dx) || 1;
    switch (this.state) {
      case 'idle':
      case 'hover': {
        this.state = 'hover';
        const bx = this.homeX + Math.sin(this.anim * 0.8) * 60, by = this.homeY + Math.sin(this.anim * 1.9) * 10;
        this.vx = (bx - this.x) * 2;
        this.vy = (by - this.y) * 2;
        if (this.cd <= 0 && d < 520 && p.state !== 'dead') this.setState(this.shots >= 2 ? 'windRam' : 'aim');
        break;
      }
      case 'aim':
        this.vx *= 0.9;
        this.vy *= 0.9;
        this.aimX = p.cx;
        this.aimY = p.cy;
        if (this.t > 0.7) {
          const a = Math.atan2(this.aimY - this.cy, this.aimX - this.cx);
          g.spawnBolt(this.cx, this.cy, Math.cos(a) * 760, Math.sin(a) * 760);
          g.sfx('beamRav');
          this.shots++;
          this.setState('hover');
          this.cd = rand(1.2, 1.9) / (this.pace || 1);
        }
        break;
      case 'windRam':
        this.vx *= 0.9;
        this.vy = -40;
        if (this.t > 0.35) this.telegraph(g);
        if (this.t > 0.5) {
          this.setState('ram');
          this.vx = (dx / (d + 1)) * 640;
          this.vy = (dy / (d + 1)) * 640;
          this.shots = 0;
        }
        break;
      case 'ram':
        this.telegraph(g);
        if (this.t > 0.8) { this.endTelegraph(); this.setState('hover'); this.cd = rand(1.4, 2) / (this.pace || 1); }
        break;
      case 'stunned':
        this.vx = approach(this.vx, 0, 500 * dt);
        this.vy = Math.min(this.vy + 1200 * dt, 600);
        break;
    }
    const r = moveEntity(g.world, this, dt);
    if (this.state === 'ram' && (r.hitX || r.hitY)) { this.endTelegraph(); this.setState('hover'); this.cd = 1.6; g.shake(0.2); }
  }

  draw(c) {
    const ox = this.offsetShake();
    const drawBody = (flash) => {
      c.save();
      c.translate(this.cx + ox, this.cy);
      c.rotate(this.state === 'stunned' ? 0.6 : Math.sin(this.anim * 3) * 0.06);
      c.fillStyle = flash ? '#fff' : '#2a2340';
      c.beginPath();
      c.moveTo(-18, -4); c.lineTo(-10, -12); c.lineTo(10, -12); c.lineTo(18, -4); c.lineTo(12, 8); c.lineTo(-12, 8);
      c.closePath();
      c.fill();
      if (!flash) {
        c.strokeStyle = 'rgba(170,150,255,0.55)';
        c.lineWidth = 1;
        c.stroke();
        c.fillStyle = '#120e20';
        c.fillRect(-22, -2, 6, 3);
        c.fillRect(16, -2, 6, 3);
        const eye = this.state === 'aim' || this.counterable;
        c.fillStyle = this.counterable ? '#fffbe0' : eye ? '#ff4a6a' : '#7fd0ff';
        c.beginPath(); c.arc(this.facing * 4, -2, 3.4, 0, TAU); c.fill();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = 'rgba(120,180,255,0.5)';
        c.beginPath(); c.ellipse(0, 12, 9, 3 + Math.sin(this.anim * 30), 0, 0, TAU); c.fill();
      }
      c.restore();
    };
    c.save();
    this.devourTint(c);
    drawBody(false);
    this.hitFlash(c, drawBody);
    c.restore();
    if (this.state === 'aim') {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgba(255,70,110,${0.2 + 0.5 * (this.t / 0.7)})`;
      c.lineWidth = 1;
      c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(this.cx, this.cy); c.lineTo(this.aimX, this.aimY); c.stroke();
      c.restore();
    }
  }
}

export function makeEnemy(ch, x, y, theme) {
  let e = null;
  if (ch === 'c') { e = new Crawler(x - 22, y - 26); e.skin = theme === 'ice' ? 'ice' : theme === 'magma' ? 'magma' : 'sand'; }
  else if (ch === 'w') e = new Wingblade(x - 20, y - 15);
  else if (ch === 'b') e = new Brute(x - 36, y - 58);
  else if (ch === 'j') e = new Jelly(x - 20, y - 18);
  else if (ch === 's') e = new Spitter(x - 20, y - 44);
  else if (ch === 'd') e = new Drone(x - 18, y - 14);
  return e;
}
