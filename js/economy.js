// Жизнь Глэйда: запасы, стройка и улучшение построек, времена года, случайные события, тревога.
// Запасы добывают жители, пока работают: лесорубы — дерево, огородники — еду и ткань, медаки — травы,
// кузнец — металл из старого лома. Ночью запасы уходят: еда на всех, дрова на костёр и факелы.

const RES_NAMES = { wood: 'Дерево', food: 'Еда', metal: 'Металл', cloth: 'Ткань', herbs: 'Травы', stone: 'Камень', planks: 'Доски', water: 'Вода' };

const BUILDINGS = {
  workshop: { name: 'Мастерская', house: 'forge',
    desc: ['Факелы, ножи, бинты, верёвка', 'Ещё копья, лом, фонарь и кожаная сумка', 'Ещё часы и рюкзак бегуна'],
    cost: [null, { wood: 10, metal: 4 }, { wood: 16, metal: 10 }], time: [0, 40, 60] },
  kitchen: { name: 'Кухня', house: 'dining',
    desc: ['Обычная похлёбка', 'Еды уходит на 15% меньше, Фрайпан делает пайки', 'Еды уходит на 30% меньше, сытный ужин лечит'],
    cost: [null, { wood: 8, food: 10 }, { wood: 14, metal: 4, food: 16 }], time: [0, 35, 55] },
  storage: { name: 'Склад', house: 'storage',
    desc: ['До 40 каждого запаса', 'До 80 каждого запаса, на карте видно опасные секторы', 'До 140 каждого запаса, воры не страшны'],
    cost: [null, { wood: 12 }, { wood: 18, metal: 6 }], time: [0, 30, 50] },
  houses: { name: 'Жилые дома', house: 'bunk1', houses: ['bunk1', 'bunk2'],
    desc: ['Тесно, но спать можно', 'Сон в Глэйде лечит и поднимает дух', 'Есть место для новичка из Ящика'],
    cost: [null, { wood: 14, cloth: 6 }, { wood: 20, cloth: 10, metal: 4 }], time: [0, 40, 60] },
};

const SEASONS = [
  { name: 'Лето', food: 1.2, herbs: 1.2, wood: 1, weather: { clear: 45, cloudy: 20, rain: 12, storm: 15, fog: 8 } },
  { name: 'Осень', food: 1.6, herbs: 0.8, wood: 1, weather: { clear: 20, cloudy: 25, rain: 25, storm: 5, fog: 25 } },
  { name: 'Зима', food: 0.35, herbs: 0.2, wood: 2, weather: { clear: 25, cloudy: 25, snow: 30, fog: 20 } },
  { name: 'Весна', food: 0.9, herbs: 1.5, wood: 1, weather: { clear: 35, cloudy: 20, rain: 30, storm: 5, fog: 10 } },
];
const SEASON_DAYS = 3;

// Как меняются листва, трава, земля и плющ по сезонам (множители к исходному цвету; snow — доля снега)
const SEASON_TINT = [
  { leaves: [1, 1, 1], grass: [1, 1, 1], ground: [1, 1, 1], ivy: [1, 1, 1], snow: 0 },
  { leaves: [1.45, 0.82, 0.3], grass: [1.15, 0.95, 0.55], ground: [1.1, 0.95, 0.7], ivy: [1.5, 0.55, 0.32], snow: 0 },
  { leaves: [0.78, 0.66, 0.5], grass: [1, 1, 1], ground: [1, 1, 1], ivy: [0.75, 0.62, 0.5], snow: 0.55 },
  { leaves: [0.9, 1.2, 0.7], grass: [0.95, 1.14, 0.78], ground: [0.95, 1.07, 0.88], ivy: [0.95, 1.12, 0.85], snow: 0 },
];

const Life = {
  res: {}, lvl: {}, build: null, season: 0, alarm: 0, morale: 60, hunger: false,
  fire: null, gateBroken: null, decor: [], seasonMats: null, todayEvent: null,
};

function resetLife() {
  for (const d of Life.decor) World.scene.remove(d);
  Object.assign(Life, {
    res: { wood: 12, food: 18, metal: 3, cloth: 5, herbs: 4, stone: 0, planks: 0, water: 0 },
    lvl: { workshop: 1, kitchen: 1, storage: 1, houses: 1 },
    build: null, season: 0, alarm: 0, morale: 60, hunger: false, fire: null, gateBroken: null, decor: [], todayEvent: null,
  });
  applySeason();
}

