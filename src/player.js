// Samus: movement, weapons, counter, devour, phase shift, and her procedural rig.

import { clamp, lerp, approach, rand, TAU, easeOutCubic, makeCanvas } from './util.js';
import { moveEntity, T, TILE } from './level.js';
import { setCharge } from './audio.js';

export const PHYS = {
  G: 2600, MAX_FALL: 1150, RUN: 330, ACC_G: 3400, DEC_G: 3800, ACC_A: 2500, JUMP_V: 960,
  COYOTE: 0.1, JBUF: 0.13, FIRE_CD: 0.11, CHARGE_T: 0.7,
  DASH_V: 1150, DASH_T: 0.17, DASH_CD: 0.42,
  MELEE_T: 0.3, MELEE_A0: 0.03, MELEE_A1: 0.2,
};
const AIM = { fwd: 0, diagUp: -Math.PI / 4, up: -Math.PI / 2, diagDown: Math.PI / 4, down: Math.PI / 2 };
const PIVOT = { x: 4, y: -60 }, CANNON_LEN = 36;

export class Player {
  constructor(x, y) {
    Object.assign(this, {
      x, y, w: 30, h: 76, vx: 0, vy: 0, facing: 1, onGround: false,
      energy: 199, maxEnergy: 199, missiles: 15, maxMissiles: 15,
      hunger: 0, ravenousT: 0, hasPhase: false,
      inv: 0, state: 'normal', stateT: 0,
      coyote: 0, jumpBuf: 0, spin: false, spinA: 0,
      fireCd: 0, missileCd: 0, charge: 0, charging: false, chargeReady: false,
      meleeParried: false, meleeHits: null,
      dashCd: 0, airDash: true, phasing: false, ghostT: 0,
      animT: 0, runPhase: 0, aim: 'fwd', aimAngle: 0, shootT: 0, landT: 0,
      devour: null, reachAngle: 0, dropThrough: 0, fallV: 0, visible: true, kneelDur: 1.4,
      hasMorph: false, waterStride: false, lastDownT: -9, rollA: 0, bombCd: 0,
      safe: null, safeT: 0, splashT: 0, hazardT: 0,
    });
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  muzzle() {
    const a = this.aimAngle;
    const lx = PIVOT.x + Math.cos(a) * CANNON_LEN, ly = PIVOT.y + Math.sin(a) * CANNON_LEN;
    return { x: this.cx + lx * this.facing, y: this.y + this.h + ly, dx: Math.cos(a) * this.facing, dy: Math.sin(a) };
  }

  chestPos() {
    return { x: this.cx + this.facing * 3, y: this.y + 22 };
  }

  handPos() {
    const sh = { x: this.cx - 4 * this.facing, y: this.y + this.h - 66 };
    const a = this.reachAngle;
    return { x: sh.x + Math.cos(a) * 34 * this.facing, y: sh.y + Math.sin(a) * 34 };
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  cancelCharge() {
    this.charging = false;
    this.charge = 0;
    this.chargeReady = false;
    setCharge(0);
  }

  update(g, dt) {
    this.animT += dt;
    this.stateT += dt;
    if (this.inv > 0) this.inv -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.missileCd > 0) this.missileCd -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.shootT > 0) this.shootT -= dt;
    if (this.landT > 0) this.landT -= dt;
    if (this.dropThrough > 0) this.dropThrough -= dt;
    if (this.bombCd > 0) this.bombCd -= dt;
    if (this.ravenousT > 0) {
      this.ravenousT -= dt;
      if (this.ravenousT <= 0) this.hunger = 0;
    }
    switch (this.state) {
      case 'normal': this.updateNormal(g, dt); break;
      case 'ball': this.updateBall(g, dt); break;
      case 'melee': this.updateMelee(g, dt); break;
      case 'devour': this.updateDevour(g, dt); break;
      case 'dash': this.updateDash(g, dt); break;
      case 'hurt': this.physics(g, dt); if (this.stateT > 0.28) this.setState('normal'); break;
      case 'intro': this.physics(g, dt, PHYS.G * 0.5, 720); break;
      case 'kneel': this.vx = 0; this.physics(g, dt); if (this.stateT > this.kneelDur) this.setState('normal'); break;
      case 'frozen': this.vx = approach(this.vx, 0, 3000 * dt); this.physics(g, dt); break;
      case 'dead': break;
    }
  }

  physics(g, dt, grav = PHYS.G, maxFall = PHYS.MAX_FALL) {
    this.vy = Math.min(this.vy + grav * dt, maxFall);
    const wasGround = this.onGround;
    const vyBefore = this.vy;
    const r = moveEntity(g.world, this, dt);
    this.onGround = r.ground;
    if (this.onGround && !wasGround) this.onLand(g, vyBefore);
    if (!this.onGround && wasGround && this.vy >= 0) this.coyote = PHYS.COYOTE;
    // remember the last solid footing, for when a hazard throws her back
    if (this.onGround && !r.water) {
      this.safeT += dt;
      if (this.safeT > 0.12) this.safe = { x: this.x, y: this.y, ball: this.state === 'ball' };
    } else this.safeT = 0;
    if (r.water && Math.abs(this.vx) > 60) {
      this.splashT -= dt;
      if (this.splashT <= 0) {
        this.splashT = 0.05;
        g.splash(this.cx - Math.sign(this.vx) * 8, this.y + this.h, Math.abs(this.vx) / 330);
      }
    }
    return r;
  }

