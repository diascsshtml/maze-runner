// Планировка Глэйда по схеме из фильма (тайлы 27..51, Ящик в центре 39,39; север сверху).
//  Север: поляна. СЗ — кузница, спальни, Кутузка; З — столовая и костёр; СВ — плантации.
//  Центр: Ящик и Башня-дерево.  Юг: густой лес, река с мостиком, кладбище, картохранилище, живодерня.

const gt = (dx, dy) => ({ x: MID + dx, y: MID + dy });
const rect = (x0, y0, x1, y1) => ({ x0: MID + x0, y0: MID + y0, x1: MID + x1, y1: MID + y1 });
const inRect = (p, r, m = 0) => p.x >= r.x0 - m && p.x <= r.x1 + m && p.y >= r.y0 - m && p.y <= r.y1 + m;

// Дома: прямоугольник в тайлах и сторона двери. Стены стоят чуть внутри прямоугольника.
const HOUSES = [
  { id: 'forge', name: 'Кузница', r: rect(-11, -11, -8, -9), door: 'E' },
  { id: 'bunk1', name: 'Спальня', r: rect(-11, -7, -8, -6), door: 'E' },
  { id: 'bunk2', name: 'Спальня', r: rect(-6, -7, -4, -6), door: 'S' },
  { id: 'dining', name: 'Столовая', r: rect(-11, -4, -7, -2), door: 'E' },
  { id: 'storage', name: 'Картохранилище', r: rect(1, 7, 3, 9), door: 'W' },
  { id: 'blood', name: 'Живодерня', r: rect(6, 5, 8, 6), door: 'W' },
];
const DOOR_DIR = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
for (const h of HOUSES) {
  const r = h.r, [ox, oy] = DOOR_DIR[h.door];
  const midX = r.x0 + Math.floor((r.x1 - r.x0 + 1) / 2), midY = r.y0 + Math.floor((r.y1 - r.y0 + 1) / 2);
  h.doorTile = { x: ox > 0 ? r.x1 : ox < 0 ? r.x0 : midX, y: oy > 0 ? r.y1 : oy < 0 ? r.y0 : midY };
  h.doorOut = { x: h.doorTile.x + ox, y: h.doorTile.y + oy };
}

const LAYOUT = {
  box: gt(0, 0),                          // 1 — Ящик
  tower: gt(2, -4),                       // 2 — Башня-дерево
  plantations: rect(4, -11, 11, -4),      // 3 — плантации
  slammer: gt(-5, -10),                   // 4 — Кутузка
  campfire: gt(-4, -3),
  graveyard: rect(-10, 3, -7, 6),         // 7 — кладбище жмуриков
  pen: rect(9, 4, 10, 7),                 // загон живодерни
  chopBlock: gt(-3, 2),
  woodpile: gt(-2, 2),
  scaffold: gt(-7, -12),
  bridge: gt(0, 10),
  torches: [gt(-1, -1), gt(1, -1), gt(-1, 1), gt(1, 1), gt(-6, -1), gt(-1, 5)],
  // Река: ломаная в тайлах (dx, dy), с запада на восток через южный лес
  river: [[-12.6, 9.2], [-9, 9.6], [-6, 10.6], [-3, 10.2], [0, 10.4], [3, 11.2], [6, 10.4], [9, 9.4], [12.6, 9.9]],
  trees: [],            // крупные деревья в центрах тайлов (их обходят и жители)
  cornerTrees: [],      // деревья на углах тайлов — жители ходят по центрам, им они не мешают
  houses: HOUSES,
  // Башня как в фильме: могучее дерево с тремя настилами и лестницами между ними
  towerSpec: {
    trunkR: 0.95,
    decks: [{ h: 4.2, r: 3.8 }, { h: 8.6, r: 2.9 }, { h: 12.8, r: 2.1 }],
    ladders: [{ from: -1, to: 0, angle: 3.6 }, { from: 0, to: 1, angle: 0.4 }, { from: 1, to: 2, angle: 3.4 }],
  },
};

