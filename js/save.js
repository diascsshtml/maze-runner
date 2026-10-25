// Сохранение: игра записывается на рассвете и на закате (и вручную из паузы).
// Сохраняются Лабиринт и открытая карта, предметы, сумка, запасы и постройки, задания, доверие,
// тайники, погода и время суток. «Новая игра+» открывается после побега: Лабиринт становится злее,
// а прочитанные записки остаются в журнале.

const SAVE_KEY = 'maze-runner-save-v1', META_KEY = 'maze-runner-meta';
const LEGACY_SAVE_KEY = SAVE_KEY + '-before-location-expansion';
const Meta = { unlocked: 0, wins: 0, lore: new Set() };

function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY));
    if (m) Object.assign(Meta, { unlocked: m.unlocked || 0, wins: m.wins || 0, lore: new Set(m.lore || []) });
  } catch (e) { /* без мета-прогресса */ }
}
function saveMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify({ unlocked: Meta.unlocked, wins: Meta.wins, lore: [...Meta.lore] })); } catch (e) { /* без сохранения */ }
}

function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ничего */ } }

function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str) {
  const s = atob(str), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

function legacyGrid(data, mapBytes) {
  const side = Number(data.mapSide) || Math.round(Math.sqrt(mapBytes.length));
  if (side * side !== mapBytes.length || side % 2 !== 1) return null;
  if (side === SIZE) return null;
  const cells = (side - 1) / 2;
  const oldMid = (side - 1) / 2;
  const cellOffset = MID_CELL - (cells - 1) / 2;
  return { side, cells, oldMid, tileOffset: MID - oldMid, cellOffset, gladeCells: Number(data.gladeCells) || 13 };
}

function copyLegacyLayer(target, source, grid, circleOnly = false) {
  const maxR = ((grid.cells - 1) / 2 + 0.35) * 2 + 2;
  for (let y = 0; y < grid.side; y++) for (let x = 0; x < grid.side; x++) {
    if (circleOnly && Math.hypot(x - grid.oldMid, y - grid.oldMid) > maxR) continue;
    const nx = x + grid.tileOffset, ny = y + grid.tileOffset;
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
    target[ny * SIZE + nx] = source[y * grid.side + x];
  }
}

function carveLegacyExtension(source, grid) {
  const oldCenter = (grid.cells - 1) / 2, oldR = oldCenter + 0.35;
  const gladeLo = Math.floor((grid.cells - grid.gladeCells) / 2), gladeHi = gladeLo + grid.gladeCells - 1;
  const best = Array(9).fill(null);
  for (let cy = 0; cy < grid.cells; cy++) for (let cx = 0; cx < grid.cells; cx++) {
    if (cx >= gladeLo && cx <= gladeHi && cy >= gladeLo && cy <= gladeHi) continue;
    const r = Math.hypot(cx - oldCenter, cy - oldCenter);
    if (r < oldR - 1.35 || r > oldR + 0.01) continue;
    if (source[(cy * 2 + 1) * grid.side + cx * 2 + 1] !== T.FLOOR) continue;
    const sector = sectorByAngle(cx - oldCenter, cy - oldCenter);
    if (sector < 1 || sector > 8) continue;
    const angle = Math.atan2(cy - oldCenter, cx - oldCenter);
    const targetAngle = (sector - 3) * Math.PI / 4;
    const diff = Math.abs(Math.atan2(Math.sin(angle - targetAngle), Math.cos(angle - targetAngle)));
    const score = Math.abs(oldR - r) + diff * 1.5;
    if (!best[sector] || score < best[sector].score) best[sector] = { cx, cy, score };
  }
  const openStep = (ax, ay, bx, by) => {
    if (!validCell(bx, by)) return false;
    const dx = bx - ax, dy = by - ay;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    Maze.set(ax * 2 + 1, ay * 2 + 1, T.FLOOR);
    Maze.set(ax * 2 + 1 + dx, ay * 2 + 1 + dy, T.FLOOR);
    Maze.set(bx * 2 + 1, by * 2 + 1, T.FLOOR);
    return true;
  };
  for (let sector = 1; sector <= 8; sector++) {
    const start = best[sector];
    if (!start) continue;
    let x = start.cx + grid.cellOffset, y = start.cy + grid.cellOffset;
    const angle = Math.atan2(y - MID_CELL, x - MID_CELL);
    const ex = Math.round(MID_CELL + Math.cos(angle) * (MAZE_R - 1.2));
    const ey = Math.round(MID_CELL + Math.sin(angle) * (MAZE_R - 1.2));
    const dx = Math.abs(ex - x), dy = Math.abs(ey - y), sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
    let err = dx - dy;
    while (x !== ex || y !== ey) {
      const e2 = 2 * err, ax = x, ay = y;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x !== ax && y !== ay) {
        const mx = x, my = ay;
        if (!openStep(ax, ay, mx, my) || !openStep(mx, my, x, y)) break;
      } else if (!openStep(ax, ay, x, y)) break;
    }
  }
}

