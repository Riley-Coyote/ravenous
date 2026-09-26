// RAVENOUS: a fan demo for Liam, made after watching the Metroid Ravenous reveal trailer.
// Loop, camera, combat rules, rooms, items, hazards, story beats, menus.

import { clamp, lerp, rand, TAU, overlap, makeNoise2D, sign, approach } from './util.js';
import { Input } from './input.js';
import { audioInit, sfx as playSfx, setAmbient, setBossMusic, musicTick, toggleMute, setCharge, audioParts } from './audio.js';
import { World, TILE, T } from './level.js';
import { paintRoom, layerOrigin, VIEW_W, VIEW_H, PALETTES, drawDoor, drawMembrane, makeVignette, drawPool, drawCrackedBlock, drawVent } from './art.js';
import { FX } from './fx.js';
import { Player, drawSamus, renderGhost, drawDevourHand } from './player.js';
import { makeEnemy } from './enemies.js';
import { HollowBrim, drawHat } from './boss.js';
import { Thornheart } from './thornheart.js';
import { HUD, drawTitle, drawPause, drawEnd, drawDeath, drawRotate, titleLayout } from './hud.js';
import { Touch } from './touch.js';
import { Cinematic } from './cinematic.js';
import { music } from './music.js';


const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
let scale = 1;
// canvas resolution; steps down on its own if a device can't keep up
let resScale = Math.min(2, window.devicePixelRatio || 1);
const perf = { acc: 0, n: 0, slow: 0 };

function resize() {
  const s = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
  const dpr = resScale;
  canvas.style.width = `${Math.round(VIEW_W * s)}px`;
  canvas.style.height = `${Math.round(VIEW_H * s)}px`;
  canvas.width = Math.round(VIEW_W * s * dpr);
  canvas.height = Math.round(VIEW_H * s * dpr);
  scale = canvas.width / VIEW_W;
}
addEventListener('resize', resize);
resize();

const DIFFS = {
  easy: { key: 'easy', name: 'Easy', hint: 'More energy, gentler hunters, slow-motion counters.', dmg: 0.5, hp: 0.7, pace: 0.8, tanks: 2, assist: true },
  normal: { key: 'normal', name: 'Normal', hint: 'The way it was meant to be played.', dmg: 1, hp: 1, pace: 1, tanks: 1, assist: false },
  hard: { key: 'hard', name: 'Hard', hint: 'Everything hits harder and moves faster.', dmg: 1.6, hp: 1.3, pace: 1.2, tanks: 1, assist: false },
};
const SAVE_KEY = 'ravenous-for-liam-v2';

const ITEM_INFO = {
  phase: { title: 'Phase Shift', kicker: 'ACQUIRED', line: 'Dash through blue membranes, and through harm.', key: 'dash' },
  morph: { title: 'Morph Ball', kicker: 'ACQUIRED', line: 'Tap down twice to curl up and roll. Shoot to drop bombs.', key: 'down' },
  tank: { title: "Liam's Tank", kicker: 'ACQUIRED', line: 'An energy tank sealed in the ice, under a carved name. +100 energy.', key: null },
  missile: { title: 'Missile Tank', kicker: 'ACQUIRED', line: 'Five more missiles.', key: 'missile' },
  stride: { title: 'Water Stride', kicker: 'ABSORBED', line: 'Its strength is yours now. Run across water like solid ground.', key: null },
};
const ITEM_TOTAL = 6;

const g = {
  input: new Input(), fx: new FX(), hud: new HUD(), world: null, art: {},
  player: null, enemies: [], shots: [], eshots: [], pickups: [], items: [], membranes: [], pools: [], vents: [], bombs: [], ghosts: [], timers: [],
  boss: null, thorn: null, brim: null, bossFight: false, hatProp: null, room: null,
  cam: { x: 0, y: 0, look: 110, zoom: 1, zoomTarget: 1, focus: null, trauma: 0, ox: 0, oy: 0, punch: 0 },
  state: 'loading', loadMsg: 'painting the moon', time: 0, realTime: 0, stateT: 0,
  slowT: 0, slowScale: 1, hitstopT: 0, hurtFlash: 0, flashWhite: 0, flashMag: 0, fade: 1, fadeTarget: 0,
  controlLocked: false, showHud: true, paused: false, intro: null, cine: null, deathT: 0, endT: 0,
  god: params.has('god'), calm: params.has('calm'), checkpoint: null, flags: {},
  diff: DIFFS.normal, menuSel: 1, playTime: 0, touch: null, broken: [], stats: null,
};
window.__R = g;
g.hud.input = g.input;

// Safari only lets sound start inside a real tap or key press, so unlock it right there.
// iOS: 'playback' makes game audio play even with the ringer switch on silent.
const unlockAudio = () => {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  audioInit();
};
for (const ev of ['keydown', 'pointerdown', 'touchend', 'mousedown']) addEventListener(ev, unlockAudio, { passive: true });

// losing focus mid-fight pauses the game instead of letting Samus stand there taking hits
addEventListener('blur', () => {
  if (g.state === 'play' && !g.intro && !g.paused && g.input.lastDevice !== 'touch') {
    g.paused = true;
    setCharge(0);
  }
});
g.audioParts = audioParts;
setTimeout(() => { g.music = music; }, 0);

// ---------------------------------------------------------------- services used by entities

g.sfx = (name, arg) => playSfx(name, arg);
g.shake = (amt) => { g.cam.trauma = Math.min(1, g.cam.trauma + amt); };
g.hitstop = (s) => { g.hitstopT = Math.max(g.hitstopT, s); };
g.slow = (scaleTo, seconds) => { g.slowScale = scaleTo; g.slowT = Math.max(g.slowT, seconds); };
g.after = (s, fn) => g.timers.push({ t: s, fn });

g.spawnShot = (s) => { s.t = 0; g.shots.push(s); };

g.chargeFx = (p) => {
  if (Math.random() > 0.45) return;
  const m = p.muzzle();
  const a = rand(TAU), r = rand(24, 44);
  const rav = p.ravenousT > 0;
  g.fx.add({
    kind: 'dot', x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r, sx: m.x + Math.cos(a) * r, sy: m.y + Math.sin(a) * r,
    wob: 0, arc: 0, home: () => p.muzzle(), life: rand(0.18, 0.3), size: rand(1.2, 2.4),
    color: rav ? 'rgba(255,120,220,' : 'rgba(255,225,150,', add: true,
  });
};

g.addGhost = (p) => {
  const img = renderGhost(p.pose());
  g.ghosts.push({ img, life: 0.32, max: 0.32 });
};

g.onPhaseThrough = (p) => {
  g.sfx('phase');
  g.fx.ring(p.cx, p.cy, 10, 90, 'rgba(140,220,255,A)', 0.4, 3);
  for (let i = 0; i < 18; i++) g.fx.add({ kind: 'dot', x: p.cx + rand(-10, 10), y: p.y + rand(0, p.h), vx: rand(-300, 300), vy: rand(-200, 200), life: rand(0.3, 0.6), size: rand(1.5, 3), color: 'rgba(150,225,255,', add: true, drag: 4 });
  g.hud.dismissPrompt('phase');
  g.flags.phased = true;
};

g.splash = (x, y, k) => {
  for (let i = 0; i < 3; i++) g.fx.add({ kind: 'dot', x: x + rand(-6, 6), y, vx: rand(-80, 80), vy: -rand(120, 260) * k, grav: 900, life: rand(0.25, 0.45), size: rand(1.2, 2.4), color: 'rgba(170,255,210,', add: true });
  if (Math.random() < 0.3) g.fx.ring(x, y, 2, 16, 'rgba(170,255,210,A)', 0.3, 1.2);
};

g.spawnBomb = (x, y) => {
  if (g.bombs.length >= 3) return false;
  g.bombs.push({ x, y, t: 0.85 });
  g.sfx('bombSet');
  return true;
};

g.spawnGlob = (x, y, vx, vy) => g.eshots.push({ kind: 'glob', x, y, vx, vy, t: 0, w: 18, h: 18, dmg: 14, grav: 1400 });
g.spawnBolt = (x, y, vx, vy) => g.eshots.push({ kind: 'bolt', x, y, vx, vy, t: 0, w: 12, h: 12, dmg: 12 });
g.spawnThorn = (x, ceilY) => g.eshots.push({ kind: 'thorn', x, y: ceilY + 20, vx: 0, vy: 0, t: 0, w: 14, h: 30, dmg: 12, wait: 0.55 });

g.spawnDisc = (b) => {
  const p = g.player;
  const sx = b.cx, sy = b.y + 6;
  const ang = Math.atan2(p.cy - 10 - sy, p.cx - sx);
  g.eshots.push({ kind: 'disc', x: sx, y: sy, vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900, t: 0, w: 70, h: 20, reflected: false, spin: 0, dmg: 15 });
};

g.spawnNeedles = (b) => {
  const p = g.player;
  const base = Math.atan2(p.cy - b.cy, p.cx - b.cx);
  for (const off of [-0.22, 0, 0.22]) {
    const a = base + off;
    g.eshots.push({ kind: 'kunai', x: b.cx, y: b.cy - 20, vx: Math.cos(a) * 820, vy: Math.sin(a) * 820, t: 0, w: 14, h: 14, dmg: 10 });
  }
  g.sfx('throwHat');
};

// ---------------------------------------------------------------- devour

g.tryDevour = (p) => {
  const t = devourTarget(p, 150);
  if (!t) return false;
  p.startDevour(g, t);
  t.beingDevoured = true;
  t.devourK = 0;
  g.sfx('devour', t.devourTime);
  g.fx.hand(null, null, t.devourTime + 0.2, () => p.handPos(), () => (t.alive ? { x: t.cx, y: t.cy } : null));
  g.cam.zoomTarget = 1.12;
  g.cam.focus = t;
  g.hud.dismissPrompt('devour');
  g.hud.dismissPrompt('finish');
  return true;
};

function devourTarget(p, range) {
  if (!p || p.state === 'ball') return null;
  let best = null, bd = Infinity;
  const list = g.enemies.filter((e) => e.room === g.room?.id);
  if (g.boss) list.push(g.boss);
  for (const e of list) {
    if (!e.devourable) continue;
    const d = Math.hypot(e.cx - p.cx, e.cy - p.cy) - e.w * 0.5;
    if (d < range && d < bd) { bd = d; best = e; }
  }
  return best;
}

g.finishDevour = (p, t) => {
  t.beingDevoured = false;
  g.cam.zoomTarget = 1;
  g.cam.focus = null;
  g.flashMag = 0.5;
  g.shake(0.35);
  g.sfx('devourEnd');
  g.fx.ring(p.chestPos().x, p.chestPos().y, 10, 120, 'rgba(255,90,200,A)', 0.45, 3);
  const heal = t.healAmt;
  p.heal(heal);
  g.fx.add({ kind: 'text', x: p.cx + 18, y: p.y - 8, vy: -40, life: 1.1, color: 'rgba(255,150,225,', font: '500 14px "Inter", system-ui, sans-serif', text: `+${heal}` });
  if (p.ravenousT <= 0) {
    p.hunger = Math.min(1, p.hunger + t.hungerAmt);
    if (p.hunger >= 1) {
      p.ravenousT = 10;
      g.hud.flashRav = 1.6;
      g.sfx('ravenous');
      g.slow(0.35, 0.5);
    }
  }
  if (t.isBoss) {
    if (t.state === 'defeated') {
      consumeBoss(t, p);
      return;
    }
    t.applyDamage(g, 12, null);
    if (t.state !== 'defeated') {
      t.stun = 0;
      if (t.kind === 'thorn') {
        if (t.rolling) { t.setState('roll'); t.pvx = sign(t.px - p.cx) * 500; }
        else { t.swingY = t.restY; t.setState('recoil'); }
      } else {
        t.setState('knockback');
        t.vx = sign(t.cx - p.cx) * 560;
      }
    }
    g.fx.shards(t.cx, t.cy, ['rgba(255,80,190,A)', 'rgba(255,170,230,A)', 'rgba(60,40,60,A)'], 14, 300, () => p.chestPos());
    return;
  }
  killEnemy(t, { devoured: true });
};

// ---------------------------------------------------------------- story beats

g.onIntroLanding = () => {
  g.sfx('bigLand');
  g.shake(0.9);
  g.fx.dust(g.player.cx, g.player.y + g.player.h, 26, 1.8);
  g.fx.ring(g.player.cx, g.player.y + g.player.h, 10, 220, 'rgba(255,220,170,A)', 0.7, 2);
  g.player.kneelDur = 2.2;
  g.showHud = true;
  g.hud.say('SAMUS', 'Everything down here is starving.', 2.6, 0.7);
  g.hud.say('SAMUS', 'So am I.', 2.0, 0.3);
  g.after(2.2, () => { g.controlLocked = false; g.intro = null; save(); });
  g.after(5.8, () => teachBasics());
};