  onLand(g, v) {
    this.spin = false;
    this.airDash = true;
    if (this.state === 'intro') {
      this.setState('kneel');
      this.landT = 0.2;
      g.onIntroLanding();
      return;
    }
    if (v > 420) {
      this.landT = 0.12;
      g.sfx('land');
      g.fx.dust(this.cx, this.y + this.h, 6, Math.min(1.4, v / 900));
    }
  }

  standingOnOneWay(g) {
    const ty = Math.floor((this.y + this.h + 2) / TILE);
    const x0 = Math.floor(this.x / TILE), x1 = Math.floor((this.x + this.w - 0.01) / TILE);
    let one = false;
    for (let tx = x0; tx <= x1; tx++) {
      if (g.world.solidFor(tx, ty, this)) return false;
      if (g.world.tile(tx, ty) === T.ONEWAY) one = true;
    }
    return one;
  }

  updateNormal(g, dt) {
    const I = g.input;
    const locked = g.controlLocked;
    const L = !locked && I.down('left'), R = !locked && I.down('right');
    const U = !locked && I.down('up'), D = !locked && I.down('down');
    const dir = (R ? 1 : 0) - (L ? 1 : 0);
    if (dir !== 0) this.facing = dir;
    const acc = this.onGround ? (dir !== 0 ? PHYS.ACC_G : PHYS.DEC_G) : PHYS.ACC_A;
    this.vx = approach(this.vx, dir * PHYS.RUN, acc * dt);
    // tap down twice on the ground to curl into the Morph Ball
    if (!locked && this.hasMorph && I.pressed('down')) {
      if (this.onGround && this.animT - this.lastDownT < 0.36) {
        this.lastDownT = -9;
        this.morphIn(g);
        return;
      }
      this.lastDownT = this.animT;
    }

    if (this.coyote > 0) this.coyote -= dt;
    if (this.jumpBuf > 0) this.jumpBuf -= dt;
    if (!locked && I.pressed('jump')) {
      if (D && this.onGround && this.standingOnOneWay(g)) {
        this.dropThrough = 0.25;
        this.onGround = false;
        this.y += 2;
      } else this.jumpBuf = PHYS.JBUF;
    }
    if (this.jumpBuf > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = -PHYS.JUMP_V;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.spin = Math.abs(this.vx) > 150 && !U && !I.down('fire');
      this.spinA = 0;
      g.sfx('jump');
      g.fx.dust(this.cx, this.y + this.h, 4, 0.5);
    }
    // letting go early shortens the jump, but even a quick tap clears a two-tile ledge
    if (I.released('jump') && this.vy < -620) this.vy = -620;

    let aim = 'fwd';
    if (U && dir !== 0) aim = 'diagUp';
    else if (U) aim = 'up';
    else if (D && dir !== 0) aim = 'diagDown';
    else if (D && !this.onGround) aim = 'down';
    this.aim = aim;
    this.aimAngle = AIM[aim];
    if (aim !== 'fwd') this.spin = false;

    if (!locked) {
      if (I.pressed('fire')) {
        if (this.fireCd <= 0) this.fireBeam(g, false);
        this.charging = true;
        this.charge = 0;
      }
      if (this.charging && I.down('fire')) {
        this.charge += dt;
        if (this.charge > 0.12) setCharge(Math.min(1, this.charge / PHYS.CHARGE_T));
        if (this.charge >= PHYS.CHARGE_T && !this.chargeReady) {
          this.chargeReady = true;
          g.sfx('chargeReady');
        }
        if (this.charge > 0.15) g.chargeFx(this);
      }
      if (this.charging && !I.down('fire')) {
        if (this.charge >= PHYS.CHARGE_T) this.fireBeam(g, true);
        this.cancelCharge();
      }
      if (I.pressed('missile')) this.fireMissile(g);
      if (I.pressed('counter')) { this.startMelee(g); return; }
      if (I.pressed('devour')) {
        if (g.tryDevour(this)) return;
      }
      if (I.pressed('dash') && this.hasPhase && this.dashCd <= 0 && (this.onGround || this.airDash)) {
        this.startDash(g, dir);
        return;
      }
    }
    this.physics(g, dt);
    if (this.onGround && Math.abs(this.vx) > 20) this.runPhase += dt * Math.abs(this.vx) * 0.05;
    if (this.spin) this.spinA += dt * 17;
  }

