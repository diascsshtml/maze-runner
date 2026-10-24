// Игровой цикл: день и ночь, ворота, сдвиг стен, события, интерфейс и управление.

const Game = {
  state: 'title',
  day: 1, phase: 'day', dayLen: 180, nightLen: 75, timeLeft: 180,
  gate: 0, gateDir: 0,
  time: 0, darkness: 0, dusk: 0, shake: 0, intro: 0, hurtT: 0,
  player: null, grievers: [], npcs: [], items: [],
  field: null, fieldKey: -1,
  exitOpen: false, shifted: false, warned: false, sleeping: false,
  outsideNight: false, nightsOutside: 0, wasInGlade: true, teresaT: -1,
  beatT: 0, lastStep: 0, hints: [],
  ngPlus: 0, noise: null, noiseT: 0, indoor: false, shiftPlan: null,
};

const $ = id => document.getElementById(id);

function playerTile() {
  const p = Game.player;
  return Maze.at(Math.round(p.x), Math.round(p.y));
}

function codeCount() { return Game.items.filter(i => i.taken).length; }

/* ---------- сообщения ---------- */

const TOAST_ICONS = { info: 'i-note', good: 'i-check', warn: 'i-warn', danger: 'i-warn' };
function toast(text, kind = 'info') {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  const span = document.createElement('span');
  span.textContent = text;
  el.append(svgIcon(TOAST_ICONS[kind] || 'i-note'), span);
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 4600);
  setTimeout(() => el.remove(), 5200);
}

function flash(id) {
  const el = $(id);
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem('maze-runner-best')) || { days: 0, wins: 0 }; } catch (e) { return { days: 0, wins: 0 }; }
}
function saveBest(b) {
  try { localStorage.setItem('maze-runner-best', JSON.stringify(b)); } catch (e) { /* без сохранения рекордов */ }
}

/* ---------- мир ---------- */

// Новый мир; save — данные сохранения, которыми его потом заменяем
function setupWorld(save = null) {
  Maze.generate();
  Object.assign(Game, {
    day: 1, phase: 'day', timeLeft: Game.dayLen, gate: 0, gateDir: 0,
    darkness: 0, dusk: 0, shake: 0, field: null, fieldKey: -1, hurtT: 0,
    exitOpen: false, shifted: false, warned: false, sleeping: false,
    outsideNight: false, nightsOutside: 0, grievers: [], lastStep: 0, wasInGlade: true, teresaT: -1,
    noise: null, shiftPlan: null,
  });
  Game.items = Maze.placeItems();
  Game.player = makePlayer();
  Game.npcs = makeNpcs();
  Sound.clearVoices();
  resetLife();
  resetStory();
  resetSquad();
  resetWeather();
  Journal.places = [];
  Secrets.generate();                 // тайные комнаты и завалы меняют стены — до того, как стены построятся
  resetWorld();
  resetItems();
  Secrets.spawnItems();
  Secrets.build();
  spawnHerbs();
  spawnRabbits();
  spawnDayGrievers();
  Maze.reveal(MID, MID, (GLADE_T1 - GLADE_T0) / 2 + 1);   // свой Глэйд знают все
  buildCodeSlots();
  if (save) applySave(save);
  if (!Game.shiftPlan) planShift();
}

// Какие секторы сдвинутся этой ночью (Минхо умеет предсказывать после «Знаков секторов»)
function planShift() {
  const n = (Game.day >= 3 ? 2 : 1) + (Game.ngPlus > 0 ? 1 : 0);
  Game.shiftPlan = shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, n).sort();
}

function spawnDayGrievers() {
  const want = Math.min(1 + Math.floor((Game.day - 1) / 2), 4) + Game.ngPlus;
  const have = Game.grievers.filter(g => !g.night).length;
  for (let i = have; i < want; i++) {
    const s = spawnPoint(Game.player, 20);
    Game.grievers.push(makeGriever(s.x, s.y, false));
  }
}

// mode: 'new' — новая игра, 'continue' — с последнего сохранения, 'ngplus' — «Новая игра+»
function startGame(mode = 'new') {
  if (typeof mode !== 'string') mode = 'new';
  Sound.init();
  const save = mode === 'continue' ? readSave() : null;
  Game.ngPlus = mode === 'ngplus' ? Meta.unlocked : save ? (save.ng || 0) : 0;
  closePanel();
  setupWorld(save);
  Input.clear();
  Game.state = 'play';
  Game.intro = save ? 0 : 3.5;
  showScreen(null);
  lockPointer();
  if (save) {
    toast(`Продолжаем: день ${Game.day}, ${Game.phase === 'day' ? 'ворота открыты' : 'ночь'}.`, 'info');
    Game.hints = [];
    return;
  }
  Sound.boxArrives();
  setTimeout(() => toast('Ты очнулся в Ящике. Ничего не помнишь. Вокруг Глэйд, за стенами Лабиринт.', 'info'), 1500);
  if (Game.ngPlus) {
    giveItem('watch');
    setTimeout(() => toast(`Новая игра+ (уровень ${Game.ngPlus}): гриверов больше, они быстрее, стены сдвигаются чаще. Прочитанные записки остались в журнале, часы — в сумке.`, 'warn'), 5200);
  }
  Game.hints = Settings.hints ? [
    { at: 40, text: 'Ворота открыты весь день. Найди в Лабиринте 6 фрагментов кода — и вернись до заката.' },
    { at: 70, text: 'Карта справа рисуется сама, пока ты бежишь. ' + keyLabel(Settings.keys.map) + ' — открыть её крупно.' },
  ] : [];
}

function startNight() {
  if (Game.gate < 1) Sound.gateSlam();
  Object.assign(Game, { phase: 'night', timeLeft: Game.nightLen, gate: 1, gateDir: 0, shifted: false, warned: false });
  Game.outsideNight = playerTile() !== T.GLADE;
  if (Game.outsideNight) {
    toast('Ворота закрылись. Ты остался в Лабиринте на ночь. Продержись до рассвета!', 'danger');
  } else {
    toast(`Ворота закрылись. Ночью в Лабиринт выходят гриверы. Нажми ${keyLabel(Settings.keys.action)} у костра, чтобы лечь спать.`, 'info');
  }
  lifeOnNight();
  squadOnNight();
  // Бегуны, не успевшие вернуться, всё-таки проскочили в последний момент
  for (const n of Game.npcs) {
    if (Maze.at(Math.round(n.x), Math.round(n.y)) !== T.GLADE) Object.assign(n, { x: STATIONS.mapRoom.x, y: STATIONS.mapRoom.y, dx: 0, dy: 0, path: null, repath: true });
  }
  const count = 3 + Game.day + Game.ngPlus * 2;
  for (let i = 0; i < count; i++) {
    const s = spawnPoint(Game.player, 16);
    Game.grievers.push(makeGriever(s.x, s.y, true));
  }
  saveGame(true);
}

