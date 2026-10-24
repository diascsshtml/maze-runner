// Рельеф Глэйда: холмы и низины, мелкие неровности, утоптанные тропы, лужи, ровные площадки под постройками,
// река с неровными берегами, мелким бродом и глубокими местами.
// Плюс «опоры» для игрока сверх земли: настилы башни, полы домов, мостик, камни брода, бревно, и лестницы.
// Все величины в метрах (мир), тайл (x, y) стоит в точке (x·S, y·S).

const TERRAIN = { zones: null, platforms: [], ladders: [], mask: null };

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

/* ---------- маски земли: тропы, грязь, русло ---------- */

// Сетка масок поверх Глэйда (MASK_N×MASK_N ячеек): 0 — тропа, 1 — грязь, 2 — мокрый гравий русла
const MASK_N = 512;

// Сглаженная ломаная: Катмулл-Ром через точки (в тайлах) с шагом ~step тайла и лёгким вилянием
function smoothLine(pts, step = 0.25, wobble = 0) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      let x = f(p0[0], p1[0], p2[0], p3[0]), y = f(p0[1], p1[1], p2[1], p3[1]);
      if (wobble) {
        x += (tnoise(x * 0.9 + 3.1, y * 0.9) - 0.5) * wobble;
        y += (tnoise(x * 0.9, y * 0.9 + 7.7) - 0.5) * wobble;
      }
      out.push([x, y]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

function buildMasks() {
  const b = gladeBounds(), N = MASK_N, cell = (b.x1 - b.x0) / N;
  const path = new Float32Array(N * N), mud = new Float32Array(N * N), bed = new Float32Array(N * N);
  const M = TERRAIN.mask = { x0: b.x0, cell, N, path, mud, bed };
  const ix = x => Math.floor((x - b.x0) / cell), cx = i => b.x0 + (i + 0.5) * cell;
  // Тропы: ширина неровная, края размыты; у троп-тропинок след слабее
  for (const P of LAYOUT.paths) {
    const pts = smoothLine(P.pts.map(([dx, dy]) => [MID + dx, MID + dy]), 0.2, P.w > 1.3 ? 0.18 : 0.28).map(([x, y]) => [x * S, y * S]);
    const hw = P.w / 2, k = P.w > 1.3 ? 1 : 0.8, reach = hw * 1.3 + 0.5;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const i0 = Math.max(0, ix(Math.min(ax, bx) - reach)), i1 = Math.min(N - 1, ix(Math.max(ax, bx) + reach));
      const j0 = Math.max(0, ix(Math.min(az, bz) - reach)), j1 = Math.min(N - 1, ix(Math.max(az, bz) + reach));
      for (let j = j0; j <= j1; j++) {
        const z = cx(j);
        for (let i = i0; i <= i1; i++) {
          const x = cx(i), t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
          const w = hw * (0.8 + 0.4 * tnoise(x * 0.8 + 11, z * 0.8));
          const v = (1 - tsmooth(w - 0.3, w + 0.35, d)) * k;
          if (v > path[j * N + i]) path[j * N + i] = v;
        }
      }
    }
  }
  // Утоптанные пятачки: у костра, у Ящика, у дверей
  const spots = [[LAYOUT.campfire, 2.3], [LAYOUT.box, 1.7], ...HOUSES.map(h => [h.doorOut, 0.75])];
  for (const [p, r] of spots) {
    const X = S * (p.x), Z = S * (p.y), R = r * S;
    for (let j = Math.max(0, ix(Z - R - 1)); j <= Math.min(N - 1, ix(Z + R + 1)); j++) {
      for (let i = Math.max(0, ix(X - R - 1)); i <= Math.min(N - 1, ix(X + R + 1)); i++) {
        const d = Math.hypot(cx(i) - X, cx(j) - Z) + (tnoise(cx(i) * 0.7, cx(j) * 0.7) - 0.5) * 1.2;
        const v = (1 - tsmooth(R * 0.55, R, d)) * 0.85;
        if (v > path[j * N + i]) path[j * N + i] = v;
      }
    }
  }
  // Грязь: низины, загон, берега у брода и мостика; на тропах — размокшие пятна
  for (const m of LAYOUT.mud) {
    const X = S * (MID + m.x), Z = S * (MID + m.y), R = m.r * S;
    for (let j = Math.max(0, ix(Z - R - 1)); j <= Math.min(N - 1, ix(Z + R + 1)); j++) {
      for (let i = Math.max(0, ix(X - R - 1)); i <= Math.min(N - 1, ix(X + R + 1)); i++) {
        const d = Math.hypot(cx(i) - X, cx(j) - Z) + (tnoise(cx(i) * 0.9 + 4, cx(j) * 0.9) - 0.5) * R * 0.5;
        const v = 1 - tsmooth(R * 0.35, R, d);
        if (v > mud[j * N + i]) mud[j * N + i] = v;
      }
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cx(i), z = cx(j), k = j * N + i;
      const wetSpot = tsmooth(0.6, 0.74, tnoise(x * 0.22 + 9, z * 0.22 - 3));
      mud[k] = Math.max(mud[k], path[k] * wetSpot * 0.75);
      const r = riverFast(x, z);
      if (r.d < 12) {
        const sh = riverShape(r.s, x, z), d = r.d + riverWiggle(x, z);
        bed[k] = 1 - tsmooth(sh.half + 0.2, sh.half + 0.9, d);
        mud[k] = Math.max(mud[k], (1 - tsmooth(sh.half + 0.6, sh.half + 1.6, d)) * (0.55 + 0.45 * tnoise(x * 0.5, z * 0.5)));
      }
    }
  }
}