  fireBeam(g, charged) {
    const m = this.muzzle();
    const rav = this.ravenousT > 0;
    const speed = charged ? 1250 : 1500;
    g.spawnShot({
      x: m.x, y: m.y, vx: m.dx * speed, vy: m.dy * speed, life: charged ? 0.62 : 0.42,
      dmg: (charged ? 4 : 1) * (rav ? 2 : 1), kind: charged ? 'charge' : 'beam', r: charged ? 13 : 5,
      rav, owner: 'player', stun: charged,
    });
    this.fireCd = PHYS.FIRE_CD;
    this.shootT = 0.18;
    this.spin = false;
    g.sfx(charged ? 'charged' : rav ? 'beamRav' : 'beam');
    g.fx.muzzle(m.x, m.y, m.dx, m.dy, charged, rav);
    if (charged) {
      g.shake(0.22);
      this.vx -= m.dx * 120;
    }
  }

  fireMissile(g) {
    if (this.missileCd > 0) return;
    if (this.missiles <= 0) { g.sfx('empty'); return; }
    this.missiles--;
    this.missileCd = 0.32;
    this.shootT = 0.2;
    this.spin = false;
    const m = this.muzzle();
    g.spawnShot({ x: m.x, y: m.y, vx: m.dx * 650, vy: m.dy * 650, acc: 2600, maxV: 1500, dx: m.dx, dy: m.dy, life: 1.1, dmg: 6, kind: 'missile', r: 7, owner: 'player' });
    g.sfx('missile');
    g.fx.muzzle(m.x, m.y, m.dx, m.dy, true, false);
  }

  startMelee(g) {
    this.setState('melee');
    this.meleeParried = false;
    this.meleeHits = new Set();
    this.spin = false;
    this.cancelCharge();
    g.sfx('whiff');
  }

  meleeBox() {
    const w = 96, h = 104;
    return { x: this.facing > 0 ? this.cx - 10 : this.cx - w + 10, y: this.y + this.h / 2 - h / 2 - 6, w, h };
  }

  updateMelee(g, dt) {
    const t = this.stateT;
    this.vx = approach(this.vx, 0, 2600 * dt);
    if (t >= PHYS.MELEE_A0 && t <= PHYS.MELEE_A1) g.resolveMelee(this);
    if (this.meleeParried && g.input.pressed('devour') && g.tryDevour(this)) return;
    this.physics(g, dt);
    if (t >= PHYS.MELEE_T) this.setState('normal');
  }

  startDevour(g, target) {
    this.setState('devour');
    this.devour = { target, dur: target.devourTime || 0.7, done: false };
    this.vx *= 0.3;
    this.spin = false;
    this.cancelCharge();
    this.facing = target.cx >= this.cx ? 1 : -1;
    this.inv = Math.max(this.inv, 0.3);
  }

  updateDevour(g, dt) {
    const dv = this.devour;
    this.vx = approach(this.vx, 0, 3000 * dt);
    this.physics(g, dt);
    const tgt = dv.target;
    const sh = { x: this.cx - 4 * this.facing, y: this.y + this.h - 66 };
    this.reachAngle = clamp(Math.atan2(tgt.cy - sh.y, Math.abs(tgt.cx - sh.x)), -1.1, 1.1);
    if (!dv.done && this.stateT >= dv.dur) {
      dv.done = true;
      g.finishDevour(this, tgt);
    }
    if (this.stateT >= dv.dur + 0.3) {
      this.setState('normal');
      this.devour = null;
      this.inv = Math.max(this.inv, 0.35);
    }
  }

  startDash(g, dir) {
    this.setState('dash');
    if (dir) this.facing = dir;
    this.vx = this.facing * PHYS.DASH_V;
    this.vy = 0;
    this.phasing = true;
    this.dashCd = PHYS.DASH_CD;
    if (!this.onGround) this.airDash = false;
    this.spin = false;
    this.ghostT = 0;
    this.phasedThrough = false;
    this.cancelCharge();
    this.inv = Math.max(this.inv, 0.22);
    g.sfx('dash');
    g.fx.ring(this.cx, this.cy, 8, 70, 'rgba(120,210,255,A)', 0.28, 3);
  }

  updateDash(g, dt) {
    this.vx = this.facing * PHYS.DASH_V;
    this.vy = 0;
    const r = moveEntity(g.world, this, dt);
    this.ghostT -= dt;
    if (this.ghostT <= 0) {
      this.ghostT = 0.024;
      g.addGhost(this);
    }
    const inPhase = g.world.overlapsType(this, T.PHASE);
    if (inPhase && !this.phasedThrough) {
      this.phasedThrough = true;
      g.onPhaseThrough(this);
    }
    if ((this.stateT >= PHYS.DASH_T && !inPhase) || (r.hitX && !inPhase)) {
      this.phasing = false;
      this.setState('normal');
      this.vx = this.facing * PHYS.RUN * 0.85;
    } else if (r.hitX && inPhase) {
      this.x -= this.facing * 6;
    }
  }

