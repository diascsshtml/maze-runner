// Поселение. Новая игра начинается в почти пустом Глэйде: Башня-дерево, лес, камни, река и Ящик.
// Остальное игрок строит на размеченных участках (колышки, верёвка, табличка): закладывает стройку в Совете
// Глэйда, платит материалы и работает на площадке (E), жители-строители помогают.
// Каждая постройка — своя группа объектов со своими препятствиями, опорами, огнями и предметами (их собирает
// withStruct, пока строится мир). Пока постройки нет, всё это выключено. В сохранениях без поселения
// (старые версии игры) Глэйд отстроен целиком, как раньше.

// rect — участок в тайлах (как в планировке); lvl — какую постройку экономики он открывает (уровень 1)
const SETTLE_DEFS = {
  campfire: { name: 'Костёр', at: () => LAYOUT.campfire, r: 1.6, cost: { wood: 6, stone: 8 }, work: 20,
    desc: 'Тепло и свет: у огня ночуют, на нём готовят. Без костра ночь холоднее.' },
  woodpile: { name: 'Колода и дровница', at: () => LAYOUT.woodpile, r: 1, cost: { wood: 6 }, work: 12,
    desc: 'Тут колют дрова: лесорубы работают вдвое быстрее.' },
  torches: { name: 'Факелы у Ящика', at: () => LAYOUT.box, r: 1.5, cost: { wood: 4, cloth: 2 }, work: 12, need: ['campfire'],
    desc: 'Свет в центре Глэйда ночью: гриверы у ворот видны издалека.' },
  bunk1: { name: 'Спальня', house: true, cost: { wood: 18, planks: 12, stone: 6 }, work: 70,
    desc: 'Шесть кроватей. Сон под крышей лечит и поднимает дух.', lvl: 'houses' },
  bunk2: { name: 'Вторая спальня', house: true, cost: { wood: 18, planks: 12, stone: 6 }, work: 70, need: ['bunk1'],
    desc: 'Ещё шесть кроватей — для новичков из Ящика.' },
  dining: { name: 'Столовая', house: true, cost: { wood: 20, planks: 16, stone: 10 }, work: 85, need: ['campfire'],
    desc: 'Кухня с очагом: еды уходит меньше, повар готовит пайки.', lvl: 'kitchen' },
  forge: { name: 'Кузница', house: true, cost: { wood: 16, planks: 10, stone: 16, metal: 2 }, work: 85,
    desc: 'Мастерская: копья, лом, фонарь, сумки, часы. Кузнец переплавляет лом в металл.', lvl: 'workshop' },
  storage: { name: 'Картохранилище', house: true, cost: { wood: 16, planks: 12, stone: 6 }, work: 70,
    desc: 'Склад и карты бегунов: запасов помещается больше.', lvl: 'storage' },
  pantry: { name: 'Кладовая', house: true, cost: { wood: 12, planks: 10, stone: 4 }, work: 55, need: ['storage'],
    desc: 'Припасы из Ящика под крышей: склад вмещает на треть больше.' },
  shed: { name: 'Сарай', house: true, cost: { wood: 10, planks: 8 }, work: 40, need: ['plantations'],
    desc: 'Инструменты под рукой: огородники работают быстрее.' },
  medhut: { name: 'Лазарет', house: true, cost: { wood: 14, planks: 10, cloth: 4 }, work: 60,
    desc: 'Койки и травы: раненые встают на ноги вдвое быстрее, медаки собирают травы.' },
  blood: { name: 'Живодерня', house: true, cost: { wood: 12, planks: 8, stone: 4 }, work: 50, need: ['pen'],
    desc: 'Разделка и копчение: мяса из загона хватает на всех.' },
  plantations: { name: 'Огород', rect: () => LAYOUT.plantations, cost: { wood: 10, planks: 4 }, work: 45,
    desc: 'Грядки за изгородью: огородники выращивают еду и лён на ткань.' },
  pen: { name: 'Загон', rect: () => LAYOUT.pen, cost: { wood: 10 }, work: 30,
    desc: 'Свиньи и куры из Ящика: еда, даже когда огород не родит.' },
  bridge: { name: 'Мостик', at: () => LAYOUT.bridge, r: 1.2, cost: { planks: 8, wood: 4 }, work: 30,
    desc: 'Короткий путь через реку к Южным воротам.' },
  slammer: { name: 'Кутузка', at: () => LAYOUT.slammer, r: 1.2, cost: { wood: 8, stone: 6 }, work: 25,
    desc: 'Яма с решёткой — для тех, кто нарушит правила Глэйда.' },
  graveyard: { name: 'Кладбище', rect: () => LAYOUT.graveyard, cost: { wood: 6, stone: 6 }, work: 20,
    desc: 'Память о тех, кто не вернулся из Лабиринта.' },
  rainbarrel: { name: 'Бочка для дождя', at: () => gt(5.3, -0.95), r: 0.8, cost: { planks: 6, metal: 1 }, work: 20,
    desc: 'В дождь сама набирает воду: не надо каждый день ходить с ведром к реке.' },
  palisade: { name: 'Частокол у ворот', at: () => gt(0, -11.6), r: 1.4, cost: { wood: 16, stone: 6 }, work: 40, need: ['campfire'],
    desc: 'Заострённые брёвна у всех ворот: если ворота сломают, гривер не прорвётся в Глэйд.' },
  watchfires: { name: 'Сторожевые огни', at: () => gt(0, 11.9), r: 1.2, cost: { wood: 8, stone: 8, cloth: 2 }, work: 30, need: ['campfire'],
    desc: 'Огни у ворот горят всю ночь: в Глэйде спокойнее, дух по утрам выше.' },
};
// Постройки, которые появляются сами, когда Глэйд обживается
const SETTLE_AUTO = {
  scaffold: () => Settle.built.forge,
  signs: () => Object.values(Settle.built).filter(Boolean).length >= 4,
  life_north: () => Game.npcs.length >= 4,
  life_forest: () => Game.npcs.length >= 7,
};

