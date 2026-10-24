// Предметы, сумка и вес. E — подобрать, 1–0 — взять в руку, Q — убрать, G — бросить, F — использовать.
// Без сумки в руках помещается один предмет. Сумки трёх видов: чем лучше, тем больше мест и груза.
// Перегруз замедляет бег, а слишком тяжёлое просто не поднять.

const ITEM_DEFS = {
  bag: { name: 'Холщовая сумка', model: 'item_bag', w: 0, bag: 1 },
  bag2: { name: 'Кожаная сумка', model: 'item_bag', w: 0, bag: 2 },
  bag3: { name: 'Рюкзак бегуна', model: 'item_bag', w: 0, bag: 3 },
  knife: { name: 'Нож', model: 'item_knife', w: 0.4, hint: 'E у ловушки — обезвредить' },
  torch: { name: 'Факел', model: 'item_torch', w: 0.8, hint: 'светит ночью, горит 4 минуты', fuel: 240 },
  lantern: { name: 'Фонарь', model: 'proc_lantern', w: 1.4, hint: 'ярче факела, горит 10 минут, заправка на складе', fuel: 600 },
  spear: { name: 'Копьё', model: 'item_spear', w: 2.0, hint: 'один раз спасёт от жала' },
  rope: { name: 'Верёвка', model: 'item_rope', w: 1.2, hint: 'E у завала — перелезть' },
  crowbar: { name: 'Лом', model: 'item_crowbar', w: 2.4, hint: 'E у завала — разобрать быстрее' },
  flask: { name: 'Фляга', model: 'item_flask', w: 0.6, hint: 'F — пить; в реке — набрать; у пожара — тушить' },
  apple: { name: 'Яблоко', model: 'item_apple', w: 0.2, hint: 'F — съесть' },
  ration: { name: 'Паёк бегуна', model: 'item_ration', w: 0.4, hint: 'F — все силы и минута быстрого бега' },
  bandage: { name: 'Бинт', model: 'item_bandage', w: 0.1, hint: 'F — остановить кровь, +1 жизнь' },
  watch: { name: 'Часы', model: 'item_watch', w: 0.2, hint: 'точное время до заката' },
  map: { name: 'Карта бегунов', model: 'item_map', w: 0.1 },
  scrap: { name: 'Металлолом', model: 'item_scrap', w: 1.5, hint: 'сдай на склад — будет металл' },
  herb: { name: 'Травы', model: 'item_herb', w: 0.1, hint: 'сдай на склад — медакам на бинты' },
  gear: { name: 'Шестерня', model: 'item_gear', w: 0.5, hint: 'деталь механизма — из неё делают часы' },
  keycard: { name: 'Карта-ключ ПОРОК', model: 'item_keycard', w: 0.05, hint: 'откуда она в Лабиринте?' },
  note: { name: 'Записка', model: 'item_note', w: 0 },
};

const BAGS = [
  { name: 'Без сумки', slots: 1, cap: 6 },
  { name: 'Холщовая сумка', slots: 6, cap: 9 },
  { name: 'Кожаная сумка', slots: 8, cap: 13 },
  { name: 'Рюкзак бегуна', slots: 10, cap: 18 },
];

const Items = { world: [], inv: [], held: -1, bag: 0, near: null, mapRead: false };

function itemCap() { return BAGS[Items.bag].slots + (Items.bag ? Squad.bonus().slots : 0); }
function carryCap() { return BAGS[Items.bag].cap + Squad.bonus().kg; }
function itemWeight(it) { return (ITEM_DEFS[it.type].w || 0) + (it.type === 'flask' && it.full ? 0.6 : 0); }
function carryWeight() { return Items.inv.reduce((s, it) => s + itemWeight(it), 0); }
function heldItem() { return Items.held >= 0 ? Items.inv[Items.held] : null; }
function hasItem(type) { return Items.inv.some(it => it.type === type); }
function countItem(type) { return Items.inv.filter(it => it.type === type).length; }

// Скорость при грузе: до 80% — как налегке, до 100% — чуть медленнее, сверх — тяжело
function loadFactor() {
  const r = carryWeight() / carryCap();
  return r <= 0.8 ? 1 : r <= 1 ? 0.92 : 0.75;
}