// Значение маски в точке (метры), билинейно; ch — 'path' | 'mud' | 'bed'
function groundMask(ch, x, z) {
  const M = TERRAIN.mask;
  if (!M) return 0;
  const fx = (x - M.x0) / M.cell - 0.5, fz = (z - M.x0) / M.cell - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= M.N - 1 || j >= M.N - 1) return 0;
  const a = M[ch], u = fx - i, v = fz - j, k = j * M.N + i;
  return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + M.N] * (1 - u) + a[k + M.N + 1] * u) * v;
}

/* ---------- холмы ---------- */

// Естественные холмы: два слоя шума, холмы и низины из планировки, мелкие кочки; у стен Глэйда всё сходит на нет
function hillH(x, z) {
  const b = gladeBounds();
  const edge = Math.min(x - b.x0, b.x1 - x, z - b.x0, b.x1 - z);
  if (edge <= 0) return 0;
  let h = (tnoise(x * 0.03 + 7.1, z * 0.03 + 3.3) - 0.5) * 2.6 + (tnoise(x * 0.09, z * 0.09) - 0.5) * 0.55;
  for (const f of LAYOUT.hills) {
    const d = Math.hypot(x - S * (MID + f.x), z - S * (MID + f.y)) / (f.r * S);
    if (d < 1) h += f.h * (1 - d * d) * (1 - d * d);
  }
  const path = groundMask('path', x, z);
  // Кочки и бугорки; на тропах их затоптали, а сами тропы чуть просели
  h += ((tnoise(x * 0.42 + 1.3, z * 0.42 - 2.1) - 0.5) * 0.3 + (tnoise(x * 1.3, z * 1.3) - 0.5) * 0.08) * (1 - path * 0.8) - path * 0.07;
  return h * tsmooth(1.5, 11, edge);
}

// Низины и ямки луж: опускают землю после выравнивания площадок
function dipH(x, z) {
  let d = 0;
  for (const f of LAYOUT.hollows) {
    const k = Math.hypot(x - S * (MID + f.x), z - S * (MID + f.y)) / (f.r * S);
    if (k < 1) d += f.d * (1 - k * k) * (1 - k * k);
  }
  for (const p of LAYOUT.puddles) {
    const k = Math.hypot(x - S * (MID + p.x), z - S * (MID + p.y)) / (p.r * S);
    if (k < 1) d += 0.12 * (1 - k * k);
  }
  return d;
}

