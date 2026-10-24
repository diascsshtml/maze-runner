// Рельеф Глэйда: мягкие холмы, выровненные площадки под постройками, русло реки в лесу.
// Плюс «опоры» для игрока сверх земли: настилы башни, полы домов, мостик, и лестницы.
// Все величины в метрах (мир), тайл (x, y) стоит в точке (x·S, y·S).

const TERRAIN = { zones: null, platforms: [], ladders: [] };

function thash(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function tnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = thash(xi, zi) + (thash(xi + 1, zi) - thash(xi, zi)) * u;
  const b = thash(xi, zi + 1) + (thash(xi + 1, zi + 1) - thash(xi, zi + 1)) * u;
  return a + (b - a) * v;
}
const tsmooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Границы Глэйда в метрах
function gladeBounds() {
  return { x0: (GLADE_T0 - 0.5) * S, x1: (GLADE_T1 + 0.5) * S };
}

// Естественные холмы: два слоя шума, у стен Глэйда сходят на нет
function hillH(x, z) {
  const b = gladeBounds();
  const edge = Math.min(x - b.x0, b.x1 - x, z - b.x0, b.x1 - z);
  if (edge <= 0) return 0;
  const n = (tnoise(x * 0.03 + 7.1, z * 0.03 + 3.3) - 0.5) * 2.6 + (tnoise(x * 0.09, z * 0.09) - 0.5) * 0.55;
  return n * tsmooth(1.5, 11, edge);
}

// Река: ломаная в тайлах (dx, dy относительно Ящика) → метры
function riverPoints() {
  return LAYOUT.river.map(([dx, dy]) => ({ x: (MID + dx) * S, z: (MID + dy) * S }));
}

// Расстояние до оси реки (м), положение вдоль неё 0..1 и ближайшая точка оси
function riverQuery(x, z) {
  const pts = TERRAIN.riverPts;
  let best = 1e9, bestS = 0, acc = 0, bx = 0, bz = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz, len = Math.sqrt(len2);
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < best) { best = d; bestS = acc + len * t; bx = a.x + dx * t; bz = a.z + dz * t; }
    acc += len;
  }
  return { d: best, s: bestS / TERRAIN.riverLen, x: bx, z: bz };
}

function initTerrain() {
  TERRAIN.riverPts = riverPoints();
  TERRAIN.riverLen = TERRAIN.riverPts.reduce((s, p, i, a) => s + (i ? Math.hypot(p.x - a[i - 1].x, p.z - a[i - 1].z) : 0), 0);
  // Площадки: постройки, костёр, Ящик, башня — ровные, на естественной высоте своего центра
  TERRAIN.zones = LAYOUT.flatZones.map(r => {
    const x0 = (r.x0 - 0.5) * S, x1 = (r.x1 + 0.5) * S, z0 = (r.y0 - 0.5) * S, z1 = (r.y1 + 0.5) * S;
    const h = r.h !== undefined ? r.h : hillH((x0 + x1) / 2, (z0 + z1) / 2);
    return { x0, x1, z0, z1, h, fall: r.fall || 3, fixed: r.h !== undefined };
  });
  // Площадки с заданной высотой (Ящик) применяются последними, чтобы соседние их не приподнимали
  TERRAIN.zones.sort((a, b) => a.fixed - b.fixed);
}

// Высота поверхности реки в точке s (0..1): течёт с запада на восток с небольшим уклоном
function riverBase(s) { return 0.15 - s * 0.35; }
const RIVER = { half: 1.25, bank: 3.6, depth: 0.95, water: 0.42 };

function groundH(x, z) {
  if (!TERRAIN.zones) initTerrain();
  const b = gladeBounds();
  if (x <= b.x0 || x >= b.x1 || z <= b.x0 || z >= b.x1) return 0;
  let h = hillH(x, z);
  for (const q of TERRAIN.zones) {
    const dx = Math.max(q.x0 - x, 0, x - q.x1), dz = Math.max(q.z0 - z, 0, z - q.z1);
    const d = Math.hypot(dx, dz);
    if (d < q.fall) h += (q.h - h) * (1 - tsmooth(0, q.fall, d));
  }
  const r = riverQuery(x, z);
  if (r.d < RIVER.bank + 3) {
    const base = riverBase(r.s);
    h += (base - h) * (1 - tsmooth(RIVER.bank, RIVER.bank + 3, r.d));     // пологие берега
    h -= RIVER.depth * (1 - tsmooth(RIVER.half * 0.4, RIVER.half + 1.1, r.d));  // русло
  }
  return h;
}

// Уровень воды над руслом (или null, если тут не река)
function waterLevel(x, z) {
  if (!TERRAIN.zones) initTerrain();
  const r = riverQuery(x, z);
  if (r.d > RIVER.half + 1.2) return null;
  return riverBase(r.s) - RIVER.water;
}

/* ---------- опоры и лестницы ---------- */

// p: { round, x, z, r } или { x0, z0, x1, z1 }; h — высота настила
function addPlatform(p) { TERRAIN.platforms.push(p); }
function addLadder(l) { TERRAIN.ladders.push(l); }

// На что встанет человек в точке (x, z), если его ноги на высоте feet (с шагом вверх до 0.45 м)
function supportH(x, z, feet) {
  let h = groundH(x, z);
  for (const p of TERRAIN.platforms) {
    if (p.h > feet + 0.45 || p.h <= h) continue;
    const inside = p.round ? Math.hypot(x - p.x, z - p.z) <= p.r && (!p.r0 || Math.hypot(x - p.x, z - p.z) >= p.r0)
      : x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
    if (inside) h = p.h;
  }
  return h;
}
