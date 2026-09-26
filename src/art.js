// Procedural painting. Every room is painted once at load into offscreen canvases:
// parallax backdrops, the rock itself (organic edges, black interiors like the trailer),
// and a foreground silhouette layer.

import { TILE, T } from './level.js';
import { makeCanvas, boxBlur, smoothstep, lerp, clamp, mulberry32 } from './util.js';

export const VIEW_W = 1280, VIEW_H = 720;

export const PALETTES = {
  sand: {
    base: '#0a0706', rock: [96, 66, 44], rockHi: [184, 136, 88], rim: [240, 196, 132], deep: [6, 4, 4], ceil: [34, 22, 16],
    farDark: [18, 11, 8], farLight: [120, 84, 54], haze: [150, 104, 62], glow: [255, 214, 150],
  },
  ruin: {
    base: '#07080b', rock: [72, 78, 90], rockHi: [146, 156, 172], rim: [214, 226, 240], deep: [5, 6, 8], ceil: [26, 30, 36],
    farDark: [10, 12, 17], farLight: [74, 84, 100], haze: [96, 110, 132], glow: [200, 225, 255],
  },
  arena: {
    base: '#06050c', rock: [52, 46, 84], rockHi: [110, 100, 158], rim: [150, 185, 255], deep: [4, 3, 8], ceil: [22, 18, 38],
    farDark: [7, 6, 16], farLight: [52, 40, 96], haze: [80, 60, 140], glow: [150, 170, 255],
  },
  ice: {
    base: '#04070c', rock: [64, 96, 128], rockHi: [168, 206, 232], rim: [226, 246, 255], deep: [3, 5, 9], ceil: [18, 30, 46],
    farDark: [5, 10, 18], farLight: [52, 90, 128], haze: [120, 170, 214], glow: [170, 215, 255],
  },
  magma: {
    base: '#090302', rock: [66, 32, 24], rockHi: [132, 64, 40], rim: [255, 170, 96], deep: [5, 2, 2], ceil: [28, 11, 8],
    farDark: [14, 5, 3], farLight: [96, 36, 18], haze: [255, 110, 40], glow: [255, 130, 50],
  },
  hive: {
    base: '#040703', rock: [50, 66, 32], rockHi: [118, 146, 66], rim: [206, 236, 138], deep: [3, 5, 2], ceil: [18, 26, 10],
    farDark: [7, 12, 5], farLight: [54, 84, 32], haze: [130, 180, 80], glow: [210, 255, 150],
  },
  lab: {
    base: '#06050c', rock: [46, 40, 72], rockHi: [104, 94, 150], rim: [176, 166, 255], deep: [4, 3, 8], ceil: [18, 14, 30],
    farDark: [7, 5, 15], farLight: [48, 38, 88], haze: [120, 90, 210], glow: [140, 120, 255],
  },
};

const S = 2; // paint resolution: one cell = 2 world pixels

export function layerSize(room, f) {
  return {
    w: VIEW_W + Math.max(0, room.pw - VIEW_W) * f,
    h: VIEW_H + Math.max(0, room.ph - VIEW_H) * f,
  };
}

// Where a parallax layer sits in world space for a given camera.
export function layerOrigin(room, f, camX, camY) {
  return {
    x: room.x + (camX - room.x) * (1 - f),
    y: room.y + (camY - room.y) * (1 - f),
  };
}

export function paintRoom(world, room, nz) {
  const out = { layers: [], terrain: null, glow: null, fg: null, surfaces: [] };
  const far = blurCanvas(paintFar(room, nz, 0.28), 1);
  out.layers.push({ canvas: far, f: 0.28, s: S });
  const mid = paintMid(room, nz, 0.58);
  out.layers.push({ canvas: mid, f: 0.58, s: S });
  const t = paintTerrain(world, room, nz);
  out.terrain = t.canvas;
  out.normal = t.normal;
  out.glow = t.glow;
  out.surfaces = t.surfaces;
  out.lights = staticLights(world, room);
  out.fg = { canvas: blurCanvas(paintForeground(room, nz, 1.18), 2), f: 1.18, s: S };
  return out;
}

// ---------------------------------------------------------------- terrain

export const MATERIAL = { sand: 1, ruin: 2, ice: 3, magma: 4, hive: 5, lab: 6, arena: 7 };

