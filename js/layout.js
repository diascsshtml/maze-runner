// Планировка Глэйда по схеме из фильма (границы берутся из GLADE_T0..GLADE_T1; север сверху).
//  Север: поляна. СЗ — кузница, спальни, Кутузка; З — столовая и костёр, лазарет на опушке; СВ — плантации,
//  под ними кладовая и сарай с инструментами. Центр: Ящик и Башня-дерево.
//  Юг: густой лес, река с мостиком, бродом и упавшим деревом, кладбище, картохранилище, живодерня.
//  Постройки связаны тропами; между ними холмы, низины с грязью и лужами.

const GLADE_LAYOUT_SCALE = (GLADE_HI - GLADE_LO + 1) / 13;
const scaleGladeOffset = v => Math.round(v * GLADE_LAYOUT_SCALE);
// Глэйд растёт расстояниями (тропы, река, места построек), а дома, двери, мебель и Башня — в человеческий рост
const HOUSE_SCALE = 1;
const gt = (dx, dy) => ({ x: MID + scaleGladeOffset(dx), y: MID + scaleGladeOffset(dy) });
const rect = (x0, y0, x1, y1) => ({ x0: MID + scaleGladeOffset(x0), y0: MID + scaleGladeOffset(y0), x1: MID + scaleGladeOffset(x1), y1: MID + scaleGladeOffset(y1) });
const inRect = (p, r, m = 0) => p.x >= r.x0 - m && p.x <= r.x1 + m && p.y >= r.y0 - m && p.y <= r.y1 + m;