function takeItem(type, n = 1) {
  for (let k = 0; k < n; k++) {
    const i = Items.inv.findIndex(it => it.type === type);
    if (i < 0) return false;
    Items.inv.splice(i, 1);
    if (Items.held === i) Items.held = -1;
    else if (Items.held > i) Items.held--;
  }
  updateHotbar();
  return true;
}

// Положить предмет прямо в сумку (крафт, награды). Нет места — кладём на землю рядом
function giveItem(type, extra = {}) {
  const def = ITEM_DEFS[type];
  if (def.bag) { upgradeBag(def.bag); return true; }
  const it = { type, full: type === 'flask', fuel: def.fuel, ...extra };
  if (Items.inv.length < itemCap()) {
    Items.inv.push(it);
    updateHotbar();
    return true;
  }
  const p = Game.player, x = tw(p.x) + Math.cos(p.yaw) * 0.7, z = tw(p.y) + Math.sin(p.yaw) * 0.7;
  spawnWorldItem(type, x, supportH(x, z, p.h) + 0.02, z, it);
  toast(`${def.name}: в сумке нет места, положил рядом.`, 'warn');
  return false;
}

function upgradeBag(tier) {
  if (tier <= Items.bag) return;
  Items.bag = tier;
  const b = BAGS[tier];
  toast(`${b.name}: ${b.slots} мест, до ${b.cap} кг. 1–0 — взять предмет в руку, Q — убрать.`, 'good');
  updateHotbar();
}

function spawnWorldItem(type, x, y, z, extra = {}) {
  const def = ITEM_DEFS[type];
  const it = { type, x, y, z, full: type === 'flask', fuel: def.fuel, ...extra };
  it.mesh = put(def.model, x, y, z, thash(Math.round(x * 10), Math.round(z * 10)) * 6.28);
  if (!it.mesh) it.mesh = mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), GM.wood, x, y + 0.05, z);
  if (def.bag > 1) it.mesh.scale.setScalar(def.bag === 2 ? 1.15 : 1.35);
  Items.world.push(it);
  return it;
}

function clearWorldItems() {
  for (const it of Items.world) World.scene.remove(it.mesh);
  Items.world = [];
}

function resetItems() {
  clearWorldItems();
  Object.assign(Items, { inv: [], held: -1, bag: 0, near: null, mapRead: false });
  for (const s of ITEM_SPAWNS) spawnWorldItem(s.type, s.x, s.y, s.z);
  updateHotbar();
}

// Ближайший предмет перед Томасом (до 2 м)
function findNearItem(p) {
  const px = tw(p.x), pz = tw(p.y);
  let best = null, bd = 2.0;
  for (const it of Items.world) {
    const dx = it.x - px, dz = it.z - pz, d = Math.hypot(dx, dz);
    if (d > bd || Math.abs(it.y - p.h) > 1.7) continue;
    const front = (dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw)) / (d || 1);
    if (d > 0.8 && front < 0.2) continue;
    bd = d;
    best = it;
  }
  return best;
}

function removeWorldItem(it) {
  World.scene.remove(it.mesh);
  Items.world.splice(Items.world.indexOf(it), 1);
}

function pickUp(it) {
  const def = ITEM_DEFS[it.type];
  if (def.bag) {
    if (def.bag <= Items.bag) { toast('Твоя сумка не хуже этой.', 'info'); return; }
    removeWorldItem(it);
    Sound.pickup();
    upgradeBag(def.bag);
    Tutorial.event('bag');
    return;
  }
  if (it.type === 'note') {
    removeWorldItem(it);
    Sound.pickup();
    Story.addNote(it.note);
    return;
  }
  if (carryWeight() + itemWeight(it) > carryCap() + 0.01) {
    toast(`Слишком тяжело: ${carryWeight().toFixed(1)} из ${carryCap()} кг. Брось что-нибудь (G).`, 'warn');
    return;
  }
  if (Items.inv.length >= itemCap()) {
    if (Items.bag) { toast('Сумка полна. Брось что-нибудь (G), чтобы освободить место.', 'warn'); return; }
    dropHeld();                       // без сумки — меняем предмет в руке на новый
  }
  removeWorldItem(it);
  Sound.pickup();
  Items.inv.push({ type: it.type, full: it.full, fuel: it.fuel });
  Items.held = Items.inv.length - 1;
  toast(`${def.name}${def.hint ? ' — ' + def.hint : ''}.`, 'info');
  if (it.type === 'map' && !Items.mapRead) {
    Items.mapRead = true;
    Maze.reveal(MID, MID, (GLADE_T1 - GLADE_T0) / 2 + 9);
    toast('Карта бегунов: на мини-карте открылись коридоры вокруг Глэйда.', 'good');
  }
  Story.onPickup(it.type);
  updateHotbar();
}

