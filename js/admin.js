// Терминал ПОРОКа — командная строка администратора: Ё (`) или / в игре, кнопка в паузе.
// Режимы: полёт сквозь стены, бессмертие, креатив (всё бесплатно и сразу), рентген (гриверы, коды, тайники
// и выход сквозь стены и на карте), наблюдение (живая сводка). Плюс постройки, вещи, телепорт, время, погода,
// гриверы и «знать всё» — списки жителей, гриверов, кодов, тайников, заданий.
// Режимы браузер помнит между запусками, в сохранение игры они не попадают.
// Команды понимают русские и английские имена и неверную раскладку («адн» — это fly).

const ADMIN_KEY = 'maze-runner-admin';
const ADMIN_MODES = ['fly', 'god', 'creative', 'xray', 'info', 'peace', 'timeStop'];
const ADMIN_MODE_NAMES = { fly: 'полёт', god: 'бессмертие', creative: 'креатив', xray: 'рентген', info: 'наблюдение', peace: 'без гриверов', timeStop: 'время стоит' };
const Admin = {
  open: false, prev: null, greeted: false, hist: [], hi: -1, draft: '',
  fly: false, god: false, creative: false, xray: false, info: false, peace: false, timeStop: false, speed: 1,
  up: false, lastJump: 0, vel: { x: 0, y: 0, z: 0 },
  fps: 0, fpsN: 0, fpsT: 0, calls: 0, tris: 0, infoT: 0, flagsKey: '', tags: new Map(), v: null,
};

function loadAdmin() {
  try {
    const s = JSON.parse(localStorage.getItem(ADMIN_KEY));
    if (!s) return;
    for (const k of ADMIN_MODES) Admin[k] = !!s[k];
    Admin.speed = Math.max(0.25, Math.min(12, +s.speed || 1));
    if (Array.isArray(s.hist)) Admin.hist = s.hist.slice(-60);
  } catch (e) { /* без памяти — всё выключено */ }
}
function saveAdmin() {
  try {
    const s = Object.fromEntries(ADMIN_MODES.map(k => [k, Admin[k]]));
    localStorage.setItem(ADMIN_KEY, JSON.stringify({ ...s, speed: Admin.speed, hist: Admin.hist.slice(-60) }));
  } catch (e) { /* без памяти */ }
}
loadAdmin();

function adminGod() { return Admin.god || Admin.creative; }
// Гриверы, ловушки и камни не ранят: бессмертие, креатив или полёт (призрак над Лабиринтом)
function adminSafe() { return adminGod() || Admin.fly; }
function adminActive() { return ADMIN_MODES.some(k => Admin[k]) || Admin.speed !== 1; }
function inGame() { return !!Game.player && Game.state !== 'title' && Game.state !== 'exit'; }

/* ---------- раскладка, имена ---------- */