/* ---------- река ---------- */

// Река: ломаная в тайлах (dx, dy относительно Ящика), сглаженная в плавную линию → метры
function riverPoints() {
  return smoothLine(LAYOUT.river.map(([dx, dy]) => [MID + dx, MID + dy]), 0.5).map(([x, y]) => ({ x: x * S, z: y * S }));
}

// Расстояние до оси реки (м), положение вдоль неё 0..1 и ближайшая точка оси
function riverQuery(x, z) {
  if (!TERRAIN.riverPts) initRiver();
  if (z < TERRAIN.riverZ0 || z > TERRAIN.riverZ1) return { d: 99, s: 0, x, z };
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

function initRiver() {
  TERRAIN.riverPts = riverPoints();
  TERRAIN.riverLen = TERRAIN.riverPts.reduce((s, p, i, a) => s + (i ? Math.hypot(p.x - a[i - 1].x, p.z - a[i - 1].z) : 0), 0);
  TERRAIN.riverZ0 = Math.min(...TERRAIN.riverPts.map(p => p.z)) - 14;
  TERRAIN.riverZ1 = Math.max(...TERRAIN.riverPts.map(p => p.z)) + 14;
  buildRiverField();
}

// Поле «расстояние до оси реки и положение вдоль неё» на сетке масок: высоту земли спрашивают
// десятки тысяч раз, и искать ближайший отрезок реки каждый раз слишком долго
function buildRiverField() {
  const b = gladeBounds(), N = MASK_N, cell = (b.x1 - b.x0) / N, pts = TERRAIN.riverPts, n = pts.length - 1;
  const D = new Float32Array(N * N).fill(99), P = new Float32Array(N * N);
  const ax = new Float32Array(n), az = new Float32Array(n), dx = new Float32Array(n), dz = new Float32Array(n), l2 = new Float32Array(n), acc = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    ax[i] = pts[i].x; az[i] = pts[i].z; dx[i] = pts[i + 1].x - pts[i].x; dz[i] = pts[i + 1].z - pts[i].z;
    l2[i] = dx[i] * dx[i] + dz[i] * dz[i]; acc[i] = sum; sum += Math.sqrt(l2[i]);
  }
  for (let j = 0; j < N; j++) {
    const z = b.x0 + (j + 0.5) * cell;
    if (z < TERRAIN.riverZ0 || z > TERRAIN.riverZ1) continue;
    for (let i = 0; i < N; i++) {
      const x = b.x0 + (i + 0.5) * cell;
      let best = 1e9, bs = 0;
      for (let k = 0; k < n; k++) {
        let t = ((x - ax[k]) * dx[k] + (z - az[k]) * dz[k]) / l2[k];
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x - ax[k] - dx[k] * t, ez = z - az[k] - dz[k] * t, d2 = ex * ex + ez * ez;
        if (d2 < best) { best = d2; bs = acc[k] + Math.sqrt(l2[k]) * t; }
      }
      D[j * N + i] = Math.sqrt(best);
      P[j * N + i] = bs / sum;
    }
  }
  TERRAIN.riverField = { D, P, x0: b.x0, cell, N };
}

// Быстрый вариант riverQuery по полю (без ближайшей точки оси); объект результата переиспользуется
const _rq = { d: 99, s: 0 };
function riverFast(x, z) {
  if (!TERRAIN.riverField) initRiver();
  const F = TERRAIN.riverField, fx = (x - F.x0) / F.cell - 0.5, fz = (z - F.x0) / F.cell - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= F.N - 1 || j >= F.N - 1) { _rq.d = 99; _rq.s = 0; return _rq; }
  const u = fx - i, v = fz - j, k = j * F.N + i, N = F.N;
  const lerp = a => (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + N] * (1 - u) + a[k + N + 1] * u) * v;
  _rq.d = lerp(F.D);
  _rq.s = lerp(F.P);
  return _rq;
}