  damage(g, amount, fromX) {
    if (this.inv > 0 || this.state === 'devour' || this.state === 'dash' || this.state === 'dead' || this.state === 'intro' || this.state === 'hold' || g.god) return false;
    amount = Math.max(1, Math.round(amount * (g.diff ? g.diff.dmg : 1)));
    this.energy -= amount;
    this.inv = 1.0;
    if (this.state !== 'ball') this.setState('hurt');
    this.spin = false;
    this.cancelCharge();
    const s = fromX < this.cx ? 1 : -1;
    this.vx = s * 380;
    this.vy = -420;
    this.onGround = false;
    g.sfx('hurt');
    g.shake(0.45);
    g.hitstop(0.05);
    g.hurtFlash = 0.35;
    if (this.energy <= 0) {
      this.energy = 0;
      g.playerDied();
    }
    return true;
  }

  heal(n) {
    this.energy = Math.min(this.maxEnergy, this.energy + n);
  }

  pose() {
    return {
      x: this.cx, y: this.y + this.h, facing: this.facing, state: this.state, t: this.stateT,
      onGround: this.onGround, vx: this.vx, vy: this.vy, runPhase: this.runPhase,
      aimAngle: this.aimAngle, spin: this.spin && !this.onGround, spinA: this.spinA,
      landT: this.landT, charge: this.charging ? clamp(this.charge / PHYS.CHARGE_T, 0, 1) : 0,
      rav: this.ravenousT > 0, animT: this.animT, reachAngle: this.reachAngle, kneelDur: this.kneelDur,
      ball: this.state === 'ball', rollA: this.rollA,
    };
  }

  // ---------------------------------------------------------------- morph ball

  setForm(ball) {
    const feet = this.y + this.h, cx = this.cx;
    this.w = ball ? 28 : 30;
    this.h = ball ? 28 : 76;
    this.x = cx - this.w / 2;
    this.y = feet - this.h;
  }

  morphIn(g) {
    const feet = this.y + this.h, cx = this.cx;
    this.w = 28;
    this.h = 28;
    this.x = cx - 14;
    this.y = feet - 28;
    this.setState('ball');
    this.spin = false;
    this.cancelCharge();
    g.sfx('morph');
    g.fx.ring(cx, feet - 14, 6, 44, 'rgba(255,190,120,A)', 0.25, 2);
    g.hud.dismissPrompt('morph');
  }