const RU_KEYS = 'ёйцукенгшщзхъфывапролджэячсмитьбю.', EN_KEYS = '`qwertyuiop[]asdfghjkl;\'zxcvbnm,./';
function swapLayout(s, from, to) { return [...s].map(c => { const i = from.indexOf(c); return i < 0 ? c : to[i]; }).join(''); }
function adminNorm(s) { return String(s).toLowerCase().replace(/ё/g, 'е').trim(); }
// Слово совпадает с именем целиком или началом (от трёх букв)
function nameHit(w, name) { const n = adminNorm(name); return n === w || (w.length >= 3 && n.startsWith(w)); }
function onOff(args, cur) {
  const a = args[0];
  if (['вкл', 'on', '1', 'да', 'yes'].includes(a)) return true;
  if (['выкл', 'off', '0', 'нет', 'no'].includes(a)) return false;
  return !cur;
}
function mmss(t) { t = Math.max(0, Math.round(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
function metersTo(x, y) { const p = Game.player; return Math.round(Math.hypot(x - p.x, y - p.y) * S); }
function whereWord(x, y) {
  const s = sectorOfTile(Math.round(x), Math.round(y));
  return s ? `сектор ${ROMAN[s - 1]}` : 'Глэйд';
}
function dirWord(x, y) { const p = Game.player; return compassWord(bearingDeg(x - p.x, y - p.y)); }

/* ---------- вывод ---------- */

function out(text, kind = 'info') {
  const log = $('adm-log');
  log.appendChild(el('div', 'adm-l ' + kind, text));
  while (log.childElementCount > 400) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
function outRows(rows, kind = '') {
  const log = $('adm-log');
  for (const [a, b] of rows) {
    const r = el('div', 'adm-row ' + kind);
    r.append(el('span', 'k', a), el('span', 'v', b));
    log.appendChild(r);
  }
  log.scrollTop = log.scrollHeight;
}

/* ---------- открыть, закрыть, клавиши ---------- */

function openAdmin() {
  if (Admin.open || Lift.active) return;
  Admin.open = true;
  Admin.prev = Game.state;
  if (Game.state === 'play') Game.state = 'ui';
  Input.clear();
  Admin.up = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('admin').hidden = false;
  if (!Admin.greeted) {
    Admin.greeted = true;
    out('ПОРОК · терминал наблюдения. Все системы Глэйда и Лабиринта под контролем.', 'head');
    out('«помощь» — все команды. Tab — дописать, ↑ ↓ — прошлые команды, Esc — закрыть. Можно по-английски: fly, god, creative…', 'dim');
    if (adminActive()) out('Включено: ' + adminFlagList().join(', ') + '.', 'ok');
  }
  const inp = $('adm-in');
  inp.value = '';
  adminHint();
  inp.focus({ preventScroll: true });
  Sound.ui('open');
}

function closeAdmin(relock = true) {
  if (!Admin.open) return;
  Admin.open = false;
  $('admin').hidden = true;
  $('adm-in').blur();
  Sound.ui('close');
  if (Game.state === 'ui' && Admin.prev === 'play' && !Panel.open) {
    Game.state = 'play';
    if (relock) lockPointer();
  }
}

// Вызывается первым из общего обработчика клавиш; true — клавиша съедена
function adminKey(e) {
  if (Admin.open) {
    const inp = $('adm-in');
    if (e.code === 'Escape' || (e.code === 'Backquote' && !inp.value)) { e.preventDefault(); closeAdmin(); return true; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); adminRun(inp.value); return true; }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); adminHistory(e.code === 'ArrowUp' ? 1 : -1); return true; }
    if (e.code === 'Tab') { e.preventDefault(); adminComplete(); return true; }
    if (document.activeElement !== inp) inp.focus({ preventScroll: true });
    return true;
  }
  const st = Game.state;
  const free = $('screen-confirm').hidden && $('screen-help').hidden && !Lift.active;
  if (!e.repeat && free && (e.code === 'Backquote' || (e.code === 'Slash' && st === 'play')) && (st === 'play' || st === 'pause' || st === 'title')) {
    e.preventDefault();
    openAdmin();
    return true;
  }
  if (e.code === Settings.keys.jump && st === 'play' && !Lift.active) {
    // В креативе двойной пробел включает и выключает полёт, как в Minecraft
    if (Admin.creative && !e.repeat) {
      const now = performance.now();
      if (now - Admin.lastJump < 320) { adminSetFly(!Admin.fly); Admin.lastJump = 0; } else Admin.lastJump = now;
    }
    Admin.up = true;
    if (Admin.fly) { e.preventDefault(); return true; }
  }
  return false;
}
window.addEventListener('keyup', e => { if (e.code === Settings.keys.jump) Admin.up = false; });
window.addEventListener('blur', () => { Admin.up = false; });
// Колесо в полёте — скорость
window.addEventListener('wheel', e => {
  if (!Admin.fly || Game.state !== 'play') return;
  Admin.speed = Math.max(0.25, Math.min(12, Admin.speed * (e.deltaY < 0 ? 1.25 : 0.8)));
  hudFloat(`Скорость полёта ×${Admin.speed.toFixed(2).replace(/\.?0+$/, '')}`);
  saveAdmin();
}, { passive: true });

function adminHistory(dir) {
  const inp = $('adm-in'), h = Admin.hist;
  if (!h.length) return;
  if (Admin.hi < 0) Admin.draft = inp.value;
  Admin.hi = Math.max(-1, Math.min(h.length - 1, Admin.hi + dir));
  inp.value = Admin.hi < 0 ? Admin.draft : h[h.length - 1 - Admin.hi];
  inp.setSelectionRange(inp.value.length, inp.value.length);
  adminHint();
}

function adminMatches(word) {
  const w = adminNorm(word);
  if (!w) return [];
  return ADMIN_CMDS.filter(c => c.n.some(n => n.startsWith(w)));
}
// Tab дописывает имя команды (на том языке, на котором начато)
function adminComplete() {
  const inp = $('adm-in'), m = inp.value.match(/^(\/?)(\S*)(.*)$/);
  if (!m || m[3]) return;
  const w = adminNorm(m[2]), c = adminMatches(w)[0];
  if (!c) return;
  inp.value = m[1] + c.n.find(n => n.startsWith(w)) + ' ';
  adminHint();
}
function adminHint() {
  const hint = $('adm-hint'), w = $('adm-in').value.replace(/^\//, '').split(/\s+/)[0];
  const list = w ? adminMatches(w).slice(0, 5) : [];
  hint.textContent = list.length ? list.map(c => `${c.n[0]}${c.a ? ' ' + c.a : ''} — ${c.d}`).join('   ·   ') : 'Enter — выполнить · Tab — дописать · ↑ ↓ — история · Esc — закрыть';
}

/* ---------- выполнение ---------- */

function adminCmd(w) { return ADMIN_CMDS.find(c => c.n.includes(w)); }

function adminRun(line) {
  const text = line.trim();
  const inp = $('adm-in');
  inp.value = '';
  Admin.hi = -1;
  adminHint();
  if (!text) return;
  if (Admin.hist[Admin.hist.length - 1] !== text) Admin.hist.push(text);
  out('ПОРОК> ' + text, 'cmd');
  const raw = text.replace(/^[/.]/, '').split(/\s+/);
  let words = raw.map(adminNorm), c = adminCmd(words[0]);
  // Набрали не в той раскладке: «адн» → fly, «gjk`n» → полёт
  const alts = [words[0]];
  for (const [a, b] of [[RU_KEYS, EN_KEYS], [EN_KEYS, RU_KEYS]]) {
    if (c) break;
    const w = raw.map(s => adminNorm(swapLayout(s.toLowerCase(), a, b)));
    alts.push(w[0]);
    if ((c = adminCmd(w[0]))) { words = w; out(`(другая раскладка: ${w.join(' ')})`, 'dim'); }
  }
  if (!c) {
    const near = [...new Set(alts.flatMap(w => adminMatches(w.slice(0, 2)).map(x => x.n[0])))].slice(0, 4);
    out(`Нет такой команды: «${words[0]}».${near.length ? ' Может, ' + near.join(', ') + '?' : ''} Список — «помощь».`, 'err');
    return;
  }
  if (c.game && !inGame()) { out('Сначала начни игру: эта команда работает в Глэйде и Лабиринте.', 'err'); return; }
  try {
    c.f(words.slice(1));
  } catch (err) {
    out('Сбой: ' + err.message, 'err');
    console.error(err);
  }
  saveAdmin();
  adminFlags(true);
}

/* ---------- режимы ---------- */

function adminFlagList() {
  const l = ADMIN_MODES.filter(k => Admin[k]).map(k => ADMIN_MODE_NAMES[k]);
  if (Admin.speed !== 1) l.push('скорость ×' + Admin.speed.toFixed(2).replace(/\.?0+$/, ''));
  return l;
}

function adminSetFly(on) {
  if (Admin.fly === on) return;
  Admin.fly = on;
  const p = Game.player;
  if (p) {
    p.climb = null;
    p.vh = 0;
    Admin.vel.x = Admin.vel.y = Admin.vel.z = 0;
  }
  if (!Admin.open && Game.state === 'play') hudFloat(on ? 'Полёт' : 'Полёт выключен');
  saveAdmin();
}

function modeCmd(key, onText, offText) {
  return args => {
    const on = onOff(args, Admin[key]);
    if (key === 'fly') adminSetFly(on); else Admin[key] = on;
    out(on ? onText : offText, on ? 'ok' : 'warn');
  };
}

// Полёт: вперёд — куда смотришь (вверх и вниз тоже), вбок — по горизонтали; прыжок — вверх, рывок — вниз.
// Сквозь стены и крыши, с плавным разгоном
function adminFly(p, dt) {
  const f = Math.max(-1, Math.min(1, Input.forward())), s = Input.strafe();
  const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  let tx = Math.cos(p.yaw) * cp * f - Math.sin(p.yaw) * s;
  let tz = Math.sin(p.yaw) * cp * f + Math.cos(p.yaw) * s;
  let ty = sp * f + (Admin.up ? 1 : 0) - (Input.sprint ? 1 : 0);
  const len = Math.hypot(tx, ty, tz);
  if (len > 1) { tx /= len; ty /= len; tz /= len; }
  const v = Admin.vel, speed = 12 * Admin.speed, k = Math.min(1, dt * 6);
  v.x += (tx * speed - v.x) * k;
  v.y += (ty * speed - v.y) * k;
  v.z += (tz * speed - v.z) * k;
  p.x = Math.max(-30, Math.min(SIZE + 30, p.x + v.x * dt / S));
  p.y = Math.max(-30, Math.min(SIZE + 30, p.y + v.z * dt / S));
  p.h = Math.max(groundH(tw(p.x), tw(p.y)), Math.min(260, p.h + v.y * dt));
  Object.assign(p, { vh: 0, climb: null, wet: false, air: true, moving: false, sprinting: false, landed: 0 });
  p.stamina = Math.min(100, p.stamina + 22 * dt);
  if (p.stamina >= 35) p.exhausted = false;
  p.invuln = Math.max(0, p.invuln - dt);
}

// Каждый кадр игры: бессмертие держит жизни и силы, креатив — полный склад, «без гриверов» — уводит их
function adminUpdate() {
  const p = Game.player;
  if (adminGod()) Object.assign(p, { hearts: 3, stamina: 100, exhausted: false, bleed: 0 });
  if (Admin.creative) for (const k of Object.keys(RES_NAMES)) Life.res[k] = Math.max(Life.res[k] || 0, storageCap());
  if (Admin.peace) for (const g of Game.grievers) g.leaving = true;
}

/* ---------- постройки, вещи, запасы ---------- */

// Постройка без стройки: то же, что finishSite, но тихо — для «построить всё»
function adminFinishSite(id) {
  const d = SETTLE_DEFS[id];
  delete Settle.sites[id];
  Settle.built[id] = true;
  if (Settle.work === id) Settle.work = null;
  if (d.lvl) Life.lvl[d.lvl] = Math.max(1, Life.lvl[d.lvl] || 0);
  for (const s of ITEM_SPAWNS) if (s.struct === id) spawnWorldItem(s.type, s.x, s.y, s.z);
}

function adminBuildMax() {
  Life.build = null;
  for (const id of Object.keys(BUILDINGS)) {
    while ((Life.lvl[id] || 0) < 3) {
      Life.lvl[id] = (Life.lvl[id] || 0) + 1;
      decorateBuilding(id, Life.lvl[id]);
    }
  }
}

function findSettle(w) {
  return Object.keys(SETTLE_DEFS).find(id => id === w) || Object.keys(SETTLE_DEFS).find(id => nameHit(w, SETTLE_DEFS[id].name));
}

function cmdBuild(args) {
  const w = args.join(' ');
  if (!w) {
    if (!Settle.on) out('В этой игре Глэйд отстроен целиком (сохранение из старой версии).', 'info');
    else outRows(Object.keys(SETTLE_DEFS).map(id => {
      const s = Settle.sites[id];
      return [SETTLE_DEFS[id].name, isBuilt(id) ? 'построено' : s ? `строится ${Math.floor(s.t / SETTLE_DEFS[id].work * 100)}%` : 'участок'];
    }));
    outRows(Object.keys(BUILDINGS).map(id => [BUILDINGS[id].name, `уровень ${Life.lvl[id] || 0} из 3`]), 'dim');
    out('построить всё · построить макс · построить <название>', 'dim');
    return;
  }
  const all = ['все', 'всё', 'all', 'везде'].includes(w), max = ['макс', 'max', 'максимум'].includes(w);
  if (all || max) {
    let n = 0;
    if (Settle.on) for (const id of Object.keys(SETTLE_DEFS)) if (!Settle.built[id]) { adminFinishSite(id); n++; }
    if (max) adminBuildMax();
    applyStructs();
    Story.checkQuests();
    addMorale(10);
    Sound.pickup();
    if (Panel.open === 'board') refreshPanel();
    out(n ? `Построено сразу: ${n}. Глэйд отстроен целиком.` : 'Все участки Глэйда уже застроены.', 'ok');
    if (max) out('Мастерская, кухня, склад и дома — третий уровень.', 'ok');
    return;
  }
  const id = findSettle(w);
  if (!id) { out(`Не знаю постройку «${w}». Список — «построить».`, 'err'); return; }
  if (!Settle.on || isBuilt(id)) { out(`${SETTLE_DEFS[id].name}: уже стоит.`, 'info'); return; }
  adminFinishSite(id);
  applyStructs();
  Story.checkQuests();
  if (Panel.open === 'board') refreshPanel();
  out(`Построено: ${SETTLE_DEFS[id].name}.`, 'ok');
}

const ITEM_ALIASES = { сумка: 'bag3', рюкзак: 'bag3', bag: 'bag3', хлам: 'scrap', лом: 'crowbar', металлолом: 'scrap', еда: 'ration', вода: 'flask' };
function findItem(w) {
  if (ITEM_DEFS[w]) return w;
  if (ITEM_ALIASES[w]) return ITEM_ALIASES[w];
  return Object.keys(ITEM_DEFS).find(id => nameHit(w, ITEM_DEFS[id].name)) ||
    Object.keys(ITEM_DEFS).find(id => adminNorm(ITEM_DEFS[id].name).split(' ').some(part => nameHit(w, part)));
}
const ADMIN_KIT = ['bag3', 'lantern', 'spear', 'knife', 'rope', 'crowbar', 'flask', 'axe', 'pickaxe', 'hammer', 'bucket'];

function cmdGive(args) {
  const n = Number.isFinite(+args[args.length - 1]) && args.length > 1 ? Math.max(1, Math.min(20, +args.pop())) : 1;
  const w = args.join(' ');
  if (!w) {
    out('Вещи: ' + Object.keys(ITEM_DEFS).filter(id => id !== 'note').map(id => ITEM_DEFS[id].name.toLowerCase()).join(', ') + '.', 'info');
    out('дать <вещь> [сколько] · дать всё — снаряжение бегуна', 'dim');
    return;
  }
  if (['все', 'всё', 'all', 'набор', 'kit'].includes(w)) {
    for (const id of ADMIN_KIT) if (id === 'bag3' || !hasItem(id)) giveItem(id);
    out('Выдано снаряжение: рюкзак бегуна, фонарь, копьё, нож, верёвка, лом, фляга, топор, кирка, молоток, ведро.', 'ok');
    if (!Admin.creative) out('Тяжело? В креативе вес не мешает бежать.', 'dim');
    return;
  }
  const id = findItem(w);
  if (!id || id === 'note') { out(`Нет такой вещи: «${w}». Список — «дать».`, 'err'); return; }
  let inBag = 0;
  for (let i = 0; i < n; i++) if (giveItem(id)) inBag++;
  out(`Выдано: ${ITEM_DEFS[id].name}${n > 1 ? ' ×' + n : ''}${inBag < n ? ` — в сумку ${inBag}, остальное лежит рядом (сумка полна)` : ''}.`, inBag < n ? 'warn' : 'ok');
}

function findRes(w) { return Object.keys(RES_NAMES).find(k => k === w || nameHit(w, RES_NAMES[k])); }
function cmdRes(args) {
  if (!args.length) {
    outRows(Object.keys(RES_NAMES).map(k => [RES_NAMES[k], `${Math.floor(Life.res[k] || 0)} из ${storageCap()}`]));
    out('ресурсы макс · ресурсы <запас> <число>', 'dim');
    return;
  }
  if (['макс', 'max', 'все', 'всё', 'all'].includes(args[0])) {
    for (const k of Object.keys(RES_NAMES)) Life.res[k] = storageCap();
    out(`Склад полон: всего по ${storageCap()}.`, 'ok');
    return;
  }
  const k = findRes(args[0]), v = +args[1];
  if (!k || !Number.isFinite(v)) { out('Так: ресурсы дерево 50 (или ресурсы макс).', 'err'); return; }
  Life.res[k] = Math.max(0, Math.round(v));
  out(`${RES_NAMES[k]}: ${Life.res[k]}.`, 'ok');
}

/* ---------- телепорт ---------- */

const GATE_WORDS = [['с', 'север', 'северные', 'n', 'north'], ['в', 'восток', 'восточные', 'e', 'east'], ['ю', 'юг', 'южные', 's', 'south'], ['з', 'запад', 'западные', 'w', 'west']];

// Куда телепортироваться: тайл (x, y), подпись и высота ног, если не на землю
function adminPlace(args) {
  const w = args.join(' '), p = Game.player, a0 = args[0] || '';
  const nums = args.map(Number);
  if (args.length >= 2 && nums.slice(0, 2).every(Number.isFinite)) return { x: nums[0], y: nums[1], name: `тайл ${nums[0]}, ${nums[1]}` };
  const nearest = list => list.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  const is = (...names) => names.some(n => nameHit(a0, n));
  if (is('глэйд', 'glade', 'ящик', 'box', 'центр', 'дом', 'home')) return { x: LAYOUT.box.x, y: LAYOUT.box.y + 1.4, name: 'Глэйд, у Ящика' };
  if (is('башня', 'tower')) {
    // Настилы — кольца вокруг ствола: встаём посередине верхнего, лицом к Ящику
    const T = LAYOUT.tower, spec = LAYOUT.towerSpec, d = spec.decks[spec.decks.length - 1];
    const a = Math.atan2(LAYOUT.box.y - T.y, LAYOUT.box.x - T.x), r = (d.r + spec.trunkR * (1 - 0.03 * d.h)) / 2 / S;
    return { x: T.x + Math.cos(a) * r, y: T.y + Math.sin(a) * r, h: 80, yaw: a, free: true, name: 'Башня, верхний настил' };
  }
  if (is('выход', 'exit')) return { x: Maze.exit.x, y: Maze.exit.y, name: Game.exitOpen ? 'выход' : 'выход (ещё закрыт)' };
  const gi = GATE_WORDS.findIndex(ws => ws.includes(args[is('ворота', 'gate', 'gates') ? 1 : 0]));
  if (gi >= 0 || is('ворота', 'gate', 'gates')) {
    const g = gi >= 0 ? GATES[gi] : nearest([...GATES]);
    return { x: g.x + Math.sign(MID - g.x) * 2, y: g.y + Math.sign(MID - g.y) * 2, name: `${g.name} ворота` };
  }
  if (is('сектор', 'sector')) {
    const r = adminNorm(args[1] || ''), s = Number.isFinite(+r) ? +r : ROMAN.findIndex(x => x.toLowerCase() === r) + 1;
    if (!(s >= 1 && s <= 8)) return { err: 'Сектор — число от 1 до 8 (или I…VIII).' };
    const ang = (s - 1) * Math.PI / 4 - Math.PI / 2, R = SIZE * 0.33;
    const t = nearestPassable(Math.round(MID + Math.cos(ang) * R), Math.round(MID + Math.sin(ang) * R), grieverPass);
    return t && { x: t.x, y: t.y, name: `сектор ${ROMAN[s - 1]} · ${SECTOR_THEMES[s].name}` };
  }
  if (is('код', 'code', 'коды')) {
    const left = Game.items.filter(it => !it.taken), byWord = Game.items.find(it => nameHit(adminNorm(args[1] || '-'), it.word));
    const it = byWord || nearest(left);
    return it ? { x: it.x, y: it.y, name: `код ${it.word}` } : { err: 'Все фрагменты кода уже собраны.' };
  }
  if (is('гривер', 'griever', 'гриверы')) {
    const g = nearest(Game.grievers.filter(q => !q.leaving));
    return g ? { x: Math.round(g.x), y: Math.round(g.y), name: 'гривер' + (adminSafe() ? '' : ' — осторожно, ты не бессмертен!') } : { err: 'Гриверов сейчас нет.' };
  }
  if (is('тайник', 'тайная', 'комната', 'secret')) {
    const r = nearest(Secrets.rooms.filter(q => !q.open)) || nearest([...Secrets.rooms]);
    return r ? { x: r.center.x, y: r.center.y, name: `тайная комната, сектор ${ROMAN[r.sector - 1]}` } : { err: 'Тайных комнат нет.' };
  }
  const n = Game.npcs.find(q => nameHit(a0, q.name));
  if (n) return { x: n.x + 0.5, y: n.y, name: n.name };
  const id = findSettle(w) || findSettle(a0);
  if (id) {
    const d = SETTLE_DEFS[id];
    if (d.house) { const h = houseOf(id); return { x: h.doorOut.x, y: h.doorOut.y, name: d.name }; }
    const R = plotRect(id);
    return { x: (R.x0 + R.x1) / 2 / S, y: (R.z1 / S) + 0.6, name: d.name };
  }
  return null;
}

function adminTeleport(t) {
  const p = Game.player;
  let x = Math.max(0, Math.min(SIZE - 1, t.x)), y = Math.max(0, Math.min(SIZE - 1, t.y));
  if (!Admin.fly && !t.free && !playerPass(Math.round(x), Math.round(y))) {
    const q = nearestPassable(Math.round(x), Math.round(y), playerPass);
    if (q) ({ x, y } = q);
  }
  Object.assign(p, { x, y, climb: null, vh: 0 });
  if (t.yaw !== undefined) p.yaw = t.yaw;
  p.h = supportH(tw(x), tw(y), t.h ?? 1.5);
  Admin.vel.x = Admin.vel.y = Admin.vel.z = 0;
  Game.fieldKey = -1;
  Settle.work = null;
  Secrets.clearing = null;
  Maze.reveal(x, y, 2);
}

function cmdTp(args) {
  if (!args.length) {
    out('тп глэйд · башня · костёр · выход · ворота с|в|ю|з · сектор 1–8 · код [слово] · гривер · тайник', 'info');
    out('тп <имя жителя> · тп <постройка> (кузница, огород, мостик…) · тп x y · тп карта — клик по карте', 'info');
    return;
  }
  if (['карта', 'map', 'карте'].includes(args[0])) {
    closeAdmin(false);
    openMap();
    toast('ПОРОК: щёлкни по карте — Томас окажется там.', 'info');
    return;
  }
  const t = adminPlace(args);
  if (!t) { out(`Не знаю место «${args.join(' ')}». Список — «тп».`, 'err'); return; }
  if (t.err) { out(t.err, 'err'); return; }
  adminTeleport(t);
  out(`Телепорт: ${t.name}.`, 'ok');
}

// В большой карте при включённом режиме администратора щелчок переносит Томаса
function adminMapHook(canvas, facts) {
  if (!adminActive() && !Admin.greeted) return;
  canvas.classList.add('adm-tp');
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * SIZE - 0.5, y = (e.clientY - r.top) / r.height * SIZE - 0.5;
    adminTeleport({ x, y });
    closePanel();
    toast(`ПОРОК: телепорт — ${whereWord(Game.player.x, Game.player.y)}.`, 'info');
  });
  const fact = (k, v) => { const d = el('div'); d.append(el('dt', '', k), el('dd', '', v)); facts.append(d); };
  fact('ПОРОК', 'клик по карте — телепорт');
  if (Admin.xray) fact('Рентген', 'фиолетовые — гриверы, зелёные — жители, бирюзовые — тайники и выход');
}