function teachBasics() {
  g.hud.prompt('move', 'move', 'Move', 7);
  g.after(0.8, () => g.hud.prompt('jump', 'jump', 'Jump · hold for height', 7));
  g.after(1.6, () => g.hud.prompt('shoot', 'fire', 'Shoot · hold to charge', 7));
}

g.onBossLanded = (b) => {
  const quick = g.flags.brimSeen;
  g.flags.brimSeen = true;
  if (quick) {
    g.after(0.6, () => { g.controlLocked = false; b.toIdle(0.3); music.play('boss'); });
    return;
  }
  g.sfx('bossVoice');
  g.hud.say('HOLLOW BRIM', 'You fell a long way, little hunter.', 2.3, 0.2);
  g.hud.say('HOLLOW BRIM', 'Let me finish the fall.', 2.0, 0.15);
  g.hud.say('SAMUS', "I've fallen further.", 1.8, 0.2);
  g.after(7.0, () => {
    g.hud.showCard('FIRST OF THE FIVE', 'Hollow Brim', 2.8);
    music.play('boss');
    g.cam.zoomTarget = 1;
  });
  g.after(7.5, () => { g.controlLocked = false; b.toIdle(0.6); });
};

g.onBossPhase2 = (b) => {
  g.flashWhite = 0.25;
  g.shake(0.5);
  g.sfx('bossVoice');
  g.hud.clearSubs();
  if (b.kind === 'thorn') g.hud.say('SAMUS', 'It cut itself loose. Keep moving.', 2.2);
  else g.hud.say('HOLLOW BRIM', 'Hungry little thing.', 1.8);
};

g.onBossDefeated = (b) => {
  g.slow(0.25, 1.1);
  g.flashWhite = 0.4;
  g.shake(0.8);
  g.sfx('explode');
  music.play(null);
  g.eshots.length = 0;
  g.hud.clearSubs();
  if (b.kind === 'thorn') g.hud.say('SAMUS', "It's still pulsing. There's something in there I need.", 2.6, 0.3);
  else g.hud.say('HOLLOW BRIM', 'Then take it. Take all of it.', 2.4, 0.3);
  g.after(1.5, () => g.hud.prompt('finish', 'devour', 'Finish it', 30));
};

function consumeBoss(b, p) {
  b.setState('consumed');
  b.stun = 0;
  g.hud.clearSubs();
  g.flashMag = 0.6;
  g.flashWhite = 0.3;
  g.slow(0.3, 1.4);
  g.shake(1);
  g.sfx('explode');
  g.sfx('ravenous');
  const cols = b.kind === 'thorn' ? ['rgba(255,80,190,A)', 'rgba(200,255,140,A)', 'rgba(230,200,90,A)', 'rgba(40,60,20,A)'] : ['rgba(255,80,190,A)', 'rgba(255,190,240,A)', 'rgba(255,140,60,A)', 'rgba(30,30,40,A)'];
  g.fx.shards(b.cx, b.cy, cols, 60, 520, () => p.chestPos());
  p.heal(p.maxEnergy);
  g.bossFight = false;
  if (b.kind === 'thorn') {
    g.flags.thornDone = true;
    g.after(2.0, () => {
      p.waterStride = true;
      collectItem({ id: 'stride', kind: 'stride', x: p.cx, y: p.cy });
      for (const d of g.world.doors) if (d.room === 'F' || d.room === 'G') d.locked = false;
      g.sfx('door');
    });
    g.after(6.4, () => g.hud.prompt('stride', 'move', 'Run across the water', 8));
  } else {
    g.hatProp = { x: b.cx, y: b.y, vx: -b.facing * 160 + rand(-40, 40), vy: -520, rot: 0, vr: rand(-6, 6), settled: false };
    g.flags.brimDone = true;
    g.after(2.4, () => g.hud.say('SAMUS', 'One down.', 2.2));
    g.after(3.2, () => {
      for (const d of g.world.doors) d.locked = false;
      g.sfx('door');
      g.hud.prompt('exit', 'fire', 'Open the far hatch. The way up.', 8);
    });
  }
  save();
}

g.playerDied = () => {
  g.state = 'dead';
  g.deathT = 0;
  g.player.setState('dead');
  setCharge(0);
  music.play(null);
  g.sfx('death');
};

// ---------------------------------------------------------------- combat

g.resolveMelee = (p) => {
  const box = p.meleeBox();
  const list = g.enemies.filter((e) => e.alive && e.room === g.room?.id);
  if (g.boss && g.boss.visible && g.boss.alive) list.push(g.boss);
  for (const e of list) {
    if (e.beingDevoured || p.meleeHits.has(e)) continue;
    const hb = e.isBoss ? e.bladeBox?.() && e.counterable ? e.bladeBox() : e.hitbox() : e;
    if (!overlap(box, hb)) continue;
    p.meleeHits.add(e);
    if (e.counterable) parry(p, e);
    else if (e.stun <= 0 || e.isBoss) {
      const ok = e.hurt(g, e.isBoss ? 2 : 1, { x: e.cx, y: e.cy });
      if (ok) {
        g.sfx('meleeHit');
        g.fx.sparks(e.cx - p.facing * e.w * 0.3, e.cy, 'rgba(170,220,255,', 6, 320, { dir: p.facing > 0 ? 0 : Math.PI, spread: 0.9 });
        if (!e.isBoss && e.alive) e.vx = p.facing * 180;
      }
    }
  }
  for (const s of g.eshots) {
    if (p.meleeHits.has(s) || s.dead) continue;
    const sb = { x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h };
    if (!overlap(box, sb)) continue;
    p.meleeHits.add(s);
    if (s.kind === 'disc' && !s.reflected) {
      s.reflected = true;
      const b = g.brim;
      const ang = Math.atan2(b.cy - 20 - s.y, b.cx - s.x);
      s.vx = Math.cos(ang) * 1400;
      s.vy = Math.sin(ang) * 1400;
      parryFx(p, s.x, s.y);
      g.hud.prompt('deflect', 'counter', 'Deflected. Its head is exposed now', 4);
    } else if (s.kind !== 'disc') {
      s.dead = true;
      g.fx.sparks(s.x, s.y, 'rgba(255,200,120,', 8, 300);
      g.sfx('meleeHit');
    }
  }
};

function parry(p, e) {
  p.meleeParried = true;
  p.inv = Math.max(p.inv, 0.45);
  e.parried(g, p);
  parryFx(p, (p.cx + e.cx) / 2, Math.min(p.cy, e.cy + 10));
  if (!g.flags.parried) {
    g.flags.parried = true;
    g.hud.dismissPrompt('counter');
    g.after(0.25, () => g.hud.prompt('devour', 'devour', 'Devour it while it reels', 7));
  }
}

function parryFx(p, x, y) {
  g.sfx('counter');
  g.hitstop(0.11);
  g.slow(0.3, 0.32);
  g.shake(0.45);
  g.flashWhite = 0.22;
  g.cam.punch = 1;
  g.fx.crescent(p.cx + p.facing * 6, p.cy - 4, p.facing, '90,170,255', 0.34, 84, true);
  g.fx.sparks(x, y, 'rgba(235,245,255,', 16, 620, { grav: 200 });
  g.fx.sparks(x, y, 'rgba(110,180,255,', 12, 420, { grav: 200 });
  g.fx.ring(x, y, 6, 90, 'rgba(200,230,255,A)', 0.35, 3);
  g.fx.add({ kind: 'flash', x, y, life: 0.16, size: 70, color: 'rgba(210,235,255,', add: true });
}

const SHARD_COLS = {
  crawler: ['rgba(150,90,60,A)', 'rgba(90,50,30,A)', 'rgba(255,150,70,A)'],
  wingblade: ['rgba(120,150,160,A)', 'rgba(200,230,255,A)', 'rgba(255,210,90,A)'],
  brute: ['rgba(140,60,40,A)', 'rgba(40,110,50,A)', 'rgba(230,210,170,A)'],
  jelly: ['rgba(200,170,255,A)', 'rgba(255,170,240,A)', 'rgba(140,110,230,A)'],
  spitter: ['rgba(60,25,20,A)', 'rgba(255,120,40,A)', 'rgba(255,220,140,A)'],
  drone: ['rgba(60,50,100,A)', 'rgba(170,150,255,A)', 'rgba(120,200,255,A)'],
};

function killEnemy(e, src) {
  e.alive = false;
  const devoured = src && src.devoured;
  const cols = SHARD_COLS[e.kind] || SHARD_COLS.crawler;
  if (devoured) {
    g.fx.shards(e.cx, e.cy, ['rgba(255,80,190,A)', 'rgba(255,180,235,A)', ...cols], 22, 300, () => g.player.chestPos());
  } else {
    g.fx.shards(e.cx, e.cy, cols, 16, 360);
    g.fx.smoke(e.cx, e.cy, 6, 'rgba(50,40,40,', 12);
    g.fx.sparks(e.cx, e.cy, 'rgba(255,200,120,', 10, 380);
    g.sfx('enemyDie');
    const p = g.player;
    const r = Math.random();
    if (r < 0.55) g.pickups.push({ kind: 'orb', x: e.cx, y: e.cy, vx: rand(-80, 80), vy: -220, t: 0, alive: true });
    else if (r < 0.85 && p.missiles < p.maxMissiles) g.pickups.push({ kind: 'missile', x: e.cx, y: e.cy, vx: rand(-80, 80), vy: -220, t: 0, alive: true });
  }
}
g.killEnemy = (e, src) => killEnemy(e, src);

function breakBlock(tx, ty) {
  if (g.world.tile(tx, ty) !== T.BOMB) return false;
  g.world.setTile(tx, ty, T.AIR);
  g.broken.push(ty * g.world.tw + tx);
  const x = tx * TILE + 20, y = ty * TILE + 20;
  const theme = g.world.roomAt(x, y)?.theme || 'sand';
  const col = theme === 'ice' ? ['rgba(200,235,255,A)', 'rgba(120,170,220,A)'] : ['rgba(170,120,80,A)', 'rgba(90,60,40,A)'];
  g.fx.shards(x, y, col, 12, 320);
  g.fx.smoke(x, y, 5, theme === 'ice' ? 'rgba(200,230,255,' : 'rgba(80,70,60,', 14);
  g.sfx('crumble');
  return true;
}

function explodeBomb(b) {
  g.sfx('bomb');
  g.shake(0.18);
  g.fx.add({ kind: 'flash', x: b.x, y: b.y, life: 0.16, size: 64, color: 'rgba(255,220,150,', add: true });
  g.fx.ring(b.x, b.y, 4, 54, 'rgba(255,200,120,A)', 0.25, 3);
  g.fx.sparks(b.x, b.y, 'rgba(255,210,140,', 10, 320);
  g.fx.light(b.x, b.y, 150, '255,170,90', 1);
  let broke = false;
  const tx0 = Math.floor(b.x / TILE), ty0 = Math.floor(b.y / TILE);
  for (let ty = ty0 - 1; ty <= ty0 + 1; ty++) {
    for (let tx = tx0 - 1; tx <= tx0 + 1; tx++) {
      if (Math.hypot(tx * TILE + 20 - b.x, ty * TILE + 20 - b.y) < 62) broke = breakBlock(tx, ty) || broke;
    }
  }
  if (broke) g.hud.dismissPrompt('bombwall');
  for (const e of g.enemies) {
    if (!e.alive || e.beingDevoured || e.room !== g.room?.id) continue;
    if (Math.hypot(e.cx - b.x, e.cy - b.y) < 56 + e.w / 2) e.hurt(g, 2, b);
  }
  if (g.boss && g.boss.visible && Math.hypot(g.boss.cx - b.x, g.boss.cy - b.y) < 60 + g.boss.w / 2) g.boss.hurt(g, 2, b);
  g.player.bombBounce(g, b.x, b.y);
}

// ---------------------------------------------------------------- items & hazards