const Settle = { on: false, built: {}, sites: {}, work: null, plots: {}, siteMeshes: {} };
const STRUCTS = {};

// Всё, что поставят внутри fn, достаётся постройке id: меши, препятствия, опоры, огни, фонари, предметы
function withStruct(id, fn) {
  const rec = STRUCTS[id] || (STRUCTS[id] = { id, group: new THREE.Group() });
  const scene = World.scene, ownAdd = Object.prototype.hasOwnProperty.call(scene, 'add') ? scene.add : null;
  if (!rec.group.parent) THREE.Object3D.prototype.add.call(scene, rec.group);
  const prev = CUR_STRUCT, n = { f: GLADE3D.fires.length, t: GLADE3D.torches.length, l: GLADE3D.lanterns.length, s: ITEM_SPAWNS.length };
  CUR_STRUCT = id;
  scene.add = (...o) => rec.group.add(...o);
  try {
    return fn();
  } finally {
    if (ownAdd) scene.add = ownAdd; else delete scene.add;
    CUR_STRUCT = prev;
    for (const e of [...GLADE3D.fires.slice(n.f), ...GLADE3D.torches.slice(n.t), ...GLADE3D.lanterns.slice(n.l), ...ITEM_SPAWNS.slice(n.s)]) e.struct = e.struct || id;
  }
}

function isBuilt(id) {
  if (!Settle.on || !id) return true;
  if (SETTLE_AUTO[id]) return !!SETTLE_AUTO[id]();
  return !!Settle.built[id];
}

/* ---------- участки и стройплощадки ---------- */

// Участок в метрах: прямоугольник (x0..x1, z0..z1)
function plotRect(id) {
  const d = SETTLE_DEFS[id];
  let r;
  if (d.house) r = HOUSES.find(h => h.id === id).r;
  else if (d.rect) r = d.rect();
  if (r) return { x0: tw(r.x0) - S / 2 + 0.3, x1: tw(r.x1) + S / 2 - 0.3, z0: tw(r.y0) - S / 2 + 0.3, z1: tw(r.y1) + S / 2 - 0.3 };
  const p = d.at(), R = d.r * S / 2;
  return { x0: tw(p.x) - R, x1: tw(p.x) + R, z0: tw(p.y) - R, z1: tw(p.y) + R };
}