function paintTerrain(world, room, nz) {
  const W = room.pw / S, H = room.ph / S, cpt = TILE / S;
  const pal = PALETTES[room.theme];
  const solid = new Float32Array(W * H);
  const flat = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const ty = room.ty + Math.floor(y / cpt);
    for (let x = 0; x < W; x++) {
      const tx = room.tx + Math.floor(x / cpt);
      const t = world.tile(tx, ty);
      const s = t === T.SOLID ? 1 : 0;
      const i = y * W + x;
      solid[i] = s;
      const above = world.tile(tx, ty - 1), below = world.tile(tx, ty + 1);
      flat[i] = (s && above !== T.SOLID) || (!s && below === T.SOLID) ? 1 : 0;
    }
  }
  boxBlur(flat, W, H, 3, 1);
  const m = solid.slice();
  boxBlur(m, W, H, 9, 2);
  const ox = room.x / S, oy = room.y / S;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wx = ox + x, wy = oy + y;
      const amp = lerp(0.36, 0.06, flat[i]);
      const n = (nz.fbm(wx * 0.034, wy * 0.034, 4) - 0.5) + (nz.noise(wx * 0.17, wy * 0.17) - 0.5) * 0.3;
      m[i] += n * amp;
    }
  }
  const alpha = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = smoothstep(0.45, 0.55, m[i]);
  const depth = alpha.slice();
  boxBlur(depth, W, H, 9, 2);
  const near = alpha.slice();
  boxBlur(near, W, H, 2, 1);
  const mid = alpha.slice();
  boxBlur(mid, W, H, 5, 1);

  // material value per cell: the pattern each kind of rock is made of
  const theme = room.theme;
  const kArr = new Float32Array(W * H);
  const emArr = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (alpha[i] < 0.004) continue;
      const wx = ox + x, wy = oy + y;
      const d = depth[i];
      const tex = nz.fbm(wx * 0.05 + 40, wy * 0.05 - 20, 3);
      const grain = nz.noise(wx * 0.45, wy * 0.45);
      const fine = nz.noise(wx * 0.9 + 13, wy * 0.9 - 7);
      let k;
      let em = 0;
      if (theme === 'sand') {
        const warp = nz.fbm(wx * 0.012, wy * 0.012, 2) * 14;
        const strata = 0.5 + 0.5 * Math.sin(wy * 0.23 + tex * 7.5 + warp);
        const band = 0.5 + 0.5 * Math.sin(wy * 0.061 + warp * 0.4);
        const pebble = fine > 0.84 ? (fine - 0.84) * 3 : 0;
        k = tex * 0.7 + strata * 0.22 + band * 0.12 + (grain - 0.5) * 0.22 + pebble;
      } else if (theme === 'ice') {
        const facet = Math.abs(nz.noise(wx * 0.045 + 3, wy * 0.045) * 2 - 1);
        const streak = 0.5 + 0.5 * Math.sin(wx * 0.09 + tex * 5);
        const bubble = fine > 0.9 ? 0.35 : 0;
        k = 0.25 + tex * 0.42 + (1 - facet) * 0.3 + streak * 0.08 + (grain > 0.93 ? 0.4 : 0) + bubble;
      } else if (theme === 'magma') {
        const cell = Math.abs(nz.noise(wx * 0.11, wy * 0.11) * 2 - 1);
        k = 0.18 + tex * 0.45 + (grain - 0.5) * 0.25 + (1 - cell) * 0.12;
        const v = Math.abs(nz.noise(wx * 0.05 + 9, wy * 0.05 - 4) - 0.5);
        const v2 = Math.abs(nz.noise(wx * 0.12 - 3, wy * 0.12 + 8) - 0.5);
        em = (smoothstep(0.035, 0.0, v) + smoothstep(0.018, 0.0, v2) * 0.55) * smoothstep(0.95, 0.6, d);
      } else if (theme === 'hive') {
        const cell = smoothstep(0.45, 0.75, nz.noise(wx * 0.07, wy * 0.07 + 20));
        const vein = smoothstep(0.03, 0.0, Math.abs(nz.noise(wx * 0.03 + 40, wy * 0.03) - 0.5));
        const moss = smoothstep(0.55, 0.8, nz.fbm(wx * 0.02 + 5, wy * 0.02, 3));
        k = 0.2 + tex * 0.42 + cell * 0.3 - vein * 0.25 + moss * 0.15;
        em = smoothstep(0.012, 0.0, Math.abs(nz.noise(wx * 0.021 + 70, wy * 0.021) - 0.5)) * 0.35 * smoothstep(0.9, 0.55, d);
      } else if (theme === 'lab') {
        const pw = 40, ph = 20;
        const bx = ((wx % pw) + pw) % pw, by = ((wy % ph) + ph) % ph;
        const seam = bx < 1.2 || by < 1.2 ? 1 : 0;
        const rivet = (Math.abs(bx - 4) < 1.2 && Math.abs(by - 4) < 1.2) || (Math.abs(bx - pw + 4) < 1.2 && Math.abs(by - 4) < 1.2) ? 1 : 0;
        const panel = nz.noise(Math.floor(wx / pw) * 1.7, Math.floor(wy / ph) * 2.3);
        const grime = smoothstep(0.5, 0.85, nz.fbm(wx * 0.03, wy * 0.06 - 9, 3));
        const scratch = Math.abs(Math.sin(wx * 0.9 + wy * 0.13 + panel * 30)) > 0.995 ? 0.25 : 0;
        k = 0.3 + panel * 0.3 + tex * 0.18 - seam * 0.3 + rivet * 0.5 - grime * 0.18 + scratch;
      } else {
        // dressed stone: blocks with mortar, chipped by noise
        const rowH = theme === 'arena' ? 22 : 15;
        const bw = theme === 'arena' ? 46 : 32;
        const row = Math.floor(wy / rowH);
        const bx = (wx + (row % 2) * bw * 0.5) % bw;
        const by = wy % rowH;
        const mortar = (by < 1.3 || bx < 1.3) ? 1 : 0;
        const chip = nz.noise(wx * 0.3 + 7, wy * 0.3) > 0.72 ? 1 : 0;
        const stain = smoothstep(0.6, 0.9, nz.fbm(wx * 0.05, wy * 0.012, 2)) * 0.2;
        k = 0.35 + tex * 0.55 + (grain - 0.5) * 0.14 - mortar * 0.34 * (1 - chip) + (nz.noise(row * 3.1, Math.floor((wx + (row % 2) * bw * 0.5) / bw) * 1.7) - 0.5) * 0.25 - stain;
        if (theme === 'arena') em = mortar * smoothstep(0.7, 0.9, nz.noise(wx * 0.02, wy * 0.02)) * 0.5 * smoothstep(0.9, 0.6, d);
      }
      kArr[i] = clamp(k, 0, 1);
      emArr[i] = em;
    }
  }

  const canvas = makeCanvas(W, H);
  const c = canvas.getContext('2d');
  const img = c.createImageData(W, H);
  const px = img.data;
  const ncanvas = makeCanvas(W, H);
  const nc = ncanvas.getContext('2d');
  const nimg = nc.createImageData(W, H);
  const npx = nimg.data;
  const matB = ((MATERIAL[theme] || 1) + 0.5) / 8 * 255;
  const H_at = (i) => depth[i] * 0.55 + mid[i] * 0.3 + near[i] * 0.15 + (kArr[i] - 0.5) * 0.045;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const a = alpha[i];
      if (a < 0.004) continue;
      const d = depth[i];
      const up = y > 2 ? near[i - 2 * W] : 1;
      const dn = y < H - 3 ? near[i + 2 * W] : 1;
      const ny = dn - up;
      const top = clamp(ny * 2.4, 0, 1);
      // broad surface orientation, so light falls on floors and ceilings sink into shadow
      const u6 = y >= 7 ? depth[i - 7 * W] : 1, d6 = y < H - 7 ? depth[i + 7 * W] : 1;
      const l6 = x >= 7 ? depth[i - 7] : 1, r6 = x < W - 7 ? depth[i + 7] : 1;
      const nyB = d6 - u6, nxB = r6 - l6;
      const floorL = clamp(nyB * 2.6, 0, 1);
      const ceilL = clamp(-nyB * 2.6, 0, 1);
      const wallL = clamp(Math.abs(nxB) * 2.2, 0, 1) * (nxB > 0 ? 1 : 0.7);
      const light = clamp(0.1 + floorL * 0.95 + wallL * 0.4 - ceilL * 0.08, 0.04, 1.05);
      const dark = smoothstep(0.55 + floorL * 0.1, 0.9 + floorL * 0.06, d);
      // crevices hold shadow: where the rock closes in around a surface
      const ao = 1 - smoothstep(0.62, 0.9, mid[i]) * (1 - top) * 0.3;
      const k = kArr[i];
      const hue = nz.fbm((ox + x) * 0.006 + 90, (oy + y) * 0.006, 2) - 0.5;
      let R = lerp(pal.rock[0], pal.rockHi[0], k) * light * ao * (1 + hue * 0.25);
      let G = lerp(pal.rock[1], pal.rockHi[1], k) * light * ao;
      let B = lerp(pal.rock[2], pal.rockHi[2], k) * light * ao * (1 - hue * 0.25);
      R = lerp(R, pal.rim[0], top * 0.55 * (0.4 + 0.6 * floorL));
      G = lerp(G, pal.rim[1], top * 0.55 * (0.4 + 0.6 * floorL));
      B = lerp(B, pal.rim[2], top * 0.55 * (0.4 + 0.6 * floorL));
      R = lerp(R, pal.ceil[0], ceilL * 0.3);
      G = lerp(G, pal.ceil[1], ceilL * 0.3);
      B = lerp(B, pal.ceil[2], ceilL * 0.3);
      R = lerp(R, pal.deep[0], dark);
      G = lerp(G, pal.deep[1], dark);
      B = lerp(B, pal.deep[2], dark);
      const em = emArr[i];
      if (em > 0) {
        const ec = theme === 'hive' ? [170, 255, 140] : theme === 'arena' ? [130, 170, 255] : [255, 120, 40];
        R = lerp(R, ec[0], Math.min(1, em * 0.9));
        G = lerp(G, ec[1], Math.min(1, em * 0.8));
        B = lerp(B, ec[2], Math.min(1, em * 0.7));
      }
      const o = i * 4;
      px[o] = R; px[o + 1] = G; px[o + 2] = B; px[o + 3] = a * 255;
      // which way this bit of rock faces, for the lights
      const xl = x > 0 ? i - 1 : i, xr = x < W - 1 ? i + 1 : i;
      const yu = y > 0 ? i - W : i, yd = y < H - 1 ? i + W : i;
      let nx = -(H_at(xr) - H_at(xl)) * 7.5;
      let nyy = -(H_at(yd) - H_at(yu)) * 7.5;
      const inv = 1 / Math.sqrt(nx * nx + nyy * nyy + 1);
      nx *= inv;
      nyy *= inv;
      npx[o] = (nx * 0.5 + 0.5) * 255;
      npx[o + 1] = (nyy * 0.5 + 0.5) * 255;
      npx[o + 2] = matB;
      npx[o + 3] = a * 255;
    }
  }
  c.putImageData(img, 0, 0);
  nc.putImageData(nimg, 0, 0);

  // Walkable surfaces, for grass, dust and glowing cracks.
  const surfaces = [];
  for (let x = 2; x < W - 2; x += 1) {
    for (let y = 2; y < H - 2; y++) {
      const i = y * W + x;
      if (alpha[i] >= 0.5 && alpha[i - W] < 0.5 && alpha[i - 2 * W] < 0.5) surfaces.push({ x, y });
    }
  }
  const rng = mulberry32(room.tx * 131 + room.ty * 7 + 3);
  // One-way ledges become slabs, in color and in the normal map.
  for (let ty = 0; ty < room.h; ty++) {
    for (let tx = 0; tx < room.w; tx++) {
      if (world.tile(room.tx + tx, room.ty + ty) !== T.ONEWAY) continue;
      const x0 = (tx * TILE) / S, y0 = (ty * TILE) / S;
      const leftEnd = world.tile(room.tx + tx - 1, room.ty + ty) !== T.ONEWAY;
      const rightEnd = world.tile(room.tx + tx + 1, room.ty + ty) !== T.ONEWAY;
      drawLedge(c, x0, y0, cpt, leftEnd, rightEnd, pal, rng, theme);
      const hgt = cpt * 0.62;
      const ng = nc.createLinearGradient(0, y0, 0, y0 + hgt);
      ng.addColorStop(0, `rgb(128,20,${matB | 0})`);
      ng.addColorStop(0.25, `rgb(128,110,${matB | 0})`);
      ng.addColorStop(1, `rgb(128,235,${matB | 0})`);
      nc.fillStyle = ng;
      nc.fillRect(x0 + (leftEnd ? 3 : 0), y0, cpt - (leftEnd ? 3 : 0) - (rightEnd ? 3 : 0), hgt * 0.85);
    }
  }
  // Grass, frost, moss and grit on the floors.
  const GROWTH = { sand: [0.22, 7, null], ruin: [0.08, 3, 'rgba(40,60,50,0.6)'], hive: [0.35, 9, null], ice: [0.12, 4, 'rgba(210,240,255,0.5)'] };
  if (GROWTH[theme]) {
    const [p, hMax, col] = GROWTH[theme];
    for (const s of surfaces) {
      if (rng() > p) continue;
      const h = 1.5 + rng() * hMax;
      const lean = (rng() - 0.5) * 3;
      c.strokeStyle = col || (theme === 'hive' ? `rgba(${60 + rng() * 60},${110 + rng() * 60},${40},0.8)` : `rgba(${40 + rng() * 40},${26 + rng() * 20},${16},${0.7})`);
      c.lineWidth = theme === 'hive' ? 1 : 0.7;
      c.beginPath();
      c.moveTo(s.x, s.y + 0.5);
      c.quadraticCurveTo(s.x + lean * 0.3, s.y - h * 0.6, s.x + lean, s.y - h);
      c.stroke();
    }
  }
  // frost crust on the ice floors
  if (theme === 'ice') {
    for (const s of surfaces) {
      if (rng() > 0.5) continue;
      c.fillStyle = `rgba(235,250,255,${0.25 + rng() * 0.4})`;
      c.fillRect(s.x, s.y, 1, 1 + rng() * 1.5);
    }
  }
  let glow = null;
  if (theme === 'arena') glow = paintCracks(W, H, surfaces, alpha, rng);
  if (theme === 'magma') glow = paintCracks(W, H, surfaces, alpha, rng, [255, 120, 40], 0.05);
  if (theme === 'lab') glow = paintStrips(W, H, surfaces, rng);
  return { canvas, glow, surfaces, normal: ncanvas };
}

