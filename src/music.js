// An original soundtrack, synthesized live. Each song is a few looping tracks written
// in a tiny step notation: one token per sixteenth note.
//   E2  play a note     C4+E4+G4  a chord     -  keep holding     .  rest     x  a drum hit

import { audioParts } from './audio.js';

const r = (s, n) => Array(n).fill(s).join(' ');
const bar = (...tokens) => tokens.join(' ');
const hold = (note, steps) => [note, ...Array(steps - 1).fill('-')].join(' ');

const SONGS = {
  // eerie and wide open: the moon at night
  title: {
    bpm: 64,
    tracks: [
      { inst: 'drone', vol: 0.5, seq: hold('D2', 64) },
      { inst: 'pad', vol: 0.32, seq: [hold('D3+F3+A3', 16), hold('Bb2+D3+F3', 16), hold('G2+Bb2+D3', 16), hold('A2+C#3+E3', 16)].join(' ') },
      { inst: 'bell', vol: 0.34, seq: [
        bar('A4', r('.', 5), 'D5', r('.', 9)),
        bar('C5', r('.', 3), 'Bb4', r('.', 11)),
        bar('A4', r('.', 5), 'G4', r('.', 2), 'F4', r('.', 6)),
        bar('E4', r('.', 15)),
      ].join(' ') },
    ],
  },
  // the fall into the dark
  intro: {
    bpm: 60,
    tracks: [
      { inst: 'drone', vol: 0.55, seq: hold('D2', 32) },
      { inst: 'drone', vol: 0.3, seq: hold('A1', 32) },
      { inst: 'bell', vol: 0.22, seq: bar('D6', r('.', 31)) },
    ],
  },
  // Sinkhole and Hollows: a low pulse and a sparse, searching pluck
  sand: {
    bpm: 84,
    tracks: [
      { inst: 'bass', vol: 0.3, seq: [bar('E2', r('.', 7), 'E2', r('.', 7)), bar('E2', r('.', 7), 'E2', r('.', 7)), bar('C2', r('.', 7), 'C2', r('.', 7)), bar('D2', r('.', 7), 'D2', r('.', 7))].join(' ') },
      { inst: 'pad', vol: 0.18, seq: [hold('E3+G3+B3', 32), hold('C3+E3+G3', 16), hold('D3+F#3+A3', 16)].join(' ') },
      { inst: 'pluck', vol: 0.3, seq: [
        bar('.', '.', 'E4', '.', '.', '.', 'G4', r('.', 6), 'B4', '.', '.'),
        bar('.', '.', 'A4', '.', '.', '.', 'G4', '.', 'E4', r('.', 7)),
        bar('.', '.', 'E4', '.', '.', '.', 'G4', r('.', 6), 'D5', '.', '.'),
        bar('.', '.', 'B4', '.', '.', '.', 'A4', '.', 'G4', r('.', 3), 'E4', '.', '.', '.'),
      ].join(' ') },
      { inst: 'hat', vol: 0.12, seq: r('. . x .', 4) },
    ],
  },
  // Reliquary: a choir among the arches
  ruin: {
    bpm: 58,
    tracks: [
      { inst: 'drone', vol: 0.35, seq: hold('A1', 64) },
      { inst: 'choir', vol: 0.3, seq: [hold('A3+C4+E4', 16), hold('F3+A3+C4', 16), hold('C3+E3+G3', 16), hold('G3+B3+D4', 16)].join(' ') },
      { inst: 'bell', vol: 0.26, seq: [
        bar('E5', r('.', 7), 'C5', r('.', 7)),
        bar('A4', r('.', 15)),
        bar('G4', r('.', 7), 'E4', r('.', 7)),
        bar('D5', r('.', 7), 'B4', r('.', 7)),
      ].join(' ') },
    ],
  },
  // Frostvault: crystalline arpeggios
  ice: {
    bpm: 96,
    tracks: [
      { inst: 'arp', vol: 0.16, seq: [
        'B4 D5 F#5 B5 F#5 D5 B4 D5 F#5 B5 F#5 D5 B4 D5 F#5 D5',
        'G4 B4 D5 G5 D5 B4 G4 B4 D5 G5 D5 B4 G4 B4 D5 B4',
        'D4 F#4 A4 D5 A4 F#4 D4 F#4 A4 D5 A4 F#4 D4 F#4 A4 F#4',
        'A4 C#5 E5 A5 E5 C#5 A4 C#5 E5 A5 E5 C#5 A4 C#5 E5 C#5',
      ].join(' ') },
      { inst: 'pad', vol: 0.16, seq: [hold('B2+D3+F#3', 16), hold('G2+B2+D3', 16), hold('D3+F#3+A3', 16), hold('A2+C#3+E3', 16)].join(' ') },
      { inst: 'drone', vol: 0.3, seq: [hold('B1', 16), hold('G1', 16), hold('D2', 16), hold('A1', 16)].join(' ') },
      { inst: 'bell', vol: 0.18, seq: [bar(r('.', 8), 'F#6', r('.', 7)), r('.', 16), bar(r('.', 8), 'A5', r('.', 7)), r('.', 16)].join(' ') },
    ],
  },
  // Magma Tunnels: drums in the deep and a crawling low line
  magma: {
    bpm: 100,
    tracks: [
      { inst: 'kick', vol: 0.4, seq: r('x . . .', 4) },
      { inst: 'tom', vol: 0.3, seq: bar('x . . x . . x . x . . x . . x .') },
      { inst: 'drone', vol: 0.4, seq: hold('C2', 32) },
      { inst: 'lead', vol: 0.12, seq: [bar(hold('C3', 4), hold('Db3', 4), hold('C3', 8)), bar(hold('G2', 4), hold('Ab2', 4), hold('G2', 6), '.', '.')].join(' ') },
    ],
  },
  // Thornwood: a wooden, living pulse
  hive: {
    bpm: 104,
    tracks: [
      { inst: 'pluck', vol: 0.26, seq: [
        'D4 . A4 . C5 . A4 . E4 . A4 . C5 . A4 .',
        'D4 . A4 . C5 . A4 . F4 . A4 . C5 . B4 .',
      ].join(' ') },
      { inst: 'shaker', vol: 0.08, seq: r('x', 16) },
      { inst: 'bass', vol: 0.26, seq: [bar('D2 . . D2 . . D2', r('.', 9)), bar('C2 . . C2 . . C2', r('.', 9)), bar('G2 . . G2 . . G2', r('.', 9)), bar('A2 . . A2 . . A2', r('.', 9))].join(' ') },
      { inst: 'pad', vol: 0.14, seq: [hold('D3+F3+A3+C4', 16), hold('C3+E3+G3', 16), hold('G2+B2+D3', 16), hold('A2+C3+E3', 16)].join(' ') },
    ],
  },
  // Hollow Lab: machinery that has been running alone for a long time
  lab: {
    bpm: 118,
    tracks: [
      { inst: 'arp', vol: 0.13, seq: [
        'Eb4 Gb4 Bb4 Eb5 Bb4 Gb4 Eb4 Gb4 Bb4 Eb5 Bb4 Gb4 Eb4 Gb4 Bb4 Gb4',
        'B3 Eb4 F#4 B4 F#4 Eb4 B3 Eb4 F#4 B4 F#4 Eb4 B3 Eb4 F#4 Eb4',
      ].join(' ') },
      { inst: 'hat', vol: 0.1, seq: r('. x', 8) },
      { inst: 'kick', vol: 0.35, seq: bar('x', r('.', 7), 'x', r('.', 7)) },
      { inst: 'snare', vol: 0.18, seq: bar(r('.', 4), 'x', r('.', 7), 'x', '.', '.', '.') },
      { inst: 'bass', vol: 0.28, seq: [bar('Eb2 . Eb2 . . . Eb2 . Eb2 . . . F#2 . . .'), bar('B1 . B1 . . . B1 . B1 . . . Db2 . . .')].join(' ') },
    ],
  },
  // HOLLOW BRIM: driving and sharp
  boss: {
    bpm: 132,
    tracks: [
      { inst: 'bass', vol: 0.34, seq: 'E2 . E2 E2 . G2 . E2 D2 . E2 . B1 . C2 D2' },
      { inst: 'kick', vol: 0.45, seq: r('x . . .', 4) },
      { inst: 'hat', vol: 0.12, seq: r('. . x .', 4) },
      { inst: 'snare', vol: 0.22, seq: bar(r('.', 4), 'x', r('.', 7), 'x', '.', '.', '.') },
      { inst: 'lead', vol: 0.12, seq: [
        bar(hold('E4', 4), hold('G4', 4), hold('A4', 2), hold('B4', 6)),
        bar(hold('D5', 4), hold('B4', 4), hold('A4', 2), hold('G4', 2), hold('A4', 4)),
        bar(hold('E4', 4), hold('G4', 4), hold('A4', 2), hold('B4', 2), hold('D5', 4)),
        bar(hold('E5', 4), hold('D5', 2), hold('B4', 2), hold('A4', 2), hold('G4', 2), hold('F#4', 4)),
      ].join(' ') },
      { inst: 'pad', vol: 0.12, seq: [hold('E3+B3', 16), hold('C3+G3', 16), hold('A2+E3', 16), hold('B2+F#3', 16)].join(' ') },
    ],
  },
  // THORNHEART: toms and a choir, something enormous and alive
  boss2: {
    bpm: 124,
    tracks: [
      { inst: 'tom', vol: 0.34, seq: 'x . . x . . x . x . x . x . . .' },
      { inst: 'kick', vol: 0.42, seq: 'x . . . . . x . x . . . . . . .' },
      { inst: 'bass', vol: 0.32, seq: [bar('F#2 . . F#2 . . F#2 . E2 . . E2 . . D2 .'), bar('C#2 . . C#2 . . C#2 . D2 . . D2 . . E2 .')].join(' ') },
      { inst: 'choir', vol: 0.22, seq: [hold('F#3+A3+C#4', 16), hold('D3+F#3+A3', 16), hold('E3+G#3+B3', 16), hold('C#3+E#3+G#3', 16)].join(' ') },
      { inst: 'bell', vol: 0.16, seq: [
        bar('C#6', r('.', 3), 'A5', r('.', 3), 'F#5', r('.', 7)),
        bar('D6', r('.', 3), 'A5', r('.', 3), 'E5', r('.', 7)),
        bar('C#6', r('.', 3), 'A5', r('.', 3), 'F#5', r('.', 7)),
        bar('C#6', '.', 'B5', '.', 'A5', '.', 'G#5', r('.', 9)),
      ].join(' ') },
    ],
  },
  // the end: warm, and finally a major key
  ending: {
    bpm: 76,
    tracks: [
      { inst: 'pad', vol: 0.2, seq: [hold('D3+F#3+A3', 16), hold('A2+C#3+E3', 16), hold('B2+D3+F#3', 16), hold('G2+B2+D3', 16)].join(' ') },
      { inst: 'pluck', vol: 0.2, seq: [
        'D4 . A4 . D5 . F#5 . A5 . F#5 . D5 . A4 .',
        'C#4 . E4 . A4 . C#5 . E5 . C#5 . A4 . E4 .',
        'B3 . F#4 . B4 . D5 . F#5 . D5 . B4 . F#4 .',
        'G3 . D4 . G4 . B4 . D5 . B4 . G4 . D4 .',
      ].join(' ') },
      { inst: 'bell', vol: 0.28, seq: [
        bar(hold('F#5', 4), hold('E5', 2), hold('D5', 6), r('.', 4)),
        bar(hold('E5', 4), hold('C#5', 2), hold('A4', 6), r('.', 4)),
        bar(hold('D5', 4), hold('B4', 2), hold('F#4', 6), r('.', 4)),
        bar(hold('G4', 4), hold('A4', 4), hold('D5', 8)),
      ].join(' ') },
      { inst: 'drone', vol: 0.3, seq: [hold('D2', 16), hold('A1', 16), hold('B1', 16), hold('G1', 16)].join(' ') },
    ],
  },
};
// The Circle, before the duel: just a held breath
SONGS.arena = {
  bpm: 60,
  tracks: [
    { inst: 'drone', vol: 0.45, seq: hold('E1', 32) },
    { inst: 'drone', vol: 0.25, seq: hold('B1', 32) },
    { inst: 'bell', vol: 0.14, seq: bar(r('.', 16), 'G5', r('.', 15)) },
  ],
};

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freq(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 0;
  let semi = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = 12 * (parseInt(m[3], 10) + 1) + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function compile(song) {
  return song.tracks.map((t) => {
    const toks = t.seq.trim().split(/\s+/);
    const events = toks.map((tok, i) => {
      if (tok === '.' || tok === '-') return null;
      let len = 1;
      while (toks[(i + len) % toks.length] === '-' && len < toks.length) len++;
      if (tok === 'x') return { hit: true, len };
      return { notes: tok.split('+').map(freq).filter(Boolean), len };
    });
    return { inst: t.inst, vol: t.vol, events };
  });
}

class Music {
  constructor() {
    this.cur = null;
    this.name = null;
    this.bus = null;
    this.delay = null;
  }

  ensure() {
    const a = audioParts();
    if (!a) return null;
    if (!this.bus) {
      const { ctx, musicBus, verbIn } = a;
      this.bus = ctx.createGain();
      this.bus.gain.value = 0.9;
      this.bus.connect(musicBus);
      this.delay = ctx.createDelay(1.0);
      this.delay.delayTime.value = 0.34;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const wet = ctx.createGain(); wet.gain.value = 0.3;
      this.delay.connect(fb); fb.connect(this.delay);
      this.delay.connect(wet); wet.connect(this.bus);
      this.verb = ctx.createGain(); this.verb.gain.value = 0.35;
      this.verb.connect(verbIn);
    }
    return a;
  }

  play(name) {
    if (name === this.name) return;
    const a = this.ensure();
    this.name = name;
    if (!a) return;
    const { ctx } = a;
    const old = this.cur;
    if (old) {
      old.gain.gain.cancelScheduledValues(ctx.currentTime);
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      old.dying = true;
      setTimeout(() => { try { old.gain.disconnect(); } catch (e) {} }, 4000);
    }
    this.cur = null;
    const song = name && SONGS[name];
    if (!song) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.bus);
    gain.gain.setTargetAtTime(1, ctx.currentTime + 0.2, 0.8);
    this.cur = { song, tracks: song.compiled || (song.compiled = compile(song)), gain, step: 0, nextT: ctx.currentTime + 0.25 };
  }

  duck(seconds) {
    const a = audioParts();
    if (!a || !this.bus) return;
    const t = a.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0.15, t, 0.08);
    this.bus.gain.setTargetAtTime(0.9, t + seconds, 0.6);
  }

  tick() {
    const cur = this.cur;
    const a = audioParts();
    if (!cur || !a) return;
    const { ctx } = a;
    const stepDur = 60 / cur.song.bpm / 4;
    if (cur.nextT < ctx.currentTime - 0.5) cur.nextT = ctx.currentTime + 0.05;
    while (cur.nextT < ctx.currentTime + 0.25) {
      for (const tr of cur.tracks) {
        const ev = tr.events[cur.step % tr.events.length];
        if (ev) this.voice(a, tr.inst, ev, cur.nextT, ev.len * stepDur, tr.vol, cur.gain);
      }
      cur.nextT += stepDur;
      cur.step++;
    }
  }

  voice(a, inst, ev, t, dur, vol, out) {
    const { ctx, noiseBuf } = a;
    try {
      const env = (g, atk, peak, rel, hold = 0) => {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + atk);
        if (hold > 0) g.gain.setValueAtTime(peak, t + atk + hold);
        g.gain.exponentialRampToValueAtTime(0.0001, t + atk + hold + rel);
        return t + atk + hold + rel + 0.05;
      };
      const osc = (type, f, detune = 0) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = detune;
        return o;
      };
      const noiseSrc = () => {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        return s;
      };
      if (inst === 'bass') {
        for (const f of ev.notes) {
          const o1 = osc('sawtooth', f), o2 = osc('square', f / 2);
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
          lp.frequency.setValueAtTime(800, t); lp.frequency.exponentialRampToValueAtTime(140, t + 0.2);
          const g = ctx.createGain();
          const end = env(g, 0.006, vol, Math.min(0.5, dur + 0.05));
          o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
          o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
        }
      } else if (inst === 'pad' || inst === 'choir') {
        for (const f of ev.notes) {
          const g = ctx.createGain();
          const end = env(g, 0.5, vol / ev.notes.length, 1.2, Math.max(0, dur - 0.5));
          const lp = ctx.createBiquadFilter(); lp.type = inst === 'choir' ? 'bandpass' : 'lowpass';
          lp.frequency.value = inst === 'choir' ? 900 : 900; lp.Q.value = inst === 'choir' ? 1.4 : 0.6;
          const oscs = inst === 'choir' ? [osc('sawtooth', f, -6), osc('sawtooth', f, 6), osc('triangle', f * 2, 0)] : [osc('sawtooth', f, -8), osc('sawtooth', f, 8), osc('triangle', f / 2, 0)];
          if (inst === 'choir') {
            const lfo = osc('sine', 5.2); const lg = ctx.createGain(); lg.gain.value = 9;
            lfo.connect(lg); for (const o of oscs) lg.connect(o.detune);
            lfo.start(t); lfo.stop(end);
          }
          for (const o of oscs) { o.connect(lp); o.start(t); o.stop(end); }
          lp.connect(g); g.connect(out); g.connect(this.verb);
        }
      } else if (inst === 'drone') {
        for (const f of ev.notes) {
          const g = ctx.createGain();
          const end = env(g, 1.0, vol, 1.5, Math.max(0, dur - 1));
          const o1 = osc('sine', f), o2 = osc('sawtooth', f, 4);
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
          o1.connect(g); o2.connect(lp); lp.connect(g); g.connect(out);
          o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
        }
      } else if (inst === 'bell') {
        for (const f of ev.notes) {
          for (const [m, v, d] of [[1, 1, 2.6], [2.76, 0.35, 1.2], [5.4, 0.12, 0.6]]) {
            const o = osc('sine', f * m);
            const g = ctx.createGain();
            const end = env(g, 0.004, vol * v, d);
            o.connect(g); g.connect(out); g.connect(this.delay); g.connect(this.verb);
            o.start(t); o.stop(end);
          }
        }
      } else if (inst === 'pluck') {
        for (const f of ev.notes) {
          const o = osc('triangle', f), o2 = osc('sine', f * 4);
          const g = ctx.createGain(), g2 = ctx.createGain();
          const end = env(g, 0.004, vol, 0.45);
          env(g2, 0.002, vol * 0.25, 0.08);
          o.connect(g); o2.connect(g2); g.connect(out); g2.connect(out); g.connect(this.delay);
          o.start(t); o2.start(t); o.stop(end); o2.stop(end);
        }
      } else if (inst === 'arp') {
        for (const f of ev.notes) {
          const o = osc('square', f);
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
          const g = ctx.createGain();
          const end = env(g, 0.004, vol, 0.2);
          o.connect(lp); lp.connect(g); g.connect(out); g.connect(this.delay);
          o.start(t); o.stop(end);
        }
      } else if (inst === 'lead') {
        for (const f of ev.notes) {
          const o = osc('sawtooth', f), o2 = osc('sawtooth', f, 7);
          const lfo = osc('sine', 5.5); const lg = ctx.createGain(); lg.gain.value = 12;
          lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
          const g = ctx.createGain();
          const end = env(g, 0.02, vol, 0.15, Math.max(0, dur - 0.05));
          o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out); g.connect(this.verb);
          o.start(t); o2.start(t); lfo.start(t); o.stop(end); o2.stop(end); lfo.stop(end);
        }
      } else if (inst === 'kick') {
        const o = osc('sine', 130);
        o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
        const g = ctx.createGain();
        const end = env(g, 0.004, vol, 0.3);
        o.connect(g); g.connect(out); o.start(t); o.stop(end);
      } else if (inst === 'tom') {
        const o = osc('sine', 170);
        o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.3);
        const g = ctx.createGain();
        const end = env(g, 0.004, vol, 0.38);
        o.connect(g); g.connect(out); g.connect(this.verb); o.start(t); o.stop(end);
      } else if (inst === 'snare' || inst === 'hat' || inst === 'shaker') {
        const s = noiseSrc();
        const f = ctx.createBiquadFilter();
        f.type = inst === 'snare' ? 'bandpass' : 'highpass';
        f.frequency.value = inst === 'snare' ? 1800 : inst === 'hat' ? 7000 : 5200;
        f.Q.value = inst === 'snare' ? 0.8 : 0.5;
        const g = ctx.createGain();
        const end = env(g, 0.002, vol, inst === 'snare' ? 0.16 : inst === 'hat' ? 0.04 : 0.06);
        s.connect(f); f.connect(g); g.connect(out);
        s.start(t, Math.random()); s.stop(end);
        if (inst === 'snare') {
          const o = osc('triangle', 190);
          const g2 = ctx.createGain();
          env(g2, 0.002, vol * 0.5, 0.08);
          o.connect(g2); g2.connect(out); o.start(t); o.stop(t + 0.12);
        }
      }
    } catch (e) { /* a dropped note is fine */ }
  }
}

export const music = new Music();