function collectItem(it) {
  it.taken = true;
  const p = g.player;
  const info = ITEM_INFO[it.kind];
  if (it.kind === 'phase') p.hasPhase = true;
  if (it.kind === 'morph') p.hasMorph = true;
  if (it.kind === 'tank') { p.maxEnergy += 100; p.energy = p.maxEnergy; }
  if (it.kind === 'missile') { p.maxMissiles += 5; p.missiles = p.maxMissiles; }
  g.flags.items = (g.flags.items || 0) + 1;
  g.flags.taken = g.flags.taken || [];
  g.flags.taken.push(it.id);
  const big = it.kind !== 'missile';
  if (p.state !== 'ball') p.setState('frozen');
  p.cancelCharge();
  g.controlLocked = true;
  g.sfx(big ? 'item' : 'itemSmall');
  g.flashWhite = 0.25;
  g.fx.ring(it.x, it.y, 10, 260, it.kind === 'stride' ? 'rgba(160,255,200,A)' : 'rgba(140,220,255,A)', 0.9, 3);
  for (let i = 0; i < 40; i++) g.fx.add({ kind: 'dot', x: it.x, y: it.y, vx: rand(-400, 400), vy: rand(-400, 400), life: rand(0.4, 1), size: rand(1.5, 3), color: 'rgba(150,225,255,', add: true, drag: 3 });
  const dur = big ? 3.8 : 2.4;
  g.hud.showBanner(info.kicker, info.title, info.line, info.key, dur);
  music.duck(dur);
  g.after(dur + 0.1, () => {
    if (p.state === 'frozen') p.setState('normal');
    g.controlLocked = false;
    if (it.kind === 'phase') g.hud.prompt('phase', 'dash', 'Phase shift', 8);
    if (it.kind === 'morph') {
      g.hud.prompt('morph', 'down', 'Tap twice: Morph Ball', 9);
      g.after(1, () => g.hud.prompt('bomb', 'fire', 'In the ball: drop a bomb', 9));
    }
    save();
  });
}

function hazardHit(kind) {
  const p = g.player;
  if (p.hazardT > 0 || p.state === 'dead') return;
  p.hazardT = 1;
  const dmg = Math.round((kind === 'lava' ? 20 : 12) * g.diff.dmg);
  if (!g.god) p.energy -= dmg;
  g.sfx(kind === 'lava' ? 'sizzle' : 'hurt');
  g.shake(0.4);
  g.hurtFlash = 0.35;
  const col = kind === 'lava' ? 'rgba(255,150,60,' : 'rgba(170,255,210,';
  for (let i = 0; i < 16; i++) g.fx.add({ kind: 'dot', x: p.cx + rand(-12, 12), y: p.y + p.h, vx: rand(-160, 160), vy: -rand(200, 500), grav: 1200, life: rand(0.3, 0.7), size: rand(1.5, 3.5), color: col, add: true });
  if (p.energy <= 0) { p.energy = 0; g.playerDied(); return; }
  p.visible = false;
  p.setState('hold');
  p.vx = 0;
  p.vy = 0;
  g.after(0.45, () => {
    const s = p.safe || g.checkpoint;
    p.setForm(!!s.ball);
    p.x = s.x;
    p.y = s.y;
    p.vx = 0;
    p.vy = 0;
    p.visible = true;
    p.inv = 1.1;
    p.hazardT = 0.2;
    p.setState(s.ball ? 'ball' : 'normal');
    g.fx.ring(p.cx, p.cy, 6, 50, 'rgba(160,220,255,A)', 0.3, 2);
  });
}

// ---------------------------------------------------------------- setup

// A timer yield, not rAF: hidden tabs barely fire animation frames and loading would stall.
function nextFrame() {
  return new Promise((r) => setTimeout(r, 0));
}

async function load() {
  render();
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('200 40px "Inter Tight"'), document.fonts.load('300 20px "Inter Tight"'),
        document.fonts.load('400 20px "Inter Tight"'), document.fonts.load('400 14px "Inter"'), document.fonts.load('500 14px "Inter"'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (e) { /* system fonts are fine */ }
  g.world = new World();
  const nz = makeNoise2D(7);
  for (const room of g.world.rooms) {
    g.loadMsg = `painting ${room.name.toLowerCase()}`;
    render();
    await nextFrame();
    g.art[room.id] = paintRoom(g.world, room, nz);
  }
  g.vignette = makeVignette();
  g.touch = new Touch(canvas, g.input);
  g.touch.onTap = onTap;
  newGame();
  const start = params.get('room');
  if (start) startAt(start.toUpperCase());
  else toTitle();
}

function buildStatics() {
  const w = g.world;
  g.membranes = [];
  g.pools = [];
  const seen = new Set();
  for (let x = 0; x < w.tw; x++) {
    for (let y = 0; y < w.th; y++) {
      if (w.tile(x, y) !== T.PHASE || seen.has(y * w.tw + x)) continue;
      let y2 = y;
      while (w.tile(x, y2 + 1) === T.PHASE) y2++;
      for (let k = y; k <= y2; k++) seen.add(k * w.tw + x);
      g.membranes.push({ x: x * TILE, y: y * TILE, w: TILE, h: (y2 - y + 1) * TILE });
    }
  }
  const used = new Set();
  for (let y = 0; y < w.th; y++) {
    for (let x = 0; x < w.tw; x++) {
      const t = w.tile(x, y);
      if ((t !== T.WATER && t !== T.LAVA) || used.has(y * w.tw + x)) continue;
      let x2 = x;
      while (w.tile(x2 + 1, y) === t) x2++;
      let y2 = y;
      while (w.tile(x, y2 + 1) === t) y2++;
      for (let yy = y; yy <= y2; yy++) for (let xx = x; xx <= x2; xx++) used.add(yy * w.tw + xx);
      g.pools.push({ x: x * TILE, y: y * TILE, w: (x2 - x + 1) * TILE, h: (y2 - y + 1) * TILE, type: t === T.LAVA ? 'lava' : 'water' });
    }
  }
}

// a brand-new run: fresh world, enemies, items and bosses
function newGame() {
  g.world = new World();
  g.broken = [];
  buildStatics();
  const w = g.world;
  for (const d of w.doors) { d.open = false; d.amt = 0; d.locked = false; d.awayT = 0; }
  w.doors.find((d) => d.room === 'I').locked = true;
  g.enemies = [];
  g.pickups = [];
  g.items = [];
  g.vents = [];
  g.shots = [];
  g.eshots = [];
  g.bombs = [];
  g.ghosts = [];
  g.timers = [];
  g.fx.clear();
  g.hatProp = null;
  g.flags = {};
  g.playTime = 0;
  let intro = null;
  for (const s of w.spawns) {
    const x = s.tx * TILE + TILE / 2, yb = (s.ty + 1) * TILE, yc = s.ty * TILE + TILE / 2;
    const theme = w.room(s.room).theme;
    if (s.ch === 'P') intro = { x, y: yc };
    else if (s.ch === 'I') g.items.push({ id: 'phase', kind: 'phase', x: x + TILE / 2, y: yc - 6, taken: false, room: s.room });
    else if (s.ch === 'M') g.items.push({ id: 'morph', kind: 'morph', x, y: yc, taken: false, room: s.room });
    else if (s.ch === 'T') g.items.push({ id: 'tank', kind: 'tank', x, y: yc, taken: false, room: s.room });
    else if (s.ch === 'X') g.items.push({ id: `missile${s.tx}`, kind: 'missile', x, y: yc, taken: false, room: s.room });
    else if (s.ch === 'K') g.brimSpawn = { x, y: s.ty * TILE };
    else if (s.ch === 'H') g.thornSpawn = { x, y: yc };
    else if (s.ch === 'v') g.vents.push({ x: s.tx * TILE, y: s.ty * TILE, t: g.vents.length * 0.85, heat: 0 });
    else if (s.ch === 'e') g.pickups.push({ kind: 'pod', x, y: yc, t: rand(10), alive: true, fixed: true });
    else {
      const flyer = s.ch === 'w' || s.ch === 'j' || s.ch === 'd';
      const e = makeEnemy(s.ch, x, flyer ? yc : yb, theme);
      if (e) { e.room = s.room; g.enemies.push(e); }
    }
  }
  makeBosses();
  applyDifficulty(g.diff, true);
  g.player = new Player(intro.x - 15, intro.y);
  g.introSpawn = { x: intro.x - 15, y: intro.y };
  const d = g.diff;
  g.player.maxEnergy = 99 + 100 * d.tanks;
  g.player.energy = g.player.maxEnergy;
  for (const r of w.rooms) r.seen = false;
  g.room = w.room('A');
}

function makeBosses(which) {
  const w = g.world;
  if (!which || which === 'thorn') {
    const G = w.room('G');
    g.thorn = new Thornheart(g.thornSpawn.x, g.thornSpawn.y, { x0: G.x + TILE, x1: G.x + 28 * TILE, floorY: G.y + 19 * TILE, ceilY: G.y + 2 * TILE });
  }
  if (!which || which === 'brim') {
    const I = w.room('I');
    g.brim = new HollowBrim(g.brimSpawn.x, g.brimSpawn.y, { x0: I.x + TILE, x1: I.x + 35 * TILE, floorY: I.y + 15 * TILE });
  }
  applyDifficulty(g.diff, false);
}

function applyDifficulty(d, enemies) {
  if (enemies) {
    for (const e of g.enemies) {
      e.hp = Math.max(1, Math.round(e.hp * d.hp));
      e.maxHp = e.hp;
      e.pace = d.pace;
    }
  }
  for (const b of [g.thorn, g.brim]) {
    if (!b || b.scaled) continue;
    b.scaled = true;
    b.maxHp = Math.round(b.maxHp * d.hp);
    b.hp = b.maxHp;
    b.pace = d.pace;
  }
}

function toTitle() {
  g.state = 'title';
  g.stateT = 0;
  g.paused = false;
  g.showHud = false;
  g.player.visible = false;
  const A = g.world.room('A');
  g.room = A;
  g.cam.x = A.x;
  g.cam.y = A.y;
  g.menuOptions = titleOptions();
  g.menuSel = g.menuOptions.findIndex((o) => o.key === (loadSave() ? 'continue' : 'normal'));
  if (g.menuSel < 0) g.menuSel = 0;
}

function titleOptions() {
  const opts = [];
  const s = loadSave();
  if (s) opts.push({ key: 'continue', name: 'Continue', hint: `Pick up in ${g.world.room(s.room)?.name || 'the dark'} · ${fmtTime(s.playTime)}` });
  for (const k of ['easy', 'normal', 'hard']) opts.push({ key: k, name: DIFFS[k].name, hint: DIFFS[k].hint });
  return opts;
}

function roomEntry(id) {
  const r = g.world.room(id);
  const w = g.world;
  // the first standable spot inside the left edge
  for (let ty = r.ty + 1; ty < r.ty + r.h - 1; ty++) {
    const tx = r.tx + 1;
    if (!w.solidFor(tx, ty, null) && !w.solidFor(tx, ty - 1, null) && w.solidFor(tx, ty + 1, null)) return { x: r.x + 60, y: (ty + 1) * TILE - 76 };
  }
  return { x: r.x + 60, y: r.y + r.ph / 2 };
}

// debug: jump straight into a room with what you'd have by then
function startAt(id) {
  const p = g.player;
  const order = ['A', 'B', 'C', 'E', 'F', 'G', 'H', 'I'];
  const idx = order.indexOf(id);
  if (idx < 0) return toTitle();
  if (idx >= 3) { p.hasPhase = true; takeItem('phase'); }
  if (idx >= 4) { p.hasMorph = true; takeItem('morph'); }
  if (idx >= 6) { g.thorn.alive = false; g.thorn.state = 'consumed'; g.flags.thornDone = true; p.waterStride = true; }
  if (params.has('phase')) { p.hasPhase = true; takeItem('phase'); }
  if (params.has('morph')) { p.hasMorph = true; takeItem('morph'); }
  if (params.has('stride')) p.waterStride = true;
  for (let i = 0; i <= idx; i++) g.world.room(order[i]).seen = true;
  if (id === 'A') { p.x = g.introSpawn.x; p.y = 33 * TILE - 76; }
  else if (id === 'F') { p.setForm(true); p.x = g.world.room('F').x + 20; p.y = 41 * TILE + 6; }
  else { const e = roomEntry(id); p.x = e.x; p.y = e.y; }
  p.visible = true;
  p.setState(id === 'F' ? 'ball' : 'normal');
  g.state = 'play';
  g.fade = 0;
  g.showHud = true;
  g.flags.counterTaught = idx > 1;
  audioInit();
  const r = g.world.roomAt(p.cx, p.cy);
  enterRoom(r, true);
  g.cam.x = clamp(p.cx - VIEW_W / 2, r.x, Math.max(r.x, r.x + r.pw - VIEW_W));
  g.cam.y = clamp(p.cy - VIEW_H * 0.56, r.y, Math.max(r.y, r.y + r.ph - VIEW_H));
}

function takeItem(id) {
  const it = g.items.find((i) => i.id === id);
  if (it && !it.taken) { it.taken = true; g.flags.taken = [...(g.flags.taken || []), id]; g.flags.items = (g.flags.items || 0) + 1; }
}

// ---------------------------------------------------------------- saving

function save() {
  if (g.state !== 'play' && g.state !== 'dead') return;
  const p = g.player;
  const cp = g.checkpoint;
  if (!cp) return;
  const data = {
    v: 2, diff: g.diff.key, room: cp.room, x: cp.x, y: cp.y, ball: !!cp.ball,
    hasPhase: p.hasPhase, hasMorph: p.hasMorph, stride: p.waterStride,
    maxEnergy: p.maxEnergy, maxMissiles: p.maxMissiles, taken: g.flags.taken || [], items: g.flags.items || 0,
    thornDone: !!g.flags.thornDone, brimDone: !!g.flags.brimDone, broken: g.broken, playTime: g.playTime,
    seen: g.world.rooms.filter((r) => r.seen).map((r) => r.id), flags: { parried: g.flags.parried, counterTaught: g.flags.counterTaught, doorTaught: g.flags.doorTaught, brimSeen: g.flags.brimSeen, thornSeen: g.flags.thornSeen },
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) {}
}

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return s && s.v === 2 ? s : null;
  } catch (e) {
    return null;
  }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