function migrateLegacyPositions(data, grid) {
  const oldT0 = Math.floor((grid.cells - grid.gladeCells) / 2) * 2 + 1;
  const oldT1 = oldT0 + grid.gladeCells * 2 - 2;
  // Глэйд мог быть 13×13 или 17×17 — растягиваем от его собственного размера к нынешнему
  const gScale = (GLADE_HI - GLADE_LO + 1) / grid.gladeCells;
  const mapAxis = v => v >= oldT0 - 1 && v <= oldT1 + 1
    ? MID + (v - grid.oldMid) * gScale
    : v + grid.tileOffset;
  const shiftPoint = p => { if (p) { p.x += grid.tileOffset; p.y += grid.tileOffset; } };
  if (data.player) { data.player.x = mapAxis(data.player.x); data.player.y = mapAxis(data.player.y); }
  for (const n of data.npcs || []) {
    for (const k of ['x', 'x0']) if (Number.isFinite(n[k])) n[k] = mapAxis(n[k]);
    for (const k of ['y', 'y0']) if (Number.isFinite(n[k])) n[k] = mapAxis(n[k]);
    // Индексы кроватей изменились вместе с расширением спален; новые индексы назначит текущая планировка.
    if (n.night === 'sleep') delete n.bed;
  }
  for (const it of data.codes || []) shiftPoint(it);
  const sec = data.secrets;
  if (sec) {
    for (const r of sec.rooms || []) { shiftPoint(r.door); shiftPoint(r.cell); shiftPoint(r.center); }
    for (const r of sec.symbols || []) shiftPoint(r.cell);
    for (const r of sec.traps || []) shiftPoint(r);
    sec.rubble = (sec.rubble || []).map(k => {
      const x = k % grid.side + grid.tileOffset, y = Math.floor(k / grid.side) + grid.tileOffset;
      return y * SIZE + x;
    });
  }
  const oldWorldCenter = grid.oldMid * S, newWorldCenter = MID * S, deltaWorld = grid.tileOffset * S;
  const oldWorldLo = (oldT0 - 1) * S, oldWorldHi = (oldT1 + 1) * S;
  for (const it of data.world || []) {
    const inGlade = it.x >= oldWorldLo && it.x <= oldWorldHi && it.z >= oldWorldLo && it.z <= oldWorldHi;
    if (inGlade) {
      it.x = newWorldCenter + (it.x - oldWorldCenter) * gScale;
      it.z = newWorldCenter + (it.z - oldWorldCenter) * gScale;
    } else { it.x += deltaWorld; it.z += deltaWorld; }
  }
}