/* ---------- время, мир, гриверы ---------- */

function cmdTime(args) {
  const a = args[0];
  if (!a) {
    out(`День ${Game.day}, ${Game.phase === 'day' ? 'день' : 'ночь'}: до ${Game.phase === 'day' ? 'заката' : 'рассвета'} ${mmss(Game.timeLeft)}.${Admin.timeStop ? ' Время стоит.' : ''}`, 'info');
    out('время день · ночь · закат · дальше · стоп · пуск · <секунд до смены>', 'dim');
    return;
  }
  if (['день', 'утро', 'day', 'morning'].includes(a)) adminMorning();
  else if (['ночь', 'night'].includes(a)) adminNight();
  else if (['закат', 'вечер', 'dusk'].includes(a)) {
    if (Game.phase === 'night') adminMorning();
    Object.assign(Game, { timeLeft: 32, warned: false });
    out('Скоро закат: ворота закроются через 30 секунд.', 'ok');
  } else if (['дальше', 'next', 'skip', 'пропустить'].includes(a)) {
    if (Game.phase === 'day') adminNight(); else adminMorning();
  } else if (['стоп', 'stop', 'пауза', 'freeze'].includes(a)) { Admin.timeStop = true; out('Время остановлено: солнце не двигается, ворота не закроются.', 'ok'); }
  else if (['пуск', 'go', 'идет', 'run', 'старт'].includes(a)) { Admin.timeStop = false; out('Время снова идёт.', 'ok'); }
  else if (Number.isFinite(+a)) {
    Game.timeLeft = Math.max(1, Math.min(Game.phase === 'day' ? Game.dayLen : Game.nightLen, +a));
    out(`До ${Game.phase === 'day' ? 'заката' : 'рассвета'}: ${mmss(Game.timeLeft)}.`, 'ok');
  } else out('Так: время день | ночь | закат | дальше | стоп | пуск | 90', 'err');
}
function adminMorning() {
  if (Game.phase === 'night') startDay();
  else {
    Object.assign(Game, { timeLeft: Game.dayLen, warned: false });
    if (Game.gate > 0) { Game.gateDir = -1; Sound.gates(false, 5); }
  }
  out(`Утро, день ${Game.day}. Ворота открыты.`, 'ok');
}
function adminNight() {
  if (Game.phase === 'day') startNight(); else Game.timeLeft = Game.nightLen;
  out('Ночь. Ворота закрыты, гриверы вышли на охоту.', 'ok');
}

