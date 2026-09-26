// The rooms of the demo, the tile grid, doors, and tile collision.
//   #  rock        =  one-way ledge     |  phase membrane     D  hatch door     B  cracked (bombable)
//   ~  thorn-water L  lava              v  fire vent
//   P  intro drop  c  crawler           w  wingblade          b  husk brute     j  ice jelly
//   s  spitter     d  drone             e  energy pod
//   I  Phase Shift M  Morph Ball        T  Liam's energy tank X  missile tank
//   H  Thornheart  K  Hollow Brim

export const TILE = 40;
export const T = { AIR: 0, SOLID: 1, ONEWAY: 2, DOOR: 3, PHASE: 4, WATER: 5, LAVA: 6, BOMB: 7 };

const r = (s, n) => s.repeat(n);

const ROOM_A = [
  r('#', 12) + r('.', 8) + r('#', 12),
  r('#', 11) + r('.', 10) + r('#', 11),
  r('#', 10) + r('.', 6) + 'P' + r('.', 5) + r('#', 10),
  r('#', 9) + r('.', 14) + r('#', 9),
  r('#', 8) + r('.', 16) + r('#', 8),
  r('#', 7) + r('.', 18) + r('#', 7),
  r('#', 6) + r('.', 20) + r('#', 6),
  r('#', 5) + r('.', 22) + r('#', 5),
  r('#', 5) + r('.', 22) + r('#', 5),
  r('#', 4) + r('.', 24) + r('#', 4),
  r('#', 4) + r('.', 24) + r('#', 4),
  r('#', 3) + r('.', 26) + r('#', 3),
  r('#', 3) + r('.', 26) + r('#', 3),
  r('#', 3) + r('.', 26) + r('#', 3),
  r('#', 4) + r('.', 24) + r('#', 4),
  r('#', 7) + r('.', 18) + r('#', 7),
  r('#', 8) + r('.', 16) + r('#', 8),
  r('#', 8) + r('.', 16) + r('#', 8),
  r('#', 9) + r('.', 14) + r('#', 9),
  r('#', 9) + r('.', 14) + r('#', 9),
  r('#', 8) + r('.', 16) + r('#', 8),
  r('#', 7) + r('.', 18) + r('#', 7),
  r('#', 7) + r('.', 18) + r('#', 7),
  r('#', 8) + r('.', 16) + r('#', 8),
  r('#', 8) + r('.', 16) + r('#', 8),
  r('#', 7) + r('.', 18) + r('#', 7),
  r('#', 6) + r('.', 20) + r('#', 6),
  r('#', 5) + r('.', 22) + r('#', 5),
  r('#', 3) + r('.', 26) + r('#', 3),
  r('#', 2) + r('.', 28) + r('#', 2),
  r('#', 2) + r('.', 29) + 'D',
  r('#', 2) + r('.', 29) + 'D',
  r('#', 2) + r('.', 22) + 'c' + r('.', 6) + 'D',
  r('#', 32),
  r('#', 32),
  r('#', 32),
];

const ROOM_B = [
  r('#', 64),
  r('#', 64),
  r('#', 64),
  r('#', 12) + r('.', 15) + '##' + r('.', 23) + r('#', 12),
  r('#', 12) + r('.', 15) + '#' + r('.', 24) + r('#', 12),
  r('#', 12) + r('.', 34) + 'w' + r('.', 5) + r('#', 12),
  r('#', 12) + r('.', 40) + r('#', 12),
  r('#', 12) + r('.', 14) + 'w' + r('.', 25) + r('#', 12),
  r('#', 12) + r('.', 24) + 'e' + r('.', 15) + r('#', 12),
  r('.', 34) + r('=', 5) + r('.', 24) + '#',
  r('.', 63) + '#',
  r('.', 63) + '#',
  r('.', 18) + r('#', 6) + r('.', 39) + 'D',
  r('.', 18) + r('#', 6) + r('.', 18) + r('#', 4) + r('.', 17) + 'D',
  r('.', 8) + 'c' + r('.', 9) + r('#', 6) + r('.', 6) + 'c' + r('.', 11) + r('#', 4) + r('.', 2) + 'b' + r('.', 14) + 'D',
  r('#', 64),
  r('#', 64),
  r('#', 64),
];

