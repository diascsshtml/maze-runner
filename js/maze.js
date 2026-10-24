// Лабиринт: генерация, секторы, ночной сдвиг стен.
// Мир — сетка тайлов SIZE×SIZE. Клетки лабиринта лежат на нечётных координатах,
// стены между клетками — на чётных. В центре открытая поляна — Глэйд.

const CELLS = 39;
const SIZE = CELLS * 2 + 1;            // 79 тайлов по стороне
const MID = CELLS;                     // центральный тайл (39) — там стоит Ящик
const MID_CELL = (CELLS - 1) / 2;
const GLADE_LO = 13, GLADE_HI = 25;    // клетки Глэйда (включительно), 13×13
const GLADE_T0 = GLADE_LO * 2 + 1, GLADE_T1 = GLADE_HI * 2 + 1;   // тайлы Глэйда 27..51 (87.5 м)
// IVY — проход, затянутый плющом (с виду стена); MARK — основание ориентира в центре площади (не пройти)
const T = { WALL: 0, FLOOR: 1, GLADE: 2, GATE: 3, EXIT: 4, IVY: 7, MARK: 8 };
const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

// Ворота Глэйда. vertical — створки едут по вертикали (ворота в западной/восточной стене)
const GATES = [
  { x: MID, y: GLADE_LO * 2, vertical: false, name: 'Северные' },
  { x: GLADE_HI * 2 + 2, y: MID, vertical: true, name: 'Восточные' },
  { x: MID, y: GLADE_HI * 2 + 2, vertical: false, name: 'Южные' },
  { x: GLADE_LO * 2, y: MID, vertical: true, name: 'Западные' },
];

// Лабиринт круглый, как в фильме: 8 секторов-«долек» вокруг квадратного Глэйда.
// Сектор 1 смотрит на север, дальше по часовой стрелке; 0 — Глэйд.
const MAZE_R = 19.35;                  // радиус Лабиринта в клетках
const CODE_WORDS = ['FLOAT', 'CATCH', 'BLEED', 'DEATH', 'STRETCH', 'PUSH'];

// Характер секторов: у каждого свои стены и пол (walls.js), приметы и ориентир на площади (mazedecor.js).
// loops — сколько лишних проходов: в Обвальном много обходов, в Когтистом — тупик на тупике
const SECTOR_THEMES = [null,
  { name: 'Плющевой', loops: 0.07, ivy: 3, landmark: 'lm_tree_giant', lm: 'Дерево-великан', text: 'Стены сплошь в плюще, под ногами трава. Плющ может прятать проход.' },
  { name: 'Обвальный', loops: 0.15, ivy: 1, landmark: 'lm_slab', lm: 'Упавшая плита', text: 'Стены осыпаются, кругом обломки. Зато много обходных путей.' },
  { name: 'Ржавый', loops: 0.08, ivy: 1, landmark: 'lm_mast', lm: 'Ржавая мачта', text: 'Ржавые трубы вдоль стен, решётки в полу. Над стенами видна мачта с красным огнём.' },
  { name: 'Сырой', loops: 0.09, ivy: 1, landmark: 'lm_pool', lm: 'Затопленная площадь', text: 'Стены мокрые и тёмные, под ногами стоит вода.' },
  { name: 'Корни', loops: 0.05, ivy: 2, landmark: 'lm_tree_dead', lm: 'Мёртвое дерево', text: 'Корни пробили стены и ползут по полу. Над стенами — голые ветви мёртвого дерева.' },
  { name: 'Пепельный', loops: 0.06, ivy: 1, landmark: 'lm_camp', lm: 'Сгоревший лагерь', text: 'Стены в копоти, пол в пепле. Здесь когда-то ночевали бегуны.' },
  { name: 'Меловой', loops: 0.11, ivy: 1, landmark: 'lm_column', lm: 'Сломанная колонна', text: 'Светлый камень в лишайнике, сухая пыль. Над стенами торчит сломанная колонна.' },
  { name: 'Когтистый', loops: 0.02, ivy: 1, landmark: 'lm_gear', lm: 'Гигантская шестерня', text: 'Глубокие царапины на стенах, тупик за тупиком. Здесь гриверы чувствуют себя дома.' },
];