function drawLedge(c, x0, y0, cpt, leftEnd, rightEnd, pal, rng, theme) {
  const h = cpt * 0.62;
  const inset = 3;
  const x1 = x0 + (leftEnd ? inset : 0), x2 = x0 + cpt - (rightEnd ? inset : 0);
  const g = c.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, `rgb(${pal.rockHi.join(',')})`);
  g.addColorStop(0.18, `rgb(${pal.rock.join(',')})`);
  g.addColorStop(1, `rgb(${pal.deep.join(',')})`);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x1, y0 + 1);
  c.lineTo(x2, y0 + 1);
  c.lineTo(x2 - (rightEnd ? 3 : 0), y0 + h * (0.7 + rng() * 0.3));
  c.lineTo(x1 + (leftEnd ? 3 : 0), y0 + h * (0.7 + rng() * 0.3));
  c.closePath();
  c.fill();
  c.fillStyle = `rgba(${pal.rim.join(',')},0.7)`;
  c.fillRect(x1, y0, x2 - x1, 1);
  if (theme === 'lab') {
    c.fillStyle = 'rgba(10,8,20,0.8)';
    for (let k = 2; k < x2 - x1 - 1; k += 3) c.fillRect(x1 + k, y0 + 2, 1, h * 0.5);
  }
  if (theme === 'ice') {
    c.fillStyle = 'rgba(200,235,255,0.35)';
    c.fillRect(x1, y0 + 1, x2 - x1, 2);
  }
  if (theme === 'arena') {
    c.fillStyle = 'rgba(110,160,255,0.55)';
    c.fillRect(x1, y0 + h * 0.55, x2 - x1, 0.8);
  }
}

function paintStrips(W, H, surfaces, rng) {
  const canvas = makeCanvas(W, H);
  const c = canvas.getContext('2d');
  c.shadowColor = 'rgba(150,120,255,1)';
  c.shadowBlur = 6;
  let run = 0;
  for (const s of surfaces) {
    run++;
    if (run % 60 < 38) {
      c.fillStyle = 'rgba(160,140,255,0.55)';
      c.fillRect(s.x, s.y + 3, 1, 1);
    }
  }
  return canvas;
}