  canStand(g) {
    const feet = this.y + this.h, cx = this.cx;
    const x0 = Math.floor((cx - 15) / TILE), x1 = Math.floor((cx + 14.99) / TILE);
    const y0 = Math.floor((feet - 76) / TILE), y1 = Math.floor((feet - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (g.world.solidFor(tx, ty, this)) return false;
    return true;
  }

  morphOut(g) {
    if (!this.canStand(g)) {
      g.sfx('empty');
      return false;
    }
    const feet = this.y + this.h, cx = this.cx;
    this.w = 30;
    this.h = 76;
    this.x = cx - 15;
    this.y = feet - 76;
    this.setState('normal');
    g.sfx('unmorph');
    g.fx.ring(cx, feet - 30, 6, 50, 'rgba(160,210,255,A)', 0.25, 2);
    return true;
  }

  updateBall(g, dt) {
    const I = g.input;
    const locked = g.controlLocked;
    const L = !locked && I.down('left'), R = !locked && I.down('right');
    const dir = (R ? 1 : 0) - (L ? 1 : 0);
    if (dir) this.facing = dir;
    this.vx = approach(this.vx, dir * 310, (this.onGround ? 2600 : 1600) * dt);
    if (!locked && I.pressed('jump') && (this.onGround || this.coyote > 0)) {
      this.vy = -720;
      this.onGround = false;
      this.coyote = 0;
      g.sfx('jump');
    }
    if (this.coyote > 0) this.coyote -= dt;
    if (!locked && I.pressed('fire') && this.bombCd <= 0) {
      if (g.spawnBomb(this.cx, this.y + this.h - 13)) this.bombCd = 0.16;
    }
    if (!locked && I.pressed('up')) {
      if (this.morphOut(g)) return;
    }
    this.physics(g, dt);
    this.rollA += (this.vx * dt) / 14;
  }

  // a bomb went off nearby: pop the ball upward (the bomb jump)
  bombBounce(g, bx, by) {
    if (this.state !== 'ball') return;
    const d = Math.hypot(this.cx - bx, this.cy - by);
    if (d < 56) {
      this.vy = Math.min(this.vy, -780);
      this.onGround = false;
    }
  }
}

// ---------------------------------------------------------------- the rig

const SUIT = {
  red: ['#ff8a70', '#cf4a3b', '#5b1510'],
  redB: ['#b8523f', '#8c2f25', '#3a0c08'],
  blue: ['#7aaaff', '#2f63c9', '#10265a'],
  blueB: ['#4f78c8', '#1f4696', '#0a1a40'],
  white: ['#ffffff', '#dbe3ef', '#7d8aa0'],
  visor: ['#f3ffb0', '#b6ec48', '#3a7414'],
  visorRav: ['#ffd0f2', '#ff4fbf', '#6a0f4a'],
  dark: '#0b1020',
  light: 'rgba(190,255,110,',
};

function computePose(p) {
  const s = { hipY: -44, lean: 0, fr: { th: 0.1, kn: 0.12 }, bk: { th: -0.12, kn: 0.12 }, arm: p.aimAngle, off: { sh: 0.3, el: 1.1 }, headY: 0 };
  const t = p.animT;
  if (p.state === 'kneel') {
    const k = clamp(p.t / 0.18, 0, 1);
    const rise = clamp((p.t - (p.kneelDur - 0.45)) / 0.45, 0, 1);
    const down = k * (1 - rise);
    s.hipY = lerp(-44, -26, down);
    s.fr = { th: lerp(0.1, 1.3, down), kn: lerp(0.12, 1.5, down) };
    s.bk = { th: lerp(-0.12, 0.25, down), kn: lerp(0.12, 1.85, down) };
    s.lean = lerp(0, 0.45, down);
    s.off = { sh: lerp(0.3, 0.9, down), el: lerp(1.1, 0.6, down) };
    s.arm = lerp(p.aimAngle, 1.2, down);
    s.headY = 2 * down;
    return s;
  }
  if (p.state === 'intro') {
    s.fr = { th: 0.5, kn: 0.9 };
    s.bk = { th: -0.4, kn: 0.6 };
    s.off = { sh: 2.6, el: 0.4 };
    s.arm = -1.9;
    s.lean = -0.2 + Math.sin(t * 3) * 0.1;
    return s;
  }
  if (p.spin) {
    s.hipY = -40;
    s.fr = { th: 1.95, kn: 2.55 };
    s.bk = { th: 1.7, kn: 2.45 };
    s.arm = 0.9;
    s.off = { sh: 1.3, el: 1.9 };
    s.lean = 0.55;
    return s;
  }
  if (!p.onGround) {
    if (p.vy < 0) { s.fr = { th: 0.75, kn: 1.25 }; s.bk = { th: -0.1, kn: 0.75 }; }
    else { s.fr = { th: 0.38, kn: 0.6 }; s.bk = { th: -0.22, kn: 0.45 }; }
    s.off = { sh: 0.6, el: 0.9 };
  } else if (Math.abs(p.vx) > 25) {
    const ph = p.runPhase;
    const leg = (q) => ({ th: 0.78 * Math.sin(q), kn: 0.18 + 1.25 * Math.max(0, Math.cos(q)) });
    s.fr = leg(ph);
    s.bk = leg(ph + Math.PI);
    s.hipY = -44 - 2.2 * Math.abs(Math.cos(ph));
    s.lean = 0.14;
    s.off = { sh: -0.65 * Math.sin(ph), el: 1.0 };
  } else {
    s.hipY = -44 + 0.7 * Math.sin(t * 2.4);
  }
  if (p.state === 'melee') {
    const k = clamp((p.t - 0.01) / 0.16, 0, 1);
    s.arm = lerp(1.15, -1.75, easeOutCubic(k));
    s.lean = 0.24;
    s.fr = { th: 0.6, kn: 0.55 };
    s.bk = { th: -0.5, kn: 0.2 };
    s.off = { sh: -0.4, el: 0.6 };
  }
  if (p.state === 'devour') {
    s.lean = -0.08;
    s.fr = { th: 0.5, kn: 0.4 };
    s.bk = { th: -0.55, kn: 0.25 };
    s.arm = 1.1;
    s.off = { sh: Math.PI / 2 + p.reachAngle, el: 0.05, reach: true };
  }
  if (p.state === 'hurt') {
    s.lean = -0.35;
    s.off = { sh: -1.1, el: 0.4 };
    s.arm = -0.5;
  }
  return s;
}

function line(c, a, b) {
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.stroke();
}

function capsule(c, a, b, r, col) {
  c.lineCap = 'round';
  c.strokeStyle = col[2];
  c.lineWidth = r * 2 + 2;
  line(c, a, b);
  c.strokeStyle = col[1];
  c.lineWidth = r * 2;
  line(c, a, b);
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
  const o = r * 0.42;
  c.strokeStyle = col[0];
  c.lineWidth = r * 0.62;
  c.globalAlpha *= 0.85;
  line(c, { x: a.x + nx * o + (dx / len) * r * 0.3, y: a.y + ny * o + (dy / len) * r * 0.3 }, { x: b.x + nx * o - (dx / len) * r * 0.3, y: b.y + ny * o - (dy / len) * r * 0.3 });
  c.globalAlpha /= 0.85;
}

function ball(c, x, y, r, col) {
  const g = c.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.1, x, y, r);
  g.addColorStop(0, col[0]);
  g.addColorStop(0.45, col[1]);
  g.addColorStop(1, col[2]);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.55)';
  c.lineWidth = 1;
  c.stroke();
}