function cmdWeather(args) {
  const w = args[0];
  if (!w) { out(`Сейчас: ${Weather.label()}. Можно: ` + Object.values(WEATHER).map(x => x.name).join(', ') + '.', 'info'); return; }
  const k = Object.keys(WEATHER).find(id => id === w || nameHit(w, WEATHER[id].name)) || (['гроза', 'storm', 'буря'].includes(w) ? 'storm' : null);
  if (!k) { out('Погода: ясно, облачно, туман, дождь, гроза, снег.', 'err'); return; }
  setWeather(k, false);
  out(`Погода: ${WEATHER[k].name}.`, 'ok');
}

function cmdSeason(args) {
  const w = args[0];
  const i = SEASONS.findIndex((s, j) => nameHit(w || '-', s.name) || w === ['summer', 'autumn', 'winter', 'spring'][j]);
  if (i < 0) { out(`Сейчас ${SEASONS[Life.season].name.toLowerCase()}. Можно: лето, осень, зима, весна.`, w ? 'err' : 'info'); return; }
  Life.season = i;
  applySeason();
  out(`Время года: ${SEASONS[i].name.toLowerCase()}.`, 'ok');
}

function grieverState(g) {
  return g.leaving ? 'уходит' : g.stun > 0 ? 'оглушён' : g.hunting ? 'охотится!' : g.night ? 'рыщет' : 'бродит';
}
function cmdGrievers(args) {
  const a = args[0];
  if (!a) {
    const list = Game.grievers.slice().sort((x, y) => metersTo(x.x, x.y) - metersTo(y.x, y.y));
    if (!list.length) out('Гриверов сейчас нет.' + (Admin.peace ? ' Режим «без гриверов» включён.' : ''), 'info');
    else outRows(list.map((g, i) => [`#${i + 1} ${g.night ? 'ночной' : 'дневной'}`, `${metersTo(g.x, g.y)} м ${dirWord(g.x, g.y)} · ${whereWord(g.x, g.y)} · ${grieverState(g)}`]));
    out('гриверы убрать · выкл · вкл · создать [сколько]', 'dim');
    return;
  }
  if (['убрать', 'убить', 'kill', 'прогнать', 'clear'].includes(a)) {
    for (const g of Game.grievers) g.leaving = true;
    out(`Гриверы уходят: ${Game.grievers.length}.`, 'ok');
  } else if (['выкл', 'off', 'нет', 'мир', 'peace'].includes(a)) {
    Admin.peace = true;
    out('Гриверов больше не будет, пока не напишешь «гриверы вкл».', 'ok');
  } else if (['вкл', 'on', 'да'].includes(a)) {
    Admin.peace = false;
    out('Гриверы вернутся: днём по коридорам, ночью — на охоту.', 'warn');
  } else if (['создать', 'spawn', 'позвать', 'добавить'].includes(a)) {
    if (Admin.peace) { out('Сначала «гриверы вкл».', 'err'); return; }
    const p = Game.player, n = Math.max(1, Math.min(10, +args[1] || 1));
    let made = 0;
    for (let tries = 0; tries < 300 && made < n; tries++) {
      const x = Math.round(p.x) + rand(25) - 12, y = Math.round(p.y) + rand(25) - 12, d = Math.hypot(x - p.x, y - p.y);
      if (d < 5 || !grieverPass(x, y)) continue;
      Game.grievers.push(makeGriever(x, y, Game.phase === 'night'));
      made++;
    }
    out(made ? `Гриверов рядом: +${made}.` : 'Рядом нет коридоров — выйди в Лабиринт.', made ? 'ok' : 'err');
  } else out('Так: гриверы | гриверы убрать | выкл | вкл | создать 3', 'err');
}