function dropHeld() {
  const h = heldItem();
  if (!h) return;
  const p = Game.player, x = tw(p.x) + Math.cos(p.yaw) * 0.8, z = tw(p.y) + Math.sin(p.yaw) * 0.8;
  spawnWorldItem(h.type, x, supportH(x, z, p.h) + 0.02, z, { full: h.full, fuel: h.fuel });
  Items.inv.splice(Items.held, 1);
  Items.held = -1;
  updateHotbar();
}

function selectSlot(i) {
  if (i < Items.inv.length) Items.held = Items.held === i ? -1 : i;
  updateHotbar();
}

function stowHeld() {
  if (!Items.bag) { dropHeld(); return; }
  Items.held = -1;
  updateHotbar();
}

function consumeHeld() {
  Items.inv.splice(Items.held, 1);
  Items.held = -1;
}

function useHeld() {
  const h = heldItem(), p = Game.player;
  if (!h) return;
  if (h.type === 'apple') {
    p.stamina = Math.min(100, p.stamina + 45);
    p.exhausted = false;
    consumeHeld();
    toast('Яблоко съедено. Сил прибавилось.', 'good');
  } else if (h.type === 'ration') {
    p.stamina = 100;
    p.exhausted = false;
    p.boost = 60;
    consumeHeld();
    toast('Паёк бегуна: силы полные, минуту бежишь быстрее.', 'good');
  } else if (h.type === 'bandage') {
    if (!p.bleed && p.hearts >= 3) { toast('Ты цел — бинт пока не нужен.', 'info'); return; }
    p.bleed = 0;
    p.hearts = Math.min(3, p.hearts + 1);
    consumeHeld();
    toast('Перевязал рану: кровь остановилась, +1 жизнь.', 'good');
  } else if (h.type === 'flask') {
    if (p.wet) { h.full = true; toast('Фляга наполнена речной водой.', 'info'); }
    else if (h.full && douse(p)) { h.full = false; }
    else if (h.full) { h.full = false; p.stamina = 100; p.exhausted = false; toast('Ты напился. Силы восстановлены.', 'good'); }
    else toast('Фляга пуста. Набери воды в реке (F, стоя в воде).', 'warn');
  } else if (h.type === 'watch') {
    const s = Math.max(0, Math.ceil(Game.timeLeft));
    toast(`Часы: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} ${Game.phase === 'day' ? 'до закрытия ворот' : 'до рассвета'}.`, 'info');
  } else if (h.type === 'torch' || h.type === 'lantern') {
    toast(`${ITEM_DEFS[h.type].name}: осталось ${Math.ceil((h.fuel || 0) / 60)} мин.`, 'info');
  } else {
    const def = ITEM_DEFS[h.type];
    if (def.hint) toast(`${def.name} — ${def.hint}.`, 'info');
  }
  updateHotbar();
}

// Копьё принимает удар гривера на себя и ломается
function spearBlocks() {
  const h = heldItem();
  if (!h || h.type !== 'spear') return false;
  consumeHeld();
  updateHotbar();
  toast('Копьё сломалось, но ты отбился от гривера!', 'warn');
  return true;
}

// Свет в руке: 0 — нет, 1 — факел, 1.5 — фонарь
function heldLight() {
  const h = heldItem();
  if (!h || !(h.fuel > 0)) return 0;
  return h.type === 'torch' ? 1 : h.type === 'lantern' ? 1.5 : 0;
}
function holdingTorch() { return heldLight() > 0; }