// Пока картохранилища нет, запасы лежат у Ящика под брезентом — немного; кладовая добавляет треть
function storageCap() { return Math.round([30, 40, 80, 140][Life.lvl.storage || 0] * (isBuilt('pantry') && Settle.on ? 1.33 : 1)); }
function addRes(k, v) { Life.res[k] = Math.max(0, Math.min(storageCap(), Life.res[k] + v)); }
function canPay(cost) { return Admin.creative || Object.entries(cost).every(([k, v]) => (RES_NAMES[k] ? Life.res[k] >= v : countItem(k) >= v)); }
function pay(cost) {
  if (Admin.creative) return;                       // креатив: всё бесплатно
  for (const [k, v] of Object.entries(cost)) {
    if (RES_NAMES[k]) Life.res[k] -= v;
    else takeItem(k, v);
  }
}
function addMorale(v) { Life.morale = Math.max(0, Math.min(100, Life.morale + v)); }
function moraleWord() { return Life.morale >= 75 ? 'отличный' : Life.morale >= 50 ? 'бодрый' : Life.morale >= 30 ? 'тревожный' : 'на нуле'; }
function gladers() { return Game.npcs.length + 1; }
function foodNeed() { return Math.ceil(gladers() * 0.5 * [1, 1, 0.85, 0.7][Life.lvl.kitchen]); }
function woodNeed() { return Math.ceil(3 * SEASONS[Life.season].wood); }
function inGladeNow() { return playerTile() === T.GLADE; }

function houseOf(id) { return HOUSES.find(h => h.id === id); }
function nearHouse(id, m = 9) {
  const h = houseOf(id), p = Game.player;
  return Math.hypot(tw(p.x) - tw(h.doorOut.x), tw(p.y) - tw(h.doorOut.y)) < m;
}

/* ---------- работа жителей и стройка ---------- */

function updateLife(dt) {
  const S = SEASONS[Life.season];
  const k = Game.phase === 'day' ? dt * (0.7 + 0.6 * Life.morale / 100) : 0;
  for (const n of Game.npcs) {
    if (n.injured > 0 || n.companion || n.fresh) continue;
    const kk = k * (n.skill || 1);           // своё дело — в полтора раза быстрее
    if (n.act === 'chop') {
      addRes('wood', 0.045 * kk);
      if (Settle.on && isBuilt('woodpile') && n.role === 'woodcutter') addRes('planks', 0.012 * kk);
    } else if (n.act === 'hoe') { addRes('food', 0.022 * kk * S.food); addRes('cloth', 0.006 * kk); }
    else if (n.act === 'hammer' && n.role === 'smith') addRes('metal', 0.008 * kk);
    else if (n.act === 'hammer' && n.role === 'miner') addRes('stone', 0.03 * kk);
    else if (n.act === 'pickup' && n.role === 'carrier' && n.target && n.target.unload) addRes('water', 0.07 * kk);
    else if (n.act === 'talk' && n.role.startsWith('medjack')) addRes('herbs', 0.012 * kk * S.herbs);
    else if (n.act === 'hammer' && n.goal && n.goal.build && Life.build) Life.build.t += dt;
  }
  if (Life.build && Life.build.t >= Life.build.need) finishBuild();
  if (Settle.on && isBuilt('rainbarrel') && Weather.cur.rain > 0.2) addRes('water', Weather.cur.rain * 0.06 * dt);
  Life.alarm = Math.max(0, Life.alarm - dt);
  updateFire(dt);
  if (Life.todayEvent && Life.todayEvent.at !== undefined && !Life.todayEvent.fired && Game.phase === 'day' &&
      Game.dayLen - Game.timeLeft >= Life.todayEvent.at) {
    Life.todayEvent.fired = true;
    fireTimedEvent(Life.todayEvent.id);
  }
}

function startBuild(id) {
  const b = BUILDINGS[id], next = Life.lvl[id] + 1;
  if (Life.build || next > 3 || !canPay(b.cost[next - 1])) return;
  pay(b.cost[next - 1]);
  Life.build = { id, t: 0, need: b.time[next - 1] };
  if (Admin.creative) { finishBuild(); return; }
  toast(`Галли взялся за работу: ${b.name}, уровень ${next}. Пока он строит, запасы не тратятся зря.`, 'info');
  Story.addTrust('Галли', 2, true);
}