function continueGame(s) {
  g.diff = DIFFS[s.diff] || DIFFS.normal;
  newGame();
  const p = g.player;
  for (const id of s.taken) takeItem(id);
  g.flags.items = s.items;
  g.flags.taken = s.taken;
  Object.assign(g.flags, s.flags || {});
  p.hasPhase = s.hasPhase;
  p.hasMorph = s.hasMorph;
  p.waterStride = s.stride;
  p.maxEnergy = s.maxEnergy;
  p.energy = p.maxEnergy;
  p.maxMissiles = s.maxMissiles;
  p.missiles = p.maxMissiles;
  g.playTime = s.playTime || 0;
  for (const i of s.broken || []) {
    g.world.grid[i] = T.AIR;
    g.broken.push(i);
  }
  if (s.thornDone) {
    g.thorn.alive = false;
    g.thorn.state = 'consumed';
    g.flags.thornDone = true;
  }
  if (s.brimDone) {
    g.brim.alive = false;
    g.brim.state = 'consumed';
    g.flags.brimDone = true;
    for (const d of g.world.doors) d.locked = false;
  }
  for (const id of s.seen || []) { const r = g.world.room(id); if (r) r.seen = true; }
  p.setForm(!!s.ball);
  p.x = s.x;
  p.y = s.y;
  p.visible = true;
  p.setState(s.ball ? 'ball' : 'normal');
  g.state = 'play';
  g.fade = 1;
  g.fadeTarget = 0;
  g.showHud = true;
  g.controlLocked = false;
  audioInit();
  const r = g.world.roomAt(p.cx, p.cy) || g.world.room(s.room);
  enterRoom(r, true);
  g.cam.x = clamp(p.cx - VIEW_W / 2, r.x, Math.max(r.x, r.x + r.pw - VIEW_W));
  g.cam.y = clamp(p.cy - VIEW_H * 0.56, r.y, Math.max(r.y, r.y + r.ph - VIEW_H));
  g.hud.showRoom(r.name);
}

// ---------------------------------------------------------------- flow

function startFromTitle() {
  const opt = g.menuOptions[g.menuSel];
  audioInit();
  if (opt.key === 'continue') {
    const s = loadSave();
    if (s) return continueGame(s);
  }
  g.diff = DIFFS[opt.key] || DIFFS.normal;
  clearSave();
  newGame();
  g.state = 'cine';
  g.stateT = 0;
  g.cine = new Cinematic(g);
  music.play('title');
}

g.endCinematic = () => {
  g.cine = null;
  beginIntro();
};

function beginIntro() {
  g.sfx('start');
  music.play('intro');
  g.state = 'play';
  g.stateT = 0;
  g.fade = 1;
  g.fadeTarget = 1;
  g.controlLocked = true;
  g.showHud = false;
  const p = g.player;
  p.x = g.introSpawn.x;
  p.y = g.introSpawn.y;
  p.vy = 0;
  p.visible = false;
  p.setState('hold');
  g.intro = { t: 0 };
  g.hud.say('SAMUS', "Dragged under. Ship's gone. Suit's cracked.", 3.1, 0.8);
  g.hud.say('SAMUS', 'Five of them up there, waiting for me to climb back out.', 3.2, 0.3);
  g.after(7.9, dropIn);
}

function dropIn() {
  if (!g.intro || g.intro.dropped) return;
  g.intro.dropped = true;
  const p = g.player;
  p.visible = true;
  p.setState('intro');
  p.vy = 120;
  g.fadeTarget = 0;
  enterRoom(g.world.room('A'), true);
}

function skipIntro() {
  if (!g.intro) return;
  g.hud.clearSubs();
  g.timers = [];
  const p = g.player;
  g.intro = null;
  p.x = g.introSpawn.x;
  p.y = 33 * TILE - 76;
  p.vy = 0;
  p.visible = true;
  p.setState('normal');
  g.fade = 0;
  g.fadeTarget = 0;
  g.controlLocked = false;
  g.showHud = true;
  enterRoom(g.world.room('A'), true);
  teachBasics();
  save();
}

function enterRoom(r, silent = false) {
  if (!r) return;
  const first = !r.seen;
  g.room = r;
  r.seen = true;
  setAmbient(r.theme);
  if (!g.bossFight) music.play(r.theme);
  if (first && !silent) g.hud.showRoom(r.name);
  const p = g.player;
  g.boss = r.id === 'G' ? g.thorn : r.id === 'I' ? g.brim : null;
  if (g.boss && !g.boss.alive) g.boss = null;
  const x = r.id === 'A' ? g.introSpawn.x : p.x;
  const y = r.id === 'A' ? 33 * TILE - 76 : p.y;
  g.checkpoint = { x, y, room: r.id, ball: p.state === 'ball' };
  if (r.id === 'B' && first) g.after(1.5, () => g.hud.prompt('missile', 'missile', 'Missile · heavy damage', 6));
  if (r.id === 'E' && first && !silent) g.after(1.2, () => g.hud.say('SAMUS', 'Ice. Something carved words into it.', 2.6));
  if (!silent) save();
}

function startThornFight() {
  const b = g.thorn;
  g.bossFight = true;
  g.flags.thornSeen = true;
  for (const d of g.world.doors) if (d.room === 'F' || d.room === 'G') { d.open = false; d.locked = true; }
  g.sfx('doorClose');
  g.player.cancelCharge();
  b.wake(g);
  g.sfx('bossVoice');
  g.shake(0.6);
  g.hud.clearSubs();
  g.hud.say('SAMUS', "Something's breathing up there.", 2.2, 0.1);
  g.after(2.6, () => {
    g.hud.showCard('WARDEN OF THE WOOD', 'Thornheart', 2.8);
    music.play('boss2');
  });
  g.after(3.2, () => b.toIdle(0.4));
}

function startBrimFight() {
  const b = g.brim;
  g.bossFight = true;
  for (const d of g.world.doors) if (d.room === 'H') { d.open = false; d.locked = true; }
  g.sfx('doorClose');
  g.controlLocked = true;
  g.player.cancelCharge();
  g.cam.zoomTarget = g.flags.brimSeen ? 1 : 1.04;
  b.wake(g);
  music.play(null);
}

function respawn() {
  const p = g.player;
  const cp = g.checkpoint || { x: g.introSpawn.x, y: 33 * TILE - 76, room: 'A' };
  p.setForm(!!cp.ball);
  p.x = cp.x;
  p.y = cp.y;
  p.vx = 0;
  p.vy = 0;
  p.energy = p.maxEnergy;
  p.missiles = p.maxMissiles;
  p.hunger = 0;
  p.ravenousT = 0;
  p.inv = 1.2;
  p.hazardT = 0;
  p.visible = true;
  p.setState(cp.ball ? 'ball' : 'normal');
  g.shots = [];
  g.eshots = [];
  g.bombs = [];
  g.ghosts = [];
  g.fx.clear();
  g.hud.clearSubs();
  g.timers = [];
  g.controlLocked = false;
  g.cam.zoomTarget = 1;
  g.cam.focus = null;
  g.slowT = 0;
  g.hitstopT = 0;
  if (g.bossFight) {
    if (g.boss === g.thorn) {
      makeBosses('thorn');
      for (const d of g.world.doors) if (d.room === 'F' || d.room === 'G') d.locked = false;
    } else {
      makeBosses('brim');
      for (const d of g.world.doors) if (d.room === 'H') d.locked = false;
    }
    g.bossFight = false;
  }
  g.state = 'play';
  g.fade = 1;
  g.fadeTarget = 0;
  const r = g.world.roomAt(p.cx, p.cy);
  if (r) enterRoom(r, true);
}

function finishGame() {
  g.state = 'end';
  g.endT = 0;
  setAmbient('title');
  setCharge(0);
  music.play('ending');
  const items = g.flags.items || 0;
  const pct = Math.round((items / ITEM_TOTAL) * 100);
  const mins = g.playTime / 60;
  let rank = 'C';
  if (pct >= 50) rank = 'B';
  if (pct >= 80) rank = 'A';
  if (pct === 100 && mins < (g.diff.key === 'easy' ? 30 : 25)) rank = 'S';
  g.stats = [['TIME', fmtTime(g.playTime)], ['ITEMS', `${pct}%`], ['MODE', g.diff.name], ['RANK', rank]];
  clearSave();
}