// Расстояние от точки (в тайлах) до оси реки, тоже в тайлах
function riverDistTiles(x, y) {
  let best = 1e9;
  const pts = LAYOUT.river.map(([dx, dy]) => [MID + dx, MID + dy]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}

const FOREST_CLEAR = [
  [LAYOUT.graveyard, 1], [HOUSES[4].r, 1], [HOUSES[5].r, 1], [LAYOUT.pen, 1], [rect(-4, 1, -1, 3), 0],
];
const forestFree = (p, m = 0) => !FOREST_CLEAR.some(([r, k]) => inRect(p, r, k + m)) && riverDistTiles(p.x, p.y) > 0.85;
for (let dy = 2; dy <= 12; dy += 2) {
  for (let dx = -12; dx <= 12; dx += 2) {
    const p = gt(dx, dy);
    if (dx !== 0 && forestFree(p)) LAYOUT.trees.push(p);
  }
}
for (let dy = 1; dy <= 11; dy++) {
  for (let dx = -12; dx <= 11; dx++) {
    const p = { x: MID + dx + 0.5 + (thash(dx, dy) - 0.5) * 0.3, y: MID + dy + 0.5 + (thash(dy, dx) - 0.5) * 0.3 };
    if (Math.abs(p.x - MID) < 1.1 || thash(dx * 7, dy * 3) > 0.62 || !forestFree(p, 0.2)) continue;
    LAYOUT.cornerTrees.push(p);
  }
}
for (const dy of [-12, -10, -8, -6]) LAYOUT.trees.push(gt(12, dy));     // полоса у восточной стены

// Ровные площадки для рельефа (в тайлах); Ящик строго на нуле
LAYOUT.flatZones = [
  ...HOUSES.map(h => ({ ...h.r, fall: 3 })),
  { ...rect(-1, -1, 1, 1), h: 0, fall: 4 },
  { ...rect(1, -5, 3, -3), fall: 4 },
  { ...LAYOUT.plantations, fall: 3 },
  { ...rect(-6, -5, -2, -1), fall: 3 },
  { ...LAYOUT.graveyard, fall: 2 },
  { ...LAYOUT.pen, fall: 2 },
  { ...rect(-6, -11, -4, -9), fall: 2 },
  { ...rect(-4, 1, -1, 3), fall: 2 },
];

// Рабочие места: где стоять и куда смотреть
const STATIONS = {
  cook: { ...gt(-10, -3), face: gt(-11, -3), act: 'cook' },
  smith: { ...gt(-9, -10), face: gt(-10, -10), act: 'hammer' },
  medjackA: { ...gt(-7, -5), face: gt(-6, -5), act: 'talk' },
  medjackB: { ...gt(-6, -5), face: gt(-7, -5), act: 'talk' },
  leader: { ...gt(-2, -2), face: gt(0, 0), act: 'talk' },
  chop: { ...gt(-3, 1), face: LAYOUT.chopBlock, act: 'chop' },
  woodpile: { ...gt(-2, 1), face: LAYOUT.woodpile, act: 'pickup', haul: true },   // дровосеки складывают поленья
  build: { ...gt(-6, -12), face: LAYOUT.scaffold, act: 'hammer' },
  farm: [gt(5, -10), gt(7, -9), gt(6, -7), gt(9, -8), gt(5, -6), gt(10, -5)].map(p => ({ ...p, face: { x: p.x + 1, y: p.y }, act: 'hoe' })),
  guards: [
    { ...gt(-12, -1), face: gt(-13, 0), act: 'guard' },
    { ...gt(12, 1), face: gt(13, 0), act: 'guard' },
    { ...gt(1, -12), face: gt(0, -13), act: 'guard' },
  ],
  mapRoom: { ...gt(0, 8), face: gt(1, 8), act: 'talk' },   // бегуны вечером сверяют карты
};

// Кровати вдоль длинных стен спален, изголовьем к стене-торцу: тайл, где лежит житель,
// точное место кровати (wx, wy в тайлах) и поворот (кровать длинной стороной вдоль X)
const BEDS = [];
for (const h of HOUSES.filter(h => h.id.startsWith('bunk'))) {
  for (let x = h.r.x0; x <= h.r.x1; x++) {
    for (const y of [h.r.y0, h.r.y1]) {
      if (x === h.doorTile.x && y === h.doorTile.y) continue;
      const wallSide = y === h.r.y0 ? -1 : 1;
      BEDS.push({ x, y, wx: x, wy: y + wallSide * 0.19, yaw: 0, house: h.id });
    }
  }
}

// Места у костра: два кольца вокруг огня
const SEATS = [];
for (let r = 1; r <= 2; r++) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      SEATS.push({ x: LAYOUT.campfire.x + dx, y: LAYOUT.campfire.y + dy });
    }
  }
}