function updateItems(dt = 0) {
  Items.near = Game.state === 'play' ? findNearItem(Game.player) : null;
  const h = heldItem();
  if (h && (h.type === 'torch' || h.type === 'lantern') && h.fuel > 0 && Game.state === 'play') {
    h.fuel -= dt;
    if (h.fuel <= 0) {
      if (h.type === 'torch') { consumeHeld(); toast('Факел догорел.', 'warn'); }
      else { h.fuel = 0; toast('Фонарь погас. Заправить можно на складе в Глэйде.', 'warn'); }
      updateHotbar();
    }
  }
}

/* ---------- описания, значки и картинки предметов ---------- */

const ITEM_INFO = {
  knife: 'Короткий нож из кузницы. Им можно аккуратно обезвредить плиту-ловушку в Лабиринте.',
  torch: 'Смола на палке. Светит ночью и в тёмных коридорах — без света ловушки на полу почти не видно. Горит около четырёх минут.',
  lantern: 'Фонарь со стеклом: светит ярче и дальше факела и горит десять минут. Заправляют на складе.',
  spear: 'Самодельное копьё стражей. Один раз примет удар гривера на себя — и сломается.',
  rope: 'Крепкая верёвка из лиан. С ней можно перелезть через завал, не разбирая его.',
  crowbar: 'Ржавый лом. Завал с ним разбирается вдвое быстрее, чем руками.',
  flask: 'Фляга для воды. Глоток возвращает силы, полной флягой можно тушить пожар. Набирается в реке.',
  apple: 'Яблоко с плантаций. Немного сил в дорогу.',
  ration: 'Паёк бегуна: сухари и вяленое мясо. Все силы сразу и минута быстрого бега.',
  bandage: 'Чистая повязка от медаков. Останавливает кровь и возвращает одну жизнь.',
  watch: 'Часы, собранные из шестерён. Показывают точное время до заката.',
  map: 'Карта, которую бегуны рисуют каждый день. Открывает коридоры вокруг Глэйда.',
  scrap: 'Обломки металла из Лабиринта. На складе из них сделают материалы для мастерской.',
  herb: 'Пучок лечебных трав из леса Глэйда. Медаки делают из них бинты.',
  gear: 'Шестерня из механизма Лабиринта. Из неё в мастерской собирают часы.',
  keycard: 'Пластиковая карта с буквами ПОРОК. Откуда она здесь — и что открывает?',
};
const USABLE = new Set(['apple', 'ration', 'bandage', 'flask', 'watch', 'torch', 'lantern']);
const ITEM_ICONS = { torch: 'i-fire', lantern: 'i-fire', flask: 'i-drop', bandage: 'i-cross', map: 'i-map', note: 'i-note', watch: 'i-clock', keycard: 'i-code', scrap: 'i-code', gear: 'i-gear', herb: 'i-tree' };
const THUMBS = {};