const ROOM_C = [
  r('#', 40),
  r('#', 40),
  r('#', 4) + r('.', 32) + r('#', 4),
  r('#', 3) + r('.', 34) + r('#', 3),
  r('#', 2) + r('.', 36) + r('#', 2),
  r('#', 2) + r('.', 36) + r('#', 2),
  '#' + r('.', 38) + '#',
  '#' + r('.', 38) + '#',
  '#' + r('.', 38) + '#',
  '#' + r('.', 38) + '#',
  '#' + r('.', 38) + '#',
  '#' + r('.', 18) + 'I' + r('.', 19) + '#',
  '#' + r('.', 15) + r('#', 8) + r('.', 12) + r('#', 4),
  '#' + r('.', 15) + r('#', 8) + r('.', 12) + r('#', 4),
  '#' + r('.', 36) + r('#', 3),
  '#' + r('.', 8) + r('=', 5) + r('.', 12) + r('=', 5) + r('.', 6) + '|' + '.' + '#',
  '#' + r('.', 36) + '|' + '.' + '#',
  '#' + r('.', 36) + '|' + '.' + '#',
  '...' + r('=', 5) + r('.', 23) + r('=', 5) + '.' + '|' + '.' + 'D',
  '.' + r('.', 36) + '|' + '.' + 'D',
  '.' + r('.', 11) + 'c' + r('.', 24) + '|' + '.' + 'D',
  r('#', 40),
  r('#', 40),
  r('#', 40),
];

// Frostvault: the Morph Ball waits on the ice shelf; cracked ice beside it hides Liam's tank.
const ROOM_E = [
  r('#', 56),
  r('#', 56),
  r('#', 6) + r('.', 44) + r('#', 6),
  r('#', 5) + r('.', 46) + r('#', 5),
  r('#', 4) + r('.', 47) + r('#', 5),
  r('#', 4) + r('.', 47) + r('#', 5),
  r('#', 4) + r('.', 15) + 'j' + r('.', 31) + r('#', 5),
  r('#', 4) + r('.', 47) + r('#', 5),
  r('#', 4) + r('.', 47) + r('#', 5),
  r('#', 4) + r('.', 47) + 'B' + r('.', 3) + '#',
  r('#', 4) + r('.', 29) + 'j' + r('.', 17) + 'B' + r('.', 3) + '#',
  r('#', 4) + r('.', 40) + 'M' + r('.', 6) + 'B' + '.' + 'T' + '.' + '#',
  r('.', 40) + r('#', 16),
  r('.', 40) + r('#', 16),
  r('.', 51) + r('#', 5),
  r('#', 12) + r('.', 24) + r('=', 4) + r('.', 11) + r('#', 5),
  r('#', 12) + r('=', 3) + r('.', 36) + r('#', 5),
  r('#', 12) + r('.', 16) + 'j' + r('.', 22) + r('#', 5),
  r('#', 12) + r('.', 20) + r('=', 5) + r('.', 14) + r('#', 5),
  r('#', 12) + '.' + r('=', 4) + r('.', 7) + r('#', 4) + r('.', 23) + r('#', 5),
  r('#', 12) + r('.', 12) + r('#', 4) + r('.', 23) + r('#', 5),
  r('#', 12) + r('.', 4) + 'c' + r('.', 7) + r('#', 4) + r('.', 10) + 'c' + r('.', 12) + r('#', 5),
  r('#', 46) + r('.', 4) + r('#', 6),
  r('#', 46) + r('.', 10),
  r('#', 56),
  r('#', 56),
];