function rand(n) { return Math.floor(Math.random() * n); }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function inGlade(cx, cy) {
  return cx >= GLADE_LO && cx <= GLADE_HI && cy >= GLADE_LO && cy <= GLADE_HI;
}
function validCell(cx, cy) {
  return cx >= 0 && cy >= 0 && cx < CELLS && cy < CELLS && !inGlade(cx, cy) &&
    Math.hypot(cx - MID_CELL, cy - MID_CELL) <= MAZE_R;
}
function sectorByAngle(dx, dy) {
  const a = Math.atan2(dy, dx) + Math.PI / 2 + Math.PI / 8;
  return 1 + Math.floor((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4));
}
function sectorOfCell(cx, cy) { return inGlade(cx, cy) ? 0 : sectorByAngle(cx - MID_CELL, cy - MID_CELL); }
function sectorOfTile(x, y) {
  if (x >= GLADE_T0 - 1 && x <= GLADE_T1 + 1 && y >= GLADE_T0 - 1 && y <= GLADE_T1 + 1) return 0;
  return sectorByAngle(x - MID, y - MID);
}
// Сколько клеток от клетки до стены Глэйда
function gladeDistance(cx, cy) {
  return Math.max(GLADE_LO - cx, cx - GLADE_HI, GLADE_LO - cy, cy - GLADE_HI);
}