function finishBuild() {
  const id = Life.build.id, b = BUILDINGS[id];
  Life.lvl[id]++;
  Life.build = null;
  decorateBuilding(id, Life.lvl[id]);
  Sound.work('hammer', tw(houseOf(b.house).doorOut.x), 0, tw(houseOf(b.house).doorOut.y));
  toast(`Готово: ${b.name}, уровень ${Life.lvl[id]}. ${b.desc[Life.lvl[id] - 1]}.`, 'good');
  addMorale(6);
  Journal.addPlace(`${b.name}: уровень ${Life.lvl[id]}`, 'Глэйд');
  if (id === 'houses' && Life.lvl.houses === 3) Story.newcomer();
  if (Panel.open === 'board') refreshPanel();
}

// Улучшенная постройка видна снаружи: ящики и бочки у двери, потом фонарь на столбе и полотнище
function decorateBuilding(id, level) {
  const b = BUILDINGS[id];
  for (const hid of b.houses || [b.house]) {
    const h = houseOf(hid), [ox, oy] = DOOR_DIR[h.door];
    const cx = tw(h.doorOut.x) + ox * 0.6, cz = tw(h.doorOut.y) + oy * 0.6, sx = -oy, sz = ox;
    const at = (side, fwd = 0) => ({ x: cx + sx * side + ox * fwd, z: cz + sz * side + oy * fwd });
    const keep = m => { if (m) Life.decor.push(m); return m; };
    if (level === 2) {
      const a = at(1.5), c = at(-1.6);
      keep(fitModel('wooden_crate_01', a.x, a.z, 0.75, 0.3)) && addCircle(a.x, a.z, 0.45);
      keep(put('barrel', c.x, groundH(c.x, c.z), c.z, 0.5)) && addCircle(c.x, c.z, 0.4);
    } else if (level === 3) {
      const l = at(-2.4, 0.4), f = at(2.3, 0.3), y = groundH(l.x, l.z);
      keep(pole(l.x, l.z, 2.4, 0.07));
      lantern(l.x, y + 2.35, l.z);
      const flag = mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshStandardMaterial({ color: srgb('#8a3a26'), side: THREE.DoubleSide, roughness: 1 }),
        f.x, groundH(f.x, f.z) + 2.2, f.z);
      flag.rotation.y = Math.atan2(ox, oy);
      keep(flag);
      keep(pole(f.x - sx * 0.36, f.z - sz * 0.36, 2.8, 0.05));
    }
  }
}

/* ---------- склад: сдать находки, заправить фонарь ---------- */

function depositable() { return Items.inv.filter(it => it.type === 'scrap' || it.type === 'herb'); }

function deposit() {
  const list = depositable();
  if (!list.length) return;
  const scrap = list.filter(it => it.type === 'scrap').length, herb = list.length - scrap;
  takeItem('scrap', scrap);
  takeItem('herb', herb);
  addRes('metal', scrap * 2);
  addRes('herbs', herb);
  Story.flags.scrapDelivered = (Story.flags.scrapDelivered || 0) + scrap;
  Story.flags.herbsGiven = (Story.flags.herbsGiven || 0) + herb;
  Sound.pickup();
  toast(`Сдано на склад: ${scrap ? `металл +${scrap * 2}` : ''}${scrap && herb ? ', ' : ''}${herb ? `травы +${herb}` : ''}.`, 'good');
  Story.checkQuests();
}

function refuelLantern() {
  const l = Items.inv.find(it => it.type === 'lantern' && it.fuel < ITEM_DEFS.lantern.fuel);
  if (!l || Life.res.cloth < 1) return;
  Life.res.cloth -= 1;
  l.fuel = ITEM_DEFS.lantern.fuel;
  toast('Фонарь заправлен — снова горит 10 минут.', 'good');
  updateHotbar();
}

/* ---------- день и ночь ---------- */

// Вода: в поселении на ночь уходит по трети ведра на каждого
function waterNeed() { return Settle.on ? Math.ceil(gladers() * 0.35) : 0; }