function saveGame(quiet = false) {
  if (Game.state !== 'play' && Game.state !== 'pause' && Game.state !== 'ui') return false;
  const p = Game.player;
  const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
  const data = {
    v: 2, grid: CELLS, mapSide: SIZE, gladeCells: GLADE_HI - GLADE_LO + 1, ng: Game.ngPlus, t: Date.now(),
    game: pick(Game, ['day', 'phase', 'timeLeft', 'gate', 'shifted', 'warned', 'exitOpen', 'outsideNight', 'nightsOutside', 'teresaT', 'darkness', 'dusk']),
    player: pick(p, ['x', 'y', 'yaw', 'pitch', 'h', 'hearts', 'stamina', 'bleed']),
    maze: b64(Maze.tiles), explored: b64(Maze.explored), exit: Maze.exit,
    codes: Game.items.map(it => pick(it, ['x', 'y', 'sector', 'word', 'taken'])),
    inv: Items.inv.map(it => pick(it, ['type', 'full', 'fuel'])), held: Items.held, bag: Items.bag, mapRead: Items.mapRead,
    world: Items.world.map(it => pick(it, ['type', 'x', 'y', 'z', 'full', 'fuel', 'note', 'wild'])),
    secrets: {
      rooms: Secrets.rooms.map(r => pick(r, ['door', 'cell', 'd', 'sector', 'center', 'open'])),
      traps: Secrets.traps.map(t => pick(t, ['x', 'y', 'type', 'armed', 'seen'])),
      symbols: Secrets.symbols.map(s => pick(s, ['sector', 'cell', 'd', 'found'])),
      levers: Secrets.levers.map(l => ({ room: Secrets.rooms.indexOf(l.room), pulled: l.pulled })),
      rubble: [...Secrets.rubble.keys()], hint: Secrets.rooms.indexOf(Secrets.hintRoom),
    },
    life: pick(Life, ['res', 'lvl', 'build', 'season', 'alarm', 'morale', 'fire', 'gateBroken', 'todayEvent']),
    story: { trust: Story.trust, flags: Story.flags, quests: Story.quests, notes: [...Story.notes] },
    places: Journal.places, weather: Weather.kind, settle: settleSave(),
    npcs: Game.npcs.map(n => pick(n, ['name', 'x', 'y', 'injured', 'stranded', 'x0', 'y0', 'bed', 'night', 'role', 'job', 'tool', 'skill', 'fresh'])),
    extra: Game.npcs.filter(n => !NPC_DATA.some(d => d.name === n.name)).map(n => n.name),
  };
  try {
    const previous = readSave();
    if (previous && (Number(previous.mapSide) || Math.round(Math.sqrt(unb64(previous.maze || '').length))) !== SIZE && !localStorage.getItem(LEGACY_SAVE_KEY)) {
      localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify(previous));
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (!quiet) toast('Игра сохранена.', 'info');
    return true;
  } catch (e) {
    toast('Не получилось сохранить: в браузере кончилось место.', 'warn');
    return false;
  }
}

function readSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}

// После изменения планировки кровать могла отсутствовать в старом сохранении или её место занято.
// Сохраняем действительные уникальные назначения, а недостающие восстанавливаем по новым данным домов.
function repairNightBedsAfterLoad() {
  const available = BEDS.map((b, i) => i).filter(i => isBuilt(BEDS[i].house));
  const used = new Set();
  for (const n of Game.npcs) {
    if (n.night !== 'sleep') continue;
    if (Number.isInteger(n.bed) && available.includes(n.bed) && !used.has(n.bed)) {
      used.add(n.bed);
      continue;
    }
    const next = available.find(i => !used.has(i));
    if (next === undefined) {
      n.night = 'fire';
      delete n.bed;
    } else {
      n.bed = next;
      used.add(next);
    }
  }
}

