// Seamless textures for the lighting pass, generated once at load as raw RGBA bytes.
//   detail (512²): R fine grain · G crack network · B pits and pores · A mid-size blotches
//   noise  (256²): R,G smooth warp vectors · B large fog · A small fog

import { mulberry32 } from './util.js';

// value noise on a lattice that wraps every `period` cells
function tileNoise(period, seed) {
  const rng = mulberry32(seed);
  const v = new Float32Array(period * period);
  for (let i = 0; i < v.length; i++) v[i] = rng();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = v[y0 * period + x0], b = v[y0 * period + x1], c = v[y1 * period + x0], d = v[y1 * period + x1];
    const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}

// fractal noise where every octave still wraps at the texture edge
function tileFbm(size, basePeriod, octaves, seed) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push({ n: tileNoise(basePeriod << o, seed + o * 97), p: basePeriod << o, amp: Math.pow(0.5, o) });
  const norm = layers.reduce((s, l) => s + l.amp, 0);
  return (px, py) => {
    let s = 0;
    for (const l of layers) s += l.n((px / size) * l.p, (py / size) * l.p) * l.amp;
    return s / norm;
  };
}

// cellular noise on a wrapped grid: distance to nearest and second-nearest feature point
function tileWorley(size, cells, seed) {
  const rng = mulberry32(seed);
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) { pts[i * 2] = rng(); pts[i * 2 + 1] = rng(); }
  const cs = size / cells;
  return (px, py) => {
    const cx = Math.floor(px / cs), cy = Math.floor(py / cs);
    let f1 = 1e9, f2 = 1e9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox, gy = cy + oy;
        const wx = ((gx % cells) + cells) % cells, wy = ((gy % cells) + cells) % cells;
        const fx = (gx + pts[(wy * cells + wx) * 2]) * cs, fy = (gy + pts[(wy * cells + wx) * 2 + 1]) * cs;
        const d = Math.hypot(px - fx, py - fy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
    }
    return { f1: f1 / cs, f2: f2 / cs };
  };
}

export function makeDetailTexture(size = 512) {
  const out = new Uint8Array(size * size * 4);
  const grain = tileFbm(size, 64, 3, 11);
  const crackA = tileWorley(size, 10, 23);
  const crackB = tileWorley(size, 24, 37);
  const pits = tileWorley(size, 40, 51);
  const blot = tileFbm(size, 4, 4, 71);
  const rng = mulberry32(5);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const g = grain(x, y) * 0.75 + rng() * 0.25;
      const a = crackA(x, y), b = crackB(x, y);
      const edgeA = Math.max(0, 1 - (a.f2 - a.f1) * 9);
      const edgeB = Math.max(0, 1 - (b.f2 - b.f1) * 12) * 0.6;
      const crack = 1 - Math.min(1, edgeA * edgeA + edgeB * edgeB);
      const p = pits(x, y);
      const pit = Math.min(1, p.f1 * 1.35);
      out[i] = g * 255;
      out[i + 1] = (0.2 + crack * 0.6) * 255;
      out[i + 2] = (0.25 + pit * 0.55) * 255;
      out[i + 3] = blot(x, y) * 255;
    }
  }
  return out;
}

export function makeNoiseTexture(size = 256) {
  const out = new Uint8Array(size * size * 4);
  const wa = tileFbm(size, 4, 3, 101);
  const wb = tileFbm(size, 4, 3, 131);
  const fogBig = tileFbm(size, 2, 4, 151);
  const fogSmall = tileFbm(size, 8, 3, 171);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      out[i] = wa(x, y) * 255;
      out[i + 1] = wb(x, y) * 255;
      const fb = fogBig(x, y);
      out[i + 2] = Math.min(1, Math.max(0, (fb - 0.28) * 1.9)) * 255;
      out[i + 3] = fogSmall(x, y) * 255;
    }
  }
  return out;
}