function leg(c, hip, L, back) {
  const TH = 20, SH = 21;
  const k = { x: hip.x + Math.sin(L.th) * TH, y: hip.y + Math.cos(L.th) * TH };
  const sa = L.th - L.kn;
  const a = { x: k.x + Math.sin(sa) * SH, y: k.y + Math.cos(sa) * SH };
  const blue = back ? SUIT.blueB : SUIT.blue;
  capsule(c, hip, k, 7.2, blue);
  capsule(c, k, a, 6.1, blue);
  const fd = { x: Math.cos(sa), y: -Math.sin(sa) };
  capsule(c, { x: a.x - fd.x * 2, y: a.y - fd.y * 2 + 1 }, { x: a.x + fd.x * 8, y: a.y + fd.y * 8 + 1 }, 4.6, back ? SUIT.blueB : SUIT.blue);
  if (!back) {
    c.strokeStyle = 'rgba(230,238,250,0.85)';
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    line(c, { x: lerp(hip.x, k.x, 0.25) + 2, y: lerp(hip.y, k.y, 0.25) }, { x: lerp(hip.x, k.x, 0.7) + 2, y: lerp(hip.y, k.y, 0.7) });
  }
  ball(c, k.x + 1.2, k.y, back ? 4.6 : 5.4, back ? SUIT.redB : SUIT.red);
  if (!back) {
    c.fillStyle = SUIT.light + '0.9)';
    c.beginPath(); c.arc(k.x + 2.5, k.y + 0.5, 1.3, 0, TAU); c.fill();
  }
}

function arm(c, sh, A, back, reachGlow) {
  const UL = 13, FL = 13;
  const e = { x: sh.x + Math.sin(A.sh) * UL, y: sh.y + Math.cos(A.sh) * UL };
  const fa = A.sh + A.el;
  const hnd = { x: e.x + Math.sin(fa) * FL, y: e.y + Math.cos(fa) * FL };
  const col = back ? SUIT.blueB : SUIT.blue;
  capsule(c, sh, e, 5.2, col);
  capsule(c, e, hnd, 4.7, col);
  if (reachGlow > 0) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(hnd.x, hnd.y, 0, hnd.x, hnd.y, 16);
    g.addColorStop(0, `rgba(255,120,220,${0.9 * reachGlow})`);
    g.addColorStop(1, 'rgba(255,60,180,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(hnd.x, hnd.y, 16, 0, TAU); c.fill();
    c.restore();
  }
  ball(c, hnd.x, hnd.y, 4.4, back ? SUIT.redB : SUIT.red);
  return hnd;
}

function torso(c, H, lean) {
  const u = { x: Math.sin(lean), y: -Math.cos(lean) };
  const n = { x: Math.cos(lean), y: Math.sin(lean) };
  const P = (a, b) => ({ x: H.x + u.x * a + n.x * b, y: H.y + u.y * a + n.y * b });
  const pts = [P(-2, -7), P(-2, 7), P(12, 9.5), P(22, 12), P(27, 6), P(27, -9), P(20, -11), P(10, -8)];
  const g = c.createLinearGradient(P(0, -10).x, P(26, 0).y, P(10, 12).x, P(0, 12).y);
  g.addColorStop(0, SUIT.red[0]);
  g.addColorStop(0.45, SUIT.red[1]);
  g.addColorStop(1, SUIT.red[2]);
  c.fillStyle = g;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.55)';
  c.lineWidth = 1;
  c.stroke();
  // pale abdomen plating
  const ab = [P(1, -5), P(1, 6), P(11, 7.5), P(12, -4)];
  c.fillStyle = 'rgba(214,224,238,0.9)';
  c.beginPath();
  ab.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(40,50,70,0.6)';
  c.beginPath();
  const m1 = P(4.5, -5), m2 = P(4.5, 7);
  c.moveTo(m1.x, m1.y); c.lineTo(m2.x, m2.y);
  c.stroke();
  const lp = P(18, 7);
  c.fillStyle = SUIT.light + '0.95)';
  c.beginPath(); c.arc(lp.x, lp.y, 1.8, 0, TAU); c.fill();
  return P;
}

function helmet(c, hc, rav) {
  ball(c, hc.x, hc.y, 10.6, SUIT.red);
  c.strokeStyle = 'rgba(255,190,170,0.55)';
  c.lineWidth = 1.2;
  c.beginPath(); c.arc(hc.x - 1, hc.y, 8.5, -2.6, -1.2); c.stroke();
  const vc = rav ? SUIT.visorRav : SUIT.visor;
  const g = c.createLinearGradient(hc.x + 2, hc.y - 6, hc.x + 11, hc.y + 4);
  g.addColorStop(0, vc[0]);
  g.addColorStop(0.5, vc[1]);
  g.addColorStop(1, vc[2]);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(hc.x + 0.5, hc.y - 4.5);
  c.quadraticCurveTo(hc.x + 10.5, hc.y - 7, hc.x + 12, hc.y + 0.5);
  c.quadraticCurveTo(hc.x + 8.5, hc.y + 5, hc.x + 1.5, hc.y + 3);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.lineWidth = 1;
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(hc.x + 3, hc.y - 4.2);
  c.quadraticCurveTo(hc.x + 8, hc.y - 5.4, hc.x + 10, hc.y - 3);
  c.stroke();
  c.fillStyle = 'rgba(20,10,10,0.85)';
  c.beginPath();
  c.ellipse(hc.x + 4, hc.y + 7.5, 6, 3, 0.2, 0, TAU);
  c.fill();
}