function plotLabelTexture(text, sub) {
  const c = makeCanvas(512, 160), g = c.getContext('2d');
  g.clearRect(0, 0, 512, 160);
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(28, 20, 14, 0.9)';
  g.font = '600 66px Caveat, "Segoe Print", cursive';
  g.fillText(text, 24, 58, 470);
  g.font = '600 40px Caveat, "Segoe Print", cursive';
  g.fillStyle = 'rgba(60, 44, 30, 0.85)';
  g.fillText(sub, 24, 122, 470);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

// Колышки по углам, верёвка между ними и дощечка с названием
function makePlot(id) {
  const R = plotRect(id), g = new THREE.Group(), stake = new THREE.CylinderGeometry(0.035, 0.05, 0.75, 6);
  const corners = [[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]];
  for (const [x, z] of corners) {
    const s = new THREE.Mesh(stake, GM.bark);
    s.position.set(x, groundH(x, z) + 0.3, z);
    s.castShadow = true;
    g.add(s);
  }
  const rope = new THREE.MeshStandardMaterial({ color: srgb('#b9a27a'), roughness: 1 });
  corners.forEach(([ax, az], i) => {
    const [bx, bz] = corners[(i + 1) % 4], len = Math.hypot(bx - ax, bz - az);
    const y = (groundH(ax, az) + groundH(bx, bz)) / 2 + 0.55;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 4), rope);
    l.position.set((ax + bx) / 2, y, (az + bz) / 2);
    l.rotation.set(0, -Math.atan2(bz - az, bx - ax), Math.PI / 2);
    g.add(l);
  });
  // Табличка на колышке у ближнего к центру угла
  const near = corners.slice().sort((a, b) => Math.hypot(a[0] - tw(MID), a[1] - tw(MID)) - Math.hypot(b[0] - tw(MID), b[1] - tw(MID)))[0];
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 6), GM.bark);
  post.position.set(near[0], groundH(near[0], near[1]) + 0.6, near[1]);
  g.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.03), GM.wood);
  board.position.set(near[0], groundH(near[0], near[1]) + 1.15, near[1] + 0.03);
  board.rotation.y = Math.atan2(tw(MID) - near[0], tw(MID) - near[1]);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.27), new THREE.MeshStandardMaterial({ map: plotLabelTexture(SETTLE_DEFS[id].name, 'участок'), transparent: true, roughness: 0.9 }));
  label.position.z = 0.017;
  board.add(label);
  g.add(board);
  g.userData.label = label;
  THREE.Object3D.prototype.add.call(World.scene, g);
  return g;
}

// Стройплощадка: те же колышки, плюс брёвна и доски сложены у края, леса растут с работой
function makeSite(id) {
  const R = plotRect(id), g = new THREE.Group(), cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
  const logs = new THREE.CylinderGeometry(0.14, 0.14, 2.4, 8);
  for (let k = 0; k < 5; k++) {
    const l = new THREE.Mesh(logs, GM.bark), x = R.x0 + 0.5, z = cz - 0.6 + (k % 3) * 0.3;
    l.position.set(x + Math.floor(k / 3) * 0.15, groundH(x, z) + 0.14 + Math.floor(k / 3) * 0.26, z);
    l.rotation.x = Math.PI / 2;
    l.rotation.z = Math.PI / 2;
    l.castShadow = true;
    g.add(l);
  }
  const planks = new THREE.Mesh(boxGeo(2.2, 0.3, 0.7, 1), GM.wood);
  planks.position.set(R.x1 - 0.6, groundH(R.x1 - 0.6, cz) + 0.15, cz);
  planks.rotation.y = Math.PI / 2;
  planks.castShadow = true;
  g.add(planks);
  const frame = new THREE.Group();          // каркас: стойки по углам и обвязка, растут с работой
  const post = new THREE.CylinderGeometry(0.08, 0.1, 3, 7).translate(0, 1.5, 0);
  const y0 = groundH(cx, cz);
  for (const [x, z] of [[R.x0 + 0.4, R.z0 + 0.4], [R.x1 - 0.4, R.z0 + 0.4], [R.x1 - 0.4, R.z1 - 0.4], [R.x0 + 0.4, R.z1 - 0.4]]) {
    const p = new THREE.Mesh(post, GM.bark);
    p.position.set(x, y0, z);
    p.castShadow = true;
    frame.add(p);
  }
  g.add(frame);
  g.userData.frame = frame;
  THREE.Object3D.prototype.add.call(World.scene, g);
  return g;
}

