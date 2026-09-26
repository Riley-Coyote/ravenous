// Everything you hear is synthesized here — no sampled audio.

let ctx = null, master = null, sfxBus = null, musicBus = null, verbIn = null, noiseBuf = null;
let muted = false;
let chargeOsc = null, chargeGain = null;
const amb = { theme: null, nodes: [] };
const music = { on: false, nextT: 0, step: 0, gain: null };

export function audioInit() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.85;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
    const verb = ctx.createConvolver();
    verb.buffer = impulse(3.2, 2.6);
    verbIn = ctx.createGain(); verbIn.gain.value = 1;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.32;
    verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) {
    ctx = null;
  }
}

export function audioParts() {
  return ctx ? { ctx, musicBus, sfxBus, master, verbIn, noiseBuf } : null;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.05);
  return muted;
}
export const isMuted = () => muted;

function impulse(sec, decay) {
  const len = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

function out(vol, verb = 0.15, bus = sfxBus) {
  const g = ctx.createGain();
  g.gain.value = vol;
  g.connect(bus);
  if (verb > 0) {
    const s = ctx.createGain();
    s.gain.value = verb;
    g.connect(s);
    s.connect(verbIn);
  }
  return g;
}

function tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.1, attack = 0.004, verb = 0.12, delay = 0, curve = 'exp', filter = null, bus }) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== null) {
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(1, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.value = filter.f || 1000;
    f.Q.value = filter.q || 0.7;
    o.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(out(vol, verb, bus));
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.2, type = 'bandpass', f0 = 1000, f1 = null, q = 1, attack = 0.003, verb = 0.12, delay = 0, bus }) {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  if (f1 !== null) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(1, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(out(vol, verb, bus));
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.05);
}