// Magma Tunnels: roll in through the ice tunnel, jump the lava, mind the spitter guarding a missile tank.
const ROOM_F = [
  r('#', 48),
  r('#', 48),
  r('#', 48),
  r('#', 48),
  r('#', 10) + r('.', 30) + r('#', 8),
  r('#', 8) + r('.', 34) + r('#', 6),
  r('#', 8) + r('.', 34) + r('#', 6),
  r('.', 42) + r('#', 6),
  r('#', 8) + r('=', 4) + r('.', 30) + r('#', 6),
  r('#', 8) + r('.', 16) + 's' + r('.', 3) + 'X' + r('.', 13) + r('#', 6),
  r('#', 8) + r('.', 16) + r('#', 7) + r('.', 16) + 'D',
  r('#', 8) + '.' + r('=', 3) + r('.', 35) + 'D',
  r('#', 8) + r('.', 4) + 'c' + r('.', 22) + 'c' + r('.', 11) + 'D',
  r('#', 14) + r('L', 4) + r('#', 13) + r('L', 4) + r('#', 13),
  r('#', 14) + r('L', 4) + r('#', 13) + r('L', 4) + r('#', 13),
  r('#', 48),
  r('#', 48),
  r('#', 48),
];

// Thornwood: Thornheart hangs from the canopy. The exit is across the thorn-water.
const ROOM_G = [
  r('#', 40),
  r('#', 40),
  r('#', 3) + r('.', 34) + r('#', 3),
  r('#', 2) + r('.', 36) + r('#', 2),
  r('#', 2) + r('.', 16) + 'H' + r('.', 19) + r('#', 2),
  r('#', 2) + r('.', 36) + r('#', 2),
  r('#', 2) + r('.', 36) + r('#', 2),
  r('#', 2) + r('.', 36) + r('#', 2),
  r('#', 2) + r('.', 36) + r('#', 2),
  r('#', 2) + r('.', 36) + r('#', 2),
  r('#', 2) + r('.', 36) + r('#', 2),
  r('#', 2) + r('.', 36) + r('#', 2),
  r('#', 2) + r('.', 36) + r('#', 2),
  '#' + r('.', 38) + '#',
  '#' + r('.', 38) + '#',
  '#' + r('.', 5) + r('=', 5) + r('.', 7) + r('=', 5) + r('.', 16) + '#',
  r('.', 39) + 'D',
  r('.', 39) + 'D',
  r('.', 39) + 'D',
  r('#', 28) + r('~', 8) + r('#', 4),
  r('#', 28) + r('~', 8) + r('#', 4),
  r('#', 28) + r('~', 8) + r('#', 4),
  r('#', 40),
  r('#', 40),
];

// Hollow Lab: climb past the drones and the vents. A missile tank sits on the high left shelf.
const ROOM_H = [
  r('#', 44),
  r('#', 44),
  r('#', 2) + r('.', 41) + '#',
  r('#', 2) + r('.', 41) + 'D',
  r('#', 2) + r('.', 41) + 'D',
  r('#', 2) + r('.', 41) + 'D',
  r('#', 2) + r('.', 28) + r('=', 5) + r('#', 9),
  r('#', 2) + r('.', 33) + r('#', 9),
  r('#', 2) + r('.', 8) + r('=', 6) + r('.', 4) + r('=', 6) + r('.', 9) + r('#', 9),
  r('#', 2) + r('.', 41) + '#',
  r('#', 2) + '.' + 'X' + r('.', 16) + 'd' + r('.', 22) + '#',
  r('#', 2) + r('=', 6) + r('.', 35) + '#',
  r('#', 2) + r('.', 41) + '#',
  r('#', 2) + r('.', 32) + 'd' + r('.', 8) + '#',
  r('.', 8) + r('=', 6) + r('.', 29) + '#',
  r('.', 43) + '#',
  r('.', 43) + '#',
  r('#', 6) + 'v' + r('#', 8) + 'v' + r('#', 8) + 'v' + r('#', 19),
  r('#', 44),
  r('#', 44),
  r('#', 44),
  r('#', 44),
];

// The Circle: where the first of the Five waits.
const ROOM_I = [
  r('#', 36),
  r('#', 36),
  r('#', 36),
  r('#', 4) + r('.', 28) + r('#', 4),
  r('#', 3) + r('.', 30) + r('#', 3),
  r('#', 2) + r('.', 32) + r('#', 2),
  r('#', 2) + r('.', 32) + r('#', 2),
  r('#', 2) + r('.', 16) + 'K' + r('.', 15) + r('#', 2),
  r('#', 2) + r('.', 32) + r('#', 2),
  '#' + r('.', 34) + '#',
  '#' + r('.', 34) + '#',
  '#' + r('.', 7) + r('=', 5) + r('.', 10) + r('=', 5) + r('.', 7) + '#',
  r('.', 35) + 'D',
  r('.', 35) + 'D',
  r('.', 35) + 'D',
  r('#', 36),
  r('#', 36),
  r('#', 36),
];