function cannon(c, pv, ang, p) {
  const d = { x: Math.cos(ang), y: Math.sin(ang) };
  const end = { x: pv.x + d.x * 30, y: pv.y + d.y * 30 };
  capsule(c, { x: pv.x - d.x * 4, y: pv.y - d.y * 4 }, end, 7.6, SUIT.blue);
  const band = (t, col, w) => {
    const q = { x: pv.x + d.x * 30 * t, y: pv.y + d.y * 30 * t };
    c.strokeStyle = col;
    c.lineWidth = w;
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo(q.x - d.y * 7.8, q.y + d.x * 7.8);
    c.lineTo(q.x + d.y * 7.8, q.y - d.x * 7.8);
    c.stroke();
  };
  band(0.35, 'rgba(225,232,245,0.95)', 3);
  band(0.72, 'rgba(10,20,40,0.8)', 2);
  const mz = { x: end.x + d.x * 4, y: end.y + d.y * 4 };
  c.fillStyle = '#0a0f1c';
  c.beginPath(); c.ellipse(mz.x, mz.y, 3.2, 6.4, ang, 0, TAU); c.fill();
  const glowA = 0.55 + p.charge * 0.45;
  c.fillStyle = p.rav ? `rgba(255,110,210,${glowA})` : `rgba(200,255,120,${glowA})`;
  c.beginPath(); c.arc(pv.x + d.x * 18, pv.y + d.y * 18, 2, 0, TAU); c.fill();
  if (p.charge > 0.05) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const r = 5 + p.charge * 12 + Math.sin(p.animT * 40) * 1.5 * p.charge;
    const g = c.createRadialGradient(mz.x, mz.y, 0, mz.x, mz.y, r * 1.8);
    const col = p.rav ? '255,100,210' : '255,210,120';
    g.addColorStop(0, `rgba(255,255,255,${0.9 * p.charge})`);
    g.addColorStop(0.3, `rgba(${col},${0.8 * p.charge})`);
    g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g;
    c.beginPath(); c.arc(mz.x, mz.y, r * 1.8, 0, TAU); c.fill();
    c.restore();
  }
}

function drawMorphBall(c, p) {
  const x = p.x, y = p.y - 14, R = 14;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const gl = c.createRadialGradient(x, y, 0, x, y, R * 2.6);
  gl.addColorStop(0, p.rav ? 'rgba(255,90,200,0.4)' : 'rgba(255,170,110,0.32)');
  gl.addColorStop(1, 'rgba(255,120,80,0)');
  c.fillStyle = gl;
  c.beginPath(); c.arc(x, y, R * 2.6, 0, TAU); c.fill();
  c.globalCompositeOperation = 'source-over';
  ball(c, x, y, R, SUIT.blue);
  c.save();
  c.translate(x, y);
  c.rotate(p.rollA);
  c.fillStyle = SUIT.red[1];
  for (let k = 0; k < 2; k++) {
    c.rotate(Math.PI);
    c.beginPath();
    c.arc(0, 0, R - 2, -0.55, 0.55);
    c.arc(0, 0, R * 0.52, 0.55, -0.55, true);
    c.closePath();
    c.fill();
  }
  c.strokeStyle = 'rgba(8,16,40,0.9)';
  c.lineWidth = 1.6;
  for (let k = 0; k < 4; k++) {
    c.rotate(Math.PI / 2);
    c.beginPath(); c.moveTo(R * 0.5, 0); c.lineTo(R - 0.5, 0); c.stroke();
  }
  c.restore();
  const pulse = 0.6 + 0.4 * Math.sin(p.animT * 8);
  c.fillStyle = p.rav ? `rgba(255,120,220,${0.7 * pulse + 0.3})` : `rgba(200,255,120,${0.7 * pulse + 0.3})`;
  c.beginPath(); c.arc(x, y, 3.4, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.beginPath(); c.ellipse(x - 5, y - 6, 4, 2.2, -0.6, 0, TAU); c.fill();
  c.restore();
}

export function drawSamus(c, p) {
  if (p.ball) {
    drawMorphBall(c, p);
    return;
  }
  const s = computePose(p);
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
  const H = { x: 0, y: s.hipY };
  const up = (d, side = 0) => ({ x: H.x + Math.sin(s.lean) * d + Math.cos(s.lean) * side, y: H.y - Math.cos(s.lean) * d + Math.sin(s.lean) * side });
  const shoulder = up(25, 1);
  const head = up(36.5, 3);
  head.y += s.headY;

  leg(c, { x: H.x - 3, y: H.y }, s.bk, true);
  const reach = s.off.reach ? 1 : 0;
  arm(c, { x: shoulder.x - 5, y: shoulder.y + 2 }, s.off, true, reach);
  ball(c, shoulder.x - 7, shoulder.y + 1, 9, SUIT.blueB);
  torso(c, H, s.lean);
  leg(c, { x: H.x + 2, y: H.y }, s.fr, false);
  helmet(c, head, p.rav);
  // front pauldron, the big sphere
  ball(c, shoulder.x + 2, shoulder.y + 3, 11.8, SUIT.blue);
  c.strokeStyle = 'rgba(12,28,70,0.9)';
  c.lineWidth = 2.2;
  c.beginPath(); c.arc(shoulder.x + 2, shoulder.y + 3, 7.5, 0.4, 2.3); c.stroke();
  c.strokeStyle = 'rgba(230,240,255,0.8)';
  c.lineWidth = 1.2;
  c.beginPath(); c.arc(shoulder.x + 2, shoulder.y + 3, 10.2, -2.4, -1.4); c.stroke();
  cannon(c, { x: shoulder.x + 3, y: shoulder.y + 8 }, s.arm, p);
  c.restore();
}

// Blue holographic afterimage for the phase shift, rendered once per snapshot.
export function renderGhost(pose, color = '120,210,255') {
  const size = 180;
  const mask = makeCanvas(size, size);
  const m = mask.getContext('2d');
  const q = { ...pose, x: size / 2, y: size * 0.78, charge: 0 };
  drawSamus(m, q);
  m.globalCompositeOperation = 'source-in';
  m.fillStyle = '#fff';
  m.fillRect(0, 0, size, size);
  const out = makeCanvas(size, size);
  const e = out.getContext('2d');
  for (const [dx, dy] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]]) e.drawImage(mask, dx, dy);
  e.globalCompositeOperation = 'source-in';
  e.fillStyle = `rgba(${color},1)`;
  e.fillRect(0, 0, size, size);
  e.globalCompositeOperation = 'destination-out';
  e.drawImage(mask, 0, 0);
  m.fillStyle = `rgba(${color},0.3)`;
  m.fillRect(0, 0, size, size);
  e.globalCompositeOperation = 'source-over';
  e.drawImage(mask, 0, 0);
  return { canvas: out, ox: pose.x - size / 2, oy: pose.y - size * 0.78 };
}