const SFX = {
  beam() {
    tone({ type: 'square', f0: 1250, f1: 380, dur: 0.09, vol: 0.07, verb: 0.08 });
    noise({ type: 'highpass', f0: 3500, dur: 0.05, vol: 0.06 });
  },
  beamRav() {
    tone({ type: 'sawtooth', f0: 900, f1: 180, dur: 0.12, vol: 0.08, verb: 0.15 });
    tone({ type: 'square', f0: 1800, f1: 600, dur: 0.07, vol: 0.04 });
  },
  chargeReady() {
    tone({ type: 'sine', f0: 1320, dur: 0.18, vol: 0.06, verb: 0.3 });
    tone({ type: 'sine', f0: 1980, dur: 0.22, vol: 0.04, delay: 0.04, verb: 0.3 });
  },
  charged() {
    tone({ type: 'sawtooth', f0: 520, f1: 90, dur: 0.38, vol: 0.14, filter: { f: 2200 } });
    tone({ type: 'sine', f0: 120, f1: 45, dur: 0.35, vol: 0.3, verb: 0.05 });
    noise({ f0: 900, f1: 300, dur: 0.3, vol: 0.12, q: 0.8 });
  },
  missile() {
    noise({ type: 'lowpass', f0: 300, f1: 2600, dur: 0.38, vol: 0.2, q: 1.2 });
    tone({ type: 'sawtooth', f0: 160, f1: 70, dur: 0.28, vol: 0.08, filter: { f: 900 } });
  },
  explode() {
    noise({ type: 'lowpass', f0: 1600, f1: 120, dur: 0.7, vol: 0.45, q: 0.9, verb: 0.35 });
    tone({ type: 'sine', f0: 90, f1: 32, dur: 0.55, vol: 0.45, verb: 0.1 });
  },
  jump() {
    tone({ type: 'sine', f0: 210, f1: 330, dur: 0.1, vol: 0.05, verb: 0.02 });
  },
  land() {
    noise({ type: 'lowpass', f0: 420, f1: 120, dur: 0.16, vol: 0.22, verb: 0.05 });
  },
  bigLand() {
    noise({ type: 'lowpass', f0: 700, f1: 60, dur: 0.9, vol: 0.5, verb: 0.4 });
    tone({ type: 'sine', f0: 70, f1: 28, dur: 0.8, vol: 0.55, verb: 0.2 });
  },
  whiff() {
    noise({ f0: 2200, f1: 500, dur: 0.16, vol: 0.12, q: 1.4, verb: 0.05 });
  },
  counter() {
    const base = 460;
    [1, 2.76, 5.4, 8.93].forEach((m, i) => tone({ type: 'sine', f0: base * m, dur: 0.9 - i * 0.15, vol: 0.12 / (i + 1), verb: 0.5 }));
    noise({ type: 'highpass', f0: 2500, dur: 0.07, vol: 0.35, verb: 0.2 });
    tone({ type: 'sine', f0: 130, f1: 42, dur: 0.4, vol: 0.45, verb: 0.2 });
  },
  meleeHit() {
    noise({ f0: 900, f1: 300, dur: 0.12, vol: 0.2, q: 1 });
    tone({ type: 'square', f0: 220, f1: 90, dur: 0.1, vol: 0.06 });
  },
  telegraph() {
    tone({ type: 'sine', f0: 2100, dur: 0.3, vol: 0.06, verb: 0.45 });
    tone({ type: 'sine', f0: 3150, dur: 0.22, vol: 0.035, verb: 0.45, delay: 0.02 });
  },
  devour(dur = 0.8) {
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(52, t0); o.frequency.linearRampToValueAtTime(78, t0 + dur);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(180, t0); f.frequency.exponentialRampToValueAtTime(1400, t0 + dur);
    const trem = ctx.createOscillator(); trem.frequency.value = 17; const tg = ctx.createGain(); tg.gain.value = 0.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.08); g.gain.setValueAtTime(0.6, t0 + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.1);
    trem.connect(tg); tg.connect(g.gain);
    o.connect(f); f.connect(g); g.connect(out(0.35, 0.3));
    o.start(t0); trem.start(t0); o.stop(t0 + dur + 0.15); trem.stop(t0 + dur + 0.15);
    tone({ type: 'sine', f0: 380, f1: 1700, dur: dur, vol: 0.05, verb: 0.5 });
  },
  devourEnd() {
    noise({ f0: 700, f1: 160, dur: 0.3, vol: 0.4, q: 0.7, verb: 0.25 });
    tone({ type: 'square', f0: 140, f1: 40, dur: 0.22, vol: 0.12 });
    tone({ type: 'sine', f0: 880, dur: 0.5, vol: 0.05, verb: 0.6, delay: 0.05 });
    tone({ type: 'sine', f0: 1318, dur: 0.6, vol: 0.035, verb: 0.6, delay: 0.1 });
  },
  hurt() {
    tone({ type: 'sawtooth', f0: 320, f1: 80, dur: 0.26, vol: 0.13, filter: { f: 1600 } });
    noise({ f0: 1200, f1: 400, dur: 0.12, vol: 0.15 });
  },
  enemyHit() {
    noise({ f0: 1500, dur: 0.05, vol: 0.12, q: 2 });
  },
  enemyDie() {
    noise({ type: 'lowpass', f0: 900, f1: 90, dur: 0.38, vol: 0.3, verb: 0.2 });
    tone({ type: 'triangle', f0: 420, f1: 60, dur: 0.3, vol: 0.12 });
  },
  pickup() {
    tone({ type: 'sine', f0: 880, dur: 0.08, vol: 0.06, verb: 0.2 });
    tone({ type: 'sine', f0: 1320, dur: 0.12, vol: 0.05, delay: 0.05, verb: 0.3 });
  },
  item() {
    [440, 523.25, 659.25, 880, 1046.5, 1318.5].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 1.4, vol: 0.07, delay: i * 0.11, verb: 0.6 }));
    tone({ type: 'sine', f0: 110, dur: 2.2, vol: 0.12, attack: 0.3, verb: 0.5 });
    tone({ type: 'sine', f0: 164.8, dur: 2.2, vol: 0.08, attack: 0.3, verb: 0.5 });
  },
  door() {
    noise({ f0: 300, f1: 1800, dur: 0.35, vol: 0.14, q: 1.5, verb: 0.2 });
    tone({ type: 'sine', f0: 220, f1: 520, dur: 0.3, vol: 0.05 });
  },
  doorClose() {
    noise({ f0: 1500, f1: 250, dur: 0.3, vol: 0.1, q: 1.5 });
  },
  locked() {
    tone({ type: 'square', f0: 140, dur: 0.12, vol: 0.06, filter: { f: 700 } });
    tone({ type: 'square', f0: 110, dur: 0.16, vol: 0.06, delay: 0.1, filter: { f: 700 } });
  },
  dash() {
    noise({ type: 'highpass', f0: 700, f1: 4200, dur: 0.2, vol: 0.2, verb: 0.15 });
    tone({ type: 'sine', f0: 500, f1: 1500, dur: 0.16, vol: 0.05 });
  },
  phase() {
    tone({ type: 'sine', f0: 660, f1: 1320, dur: 0.3, vol: 0.06, verb: 0.5 });
    tone({ type: 'sine', f0: 990, f1: 1980, dur: 0.3, vol: 0.04, verb: 0.5, delay: 0.03 });
  },
  empty() {
    tone({ type: 'square', f0: 90, dur: 0.07, vol: 0.05 });
  },
  throwHat() {
    noise({ f0: 600, f1: 2400, dur: 0.3, vol: 0.18, q: 2, verb: 0.2 });
    tone({ type: 'sawtooth', f0: 180, f1: 320, dur: 0.3, vol: 0.05, filter: { f: 1200 } });
  },
  slash() {
    noise({ type: 'highpass', f0: 1200, f1: 5000, dur: 0.22, vol: 0.25, verb: 0.2 });
    tone({ type: 'sawtooth', f0: 900, f1: 200, dur: 0.18, vol: 0.05 });
  },
  blink() {
    noise({ f0: 2400, f1: 300, dur: 0.25, vol: 0.14, q: 3, verb: 0.3 });
  },
  bossVoice() {
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(62, t0); o.frequency.linearRampToValueAtTime(48, t0 + 1.4);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6; f.frequency.setValueAtTime(420, t0); f.frequency.linearRampToValueAtTime(260, t0 + 1.4);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 6; const lg = ctx.createGain(); lg.gain.value = 80; lfo.connect(lg); lg.connect(f.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
    o.connect(f); f.connect(g); g.connect(out(0.4, 0.5));
    o.start(t0); lfo.start(t0); o.stop(t0 + 1.6); lfo.stop(t0 + 1.6);
  },
  bossLand() {
    SFX.bigLand();
    tone({ type: 'sine', f0: 2600, dur: 0.6, vol: 0.03, verb: 0.7, delay: 0.05 });
  },
  ravenous() {
    tone({ type: 'sawtooth', f0: 55, f1: 110, dur: 1.2, vol: 0.12, attack: 0.2, filter: { f: 900, q: 4 }, verb: 0.4 });
    tone({ type: 'sine', f0: 220, f1: 880, dur: 1.0, vol: 0.06, verb: 0.6 });
    noise({ f0: 200, f1: 3000, dur: 1.0, vol: 0.12, q: 0.8, attack: 0.3, verb: 0.4 });
  },
  ui() {
    tone({ type: 'sine', f0: 1500, dur: 0.05, vol: 0.04, verb: 0.1 });
  },
  start() {
    tone({ type: 'sine', f0: 220, f1: 110, dur: 1.6, vol: 0.2, verb: 0.6 });
    noise({ type: 'lowpass', f0: 2000, f1: 80, dur: 1.4, vol: 0.2, verb: 0.5 });
  },
  death() {
    tone({ type: 'sawtooth', f0: 400, f1: 40, dur: 1.4, vol: 0.12, filter: { f: 1200 }, verb: 0.5 });
    noise({ type: 'lowpass', f0: 1200, f1: 60, dur: 1.2, vol: 0.3, verb: 0.5 });
  },
  typeTick() {
    tone({ type: 'square', f0: 2400 + Math.random() * 300, dur: 0.015, vol: 0.012, verb: 0 });
  },
  morph() {
    tone({ type: 'sine', f0: 900, f1: 300, dur: 0.16, vol: 0.07, verb: 0.2 });
    noise({ f0: 3000, f1: 800, dur: 0.12, vol: 0.08, q: 2 });
  },
  unmorph() {
    tone({ type: 'sine', f0: 300, f1: 900, dur: 0.16, vol: 0.07, verb: 0.2 });
  },
  bombSet() {
    tone({ type: 'square', f0: 1200, dur: 0.04, vol: 0.04 });
  },
  bomb() {
    noise({ type: 'lowpass', f0: 1400, f1: 150, dur: 0.4, vol: 0.35, verb: 0.25 });
    tone({ type: 'sine', f0: 110, f1: 40, dur: 0.3, vol: 0.3 });
  },
  crumble() {
    noise({ type: 'lowpass', f0: 900, f1: 120, dur: 0.5, vol: 0.3, verb: 0.3 });
    for (let i = 0; i < 4; i++) noise({ f0: 1500 + Math.random() * 1500, dur: 0.05, vol: 0.12, q: 3, delay: 0.05 + i * 0.07 });
  },
  itemSmall() {
    [660, 880, 1320].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.5, vol: 0.06, delay: i * 0.08, verb: 0.5 }));
  },
  sizzle() {
    noise({ type: 'highpass', f0: 2000, f1: 5000, dur: 0.5, vol: 0.25, verb: 0.1 });
    tone({ type: 'sawtooth', f0: 220, f1: 60, dur: 0.3, vol: 0.1, filter: { f: 900 } });
  },
  vent() {
    noise({ f0: 400, f1: 1600, dur: 0.6, vol: 0.12, q: 0.7, verb: 0.2 });
  },
};