function fmtTime(s) {
  s = Math.floor(s || 0);
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// taps: menus first, then the on-screen controls
function onTap(p, isTouch) {
  if (g.state === 'title') {
    const pills = titleLayout(g.menuOptions);
    const hit = pills.findIndex((pl) => p.x >= pl.x - 4 && p.x <= pl.x + pl.w + 4 && p.y >= pl.y - 8 && p.y <= pl.y + pl.h + 8);
    if (hit >= 0 && hit !== g.menuSel) { g.menuSel = hit; g.sfx('ui'); return true; }
    startFromTitle();
    return true;
  }
  if (g.state === 'cine') { g.cine?.skip(); return true; }
  if (g.state === 'end') { if (g.endT > 5) location.href = location.pathname; return true; }
  if (g.state === 'dead') return true;
  if (g.paused) { g.paused = false; return true; }
  if (g.intro) { if (isTouch && p.x > VIEW_W - 200 && p.y < 120) skipIntro(); return true; }
  return false;
}

// ---------------------------------------------------------------- update

function tick(dt) {
  g.input.beginStep();
  const I = g.input;
  g.realTime += dt;
  g.stateT += dt;
  if (I.pressed('mute')) toggleMute();
  if (g.state === 'loading') return;
  if (g.state === 'title') {
    ambientParticles(dt);
    g.fx.update(dt);
    const n = g.menuOptions.length;
    if (I.pressed('left') || I.pressed('up')) { g.menuSel = (g.menuSel + n - 1) % n; g.sfx('ui'); }
    if (I.pressed('right') || I.pressed('down')) { g.menuSel = (g.menuSel + 1) % n; g.sfx('ui'); }
    if (I.pressed('confirm') || I.pressed('jump')) startFromTitle();
    return;
  }
  if (g.state === 'cine') {
    g.cine.update(dt);
    if (I.pressed('confirm') || I.pressed('pause') || I.pressed('jump')) g.cine.skip();
    return;
  }
  if (g.state === 'end') {
    g.endT += dt;
    if (g.endT > 5 && (I.pressed('confirm') || I.pressed('jump'))) location.href = location.pathname;
    return;
  }
  if (g.state === 'dead') {
    g.deathT += dt;
    g.fx.update(dt * 0.3);
    if (g.deathT > 2.6) respawn();
    return;
  }
  // play
  if ((I.pressed('pause') || I.pressed('map')) && !g.intro) {
    g.paused = !g.paused;
    g.sfx('ui');
    setCharge(0);
    if (g.touch) g.touch.releaseAll();
  }
  if (g.paused) return;
  if (g.intro && (I.pressed('confirm') || I.pressed('pause'))) skipIntro();
  for (let i = g.timers.length - 1; i >= 0; i--) {
    const tm = g.timers[i];
    tm.t -= dt;
    if (tm.t <= 0) { g.timers.splice(i, 1); tm.fn(); }
  }
  g.fade = approach(g.fade, g.fadeTarget, dt * 0.9);
  g.hud.update(dt, g);
  if (!g.intro) g.playTime += dt;
  if (g.hitstopT > 0) { g.hitstopT -= dt; return; }
  if (g.slowT > 0) g.slowT -= dt;
  const sdt = dt * (g.slowT > 0 ? g.slowScale : 1);
  g.time += sdt;
  const p = g.player;
  if (p.hazardT > 0) p.hazardT -= sdt;

  p.update(g, sdt);
  for (const e of g.enemies) {
    if (!e.alive || (e.room !== g.room?.id && !e.beingDevoured) || g.calm) continue;
    if (e.beingDevoured) {
      e.devourK = clamp(p.stateT / (p.devour?.dur || 1), 0, 1);
      e.anim += sdt;
      continue;
    }
    e.update(g, sdt);
  }
  const b = g.boss;
  if (b && b.alive) {
    if (b.beingDevoured) { b.devourK = clamp(p.stateT / (p.devour?.dur || 1), 0, 1); b.anim += sdt; }
    else b.update(g, sdt);
  }
  g.enemies = g.enemies.filter((e) => e.alive);
  updateShots(sdt);
  updateEnemyShots(sdt);
  updateBombs(sdt);
  updatePickups(sdt);
  updateItems();
  updateDoors(sdt);
  updateVents(sdt);
  updateHazards();
  updateHat(sdt);
  contactDamage();
  devourParticles(sdt);
  tutorialChecks();
  for (const gh of g.ghosts) gh.life -= sdt;
  g.ghosts = g.ghosts.filter((gh) => gh.life > 0);
  g.fx.update(sdt);
  ambientParticles(sdt);
  // rooms and triggers
  const r = g.world.roomAt(p.cx, p.cy);
  if (r && r !== g.room && p.state !== 'intro' && p.state !== 'hold') enterRoom(r);
  if (g.room?.id === 'G' && g.thorn.state === 'dormant' && p.cx > g.room.x + 6 * TILE && p.state !== 'dead') startThornFight();
  if (g.room?.id === 'I' && g.brim.state === 'dormant' && p.cx > g.room.x + 7 * TILE && p.state !== 'dead') startBrimFight();
  if (g.flags.brimDone) {
    const exit = g.world.doors.find((d) => d.room === 'I');
    if (exit.open && p.cx > exit.x - 10) finishGame();
  }
  updateCamera(dt);
  if (g.hurtFlash > 0) g.hurtFlash -= dt;
  if (g.flashWhite > 0) g.flashWhite -= dt * 2;
  if (g.flashMag > 0) g.flashMag -= dt * 1.6;
  if (g.touch) {
    g.touch.signal.devour = !!devourTarget(p, 150);
    g.touch.hidden = new Set(p.hasPhase ? [] : ['dash']);
  }
}

function tutorialChecks() {
  const p = g.player;
  const nearFlash = (e) => e.counterable && Math.hypot(e.cx - p.cx, e.cy - p.cy) < 210;
  if (!g.flags.counterTaught) {
    for (const e of g.enemies) {
      if (e.room !== g.room?.id || !nearFlash(e)) continue;
      g.flags.counterTaught = true;
      g.slow(0.16, 0.9);
      g.hud.prompt('counter', 'counter', 'Counter when it flashes', 6);
      break;
    }
  }
  // Easy mode: every close flash gets a moment of slow motion
  if (g.diff.assist) {
    const list = g.enemies.filter((e) => e.room === g.room?.id);
    if (g.boss) list.push(g.boss);
    for (const e of list) {
      if (!nearFlash(e) || e.assisted) continue;
      e.assisted = true;
      g.slow(0.4, 0.45);
    }
    for (const e of list) if (!e.counterable) e.assisted = false;
  }
  if (!g.flags.doorTaught && !g.controlLocked) {
    for (const d of g.world.doors) {
      if (d.open || d.locked) continue;
      if (Math.abs(d.x + 20 - p.cx) < 260 && Math.abs(d.y + d.h / 2 - p.cy) < 120) {
        g.flags.doorTaught = true;
        g.hud.prompt('door', 'fire', 'Shoot a hatch to open it', 5);
        break;
      }
    }
  }
  if (p.hasMorph && !g.flags.bombTaught && g.room?.id === 'E' && !g.controlLocked) {
    g.flags.bombTaught = true;
    g.after(1.4, () => g.hud.prompt('bombwall', 'fire', 'Bombs crack glowing blocks', 9));
  }
  const I = g.input;
  if (I.pressed('left') || I.pressed('right')) g.hud.dismissPrompt('move');
  if (I.pressed('jump')) g.hud.dismissPrompt('jump');
  if (I.pressed('fire')) g.hud.dismissPrompt('shoot');
  if (I.pressed('missile')) g.hud.dismissPrompt('missile');
  if (p.state === 'ball' && I.pressed('fire')) g.hud.dismissPrompt('bomb');
  if (p.waterStride && Math.abs(p.vx) > 60) g.hud.dismissPrompt('stride');
}

function updateShots(dt) {
  const w = g.world;
  for (const s of g.shots) {
    s.t += dt;
    s.life -= dt;
    if (s.kind === 'missile') {
      const sp = Math.min(s.maxV, Math.hypot(s.vx, s.vy) + s.acc * dt);
      s.vx = s.dx * sp;
      s.vy = s.dy * sp;
      if (Math.random() < 0.7) g.fx.add({ kind: 'smoke', x: s.x - s.dx * 10, y: s.y - s.dy * 10, vx: rand(-20, 20), vy: rand(-30, 0), life: rand(0.25, 0.5), size: rand(3, 6), grow: 20, color: 'rgba(160,150,150,', alpha: 0.35 });
      g.fx.light(s.x, s.y, 60, '255,170,90', 0.6);
    } else {
      g.fx.light(s.x, s.y, s.kind === 'charge' ? 110 : 55, s.rav ? '255,90,200' : '255,210,130', s.kind === 'charge' ? 0.9 : 0.55);
    }
    const steps = 2;
    for (let k = 0; k < steps && !s.dead; k++) {
      s.x += (s.vx * dt) / steps;
      s.y += (s.vy * dt) / steps;
      const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
      const tile = w.tile(tx, ty);
      if (tile === T.DOOR) {
        const d = w.doors[w.doorAt[ty * w.tw + tx]];
        if (!d.open) {
          if (d.locked) { g.sfx('locked'); g.fx.sparks(s.x, s.y, 'rgba(255,90,100,', 6, 200); }
          else openDoor(d);
          shotHitWall(s);
          continue;
        }
      } else if (tile === T.PHASE) {
        g.fx.ring(s.x, s.y, 4, 26, 'rgba(140,220,255,A)', 0.3, 2);
        shotHitWall(s);
        continue;
      } else if (tile === T.BOMB) {
        if (s.kind === 'missile' || s.kind === 'charge') breakBlock(tx, ty);
        shotHitWall(s);
        continue;
      } else if (w.solidFor(tx, ty, null)) {
        shotHitWall(s);
        continue;
      }
      for (const e of g.enemies) {
        if (!e.alive || e.beingDevoured || e.room !== g.room?.id) continue;
        if (s.x > e.x - s.r && s.x < e.x + e.w + s.r && s.y > e.y - s.r && s.y < e.y + e.h + s.r) {
          hitEnemy(s, e);
          break;
        }
      }
      if (s.dead) break;
      const b = g.boss;
      if (b && b.visible && b.alive && b.state !== 'consumed') {
        const hb = b.hitbox();
        if (s.x > hb.x - s.r && s.x < hb.x + hb.w + s.r && s.y > hb.y - s.r && s.y < hb.y + hb.h + s.r) {
          if (b.hurt(g, s.dmg, s)) hitEnemy(s, null);
        }
      }
      if (s.dead) break;
      for (const es of g.eshots) {
        if (es.kind === 'disc' || es.dead) continue;
        if (Math.abs(es.x - s.x) < 14 + es.w / 2 && Math.abs(es.y - s.y) < 14 + es.h / 2) {
          es.dead = true;
          g.fx.sparks(es.x, es.y, 'rgba(255,200,120,', 8, 300);
          s.dead = true;
          break;
        }
      }
    }
    if (s.life <= 0 && !s.dead) {
      s.dead = true;
      if (s.kind === 'missile') explode(s);
      else g.fx.add({ kind: 'flash', x: s.x, y: s.y, life: 0.08, size: 12, color: 'rgba(255,220,150,', add: true });
    }
  }
  g.shots = g.shots.filter((s) => !s.dead);
}

function shotHitWall(s) {
  s.dead = true;
  if (s.kind === 'missile') explode(s);
  else {
    g.fx.sparks(s.x - Math.sign(s.vx) * 4, s.y, s.rav ? 'rgba(255,120,220,' : 'rgba(255,220,150,', s.kind === 'charge' ? 12 : 5, s.kind === 'charge' ? 380 : 220);
    g.fx.add({ kind: 'flash', x: s.x, y: s.y, life: 0.1, size: s.kind === 'charge' ? 40 : 18, color: 'rgba(255,220,150,', add: true });
  }
}

function hitEnemy(s, e) {
  s.dead = true;
  if (e) e.hurt(g, s.dmg, s);
  if (s.kind === 'missile') explode(s, e);
  else {
    g.fx.sparks(s.x, s.y, s.rav ? 'rgba(255,120,220,' : 'rgba(255,230,170,', s.kind === 'charge' ? 14 : 6, 300);
    g.fx.add({ kind: 'flash', x: s.x, y: s.y, life: 0.1, size: s.kind === 'charge' ? 46 : 20, color: 'rgba(255,230,170,', add: true });
    if (s.kind === 'charge') g.shake(0.15);
  }
}

function explode(s, direct) {
  g.sfx('explode');
  g.shake(0.3);
  g.fx.add({ kind: 'flash', x: s.x, y: s.y, life: 0.2, size: 80, color: 'rgba(255,200,120,', add: true });
  g.fx.ring(s.x, s.y, 8, 70, 'rgba(255,190,110,A)', 0.3, 3);
  g.fx.sparks(s.x, s.y, 'rgba(255,190,110,', 16, 460);
  g.fx.smoke(s.x, s.y, 8, 'rgba(60,50,50,', 16);
  g.fx.light(s.x, s.y, 200, '255,170,90', 1);
  for (const e of g.enemies) {
    if (!e.alive || e === direct || e.beingDevoured || e.room !== g.room?.id) continue;
    if (Math.hypot(e.cx - s.x, e.cy - s.y) < 70 + e.w / 2) e.hurt(g, 3, s);
  }
}

function openDoor(d) {
  d.open = true;
  d.awayT = 0;
  g.hud.dismissPrompt('door');
  g.sfx('door');
  g.fx.sparks(d.x + 20, d.y + d.h / 2, 'rgba(120,190,255,', 14, 300);
}

function updateDoors(dt) {
  const p = g.player;
  for (const d of g.world.doors) {
    d.amt = approach(d.amt, d.open ? 1 : 0, dt * 4.5);
    if (!d.open) continue;
    const zone = { x: d.x - 70, y: d.y - 20, w: d.w + 140, h: d.h + 40 };
    if (overlap(zone, p)) d.awayT = 0;
    else {
      d.awayT += dt;
      const blocked = overlap(d, p) || g.enemies.some((e) => overlap(d, e));
      if (d.awayT > 2.4 && !blocked) {
        d.open = false;
        g.sfx('doorClose');
      }
    }
  }
}

function updateBombs(dt) {
  for (const b of g.bombs) {
    b.t -= dt;
    if (b.t <= 0) { b.dead = true; explodeBomb(b); }
  }
  g.bombs = g.bombs.filter((b) => !b.dead);
}

function updateVents(dt) {
  const p = g.player;
  for (const v of g.vents) {
    v.t += dt;
    const ph = v.t % 2.8;
    v.warn = ph > 1.6 && ph < 2.05;
    v.heat = ph >= 2.05 ? Math.sin(((ph - 2.05) / 0.75) * Math.PI) : 0;
    if (v.warn && Math.random() < dt * 30) g.fx.add({ kind: 'dot', x: v.x + rand(8, 32), y: v.y - 4, vx: rand(-20, 20), vy: -rand(60, 160), life: 0.4, size: 1.6, color: 'rgba(140,190,255,', add: true });
    if (v.heat > 0.2 && g.room?.id === 'H') {
      const col = { x: v.x + 6, y: v.y - 150 * v.heat, w: 28, h: 150 * v.heat };
      if (overlap(col, p)) p.damage(g, 14, v.x + 20);
      g.fx.light(v.x + 20, v.y - 50, 110, '120,170,255', v.heat * 0.8);
    }
    if (ph < dt * 1.5 + 2.05 && ph >= 2.05 && g.room?.id === 'H') g.sfx('vent');
  }
}

function updateHazards() {
  const p = g.player;
  if (p.state === 'dead' || p.state === 'hold' || p.state === 'intro') return;
  const w = g.world;
  const x0 = Math.floor((p.x + 4) / TILE), x1 = Math.floor((p.x + p.w - 4) / TILE);
  const y0 = Math.floor((p.y + 6) / TILE), y1 = Math.floor((p.y + p.h - 2) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = w.tile(tx, ty);
      if (t === T.LAVA) return hazardHit('lava');
      if (t === T.WATER && !p.waterStride) return hazardHit('water');
    }
  }
}