function cmdGates(args) {
  const a = args[0];
  if (['открыть', 'open', 'откр'].includes(a)) { Game.gateDir = -1; Sound.gates(false, 5); out('Ворота открываются.', 'ok'); }
  else if (['закрыть', 'close', 'закр'].includes(a)) { Game.gateDir = 1; Sound.gates(true, 5); out('Ворота закрываются.', 'ok'); }
  else out(`Ворота ${Game.gate > 0.5 ? 'закрыты' : 'открыты'}. ворота открыть · ворота закрыть`, 'info');
}

function cmdCodes(args) {
  if (['собрать', 'все', 'всё', 'all', 'взять'].includes(args[0])) {
    for (const it of Game.items) it.taken = true;
    if (!Game.exitOpen) openExit();
    out('Код собран целиком: ' + CODE_WORDS.join(' · ') + '. Выход открыт.', 'ok');
    return;
  }
  outRows(Game.items.map(it => [it.word, it.taken ? 'найден' : `${metersTo(it.x, it.y)} м ${dirWord(it.x, it.y)} · ${whereWord(it.x, it.y)}`]));
  out(`Выход: ${Game.exitOpen ? 'открыт' : 'закрыт'}, ${metersTo(Maze.exit.x, Maze.exit.y)} м ${dirWord(Maze.exit.x, Maze.exit.y)}. «коды собрать» — забрать все.`, 'dim');
}