function startDay() {
  const p = Game.player;
  Game.day++;
  Object.assign(Game, { phase: 'day', timeLeft: Game.dayLen, gate: 0, gateDir: 0, warned: false, sleeping: false });
  for (const g of Game.grievers) if (g.night) g.leaving = true;
  spawnDayGrievers();
  if (Game.outsideNight) {
    Game.nightsOutside++;
    toast('Рассвет! Ты пережил ночь в Лабиринте. До тебя это не удавалось никому.', 'good');
  } else if (p.hearts < 3) {
    p.hearts++;
    toast(`День ${Game.day}. Медаки подлатали тебя: +1 жизнь.`, 'good');
  } else {
    toast(`День ${Game.day}. Ворота открываются.`, 'info');
  }
  Game.outsideNight = false;
  if (Game.day === 2) Game.teresaT = 6;
  Story.talkedToday.clear();
  lifeOnDay();
  weatherOnDay();
  spawnHerbs();
  spawnRabbits();
  Story.offerAvailable();
  planShift();
  if (Story.flags.forecast) toast(`Минхо: «Этой ночью сдвинутся секторы ${Game.shiftPlan.join(' и ')}». На карте они подсвечены.`, 'info');
  saveGame(true);
}

// Второй день: Ящик поднимается вне расписания, в нём девушка
function teresaArrives() {
  Sound.boxArrives();
  toast('Ящик поднялся вне расписания. Внутри девушка и записка: «Она последняя».', 'warn');
  const n = makeNpc(TERESA, Game.npcs.length);
  Object.assign(n, { x: MID, y: MID + 1 });
  Game.npcs.push(n);
  setTimeout(() => Story.offer('teresa'), 7000);
  Story.offerAvailable();
}

function shiftWalls() {
  Game.shifted = true;
  const sectors = Game.shiftPlan || [1 + rand(8)];
  for (const s of sectors) Maze.shiftSector(s);
  for (const g of Game.grievers) snapToPassable(g, grieverPass);
  Game.fieldKey = -1;
  Game.shake = 1.2;
  // Скрежет доносится оттуда, где сдвинулись стены (сектор s смотрит на угол (s − 1)·45° − 90°)
  Sound.wallShift(sectors.map(s => {
    const a = (s - 1) * Math.PI / 4 - Math.PI / 2;
    return { x: tw(MID) + Math.cos(a) * 90, y: 10, z: tw(MID) + Math.sin(a) * 90 };
  }));
  const list = sectors.length > 1 ? `секторы ${sectors.join(' и ')}` : `сектор ${sectors[0]}`;
  toast(`Стены сдвинулись! Изменились ${list}, их карта стёрта.`, 'warn');
}

function openExit() {
  Game.exitOpen = true;
  Maze.set(Maze.exit.x, Maze.exit.y, T.EXIT);
  Sound.exitOpen();
  toast('Код собран! На краю Лабиринта открылся выход. Беги к столбу бирюзового света.', 'good');
}

function hurt(g) {
  const p = Game.player;
  g.strikeT = 1.1;                         // гривер бьёт жалом (анимация удара)
  if (spearBlocks()) {
    g.stun = 2.5;
    p.invuln = 1.5;
    Game.shake = 0.8;
    Sound.clank();
    return;
  }
  p.hearts--;
  p.invuln = 2;
  p.bleed = Math.max(p.bleed, 20);          // жало оставляет рану — нужен бинт или медаки
  g.stun = 1.6;
  Game.shake = 1.4;
  Game.hurtT = 1;
  Sound.hit();
  flash('hurt');
  const cx = tw(p.x) + Math.cos(p.yaw) * 0.8, cz = tw(p.y) + Math.sin(p.yaw) * 0.8;
  for (let i = 0; i < 14; i++) FX.drops.emit({ x: cx, y: 1.4, z: cz, vx: rnd(-1.5, 1.5), vy: rnd(0, 2), vz: rnd(-1.5, 1.5), life: 0.8, size: 0.06, color: [0.25, 0.01, 0.01, 1], color1: [0.15, 0, 0, 0.8], grav: 9 });
  if (p.hearts <= 0) gameOver();
  else toast('Тебя ужалил гривер! Беги!', 'danger');
}

// Урон не от гривера: камни, ловушки
function hurtPlayer(text) {
  const p = Game.player;
  if (p.invuln > 0 || Game.state !== 'play') return;
  p.hearts--;
  p.invuln = 1.5;
  Game.shake = 1;
  Game.hurtT = 1;
  Sound.hit();
  flash('hurt');
  if (p.hearts <= 0) gameOver();
  else toast(text, 'danger');
}

function endGame(screen) {
  Game.state = screen === 'screen-win' ? 'win' : 'over';
  Input.clear();
  closePanel();
  if (document.pointerLockElement) document.exitPointerLock();
  showScreen(screen);
  focusFirstItem();
}

// Плитки с итогами: [[число, подпись], …]
function fillStats(box, list) {
  box.innerHTML = '';
  for (const [v, label] of list) {
    const d = document.createElement('div'), b = document.createElement('b'), s = document.createElement('span');
    d.className = 'stat';
    b.textContent = v;
    s.textContent = label;
    d.append(b, s);
    box.appendChild(d);
  }
}

function gameOver() {
  Sound.lose();
  const best = loadBest();
  best.days = Math.max(best.days, Game.day);
  saveBest(best);
  fillStats($('over-stats'), [[Game.day, 'дней в Лабиринте'], [`${codeCount()}/6`, 'фрагментов кода'], [Game.nightsOutside, 'ночей снаружи']]);
  $('btn-over-continue').hidden = !hasSave();
  $('over-save').textContent = hasSave() ? `Сохранение ${saveStamp(readSave())}` : '';
  endGame('screen-over');
}