// Картинки предметов рисуем один раз прямо из их 3D-моделей: свой свет, прозрачный фон
function makeItemThumbs() {
  const r = World.renderer;
  if (!r || !THREE.WebGLRenderTarget) return;
  const size = 160, scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(24, 1, 0.01, 100);
  scene.environment = World.scene.environment || null;
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a241c, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(1.5, 3, 2.5);
  const rim = new THREE.DirectionalLight(0xffd8a0, 0.7);
  rim.position.set(-2, 1.5, -2);
  scene.add(key, rim);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  const px = new Uint8Array(size * size * 4), canvas = makeCanvas(size, size), g = canvas.getContext('2d'), img = g.createImageData(size, size);
  // Цель рисования линейная — переводим в sRGB сами
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) { const x = v / 255; lut[v] = Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)); }
  const prevTarget = r.getRenderTarget(), prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
  r.setClearColor(0x000000, 0);
  const byModel = {}, box = new THREE.Box3(), sphere = new THREE.Sphere(), sz = new THREE.Vector3(), dir = new THREE.Vector3();
  try {
    for (const [type, def] of Object.entries(ITEM_DEFS)) {
      if (byModel[def.model]) { THUMBS[type] = byModel[def.model]; continue; }
      const src = ASSETS.models[def.model];
      if (!src) continue;
      const pivot = new THREE.Group(), obj = src.clone(true);
      pivot.add(obj);
      scene.add(pivot);
      box.setFromObject(obj).getSize(sz);
      // Длинные предметы — по диагонали кадра, плоские — сверху, остальные — в три четверти
      const flat = sz.y < Math.max(sz.x, sz.z) * 0.3;
      pivot.rotation.y = Math.max(sz.x, sz.z) > sz.y * 1.6 ? Math.PI / 4 : -0.6;
      pivot.updateMatrixWorld(true);
      box.setFromObject(pivot).getBoundingSphere(sphere);
      dir.set(0.3, flat ? 1.6 : 0.75, 1).normalize();
      const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.06;
      cam.position.copy(sphere.center).addScaledVector(dir, dist);
      cam.near = dist * 0.05;
      cam.far = dist * 4;
      cam.updateProjectionMatrix();
      cam.lookAt(sphere.center);
      r.setRenderTarget(rt);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, size, size, px);
      for (let y = 0; y < size; y++) {
        const row = (size - 1 - y) * size * 4;
        for (let x = 0; x < size * 4; x += 4) {
          const o = y * size * 4 + x;
          img.data[o] = lut[px[row + x]];
          img.data[o + 1] = lut[px[row + x + 1]];
          img.data[o + 2] = lut[px[row + x + 2]];
          img.data[o + 3] = px[row + x + 3];
        }
      }
      g.putImageData(img, 0, 0);
      THUMBS[type] = byModel[def.model] = canvas.toDataURL('image/png');
      scene.remove(pivot);
    }
  } catch (e) { /* без картинок — будут значки */ }
  r.setRenderTarget(prevTarget);
  r.setClearColor(prevClear, prevAlpha);
  rt.dispose();
}

// Картинка предмета: снимок модели или значок, если снимка нет
function itemPic(type) {
  if (THUMBS[type]) {
    const img = el('img');
    img.src = THUMBS[type];
    img.alt = '';
    img.draggable = false;
    return img;
  }
  return svgIcon(ITEM_ICONS[type] || 'i-box');
}

// Состояние предмета: сколько гореть, полная ли фляга
function itemState(it) {
  if (it.type === 'torch' || it.type === 'lantern') return it.fuel > 0 ? `горит ${Math.ceil(it.fuel / 60)} мин` : 'погас';
  if (it.type === 'flask') return it.full ? 'полная' : 'пустая';
  return '';
}
function itemLabel(it) {
  const s = itemState(it);
  return ITEM_DEFS[it.type].name + (s ? ` (${s})` : '');
}

// Что делать с предметом в руке — строка над полосой предметов
function heldHint(it) {
  const u = keyLabel(Settings.keys.use), act = keyLabel(Settings.keys.action);
  switch (it.type) {
    case 'torch': case 'lantern': return it.fuel > 0 ? `горит ещё ${Math.ceil(it.fuel / 60)} мин` : 'погас — заправь на складе';
    case 'flask': return it.full ? `полная · ${u} — пить` : 'пустая · набери воды в реке';
    case 'apple': return `${u} — съесть`;
    case 'ration': return `${u} — все силы и быстрый бег`;
    case 'bandage': return `${u} — перевязать рану`;
    case 'watch': return `${u} — точное время`;
    case 'knife': return `${act} у ловушки — обезвредить`;
    case 'rope': return `${act} у завала — перелезть`;
    case 'crowbar': return `${act} у завала — разобрать`;
    case 'spear': return 'спасёт от одного удара гривера';
    default: return ITEM_DEFS[it.type].hint || '';
  }
}