export function sfx(name, arg) {
  if (!ctx || muted) return;
  try {
    const f = SFX[name];
    if (f) f(arg);
  } catch (e) { /* audio must never break the game */ }
}

// Rising hum while the beam charges.
export function setCharge(level) {
  if (!ctx) return;
  try {
    if (level > 0 && !chargeOsc) {
      chargeOsc = ctx.createOscillator(); chargeOsc.type = 'sine';
      chargeGain = ctx.createGain(); chargeGain.gain.value = 0;
      chargeOsc.connect(chargeGain); chargeGain.connect(out(1, 0.2));
      chargeOsc.start();
    }
    if (chargeOsc) {
      if (level <= 0) {
        chargeGain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        const o = chargeOsc; setTimeout(() => { try { o.stop(); } catch (e) {} }, 120);
        chargeOsc = null; chargeGain = null;
      } else {
        chargeOsc.frequency.setTargetAtTime(180 + level * 520, ctx.currentTime, 0.03);
        chargeGain.gain.setTargetAtTime(muted ? 0 : 0.025 + level * 0.03, ctx.currentTime, 0.03);
      }
    }
  } catch (e) {}
}

// Per-room drone beds.
const AMB = {
  sand: { drones: [55, 82.4], cutoff: 380, wind: 0.2 },
  ruin: { drones: [65.4, 98, 130.8], cutoff: 520, wind: 0.1 },
  arena: { drones: [46.2, 69.3], cutoff: 300, wind: 0.08 },
  title: { drones: [41.2, 61.7], cutoff: 260, wind: 0.18 },
  ice: { drones: [61.7, 92.5], cutoff: 700, wind: 0.24 },
  magma: { drones: [32.7, 49], cutoff: 220, wind: 0.14 },
  hive: { drones: [73.4, 110], cutoff: 420, wind: 0.1 },
  lab: { drones: [38.9, 58.3], cutoff: 340, wind: 0.05 },
};