function lifeOnNight() {
  assignNightDuties();
  const food = foodNeed(), wood = woodNeed(), water = waterNeed();
  if (water) {
    if (Life.res.water < water) {
      addMorale(-5);
      toast('Воды на ночь не хватило — все легли с пересохшим горлом. Набери воды в реке ведром или поставь бочку для дождя.', 'warn');
    }
    Life.res.water = Math.max(0, Life.res.water - water);
  }
  Life.hunger = Life.res.food < food;
  Life.res.food = Math.max(0, Life.res.food - food);
  const cold = Life.res.wood < wood;
  Life.res.wood = Math.max(0, Life.res.wood - wood);
  if (Life.hunger) {
    addMorale(-12);
    Story.addTrustAll(-3);
    toast('Еды на ужин не хватило. Глэйдеры легли спать голодными — дух падает.', 'danger');
  } else addMorale(2);
  if (cold) {
    addMorale(-6);
    toast('Дров почти нет — костёр еле тлеет, ночью холодно.', 'warn');
  }
  Life.coldNight = cold;
  // Ворота так и не починили — ночью через щель пролез гривер (если нет частокола)
  if (Life.gateBroken && !Life.gateBroken.fixed && Settle.on && isBuilt('palisade')) {
    toast('Ночью гривер ломился в сломанные ворота, но частокол его удержал.', 'good');
    Life.gateBroken = null;
  }
  if (Life.gateBroken && !Life.gateBroken.fixed) {
    const pool = Game.npcs.filter(n => !n.companion && !n.injured);
    const victim = pool[rand(pool.length)];
    if (victim) victim.injured = 2;
    addMorale(-15);
    Life.alarm = 0;
    toast(`Через сломанные ${GATES[Life.gateBroken.gate].name.toLowerCase()} ворота пролез гривер! ${victim ? victim.name + ' ранен.' : ''}`, 'danger');
    Story.failQuest('gate');
    Life.gateBroken = null;
    Life.morningAlarm = true;
  }
  if (Life.fire) endFire(false);
}

function lifeOnDay() {
  const was = Life.season;
  Life.season = Math.floor((Game.day - 1) / SEASON_DAYS) % SEASONS.length;
  if (Life.season !== was) {
    applySeason();
    toast(`Наступает ${SEASONS[Life.season].name.toLowerCase()}. ${seasonHint()}`, 'info');
  }
  for (const n of Game.npcs) if (n.injured > 0) n.injured -= isBuilt('medhut') && Settle.on ? 2 : 1;
  for (const n of Game.npcs) n.injured = Math.max(0, n.injured || 0);
  gatherOnDay();
  settlersOnDay();
  if (Settle.on && isBuilt('watchfires')) addMorale(2);
  if (Life.lvl.houses >= 2) addMorale(3);
  if (Life.morningAlarm) { Life.alarm = 40; Life.morningAlarm = false; }
  rollEvent();
}

function seasonHint() {
  return ['Огород даёт много еды, часты грозы.', 'Время урожая, но всё чаще туман и дожди.', 'Еды почти не растёт, дров нужно вдвое больше. Запасайся!',
    'Травы растут быстро, идут дожди.'][Life.season];
}

/* ---------- времена года: цвет листвы, травы, земли ---------- */

function collectSeasonMats() {
  const set = new Map();
  World.scene.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.color) continue;
      const kind = m.userData.season || (m.name === 'leaves' ? 'leaves' : null);
      if (kind && !set.has(m)) set.set(m, kind);
    }
  });
  if (Walls.ivy) set.set(Walls.ivy.material, 'ivy');
  Life.seasonMats = [...set].map(([m, kind]) => ({ m, kind, base: m.color.clone() }));
}

const _snow = new THREE.Color(0.86, 0.89, 0.93);
function applySeason() {
  if (!World.scene) return;
  if (!Life.seasonMats) collectSeasonMats();
  const t = SEASON_TINT[Life.season];
  for (const { m, kind, base } of Life.seasonMats) {
    const k = t[kind] || [1, 1, 1];
    m.color.setRGB(base.r * k[0], base.g * k[1], base.b * k[2]);
    if (t.snow && (kind === 'ground' || kind === 'grass')) m.color.lerp(_snow, t.snow * (kind === 'ground' ? 1 : 0.6));
  }
}

/* ---------- случайные события ---------- */

const EVENTS = [
  { id: 'supplies', w: 2 }, { id: 'theft', w: 2, once: true }, { id: 'fire', w: 2 }, { id: 'gate', w: 2 },
  { id: 'news', w: 2, once: true }, { id: 'alarm', w: 2 }, { id: 'rescue', w: 2 },
];

function rollEvent() {
  Life.todayEvent = null;
  if (Game.day < 2 || Game.day === 2 || Math.random() > 0.6) return;
  const pool = EVENTS.filter(e => !(e.once && Story.flags['event_' + e.id]));
  let r = Math.random() * pool.reduce((s, e) => s + e.w, 0);
  const e = pool.find(x => (r -= x.w) < 0) || pool[0];
  Story.flags['event_' + e.id] = true;
  // Одни события сразу на рассвете, другие — посреди дня
  if (e.id === 'fire' || e.id === 'alarm') Life.todayEvent = { id: e.id, at: 25 + Math.random() * 70 };
  else startEvent(e.id);
}