// Тайлы, через которые жители не ходят (стены домов — отдельно, рёбрами)
const BLOCKED = new Set();
const blockTile = p => BLOCKED.add(p.y * SIZE + p.x);
function blockRect(r) { for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) BLOCKED.add(y * SIZE + x); }
blockRect(LAYOUT.pen);
blockRect(rect(1, -5, 3, -3));          // корни и опоры Башни
for (const p of [LAYOUT.slammer, LAYOUT.campfire, LAYOUT.chopBlock, LAYOUT.woodpile, LAYOUT.scaffold, ...LAYOUT.torches, ...LAYOUT.trees]) blockTile(p);
for (let y = GLADE_T0; y <= GLADE_T1; y++) {
  for (let x = GLADE_T0; x <= GLADE_T1; x++) {
    // По мостику ходят: он закрывает и тайл у южного берега
    if (riverDistTiles(x, y) < 0.7 && !(x === LAYOUT.bridge.x && Math.abs(y - LAYOUT.bridge.y) <= 1)) BLOCKED.add(y * SIZE + x);
  }
}
// Внутри домов: очаг и столы столовой, горн и наковальня кузницы, полки картохранилища
LAYOUT.interior = {
  hearth: gt(-11, -3), tables: [gt(-9, -4), gt(-9, -2)],
  furnace: gt(-11, -10), anvil: gt(-10, -10),
};
for (const t of [LAYOUT.interior.hearth, ...LAYOUT.interior.tables, LAYOUT.interior.furnace, LAYOUT.interior.anvil]) blockTile(t);
for (let i = SEATS.length - 1; i >= 0; i--) if (BLOCKED.has(SEATS[i].y * SIZE + SEATS[i].x)) SEATS.splice(i, 1);

function decoBlocked(x, y) { return BLOCKED.has(y * SIZE + x); }

// Стены домов для жителей: запрещённые переходы между соседними тайлами (кроме двери)
const WALL_EDGES = new Set();
const edgeKey = (a, b) => a < b ? a * SIZE * SIZE + b : b * SIZE * SIZE + a;
for (const h of HOUSES) {
  const r = h.r;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (inRect({ x: nx, y: ny }, r)) continue;
        if (x === h.doorTile.x && y === h.doorTile.y && nx === h.doorOut.x && ny === h.doorOut.y) continue;
        WALL_EDGES.add(edgeKey(y * SIZE + x, ny * SIZE + nx));
      }
    }
  }
}
function wallBetween(ax, ay, bx, by) { return WALL_EDGES.has(edgeKey(ay * SIZE + ax, by * SIZE + bx)); }

// Точные препятствия для Томаса, в метрах: круги и прямоугольники с диапазоном высоты.
// Их заполняет glade.js по настоящим размерам. Тайлы BLOCKED выше нужны только жителям.
const COLLIDERS = [];
function addCircle(x, z, r, y0 = -50, y1 = 100) { COLLIDERS.push({ round: true, x, z, r, y0, y1 }); }
function addBox(cx, cz, w, d, y0 = -50, y1 = 100) { COLLIDERS.push({ round: false, x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, y0, y1 }); }
