// How each place is photographed: exposure, film grade, fog, bloom, lens streaks, god rays.
// The post pass eases between looks when you walk from one room into the next.

import { clamp, lerp } from './util.js';
import { VIEW_W, VIEW_H } from './art.js';

const L = (o) => ({
  ambient: [0.92, 0.92, 0.92], fog: [0.06, 0.8, 0, 0.004], fogCol: [0.5, 0.45, 0.4],
  bloomThresh: 0.72, bloomK: 0.5, streakK: 0.12, streakTint: [0.55, 0.72, 1], contrast: 0.22,
  raysK: 0, raysTint: [1, 0.9, 0.75], exposure: 1.02, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
  sat: 1.04, shadowTint: [0, 0, 0], highTint: [0, 0, 0], vig: 0.32, ca: 0.0014, grain: 0.045, heat: 0,
  ...o,
});

export const LOOKS = {
  sand: L({
    ambient: [0.9, 0.87, 0.84], fog: [0.07, 0.9, 0, 0.004], fogCol: [0.62, 0.46, 0.3],
    raysK: 0.55, raysTint: [1, 0.86, 0.62], gain: [1.03, 1, 0.93], lift: [0.004, 0.006, 0.016],
    shadowTint: [-0.008, 0, 0.018], highTint: [0.022, 0.01, -0.012], sat: 1.07,
  }),
  ruin: L({
    ambient: [0.86, 0.88, 0.92], fog: [0.07, 0.9, 0, 0.003], fogCol: [0.52, 0.58, 0.68],
    bloomK: 0.5, bloomThresh: 0.76, raysK: 0.45, raysTint: [0.85, 0.92, 1], gain: [0.98, 1, 1.04], sat: 0.92,
    shadowTint: [0, 0.004, 0.016], highTint: [0.01, 0.012, 0.018],
  }),
  ice: L({
    ambient: [0.84, 0.9, 0.98], fog: [0.1, 1.0, 0, 0.006], fogCol: [0.55, 0.72, 0.9],
    bloomK: 0.62, streakK: 0.16, gain: [0.97, 1.01, 1.06], sat: 0.96, lift: [0, 0.008, 0.02],
    shadowTint: [-0.004, 0.006, 0.024], highTint: [0.012, 0.016, 0.02],
  }),
  magma: L({
    ambient: [0.8, 0.76, 0.74], fog: [0.08, 0.9, 0, 0.012], fogCol: [0.8, 0.32, 0.12],
    bloomThresh: 0.7, bloomK: 0.6, exposure: 0.96, streakK: 0.18, streakTint: [1, 0.62, 0.4],
    gain: [1.05, 0.98, 0.9], sat: 1.12, shadowTint: [0.02, -0.004, -0.01], highTint: [0.03, 0.01, -0.02], heat: 0.9,
  }),
  hive: L({
    ambient: [0.86, 0.9, 0.84], fog: [0.08, 0.9, 0, 0.005], fogCol: [0.42, 0.62, 0.4],
    raysK: 0.5, raysTint: [0.86, 1, 0.78], gain: [0.98, 1.02, 0.96], sat: 1.02,
    shadowTint: [-0.006, 0.01, 0.004], highTint: [0.012, 0.018, 0.0],
  }),
  lab: L({
    ambient: [0.84, 0.82, 0.92], fog: [0.07, 1.0, 0, 0.003], fogCol: [0.42, 0.36, 0.7],
    bloomK: 0.55, streakK: 0.3, streakTint: [0.6, 0.62, 1], gain: [0.98, 0.98, 1.05], sat: 1.05,
    shadowTint: [0.008, 0, 0.026], highTint: [0.0, 0.014, 0.02],
  }),
  arena: L({
    ambient: [0.84, 0.82, 0.92], fog: [0.08, 1.0, 0, 0.003], fogCol: [0.45, 0.36, 0.75],
    bloomK: 0.55, streakK: 0.24, streakTint: [0.66, 0.6, 1], gain: [1, 0.97, 1.04], sat: 1.04,
    shadowTint: [0.01, 0, 0.03], highTint: [0.02, 0.008, 0.01],
  }),
  // the opening movie, shot by shot
  space: L({ ambient: [1, 1, 1], fog: [0, 0, 0, 0], bloomThresh: 0.8, bloomK: 0.9, streakK: 0.42, streakTint: [0.5, 0.7, 1], vig: 0.42, ca: 0.0022, grain: 0.05, sat: 1.08 }),
  descent: L({ ambient: [1, 1, 1], fog: [0, 0, 0, 0], bloomThresh: 0.74, bloomK: 0.7, streakK: 0.22, streakTint: [1, 0.8, 0.6], gain: [1.03, 1, 0.95], vig: 0.36, grain: 0.055 }),
  surface: L({ ambient: [1, 1, 1], fog: [0, 0, 0, 0], bloomThresh: 0.72, bloomK: 0.4, streakK: 0.1, sat: 0.9, vig: 0.4, ca: 0.002, grain: 0.075 }),
  overhead: L({ ambient: [1, 1, 1], fog: [0, 0, 0, 0], bloomThresh: 0.72, bloomK: 0.4, streakK: 0.1, sat: 0.9, vig: 0.46, grain: 0.075 }),
};