function paintCracks(W, H, surfaces, alpha, rng, col = [110, 170, 255], freq = 0.02) {
  const canvas = makeCanvas(W, H);
  const c = canvas.getContext('2d');
  c.lineCap = 'round';
  c.shadowColor = `rgba(${col.join(',')},1)`;
  c.shadowBlur = 5;
  for (const s of surfaces) {
    if (rng() > freq) continue;
    let x = s.x, y = s.y + 1;
    const n = 2 + Math.floor(rng() * 4);
    c.strokeStyle = `rgba(${col[0] + rng() * 40},${col[1] + rng() * 50},${col[2]},${0.35 + rng() * 0.35})`;
    c.lineWidth = 0.5 + rng() * 0.6;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < n; k++) {
      x += (rng() - 0.5) * 18;
      y += rng() * 2.5 + 0.5;
      const i = Math.floor(y) * W + Math.floor(x);
      if (x < 0 || x >= W || y >= H || alpha[i] < 0.5) break;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  // a bright seam along the top of the floor
  c.shadowBlur = 4;
  for (const s of surfaces) {
    if (rng() > 0.5) continue;
    c.fillStyle = `rgba(${col[0] - 20},${col[1] - 20},${col[2]},${0.12 + rng() * 0.2})`;
    c.fillRect(s.x, s.y + 1, 1, 1);
  }
  return canvas;
}

// ---------------------------------------------------------------- far backdrop

function glowsFor(room) {
  if (room.id === 'A') return [{ u: 0.5, v: -0.02, r: 0.42, i: 1.3 }, { u: 0.5, v: 0.95, r: 0.35, i: 0.25 }];
  if (room.id === 'B') return [{ u: 0.18, v: 0.35, r: 0.28, i: 0.55 }, { u: 0.62, v: 0.25, r: 0.22, i: 0.5 }, { u: 0.9, v: 0.55, r: 0.2, i: 0.35 }];
  if (room.id === 'C') return [{ u: 0.5, v: 0.05, r: 0.3, i: 0.75 }, { u: 0.5, v: 0.48, r: 0.16, i: 0.55 }];
  if (room.id === 'E') return [{ u: 0.3, v: 0.25, r: 0.3, i: 0.5 }, { u: 0.78, v: 0.35, r: 0.22, i: 0.45 }];
  if (room.id === 'F') return [{ u: 0.3, v: 0.9, r: 0.35, i: 0.7 }, { u: 0.75, v: 0.95, r: 0.3, i: 0.6 }];
  if (room.id === 'G') return [{ u: 0.45, v: 0.15, r: 0.35, i: 0.6 }, { u: 0.85, v: 0.8, r: 0.2, i: 0.35 }];
  if (room.id === 'H') return [{ u: 0.6, v: 0.4, r: 0.3, i: 0.5 }, { u: 0.15, v: 0.8, r: 0.2, i: 0.25 }];
  return [{ u: 0.5, v: 0.42, r: 0.36, i: 0.55 }, { u: 0.12, v: 0.2, r: 0.2, i: 0.18 }, { u: 0.88, v: 0.2, r: 0.2, i: 0.18 }];
}

function paintFar(room, nz, f) {
  const { w, h } = layerSize(room, f);
  const W = Math.ceil(w / S), H = Math.ceil(h / S);
  const canvas = makeCanvas(W, H);
  const c = canvas.getContext('2d');
  const pal = PALETTES[room.theme];
  const img = c.createImageData(W, H);
  const px = img.data;
  const glows = glowsFor(room);
  const seed = room.tx * 3.7 + room.ty * 1.3;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const n1 = nz.fbm(x * 0.0065 + seed, y * 0.0065 - seed, 5);
      const n2 = nz.fbm(x * 0.026 + 11, y * 0.026 + seed, 4);
      const n3 = nz.noise(x * 0.14, y * 0.14);
      let val;
      let em = 0;
      if (room.theme === 'sand') {
        val = 0.14 + 0.62 * n2 + 0.08 * (n3 - 0.5);
        const hollow = smoothstep(0.5, 0.64, n1);
        val *= 1 - hollow * 0.8;
        val *= 0.8 + 0.2 * Math.sin(y * 0.085 + n2 * 9);
      } else if (room.theme === 'ruin') {
        const rowH = 18, bw = 38;
        const row = Math.floor(y / rowH);
        const bx = (x + (row % 2) * bw * 0.5) % bw;
        const mortar = y % rowH < 1 || bx < 1 ? 1 : 0;
        val = 0.22 + 0.4 * n2 + 0.06 * (n3 - 0.5) - mortar * 0.12;
        val *= 1 - smoothstep(0.56, 0.7, n1) * 0.5;
      } else if (room.theme === 'ice') {
        const facet = Math.abs(nz.noise(x * 0.02 + 5, y * 0.02) * 2 - 1);
        val = 0.16 + 0.42 * n2 + 0.25 * (1 - facet) * smoothstep(0.3, 0.7, n1);
        val *= 0.85 + 0.15 * Math.sin(x * 0.05 + n2 * 6);
      } else if (room.theme === 'magma') {
        val = 0.1 + 0.4 * n2 + 0.06 * (n3 - 0.5);
        val *= 1 - smoothstep(0.5, 0.66, n1) * 0.7;
        const vein = Math.abs(nz.noise(x * 0.018 + 2, y * 0.018 + 7) - 0.5);
        em = smoothstep(0.03, 0.0, vein) * (0.4 + 0.6 * v);
      } else if (room.theme === 'hive') {
        const cell = smoothstep(0.5, 0.8, nz.noise(x * 0.04, y * 0.04 + 9));
        val = 0.12 + 0.45 * n2 + cell * 0.18;
        val *= 1 - smoothstep(0.52, 0.66, n1) * 0.6;
      } else if (room.theme === 'lab') {
        const pw = 60, ph = 34;
        const seam = x % pw < 1 || y % ph < 1 ? 1 : 0;
        const panel = nz.noise(Math.floor(x / pw) * 1.3, Math.floor(y / ph) * 2.1);
        val = 0.16 + 0.22 * panel + 0.12 * n2 - seam * 0.1;
        em = (y % 136 < 2 && (x + y) % 90 < 60) ? 0.5 : 0;
      } else {
        val = 0.08 + 0.35 * nz.fbm(x * 0.012 + 3, y * 0.02, 5) + 0.05 * (n3 - 0.5);
        val *= 0.6 + 0.4 * smoothstep(0.3, 0.7, n1);
      }
      const vig = 0.45 + 0.55 * Math.sin(Math.PI * clamp(v * 1.08 - 0.04, 0, 1));
      val *= vig;
      let gl = 0;
      for (const g of glows) {
        const du = (u - g.u) * (w / h), dv = v - g.v;
        gl += g.i * Math.exp(-(du * du + dv * dv) / (2 * g.r * g.r));
      }
      val = clamp(val, 0, 1);
      let R = lerp(pal.farDark[0], pal.farLight[0], val) + pal.glow[0] * gl * 0.32;
      let G = lerp(pal.farDark[1], pal.farLight[1], val) + pal.glow[1] * gl * 0.32;
      let B = lerp(pal.farDark[2], pal.farLight[2], val) + pal.glow[2] * gl * 0.32;
      const hz = 0.1 + gl * 0.15;
      R = lerp(R, pal.haze[0], hz * val);
      G = lerp(G, pal.haze[1], hz * val);
      B = lerp(B, pal.haze[2], hz * val);
      if (em > 0) {
        R = lerp(R, pal.glow[0], em * 0.7);
        G = lerp(G, pal.glow[1], em * 0.7);
        B = lerp(B, pal.glow[2], em * 0.7);
      }
      const o = (y * W + x) * 4;
      px[o] = R; px[o + 1] = G; px[o + 2] = B; px[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  if (room.theme === 'ruin') paintRuinArchitecture(c, W, H, room);
  if (room.theme === 'arena') paintArenaRing(c, W, H);
  if (room.theme === 'ice') paintIceHall(c, W, H);
  if (room.theme === 'magma') paintLavaFalls(c, W, H);
  if (room.theme === 'hive') paintCanopy(c, W, H);
  if (room.theme === 'lab') paintMachinery(c, W, H);
  return canvas;
}

function paintIceHall(c, W, H) {
  const rng = mulberry32(31);
  // enormous crystal columns far back
  for (let i = 0; i < 9; i++) {
    const x = rng() * W, w = 20 + rng() * 50, top = rng() * H * 0.3, bot = H * (0.7 + rng() * 0.3);
    const gr = c.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(160,210,255,0.02)');
    gr.addColorStop(0.45, 'rgba(190,230,255,0.13)');
    gr.addColorStop(0.55, 'rgba(120,170,220,0.07)');
    gr.addColorStop(1, 'rgba(60,100,160,0.02)');
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(x - w * 0.4, bot);
    c.lineTo(x - w * 0.5, top + w);
    c.lineTo(x, top);
    c.lineTo(x + w * 0.5, top + w * 0.8);
    c.lineTo(x + w * 0.4, bot);
    c.closePath();
    c.fill();
  }
  // icicle fringe along the ceiling
  c.fillStyle = 'rgba(170,215,250,0.10)';
  for (let x = 0; x < W; x += 6 + rng() * 10) {
    const len = 10 + rng() * 60;
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 3, len); c.lineTo(x + 6, 0); c.fill();
  }
  // a cold aurora
  const au = c.createLinearGradient(0, H * 0.1, 0, H * 0.5);
  au.addColorStop(0, 'rgba(120,255,220,0)');
  au.addColorStop(0.5, 'rgba(120,255,220,0.06)');
  au.addColorStop(1, 'rgba(120,200,255,0)');
  c.fillStyle = au;
  c.beginPath();
  c.moveTo(0, H * 0.3);
  for (let x = 0; x <= W; x += 20) c.lineTo(x, H * 0.22 + Math.sin(x * 0.01) * H * 0.08);
  for (let x = W; x >= 0; x -= 20) c.lineTo(x, H * 0.42 + Math.sin(x * 0.012 + 1) * H * 0.06);
  c.closePath();
  c.fill();
}

function paintLavaFalls(c, W, H) {
  const rng = mulberry32(53);
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.3 + rng() * 0.4) * (W / 4), w = 6 + rng() * 10, top = rng() * H * 0.3;
    const gr = c.createLinearGradient(0, top, 0, H);
    gr.addColorStop(0, 'rgba(255,200,90,0.0)');
    gr.addColorStop(0.2, 'rgba(255,170,70,0.55)');
    gr.addColorStop(1, 'rgba(255,90,30,0.35)');
    c.fillStyle = gr;
    c.fillRect(x - w / 2, top, w, H - top);
    const pool = c.createRadialGradient(x, H * 0.95, 0, x, H * 0.95, 90);
    pool.addColorStop(0, 'rgba(255,150,50,0.35)');
    pool.addColorStop(1, 'rgba(255,80,20,0)');
    c.fillStyle = pool;
    c.fillRect(x - 90, H * 0.95 - 90, 180, 180);
  }
  const heat = c.createLinearGradient(0, H * 0.55, 0, H);
  heat.addColorStop(0, 'rgba(255,90,30,0)');
  heat.addColorStop(1, 'rgba(255,90,30,0.28)');
  c.fillStyle = heat;
  c.fillRect(0, 0, W, H);
}

function paintCanopy(c, W, H) {
  const rng = mulberry32(71);
  // giant leaves and pods, far back and dim
  for (let i = 0; i < 14; i++) {
    const x = rng() * W, y = rng() * H * 0.8, s = 30 + rng() * 70, a = rng() * Math.PI * 2;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = `rgba(${40 + rng() * 30},${70 + rng() * 40},${30},0.16)`;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(s * 0.5, -s * 0.35, s, 0);
    c.quadraticCurveTo(s * 0.5, s * 0.35, 0, 0);
    c.fill();
    c.strokeStyle = 'rgba(160,210,110,0.10)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(s, 0); c.stroke();
    c.restore();
  }
  for (let i = 0; i < 10; i++) {
    const x = rng() * W, len = H * (0.2 + rng() * 0.5);
    c.strokeStyle = 'rgba(20,34,12,0.5)';
    c.lineWidth = 2 + rng() * 3;
    c.beginPath();
    c.moveTo(x, 0);
    c.bezierCurveTo(x + 30, len * 0.3, x - 30, len * 0.6, x + 10, len);
    c.stroke();
  }
  const spot = c.createRadialGradient(W / 2, H * 0.2, 0, W / 2, H * 0.2, W * 0.5);
  spot.addColorStop(0, 'rgba(210,255,150,0.12)');
  spot.addColorStop(1, 'rgba(210,255,150,0)');
  c.fillStyle = spot;
  c.fillRect(0, 0, W, H);
}