function fireTimedEvent(id) { startEvent(id); }

function startEvent(id) {
  const n = name => Game.npcs.find(x => x.name === name);
  if (id === 'supplies') {
    for (const [k, v] of Object.entries({ wood: 5, food: 8, cloth: 4, metal: 2 })) addRes(k, v);
    Sound.boxArrives();
    toast('Ящик поднялся с припасами: дерево, еда, ткань и немного металла.', 'good');
    addMorale(5);
  } else if (id === 'theft') {
    Life.res.food = Math.floor(Life.res.food * 0.7);
    Life.res.herbs = Math.floor(Life.res.herbs * 0.75);
    toast('Со склада пропала часть еды и трав! Алби хочет поговорить.', 'warn');
    Story.offer('thief');
    addMorale(-5);
  } else if (id === 'fire') {
    const ids = ['forge', 'dining', 'bunk1', 'bunk2', 'storage'], house = ids[rand(ids.length)];
    Life.fire = { house, k: 1, t: 0 };
    const h = houseOf(house);
    toast(`Пожар в доме «${h.name}»! Набери воды в реке во флягу и туши (F у дома). Жители уже бегут с вёдрами.`, 'danger');
    Story.start('fire');
    Life.alarm = Math.max(Life.alarm, 20);
  } else if (id === 'gate') {
    Life.gateBroken = { gate: rand(GATES.length), fixed: false };
    toast(`${GATES[Life.gateBroken.gate].name} ворота заклинило — они не закроются до конца. Почини до заката (Совет Глэйда, B).`, 'warn');
    Story.start('gate');
  } else if (id === 'news') {
    const ben = n('Бен');
    if (ben) ben.injured = 2;
    toast('Бен вернулся из Лабиринта раненым. Он твердит про странный знак на стене…', 'warn');
    Secrets.revealHint();
    Story.offer('medicine');
  } else if (id === 'alarm') {
    Life.alarm = 45;
    Sound.screech(0.6);
    toast('Тревога! Гривера видели у ворот средь бела дня. Жители бросили работу.', 'danger');
    addMorale(-4);
  } else if (id === 'rescue') {
    if (Squad.strand('Минхо')) {
      toast('Минхо не вернулся с утренней пробежки. Его видели раненым в Лабиринте — найди его до заката!', 'danger');
      Story.start('rescue');
    }
  }
}

/* ---------- пожар ---------- */

function updateFire(dt) {
  const f = Life.fire;
  if (!f) return;
  f.t += dt;
  const h = houseOf(f.house), I = HOUSE_INFO[f.house];
  // Тушат жители, которые прибежали с вёдрами
  const helpers = Game.npcs.filter(n => n.goal && n.goal.fire && n.act === 'cook').length;
  f.k -= helpers * 0.0055 * dt;
  if (f.k <= 0) { endFire(true); return; }
  for (const [dx, dz] of [[-0.3, -0.2], [0.25, 0.25], [0, 0]]) {
    emitFire(I.cx + dx * I.w, I.y + 3.6, I.cz + dz * I.d, dt, 1.4 * f.k);
  }
  World.eventLight.position.set(I.cx, I.y + 4.5, I.cz);
  World.eventLight.intensity = 3 + f.k * 5 * (0.8 + Math.sin(Game.time * 11) * 0.2);
  if (f.t > 80) endFire(false);
}

// Плеснуть водой из фляги, если рядом горит дом
function douse(p) {
  const f = Life.fire;
  if (!f) return false;
  const I = HOUSE_INFO[f.house];
  if (Math.hypot(tw(p.x) - I.cx, tw(p.y) - I.cz) > Math.max(I.w, I.d) / 2 + 5) return false;
  f.k -= 0.34;
  Sound.splash();
  emitDust(I.cx, I.y + 2, I.cz, 2, 6, [0.5, 0.5, 0.52]);
  if (f.k <= 0) endFire(true, true);
  else toast('Пш-ш-ш! Огонь слабеет. Ещё воды!', 'info');
  return true;
}