export const ROOM_DEFS = [
  { id: 'A', name: 'The Sinkhole', tx: 0, ty: 0, theme: 'sand', rows: ROOM_A },
  { id: 'B', name: 'Sunken Hollows', tx: 32, ty: 18, theme: 'sand', rows: ROOM_B },
  { id: 'C', name: 'Reliquary', tx: 96, ty: 12, theme: 'ruin', rows: ROOM_C },
  { id: 'E', name: 'Frostvault', tx: 136, ty: 18, theme: 'ice', rows: ROOM_E },
  { id: 'F', name: 'Magma Tunnels', tx: 192, ty: 34, theme: 'magma', rows: ROOM_F },
  { id: 'G', name: 'Thornwood', tx: 240, ty: 28, theme: 'hive', rows: ROOM_G },
  { id: 'H', name: 'Hollow Lab', tx: 280, ty: 30, theme: 'lab', rows: ROOM_H },
  { id: 'I', name: 'The Circle', tx: 324, ty: 21, theme: 'arena', rows: ROOM_I },
];

export class World {
  constructor(defs = ROOM_DEFS) {
    this.rooms = defs.map((d) => ({ ...d, w: d.rows[0].length, h: d.rows.length, seen: false }));
    for (const rm of this.rooms) {
      rm.rows.forEach((row, i) => {
        if (row.length !== rm.w) throw new Error(`Room ${rm.id} row ${i} is ${row.length} wide, expected ${rm.w}`);
      });
    }
    let maxX = 0, maxY = 0;
    for (const rm of this.rooms) {
      maxX = Math.max(maxX, rm.tx + rm.w);
      maxY = Math.max(maxY, rm.ty + rm.h);
    }
    this.tw = maxX;
    this.th = maxY;
    this.grid = new Uint8Array(this.tw * this.th).fill(T.SOLID);
    this.doorAt = new Int16Array(this.tw * this.th).fill(-1);
    this.doors = [];
    this.spawns = [];
    for (const rm of this.rooms) {
      rm.x = rm.tx * TILE; rm.y = rm.ty * TILE; rm.pw = rm.w * TILE; rm.ph = rm.h * TILE;
      for (let y = 0; y < rm.h; y++) {
        for (let x = 0; x < rm.w; x++) {
          const ch = rm.rows[y][x];
          const gx = rm.tx + x, gy = rm.ty + y;
          let t = T.AIR;
          if (ch === '#') t = T.SOLID;
          else if (ch === '=') t = T.ONEWAY;
          else if (ch === '|') t = T.PHASE;
          else if (ch === 'D') t = T.DOOR;
          else if (ch === '~') t = T.WATER;
          else if (ch === 'L') t = T.LAVA;
          else if (ch === 'B') t = T.BOMB;
          else if (ch === 'v') { t = T.SOLID; this.spawns.push({ ch, room: rm.id, tx: gx, ty: gy }); }
          else if (ch !== '.') this.spawns.push({ ch, room: rm.id, tx: gx, ty: gy });
          this.grid[gy * this.tw + gx] = t;
        }
      }
    }
    for (let x = 0; x < this.tw; x++) {
      for (let y = 0; y < this.th; y++) {
        const i = y * this.tw + x;
        if (this.grid[i] !== T.DOOR || this.doorAt[i] !== -1) continue;
        let y2 = y;
        while (y2 + 1 < this.th && this.grid[(y2 + 1) * this.tw + x] === T.DOOR) y2++;
        const d = {
          id: this.doors.length, tx: x, ty: y, x: x * TILE, y: y * TILE, w: TILE, h: (y2 - y + 1) * TILE,
          open: false, amt: 0, locked: false, awayT: 0, room: this.roomAt(x * TILE + 20, y * TILE + 20)?.id,
        };
        for (let k = y; k <= y2; k++) this.doorAt[k * this.tw + x] = d.id;
        this.doors.push(d);
      }
    }
    this.worldW = this.tw * TILE;
    this.worldH = this.th * TILE;
  }

  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return T.SOLID;
    return this.grid[ty * this.tw + tx];
  }

  solidFor(tx, ty, ent) {
    const t = this.tile(tx, ty);
    if (t === T.SOLID || t === T.BOMB) return true;
    if (t === T.DOOR) return !this.doors[this.doorAt[ty * this.tw + tx]].open;
    if (t === T.PHASE) return !(ent && ent.phasing);
    return false;
  }

  solidAtPx(px, py, ent) {
    return this.solidFor(Math.floor(px / TILE), Math.floor(py / TILE), ent);
  }

  roomAt(px, py) {
    for (const rm of this.rooms) if (px >= rm.x && px < rm.x + rm.pw && py >= rm.y && py < rm.y + rm.ph) return rm;
    return null;
  }

  room(id) {
    return this.rooms.find((rm) => rm.id === id);
  }

  overlapsType(e, type) {
    const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 0.01) / TILE);
    const y0 = Math.floor(e.y / TILE), y1 = Math.floor((e.y + e.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.tile(tx, ty) === type) return true;
    return false;
  }

  doorById(id) {
    return this.doors[id];
  }

  setTile(tx, ty, t) {
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return;
    this.grid[ty * this.tw + tx] = t;
  }

  // the top row of a pool is its surface
  isSurface(tx, ty, type) {
    return this.tile(tx, ty) === type && this.tile(tx, ty - 1) !== type;
  }
}