/* ---------- знать всё ---------- */

function npcDoing(n) {
  if (n.stranded) return 'ранен в Лабиринте';
  if (n.injured) return 'ранен';
  if (n.companion) return 'в отряде';
  if (n.fresh) return 'новичок';
  if (n.act === 'idle' && n.path) return 'идёт';
  return { idle: 'стоит', sit: 'сидит', sleep: 'спит', talk: 'говорит', hammer: 'строит', chop: 'рубит', hoe: 'на огороде',
    cook: 'готовит', guard: 'на страже', pickup: 'собирает' }[n.act] || n.act || '—';
}
function cmdWho() {
  if (!Game.npcs.length) { out('В Глэйде пока никого, кроме Томаса.', 'info'); return; }
  outRows(Game.npcs.map(n => {
    const job = JOBS[jobOf(n)];
    return [n.name, `${job ? job.name.toLowerCase() : 'без дела'} · ${npcDoing(n)} · ${whereWord(n.x, n.y)}, ${metersTo(n.x, n.y)} м · доверие ${Math.round(Story.trust[n.name] ?? 50)}`];
  }));
  if (Settle.on) out(`Всего ${gladers()} из ${MAX_PEOPLE}. Следующий из Ящика: ${nextArrival() || 'никого'}.`, 'dim');
}

function cmdSecrets() {
  outRows(Secrets.rooms.map(r => [`Тайник, сектор ${ROMAN[r.sector - 1]}`, `${r.open ? 'открыт' : 'закрыт'} · ${metersTo(r.center.x, r.center.y)} м ${dirWord(r.center.x, r.center.y)}`]));
  const armed = Secrets.traps.filter(t => t.armed);
  out(`Ловушки: взведено ${armed.length} (замечено ${armed.filter(t => t.seen).length}). Знаки секторов: ${Secrets.symbolsFound()} из ${Secrets.symbols.length}. Завалы: ${Secrets.rubble.size}.`, 'info');
  out('Рентген («рентген») показывает всё это на карте и сквозь стены.', 'dim');
}

function cmdQuests() {
  const ids = Object.keys(Story.quests);
  if (!ids.length) { out('Заданий пока нет.', 'info'); return; }
  const st = { offered: 'ждёт разговора', active: 'идёт', ready: 'можно сдать', done: 'выполнено', failed: 'провалено' };
  outRows(ids.map(id => {
    const q = QUESTS[id] || { title: id }, s = Story.quests[id];
    return [q.title, `${st[s] || s}${s === 'active' && q.progress ? ' · ' + q.progress() : ''}${q.giver ? ' · ' + q.giver : ''}`];
  }));
}

function cmdTrust(args) {
  const v = +args[args.length - 1], w = args.slice(0, -1).join(' ');
  if (!w || !Number.isFinite(v)) { out('Так: доверие Галли 100 · доверие все 80', 'err'); return; }
  const list = ['все', 'всем', 'all'].includes(w) ? Game.npcs : Game.npcs.filter(n => nameHit(w, n.name));
  if (!list.length) { out(`Нет жителя «${w}».`, 'err'); return; }
  for (const n of list) Story.trust[n.name] = Math.max(0, Math.min(100, v));
  out(`Доверие ${Math.max(0, Math.min(100, v))}: ${list.map(n => n.name).join(', ')}.`, 'ok');
}

// Сводка для «наблюдения» и «статуса»: [подпись, значение]
function adminReport() {
  const p = Game.player, gs = Game.grievers.filter(g => !g.leaving);
  const near = gs.reduce((b, g) => (!b || metersTo(g.x, g.y) < metersTo(b.x, b.y) ? g : b), null);
  const sec = sectorOfTile(Math.round(p.x), Math.round(p.y));
  const R = Life.res, r = k => Math.floor(R[k] || 0);
  return [
    ['Субъект A2', `Томас · жизни ${p.hearts} · силы ${Math.round(p.stamina)}${p.bleed > 0 ? ' · кровь' : ''}${Life.hunger ? ' · голод' : ''}`],
    ['Где', `${sec ? `сектор ${ROMAN[sec - 1]} · ${SECTOR_THEMES[sec].name}` : 'Глэйд'} · ${p.x.toFixed(1)}, ${p.y.toFixed(1)} · ${p.h.toFixed(1)} м`],
    ['Время', `день ${Game.day} · ${Game.phase === 'day' ? 'до заката' : 'до рассвета'} ${mmss(Game.timeLeft)}${Admin.timeStop ? ' · стоит' : ''} · ${Weather.label()} · ${SEASONS[Life.season].name.toLowerCase()}`],
    ['Гриверы', gs.length ? `${gs.length} · охотятся ${gs.filter(g => g.hunting).length} · ближний ${metersTo(near.x, near.y)} м ${dirWord(near.x, near.y)}` : 'нет'],
    ['Жители', `${Game.npcs.length} · ранены ${Game.npcs.filter(n => n.injured || n.stranded).length} · дух ${Math.round(Life.morale)}`],
    ['Запасы', `дерево ${r('wood')} · еда ${r('food')} · вода ${r('water')} · камень ${r('stone')} · доски ${r('planks')} · металл ${r('metal')}`],
    ['Код', `${codeCount()} из ${CODE_WORDS.length} · выход ${Game.exitOpen ? 'открыт' : 'закрыт'} · ворота ${Game.gate > 0.5 ? 'закрыты' : 'открыты'}`],
    ['Кадр', `${Admin.fps} fps · ${QUALITY_NAMES[World.quality] || World.quality}, ступень ${World.tier}${Admin.calls ? ` · ${Admin.calls} вызовов · ${(Admin.tris / 1e6).toFixed(1)} млн треуг.` : ''}`],
  ];
}

function cmdStatus() {
  out(adminActive() ? 'Включено: ' + adminFlagList().join(', ') + '.' : 'Все режимы выключены — обычная игра.', adminActive() ? 'ok' : 'info');
  if (inGame()) outRows(adminReport());
}

function cmdOff() {
  for (const k of ADMIN_MODES) if (k !== 'fly') Admin[k] = false;
  adminSetFly(false);
  Admin.speed = 1;
  out('Все режимы выключены: обычная игра.', 'warn');
}

function cmdHelp() {
  let group = '';
  for (const c of ADMIN_CMDS) {
    if (c.hide) continue;
    if (c.g !== group) { group = c.g; out(group, 'head'); }
    outRows([[`${c.n[0]}${c.a ? ' ' + c.a : ''}`, `${c.d}${c.n.length > 1 ? ' · ' + c.n.slice(1, 3).join(', ') : ''}`]]);
  }
  out('В полёте: Пробел — вверх, Shift — вниз, колесо — скорость. В креативе двойной Пробел — взлететь.', 'dim');
}

/* ---------- список команд: n — имена (первое показываем), a — что после, d — что делает, game — только в игре ---------- */

