// Small math + noise helpers shared by every module.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const sign = (v) => (v < 0 ? -1 : 1);
export const approach = (v, target, amt) => (v < target ? Math.min(v + amt, target) : Math.max(v - amt, target));
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise + fbm. Cheap enough to paint whole rooms at load.
export function makeNoise2D(seed = 1) {
  const rng = mulberry32(seed);
  const N = 256, M = N - 1;
  const vals = new Float32Array(N * N);
  for (let i = 0; i < vals.length; i++) vals[i] = rng();
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = xi & M, y0 = yi & M, x1 = (x0 + 1) & M, y1 = (y0 + 1) & M;
    const a = vals[y0 * N + x0], b = vals[y0 * N + x1], c = vals[y1 * N + x0], d = vals[y1 * N + x1];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * noise(x * f + i * 17.3, y * f - i * 9.1);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  }
  return { noise, fbm, rng };
}

// Separable box blur, in place. Two passes approximate a gaussian.
export function boxBlur(src, w, h, r, passes = 2) {
  const tmp = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    blurH(src, tmp, w, h, r);
    blurV(tmp, src, w, h, r);
  }
  return src;
}
function blurH(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[row + (i < 0 ? 0 : i >= w ? w - 1 : i)];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * inv;
      const ai = x + r + 1, si = x - r;
      acc += src[row + (ai >= w ? w - 1 : ai)] - src[row + (si < 0 ? 0 : si)];
    }
  }
}
function blurV(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[(i < 0 ? 0 : i >= h ? h - 1 : i) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv;
      const ai = y + r + 1, si = y - r;
      acc += src[(ai >= h ? h - 1 : ai) * w + x] - src[(si < 0 ? 0 : si) * w + x];
    }
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