// Дома: прямоугольник в тайлах и сторона двери. Стены стоят чуть внутри прямоугольника.
const HOUSES = [
  // blenderSize/doorOffset — размеры Blender-моделей домов в метрах (дома не растут вместе с Глэйдом).
  { id: 'forge', name: 'Кузница', r: rect(-11, -11, -8, -9), door: 'E', blenderSize: [13, 9.5], blenderDoorOffset: 0 },
  { id: 'bunk1', name: 'Спальня', r: rect(-11, -7, -8, -6), door: 'E', blenderSize: [13, 6], blenderDoorOffset: -1.75 },
  { id: 'bunk2', name: 'Спальня', r: rect(-6, -7, -4, -6), door: 'S', blenderSize: [6, 9.5], blenderDoorOffset: 0 },
  { id: 'dining', name: 'Столовая', r: rect(-11, -4, -7, -2), door: 'E', blenderSize: [16.5, 9.5], blenderDoorOffset: 0 },
  { id: 'storage', name: 'Картохранилище', r: rect(1, 7, 3, 9), door: 'W', blenderSize: [9.5, 9.5], blenderDoorOffset: 0 },
  { id: 'blood', name: 'Живодерня', r: rect(6, 5, 8, 6), door: 'W', blenderSize: [9.5, 6], blenderDoorOffset: 1.75 },
  // Новые — в конце списка: на номера первых шести ссылается остальной код
  { id: 'pantry', name: 'Кладовая', r: rect(6, -3, 8, -2), door: 'W', blenderSize: [9.5, 6], blenderDoorOffset: 1.75 },
  { id: 'shed', name: 'Сарай', r: rect(10, -3, 11, -2), door: 'W', blenderSize: [6, 6], blenderDoorOffset: 1.75 },
  { id: 'medhut', name: 'Лазарет', r: rect(-11, 1, -9, 2), door: 'E', blenderSize: [9.5, 6], blenderDoorOffset: -1.75 },
];
// Навигационный footprint — по габаритам модели дома; размер сетки округляется вверх,
// чтобы жители не могли прокладывать путь сквозь стены.
const HOUSE_TILE_METERS = 3.5;
for (const h of HOUSES) {
  const [baseW, baseD] = h.blenderSize;
  const swap = h.door === 'S' || h.door === 'N';
  const countX = Math.ceil((swap ? baseD : baseW) * HOUSE_SCALE / HOUSE_TILE_METERS);
  const countY = Math.ceil((swap ? baseW : baseD) * HOUSE_SCALE / HOUSE_TILE_METERS);
  const cx = (h.r.x0 + h.r.x1) / 2, cy = (h.r.y0 + h.r.y1) / 2;
  h.r = {
    x0: Math.round(cx - (countX - 1) / 2), x1: Math.round(cx - (countX - 1) / 2) + countX - 1,
    y0: Math.round(cy - (countY - 1) / 2), y1: Math.round(cy - (countY - 1) / 2) + countY - 1,
  };
}
const DOOR_DIR = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
for (const h of HOUSES) {
  const r = h.r, [ox, oy] = DOOR_DIR[h.door];
  const midX = (r.x0 + r.x1) / 2, midY = (r.y0 + r.y1) / 2;
  const off = h.blenderDoorOffset * HOUSE_SCALE / HOUSE_TILE_METERS;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const alongX = h.door === 'E' ? clamp(Math.round(midY - off), r.y0, r.y1)
    : h.door === 'W' ? clamp(Math.round(midY + off), r.y0, r.y1)
      : h.door === 'S' ? clamp(Math.round(midX + off), r.x0, r.x1)
        : clamp(Math.round(midX - off), r.x0, r.x1);
  h.doorTile = { x: ox ? (ox > 0 ? r.x1 : r.x0) : alongX, y: oy ? (oy > 0 ? r.y1 : r.y0) : alongX };
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
  // Река: ломаная в тайлах (dx, dy), с запада на восток через южный лес; в игре сглаживается в плавную линию
  river: [[-12.6, 9.0], [-10.6, 9.2], [-9, 9.9], [-7.2, 10.6], [-5.4, 10.9], [-3.7, 10.4], [-1.9, 10.0], [0, 10.25],
    [1.9, 10.9], [3.8, 11.3], [5.5, 10.9], [7, 10.2], [8.8, 9.6], [10.8, 9.8], [12.6, 10.3]],
  ford: gt(-7, 11),         // брод: широко, мелко, камни-переступы
  log: gt(6, 11),           // упавшее дерево через реку
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

// Рельеф (тайлы относительно Ящика; r — радиус в тайлах, h и d — метры):
// холмы, низины, где собирается вода, лужи и грязь
LAYOUT.hills = [
  { x: 9, y: 1.2, r: 3.2, h: 1.6 },          // бугор на восточном лугу, через него идёт тропа к воротам
  { x: -8.6, y: 4.6, r: 3.8, h: 1.3 },       // пригорок с кладбищем
  { x: -2.2, y: -9.2, r: 2.8, h: 1.0 },      // северный пригорок у Кутузки
];
LAYOUT.hollows = [
  { x: -10.4, y: 8.0, r: 2.0, d: 0.6 },      // сырая низина в лесу у реки
  { x: 4.4, y: 9.4, r: 1.5, d: 0.45 },
  { x: -1.6, y: -6.8, r: 1.4, d: 0.3 },
  { x: 3.0, y: 1.6, r: 1.2, d: 0.25 },
];
LAYOUT.puddles = [
  { x: -10.4, y: 8.0, r: 0.5 }, { x: 4.4, y: 9.4, r: 0.4 }, { x: -1.6, y: -6.8, r: 0.35 }, { x: 3.0, y: 1.6, r: 0.3 },
  { x: 0.3, y: -9.6, r: 0.28 }, { x: -7.2, y: -7.6, r: 0.26 }, { x: -4.9, y: 1.6, r: 0.28 }, { x: 0.2, y: 5.0, r: 0.25 },
];
LAYOUT.mud = [
  ...LAYOUT.hollows.map(h => ({ x: h.x, y: h.y, r: h.r * 1.25 })),
  ...LAYOUT.puddles.map(p => ({ x: p.x, y: p.y, r: p.r * 2.2 })),
  { x: 9.5, y: 5.5, r: 1.6 },                // загон: свиньи изрыли землю
  { x: -7.1, y: 9.4, r: 1.3 }, { x: -7.0, y: 12.2, r: 1.1 },   // спуски к броду
  { x: 0, y: 9.0, r: 0.7 }, { x: 0, y: 11.5, r: 0.7 },         // концы мостика
];

// Тропы (точки в тайлах относительно Ящика, w — ширина в метрах). Широкие — к воротам и главным постройкам,
// узкие — тропинки, протоптанные напрямик
LAYOUT.paths = [
  { w: 1.9, pts: [[0, -12.9], [0.25, -10.5], [-0.2, -8], [0.35, -5.6], [0.1, -3.2], [0, -1.5]] },            // к Северным воротам
  { w: 1.8, pts: [[0, 1.5], [0.35, 3.5], [-0.25, 5.8], [0.1, 7.8], [0, 9], [0, 11.2], [0.3, 12.9]] },        // мостик, Южные ворота
  { w: 1.8, pts: [[-1.5, 0], [-3.5, 0.35], [-6, -0.15], [-8.5, 0.25], [-11, -0.1], [-12.9, 0]] },            // к Западным воротам
  { w: 1.8, pts: [[1.5, 0], [3.5, -0.3], [6, 0.25], [9, -0.2], [11, 0.1], [12.9, 0]] },                      // через бугор к Восточным
  { w: 1.4, pts: [[-1.2, -1.2], [-2.3, -2.2], [-3.0, -2.7]] },                                              // к костру
  { w: 1.3, pts: [[-5.2, -3.1], [-6.4, -3.0]] },                                                            // в столовую
  { w: 1.3, pts: [[-4.6, -4.6], [-5.1, -5.3], [-6.3, -5.8], [-7.1, -6.4], [-7.3, -8.2], [-7.1, -10.1], [-6.6, -11.2]] }, // спальни, кузница, стройка
  { w: 1.0, pts: [[-7.2, -9.0], [-6.0, -9.4], [-5.2, -9.4]] },                                              // к Кутузке
  { w: 1.2, pts: [[0.2, -6.5], [-1.8, -6.4], [-3.6, -5.6], [-4.7, -5.0]] },                                 // напрямик от северной тропы
  { w: 1.3, pts: [[0.2, -2.6], [1.6, -2.2], [2.9, -2.6], [3.8, -3.3], [4.0, -4.2]] },                       // в плантации
  { w: 1.1, pts: [[3.4, -2.8], [4.4, -2.2], [5.2, -2.0]] },                                                 // в кладовую
  { w: 1.1, pts: [[9.0, -0.1], [9.2, -1.2], [9.0, -2.0]] },                                                 // в сарай
  { w: 1.3, pts: [[0.3, 3.8], [2.2, 4.4], [4.0, 5.3], [5.2, 6.0]] },                                        // к живодерне
  { w: 1.0, pts: [[5.0, 5.6], [5.6, 4.3], [8.3, 3.7]] },                                                    // к загону
  { w: 1.2, pts: [[-3.5, 0.3], [-4.6, 1.4], [-5.6, 2.8], [-6.2, 4.5], [-6.6, 6.0], [-7.0, 8.2], [-7.1, 9.6], [-7.0, 11.4], [-7.4, 12.9]] }, // кладбище и брод
  { w: 1.1, pts: [[-5.0, 1.9], [-6.6, 2.1], [-8.0, 2.0]] },                                                 // в лазарет
  { w: 1.2, pts: [[-1.0, 1.0], [-2.0, 1.3], [-2.6, 1.6]] },                                                 // к колоде
  { w: 0.9, pts: [[5.4, 6.4], [5.8, 8.0], [6.0, 9.4], [6.0, 12.5]] },                                       // к упавшему дереву
  { w: 0.9, pts: [[-1.0, 4.0], [-2.4, 5.0], [-3.0, 6.6], [-2.2, 8.2], [-1.0, 9.2]] },                       // лесная тропинка
  { w: 0.9, pts: [[0.6, 6.1], [2.8, 6.1], [4.0, 7.0]] },
];

LAYOUT.river = LAYOUT.river.map(([x, y]) => [x * GLADE_LAYOUT_SCALE, y * GLADE_LAYOUT_SCALE]);
for (const zones of [LAYOUT.hills, LAYOUT.hollows, LAYOUT.puddles, LAYOUT.mud]) {
  for (const p of zones) { p.x *= GLADE_LAYOUT_SCALE; p.y *= GLADE_LAYOUT_SCALE; p.r *= GLADE_LAYOUT_SCALE; }
}
for (const path of LAYOUT.paths) path.pts = path.pts.map(([x, y]) => [x * GLADE_LAYOUT_SCALE, y * GLADE_LAYOUT_SCALE]);
// Расстояние (в тайлах) от точки до края ближайшей тропы — чтобы деревья не росли посреди дороги
function pathDistTiles(x, y) {
  let best = 1e9;
  for (const P of LAYOUT.paths) {
    for (let i = 0; i < P.pts.length - 1; i++) {
      const ax = MID + P.pts[i][0], ay = MID + P.pts[i][1], bx = MID + P.pts[i + 1][0], by = MID + P.pts[i + 1][1];
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t) - P.w / 2 / 3.5);
    }
  }
  return best;
}