export function setAmbient(theme) {
  if (!ctx || amb.theme === theme) return;
  amb.theme = theme;
  const t = ctx.currentTime;
  for (const n of amb.nodes) {
    try {
      n.g.gain.setTargetAtTime(0, t, 0.6);
      setTimeout(() => { try { n.src.stop(); } catch (e) {} }, 3000);
    } catch (e) {}
  }
  amb.nodes = [];
  const cfg = AMB[theme];
  if (!cfg) return;
  try {
    cfg.drones.forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle'; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 1.004;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cfg.cutoff;
      const g = ctx.createGain(); g.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03; const lg = ctx.createGain(); lg.gain.value = 0.02;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out(1, 0.35, musicBus));
      g.gain.setTargetAtTime(0.05 / (i + 1), t, 1.2);
      o.start(); o2.start(); lfo.start();
      amb.nodes.push({ src: o, g }); amb.nodes.push({ src: o2, g }); amb.nodes.push({ src: lfo, g });
    });
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 140;
    lfo.connect(lg); lg.connect(f.frequency);
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(out(1, 0.2, musicBus));
    g.gain.setTargetAtTime(cfg.wind, t, 1.5);
    src.start(); lfo.start();
    amb.nodes.push({ src, g }); amb.nodes.push({ src: lfo, g });
  } catch (e) {}
}