function win() {
  Sound.win();
  const best = loadBest();
  best.days = Math.max(best.days, Game.day);
  best.wins++;
  saveBest(best);
  const e = endingText();
  $('win-title').textContent = e.title;
  $('win-ending').textContent = e.text;
  fillStats($('win-stats'), [[Game.day, 'день побега'], [`${Story.notes.size}/${NOTES.length}`, 'записок найдено'], [best.wins, 'побегов всего']]);
  Meta.wins++;
  Meta.unlocked = Math.max(Meta.unlocked, Game.ngPlus + 1);
  saveMeta();
  clearSave();
  $('win-ngplus-info').textContent = `Уровень ${Meta.unlocked}: гриверов больше, стены злее`;
  endGame('screen-win');
}

// Постобработка поверх времени суток: ранение, последняя жизнь, пробуждение, сон
function adjustPost(P) {
  const p = Game.player;
  P.hurt = Math.max(0, Game.hurtT) * 0.9 + (p && p.hearts === 1 && Game.state === 'play' ? 0.18 + Math.sin(Game.time * 5) * 0.08 : 0);
  if (p && p.hearts === 1) P.saturation *= 0.7;
  P.aberration = 0.012 + Math.max(0, Game.hurtT) * 0.05;
  P.fade = Game.state === 'exit' ? 0.3 : Game.state === 'title' ? MenuCam.fade : Game.intro > 0 ? 1 - Math.min(1, (Game.intro - 0.5) / 3) : Game.sleeping ? 0.25 : 1;
  P.exposure *= Settings.brightness;
}

/* ---------- обновление ---------- */

function update(dt) {
  Game.time += dt;
  const p = Game.player;
  const clockDt = Game.sleeping ? dt * 12 : dt;
  Game.timeLeft -= clockDt;
  Game.intro = Math.max(0, Game.intro - dt);
  Game.hurtT = Math.max(0, Game.hurtT - dt * 1.2);

  for (const h of Game.hints) {
    if (!h.done && Game.dayLen - Game.timeLeft >= h.at && Game.day === 1) { h.done = true; toast(h.text, 'info'); }
  }
  if (Game.teresaT > 0) {
    Game.teresaT -= dt;
    if (Game.teresaT <= 0) teresaArrives();
  }

  if (Game.phase === 'day') {
    if (!Game.warned && Game.timeLeft <= 30) {
      Game.warned = true;
      Sound.clank();
      if (playerTile() !== T.GLADE) toast('Ворота закроются через 30 секунд! Беги в Глэйд — компас вверху покажет путь.', 'warn');
    }
    if (Game.timeLeft <= 5 && !Game.gateDir && Game.gate < 1) { Game.gateDir = 1; Sound.gates(true, Game.sleeping ? 1 : 5); }
    if (Game.timeLeft <= 0) startNight();
  } else {
    if (!Game.shifted && Game.timeLeft <= Game.nightLen / 2) shiftWalls();
    if (Game.timeLeft <= 5 && !Game.gateDir && Game.gate > 0) { Game.gateDir = -1; Sound.gates(false, Game.sleeping ? 1 : 5); }
    if (Game.timeLeft <= 0) startDay();
  }
  if (Game.gateDir) {
    Game.gate = Math.min(1, Math.max(0, Game.gate + Game.gateDir * clockDt / 5));
    Game.shake = Math.max(Game.shake, 0.3);
    if (Game.gate === 1) Sound.gateSlam();          // створки сомкнулись
    if (Game.gate === 0 || Game.gate === 1) Game.gateDir = 0;
  }

  // Свет: закат, ночь, рассвет
  if (Game.phase === 'day') {
    Game.dusk = Game.timeLeft < 40 ? (40 - Game.timeLeft) / 40 : 0;
    Game.darkness = Game.dusk * 0.45;
    const since = Game.dayLen - Game.timeLeft;
    if (since < 8 && Game.day > 1) Game.darkness = Math.max(Game.darkness, 0.6 * (1 - since / 8));
  } else {
    const dawn = Game.timeLeft < 8 ? (8 - Game.timeLeft) / 8 : 0;
    Game.dusk = dawn * 0.6;
    Game.darkness = 0.9 - dawn * 0.3;
  }

  if (!Game.sleeping && Game.intro <= 0.6) updatePlayer(p, dt);
  unstickPlayer(p);
  collidePlayer(p);
  const tile = playerTile();
  if (tile === T.EXIT) { win(); return; }
  // Карта открывается вокруг: ночью и в туман — хуже, с разведчиком — шире
  Maze.reveal(p.x, p.y, (Game.phase === 'night' || Weather.kind === 'fog' ? 1 : 2) + (Squad.hasRole('scout') ? 1 : 0));

  // Чак встречает вернувшегося из Лабиринта
  const inGlade = tile === T.GLADE;
  if (inGlade && !Game.wasInGlade) {
    const chuck = Game.npcs.find(n => n.role === 'follower');
    if (chuck) { chuck.greet = 'Ты вернулся! Я знал, что ты вернёшься!'; chuck.cool = 0; chuck.waveT = 3; }
  }
  Game.wasInGlade = inGlade;

  const surface = !inGlade ? 'stone' : p.h - groundH(tw(p.x), tw(p.y)) < 0.15 ? 'grass' : 'wood';
  if (p.landed) {
    Sound.step(Math.min(1.8, 0.9 + p.landed * 0.12), surface);
    if (!inGlade && p.landed > 4) makeNoise(p.x, p.y, 4);
    p.landed = 0;
    Game.lastStep = p.walk;
  } else if (p.air) Game.lastStep = p.walk;             // в полёте шагов не слышно
  else if (p.walk - Game.lastStep > (p.sprinting ? 0.27 : 0.22)) {
    Game.lastStep = p.walk;
    if (p.wet) Sound.splash();
    else Sound.step(p.sprinting ? 1.3 : 1, surface);
  }
  // Бег по Лабиринту слышно далеко: гриверы идут на топот
  Game.noiseT -= dt;
  if (p.sprinting && !inGlade && Game.noiseT <= 0) {
    Game.noiseT = 1.2;
    makeNoise(p.x, p.y, 7);
  }

  const key = Math.round(p.y) * SIZE + Math.round(p.x);
  if (key !== Game.fieldKey) {
    Game.fieldKey = key;
    Game.field = distanceField(Math.round(p.x), Math.round(p.y));
  }

  let nearest = 1e9;
  for (const g of Game.grievers) {
    updateGriever(g, dt);
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (g.fade > 0.6 && !g.leaving) nearest = Math.min(nearest, d);
    if (g.hunting && !g.wasHunting && d < 20) Sound.screech(1, { x: tw(g.x), y: 1.6, z: tw(g.y) });
    g.wasHunting = g.hunting;
    if (d < 0.46 && g.fade > 0.6 && !g.leaving && p.invuln <= 0 && g.stun <= 0) {
      hurt(g);
      if (Game.state !== 'play') return;
    }
  }
  Game.grievers = Game.grievers.filter(g => !(g.leaving && g.fade <= 0));
  for (const n of Game.npcs) updateNpc(n, dt, p);
  updateLife(dt);
  updateSquad(dt);
  updateSecrets(dt);
  updateWeather(dt);
  updateNoise(dt);
  Tutorial.update();
  if (Game.state !== 'play') return;

  for (const it of Game.items) {
    if (it.taken || Math.hypot(p.x - it.x, p.y - it.y) > 0.4) continue;
    it.taken = true;
    Sound.pickup();
    flash('pickup');
    emitSparkles(tw(it.x), 1.4, tw(it.y), 40);
    const n = codeCount();
    toast(`Фрагмент кода: ${it.word} (${n} из 6)`, 'good');
    if (n === CODE_WORDS.length) openExit();
  }

  // Голоса гриверов (гул, стоны, щелчки, скрежет — каждый со своей стороны), сердцебиение, фон
  const walled = inGlade && Game.gate > 0.5;      // ворота закрыты — гриверов слышно сквозь стены, глухо
  Sound.updateGrievers(Game.grievers.map(g => ({
    g, x: tw(g.x), y: 1.6 - (1 - g.fade) * 4.5, z: tw(g.y), fade: g.leaving ? g.fade * 0.5 : g.fade,
    moving: !!(g.dx || g.dy) && g.stun <= 0, hunting: g.hunting, muffled: walled && Maze.at(Math.round(g.x), Math.round(g.y)) !== T.GLADE,
  })), dt);
  if ((Game.phase === 'night' && !inGlade) || nearest < 5) {
    Game.beatT -= dt;
    if (Game.beatT <= 0) { Sound.heartbeat(nearest < 5 ? 1 : 0.6); Game.beatT = nearest < 5 ? 0.6 : 1; }
  }
  const amb = ambientState(p, inGlade);
  Game.indoor = amb.indoor;
  Sound.updateAmbient(dt, amb);
  Game.shake = Math.max(0, Game.shake - dt * 2);
}