function endFire(out, byPlayer = false) {
  const f = Life.fire;
  Life.fire = null;
  World.eventLight.intensity = 0;
  const h = houseOf(f.house), id = Object.keys(BUILDINGS).find(k => (BUILDINGS[k].houses || [BUILDINGS[k].house]).includes(f.house));
  if (out) {
    toast(`Пожар потушен!${byPlayer ? ' Ты успел вовремя.' : ''}`, 'good');
    addMorale(byPlayer ? 8 : 3);
    if (byPlayer) { Story.addTrust('Алби', 6); Story.addTrust('Ньют', 4); }
    Story.complete('fire', byPlayer);
  } else {
    if (id && Life.lvl[id] > 1) Life.lvl[id]--;
    Life.res.wood = Math.floor(Life.res.wood * 0.6);
    toast(`Дом «${h.name}» сильно обгорел${id ? ' — постройка потеряла уровень' : ''}, сгорела часть дров.`, 'danger');
    addMorale(-10);
    Story.failQuest('fire');
  }
}

function repairGate() {
  const cost = { metal: 4, wood: 4 };
  if (!Life.gateBroken || Life.gateBroken.fixed || !canPay(cost)) return;
  pay(cost);
  Life.gateBroken.fixed = true;
  toast('Ворота починили — ночью они закроются как надо.', 'good');
  Story.addTrust('Галли', 5);
  Story.complete('gate', true);
}

/* ---------- окно «Совет Глэйда» (B) ---------- */

function openBoard() {
  if (!inGladeNow()) { toast('Совет собирается только в Глэйде.', 'info'); return; }
  togglePanel('board', 'Совет Глэйда', renderBoard, { icon: 'i-fire' });
  Tutorial.event('board');
}

function renderBoard(body) {
  const S = SEASONS[Life.season];
  body.append(el('p', 'panel-lead', `${S.name}, день ${Game.day}. Погода: ${Weather.label()}. Дух Глэйда: ${moraleWord()}.`));
  const grid = el('div', 'res-grid');
  for (const [k, name] of Object.entries(RES_NAMES)) {
    const c = el('div', 'res');
    c.append(el('b', '', Math.floor(Life.res[k])), el('span', '', name));
    grid.append(c);
  }
  body.append(grid);
  body.append(el('p', 'panel-note', `Склад вмещает по ${storageCap()} каждого запаса. На ужин уйдёт еды ${foodNeed()}, на костёр — дров ${woodNeed()}.`));
  const acts = el('div', 'panel-actions');
  const dep = depositable();
  if (dep.length) acts.append(button(`Сдать находки на склад (${dep.length})`, () => { deposit(); refreshPanel(); }, { cls: 'btn small' }));
  const lamp = Items.inv.find(it => it.type === 'lantern' && it.fuel < ITEM_DEFS.lantern.fuel);
  if (lamp) acts.append(button('Заправить фонарь (ткань 1)', () => { refuelLantern(); refreshPanel(); }, { disabled: Life.res.cloth < 1 }));
  if (Life.gateBroken && !Life.gateBroken.fixed) {
    acts.append(button('Починить ворота (металл 4, дерево 4)', () => { repairGate(); refreshPanel(); }, { cls: 'btn small', disabled: !canPay({ metal: 4, wood: 4 }) }));
  }
  if (acts.children.length) body.append(acts);

  renderSettleBoard(body);
  body.append(el('h3', 'panel-sub', 'Улучшения построек'));
  for (const [id, b] of Object.entries(BUILDINGS)) {
    const lv = Life.lvl[id], card = el('div', 'bcard');
    if (!lv) continue;                      // ещё не построено — сначала стройка
    const head = el('div', 'bhead');
    head.append(el('b', '', b.name), el('span', 'lvl', '●'.repeat(lv) + '○'.repeat(3 - lv)));
    card.append(head, el('p', '', b.desc[lv - 1]));
    if (Life.build && Life.build.id === id) {
      const bar = el('div', 'bar'), fill = el('i');
      fill.style.width = Math.min(100, Life.build.t / Life.build.need * 100) + '%';
      bar.append(fill);
      card.append(el('p', 'panel-note', 'Галли строит… (работает только днём)'), bar);
    } else if (lv < 3) {
      const cost = b.cost[lv];
      card.append(el('p', 'panel-note', `Уровень ${lv + 1}: ${b.desc[lv]}. Нужно: ${costText(cost)}.`));
      card.append(button('Строить', () => { startBuild(id); refreshPanel(); },
        { cls: 'btn small', disabled: !!Life.build || !canPay(cost), title: Life.build ? 'Галли уже занят другой стройкой' : '' }));
    }
    body.append(card);
  }
}