// Мир уже собран setupWorld(); заменяем его содержимым сохранения
function applySave(d) {
  Game.ngPlus = d.ng || 0;
  const savedTiles = unb64(d.maze), savedExplored = unb64(d.explored);
  const grid = legacyGrid(d, savedTiles);
  if (grid) {
    const newExit = { ...Maze.exit };
    copyLegacyLayer(Maze.tiles, savedTiles, grid, true);
    copyLegacyLayer(Maze.explored, savedExplored, grid, false);
    for (let y = GLADE_T0; y <= GLADE_T1; y++) for (let x = GLADE_T0; x <= GLADE_T1; x++) Maze.set(x, y, T.GLADE);
    for (const g of GATES) Maze.set(g.x, g.y, T.GATE);
    // Подключаем сохранённую часть лабиринта к новым внешним кольцам.
    carveLegacyExtension(savedTiles, grid);
    // В расширенной карте оставляем по одному ориентиру в каждом секторе.
    for (let k = 0; k < Maze.tiles.length; k++) if (Maze.tiles[k] === T.MARK) Maze.tiles[k] = T.FLOOR;
    Maze.makePlazas();
    Maze.exit = newExit;
    migrateLegacyPositions(d, grid);
    Maze.reveal(MID, MID, (GLADE_T1 - GLADE_T0) / 2 + 1);
  } else {
    if (savedTiles.length === Maze.tiles.length) Maze.tiles.set(savedTiles);
    if (savedExplored.length === Maze.explored.length) Maze.explored.set(savedExplored);
    Maze.exit = d.exit;
  }
  Object.assign(Game, d.game);
  if (grid && d.exit) Maze.set(d.exit.x + grid.tileOffset, d.exit.y + grid.tileOffset, T.WALL);
  Game.items = d.codes;
  Object.assign(Game.player, d.player);
  // Тереза и новичок появляются по ходу игры — возвращаем их
  for (const name of d.extra || []) {
    if (name === TERESA.name) Game.npcs.push(makeNpc(TERESA, Game.npcs.length));
    else if (name === NEWCOMER.name) Game.npcs.push(Object.assign(makeNpc(NEWCOMER, Game.npcs.length), { night: 'fire' }));
  }
  for (const s of d.npcs) {
    const n = Game.npcs.find(x => x.name === s.name);
    if (n) Object.assign(n, s, { dx: 0, dy: 0, path: null, repath: true });
  }
  if (Game.exitOpen && Maze.exit) Maze.set(Maze.exit.x, Maze.exit.y, T.EXIT);
  Object.assign(Life, d.life);
  Object.assign(Story, { trust: d.story.trust, flags: d.story.flags, quests: d.story.quests, notes: new Set(d.story.notes) });
  Journal.places = d.places || [];
  Weather.kind = d.weather || 'clear';
  Object.assign(Weather.cur, WEATHER[Weather.kind]);
  // Тайники
  const sc = d.secrets;
  Secrets.rooms = sc.rooms;
  Secrets.traps = sc.traps;
  Secrets.symbols = sc.symbols;
  Secrets.levers = sc.levers.filter(l => l.room >= 0).map(l => ({ room: Secrets.rooms[l.room], pulled: l.pulled }));
  Secrets.rubble = new Map(sc.rubble.map(k => [k, null]));
  Secrets.hintRoom = sc.hint >= 0 ? Secrets.rooms[sc.hint] : null;
  settleLoad(d.settle);                // старые сохранения — без поселения: Глэйд отстроен целиком
  if (Settle.on) Game.npcs = Game.npcs.filter(n => d.npcs.some(s => s.name === n.name) || (d.extra || []).includes(n.name));
  repairNightBedsAfterLoad();
  resetWorld();
  Secrets.build();
  clearWorldItems();
  for (const w of d.world) spawnWorldItem(w.type, w.x, w.y, w.z, w);
  Object.assign(Items, { inv: d.inv, held: d.held, bag: d.bag, mapRead: d.mapRead });
  updateHotbar();
  for (let k = 2; k <= 3; k++) for (const id of Object.keys(BUILDINGS)) if (Life.lvl[id] >= k) decorateBuilding(id, k);
  applySeason();
  Game.grievers = [];
  spawnDayGrievers();
  if (Game.phase === 'night') {
    for (let i = 0; i < 3 + Game.day + Game.ngPlus * 2; i++) {
      const s = spawnPoint(Game.player, 16);
      Game.grievers.push(makeGriever(s.x, s.y, true));
    }
  }
}
