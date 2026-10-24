// Сохранение: игра записывается на рассвете и на закате (и вручную из паузы).
// Сохраняются Лабиринт и открытая карта, предметы, сумка, запасы и постройки, задания, доверие,
// тайники, погода и время суток. «Новая игра+» открывается после побега: Лабиринт становится злее,
// а прочитанные записки остаются в журнале.

const SAVE_KEY = 'maze-runner-save-v1', META_KEY = 'maze-runner-meta';
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

function saveGame(quiet = false) {
  if (Game.state !== 'play' && Game.state !== 'pause' && Game.state !== 'ui') return false;
  const p = Game.player;
  const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
  const data = {
    v: 1, ng: Game.ngPlus, t: Date.now(),
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
    places: Journal.places, weather: Weather.kind,
    npcs: Game.npcs.map(n => pick(n, ['name', 'x', 'y', 'injured', 'stranded', 'x0', 'y0', 'bed', 'night'])),
    extra: Game.npcs.filter(n => !NPC_DATA.some(d => d.name === n.name)).map(n => n.name),
  };
  try {
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

// Мир уже собран setupWorld(); заменяем его содержимым сохранения
function applySave(d) {
  Game.ngPlus = d.ng || 0;
  Maze.tiles.set(unb64(d.maze));
  Maze.explored.set(unb64(d.explored));
  Maze.exit = d.exit;
  Object.assign(Game, d.game);
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