const Maze = {
  tiles: new Uint8Array(SIZE * SIZE),
  explored: new Uint8Array(SIZE * SIZE),
  exit: null,

  at(x, y) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return T.WALL;
    return this.tiles[y * SIZE + x];
  },
  set(x, y, v) { this.tiles[y * SIZE + x] = v; },
  isExplored(x, y) { return this.explored[y * SIZE + x] === 1; },

  generate() {
    this.tiles.fill(T.WALL);
    this.explored.fill(0);
    const cells = [];
    for (let cy = 0; cy < CELLS; cy++) {
      for (let cx = 0; cx < CELLS; cx++) {
        if (!validCell(cx, cy)) continue;
        this.set(cx * 2 + 1, cy * 2 + 1, T.FLOOR);
        cells.push([cx, cy]);
      }
    }
    for (let y = GLADE_T0; y <= GLADE_T1; y++) {
      for (let x = GLADE_T0; x <= GLADE_T1; x++) this.set(x, y, T.GLADE);
    }
    this.carve(cells);
    this.addLoops(cells);
    this.makePlazas();
    this.makeIvy();
    for (const g of GATES) this.set(g.x, g.y, T.GATE);

    // Выход прячется во внешней стене круга: стена между крайней клеткой и пустотой снаружи
    const edge = [];
    for (const [cx, cy] of cells) {
      for (const d of DIRS) {
        const nx = cx + d.x, ny = cy + d.y;
        if (!validCell(nx, ny) && !inGlade(nx, ny)) edge.push({ x: cx * 2 + 1 + d.x, y: cy * 2 + 1 + d.y });
      }
    }
    this.exit = edge[rand(edge.length)];
  },

  // Случайное остовное дерево (поиск в глубину) внутри набора клеток
  carve(cells) {
    const inSet = new Set(cells.map(([cx, cy]) => cy * CELLS + cx));
    const seen = new Set();
    const start = cells[rand(cells.length)];
    const stack = [start];
    seen.add(start[1] * CELLS + start[0]);
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const d = shuffle(DIRS.slice()).find(d => {
        const nx = cx + d.x, ny = cy + d.y;
        if (nx < 0 || ny < 0 || nx >= CELLS || ny >= CELLS) return false;
        const k = ny * CELLS + nx;
        return inSet.has(k) && !seen.has(k);
      });
      if (!d) { stack.pop(); continue; }
      this.set(cx * 2 + 1 + d.x, cy * 2 + 1 + d.y, T.FLOOR);
      seen.add((cy + d.y) * CELLS + cx + d.x);
      stack.push([cx + d.x, cy + d.y]);
    }
  },

  // Лишние проходы, чтобы от гриверов можно было уйти кругом; сколько — зависит от сектора
  addLoops(cells) {
    const inSet = new Set(cells.map(([cx, cy]) => cy * CELLS + cx));
    for (const [cx, cy] of cells) {
      const chance = SECTOR_THEMES[sectorOfCell(cx, cy)].loops;
      for (const d of [DIRS[1], DIRS[2]]) {
        const nx = cx + d.x, ny = cy + d.y;
        if (nx >= CELLS || ny >= CELLS || !inSet.has(ny * CELLS + nx)) continue;
        if (Math.random() < chance) this.set(cx * 2 + 1 + d.x, cy * 2 + 1 + d.y, T.FLOOR);
      }
    }
  },

  // Площадь 2×2 клетки: четыре внутренние стены убраны, в центре — основание ориентира
  openPlaza(cx, cy) {
    const x = cx * 2 + 1, y = cy * 2 + 1;
    for (const [dx, dy] of [[1, 0], [0, 1], [2, 1], [1, 2]]) this.set(x + dx, y + dy, T.FLOOR);
    this.set(x + 1, y + 1, T.MARK);
  },
  // По площади с ориентиром в каждом секторе — не у Глэйда и не у внешней стены
  makePlazas() {
    for (let s = 1; s <= 8; s++) {
      const cands = [];
      for (let cy = 0; cy < CELLS - 1; cy++) {
        for (let cx = 0; cx < CELLS - 1; cx++) {
          const four = [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1]];
          if (!four.every(([a, b]) => validCell(a, b) && sectorOfCell(a, b) === s && gladeDistance(a, b) >= 4)) continue;
          if (Math.hypot(cx + 0.5 - MID_CELL, cy + 0.5 - MID_CELL) > MAZE_R - 2.5) continue;
          cands.push([cx, cy]);
        }
      }
      if (cands.length) this.openPlaza(...cands[rand(cands.length)]);
    }
  },
  // Центры площадей — по тайлам-основаниям (так их можно восстановить и из сохранения)
  plazas() {
    const out = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (this.tiles[y * SIZE + x] === T.MARK) out.push({ x, y, sector: sectorOfTile(x, y) });
    return out;
  },

  // Сколько шагов по коридорам между клетками (не дальше limit) — чтобы проход за плющом срезал длинный путь
  cellDistance(a, b, limit) {
    const seen = new Set([a[1] * CELLS + a[0]]);
    let front = [a];
    for (let step = 1; step <= limit; step++) {
      const next = [];
      for (const [cx, cy] of front) {
        for (const d of DIRS) {
          const nx = cx + d.x, ny = cy + d.y, k = ny * CELLS + nx;
          if (seen.has(k) || !validCell(nx, ny) || this.at(cx * 2 + 1 + d.x, cy * 2 + 1 + d.y) === T.WALL) continue;
          if (nx === b[0] && ny === b[1]) return step;
          seen.add(k);
          next.push([nx, ny]);
        }
      }
      front = next;
    }
    return Infinity;
  },
  // Тайные проходы: стена между двумя клетками затянута плющом, и сквозь неё можно пройти
  makeIvy(only = 0) {
    for (let s = 1; s <= 8; s++) {
      if (only && s !== only) continue;
      const cands = [];
      for (let cy = 0; cy < CELLS; cy++) {
        for (let cx = 0; cx < CELLS; cx++) {
          if (!validCell(cx, cy) || sectorOfCell(cx, cy) !== s || gladeDistance(cx, cy) < 2) continue;
          for (const d of [DIRS[1], DIRS[2]]) {
            const nx = cx + d.x, ny = cy + d.y, wx = cx * 2 + 1 + d.x, wy = cy * 2 + 1 + d.y;
            if (!validCell(nx, ny) || sectorOfCell(nx, ny) !== s || this.at(wx, wy) !== T.WALL) continue;
            if (DIRS.some(e => this.at(wx + e.x, wy + e.y) === T.MARK)) continue;
            cands.push([cx, cy, nx, ny, wx, wy]);
          }
        }
      }
      shuffle(cands);
      let made = 0;
      for (const [cx, cy, nx, ny, wx, wy] of cands.slice(0, 40)) {
        if (made >= SECTOR_THEMES[s].ivy) break;
        if (this.cellDistance([cx, cy], [nx, ny], 14) <= 14) continue;
        this.set(wx, wy, T.IVY);
        made++;
      }
    }
  },

  // Ночной сдвиг: сектор перестраивается заново, его карта стирается
  shiftSector(s) {
    const inS = (cx, cy) => validCell(cx, cy) && sectorOfCell(cx, cy) === s;
    const cells = [];
    for (let cy = 0; cy < CELLS; cy++) {
      for (let cx = 0; cx < CELLS; cx++) if (inS(cx, cy)) cells.push([cx, cy]);
    }
    const border = [], ivy = [];
    for (const [cx, cy] of cells) {
      for (const d of DIRS) {
        const nx = cx + d.x, ny = cy + d.y;
        if (inS(nx, ny)) {
          if (this.at(cx * 2 + 1 + d.x, cy * 2 + 1 + d.y) === T.IVY) ivy.push([cx * 2 + 1 + d.x, cy * 2 + 1 + d.y]);
          this.set(cx * 2 + 1 + d.x, cy * 2 + 1 + d.y, T.WALL);
        } else if (validCell(nx, ny)) {
          border.push({ x: cx * 2 + 1 + d.x, y: cy * 2 + 1 + d.y });
        }
      }
    }
    this.carve(cells);
    this.addLoops(cells);
    // Площадь и проходы за плющом сдвиг не трогает
    for (const p of this.plazas()) if (p.sector === s) this.openPlaza((p.x - 2) / 2, (p.y - 2) / 2);
    for (const [x, y] of ivy) this.set(x, y, T.IVY);
    for (let i = 0; i < 3 && border.length; i++) {
      const b = border[rand(border.length)];
      this.set(b.x, b.y, this.at(b.x, b.y) === T.WALL ? T.FLOOR : T.WALL);
    }
    this.ensureConnected();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) if (sectorOfTile(x, y) === s) this.explored[y * SIZE + x] = 0;
    }
  },

  // Гарантирует, что из Глэйда можно дойти до каждой клетки
  ensureConnected() {
    const reached = new Uint8Array(CELLS * CELLS);
    const queue = [[GLADE_LO - 1, MID_CELL]];
    reached[MID_CELL * CELLS + GLADE_LO - 1] = 1;
    for (;;) {
      while (queue.length) {
        const [cx, cy] = queue.pop();
        for (const d of DIRS) {
          const nx = cx + d.x, ny = cy + d.y;
          if (!validCell(nx, ny) || reached[ny * CELLS + nx]) continue;
          if (this.at(cx * 2 + 1 + d.x, cy * 2 + 1 + d.y) === T.WALL) continue;
          reached[ny * CELLS + nx] = 1;
          queue.push([nx, ny]);
        }
      }
      const cands = [];
      for (let cy = 0; cy < CELLS; cy++) {
        for (let cx = 0; cx < CELLS; cx++) {
          if (!validCell(cx, cy) || !reached[cy * CELLS + cx]) continue;
          for (const d of DIRS) {
            const nx = cx + d.x, ny = cy + d.y;
            if (validCell(nx, ny) && !reached[ny * CELLS + nx]) cands.push([cx, cy, d]);
          }
        }
      }
      if (!cands.length) return;
      const [cx, cy, d] = cands[rand(cands.length)];
      this.set(cx * 2 + 1 + d.x, cy * 2 + 1 + d.y, T.FLOOR);
      reached[(cy + d.y) * CELLS + cx + d.x] = 1;
      queue.push([cx + d.x, cy + d.y]);
    }
  },

  // Фрагменты кода: по одному в шести разных секторах, подальше от Глэйда
  placeItems() {
    const sectors = shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, CODE_WORDS.length);
    return sectors.map((s, i) => {
      const cands = [];
      for (let cy = 0; cy < CELLS; cy++) {
        for (let cx = 0; cx < CELLS; cx++) {
          if (validCell(cx, cy) && sectorOfCell(cx, cy) === s && gladeDistance(cx, cy) >= 4) cands.push([cx, cy]);
        }
      }
      const [cx, cy] = cands[rand(cands.length)];
      return { x: cx * 2 + 1, y: cy * 2 + 1, sector: s, word: CODE_WORDS[i], taken: false };
    });
  },

  reveal(px, py, r) {
    const x0 = Math.max(0, Math.round(px) - r), x1 = Math.min(SIZE - 1, Math.round(px) + r);
    const y0 = Math.max(0, Math.round(py) - r), y1 = Math.min(SIZE - 1, Math.round(py) + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.explored[y * SIZE + x] = 1;
    }
  },
};