// Высота поверхности реки в точке s (0..1): течёт с запада на восток с небольшим уклоном
function riverBase(s) { return 0.15 - s * 0.35; }
const RIVER = { half: 1.25, bank: 3.6, depth: 0.95, water: 0.42 };

// Ширина и глубина русла: то сужается, то разливается; у брода — широко и мелко, у мостика — узко
function riverShape(s, x, z) {
  let half = RIVER.half * (0.75 + 0.55 * tnoise(s * 13 + 0.5, 4.2));
  let depth = RIVER.depth * (0.85 + 0.35 * tnoise(s * 8 + 0.3, 9.1));
  const f = LAYOUT.ford, kf = 1 - tsmooth(3, 8, Math.hypot(x - S * (f.x), z - S * (f.y)));
  half += (2.7 - half) * kf;
  depth += (0.64 - depth) * kf;
  const br = LAYOUT.bridge, kb = 1 - tsmooth(2.5, 6, Math.hypot(x - S * (br.x), z - S * (br.y)));
  half += (1.15 - half) * kb;
  return { half, depth };
}
// Берега неровные: линия берега гуляет на ±0.45 м
function riverWiggle(x, z) { return (tnoise(x * 0.55 + 5.3, z * 0.55 - 1.7) - 0.5) * 0.9 + (tnoise(x * 1.9, z * 1.9) - 0.5) * 0.25; }

function initTerrain() {
  initRiver();
  buildMasks();
  // Площадки: постройки, костёр, Ящик, башня — ровные, на естественной высоте своего центра
  TERRAIN.zones = LAYOUT.flatZones.map(r => {
    const x0 = (r.x0 - 0.5) * S, x1 = (r.x1 + 0.5) * S, z0 = (r.y0 - 0.5) * S, z1 = (r.y1 + 0.5) * S;
    const h = r.h !== undefined ? r.h : hillH((x0 + x1) / 2, (z0 + z1) / 2);
    return { x0, x1, z0, z1, h, fall: r.fall || 3, fixed: r.h !== undefined, house: !!r.house };
  });
  // Порядок: сначала площадки двора, потом дома (пол внутри всегда ровный, соседний склон его не поднимает),
  // последним — Ящик с заданной высотой
  TERRAIN.zones.sort((a, b) => (a.fixed - b.fixed) || (a.house - b.house));
}

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
  h -= dipH(x, z);
  const r = riverFast(x, z);
  if (r.d < RIVER.bank + 6) {
    const base = riverBase(r.s), sh = riverShape(r.s, x, z), d = r.d + riverWiggle(x, z);
    h += (base - h) * (1 - tsmooth(sh.half + 1.4, sh.half + 4.6, d));              // берега к воде
    h -= sh.depth * (1 - tsmooth(sh.half * 0.35, sh.half + 0.8, d));              // русло
  }
  return h;
}

// Уровень воды над руслом (или null, если тут не река)
function waterLevel(x, z) {
  if (!TERRAIN.zones) initTerrain();
  const r = riverFast(x, z);
  if (r.d > riverShape(r.s, x, z).half + 1.6) return null;
  return riverBase(r.s) - RIVER.water;
}

/* ---------- опоры и лестницы ---------- */

// p: { round, x, z, r } или { x0, z0, x1, z1 }; h — высота настила
function addPlatform(p) { if (typeof CUR_STRUCT !== 'undefined' && CUR_STRUCT) p.struct = CUR_STRUCT; TERRAIN.platforms.push(p); }
function addLadder(l) { TERRAIN.ladders.push(l); }

// На что встанет человек в точке (x, z), если его ноги на высоте feet (с шагом вверх до 0.45 м)
function supportH(x, z, feet) {
  let h = groundH(x, z);
  for (const p of TERRAIN.platforms) {
    if (p.off || p.h > feet + 0.45 || p.h <= h) continue;
    const inside = p.round ? Math.hypot(x - p.x, z - p.z) <= p.r && (!p.r0 || Math.hypot(x - p.x, z - p.z) >= p.r0)
      : x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
    if (inside) h = p.h;
  }
  return h;
}