const ADMIN_CMDS = [
  { g: 'Режимы', n: ['полет', 'fly', 'летать', 'noclip', 'ноклип'], a: '[вкл|выкл]', d: 'летать сквозь стены и крыши', game: true,
    f: modeCmd('fly', 'Полёт: Пробел — вверх, Shift — вниз, колесо — скорость. Гриверы не достанут.', 'Полёт выключен — Томас опускается на землю.') },
  { g: 'Режимы', n: ['бессмертие', 'god', 'бог', 'годмод'], a: '[вкл|выкл]', d: 'гриверы, ловушки, кровь и голод не страшны',
    f: modeCmd('god', 'Бессмертие: жизни и силы всегда полные.', 'Бессмертие выключено.') },
  { g: 'Режимы', n: ['креатив', 'creative'], a: '[вкл|выкл]', d: 'всё бесплатно, стройка и улучшения сразу, двойной пробел — полёт',
    f: args => {
      modeCmd('creative', 'Креатив: склад всегда полон, постройки и улучшения — мгновенно, мастерская без ограничений, вес не мешает, двойной Пробел — полёт.', 'Креатив выключен.')(args);
      if (Admin.creative && inGame()) adminUpdate();
    } },
  { g: 'Режимы', n: ['выживание', 'survival'], d: 'выключить креатив, полёт и бессмертие',
    f: () => { Admin.creative = Admin.god = false; adminSetFly(false); out('Выживание: всё как обычно.', 'warn'); } },
  { g: 'Режимы', n: ['gamemode', 'gm', 'режим'], a: '0|1', d: 'как в Minecraft: 1 — креатив, 0 — выживание', hide: true,
    f: args => { const c = ['1', 'c', 'creative', 'креатив'].includes(args[0]); Admin.creative = c; if (!c) { Admin.god = false; adminSetFly(false); } out(c ? 'Креатив.' : 'Выживание.', 'ok'); } },
  { g: 'Режимы', n: ['рентген', 'xray', 'видеть', 'всевидение', 'wallhack'], a: '[вкл|выкл]', d: 'гриверы, коды, тайники, выход — сквозь стены и на карте',
    f: modeCmd('xray', 'Рентген: метки сквозь стены, вся карта с гриверами, жителями, тайниками и ловушками.', 'Рентген выключен.') },
  { g: 'Режимы', n: ['наблюдение', 'info', 'инфо', 'сводка', 'stats', 'fps'], a: '[вкл|выкл]', d: 'живая сводка на экране: где, время, гриверы, жители, запасы, кадры',
    f: modeCmd('info', 'Наблюдение: сводка слева под табличкой дня.', 'Наблюдение выключено.') },
  { g: 'Режимы', n: ['скорость', 'speed'], a: '<0.25–12>', d: 'скорость бега и полёта',
    f: args => { const v = +args[0]; if (!Number.isFinite(v) || v <= 0) { out(`Сейчас ×${Admin.speed}. Так: скорость 3`, 'info'); return; } Admin.speed = Math.max(0.25, Math.min(12, v)); out(`Скорость ×${Admin.speed} (бег — не больше ×3, иначе Томас проходит стены).`, 'ok'); } },
  { g: 'Режимы', n: ['сброс', 'off', 'выкл', 'reset'], d: 'выключить все режимы', f: cmdOff },

  { g: 'Глэйд', n: ['построить', 'build', 'стройка', 'строить'], a: 'всё|макс|<название>', d: 'достроить участки сразу; макс — ещё и улучшения до 3-го уровня', game: true, f: cmdBuild },
  { g: 'Глэйд', n: ['ресурсы', 'res', 'запасы', 'склад'], a: 'макс|<запас> <число>', d: 'дерево, еда, металл, ткань, травы, камень, доски, вода', game: true, f: cmdRes },
  { g: 'Глэйд', n: ['дать', 'give', 'выдать', 'вещь'], a: '<вещь> [сколько]|всё', d: 'положить вещь в сумку; всё — снаряжение бегуна', game: true, f: cmdGive },
  { g: 'Глэйд', n: ['лечить', 'heal', 'вылечить', 'хп'], d: 'полные жизни и силы, без крови и голода', game: true,
    f: () => { Object.assign(Game.player, { hearts: 3, stamina: 100, exhausted: false, bleed: 0 }); Life.hunger = false; out('Томас цел и полон сил.', 'ok'); } },
  { g: 'Глэйд', n: ['новичок', 'newcomer', 'прибытие'], d: 'Ящик поднимается со следующим новичком', game: true,
    f: () => {
      const name = Settle.on && nextArrival();
      if (!name || gladers() >= MAX_PEOPLE) { out(Settle.on ? 'Глэйд полон: новичков больше нет.' : 'В этой игре все жители уже в Глэйде.', 'info'); return; }
      Settle.arrival = null;
      arrive(name);
      out(`Ящик поднялся: ${name}.`, 'ok');
    } },
  { g: 'Глэйд', n: ['дух', 'morale', 'настроение'], a: '<0–100>', d: 'боевой дух Глэйда', game: true,
    f: args => { const v = +args[0]; if (!Number.isFinite(v)) { out(`Дух: ${Math.round(Life.morale)} (${moraleWord()}).`, 'info'); return; } Life.morale = Math.max(0, Math.min(100, v)); out(`Дух: ${Life.morale}.`, 'ok'); } },
  { g: 'Глэйд', n: ['доверие', 'trust'], a: '<имя|все> <0–100>', d: 'как к Томасу относятся жители', game: true, f: cmdTrust },

  { g: 'Мир', n: ['тп', 'tp', 'телепорт', 'teleport'], a: '<место|имя|x y|карта>', d: 'мгновенно перенести Томаса', game: true, f: cmdTp },
  { g: 'Мир', n: ['время', 'time'], a: 'день|ночь|закат|дальше|стоп|пуск|<сек>', d: 'сменить время суток или остановить его', game: true, f: cmdTime },
  { g: 'Мир', n: ['день', 'day', 'утро'], d: 'сразу утро', game: true, hide: true, f: () => adminMorning() },
  { g: 'Мир', n: ['ночь', 'night'], d: 'сразу ночь', game: true, hide: true, f: () => adminNight() },
  { g: 'Мир', n: ['погода', 'weather'], a: 'ясно|облачно|туман|дождь|гроза|снег', d: 'сменить погоду', game: true, f: cmdWeather },
  { g: 'Мир', n: ['сезон', 'season'], a: 'лето|осень|зима|весна', d: 'время года', game: true, f: cmdSeason },
  { g: 'Мир', n: ['ворота', 'gates', 'gate'], a: 'открыть|закрыть', d: 'открыть или закрыть ворота Глэйда', game: true, f: cmdGates },
  { g: 'Мир', n: ['карта', 'map', 'reveal', 'открыть'], d: 'открыть весь Лабиринт на карте', game: true,
    f: () => { Maze.explored.fill(1); for (let i = 0; i < Maze.tiles.length; i++) if (Maze.tiles[i] === T.IVY) MazeDecor.ivyFound.add(i); out('Карта открыта целиком, с проходами за плющом.', 'ok'); } },

  { g: 'Знать всё', n: ['кто', 'who', 'жители', 'npc'], d: 'все жители: работа, что делают, где, доверие', game: true, f: cmdWho },
  { g: 'Знать всё', n: ['гриверы', 'grievers', 'гривер'], a: '[убрать|выкл|вкл|создать N]', d: 'где каждый гривер и что делает; управлять ими', game: true, f: cmdGrievers },
  { g: 'Знать всё', n: ['коды', 'codes', 'код'], a: '[собрать]', d: 'где лежит каждый фрагмент кода; собрать все', game: true, f: cmdCodes },
  { g: 'Знать всё', n: ['тайники', 'secrets', 'секреты', 'тайны'], d: 'тайные комнаты, ловушки, знаки, завалы', game: true, f: cmdSecrets },
  { g: 'Знать всё', n: ['задания', 'quests', 'квесты'], d: 'все задания и прогресс', game: true, f: cmdQuests },
  { g: 'Знать всё', n: ['статус', 'status', 'сводка'], d: 'что включено и сводка по игре', f: cmdStatus },

  { g: 'Прочее', n: ['сохранить', 'save'], d: 'сохранить игру', game: true, f: () => out(saveGame(true) ? 'Игра сохранена.' : 'Не получилось сохранить.', 'ok') },
  { g: 'Прочее', n: ['очистить', 'clear', 'cls'], d: 'очистить экран терминала', f: () => { $('adm-log').innerHTML = ''; } },
  { g: 'Прочее', n: ['помощь', 'help', '?', 'команды', 'хелп'], d: 'этот список', f: cmdHelp },
];