function updateEnemyShots(dt) {
  const p = g.player;
  const b = g.brim;
  for (const s of g.eshots) {
    s.t += dt;
    if (s.kind === 'disc') {
      s.spin += dt * 30;
      if (s.reflected) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const hb = b.hitbox();
        if (b.alive && s.x > hb.x - 20 && s.x < hb.x + hb.w + 20 && s.y > hb.y - 10 && s.y < hb.y + hb.h) {
          s.dead = true;
          b.stunByDisc(g);
          b.hatDrop = { x: s.x, y: b.arena.floorY - 8 };
          g.fx.sparks(s.x, s.y, 'rgba(255,90,90,', 18, 500);
          g.shake(0.5);
          g.sfx('counter');
        }
        if (g.world.solidAtPx(s.x, s.y)) {
          s.dead = true;
          b.hatDrop = { x: clamp(s.x, b.arena.x0 + 30, b.arena.x1 - 30), y: b.arena.floorY - 8 };
          if (b.state === 'hatless') b.setState('retrieve');
        }
        continue;
      }
      const back = s.t > 0.62;
      if (!back) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 1 - 0.8 * dt;
        s.vy *= 1 - 0.8 * dt;
      } else {
        const hx = b.cx, hy = b.y + 4;
        const dx = hx - s.x, dy = hy - s.y, d = Math.hypot(dx, dy) + 1;
        const sp = Math.min(1500, 500 + (s.t - 0.62) * 1800);
        s.vx = lerp(s.vx, (dx / d) * sp, 1 - Math.exp(-dt * 6));
        s.vy = lerp(s.vy, (dy / d) * sp, 1 - Math.exp(-dt * 6));
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (d < 34 || s.t > 3.5) {
          s.dead = true;
          b.hatOn = true;
          g.sfx('whiff');
        }
      }
      s.counterable = Math.hypot(p.cx - s.x, p.cy - s.y) < 150;
      if (overlap({ x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h }, p)) p.damage(g, s.dmg, s.x);
      g.fx.light(s.x, s.y, 70, '255,70,80', 0.5);
      continue;
    }
    if (s.kind === 'thorn') {
      if (s.wait > 0) { s.wait -= dt; continue; }
      s.vy = Math.min(s.vy + 3000 * dt, 1000);
    }
    if (s.grav) s.vy += s.grav * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (g.world.solidAtPx(s.x, s.y + (s.kind === 'thorn' ? 14 : 0)) || s.t > 4) {
      s.dead = true;
      const col = s.kind === 'glob' ? 'rgba(255,150,60,' : s.kind === 'bolt' ? 'rgba(255,90,130,' : 'rgba(230,210,120,';
      g.fx.sparks(s.x, s.y, col, 8, 240);
      if (s.kind === 'glob') g.fx.smoke(s.x, s.y, 3, 'rgba(60,30,20,', 10);
    }
    if (!s.dead && overlap({ x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h }, p)) {
      p.damage(g, s.dmg, s.x);
      s.dead = true;
    }
    const lc = s.kind === 'glob' ? '255,140,50' : s.kind === 'bolt' ? '255,80,120' : s.kind === 'thorn' ? '240,220,120' : '255,150,60';
    g.fx.light(s.x, s.y, 44, lc, 0.5);
  }
  g.eshots = g.eshots.filter((s) => !s.dead);
}

function contactDamage() {
  const p = g.player;
  if (p.state === 'dead' || p.state === 'hold') return;
  for (const e of g.enemies) {
    if (!e.alive || e.stun > 0 || e.beingDevoured || e.room !== g.room?.id) continue;
    const shrink = { x: e.x + 4, y: e.y + 4, w: e.w - 8, h: e.h - 6 };
    if (overlap(shrink, p)) p.damage(g, e.contact, e.cx);
  }
  const b = g.boss;
  if (b && b.alive && b.active && b.stun <= 0 && !b.beingDevoured && b.visible) {
    const blade = b.bladeBox();
    if (blade && overlap(blade, p)) p.damage(g, b.kind === 'thorn' ? 18 : b.state === 'slash' ? 25 : 20, b.cx);
    else if (overlap(b.hitbox(), p) && b.state !== 'knockback' && b.state !== 'recoil') p.damage(g, b.state === 'slash' ? 25 : b.contact, b.cx);
  }
}

function devourParticles(dt) {
  const p = g.player;
  if (p.state !== 'devour' || !p.devour) return;
  const t = p.devour.target;
  if (p.stateT > p.devour.dur) return;
  for (let k = 0; k < 3; k++) {
    const sx = t.x + rand(t.w), sy = t.y + rand(t.h);
    g.fx.add({
      kind: 'dot', x: sx, y: sy, sx, sy, wob: rand(-30, 30), arc: rand(10, 60), home: () => p.chestPos(),
      life: rand(0.3, 0.5), size: rand(1.5, 3.4), color: Math.random() < 0.3 ? 'rgba(255,240,250,' : 'rgba(255,80,195,', add: true,
    });
  }
  g.fx.light(p.cx, p.cy, 110, '255,70,190', 0.2 + 0.1 * Math.sin(p.stateT * 30));
  g.fx.light(t.cx, t.cy, 90, '255,70,190', 0.35);
}

function updatePickups(dt) {
  const p = g.player;
  for (const k of g.pickups) {
    k.t += dt;
    if (!k.fixed) {
      const dx = p.cx - k.x, dy = p.cy - k.y, d = Math.hypot(dx, dy);
      if (d < 140 && k.t > 0.3) {
        k.vx = lerp(k.vx, (dx / d) * 600, 1 - Math.exp(-dt * 8));
        k.vy = lerp(k.vy, (dy / d) * 600, 1 - Math.exp(-dt * 8));
      } else {
        k.vy += 900 * dt;
        k.vx *= 1 - 2 * dt;
      }
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (g.world.solidAtPx(k.x, k.y + 8)) { k.y = Math.floor((k.y + 8) / TILE) * TILE - 8; k.vy = 0; }
      if (k.t > 12) k.alive = false;
    }
    if (Math.abs(p.cx - k.x) < 26 && Math.abs(p.cy - k.y) < 44) {
      k.alive = false;
      if (k.kind === 'orb') p.heal(10);
      else if (k.kind === 'missile') p.missiles = Math.min(p.maxMissiles, p.missiles + 2);
      else if (k.kind === 'pod') { p.heal(50); g.fx.ring(k.x, k.y, 6, 60, 'rgba(255,120,200,A)', 0.4, 2); }
      g.sfx('pickup');
      g.fx.sparks(k.x, k.y, k.kind === 'missile' ? 'rgba(255,200,200,' : 'rgba(255,230,140,', 8, 200);
    }
  }
  g.pickups = g.pickups.filter((k) => k.alive);
}

function updateItems() {
  const p = g.player;
  if (g.controlLocked || p.state === 'hold' || p.state === 'dead') return;
  for (const it of g.items) {
    if (it.taken) continue;
    if (Math.abs(p.cx - it.x) < 34 && Math.abs(p.cy - it.y) < 60) collectItem(it);
  }
}

function updateHat(dt) {
  const h = g.hatProp;
  if (!h || h.settled) return;
  h.vy += 2200 * dt;
  h.x += h.vx * dt;
  h.y += h.vy * dt;
  h.rot += h.vr * dt;
  const floor = g.brim.arena.floorY - 4;
  if (h.y > floor) {
    h.y = floor;
    if (Math.abs(h.vy) > 200) {
      h.vy *= -0.35;
      h.vx *= 0.7;
      h.vr *= 0.5;
      g.sfx('land');
      g.fx.dust(h.x, floor + 4, 4, 0.5, 'rgba(120,110,170,');
    } else {
      h.vy = 0;
      h.vx *= 1 - 3 * dt;
      h.rot = lerp(h.rot, Math.round(h.rot / Math.PI) * Math.PI, 1 - Math.exp(-dt * 6));
      if (Math.abs(h.vx) < 5) h.settled = true;
    }
  }
}

const MOTES = {
  sand: ['rgba(255,215,160,', 9, -14],
  ruin: ['rgba(210,225,255,', 9, -14],
  arena: ['rgba(170,150,255,', 9, -14],
  ice: ['rgba(230,245,255,', 22, 40],
  magma: ['rgba(255,150,60,', 18, -90],
  hive: ['rgba(200,255,140,', 14, -10],
  lab: ['rgba(160,150,255,', 8, -20],
};

function ambientParticles(dt) {
  const room = g.room;
  if (!room) return;
  const cam = g.cam;
  if (room.id === 'A' && cam.y < room.y + 900) {
    for (let k = 0; k < 3; k++) {
      if (Math.random() > dt * 70) continue;
      g.fx.add({ kind: 'sand', x: room.x + rand(500, 780), y: room.y + rand(-10, 20), vx: rand(-12, 12), vy: rand(80, 260), grav: 380, life: rand(2.4, 3.4), size: rand(1, 2), color: 'rgba(235,205,150,', alpha: 0.6 });
    }
  }
  const m = MOTES[room.theme] || MOTES.sand;
  if (Math.random() < dt * m[1]) {
    const falls = m[2] > 0;
    g.fx.add({
      kind: 'mote', x: cam.x + rand(VIEW_W), y: falls ? cam.y - 10 : cam.y + rand(VIEW_H), vx: rand(-10, 10) + (falls ? rand(-20, 20) : 0),
      vy: falls ? rand(m[2] * 0.6, m[2]) : rand(m[2], 4), life: rand(3, 6), size: rand(1, 2.4),
      color: m[0], alpha: room.theme === 'magma' ? 0.8 : 0.55, tw: rand(2, 5), ph: rand(TAU), add: true,
    });
  }
}

function updateCamera(dt) {
  const cam = g.cam, p = g.player, r = g.room;
  if (!r) return;
  cam.look = approach(cam.look, p.facing * 110, dt * 260);
  let tx = p.cx + cam.look - VIEW_W / 2;
  let ty = p.cy - VIEW_H * 0.56;
  const b = g.boss;
  if (b && g.bossFight && b.visible) {
    tx = lerp(tx, (p.cx + b.cx) / 2 - VIEW_W / 2, 0.5);
    if (b.kind === 'thorn') ty = lerp(ty, (p.cy + b.cy) / 2 - VIEW_H / 2, 0.6);
  }
  tx = r.pw <= VIEW_W ? r.x + (r.pw - VIEW_W) / 2 : clamp(tx, r.x, r.x + r.pw - VIEW_W);
  ty = r.ph <= VIEW_H ? r.y + (r.ph - VIEW_H) / 2 : clamp(ty, r.y, r.y + r.ph - VIEW_H);
  const kx = 1 - Math.exp(-dt * 7), ky = 1 - Math.exp(-dt * (p.state === 'intro' ? 12 : 5));
  cam.x += (tx - cam.x) * kx;
  cam.y += (ty - cam.y) * ky;
  cam.zoom = lerp(cam.zoom, cam.zoomTarget, 1 - Math.exp(-dt * 6));
  cam.punch = Math.max(0, (cam.punch || 0) - dt * 5);
  cam.trauma = Math.max(0, cam.trauma - dt * 1.6);
  const sh = cam.trauma * cam.trauma;
  cam.ox = (Math.random() * 2 - 1) * 16 * sh;
  cam.oy = (Math.random() * 2 - 1) * 12 * sh;
}

// ---------------------------------------------------------------- render