// Axis-separated AABB vs tiles. Returns what was hit.
export function moveEntity(world, e, dt) {
  const res = { hitX: 0, hitY: 0, ground: false };
  if (e.vx !== 0) {
    e.x += e.vx * dt;
    const y0 = Math.floor(e.y / TILE), y1 = Math.floor((e.y + e.h - 0.01) / TILE);
    if (e.vx > 0) {
      const tx = Math.floor((e.x + e.w - 0.01) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (world.solidFor(tx, ty, e)) { e.x = tx * TILE - e.w; res.hitX = 1; break; }
      }
    } else {
      const tx = Math.floor(e.x / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (world.solidFor(tx, ty, e)) { e.x = (tx + 1) * TILE; res.hitX = -1; break; }
      }
    }
    if (res.hitX) e.vx = 0;
  }
  const prevBottom = e.y + e.h;
  if (e.vy !== 0) {
    e.y += e.vy * dt;
    const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 0.01) / TILE);
    if (e.vy > 0) {
      const ty = Math.floor((e.y + e.h - 0.01) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        const t = world.tile(tx, ty);
        const oneway = t === T.ONEWAY && !(e.dropThrough > 0) && prevBottom <= ty * TILE + 1;
        const stride = t === T.WATER && e.waterStride && prevBottom <= ty * TILE + 1 && world.tile(tx, ty - 1) !== T.WATER;
        if (world.solidFor(tx, ty, e) || oneway || stride) { e.y = ty * TILE - e.h; res.hitY = 1; res.ground = true; res.water = stride; break; }
      }
    } else {
      const ty = Math.floor(e.y / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        if (world.solidFor(tx, ty, e)) { e.y = (ty + 1) * TILE; res.hitY = -1; break; }
      }
    }
    if (res.hitY) e.vy = 0;
  }
  return res;
}

// True when there is floor directly under the given x at the entity's feet.
export function groundAhead(world, e, dir) {
  const px = dir > 0 ? e.x + e.w + 2 : e.x - 2;
  const py = e.y + e.h + 4;
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  const t = world.tile(tx, ty);
  return world.solidFor(tx, ty, e) || t === T.ONEWAY;
}

export function wallAhead(world, e, dir) {
  const px = dir > 0 ? e.x + e.w + 2 : e.x - 2;
  return world.solidAtPx(px, e.y + 4, e) || world.solidAtPx(px, e.y + e.h - 4, e) || world.solidAtPx(px, e.y + e.h / 2, e);
}