function paintMachinery(c, W, H) {
  const rng = mulberry32(97);
  // horizontal pipe runs and vertical ducts
  for (let i = 0; i < 6; i++) {
    const y = (0.12 + rng() * 0.8) * H, r = 5 + rng() * 9;
    const gr = c.createLinearGradient(0, y - r, 0, y + r);
    gr.addColorStop(0, 'rgba(120,110,190,0.20)');
    gr.addColorStop(0.5, 'rgba(40,34,70,0.35)');
    gr.addColorStop(1, 'rgba(10,8,20,0.35)');
    c.fillStyle = gr;
    c.fillRect(0, y - r, W, r * 2);
    for (let x = rng() * 80; x < W; x += 80 + rng() * 120) {
      c.fillStyle = 'rgba(160,150,230,0.14)';
      c.fillRect(x, y - r - 2, 6, r * 2 + 4);
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = rng() * W, w = 10 + rng() * 20;
    c.fillStyle = 'rgba(14,10,28,0.5)';
    c.fillRect(x, 0, w, H);
    c.fillStyle = 'rgba(150,130,255,0.10)';
    c.fillRect(x, 0, 1.5, H);
  }
  // a reactor ring glowing in the dark
  const cx = W * 0.62, cy = H * 0.42, R = Math.min(W, H) * 0.22;
  const halo = c.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
  halo.addColorStop(0, 'rgba(120,170,255,0.30)');
  halo.addColorStop(0.4, 'rgba(110,90,255,0.10)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = halo;
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(150,180,255,0.25)';
  c.lineWidth = 3;
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(150,180,255,0.12)';
  c.lineWidth = 1;
  for (let a = 0; a < 16; a++) {
    const an = (a / 16) * Math.PI * 2;
    c.beginPath();
    c.moveTo(cx + Math.cos(an) * R * 0.7, cy + Math.sin(an) * R * 0.7);
    c.lineTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R);
    c.stroke();
  }
}

function paintRuinArchitecture(c, W, H, room) {
  const rng = mulberry32(77);
  // arcade of tall arched niches with fish-scale carving
  const span = 118;
  for (let x = -20; x < W + span; x += span) {
    const nx = x + span * 0.2, nw = span * 0.6, top = H * 0.2, bot = H * 0.92;
    c.save();
    c.beginPath();
    c.moveTo(nx, bot);
    c.lineTo(nx, top + nw / 2);
    c.arc(nx + nw / 2, top + nw / 2, nw / 2, Math.PI, 0);
    c.lineTo(nx + nw, bot);
    c.closePath();
    const g = c.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(8,10,14,0.55)');
    g.addColorStop(1, 'rgba(4,5,8,0.25)');
    c.fillStyle = g;
    c.fill();
    c.clip();
    c.strokeStyle = 'rgba(150,165,185,0.10)';
    c.lineWidth = 1;
    const sr = 6;
    for (let yy = top + nw / 2; yy < bot; yy += sr) {
      const off = (Math.round((yy - top) / sr) % 2) * sr;
      for (let xx = nx - sr + off; xx < nx + nw + sr; xx += sr * 2) {
        c.beginPath();
        c.arc(xx, yy, sr, 0.15 * Math.PI, 0.85 * Math.PI);
        c.stroke();
      }
    }
    c.restore();
    // pilaster
    const px = x + span * 0.86;
    const pg = c.createLinearGradient(px - 7, 0, px + 7, 0);
    pg.addColorStop(0, 'rgba(160,172,190,0.10)');
    pg.addColorStop(0.5, 'rgba(40,46,56,0.35)');
    pg.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = pg;
    c.fillRect(px - 7, H * 0.12, 14, H);
    for (let yy = H * 0.2; yy < H; yy += 44 + rng() * 20) {
      c.fillStyle = 'rgba(170,180,200,0.08)';
      c.fillRect(px - 9, yy, 18, 3);
    }
  }
  // the great circular gate behind the altar, echoing the trailer's opening shot
  const cx = W / 2, cy = H * 0.42, R = Math.min(W, H) * 0.36;
  c.save();
  const halo = c.createRadialGradient(cx, cy, 0, cx, cy, R * 1.4);
  halo.addColorStop(0, 'rgba(210,230,255,0.28)');
  halo.addColorStop(0.35, 'rgba(120,140,170,0.10)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = halo;
  c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(10,12,18,0.55)';
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  for (let k = 0; k < 5; k++) {
    c.strokeStyle = `rgba(170,185,210,${0.16 - k * 0.022})`;
    c.lineWidth = k === 0 ? 3 : 1.2;
    c.beginPath(); c.arc(cx, cy, R * (1 - k * 0.12), 0, Math.PI * 2); c.stroke();
  }
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    c.strokeStyle = 'rgba(160,175,200,0.10)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx + Math.cos(ang) * R * 0.52, cy + Math.sin(ang) * R * 0.52);
    c.lineTo(cx + Math.cos(ang) * R * 0.98, cy + Math.sin(ang) * R * 0.98);
    c.stroke();
  }
  c.strokeStyle = 'rgba(180,195,220,0.16)';
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
  c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.stroke();
  const orb = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.34);
  orb.addColorStop(0, 'rgba(255,255,255,0.85)');
  orb.addColorStop(0.25, 'rgba(210,228,255,0.45)');
  orb.addColorStop(1, 'rgba(120,150,200,0)');
  c.fillStyle = orb;
  c.beginPath(); c.arc(cx, cy, R * 0.34, 0, Math.PI * 2); c.fill();
  c.restore();
}

function paintArenaRing(c, W, H) {
  const cx = W / 2, cy = H * 0.44, R = Math.min(W, H) * 0.42;
  const halo = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.3);
  halo.addColorStop(0, 'rgba(120,90,220,0.20)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = halo;
  c.fillRect(0, 0, W, H);
  for (let k = 0; k < 3; k++) {
    c.strokeStyle = `rgba(140,170,255,${0.2 - k * 0.05})`;
    c.lineWidth = 2 - k * 0.5;
    c.beginPath(); c.arc(cx, cy, R * (1 - k * 0.1), 0, Math.PI * 2); c.stroke();
  }
  for (let a = 0; a < 60; a++) {
    const ang = (a / 60) * Math.PI * 2;
    const long = a % 5 === 0;
    c.strokeStyle = `rgba(160,190,255,${long ? 0.28 : 0.12})`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx + Math.cos(ang) * R * 1.02, cy + Math.sin(ang) * R * 1.02);
    c.lineTo(cx + Math.cos(ang) * R * (long ? 1.1 : 1.06), cy + Math.sin(ang) * R * (long ? 1.1 : 1.06));
    c.stroke();
  }
  const core = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
  core.addColorStop(0, 'rgba(40,20,70,0.0)');
  core.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = core;
  c.beginPath(); c.arc(cx, cy, R * 0.86, 0, Math.PI * 2); c.fill();
}

// ---------------------------------------------------------------- mid layer