function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#060608';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (g.state === 'loading') {
    ctx.font = '400 14px "Inter", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(g.loadMsg + '…', 96, VIEW_H - 64);
    return;
  }
  if (g.state === 'cine' && g.cine) {
    g.cine.draw(ctx);
    drawOverlays();
    return;
  }
  const cam = g.cam;
  const zoom = cam.zoom * (1 + (cam.punch || 0) * 0.035);
  let fx0 = VIEW_W / 2, fy0 = VIEW_H / 2;
  if (cam.focus && cam.focus.alive !== false) {
    fx0 = clamp((g.player.cx + cam.focus.cx) / 2 - cam.x, 200, VIEW_W - 200);
    fy0 = clamp((g.player.cy + cam.focus.cy) / 2 - cam.y, 150, VIEW_H - 150);
  }
  ctx.save();
  ctx.translate(fx0, fy0);
  ctx.scale(zoom, zoom);
  ctx.translate(-fx0, -fy0);
  ctx.translate(-Math.round(cam.x + cam.ox), -Math.round(cam.y + cam.oy));
  const view = { x: cam.x - 100, y: cam.y - 100, w: VIEW_W + 200, h: VIEW_H + 200 };
  const visible = g.world.rooms.filter((r) => overlap(view, { x: r.x, y: r.y, w: r.pw, h: r.ph }));
  for (const r of visible) drawRoomBack(r);
  drawCarving();
  drawBombBlocks(view);
  for (const m of g.membranes) if (overlap(view, m)) drawMembrane(ctx, m.x, m.y, m.w, m.h, g.realTime, g.player.hasPhase);
  for (const d of g.world.doors) if (overlap(view, d)) drawDoor(ctx, d, g.realTime);
  for (const v of g.vents) if (overlap(view, { x: v.x, y: v.y - 160, w: 40, h: 170 })) drawVent(ctx, v.x, v.y, g.realTime, v.heat);
  drawItems(view);
  drawPickups();
  drawHatProp();
  drawBombs();
  for (const e of g.enemies) if (e.room === g.room?.id || overlap(view, e)) { e.draw(ctx, g); e.drawStatus(ctx, g); }
  if (g.boss) g.boss.draw(ctx, g);
  drawGhosts();
  drawPlayer();
  drawEnemyShots();
  drawShots();
  for (const pl of g.pools) if (overlap(view, pl)) drawPool(ctx, pl.x, pl.y, pl.w, pl.h, pl.type, g.realTime);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  g.fx.drawLights(ctx);
  g.fx.drawParts(ctx, true);
  g.fx.drawRings(ctx);
  g.fx.drawArcs(ctx);
  g.fx.drawHands(ctx, drawDevourHand);
  ctx.restore();
  g.fx.drawParts(ctx, false);
  drawDevourPrompts();
  for (const r of visible) drawRoomFront(r);
  ctx.restore();

  // screen-space grade
  ctx.drawImage(g.vignette, 0, 0);
  if (g.player?.state === 'devour') {
    const k = clamp(g.player.stateT / 0.2, 0, 1);
    const grd = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7);
    grd.addColorStop(0, 'rgba(120,0,70,0)');
    grd.addColorStop(1, `rgba(120,0,70,${0.45 * k})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (g.player?.ravenousT > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(g.realTime * 5);
    const grd = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.75);
    grd.addColorStop(0, 'rgba(255,40,160,0)');
    grd.addColorStop(1, `rgba(255,40,160,${0.12 + 0.08 * pulse})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (g.hurtFlash > 0) {
    const grd = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7);
    grd.addColorStop(0, 'rgba(255,0,0,0)');
    grd.addColorStop(1, `rgba(200,10,20,${g.hurtFlash})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (g.flashMag > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(120,10,70,${Math.min(0.5, g.flashMag) * 0.5})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }
  if (g.flashWhite > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(200,215,255,${Math.min(0.3, g.flashWhite)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }
  if (g.state === 'title') {
    ctx.fillStyle = 'rgba(4,3,3,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawTitle(ctx, g.stateT, { options: g.menuOptions, sel: g.menuSel, label: (a) => g.input.label(a), touch: g.input.lastDevice === 'touch' });
    drawOverlays();
    return;
  }
  if (g.fade > 0.001) {
    ctx.fillStyle = `rgba(3,2,2,${g.fade})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  g.hud.draw(ctx, g);
  if (g.touch) g.touch.draw(ctx, g.state === 'play' && !g.paused && !g.intro);
  if (g.intro && g.input.lastDevice === 'touch') {
    ctx.font = '500 12px "Inter", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('SKIP ›', VIEW_W - 110, 60);
  }
  if (g.state === 'dead') drawDeath(ctx, g.deathT);
  if (g.state === 'end') drawEnd(ctx, g.endT, g.stats, g.input.lastDevice === 'touch');
  if (g.paused) {
    const items = g.flags.items || 0;
    drawPause(ctx, (a) => g.input.label(a), drawWorldMap, {
      roomName: g.room?.name, touch: g.input.lastDevice === 'touch',
      stats: [['TIME', fmtTime(g.playTime)], ['ITEMS', `${items} / ${ITEM_TOTAL}`], ['MODE', g.diff.name]],
    });
    if (g.touch && g.input.lastDevice === 'touch') g.touch.draw(ctx, false);
  }
  drawOverlays();
}

function drawOverlays() {
  if (g.touch && g.touch.active && innerHeight > innerWidth) drawRotate(ctx);
  // keys go wherever the focus is; say so when it isn't on the game
  if (!document.hasFocus() && g.input.lastDevice !== 'touch' && g.input.lastDevice !== 'pad') {
    ctx.save();
    ctx.font = '500 13px "Inter", system-ui, sans-serif';
    const txt = 'Click the game to use the keyboard';
    const w = ctx.measureText(txt).width + 44;
    const x = 380, y = 30;
    ctx.fillStyle = 'rgba(12,12,16,0.88)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, 32, 8) : ctx.rect(x, y, w, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,62,180,0.95)';
    ctx.beginPath(); ctx.arc(x + 18, y + 16, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(txt, x + 30, y + 21);
    ctx.restore();
  }
}

function drawRoomBack(r) {
  const A = g.art[r.id];
  if (!A) return;
  const cam = g.cam;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.pw, r.ph);
  ctx.clip();
  ctx.fillStyle = PALETTES[r.theme].base;
  ctx.fillRect(r.x, r.y, r.pw, r.ph);
  for (const L of A.layers) {
    const o = layerOrigin(r, L.f, cam.x, cam.y);
    ctx.drawImage(L.canvas, o.x, o.y, L.canvas.width * L.s, L.canvas.height * L.s);
  }
  drawLightShafts(r);
  ctx.drawImage(A.terrain, r.x, r.y, r.pw, r.ph);
  if (A.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.25 * Math.sin(g.realTime * 1.7);
    ctx.drawImage(A.glow, r.x, r.y, r.pw, r.ph);
    ctx.restore();
  }
  ctx.restore();
}

function drawRoomFront(r) {
  const A = g.art[r.id];
  if (!A || !A.fg) return;
  const o = layerOrigin(r, A.fg.f, g.cam.x, g.cam.y);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x - 200, r.y - 200, r.pw + 400, r.ph + 400);
  ctx.clip();
  ctx.drawImage(A.fg.canvas, o.x, o.y, A.fg.canvas.width * A.fg.s, A.fg.canvas.height * A.fg.s);
  ctx.restore();
}