// Что сейчас вокруг Томаса — для фоновых звуков
function ambientState(p, inGlade) {
  const x = tw(p.x), z = tw(p.y), ground = groundH(x, z);
  const indoor = Object.values(HOUSE_INFO).some(I => Math.abs(x - I.cx) < I.w / 2 && Math.abs(z - I.cz) < I.d / 2 && p.h > I.floor - 0.2 && p.h < I.floor + 1);
  const r = riverQuery(x, z), pen = LAYOUT.pen, px = tw((pen.x0 + pen.x1) / 2), pz = tw((pen.y0 + pen.y1) / 2);
  return {
    glade: inGlade, indoor, night: Game.phase === 'night' || Game.timeLeft < 15,
    height: p.h - ground, gust: World.gust || 0,
    trees: inGlade ? Math.min(1, Math.max(0, (p.y - MID - 1) / 6)) : 0,
    fire: Math.hypot(p.x - LAYOUT.campfire.x, p.y - LAYOUT.campfire.y) * S, stamina: p.stamina,
    river: { x: r.x, y: riverBase(r.s) - RIVER.water, z: r.z, d: r.d },
    pen: { x: px, y: groundH(px, pz) + 0.5, z: pz, d: Math.hypot(x - px, z - pz) },
    rain: Weather.cur.rain, snow: Weather.cur.snow,
  };
}

/* ---------- интерфейс ---------- */

function buildCodeSlots() {
  $('code').innerHTML = '';
  for (const w of CODE_WORDS) {
    const el = document.createElement('span');
    el.className = 'slot';
    el.textContent = w;
    $('code').appendChild(el);
  }
}

const hudCache = {};
function setText(id, v) {
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  $(id).textContent = v;
}

function updateHud() {
  const p = Game.player, hud = $('hud');
  if (hud.hidden) return;
  const s = Math.max(0, Math.ceil(Game.timeLeft));
  setText('hud-day', `День ${Game.day}`);
  // Без часов время видно только примерно (по солнцу); в последние полминуты — точно
  const exact = hasItem('watch') || s <= 30;
  setText('hud-time', exact ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : s > 90 ? `≈${Math.round(s / 60)} мин` : '≈1 мин');
  setText('hud-time-label', Game.phase === 'day' ? 'до закрытия ворот' : 'до рассвета');
  if (hudCache.phase !== Game.phase) {
    hudCache.phase = Game.phase;
    $('clock-ico').setAttribute('href', Game.phase === 'day' ? '#i-gate' : '#i-moon');
    hud.dataset.phase = Game.phase;
  }
  $('clock-fill').style.width = Math.max(0, Math.min(100, Game.timeLeft / (Game.phase === 'day' ? Game.dayLen : Game.nightLen) * 100)) + '%';
  setText('hud-season', `${SEASONS[Life.season].name} · ${Weather.label()}${Game.ngPlus ? ` · Игра+ ${Game.ngPlus}` : ''}`);
  $('bleed').hidden = !(p.bleed > 0);
  hud.classList.toggle('urgent', Game.phase === 'day' && Game.timeLeft < 30);
  hud.classList.toggle('lastlife', p.hearts === 1);
  const hearts = $('hearts').children;
  for (let i = 0; i < hearts.length; i++) hearts[i].classList.toggle('lost', i >= p.hearts);
  $('stamina-fill').style.width = p.stamina + '%';
  $('stamina').classList.toggle('tired', p.exhausted);
  $('stamina').classList.toggle('boost', p.boost > 0);
  const slots = $('code').children;
  let got = 0;
  for (let i = 0; i < slots.length; i++) {
    const it = Game.items.find(x => x.word === CODE_WORDS[i]);
    slots[i].classList.toggle('got', !!(it && it.taken));
    if (it && it.taken) got++;
  }
  setText('code-label', `Код Лабиринта · ${got} из ${CODE_WORDS.length}`);
  updateHeldInfo();
  let prompt = '';
  if (Game.state === 'play' && Game.intro <= 0) {
    const k = keyLabel(Settings.keys.action), lad = !p.climb && findLadder(p);
    const npc = !p.climb && !Items.near && npcInFront(p), sp = !npc && Secrets.prompt(p);
    if (Secrets.clearing) {
      prompt = Secrets.prompt(p);
    } else if (p.climb) {
      prompt = `${keyLabel(Settings.keys.forward)} — вверх, ${keyLabel(Settings.keys.back)} — вниз, ${k} — отпустить лестницу`;
    } else if (Items.near) {
      const def = ITEM_DEFS[Items.near.type], w = itemWeight(Items.near);
      prompt = `${k} — взять: ${def.name}${w ? ` (${w} кг)` : ''}`;
    } else if (npc) {
      prompt = `${k} — поговорить: ${npc.name}${npc.injured ? ' (ранен)' : ''}`;
    } else if (sp) {
      prompt = sp;
    } else if (playerTile() === T.GLADE && depositable().length && nearHouse('storage', 6)) {
      prompt = `${k} — сдать находки на склад`;
    } else if (lad) {
      prompt = `${k} — лезть по лестнице`;
    } else if (Game.phase === 'night' && playerTile() === T.GLADE) {
      prompt = Game.sleeping ? `Ты спишь у костра. Нажми ${keyLabel(Settings.keys.forward)}, чтобы проснуться.` : `${k} — лечь спать до утра`;
    } else if (!World.mobile && !document.pointerLockElement && canLock()) {
      prompt = 'Кликни по экрану, чтобы смотреть мышью';
    }
  }
  // «E — поговорить: Ньют» → клавиша в рамке и текст
  if (hudCache.promptRaw !== prompt) {
    hudCache.promptRaw = prompt;
    const m = /^(.{1,14}?) — (.+)$/.exec(prompt);
    const key = m && !/\s{2}/.test(m[1]) && m[1].split(' ').length <= 2 ? m[1] : '';
    $('prompt-key').textContent = key;
    $('prompt-text').textContent = key ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : prompt;
    $('prompt').hidden = !prompt;
    hud.classList.toggle('target', !!key);
  }
}