function paintMid(room, nz, f) {
  const { w, h } = layerSize(room, f);
  const W = Math.ceil(w / S), H = Math.ceil(h / S);
  const canvas = makeCanvas(W, H);
  const c = canvas.getContext('2d');
  const pal = PALETTES[room.theme];
  const rng = mulberry32(room.tx * 17 + room.ty * 29 + 5);
  if (room.theme === 'sand') {
    const n = Math.round(W / 85);
    for (let i = 0; i < n; i++) {
      const x = (i + 0.2 + rng() * 0.6) * (W / n);
      const fromTop = rng() < 0.45;
      const len = H * (0.25 + rng() * 0.45);
      const wid = 18 + rng() * 34;
      rockSpire(c, x, fromTop ? 0 : H, wid, len, fromTop, rng, pal, 0.85);
    }
  } else if (room.theme === 'ice') {
    const icePal = { rock: [80, 120, 160], farDark: [10, 20, 34], deep: [4, 8, 14], rockHi: [200, 235, 255] };
    const n = Math.round(W / 90);
    for (let i = 0; i < n; i++) {
      const x = (i + 0.2 + rng() * 0.6) * (W / n);
      const fromTop = rng() < 0.55;
      rockSpire(c, x, fromTop ? 0 : H, 14 + rng() * 26, H * (0.2 + rng() * 0.4), fromTop, rng, icePal, 0.8);
    }
  } else if (room.theme === 'magma') {
    // basalt columns
    const n = Math.round(W / 70);
    for (let i = 0; i < n; i++) {
      const x = (i + rng()) * (W / n), w = 14 + rng() * 16, h = H * (0.25 + rng() * 0.45);
      c.fillStyle = 'rgba(12,5,4,0.92)';
      c.beginPath();
      c.moveTo(x - w / 2, H); c.lineTo(x - w / 2, H - h + 6); c.lineTo(x - w / 4, H - h); c.lineTo(x + w / 4, H - h); c.lineTo(x + w / 2, H - h + 6); c.lineTo(x + w / 2, H);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(255,120,50,0.22)';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(x - w / 2, H); c.lineTo(x - w / 2, H - h + 6); c.lineTo(x - w / 4, H - h); c.stroke();
    }
  } else if (room.theme === 'hive') {
    for (let i = 0; i < 7; i++) {
      const x0 = rng() * W, x1 = x0 + (rng() - 0.5) * 300, y = H * (0.15 + rng() * 0.5);
      c.strokeStyle = 'rgba(10,18,6,0.9)';
      c.lineWidth = 6 + rng() * 8;
      c.beginPath();
      c.moveTo(x0, 0);
      c.bezierCurveTo(x0, y, x1, y, x1, 0);
      c.stroke();
      c.strokeStyle = 'rgba(140,200,90,0.14)';
      c.lineWidth = 1.2;
      c.stroke();
      for (let k = 0; k < 8; k++) {
        const t = k / 8, bx = lerp(x0, x1, t), by = Math.sin(t * Math.PI) * y * 0.75;
        c.fillStyle = 'rgba(10,18,6,0.9)';
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 4, by + 10); c.lineTo(bx - 2, by + 2); c.fill();
      }
    }
  } else if (room.theme === 'lab') {
    for (let i = 0; i < Math.round(W / 140); i++) {
      const x = (i + 0.5) * 140 + (rng() - 0.5) * 30, w = 26 + rng() * 20, h = H * (0.3 + rng() * 0.4);
      c.fillStyle = 'rgba(12,9,24,0.94)';
      c.fillRect(x - w / 2, H - h, w, h);
      c.fillStyle = 'rgba(140,120,255,0.18)';
      c.fillRect(x - w / 2, H - h, w, 2);
      for (let y = H - h + 16; y < H; y += 26) {
        c.fillStyle = `rgba(120,200,255,${0.1 + rng() * 0.2})`;
        c.fillRect(x - w / 2 + 4, y, 3, 3);
      }
    }
  } else if (room.theme === 'ruin') {
    const n = Math.round(W / 160);
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (W / n) + (rng() - 0.5) * 40;
      const broken = rng() < 0.4;
      column(c, x, H, 16 + rng() * 8, broken ? H * (0.35 + rng() * 0.3) : H, pal, rng);
    }
    c.strokeStyle = 'rgba(20,22,28,0.8)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const x = rng() * W, len = H * (0.15 + rng() * 0.3);
      for (let y = 0; y < len; y += 4) {
        c.beginPath(); c.ellipse(x + Math.sin(y * 0.05) * 2, y, 1.6, 2.2, 0, 0, Math.PI * 2); c.stroke();
      }
    }
  } else {
    // arena: rows of warrior statues and two torch towers
    const base = H * 0.86;
    for (let i = 0; i < 18; i++) {
      const x = (i + 0.5) * (W / 18) + (rng() - 0.5) * 8;
      if (Math.abs(x - W / 2) < W * 0.12) continue;
      statue(c, x, base - rng() * 6, 26 + rng() * 6, rng);
    }
    tower(c, W * 0.08, base, H * 0.62);
    tower(c, W * 0.92, base, H * 0.62);
    const fog = c.createLinearGradient(0, H * 0.55, 0, H);
    fog.addColorStop(0, 'rgba(60,40,110,0)');
    fog.addColorStop(1, 'rgba(60,40,110,0.35)');
    c.fillStyle = fog;
    c.fillRect(0, 0, W, H);
  }
  return canvas;
}

function rockSpire(c, x, y0, wid, len, fromTop, rng, pal, alpha) {
  const dir = fromTop ? 1 : -1;
  const steps = 14;
  const left = [], right = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const taper = Math.pow(1 - t, 0.8);
    const wob = Math.sin(t * 9 + x) * 4 + (rng() - 0.5) * 5;
    left.push([x - wid * 0.5 * taper + wob, y0 + dir * len * t]);
    right.push([x + wid * 0.5 * taper + wob * 0.6, y0 + dir * len * t]);
  }
  c.beginPath();
  c.moveTo(left[0][0], left[0][1]);
  for (const p of left) c.lineTo(p[0], p[1]);
  for (let k = right.length - 1; k >= 0; k--) c.lineTo(right[k][0], right[k][1]);
  c.closePath();
  const g = c.createLinearGradient(x - wid, 0, x + wid, 0);
  g.addColorStop(0, `rgba(${pal.rock.map((v) => v * 0.5).join(',')},${alpha})`);
  g.addColorStop(0.45, `rgba(${pal.farDark.join(',')},${alpha})`);
  g.addColorStop(1, `rgba(${pal.deep.join(',')},${alpha})`);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = `rgba(${pal.rockHi.join(',')},0.16)`;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(left[0][0], left[0][1]);
  for (const p of left) c.lineTo(p[0], p[1]);
  c.stroke();
}

function column(c, x, H, wid, height, pal, rng) {
  const top = H - height;
  const g = c.createLinearGradient(x - wid, 0, x + wid, 0);
  g.addColorStop(0, 'rgba(120,130,150,0.30)');
  g.addColorStop(0.35, 'rgba(34,38,48,0.92)');
  g.addColorStop(1, 'rgba(8,9,12,0.95)');
  c.fillStyle = g;
  c.fillRect(x - wid / 2, top, wid, height);
  c.fillStyle = 'rgba(14,16,22,0.95)';
  c.fillRect(x - wid * 0.8, top, wid * 1.6, 8);
  c.fillRect(x - wid * 0.7, H - 12, wid * 1.4, 12);
  for (let y = top + 24; y < H - 12; y += 30) {
    c.fillStyle = 'rgba(150,160,180,0.10)';
    c.fillRect(x - wid / 2, y, wid, 1.5);
  }
  if (height < H) {
    c.fillStyle = 'rgba(8,9,12,0.95)';
    c.beginPath();
    c.moveTo(x - wid / 2, top);
    for (let k = 0; k <= 6; k++) c.lineTo(x - wid / 2 + (wid * k) / 6, top - rng() * 10);
    c.lineTo(x + wid / 2, top);
    c.fill();
  }
}

function statue(c, x, base, hgt, rng) {
  c.fillStyle = 'rgba(16,13,30,0.96)';
  c.beginPath();
  c.ellipse(x, base - hgt * 0.95, hgt * 0.14, hgt * 0.16, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(x - hgt * 0.22, base - hgt * 0.8);
  c.lineTo(x + hgt * 0.22, base - hgt * 0.8);
  c.lineTo(x + hgt * 0.16, base - hgt * 0.35);
  c.lineTo(x + hgt * 0.2, base);
  c.lineTo(x - hgt * 0.2, base);
  c.lineTo(x - hgt * 0.16, base - hgt * 0.35);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(16,13,30,0.96)';
  c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(x + hgt * 0.3, base); c.lineTo(x + hgt * 0.3, base - hgt * 1.35); c.stroke();
  c.strokeStyle = 'rgba(190,150,90,0.18)';
  c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(x - hgt * 0.2, base - hgt * 0.78); c.lineTo(x - hgt * 0.16, base - hgt * 0.36); c.stroke();
}

function tower(c, x, base, hgt) {
  c.fillStyle = 'rgba(12,10,24,0.97)';
  c.beginPath();
  c.moveTo(x - 16, base);
  c.lineTo(x - 11, base - hgt);
  c.lineTo(x + 11, base - hgt);
  c.lineTo(x + 16, base);
  c.fill();
  c.fillRect(x - 15, base - hgt - 8, 30, 8);
  const fire = c.createRadialGradient(x, base - hgt - 14, 0, x, base - hgt - 14, 46);
  fire.addColorStop(0, 'rgba(255,200,120,0.9)');
  fire.addColorStop(0.2, 'rgba(255,120,50,0.45)');
  fire.addColorStop(1, 'rgba(255,80,20,0)');
  c.fillStyle = fire;
  c.beginPath(); c.arc(x, base - hgt - 14, 46, 0, Math.PI * 2); c.fill();
}

// ---------------------------------------------------------------- foreground

function paintForeground(room, nz, f) {
  const { w, h } = layerSize(room, f);
  const W = Math.ceil(w / S), H = Math.ceil(h / S);
  const canvas = makeCanvas(W, H);
  const c = canvas.getContext('2d');
  const rng = mulberry32(room.tx * 7 + room.ty * 13 + 99);
  const pal = PALETTES[room.theme];
  const ink = 'rgba(3,2,3,1)';
  if (room.id === 'A') {
    // the shaft's walls crowd the frame on both sides
    for (let side = 0; side < 2; side++) {
      for (let y = 0; y < H; y += 60 + rng() * 80) {
        const x = side === 0 ? 0 : W;
        const reach = 18 + rng() * 40;
        blob(c, x + (side === 0 ? reach * 0.2 : -reach * 0.2), y, reach, 30 + rng() * 40, rng, ink);
      }
    }
  } else if (room.theme === 'ice') {
    for (let x = 0; x < W; x += 14 + rng() * 40) {
      const len = 10 + rng() * 60, w = 4 + rng() * 10;
      c.fillStyle = ink;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + w / 2, len); c.lineTo(x + w, 0); c.fill();
    }
    for (let i = 0; i < Math.round(W / 60); i++) {
      const x = (i + rng()) * 60;
      if (rng() < 0.4) blob(c, x, H + 8, 16 + rng() * 26, 12 + rng() * 12, rng, ink);
    }
  } else if (room.theme === 'lab') {
    for (let i = 0; i < Math.round(W / 160); i++) {
      const x0 = rng() * W, x1 = x0 + 80 + rng() * 160, sag = 20 + rng() * 50;
      c.strokeStyle = ink;
      c.lineWidth = 3 + rng() * 3;
      c.beginPath(); c.moveTo(x0, 0); c.quadraticCurveTo((x0 + x1) / 2, sag * 2, x1, 0); c.stroke();
    }
    c.fillStyle = ink;
    c.fillRect(0, 0, W, 6);
  } else {
    // roots and tendrils hanging into frame
    const n = Math.round(W / 110);
    for (let i = 0; i < n; i++) {
      const x = (i + rng()) * (W / n);
      if (rng() < 0.55) tendril(c, x, 0, 25 + rng() * (room.theme === 'arena' ? 40 : room.theme === 'hive' ? 120 : 80), rng, ink);
    }
    // grass and rock lumps along the bottom edge
    const m = Math.round(W / 70);
    for (let i = 0; i < m; i++) {
      const x = (i + rng()) * (W / m);
      if (rng() < 0.5) tuft(c, x, H, 10 + rng() * 22, rng, ink);
      else if (rng() < 0.3) blob(c, x, H + 6, 20 + rng() * 30, 14 + rng() * 14, rng, ink);
    }
  }
  // faint rim so the silhouettes sit inside the light
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = `rgba(${pal.rim.join(',')},0.05)`;
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over';
  return canvas;
}