function drawLightShafts(r) {
  const t = g.realTime;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (r.id === 'A') {
    const x0 = r.x + 480, x1 = r.x + 800;
    for (let k = 0; k < 5; k++) {
      const a = 0.05 + 0.03 * Math.sin(t * 0.7 + k * 1.7);
      const spread = 60 + k * 50;
      const gr = ctx.createLinearGradient(0, r.y, 0, r.y + 1100);
      gr.addColorStop(0, `rgba(255,230,190,${a * 2.2})`);
      gr.addColorStop(0.5, `rgba(255,200,140,${a})`);
      gr.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = gr;
      const off = (k - 2) * 40 + Math.sin(t * 0.3 + k) * 10;
      ctx.beginPath();
      ctx.moveTo(x0 + 40 + off * 0.4, r.y);
      ctx.lineTo(x1 - 40 + off * 0.4, r.y);
      ctx.lineTo(x1 + spread * 0.5 + off, r.y + 1100);
      ctx.lineTo(x0 - spread * 0.5 + off, r.y + 1100);
      ctx.closePath();
      ctx.fill();
    }
    const sky = ctx.createRadialGradient(r.x + 640, r.y - 20, 0, r.x + 640, r.y - 20, 260);
    sky.addColorStop(0, 'rgba(255,245,225,0.95)');
    sky.addColorStop(0.3, 'rgba(255,220,170,0.35)');
    sky.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(r.x + 380, r.y - 20, 520, 300);
  } else if (r.id === 'C' || r.id === 'G' || r.id === 'E') {
    const cx = r.x + (r.id === 'E' ? r.pw * 0.3 : r.pw / 2);
    const col = r.id === 'G' ? '210,255,160' : r.id === 'E' ? '190,230,255' : '200,225,255';
    for (let k = 0; k < (r.id === 'G' ? 3 : 1); k++) {
      const off = (k - 1) * 220 + Math.sin(t * 0.25 + k) * 20;
      const gr = ctx.createLinearGradient(0, r.y, 0, r.y + r.ph);
      gr.addColorStop(0, `rgba(${col},${0.16 + 0.03 * Math.sin(t * 0.6 + k)})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(cx + off - 90, r.y);
      ctx.lineTo(cx + off + 90, r.y);
      ctx.lineTo(cx + off * 1.4 + 220, r.y + r.ph);
      ctx.lineTo(cx + off * 1.4 - 220, r.y + r.ph);
      ctx.closePath();
      ctx.fill();
    }
  } else if (r.id === 'I') {
    for (let k = 0; k < 3; k++) {
      const y = r.y + 440 + k * 70 + Math.sin(t * 0.4 + k) * 10;
      const gr = ctx.createLinearGradient(0, y - 40, 0, y + 40);
      gr.addColorStop(0, 'rgba(90,60,170,0)');
      gr.addColorStop(0.5, `rgba(90,60,170,${0.05 + 0.02 * Math.sin(t + k)})`);
      gr.addColorStop(1, 'rgba(90,60,170,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(r.x, y - 40, r.pw, 80);
    }
  }
  ctx.restore();
}

// Liam's name, carved into the ice behind the cracked blocks
function drawCarving() {
  const it = g.items.find((i) => i.id === 'tank');
  if (!it) return;
  const x = it.x, y = it.y - 50;
  if (Math.abs(g.cam.x + VIEW_W / 2 - x) > VIEW_W) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.7 + 0.3 * Math.sin(g.realTime * 1.5);
  ctx.font = '300 22px "Inter Tight", "Inter", system-ui, sans-serif';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.3em';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(140,220,255,0.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = `rgba(190,240,255,${0.75 * pulse})`;
  ctx.fillText('LIAM', x + 4, y + 8);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}

function drawBombBlocks(view) {
  const w = g.world;
  const x0 = Math.max(0, Math.floor(view.x / TILE)), x1 = Math.min(w.tw - 1, Math.floor((view.x + view.w) / TILE));
  const y0 = Math.max(0, Math.floor(view.y / TILE)), y1 = Math.min(w.th - 1, Math.floor((view.y + view.h) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (w.tile(tx, ty) !== T.BOMB) continue;
      drawCrackedBlock(ctx, tx * TILE, ty * TILE, w.roomAt(tx * TILE + 20, ty * TILE + 20)?.theme || 'sand', g.realTime);
    }
  }
}

function drawBombs() {
  for (const b of g.bombs) {
    const k = 1 - b.t / 0.85;
    const blink = Math.sin(k * k * 60) > 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = 7 + k * 3;
    const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 2.2);
    gr.addColorStop(0, blink ? 'rgba(255,255,230,1)' : 'rgba(255,200,120,0.9)');
    gr.addColorStop(0.4, 'rgba(255,150,70,0.6)');
    gr.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 2.2, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#1a1420';
    ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, TAU); ctx.fill();
  }
}

function drawPlayer() {
  const p = g.player;
  if (!p || !p.visible || p.state === 'dead') return;
  if (p.inv > 0 && p.state !== 'devour' && p.state !== 'dash' && Math.floor(p.inv * 14) % 2 === 1) return;
  if (p.ravenousT > 0 || p.state === 'devour') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const k = p.state === 'devour' ? 0.5 : 0.45 + 0.2 * Math.sin(g.realTime * 6);
    const gr = ctx.createRadialGradient(p.cx, p.cy, 0, p.cx, p.cy, 70);
    gr.addColorStop(0, `rgba(255,60,180,${0.35 * k})`);
    gr.addColorStop(1, 'rgba(255,60,180,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(p.cx, p.cy, 70, 0, TAU); ctx.fill();
    ctx.restore();
  }
  drawSamus(ctx, p.pose());
  const vx = p.cx + p.facing * 8, vy = p.y + 2;
  g.fx.light(vx, vy, 36, p.ravenousT > 0 ? '255,80,200' : '190,255,120', 0.35);
}

function drawGhosts() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const gh of g.ghosts) {
    ctx.globalAlpha = clamp(gh.life / gh.max, 0, 1) * 0.9;
    ctx.drawImage(gh.img.canvas, gh.img.ox, gh.img.oy);
  }
  ctx.restore();
}

function drawShots() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of g.shots) {
    const ang = Math.atan2(s.vy, s.vx);
    const col = s.rav ? '255,90,200' : '255,205,120';
    if (s.kind === 'beam') {
      const len = 34;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(${col},0.55)`;
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(ang) * len, s.y - Math.sin(ang) * len); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,245,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(ang) * len * 0.8, s.y - Math.sin(ang) * len * 0.8); ctx.stroke();
    } else if (s.kind === 'charge') {
      const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 30);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, `rgba(${col},0.9)`);
      gr.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(s.x, s.y, 30, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${col},0.5)`;
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(ang) * 60, s.y - Math.sin(ang) * 60); ctx.stroke();
    } else if (s.kind === 'missile') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(ang);
      const fl = ctx.createLinearGradient(-34, 0, -6, 0);
      fl.addColorStop(0, 'rgba(255,120,40,0)');
      fl.addColorStop(1, 'rgba(255,220,150,0.95)');
      ctx.fillStyle = fl;
      ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-34 - Math.random() * 8, 0); ctx.lineTo(-6, 4); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#e8ecf2';
      ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(6, -4); ctx.lineTo(12, 0); ctx.lineTo(6, 4); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d0413a';
      ctx.fillRect(2, -4, 3, 8);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawEnemyShots() {
  for (const s of g.eshots) {
    if (s.kind === 'disc') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.sin(s.spin * 0.2) * 0.15);
      drawHat(ctx, false, s.spin, 3);
      if (s.counterable && !s.reflected) {
        ctx.globalCompositeOperation = 'lighter';
        const k = 0.5 + 0.5 * Math.sin(g.realTime * 30);
        const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
        gr.addColorStop(0, `rgba(255,250,210,${0.4 + 0.3 * k})`);
        gr.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.fill();
      }
      ctx.restore();
    } else if (s.kind === 'kunai' || s.kind === 'bolt') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.globalCompositeOperation = 'lighter';
      const c1 = s.kind === 'bolt' ? 'rgba(255,70,120,0.5)' : 'rgba(255,150,60,0.5)';
      const c2 = s.kind === 'bolt' ? 'rgba(255,220,235,0.95)' : 'rgba(255,240,200,0.95)';
      ctx.strokeStyle = c1;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.strokeStyle = c2;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.restore();
    } else if (s.kind === 'glob') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 20);
      gr.addColorStop(0, 'rgba(255,240,180,1)');
      gr.addColorStop(0.4, 'rgba(255,130,40,0.85)');
      gr.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(s.x, s.y, 20, 0, TAU); ctx.fill();
      ctx.restore();
      if (Math.random() < 0.5) g.fx.add({ kind: 'smoke', x: s.x, y: s.y, vx: rand(-10, 10), vy: -20, life: 0.4, size: 4, grow: 14, color: 'rgba(60,30,20,', alpha: 0.4 });
    } else if (s.kind === 'thorn') {
      ctx.save();
      if (s.wait > 0) {
        const k = 1 - s.wait / 0.55;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,120,220,${0.2 + 0.4 * k})`;
        const fy = g.thorn ? g.thorn.arena.floorY : s.y + 400;
        ctx.beginPath(); ctx.ellipse(s.x, fy - 2, 14 + 10 * k, 4, 0, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.translate(s.x, s.y);
      ctx.fillStyle = '#e8d070';
      ctx.beginPath(); ctx.moveTo(-6, -18); ctx.lineTo(6, -18); ctx.lineTo(0, 18); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,30,10,0.7)';
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawPickups() {
  for (const k of g.pickups) {
    const bob = Math.sin(k.t * 4) * 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (k.kind === 'orb') {
      const gr = ctx.createRadialGradient(k.x, k.y + bob, 0, k.x, k.y + bob, 14);
      gr.addColorStop(0, 'rgba(255,255,220,1)');
      gr.addColorStop(0.35, 'rgba(255,210,90,0.8)');
      gr.addColorStop(1, 'rgba(255,170,40,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(k.x, k.y + bob, 14, 0, TAU); ctx.fill();
    } else if (k.kind === 'missile') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#e8ecf2';
      ctx.fillRect(k.x - 7, k.y - 4 + bob, 14, 8);
      ctx.fillStyle = '#d0413a';
      ctx.fillRect(k.x + 2, k.y - 4 + bob, 3, 8);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,120,110,0.35)';
      ctx.beginPath(); ctx.arc(k.x, k.y + bob, 12, 0, TAU); ctx.fill();
    } else if (k.kind === 'pod') {
      const pulse = 0.6 + 0.4 * Math.sin(k.t * 3);
      const gr = ctx.createRadialGradient(k.x, k.y + bob, 0, k.x, k.y + bob, 30);
      gr.addColorStop(0, `rgba(255,200,240,${0.9 * pulse})`);
      gr.addColorStop(0.3, `rgba(255,80,190,${0.6 * pulse})`);
      gr.addColorStop(1, 'rgba(255,60,170,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(k.x, k.y + bob, 30, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(60,20,40,0.9)';
      ctx.lineWidth = 2;
      for (let a = 0; a < 5; a++) {
        const an = (a / 5) * TAU + k.t * 0.5;
        ctx.beginPath();
        ctx.arc(k.x, k.y + bob, 10, an, an + 0.8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// each upgrade has its own look: phase orb, morph sphere, Liam's tank, missile tank
function drawItems(view) {
  const t = g.realTime;
  for (const it of g.items) {
    if (it.taken || Math.abs(it.x - (view.x + view.w / 2)) > view.w) continue;
    const x = it.x, by = it.y + Math.sin(t * 2 + x) * 4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const col = it.kind === 'morph' ? '255,170,110' : it.kind === 'tank' ? '190,255,160' : it.kind === 'missile' ? '255,140,130' : '140,210,255';
    const halo = ctx.createRadialGradient(x, by, 0, x, by, 90);
    halo.addColorStop(0, `rgba(${col},0.5)`);
    halo.addColorStop(0.3, `rgba(${col},0.18)`);
    halo.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, by, 90, 0, TAU); ctx.fill();
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(${col},${0.5 - k * 0.12})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(x, by, 26 + k * 8, 8 + k * 2, t * (0.8 + k * 0.4) + k, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (it.kind === 'phase') {
      const core = ctx.createRadialGradient(x - 4, by - 4, 0, x, by, 16);
      core.addColorStop(0, 'rgba(255,255,255,1)');
      core.addColorStop(0.5, 'rgba(140,215,255,0.9)');
      core.addColorStop(1, 'rgba(60,130,255,0.3)');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(x, by, 16, 0, TAU); ctx.fill();
    } else if (it.kind === 'morph') {
      drawSamus(ctx, { ball: true, x, y: by + 14, rollA: t * 2, animT: t, rav: false });
    } else if (it.kind === 'tank') {
      ctx.fillStyle = '#0c1a10';
      ctx.fillRect(x - 13, by - 13, 26, 26);
      const gr = ctx.createLinearGradient(x, by - 11, x, by + 11);
      gr.addColorStop(0, '#e6ffb0');
      gr.addColorStop(1, '#58b83a');
      ctx.fillStyle = gr;
      ctx.fillRect(x - 10, by - 10, 20, 20);
      ctx.fillStyle = 'rgba(10,30,10,0.8)';
      ctx.fillRect(x - 10, by - 1, 20, 2);
      ctx.fillRect(x - 1, by - 10, 2, 20);
    } else if (it.kind === 'missile') {
      ctx.fillStyle = '#1a0c0c';
      ctx.fillRect(x - 14, by - 10, 28, 20);
      ctx.fillStyle = '#e8ecf2';
      ctx.beginPath(); ctx.moveTo(x - 10, by - 4); ctx.lineTo(x + 4, by - 4); ctx.lineTo(x + 10, by); ctx.lineTo(x + 4, by + 4); ctx.lineTo(x - 10, by + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d0413a';
      ctx.fillRect(x, by - 4, 3, 8);
    }
    ctx.restore();
    g.fx.light(x, by, 200, col, 0.45);
  }
}

function drawHatProp() {
  const h = g.hatProp;
  if (h) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    drawHat(ctx, false, g.realTime, 0);
    ctx.restore();
  }
  const b = g.brim;
  if (b && b.hatDrop && !b.hatOn && g.boss === b) {
    ctx.save();
    ctx.translate(b.hatDrop.x, b.hatDrop.y);
    ctx.rotate(0.12);
    drawHat(ctx, false, g.realTime, 0);
    ctx.restore();
  }
}

function drawDevourPrompts() {
  const p = g.player;
  if (!p || p.state === 'devour' || p.state === 'dead' || p.state === 'ball') return;
  const t = devourTarget(p, 260);
  if (!t) return;
  const label = g.input.label('devour');
  g.hud.drawDevourPrompt(ctx, t.cx, t.y - (t.isBoss ? 70 : 26), g.realTime, label.length > 2 ? '›' : label);
}

// the pause map: every room you've seen, doors, items you've spotted, and you
function drawWorldMap(c, x, y, w, h) {
  const sc = 3;
  const p = g.player;
  const W = g.world;
  const mapW = W.tw * sc;
  const ox = clamp(x + w / 2 - (p.cx / TILE) * sc, x + w - mapW - 10, x + 10);
  const oy = y + 60;
  c.save();
  c.beginPath();
  c.rect(x, y, w, 420);
  c.clip();
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.lineWidth = 1;
  c.strokeRect(x + 0.5, y + 0.5, w - 1, 400);
  for (const r of W.rooms) {
    if (!r.seen) continue;
    const cur = g.room && r.id === g.room.id;
    const pal = PALETTES[r.theme];
    c.fillStyle = `rgba(${pal.rockHi.join(',')},${cur ? 0.32 : 0.16})`;
    c.fillRect(ox + r.tx * sc, oy + r.ty * sc, r.w * sc, r.h * sc);
    c.strokeStyle = cur ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
    c.strokeRect(ox + r.tx * sc + 0.5, oy + r.ty * sc + 0.5, r.w * sc - 1, r.h * sc - 1);
    c.font = '500 9px "Inter", system-ui, sans-serif';
    if ('letterSpacing' in c) c.letterSpacing = '0.14em';
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillText(r.name.toUpperCase(), ox + r.tx * sc + 4, oy + r.ty * sc - 5);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
  }
  for (const d of W.doors) {
    const r = W.room(d.room);
    if (!r || !r.seen) continue;
    c.fillStyle = d.locked ? 'rgba(255,90,100,0.95)' : 'rgba(120,190,255,0.95)';
    c.fillRect(ox + d.tx * sc, oy + d.ty * sc, sc, (d.h / TILE) * sc);
  }
  for (const it of g.items) {
    const r = W.room(it.room);
    if (!r || !r.seen || it.taken) continue;
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(ox + (it.x / TILE) * sc, oy + (it.y / TILE) * sc, 2.5, 0, TAU); c.fill();
  }
  const blink = 0.6 + 0.4 * Math.sin(g.realTime * 6);
  c.fillStyle = `rgba(255,62,180,${blink})`;
  c.beginPath(); c.arc(ox + (p.cx / TILE) * sc, oy + (p.cy / TILE) * sc, 3.5, 0, TAU); c.fill();
  c.restore();
}

// ---------------------------------------------------------------- loop

const STEP = 1 / 120;
let acc = 0, last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  if ((g.state === 'play' || g.state === 'cine') && !document.hidden && dt < 0.1) {
    perf.acc += dt;
    perf.n++;
    if (perf.acc > 2) {
      const avg = perf.acc / perf.n;
      perf.slow = avg > 0.024 ? perf.slow + 1 : 0;
      if (perf.slow >= 2 && resScale > 0.75) {
        resScale = Math.max(0.75, resScale - 0.25);
        perf.slow = 0;
        resize();
      }
      perf.acc = 0;
      perf.n = 0;
    }
  }
  g.input.pollPad();
  if (g.state !== 'loading') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 12) { tick(STEP); acc -= STEP; n++; }
    if (n >= 12) acc = 0;
  }
  render();
  musicTick();
  music.tick();
  requestAnimationFrame(frame);
}

load().then(() => {
  last = performance.now();
  requestAnimationFrame(frame);
}).catch((e) => {
  console.error(e);
  g.loadMsg = 'could not paint the moon: ' + e.message;
  render();
});