// Подсказки клавиш справа внизу (меняются вместе с настройками)
function renderKeyHints() {
  const box = $('keyhints');
  if (!box) return;
  box.innerHTML = '';
  box.hidden = !Settings.keyHints;
  for (const [id, text] of [['inventory', 'Сумка'], ['journal', 'Журнал'], ['map', 'Карта']]) {
    const d = document.createElement('div'), k = document.createElement('kbd');
    k.textContent = keyLabel(Settings.keys[id]);
    d.append(k, text);
    box.appendChild(d);
  }
  const d = document.createElement('div'), k = document.createElement('kbd');
  k.textContent = 'Esc';
  d.append(k, 'Пауза');
  box.appendChild(d);
  $('map-key').textContent = keyLabel(Settings.keys.map);
}

function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
  $('hud').hidden = Game.state === 'title' || Game.state === 'exit' || id === 'screen-title';
}

// Первый пункт меню на открытом экране получает фокус: можно сразу листать стрелками и жать Enter
function focusFirstItem() {
  if (World.mobile) return;
  const scr = [...document.querySelectorAll('.screen')].find(s => !s.hidden);
  if (!scr) return;
  const b = scr.querySelector('.menu-item:not([hidden]):not(:disabled), .btn:not(:disabled)');
  if (b) b.focus({ preventScroll: true });
}

function showBest() {
  const b = loadBest();
  $('best').textContent = b.days ? `Рекорд: ${b.days} дн. в Лабиринте, побегов: ${b.wins}` : '';
}

const QUALITY_NAMES = { high: 'высокая', medium: 'средняя', low: 'низкая' };
function showQuality() {
  for (const b of document.querySelectorAll('.btn-quality')) b.textContent = `Графика: ${QUALITY_NAMES[World.quality]}`;
}
function cycleQuality() {
  const order = ['high', 'medium', 'low'];
  const next = order[(order.indexOf(World.quality) + 1) % order.length];
  try { localStorage.setItem('maze-runner-quality', next); } catch (e) { /* без сохранения */ }
  location.reload();
}

// E: проснуться, отпустить лестницу, подобрать предмет, залезть по лестнице или лечь спать — что уместно рядом
function action() {
  if (Game.state !== 'play') return;
  const p = Game.player;
  if (Game.sleeping) { Game.sleeping = false; return; }
  if (p.climb) { p.climb = null; return; }
  if (Items.near) { pickUp(Items.near); return; }
  const npc = npcInFront(p);
  if (npc) { talkTo(npc); return; }
  if (Secrets.action(p)) return;
  if (playerTile() === T.GLADE && depositable().length && nearHouse('storage', 6)) { deposit(); return; }
  const lad = findLadder(p);
  if (lad) { startClimb(p, lad); return; }
  if (Game.phase === 'night' && playerTile() === T.GLADE) {
    Game.sleeping = true;
    Input.clear();
    toast('Ты лёг у костра. Утро наступит быстрее.', 'info');
  }
}