function blob(c, x, y, rx, ry, rng, fill) {
  c.fillStyle = fill;
  c.beginPath();
  const n = 12;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const r = 1 + (rng() - 0.5) * 0.35;
    const px = x + Math.cos(a) * rx * r, py = y + Math.sin(a) * ry * r;
    if (k === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.fill();
}

function tendril(c, x, y, len, rng, fill, depth = 0) {
  c.strokeStyle = fill;
  c.lineCap = 'round';
  let px = x, py = y;
  const wid = (3 + rng() * 4) * (depth ? 0.55 : 1);
  const bend = (rng() - 0.5) * 0.6;
  for (let k = 0; k < 12; k++) {
    const nx = px + Math.sin(k * 0.5 + bend * 5) * 2 + bend * 3;
    const ny = py + len / 12;
    c.lineWidth = wid * (1 - k / 13);
    c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
    px = nx; py = ny;
    if (depth < 1 && k > 2 && rng() < 0.12) tendril(c, px, py, len * 0.4, rng, fill, depth + 1);
  }
}

function tuft(c, x, y, hgt, rng, fill) {
  c.strokeStyle = fill;
  c.lineCap = 'round';
  const blades = 5 + Math.floor(rng() * 7);
  for (let k = 0; k < blades; k++) {
    const lean = (rng() - 0.5) * hgt * 0.9;
    const hh = hgt * (0.5 + rng() * 0.5);
    c.lineWidth = 1 + rng() * 1.6;
    c.beginPath();
    c.moveTo(x + (rng() - 0.5) * 8, y);
    c.quadraticCurveTo(x + lean * 0.3, y - hh * 0.6, x + lean, y - hh);
    c.stroke();
  }
}

// ---------------------------------------------------------------- doors & membranes (drawn live)

export function drawDoor(c, d, t) {
  const x = d.x, y = d.y, h = d.h;
  const locked = d.locked;
  const col = locked ? [255, 70, 90] : [80, 170, 255];
  // frame
  c.save();
  const fg = c.createLinearGradient(x, 0, x + 40, 0);
  fg.addColorStop(0, '#20242e');
  fg.addColorStop(0.5, '#3a4050');
  fg.addColorStop(1, '#15171d');
  c.fillStyle = fg;
  roundRect(c, x + 2, y - 14, 36, h + 28, 10);
  c.fill();
  c.fillStyle = '#0b0c10';
  roundRect(c, x + 8, y - 6, 24, h + 12, 8);
  c.fill();
  for (let k = 0; k < 4; k++) {
    c.fillStyle = 'rgba(160,170,190,0.45)';
    c.beginPath(); c.arc(x + 20, y - 8 + (k * (h + 16)) / 3, 1.8, 0, Math.PI * 2); c.fill();
  }
  // shield: two halves that retract into the frame
  const open = d.amt;
  const half = (h + 8) / 2;
  const sh = half * (1 - open);
  if (sh > 0.5) {
    const pulse = 0.75 + 0.25 * Math.sin(t * 4 + d.id);
    for (const dir of [-1, 1]) {
      const yy = dir < 0 ? y - 4 : y + h + 4 - sh;
      const g = c.createLinearGradient(x + 10, 0, x + 30, 0);
      g.addColorStop(0, `rgba(${col.join(',')},${0.25 * pulse})`);
      g.addColorStop(0.5, `rgba(${col.map((v) => Math.min(255, v + 90)).join(',')},${0.9 * pulse})`);
      g.addColorStop(1, `rgba(${col.join(',')},${0.25 * pulse})`);
      c.fillStyle = g;
      roundRect(c, x + 11, yy, 18, sh, 6);
      c.fill();
      c.strokeStyle = `rgba(255,255,255,${0.25 * pulse})`;
      c.lineWidth = 1;
      for (let k = 0; k < sh; k += 7) {
        c.beginPath();
        c.moveTo(x + 13, yy + k + ((t * 30) % 7));
        c.lineTo(x + 27, yy + k + ((t * 30) % 7));
        c.stroke();
      }
    }
    if (locked) {
      c.fillStyle = 'rgba(255,230,235,0.9)';
      c.fillRect(x + 16, y + h / 2 - 3, 8, 7);
      c.strokeStyle = 'rgba(255,230,235,0.9)';
      c.lineWidth = 1.6;
      c.beginPath(); c.arc(x + 20, y + h / 2 - 4, 3, Math.PI, 0); c.stroke();
    }
  }
  c.restore();
}

export function drawMembrane(c, x, y, w, h, t, awake) {
  c.save();
  const a = awake ? 0.9 : 0.6;
  const g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, `rgba(60,150,255,${0.05 * a})`);
  g.addColorStop(0.5, `rgba(120,210,255,${0.32 * a})`);
  g.addColorStop(1, `rgba(60,150,255,${0.05 * a})`);
  c.fillStyle = g;
  c.fillRect(x + 4, y, w - 8, h);
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = `rgba(140,220,255,${0.35 * a})`;
  c.lineWidth = 1;
  const hs = 9;
  for (let yy = y - hs; yy < y + h + hs; yy += hs * 1.5) {
    for (let k = 0; k < 2; k++) {
      const cx = x + w / 2 + (k ? hs * 0.87 : -hs * 0.87) * 0.5;
      const cy = yy + (k ? hs * 0.75 : 0) + ((t * 12) % (hs * 1.5));
      if (cy < y || cy > y + h) continue;
      c.beginPath();
      for (let s = 0; s <= 6; s++) {
        const an = (s / 6) * Math.PI * 2 + Math.PI / 6;
        const px = cx + Math.cos(an) * hs * 0.5, py = cy + Math.sin(an) * hs * 0.5;
        if (s === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
    }
  }
  const sweep = ((t * 0.6) % 1) * (h + 120) - 60;
  const sg = c.createLinearGradient(0, y + sweep - 40, 0, y + sweep + 40);
  sg.addColorStop(0, 'rgba(160,230,255,0)');
  sg.addColorStop(0.5, `rgba(180,240,255,${0.45 * a})`);
  sg.addColorStop(1, 'rgba(160,230,255,0)');
  c.fillStyle = sg;
  c.fillRect(x + 6, Math.max(y, y + sweep - 40), w - 12, 80);
  c.fillStyle = `rgba(200,245,255,${0.7 * a})`;
  c.fillRect(x + w / 2 - 0.75, y, 1.5, h);
  c.restore();
}

export function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

// A soft vignette, painted once.
export function makeVignette() {
  const cv = makeCanvas(VIEW_W, VIEW_H);
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(VIEW_W / 2, VIEW_H * 0.46, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.62)');
  c.fillStyle = g;
  c.fillRect(0, 0, VIEW_W, VIEW_H);
  return cv;
}

// ---------------------------------------------------------------- liquids, cracked blocks, vents (drawn live)

// pools are drawn as one shape per contiguous run, with a moving surface
export function drawPool(c, x, y, w, h, type, t) {
  c.save();
  if (type === 'lava') {
    const gr = c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(255,220,120,1)');
    gr.addColorStop(0.12, 'rgba(255,130,40,1)');
    gr.addColorStop(0.6, 'rgba(190,40,10,1)');
    gr.addColorStop(1, 'rgba(80,10,0,1)');
    c.fillStyle = gr;
  } else {
    const gr = c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(120,230,180,0.85)');
    gr.addColorStop(0.2, 'rgba(40,120,90,0.85)');
    gr.addColorStop(1, 'rgba(8,30,24,0.95)');
    c.fillStyle = gr;
  }
  c.beginPath();
  c.moveTo(x, y + h);
  for (let px = x; px <= x + w; px += 8) c.lineTo(px, y + 3 + Math.sin(px * 0.05 + t * (type === 'lava' ? 2 : 3)) * 2.5);
  c.lineTo(x + w, y + h);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'lighter';
  if (type === 'lava') {
    for (let k = 0; k < w / 30; k++) {
      const bx = x + ((k * 37 + t * 20) % w), by = y + 8 + ((k * 13) % Math.max(1, h - 12));
      const r = 2 + ((t * 3 + k) % 1) * 5;
      c.fillStyle = `rgba(255,220,140,${0.5 * (1 - ((t * 3 + k) % 1))})`;
      c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
    }
    const glow = c.createLinearGradient(0, y - 60, 0, y + 10);
    glow.addColorStop(0, 'rgba(255,120,40,0)');
    glow.addColorStop(1, 'rgba(255,120,40,0.45)');
    c.fillStyle = glow;
    c.fillRect(x, y - 60, w, 70);
  } else {
    c.strokeStyle = 'rgba(200,255,220,0.6)';
    c.lineWidth = 1.5;
    c.beginPath();
    for (let px = x; px <= x + w; px += 8) {
      const py = y + 3 + Math.sin(px * 0.05 + t * 3) * 2.5;
      if (px === x) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
    for (let k = 0; k < w / 26; k++) {
      const tx = x + ((k * 53 + t * 8) % w);
      c.fillStyle = 'rgba(40,20,10,0.9)';
      c.globalCompositeOperation = 'source-over';
      c.beginPath(); c.moveTo(tx, y + h); c.lineTo(tx + 4, y + h - 14 - (k % 3) * 6); c.lineTo(tx + 8, y + h); c.fill();
      c.globalCompositeOperation = 'lighter';
    }
  }
  c.restore();
}

export function drawCrackedBlock(c, x, y, theme, t) {
  const pal = PALETTES[theme] || PALETTES.sand;
  c.save();
  const gr = c.createLinearGradient(x, y, x + 40, y + 40);
  gr.addColorStop(0, `rgb(${pal.rockHi.join(',')})`);
  gr.addColorStop(1, `rgb(${pal.rock.join(',')})`);
  c.fillStyle = gr;
  c.fillRect(x + 1, y + 1, 38, 38);
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.lineWidth = 1;
  c.strokeRect(x + 1.5, y + 1.5, 37, 37);
  const pulse = 0.55 + 0.45 * Math.sin(t * 3 + x * 0.01);
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = theme === 'ice' ? `rgba(160,230,255,${0.6 * pulse})` : `rgba(255,190,120,${0.6 * pulse})`;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(x + 8, y + 4); c.lineTo(x + 18, y + 16); c.lineTo(x + 14, y + 26); c.lineTo(x + 24, y + 36);
  c.moveTo(x + 18, y + 16); c.lineTo(x + 32, y + 12);
  c.moveTo(x + 14, y + 26); c.lineTo(x + 4, y + 30);
  c.stroke();
  c.restore();
}

export function drawVent(c, x, y, t, heat) {
  c.save();
  c.fillStyle = '#16122a';
  c.fillRect(x + 4, y - 4, 32, 6);
  c.fillStyle = 'rgba(160,140,255,0.5)';
  for (let k = 0; k < 4; k++) c.fillRect(x + 8 + k * 7, y - 3, 3, 3);
  if (heat > 0) {
    c.globalCompositeOperation = 'lighter';
    const hgt = 150 * heat;
    const gr = c.createLinearGradient(0, y - hgt, 0, y);
    gr.addColorStop(0, 'rgba(90,160,255,0)');
    gr.addColorStop(0.4, `rgba(110,170,255,${0.5 * heat})`);
    gr.addColorStop(1, `rgba(200,230,255,${0.9 * heat})`);
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(x + 6, y);
    for (let k = 0; k <= 8; k++) {
      const px = x + 6 + (k * 28) / 8;
      c.lineTo(px + Math.sin(t * 30 + k) * 3, y - hgt * (0.7 + 0.3 * Math.sin(t * 20 + k * 2)));
    }
    c.lineTo(x + 34, y);
    c.closePath();
    c.fill();
  }
  c.restore();
}

// ---------------------------------------------------------------- lens and light helpers

// soft focus for layers far from the action (premultiplied so edges don't darken)
export function blurCanvas(src, r) {
  if (r <= 0) return src;
  const w = src.width, h = src.height;
  const img = src.getContext('2d').getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), A = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3] / 255;
    R[i] = d[i * 4] * a; G[i] = d[i * 4 + 1] * a; B[i] = d[i * 4 + 2] * a; A[i] = a;
  }
  for (const ch of [R, G, B, A]) boxBlur(ch, w, h, r, 2);
  for (let i = 0; i < n; i++) {
    const a = A[i];
    const k = a > 0.0001 ? 1 / a : 0;
    d[i * 4] = R[i] * k; d[i * 4 + 1] = G[i] * k; d[i * 4 + 2] = B[i] * k; d[i * 4 + 3] = a * 255;
  }
  const out = makeCanvas(w, h);
  out.getContext('2d').putImageData(img, 0, 0);
  return out;
}