function applyStructs() {
  for (const rec of Object.values(STRUCTS)) rec.group.visible = isBuilt(rec.id);
  for (const c of COLLIDERS) if (c.struct) c.off = !isBuilt(c.struct);
  for (const p of TERRAIN.platforms) if (p.struct) p.off = !isBuilt(p.struct);
  for (const l of GLADE3D.lanterns) if (l.glow && l.struct) l.glow.visible = isBuilt(l.struct);
  for (const id of Object.keys(SETTLE_DEFS)) {
    const built = isBuilt(id), site = !built && Settle.sites[id];
    if (!Settle.plots[id] && Settle.on && !built) Settle.plots[id] = makePlot(id);
    if (Settle.plots[id]) Settle.plots[id].visible = Settle.on && !built;
    if (site && !Settle.siteMeshes[id]) Settle.siteMeshes[id] = makeSite(id);
    if (Settle.siteMeshes[id]) Settle.siteMeshes[id].visible = !!site;
  }
  if (Fauna.pen) for (const m of Fauna.pen) m.visible = isBuilt('pen');
  const built = Object.values(Settle.built).filter(Boolean).length;
  GROUND_LIFE.tread.value = Settle.on ? Math.min(1, 0.18 + built * 0.07 + (Game.npcs || []).length * 0.05) : 1;
  GROUND_LIFE.tilled.value = isBuilt('plantations') ? 1 : 0;
  if (typeof refreshNameWall === 'function') refreshNameWall();
}

/* ---------- стройка ---------- */

function siteNeedText(id) {
  const d = SETTLE_DEFS[id], miss = Admin.creative ? [] : (d.need || []).filter(n => !isBuilt(n));
  return miss.length ? 'сначала: ' + miss.map(n => SETTLE_DEFS[n].name.toLowerCase()).join(', ') : '';
}

function startSite(id) {
  const d = SETTLE_DEFS[id];
  if (isBuilt(id) || Settle.sites[id] || siteNeedText(id) || !canPay(d.cost)) return;
  pay(d.cost);
  Settle.sites[id] = { t: 0 };
  if (Admin.creative) { finishSite(id); return; }   // креатив: строится сразу
  applyStructs();
  toast(`Заложена стройка: ${d.name}. Подойди к участку и работай (${keyLabel(Settings.keys.action)}), молоток ускоряет дело.`, 'info');
  Sound.work('hammer', (plotRect(id).x0 + plotRect(id).x1) / 2, 0, (plotRect(id).z0 + plotRect(id).z1) / 2);
}

function siteNear(p, extra = 1.6) {
  const x = tw(p.x), z = tw(p.y);
  for (const id of Object.keys(Settle.sites)) {
    const R = plotRect(id);
    if (x > R.x0 - extra && x < R.x1 + extra && z > R.z0 - extra && z < R.z1 + extra) return id;
  }
  return null;
}

// Сколько работы в секунду даёт Томас: руками медленно, с молотком — в полную силу
function playerBuildRate() {
  const h = heldItem();
  return h && h.type === 'hammer' ? 1 : 0.45;
}

function addSiteWork(id, w) {
  const s = Settle.sites[id];
  if (!s) return;
  s.t += w;
  const frame = Settle.siteMeshes[id] && Settle.siteMeshes[id].userData.frame;
  if (frame) frame.scale.y = Math.max(0.05, Math.min(1, s.t / SETTLE_DEFS[id].work * 1.4));
  if (s.t >= SETTLE_DEFS[id].work) finishSite(id);
}

function finishSite(id) {
  const d = SETTLE_DEFS[id];
  delete Settle.sites[id];
  Settle.built[id] = true;
  if (Settle.work === id) Settle.work = null;
  if (d.lvl) Life.lvl[d.lvl] = Math.max(1, Life.lvl[d.lvl] || 0);
  applyStructs();
  for (const s of ITEM_SPAWNS) if (s.struct === id) spawnWorldItem(s.type, s.x, s.y, s.z);
  addMorale(5);
  Sound.pickup();
  Story.checkQuests();
  toast(`Построено: ${d.name}. ${d.desc}`, 'good');
  Journal.addPlace(`Построено: ${d.name}`, 'Глэйд');
  if (Panel.open === 'board') refreshPanel();
}

Object.assign(Settle, {
  prompt(p) {
    if (!Settle.on) return '';
    const k = keyLabel(Settings.keys.action);
    if (Settle.work) {
      const s = Settle.sites[Settle.work];
      return s ? `Строю: ${SETTLE_DEFS[Settle.work].name} — ${Math.floor(s.t / SETTLE_DEFS[Settle.work].work * 100)}%` : '';
    }
    const id = siteNear(p);
    if (id) return `${k} — работать на стройке: ${SETTLE_DEFS[id].name} (${Math.floor(Settle.sites[id].t / SETTLE_DEFS[id].work * 100)}%)`;
    return '';
  },
  action(p) {
    if (!Settle.on) return false;
    if (Settle.work) { Settle.work = null; return true; }
    const id = siteNear(p);
    if (!id) return false;
    Settle.work = id;
    Settle.workAt = { x: p.x, y: p.y };
    Settle.hitT = 0;
    return true;
  },
});