function togglePause() {
  if (Game.state === 'play') {
    Game.state = 'pause';
    Input.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    const s = Math.max(0, Math.ceil(Game.timeLeft));
    $('pause-info').textContent = `День ${Game.day} · ${Game.phase === 'day' ? 'до закрытия ворот' : 'до рассвета'} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    showSaveState();
    fillKeyList($('pause-keys'), ['forward', 'sprint', 'jump', 'action', 'use', 'inventory', 'map', 'journal', 'craft', 'photo']);
    showScreen('screen-pause');
    Sound.ui('open');
    focusFirstItem();
  } else if (Game.state === 'pause') {
    Game.state = 'play';
    showScreen(null);
    Sound.ui('close');
    lockPointer();
  }
}

// Когда игра сохранялась в последний раз — для паузы и меню
function saveStamp(d) {
  if (!d || !d.t) return '';
  const t = new Date(d.t), today = new Date();
  const hm = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
  return t.toDateString() === today.toDateString() ? `в ${hm}` : `${t.getDate()}.${String(t.getMonth() + 1).padStart(2, '0')} в ${hm}`;
}
function showSaveState(justSaved = false) {
  const el = $('save-state'), d = readSave();
  el.classList.toggle('ok', justSaved);
  el.textContent = justSaved ? `Сохранено ${saveStamp(d)}` : d ? `Последнее сохранение ${saveStamp(d) || 'есть'}` : 'Сохранений ещё нет';
}

// Список «клавиша — действие» для паузы и «Как играть»
function fillKeyList(dl, ids) {
  dl.innerHTML = '';
  const names = { forward: 'Идти: вперёд, влево, назад, вправо', sprint: 'Рывок', jump: 'Прыжок', action: 'Взять, говорить, лестница', use: 'Использовать предмет', inventory: 'Сумка', map: 'Карта', journal: 'Журнал: задания и записки', craft: 'Мастерская', glade: 'Совет Глэйда', squad: 'Отряд', photo: 'Фоторежим', drop: 'Бросить предмет', stow: 'Убрать предмет' };
  for (const id of ids) {
    const dt = document.createElement('dt'), k = document.createElement('kbd'), dd = document.createElement('dd');
    k.textContent = id === 'forward' ? ['forward', 'left', 'back', 'right'].map(a => keyLabel(Settings.keys[a])).join(' ') : keyLabel(Settings.keys[id]);
    dt.append(k);
    dd.textContent = names[id] || id;
    dl.append(dt, dd);
  }
  const dt = document.createElement('dt'), k = document.createElement('kbd'), dd = document.createElement('dd');
  k.textContent = '1–0';
  dd.textContent = 'Предмет в руку';
  dt.append(k);
  dl.append(dt, dd);
}

/* ---------- главное меню, подтверждения, выход ---------- */

// Окно-вопрос: buttons — [{ label, kind: 'btn'|'btn ghost'|'btn danger', fn }]; Esc — последняя кнопка
let confirmFrom = null, confirmCancel = null;
function confirmBox(title, text, buttons) {
  confirmFrom = [...document.querySelectorAll('.screen')].find(s => !s.hidden && s.id !== 'screen-confirm');
  confirmFrom = confirmFrom ? confirmFrom.id : null;
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  const box = $('confirm-actions');
  box.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = b.kind || 'btn ghost';
    el.textContent = b.label;
    el.addEventListener('click', () => { closeConfirm(); b.fn(); });
    box.appendChild(el);
  }
  confirmCancel = buttons[buttons.length - 1].fn;
  showScreen('screen-confirm');
  Sound.ui('open');
  focusFirstItem();
}
function closeConfirm() {
  showScreen(confirmFrom);
  focusFirstItem();
}

function toMainMenu() {
  confirmBox('Выйти в главное меню?', `Последнее сохранение ${saveStamp(readSave()) || 'ещё не сделано'}. Можно сохраниться перед выходом.`, [
    { label: 'Сохранить и выйти', kind: 'btn', fn: () => { saveGame(true); enterMenu(); } },
    { label: 'Выйти без сохранения', kind: 'btn danger', fn: enterMenu },
    { label: 'Отмена', kind: 'btn ghost', fn: () => {} },
  ]);
}

// Главное меню: мир остаётся за спиной — Глэйд на закате, камера переходит от плана к плану
function enterMenu() {
  closePanel();
  stopPhoto();
  Game.state = 'title';
  Input.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  Sound.clearVoices();
  Object.assign(Game, { dusk: 0.65, darkness: 0.25, timeLeft: 20, sleeping: false, intro: 0, exitShown: false });
  MenuCam.t = 0;
  updateTitle();
  showScreen('screen-title');
  focusFirstItem();
}

function exitGame() {
  if (Game.state === 'play' || Game.state === 'pause') saveGame(true);
  Game.state = 'exit';
  Sound.idle(0);
  showScreen('screen-exit');
  $('exit-text').textContent = hasSave() ? 'Прогресс сохранён в этом браузере. Вкладку можно закрыть.' : 'Вкладку можно закрыть — Лабиринт подождёт.';
  try { window.close(); } catch (e) { /* вкладку закрывает браузер, а не страница */ }
  focusFirstItem();
}

function openHelp(from) {
  fillKeyList($('help-keys'), ['forward', 'sprint', 'jump', 'action', 'use', 'stow', 'drop', 'inventory', 'map', 'journal', 'craft', 'glade', 'squad', 'photo']);
  Game.helpFrom = from;
  showScreen('screen-help');
  Sound.ui('open');
  focusFirstItem();
}
function closeHelp() {
  Sound.ui('close');
  showScreen(Game.helpFrom || 'screen-title');
  focusFirstItem();
}

// Значок звука в углу меню
function updateSoundIcon() {
  const u = $('sound-ico');
  if (u) u.setAttribute('href', Settings.muted ? '#i-mute' : '#i-sound');
}

// Стрелки вверх-вниз листают пункты меню на открытом экране
function menuNav(e) {
  const scr = [...document.querySelectorAll('.screen')].find(s => !s.hidden);
  if (!scr || (e.code !== 'ArrowDown' && e.code !== 'ArrowUp')) return false;
  const items = [...scr.querySelectorAll('.menu-item, .btn, .tab, .chip')].filter(b => !b.hidden && !b.disabled && b.offsetParent);
  if (!items.length) return false;
  e.preventDefault();
  const i = items.indexOf(document.activeElement);
  const next = items[(i + (e.code === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
  next.focus();
  Sound.ui('hover');
  return true;
}

/* ---------- управление ---------- */

const MOVE_ACTIONS = new Set(['forward', 'back', 'left', 'right']);
const PANEL_KEYS = { journal: () => openJournal(), craft: openCraft, glade: openBoard, squad: openSquad, map: openMap, inventory: openInventory };
const PANEL_OF = { journal: 'journal', craft: 'craft', glade: 'board', squad: 'squad', map: 'map', inventory: 'inventory' };

function canLock() { return !!$('game').requestPointerLock; }

function lockPointer() {
  if (World.mobile || !canLock()) return;
  try {
    const r = $('game').requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (e) { /* без захвата курсора — смотрим перетаскиванием */ }
}

window.addEventListener('keydown', e => {
  if (!$('screen-settings').hidden) { settingsKey(e); return; }
  const act = keyAction(e.code), arrow = /^Arrow/.test(e.code);
  // Экраны поверх игры: подтверждение, «Как играть», выход, меню — Esc и стрелки
  if (!$('screen-confirm').hidden) {
    if (e.code === 'Escape') { e.preventDefault(); closeConfirm(); if (confirmCancel) confirmCancel(); return; }
    menuNav(e);
    return;
  }
  if (!$('screen-help').hidden) {
    if (e.code === 'Escape') { e.preventDefault(); closeHelp(); return; }
    menuNav(e);
    return;
  }
  if (Game.state === 'exit') {
    if (e.code === 'Escape' || e.code === 'Enter') { e.preventDefault(); enterMenu(); }
    return;
  }
  if (Game.state === 'title' || Game.state === 'over' || Game.state === 'win') {
    menuNav(e);
    return;
  }
  // Фоторежим: летаем камерой, снимок — «использовать»
  if (Game.state === 'photo') {
    e.preventDefault();
    if (e.code === 'Escape' || act === 'photo') stopPhoto();
    else if (act === 'use' && !e.repeat) Photo.shoot = true;
    else Input.keys.add(e.code);
    return;
  }
  if (Game.state === 'pause') {
    if (e.code === 'Escape' || act === 'pause') { e.preventDefault(); togglePause(); return; }
    if (menuNav(e)) return;
    if (act === 'map') openMap();
    else if (act === 'inventory') openInventory();
    else if (act === 'journal') openJournal();
    return;
  }
  // Открыто окно: Esc или та же клавиша закрывают, клавиша другого окна — переключает
  if (Panel.open) {
    if (Panel.open === 'talk' && /^Digit[1-9]$/.test(e.code)) {
      const opts = [...document.querySelectorAll('#panel .talk-opt')];
      const b = opts[+e.code.slice(5) - 1];
      if (b && !b.disabled) b.click();
      return;
    }
    if (Panel.open === 'inventory' && inventoryKey(e, act)) return;
    if (e.code === 'Escape' || (act && PANEL_OF[act] === Panel.open)) { e.preventDefault(); closePanel(); return; }
    if (act && PANEL_KEYS[act] && Panel.open !== 'talk') { closePanel(); PANEL_KEYS[act](); }
    return;
  }
  if ((act && MOVE_ACTIONS.has(act)) || arrow) {
    e.preventDefault();
    Input.keys.add(e.code);
    if (Game.sleeping && (act === 'forward' || e.code === 'ArrowUp')) Game.sleeping = false;
    return;
  }
  const play = Game.state === 'play';
  if (act === 'sprint') { Input.sprint = true; return; }
  // Прыжок; спящего он будит, а с лестницы — отпускает, как «действие»
  if (act === 'jump') {
    e.preventDefault();
    if (!e.repeat && play) { if (Game.sleeping || Game.player.climb) action(); else playerJump(Game.player); }
    return;
  }
  if (act === 'action') { e.preventDefault(); if (!e.repeat) action(); return; }
  if (/^Digit[0-9]$/.test(e.code) && play) { selectSlot((+e.code.slice(5) + 9) % 10); return; }
  if (!play) return;
  if (e.code === 'Tab') { e.preventDefault(); openInventory(); return; }
  if (act === 'use') useHeld();
  else if (act === 'stow') stowHeld();
  else if (act === 'drop') dropHeld();
  else if (act === 'photo') startPhoto();
  else if (act && PANEL_KEYS[act]) PANEL_KEYS[act]();
  else if (act === 'pause' || (e.code === 'Escape' && !document.pointerLockElement)) togglePause();
});
window.addEventListener('keyup', e => {
  Input.keys.delete(e.code);
  if (keyAction(e.code) === 'sprint') Input.sprint = false;
});
window.addEventListener('blur', () => Input.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && Game.state === 'play') togglePause();
});
// Esc снимает захват курсора — тогда ставим игру на паузу, как в обычных шутерах
let wasLocked = false;
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (wasLocked && !locked && Game.state === 'play') togglePause();
  wasLocked = locked;
});

// Обзор: мышь с захватом курсора, либо перетаскивание (мышь без захвата и пальцы)
let drag = null;
function bindLook() {
  const c = $('game');
  c.addEventListener('click', () => {
    if (Game.state === 'photo') { Photo.shoot = true; return; }
    if (Game.state === 'play' && !document.pointerLockElement) lockPointer();
  });
  c.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointermove', e => {
    if (document.pointerLockElement) {
      Input.lookX += e.movementX || 0;
      Input.lookY += e.movementY || 0;
    } else if (drag && drag.id === e.pointerId) {
      const k = e.pointerType === 'touch' ? 1.6 : 1;
      Input.lookX += (e.clientX - drag.x) * k;
      Input.lookY += (e.clientY - drag.y) * k;
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });
  const end = e => { if (drag && drag.id === e.pointerId) drag = null; };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

function bindTouch() {
  const map = { up: ['f', 1], down: ['f', -1], left: ['turn', -1], right: ['turn', 1] };
  for (const b of document.querySelectorAll('[data-move]')) {
    const [axis, v] = map[b.dataset.move];
    const on = e => {
      e.preventDefault();
      e.stopPropagation();
      Input.touch[axis] = v;
      if (Game.sleeping && axis === 'f') Game.sleeping = false;
    };
    const off = () => { if (Input.touch[axis] === v) Input.touch[axis] = 0; };
    b.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, off);
  }
  const sp = $('t-sprint');
  sp.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Input.sprint = true; });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) sp.addEventListener(ev, () => { Input.sprint = false; });
  $('t-action').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); action(); });
  $('t-pause').addEventListener('click', togglePause);
  $('t-bag').addEventListener('click', () => { if (Game.state === 'play' || Panel.open === 'inventory') openInventory(); });
}

// Звук кнопок: тихий щелчок при наведении и клик при нажатии (на всех экранах и в окнах)
const UI_CLICKABLE = '.menu-item, .btn, .chip, .tab, .talk-opt, .inv-slot, .icon-btn, .link-btn, .seg button, .keybind, #btn-map';
function bindUiSounds() {
  let lastHover = null;
  document.addEventListener('pointerover', e => {
    const b = e.target.closest(UI_CLICKABLE);
    if (b === lastHover) return;
    lastHover = b;
    if (b && !b.disabled) Sound.ui('hover');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest(UI_CLICKABLE);
    if (!b || b.disabled) return;
    if (b.classList.contains('tab') || b.closest('.seg')) Sound.ui('tab');
    else if (!b.id || !['btn-start', 'btn-continue', 'btn-ngplus', 'btn-again', 'btn-win-again', 'btn-win-ngplus', 'btn-over-continue'].includes(b.id)) Sound.ui('click');
  }, true);
  document.addEventListener('focusin', e => {
    if (e.target.matches && e.target.matches('.menu-item') && e.target.matches(':focus-visible')) Sound.ui('hover');
  });
}

// Звук в меню: Глэйд на закате вокруг камеры, иногда скрежет стен вдали
let menuCreakT = 8;
function menuAmbience(dt) {
  if (!Sound.ctx || !Sound.amb) return;
  const c = World.camera.position;
  const amb = ambientState({ x: c.x / S, y: c.z / S, h: c.y - 1.68, stamina: 100 }, true);
  amb.night = false;
  Sound.updateAmbient(dt, amb);
  menuCreakT -= dt;
  if (menuCreakT <= 0) { menuCreakT = 16 + Math.random() * 18; Sound.mazeCreak(); }
}

/* ---------- запуск ---------- */

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const menu = Game.state === 'title';
  if (document.body.dataset.state !== Game.state) document.body.dataset.state = Game.state;
  if (Game.state === 'play') update(dt);
  else Game.time += dt;
  if (Game.state === 'photo') updatePhoto(dt);
  // В меню жители живут своей жизнью: вечером собираются у костра
  if (menu && World.ready) for (const n of Game.npcs) updateNpc(n, dt, Game.player);
  Sound.idle(Game.state === 'play' ? (Game.sleeping ? 0.35 : 1) : menu ? 0.85 : Game.state === 'ui' || Game.state === 'photo' ? 0.5 : 0);
  if (menu) menuAmbience(dt);
  if (Game.state !== 'exit' || !Game.exitShown) {
    renderWorld(Game.state === 'play' || menu ? dt : 0);
    if (Game.state === 'exit') Game.exitShown = true;
  }
  if (Photo.shoot) capturePhoto();
  if (!$('hud').hidden) {
    drawMinimap(dt);
    updateCompass();
    updateBubble();
    updateHud();
  }
  Tutorial.render();
  requestAnimationFrame(frame);
}

// Главное меню: «Продолжить» с подписью о сохранении, «Новая игра+» после побега
function updateTitle() {
  const d = readSave();
  $('btn-continue').hidden = !d;
  $('btn-start').classList.toggle('primary', !d);
  if (d && d.game) {
    const codes = (d.codes || []).filter(c => c.taken).length;
    $('continue-info').textContent = `День ${d.game.day} · ${d.game.phase === 'day' ? 'день' : 'ночь'} · код ${codes}/6${d.t ? ' · ' + saveStamp(d) : ''}`;
  }
  $('btn-ngplus').hidden = !Meta.unlocked;
  $('ngplus-info').textContent = `Уровень ${Meta.unlocked}: гриверов больше, стены злее`;
  showBest();
}

function showLoading(p, text) {
  $('load-fill').style.width = Math.round(p * 100) + '%';
  $('load-text').textContent = text;
}

async function boot() {
  loadSettings();
  loadMeta();
  Tutorial.load();
  Journal.loadPhotos();
  document.documentElement.style.setProperty('--ui-scale', Settings.uiScale);
  updateSoundIcon();
  showScreen('screen-title');
  showLoading(0, 'Загрузка…');
  // Шрифт нужен для табличек с кодом, но ждать его дольше секунды незачем
  if (document.fonts && document.fonts.load) {
    await Promise.race([document.fonts.load('700 46px Tektur'), new Promise(r => setTimeout(r, 1200))]).catch(() => {});
  }
  await loadAssets(p => showLoading(p * 0.9, `Загрузка ${Math.round(p * 100)}%`));
  $('asset-note').hidden = !ASSETS.blocked;
  showLoading(0.94, 'Строю Лабиринт…');
  await new Promise(r => setTimeout(r, 30));   // дать странице отрисовать надпись загрузки
  initWorld();
  applySettings();
  initMinimap();
  setupWorld();
  makeItemThumbs();
  bindLook();
  bindTouch();
  bindPanel();
  bindUiSounds();
  renderKeyHints();
  World.ready = true;
  // Звук в браузере включается только после первого нажатия — тогда же начинается фон меню
  const unlock = () => { Sound.init(); Sound.applyVolume(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  for (const id of ['btn-start', 'btn-again', 'btn-win-again']) $(id).addEventListener('click', () => { Sound.init(); Sound.ui('start'); startGame('new'); });
  for (const id of ['btn-continue', 'btn-over-continue']) $(id).addEventListener('click', () => { Sound.init(); Sound.ui('start'); startGame('continue'); });
  for (const id of ['btn-ngplus', 'btn-win-ngplus']) $(id).addEventListener('click', () => { Sound.init(); Sound.ui('start'); startGame('ngplus'); });
  for (const id of ['btn-over-menu', 'btn-win-menu']) $(id).addEventListener('click', enterMenu);
  $('btn-settings').addEventListener('click', () => openSettings('screen-title'));
  $('btn-pause-settings').addEventListener('click', () => openSettings('screen-pause'));
  $('btn-settings-back').addEventListener('click', closeSettings);
  $('btn-settings-close').addEventListener('click', closeSettings);
  $('btn-settings-reset').addEventListener('click', () => confirmBox('Сбросить настройки?', 'Громкость, графика, мышь, клавиши и интерфейс вернутся к значениям по умолчанию.', [
    { label: 'Сбросить', kind: 'btn danger', fn: resetSettings },
    { label: 'Отмена', kind: 'btn ghost', fn: () => {} },
  ]));
  $('btn-help').addEventListener('click', () => openHelp('screen-title'));
  $('btn-help-close').addEventListener('click', closeHelp);
  $('btn-help-ok').addEventListener('click', closeHelp);
  $('btn-exit').addEventListener('click', () => confirmBox('Выйти из игры?', hasSave() ? `Игра сохранена ${saveStamp(readSave())}. В следующий раз можно продолжить с этого места.` : 'Сохранений пока нет.', [
    { label: 'Выйти', kind: 'btn danger', fn: exitGame },
    { label: 'Остаться', kind: 'btn ghost', fn: () => {} },
  ]));
  $('btn-exit-back').addEventListener('click', () => { Game.exitShown = false; enterMenu(); });
  $('btn-save').addEventListener('click', () => { if (saveGame(true)) { showSaveState(true); Sound.ui('save'); } else Sound.ui('error'); });
  $('btn-to-menu').addEventListener('click', toMainMenu);
  $('q-map').addEventListener('click', openMap);
  $('q-bag').addEventListener('click', openInventory);
  $('q-journal').addEventListener('click', () => openJournal());
  $('tip-skip').addEventListener('click', () => Tutorial.skip());
  $('btn-resume').addEventListener('click', togglePause);
  $('btn-sound').addEventListener('click', () => {
    Sound.init();
    Settings.muted = !Settings.muted;
    applySettings();
    saveSettings();
  });
  $('btn-map').addEventListener('click', () => { if (Game.state === 'play') openMap(); });
  // Мир готов: экран загрузки уступает место живому Глэйду
  enterMenu();
  showLoading(1, 'Готово');
  $('menu-load').hidden = true;
  $('btn-start').disabled = false;
  $('screen-title').classList.add('ready');
  focusFirstItem();
  requestAnimationFrame(frame);
}

boot();