// Указатели на развилках: где стоит столб и куда показывают доски
LAYOUT.signs = [
  { at: [1.4, 1.4], to: [['Плантации', 4, -4], ['Живодерня', 5, 6], ['Картохранилище', 0, 8]] },
  { at: [-6.6, -0.65], to: [['Столовая', -6, -3], ['Спальни', -6, -6], ['Кузница', -7, -10], ['Кладбище', -6, 4]] },
  { at: [-5.9, 6.7], to: [['Брод', -7, 11], ['Лазарет', -8, 2]] },
];
for (const sign of LAYOUT.signs) {
  sign.at = sign.at.map(v => v * GLADE_LAYOUT_SCALE);
  sign.to = sign.to.map(([name, x, y]) => [name, x * GLADE_LAYOUT_SCALE, y * GLADE_LAYOUT_SCALE]);
}

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
  [LAYOUT.graveyard, 1], [HOUSES[4].r, 1], [HOUSES[5].r, 1], [LAYOUT.pen, 1], [rect(-4, 1, -1, 3), 0], [HOUSES[8].r, 1],
];
const forestFree = (p, m = 0) => !FOREST_CLEAR.some(([r, k]) => inRect(p, r, k + m)) && riverDistTiles(p.x, p.y) > 0.85 &&
  pathDistTiles(p.x, p.y) > 0.35 + m && Math.hypot(p.x - LAYOUT.ford.x, p.y - LAYOUT.ford.y) > 1.8 && Math.hypot(p.x - LAYOUT.log.x, p.y - LAYOUT.log.y) > 1.6;