function updateHotbar() {
  const bar = document.getElementById('hotbar');
  if (!bar) return;
  bar.hidden = !Items.inv.length && !Items.bag;
  document.getElementById('hud').classList.toggle('noitems', bar.hidden);
  const n = Math.min(10, itemCap());
  bar.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const it = Items.inv[i], s = el('div', 'hslot' + (i === Items.held ? ' held' : '') + (it ? '' : ' empty'));
    s.appendChild(el('b', '', String((i + 1) % 10)));
    if (it) {
      s.title = itemLabel(it);
      s.appendChild(itemPic(it.type));
      if (it.type === 'torch' || it.type === 'lantern') {
        const f = el('span', 'fuel'), fi = el('i');
        fi.style.width = Math.max(0, Math.min(100, (it.fuel || 0) / ITEM_DEFS[it.type].fuel * 100)) + '%';
        f.appendChild(fi);
        s.appendChild(f);
      }
    }
    bar.appendChild(s);
  }
  if (Items.bag || Items.inv.length) {
    const r = carryWeight() / carryCap(), w = el('div', 'hweight' + (r > 1 ? ' over' : r > 0.8 ? ' heavy' : ''));
    w.title = 'Груз';
    w.append(svgIcon('i-weight'), `${carryWeight().toFixed(1)} / ${carryCap()} кг`);
    bar.appendChild(w);
  }
  Items.heldKey = null;
  updateHeldInfo();
  if (Panel.open === 'inventory') refreshPanel();
}

// Название и подсказка предмета в руке (обновляется, когда меняется топливо или состояние)
function updateHeldInfo() {
  const h = heldItem(), box = document.getElementById('held-info');
  if (!box) return;
  const key = h ? h.type + itemState(h) + Settings.keys.use : '';
  if (key === Items.heldKey) return;
  Items.heldKey = key;
  box.hidden = !h;
  if (!h) return;
  document.getElementById('held-name').textContent = ITEM_DEFS[h.type].name;
  document.getElementById('held-hint').textContent = heldHint(h);
  const slot = document.querySelector('#hotbar .hslot.held .fuel i');
  if (slot && h.fuel !== undefined) slot.style.width = Math.max(0, Math.min(100, (h.fuel || 0) / ITEM_DEFS[h.type].fuel * 100)) + '%';
}

/* ---------- окно сумки ---------- */

function openInventory() {
  if (Panel.open === 'inventory') { closePanel(); return; }
  Items.sel = Items.held >= 0 ? Items.held : 0;
  openPanel('inventory', 'Сумка', renderInventory, { icon: 'i-bag', kind: 'inventory', sub: BAGS[Items.bag].name });
}

function renderInventory(body) {
  const cap = itemCap(), w = carryWeight(), W = carryCap(), r = w / W;
  if (!(Items.sel >= 0)) Items.sel = 0;
  if (Items.sel >= Items.inv.length) Items.sel = Math.max(0, Items.inv.length - 1);
  const meter = (label, val, frac, cls = '') => {
    const m = el('div', 'meter ' + cls), row = el('div', 'row'), bar = el('div', 'bar'), f = el('i');
    row.append(el('span', '', label), el('b', '', val));
    f.style.width = Math.min(100, frac * 100) + '%';
    bar.append(f);
    m.append(row, bar);
    return m;
  };
  const layout = el('div', 'inv-layout'), left = el('div'), head = el('div', 'inv-head'), grid = el('div', 'inv-grid');
  left.style.cssText = 'display:grid;gap:0.8rem;align-content:start';
  head.append(meter('Места', `${Items.inv.length} из ${cap}`, Items.inv.length / cap, Items.inv.length >= cap ? 'heavy' : ''), meter('Груз', `${w.toFixed(1)} из ${W} кг`, r, r > 1 ? 'over' : r > 0.8 ? 'heavy' : ''));
  for (let i = 0; i < cap; i++) {
    const it = Items.inv[i];
    if (!it) { grid.append(el('div', 'inv-slot empty')); continue; }
    const s = el('button', 'inv-slot' + (i === Items.sel ? ' sel' : '') + (i === Items.held ? ' held' : ''));
    s.type = 'button';
    s.title = itemLabel(it);
    if (i < 10) s.append(el('span', 'k', String((i + 1) % 10)));
    s.append(itemPic(it.type), el('span', 'nm', itemLabel(it)));
    s.addEventListener('click', () => { Items.sel = i; refreshPanel(); focusInvSel(); });
    s.addEventListener('dblclick', () => { Items.sel = i; holdSel(); });
    grid.append(s);
  }
  const dep = Items.inv.filter(x => x.type === 'scrap' || x.type === 'herb').length;
  left.append(head, grid, el('p', 'panel-note', !Items.bag ? 'Без сумки в руках помещается один предмет. Холщовая сумка лежит у Ящика.'
    : dep ? `Находок для склада: ${dep}. Сдай их на складе Глэйда — из металлолома сделают материалы, из трав — бинты.`
      : 'Металлолом и травы можно сдать на складе Глэйда.'));
  // Карточка выбранного предмета
  const it = Items.inv[Items.sel], card = el('div', 'inv-detail frame quiet');
  if (!it) card.append(el('p', '', `Сумка пуста. Предметы лежат в домах Глэйда и в Лабиринте — подойди и нажми ${keyLabel(Settings.keys.action)}.`));
  else {
    const def = ITEM_DEFS[it.type], th = el('div', 'thumb'), props = el('div', 'props'), acts = el('div', 'actions'), held = Items.sel === Items.held;
    th.append(itemPic(it.type));
    props.append(el('span', 'pill', (itemWeight(it) || 0) + ' кг'));
    const st = itemState(it);
    if (st) props.append(el('span', 'pill', st));
    if (held) { const p = el('span', 'pill', 'в руке'); p.style.color = 'var(--amber)'; props.append(p); }
    acts.append(button(held ? 'Убрать' : 'В руку', holdSel, { cls: 'btn small', icon: 'i-hand' }));
    if (USABLE.has(it.type)) acts.append(button('Использовать', useSel, { cls: 'btn small ghost', icon: 'i-spark' }));
    acts.append(button('Бросить', dropSel, { cls: 'btn small ghost', icon: 'i-trash' }));
    card.append(th, el('h3', '', def.name), props, el('p', '', ITEM_INFO[it.type] || def.hint || ''), acts);
  }
  layout.append(left, card);
  body.append(layout);
  panelFoot(keyHintLine([['← →', 'выбрать'], ['Enter', 'в руку'], [keyLabel(Settings.keys.use), 'использовать'], [keyLabel(Settings.keys.drop), 'бросить'], ['Esc', 'закрыть']]));
}

