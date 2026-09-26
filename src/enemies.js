// The moon's wildlife: skittering crawlers, wingblades that dive, and a husk brute that charges.
// Each one flashes before it commits to an attack. That flash is the counter window.

import { clamp, lerp, rand, TAU, approach, sign } from './util.js';
import { moveEntity, groundAhead, wallAhead } from './level.js';
import { drawCreature, paintCrawler, paintWingblade, paintBrute, paintJelly, paintSpitter, paintDrone } from './creatures.js';

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
    drawCreature(c, this, paintCrawler);
  }
}



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
    drawCreature(c, this, paintWingblade);
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
    drawCreature(c, this, paintBrute);
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
    drawCreature(c, this, paintJelly);
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
    drawCreature(c, this, paintSpitter);
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
    drawCreature(c, this, paintDrone);
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