// The magenta hand that grips what Samus devours.
export function drawDevourHand(c, from, to, t) {
  const reach = easeOutCubic(clamp(t / 0.22, 0, 1));
  const grip = clamp((t - 0.25) / 0.2, 0, 1);
  const hx = lerp(from.x, to.x, reach), hy = lerp(from.y, to.y, reach);
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  c.save();
  c.globalCompositeOperation = 'lighter';
  // the tether
  const g = c.createLinearGradient(from.x, from.y, hx, hy);
  g.addColorStop(0, 'rgba(255,90,200,0.15)');
  g.addColorStop(1, 'rgba(255,140,230,0.75)');
  c.strokeStyle = g;
  c.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    c.lineWidth = 7 - k * 2.2;
    c.beginPath();
    c.moveTo(from.x, from.y);
    const mx = (from.x + hx) / 2 + Math.sin(t * 30 + k) * 6, my = (from.y + hy) / 2 + Math.cos(t * 26 + k * 2) * 6;
    c.quadraticCurveTo(mx, my, hx, hy);
    c.stroke();
  }
  c.translate(hx, hy);
  c.rotate(ang);
  const sc = 1.9 + 0.12 * Math.sin(t * 40);
  c.scale(sc, sc);
  const glow = c.createRadialGradient(0, 0, 0, 0, 0, 30);
  glow.addColorStop(0, 'rgba(255,150,230,0.35)');
  glow.addColorStop(0.5, 'rgba(255,70,190,0.16)');
  glow.addColorStop(1, 'rgba(255,40,170,0)');
  c.fillStyle = glow;
  c.beginPath(); c.arc(0, 0, 34, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,200,245,0.95)';
  c.fillStyle = 'rgba(255,120,220,0.55)';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(-4, 0, 9, 11, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.lineWidth = 3.4;
  const curl = grip * 1.2;
  for (let f = 0; f < 4; f++) {
    const off = -7.5 + f * 5;
    const l1 = 9 - Math.abs(f - 1.5) * 1.2;
    c.beginPath();
    c.moveTo(4, off);
    const a1 = curl * 0.9;
    const p1 = { x: 4 + Math.cos(a1) * l1, y: off + Math.sin(a1) * l1 * (off < 0 ? -0.3 : 0.3) };
    c.lineTo(p1.x, p1.y);
    const a2 = a1 + curl;
    c.lineTo(p1.x + Math.cos(a2) * l1 * 0.8, p1.y + Math.sin(a2) * l1 * 0.8 * (off < 0 ? -1 : 1));
    c.stroke();
  }
  c.beginPath();
  c.moveTo(-2, -9);
  c.lineTo(3 - curl * 2, -16 + curl * 5);
  c.stroke();
  c.restore();
}