/* ---------- на экране: значок режимов, сводка, метки сквозь стены ---------- */

const TAG_COLORS = { griever: 'griever', hunt: 'griever hunt', code: 'code', exit: 'exit', room: 'room' };
function adminTag(key, kind, x, y, z, label, dist) {
  let t = Admin.tags.get(key);
  if (!t) {
    t = el('div', 'adm-tag');
    t.append(el('b'), el('i'));
    $('admin-tags').appendChild(t);
    Admin.tags.set(key, t);
  }
  t.used = true;
  const v = Admin.v.set(x, y, z).project(World.camera);
  if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { t.hidden = true; return; }
  t.hidden = false;
  if (t.kind !== kind) { t.kind = kind; t.className = 'adm-tag ' + TAG_COLORS[kind]; }
  if (t.label !== label) { t.label = label; t.firstChild.textContent = label; }
  const d = dist + ' м';
  if (t.dist !== d) { t.dist = d; t.lastChild.textContent = d; }
  t.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(1)}px)`;
}

function adminTags() {
  for (const t of Admin.tags.values()) t.used = false;
  if (Admin.xray && Game.player && (Game.state === 'play' || Game.state === 'ui') && !Lift.active) {
    Admin.v = Admin.v || new THREE.Vector3();
    for (const g of Game.grievers) {
      if (g.fade <= 0.05) continue;
      if (!g.tagId) g.tagId = 'g' + Math.random().toString(36).slice(2);
      const x = tw(g.x), z = tw(g.y);
      adminTag(g.tagId, g.hunting ? 'hunt' : 'griever', x, groundH(x, z) + 3.4 - (1 - g.fade) * 4.5, z, g.hunting ? 'ГРИВЕР · охотится' : 'ГРИВЕР', metersTo(g.x, g.y));
    }
    Game.items.forEach((it, i) => { if (!it.taken) adminTag('c' + i, 'code', tw(it.x), 1.7, tw(it.y), 'КОД ' + it.word, metersTo(it.x, it.y)); });
    Secrets.rooms.forEach((r, i) => { if (!r.open) adminTag('r' + i, 'room', tw(r.center.x), 2.2, tw(r.center.y), 'ТАЙНИК ' + ROMAN[r.sector - 1], metersTo(r.center.x, r.center.y)); });
    adminTag('exit', 'exit', tw(Maze.exit.x), 4, tw(Maze.exit.y), Game.exitOpen ? 'ВЫХОД' : 'ВЫХОД · закрыт', metersTo(Maze.exit.x, Maze.exit.y));
  }
  for (const [k, t] of Admin.tags) {
    if (t.used) continue;
    if (k[0] === 'g' && !Game.grievers.some(g => g.tagId === k)) { t.remove(); Admin.tags.delete(k); } else t.hidden = true;
  }
}

// Строка режимов и сводка — слева под табличкой дня
function adminFlags(force = false) {
  const box = $('admin-info'), list = adminFlagList();
  const show = (list.length || Admin.info) && Game.player && Game.state !== 'title' && !Lift.active;
  if (!show) { if (!box.hidden) box.hidden = true; return; }
  const key = list.join('|');
  if (box.hidden || force || key !== Admin.flagsKey) {
    Admin.flagsKey = key;
    $('admin-modes').textContent = list.length ? list.join(' · ') : 'наблюдение';
  }
  box.hidden = false;
  const plate = document.querySelector('.hud-tl');
  if (plate) box.style.top = Math.round(plate.getBoundingClientRect().bottom + 8) + 'px';
  const rows = $('admin-rows');
  rows.hidden = !Admin.info;
  if (!Admin.info) return;
  rows.innerHTML = '';
  for (const [k, v] of adminReport()) rows.append(el('dt', '', k), el('dd', '', v));
}

// Раз в кадр из main.js (после отрисовки): кадры в секунду, вызовы отрисовки, метки и сводка
function adminFrame() {
  const now = performance.now(), info = World.renderer && World.renderer.info;
  Admin.fpsN++;
  if (!Admin.fpsT) Admin.fpsT = now;
  if (now - Admin.fpsT >= 500) { Admin.fps = Math.round(Admin.fpsN * 1000 / (now - Admin.fpsT)); Admin.fpsN = 0; Admin.fpsT = now; }
  if (info) {
    // Пока открыта сводка, считаем вызовы за весь кадр (тени, пост-обработка), а не за последний проход
    if (info.autoReset === Admin.info) info.autoReset = !Admin.info;
    if (Admin.info) { Admin.calls = info.render.calls; Admin.tris = info.render.triangles; info.reset(); }
  }
  if ($('hud').hidden) return;
  adminTags();
  Admin.infoT -= 1;
  if (Admin.infoT <= 0) { Admin.infoT = 15; adminFlags(); }
}

// Рентген на карте: гриверы (фиолетовым — красный уже у кодов), жители, закрытые тайники и выход
const XRAY_GRIEVER = '#5d2a8a';
function adminMapLayer(dot, k) {
  for (const n of Game.npcs) dot(n.x, n.y, k * 0.42, MAPC.squad);
  for (const r of Secrets.rooms) if (!r.open) dot(r.center.x, r.center.y, k * 0.6, MAPC.secret);
  if (!Game.exitOpen) dot(Maze.exit.x, Maze.exit.y, k * 0.75, MAPC.exit);
  for (const g of Game.grievers) if (!g.leaving) dot(g.x, g.y, k * (g.hunting ? 0.85 + Math.sin(Game.time * 8) * 0.2 : 0.7), XRAY_GRIEVER);
}

function initAdmin() {
  $('adm-in').addEventListener('input', () => { Admin.hi = -1; adminHint(); });
  $('adm-close').addEventListener('click', () => closeAdmin());
  $('btn-admin').addEventListener('click', () => openAdmin());
}