function focusInvSel() {
  const s = document.querySelector('#panel .inv-slot.sel');
  if (s) s.focus({ preventScroll: true });
}
function holdSel() {
  if (!Items.inv[Items.sel]) return;
  Items.held = Items.held === Items.sel ? -1 : Items.sel;
  updateHotbar();
  focusInvSel();
}
function useSel() {
  if (!Items.inv[Items.sel]) return;
  Items.held = Items.sel;
  useHeld();
  updateHotbar();
  focusInvSel();
}
function dropSel() {
  if (!Items.inv[Items.sel]) return;
  Items.held = Items.sel;
  dropHeld();
  focusInvSel();
}

// Клавиши в окне сумки: стрелки — выбор, Enter — в руку, «использовать», «бросить». true — нажатие обработано
function inventoryKey(e, act) {
  const n = Items.inv.length;
  if (!n) return false;
  const grid = document.querySelector('#panel .inv-grid');
  const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 5;
  const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.code];
  if (/^Digit[0-9]$/.test(e.code)) {
    const i = (+e.code.slice(5) + 9) % 10;
    if (i < n) { Items.sel = i; refreshPanel(); focusInvSel(); Sound.ui('tab'); }
    return true;
  }
  if (move) {
    e.preventDefault();
    Items.sel = Math.max(0, Math.min(n - 1, Items.sel + move));
    refreshPanel();
    focusInvSel();
    Sound.ui('tab');
    return true;
  }
  if (e.code === 'Enter') { e.preventDefault(); holdSel(); return true; }
  if (act === 'use') { useSel(); return true; }
  if (act === 'drop') { dropSel(); return true; }
  return false;
}

/* ---------- запасные модели предметов (если модель из Blender не загрузилась) и фонарь ---------- */