// lights that belong to each room: sky, lava, canopy, strip lights, torches
export function staticLights(world, room) {
  const L = [];
  const add = (x, y, r, col, a, z) => L.push({ x, y, r, col, a, z });
  const X = (u) => room.x + room.pw * u, Y = (v) => room.y + room.ph * v;
  switch (room.id) {
    case 'A':
      add(room.x + 640, room.y - 60, 1300, [1, 0.86, 0.66], 0.55, 520);
      add(room.x + 640, room.y + room.ph - 90, 620, [1, 0.78, 0.55], 0.16, 220);
      break;
    case 'B':
      for (const [u, v] of [[0.18, 0.35], [0.62, 0.25], [0.9, 0.55]]) add(X(u), Y(v), 520, [1, 0.8, 0.6], 0.22, 260);
      break;
    case 'C':
      add(X(0.5), Y(0.42), 900, [0.8, 0.88, 1], 0.26, 360);
      add(X(0.5), room.y - 20, 820, [0.85, 0.9, 1], 0.25, 420);
      break;
    case 'E':
      add(X(0.3), Y(0.25), 720, [0.6, 0.85, 1], 0.34, 320);
      add(X(0.78), Y(0.35), 640, [0.6, 0.85, 1], 0.3, 320);
      break;
    case 'F': {
      // every lava pool lights the rock around it from below
      for (let tx = room.tx; tx < room.tx + room.w; tx++) {
        for (let ty = room.ty; ty < room.ty + room.h; ty++) {
          if (world.tile(tx, ty) === T.LAVA && world.tile(tx, ty - 1) !== T.LAVA && world.tile(tx - 1, ty) !== T.LAVA) {
            // one light per pool, centred on it
            let w = 0;
            while (world.tile(tx + w, ty) === T.LAVA) w++;
            add(tx * TILE + (w * TILE) / 2, ty * TILE - 10, 170 + w * 40, [1, 0.42, 0.1], 0.6, 34);
          }
        }
      }
      add(X(0.5), Y(1.05), 1200, [1, 0.4, 0.12], 0.18, 200);
      break;
    }
    case 'G':
      add(X(0.45), room.y - 40, 1150, [0.82, 1, 0.72], 0.36, 460);
      for (let tx = room.tx; tx < room.tx + room.w; tx++) {
        for (let ty = room.ty; ty < room.ty + room.h; ty++) {
          if (world.tile(tx, ty) === T.WATER && world.tile(tx, ty - 1) !== T.WATER && (tx - room.tx) % 3 === 0) add(tx * TILE + 20, ty * TILE, 220, [0.4, 1, 0.8], 0.3, 20);
        }
      }
      break;
    case 'H':
      for (const u of [0.2, 0.5, 0.8]) add(X(u), room.y + 110, 520, [0.62, 0.56, 1], 0.3, 220);
      add(X(0.62), Y(0.42), 620, [0.55, 0.85, 1], 0.24, 300);
      break;
    case 'I':
      add(X(0.08), Y(0.22), 620, [1, 0.6, 0.3], 0.5, 260);
      add(X(0.92), Y(0.22), 620, [1, 0.6, 0.3], 0.5, 260);
      add(X(0.5), Y(0.45), 760, [0.62, 0.5, 1], 0.26, 340);
      break;
  }
  return L;
}