function updateSettle(dt) {
  Settle.swing = Math.max(0, (Settle.swing || 0) - dt * 3);
  if (!Settle.on) return;
  refreshNameWall();
  const p = Game.player;
  if (Settle.work) {
    if (Math.hypot(p.x - Settle.workAt.x, p.y - Settle.workAt.y) > 0.3 || !Settle.sites[Settle.work]) Settle.work = null;
    else {
      addSiteWork(Settle.work, playerBuildRate() * dt);
      Settle.hitT -= dt;
      if (Settle.hitT <= 0) {
        Settle.hitT = 0.7;
        Settle.swing = 1;
        Sound.work('hammer', tw(p.x), p.h + 1, tw(p.y));
        Game.shake = Math.max(Game.shake, 0.08);
      }
    }
  }
  // Строители-жители помогают днём на ближайшей стройке
  if (Game.phase === 'day') {
    const helpers = Game.npcs.filter(n => n.role === 'builder' && !n.injured && !n.companion).length;
    const id = Object.keys(Settle.sites)[0];
    if (id && helpers) addSiteWork(id, helpers * 0.6 * dt);
  }
  // Автопостройки (указатели, кострища, леса) включаются, когда Глэйд обжился
  const key = Object.keys(SETTLE_AUTO).map(isBuilt).join('');
  if (key !== Settle.autoKey) { Settle.autoKey = key; applyStructs(); }
}

/* ---------- новая игра, сохранение ---------- */

function resetSettle(newGame) {
  Settle.on = !!newGame;
  Settle.built = {};
  Settle.sites = {};
  Settle.work = null;
  Settle.autoKey = '';
  if (Settle.on) {
    for (const k of ['workshop', 'kitchen', 'storage', 'houses']) Life.lvl[k] = 0;
    // В Ящике вместе с Томасом приехало немного припасов
    Object.assign(Life.res, { wood: 0, food: 12, metal: 2, cloth: 3, herbs: 2, stone: 0, planks: 0, water: 4 });
  }
  applyStructs();
}

function settleSave() { return Settle.on ? { on: true, built: Settle.built, sites: Settle.sites } : null; }
function settleLoad(d) {
  Settle.on = !!(d && d.on);
  // Сохранение из прежней версии: Глэйд отстроен, все постройки хотя бы первого уровня
  if (!Settle.on) for (const k of ['workshop', 'kitchen', 'storage', 'houses']) Life.lvl[k] = Math.max(1, Life.lvl[k] || 0);
  Settle.built = (d && d.built) || {};
  Settle.sites = (d && d.sites) || {};
  Settle.work = null;
  applyStructs();
}

// Раздел «Стройка Глэйда» в Совете: участки, что на них нужно, что уже строится
function renderSettleBoard(body) {
  if (!Settle.on) return;
  body.append(el('h3', 'panel-sub', 'Стройка Глэйда'));
  const list = Object.entries(SETTLE_DEFS).sort(([a], [b]) => (isBuilt(a) - isBuilt(b)) || (!!siteNeedText(a) - !!siteNeedText(b)));
  for (const [id, d] of list) {
    const card = el('div', 'bcard' + (isBuilt(id) ? ' done' : siteNeedText(id) ? ' locked' : '')), head = el('div', 'bhead');
    head.append(el('b', '', d.name), el('span', 'lvl', isBuilt(id) ? 'готово' : Settle.sites[id] ? 'строится' : ''));
    card.append(head, el('p', '', d.desc));
    if (Settle.sites[id]) {
      const bar = el('div', 'bar'), fill = el('i');
      fill.style.width = Math.min(100, Settle.sites[id].t / d.work * 100) + '%';
      bar.append(fill);
      card.append(el('p', 'panel-note', `Работай на участке (${keyLabel(Settings.keys.action)}). Строители помогают днём.`), bar);
    } else if (!isBuilt(id)) {
      const why = siteNeedText(id);
      card.append(el('p', 'panel-note', `Нужно: ${costText(d.cost)}${why ? ' · ' + why : ''}`));
      card.append(button('Заложить', () => { startSite(id); refreshPanel(); }, { cls: 'btn small', disabled: !!why || !canPay(d.cost) }));
    }
    body.append(card);
  }
}