// surface materials, by the id painted into the normal map
//   spec strength, shininess, detail amount, detail bump   |   detail channel weights
const MATS = [
  [[0, 16, 0, 0], [0, 0, 0, 0]],
  [[0.14, 12, 0.34, 0.55], [0.45, 0.15, 0.25, 0.15]],
  [[0.22, 20, 0.28, 0.5], [0.3, 0.35, 0.15, 0.2]],
  [[1.1, 64, 0.2, 0.32], [0.2, 0.5, 0.05, 0.25]],
  [[0.28, 18, 0.4, 0.7], [0.35, 0.2, 0.35, 0.1]],
  [[0.35, 26, 0.32, 0.5], [0.3, 0.05, 0.45, 0.2]],
  [[0.85, 48, 0.2, 0.25], [0.5, 0.4, 0.0, 0.1]],
  [[0.85, 40, 0, 0], [0, 0, 0, 0]],
];
export const MAT_ARR = new Float32Array(MATS.flatMap((m) => m[0]));
export const MATW_ARR = new Float32Array(MATS.flatMap((m) => m[1]));

// the look currently on screen, eased toward whatever the room asks for
export function makeLookState() {
  return JSON.parse(JSON.stringify(LOOKS.sand));
}

export function easeLook(cur, target, k) {
  for (const key in target) {
    const t = target[key];
    if (Array.isArray(t)) for (let i = 0; i < t.length; i++) cur[key][i] = lerp(cur[key][i], t[i], k);
    else cur[key] = lerp(cur[key], t, k);
  }
}

const COLOR_CACHE = new Map();
export function parseColor(s) {
  if (Array.isArray(s)) return s;
  let c = COLOR_CACHE.get(s);
  if (!c) {
    const p = s.split(',').map((v) => parseFloat(v) / 255);
    c = [p[0] || 1, p[1] || 1, p[2] || 1];
    COLOR_CACHE.set(s, c);
  }
  return c;
}

// pack the brightest lights near the screen into the shader's arrays
export function packLights(list, cam, maxl, outP, outC) {
  const cands = [];
  for (const Lt of list) {
    const sx = (Lt.x - cam.C.x - cam.fx) * cam.zoom + cam.fx;
    const sy = (Lt.y - cam.C.y - cam.fy) * cam.zoom + cam.fy;
    const r = Lt.r * cam.zoom;
    if (sx < -r || sx > VIEW_W + r || sy < -r || sy > VIEW_H + r) continue;
    const dx = clamp(sx, 0, VIEW_W) - sx, dy = clamp(sy, 0, VIEW_H) - sy;
    const off = Math.hypot(dx, dy) / r;
    cands.push({ sx, sy, r, z: Lt.z ?? 70, col: parseColor(Lt.col ?? Lt.color), a: Lt.a, score: Lt.a * Math.sqrt(r) * (1 - off) });
  }
  cands.sort((a, b) => b.score - a.score);
  const n = Math.min(maxl, cands.length);
  for (let i = 0; i < n; i++) {
    const c = cands[i];
    outP[i * 4] = c.sx; outP[i * 4 + 1] = c.sy; outP[i * 4 + 2] = c.r; outP[i * 4 + 3] = c.z;
    outC[i * 4] = c.col[0]; outC[i * 4 + 1] = c.col[1]; outC[i * 4 + 2] = c.col[2]; outC[i * 4 + 3] = c.a * 1.4;
  }
  return n;
}

export function screenOf(cam, x, y) {
  return { x: (x - cam.C.x - cam.fx) * cam.zoom + cam.fx, y: (y - cam.C.y - cam.fy) * cam.zoom + cam.fy };
}