// A driving boss ostinato, scheduled a little ahead of the clock.
const BASS = [41.2, 0, 41.2, 41.2, 0, 49, 0, 41.2, 36.7, 0, 41.2, 0, 30.9, 0, 32.7, 36.7];
export function setBossMusic(on) {
  if (!ctx) return;
  if (on && !music.on) {
    music.on = true;
    music.nextT = ctx.currentTime + 0.1;
    music.step = 0;
    music.gain = ctx.createGain();
    music.gain.gain.value = 0;
    music.gain.connect(musicBus);
    music.gain.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  } else if (!on && music.on) {
    music.on = false;
    const g = music.gain;
    if (g) g.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
  }
}
export function musicTick() {
  if (!ctx || !music.on || muted) return;
  const sixteenth = 60 / 132 / 4;
  while (music.nextT < ctx.currentTime + 0.2) {
    const t = music.nextT, s = music.step % 16;
    const f = BASS[s];
    try {
      if (f) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * 2;
        const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
        lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(140, t + 0.16);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(music.gain);
        o.start(t); o2.start(t); o.stop(t + 0.25); o2.stop(t + 0.25);
      }
      if (s % 4 === 0) {
        const k = ctx.createOscillator(); k.type = 'sine';
        k.frequency.setValueAtTime(130, t); k.frequency.exponentialRampToValueAtTime(38, t + 0.18);
        const kg = ctx.createGain(); kg.gain.setValueAtTime(0.0001, t); kg.gain.exponentialRampToValueAtTime(0.5, t + 0.004); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        k.connect(kg); kg.connect(music.gain); k.start(t); k.stop(t + 0.32);
      }
      if (s % 4 === 2) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
        const hg = ctx.createGain(); hg.gain.setValueAtTime(0.0001, t); hg.gain.exponentialRampToValueAtTime(0.06, t + 0.002); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        src.connect(hp); hp.connect(hg); hg.connect(music.gain); src.start(t, Math.random()); src.stop(t + 0.06);
      }
      if (s === 0 && music.step % 64 === 0) {
        const p = ctx.createOscillator(); p.type = 'triangle'; p.frequency.value = 329.6;
        const pg = ctx.createGain(); pg.gain.setValueAtTime(0.0001, t); pg.gain.exponentialRampToValueAtTime(0.04, t + 0.4); pg.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
        const s2 = ctx.createGain(); s2.gain.value = 0.5;
        p.connect(pg); pg.connect(music.gain); pg.connect(s2); s2.connect(verbIn);
        p.start(t); p.stop(t + 3.3);
      }
    } catch (e) {}
    music.nextT += sixteenth;
    music.step++;
  }
}