function makeProcModels() {
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color: srgb(color), roughness: 0.7, ...o });
  const metal = M('#6d6a64', { metalness: 0.8, roughness: 0.45 }), dark = M('#2f2c28', { metalness: 0.7, roughness: 0.5 });
  const group = (...parts) => {
    const g = new THREE.Group();
    for (const [geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0] of parts) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      g.add(m);
    }
    return g;
  };
  const add = (id, g) => { if (!ASSETS.models[id]) ASSETS.models[id] = g; };
  add('item_crowbar', group(
    [new THREE.CylinderGeometry(0.014, 0.014, 0.62, 8), dark, 0, 0.02, -0.31, Math.PI / 2],
    [new THREE.CylinderGeometry(0.014, 0.012, 0.12, 8), dark, 0, 0.06, -0.64, 0.6]));
  add('item_ration', group([new THREE.BoxGeometry(0.16, 0.06, 0.11), M('#9a8a66', { roughness: 1 }), 0, 0.03],
    [new THREE.BoxGeometry(0.165, 0.012, 0.03), M('#5c4a30'), 0, 0.03]));
  add('item_bandage', group([new THREE.CylinderGeometry(0.035, 0.035, 0.07, 14), M('#e9e4d6', { roughness: 1 }), 0, 0.035],
    [new THREE.BoxGeometry(0.05, 0.002, 0.09), M('#e9e4d6', { roughness: 1 }), 0.03, 0.002, 0.04]));
  add('item_watch', group([new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20), metal, 0, 0.01],
    [new THREE.CylinderGeometry(0.025, 0.025, 0.013, 20), M('#e8e2d0', { roughness: 0.3 }), 0, 0.011],
    [new THREE.BoxGeometry(0.02, 0.004, 0.16), M('#4a3524', { roughness: 0.9 }), 0, 0.003]));
  const scrap = new THREE.IcosahedronGeometry(0.11, 0), sp = scrap.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setY(i, sp.getY(i) * 0.35 + (thash(i, 3) - 0.5) * 0.03);
  scrap.computeVertexNormals();
  add('item_scrap', group([scrap, M('#7a4f33', { metalness: 0.6, roughness: 0.75 }), 0, 0.04],
    [new THREE.BoxGeometry(0.2, 0.01, 0.05), metal, 0.03, 0.06, 0.02, 0, 0.6]));
  const leaf = M('#4f7a35', { side: THREE.DoubleSide });
  add('item_herb', group(...[0, 1.3, 2.6, 3.9, 5.2].map(a => [new THREE.ConeGeometry(0.02, 0.16, 4), leaf, Math.cos(a) * 0.02, 0.08, Math.sin(a) * 0.02, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3]),
    [new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6), M('#8a6a3c'), 0, 0.03]));
  const gearG = new THREE.Group();
  gearG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 18), metal));
  for (let k = 0; k < 10; k++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.02, 0.025), metal);
    t.position.set(Math.cos(k / 10 * 6.28) * 0.068, 0, Math.sin(k / 10 * 6.28) * 0.068);
    t.rotation.y = -k / 10 * 6.28;
    gearG.add(t);
  }
  gearG.position.y = 0.012;
  const gearWrap = new THREE.Group();
  gearWrap.add(gearG);
  add('item_gear', gearWrap);
  add('item_keycard', group([new THREE.BoxGeometry(0.085, 0.003, 0.054), M('#dfe6ea', { roughness: 0.35 }), 0, 0.003],
    [new THREE.BoxGeometry(0.085, 0.004, 0.012), M('#2d6a8a', { roughness: 0.35 }), 0, 0.004, -0.015]));
  add('item_note', group([new THREE.PlaneGeometry(0.16, 0.21), M('#e6dcc2', { roughness: 1, side: THREE.DoubleSide }), 0, 0.004, 0, -Math.PI / 2, 0, 0.3]));
  // Фонарь: настоящая модель Poly Haven, приведённая к 28 см, иначе — коробка со светящимся стеклом
  const lg = new THREE.Group();
  if (ASSETS.models.Lantern_01) {
    const l = ASSETS.models.Lantern_01.clone(true), box = new THREE.Box3().setFromObject(l), size = box.getSize(new THREE.Vector3());
    l.scale.setScalar(0.28 / Math.max(size.y, 0.01));
    l.position.y = -box.min.y * l.scale.y;
    lg.add(l);
  } else {
    lg.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), metal));
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.1), new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffa040, emissiveIntensity: 2 }));
    lg.add(glass);
    lg.children.forEach(c => { c.position.y = 0.1; });
  }
  add('proc_lantern', lg);
}