for (let dy = 1; dy <= 12; dy++) {
  for (let dx = -12; dx <= 12; dx++) {
    const p = gt(dx, dy);
    if (dx !== 0 && forestFree(p)) LAYOUT.trees.push(p);
  }
}
for (let dy = 1; dy <= 11; dy++) {
  for (let dx = -12; dx <= 11; dx++) {
    const p = { x: MID + (dx + 0.5) * GLADE_LAYOUT_SCALE + (thash(dx, dy) - 0.5) * 0.3, y: MID + (dy + 0.5) * GLADE_LAYOUT_SCALE + (thash(dy, dx) - 0.5) * 0.3 };
    if (Math.abs(p.x - MID) < 1.1 || thash(dx * 7, dy * 3) > 0.62 || !forestFree(p, 0.2)) continue;
    LAYOUT.cornerTrees.push(p);
  }
}
for (const dy of [-12, -10, -8, -6]) LAYOUT.trees.push(gt(12, dy));     // полоса у восточной стены

// Ровные площадки для рельефа (в тайлах); Ящик строго на нуле
LAYOUT.flatZones = [
  ...HOUSES.map(h => ({ ...h.r, fall: 3, house: true })),
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
  medjackA: { ...gt(-10, 2), face: gt(-10, 1), act: 'talk' },      // медаки — в лазарете
  medjackB: { ...gt(-10, 1), face: gt(-10, 2), act: 'talk' },
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
  const swap = h.door === 'S' || h.door === 'N';
  const roomW = (swap ? h.blenderSize[1] : h.blenderSize[0]) * HOUSE_SCALE;
  const centerX = (h.r.x0 + h.r.x1) / 2;
  const bedHalfLength = 2.05 / 2, wallInset = 0.32 * HOUSE_SCALE;
  const maxBedOffset = Math.max(0, roomW / 2 - wallInset - bedHalfLength) / HOUSE_TILE_METERS;
  for (let x = h.r.x0; x <= h.r.x1; x++) {
    for (const y of [h.r.y0, h.r.y1]) {
      if (x === h.doorTile.x && y === h.doorTile.y) continue;
      // Кровати вдоль стен; крайние места сдвигаются внутрь по реальному Blender-габариту.
      const inward = y === h.r.y0 ? 1 : -1;
      const wx = Math.max(centerX - maxBedOffset, Math.min(centerX + maxBedOffset, x));
      BEDS.push({ x, y, wx, wy: y + inward * 0.19, yaw: 0, house: h.id });
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
// Постройка, которую сейчас ставят (settlement.js, withStruct): её преграды выключаются, пока её нет
let CUR_STRUCT = null;
const BLOCK_OWNER = new Map();
const blockTile = p => { BLOCKED.add(p.y * SIZE + p.x); if (CUR_STRUCT) BLOCK_OWNER.set(p.y * SIZE + p.x, CUR_STRUCT); };
const structOn = id => typeof isBuilt !== 'function' || isBuilt(id);
function blockRect(r) { for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) BLOCKED.add(y * SIZE + x); }
blockRect(LAYOUT.pen);
blockRect(rect(1, -5, 3, -3));          // корни и опоры Башни
for (const p of [LAYOUT.slammer, LAYOUT.campfire, LAYOUT.chopBlock, LAYOUT.woodpile, LAYOUT.scaffold, ...LAYOUT.torches, ...LAYOUT.trees]) blockTile(p);
for (let y = GLADE_T0; y <= GLADE_T1; y++) {
  for (let x = GLADE_T0; x <= GLADE_T1; x++) {
    // По мостику и через брод ходят: мостик закрывает и тайл у южного берега
    const crossing = (x === LAYOUT.bridge.x && Math.abs(y - LAYOUT.bridge.y) <= 1) || (x === LAYOUT.ford.x && Math.abs(y - LAYOUT.ford.y) <= 1);
    if (riverDistTiles(x, y) < 0.7 && !crossing) BLOCKED.add(y * SIZE + x);
  }
}
// Внутри домов: очаг и столы столовой, горн и наковальня кузницы, полки картохранилища
LAYOUT.interior = {
  hearth: gt(-11, -3), tables: [gt(-9, -4), gt(-9, -2)],
  furnace: gt(-11, -10), anvil: gt(-10, -10),
};
for (const t of [LAYOUT.interior.hearth, ...LAYOUT.interior.tables, LAYOUT.interior.furnace, LAYOUT.interior.anvil]) blockTile(t);
for (let i = SEATS.length - 1; i >= 0; i--) if (BLOCKED.has(SEATS[i].y * SIZE + SEATS[i].x)) SEATS.splice(i, 1);
// Хозяева преград из планировки: загон, Кутузка, костёр, колода, стройка, факелы, мебель столовой и кузницы
{
  const own = (p, id) => BLOCK_OWNER.set(p.y * SIZE + p.x, id);
  for (let y = LAYOUT.pen.y0; y <= LAYOUT.pen.y1; y++) for (let x = LAYOUT.pen.x0; x <= LAYOUT.pen.x1; x++) own({ x, y }, 'pen');
  own(LAYOUT.slammer, 'slammer');
  own(LAYOUT.campfire, 'campfire');
  own(LAYOUT.chopBlock, 'woodpile');
  own(LAYOUT.woodpile, 'woodpile');
  own(LAYOUT.scaffold, 'scaffold');
  for (const t of LAYOUT.torches) own(t, 'torches');
  for (const t of [LAYOUT.interior.hearth, ...LAYOUT.interior.tables]) own(t, 'dining');
  for (const t of [LAYOUT.interior.furnace, LAYOUT.interior.anvil]) own(t, 'forge');
}

function decoBlocked(x, y) {
  const k = y * SIZE + x;
  return BLOCKED.has(k) && (!BLOCK_OWNER.has(k) || structOn(BLOCK_OWNER.get(k)));
}

// Стены домов для жителей: запрещённые переходы между соседними тайлами (кроме двери)
const WALL_EDGES = new Map();          // ребро → дом: стены есть, только если дом построен
const edgeKey = (a, b) => a < b ? a * SIZE * SIZE + b : b * SIZE * SIZE + a;
for (const h of HOUSES) {
  const r = h.r;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (inRect({ x: nx, y: ny }, r)) continue;
        if (x === h.doorTile.x && y === h.doorTile.y && nx === h.doorOut.x && ny === h.doorOut.y) continue;
        WALL_EDGES.set(edgeKey(y * SIZE + x, ny * SIZE + nx), h.id);
      }
    }
  }
}
function wallBetween(ax, ay, bx, by) {
  const h = WALL_EDGES.get(edgeKey(ay * SIZE + ax, by * SIZE + bx));
  return h !== undefined && structOn(h);
}

// Точные препятствия для Томаса, в метрах: круги и прямоугольники с диапазоном высоты.
// Их заполняет glade.js по настоящим размерам. Тайлы BLOCKED выше нужны только жителям.
const COLLIDERS = [];
function addCircle(x, z, r, y0 = -50, y1 = 100) { COLLIDERS.push({ round: true, x, z, r, y0, y1, struct: CUR_STRUCT }); }
function addBox(cx, cz, w, d, y0 = -50, y1 = 100) { COLLIDERS.push({ round: false, x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, y0, y1, struct: CUR_STRUCT }); }
