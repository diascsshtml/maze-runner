// Ремесло. Каждый рецепт делается в своём месте: руками (где угодно в Глэйде), у колоды, в кузнице
// (нужен уровень мастерской) или на кухне в столовой (нужен уровень кухни). Доски — не предмет, а запас.
// place: 'hand' | 'woodpile' | 'forge' | 'kitchen'; use — польза, которую видит игрок

const RECIPES = [
  // Первые инструменты — руками, из того, что лежит в Глэйде
  { id: 'axe', cost: { wood: 3, stone: 2 }, place: 'hand', use: 'рубить деревья: по 2 дерева за раз вместо охапки хвороста' },
  { id: 'hammer', cost: { wood: 2, stone: 2 }, place: 'hand', use: 'стройка вдвое быстрее, чем руками' },
  { id: 'pickaxe', cost: { wood: 3, stone: 3, metal: 1 }, place: 'hand', use: 'колоть валуны: камень для костра, домов и частокола' },
  { id: 'torch', cost: { wood: 1, cloth: 1 }, place: 'hand', use: 'свет ночью и в тёмных коридорах' },
  { id: 'bandage', cost: { cloth: 1, herbs: 2 }, place: 'hand', use: 'остановить кровь, +1 жизнь' },
  { id: 'rope', cost: { cloth: 3 }, place: 'hand', use: 'перелезть через завал в Лабиринте' },
  { id: 'planks', out: { planks: 2 }, cost: { wood: 3 }, place: 'woodpile', use: 'доски для домов, мостика и ведра' },
  // Кузница
  { id: 'knife', cost: { metal: 1, wood: 1 }, lvl: 1, place: 'forge' },
  { id: 'bucket', cost: { planks: 3, metal: 1 }, lvl: 1, place: 'forge', use: 'носить воду со всей реки разом, тушить пожар' },
  { id: 'spear', cost: { wood: 2, metal: 1 }, lvl: 2, place: 'forge' },
  { id: 'crowbar', cost: { metal: 3 }, lvl: 2, place: 'forge' },
  { id: 'lantern', cost: { metal: 2, cloth: 1, wood: 1 }, lvl: 2, place: 'forge' },
  { id: 'bag2', cost: { cloth: 4, food: 2 }, lvl: 2, place: 'forge' },
  { id: 'watch', cost: { metal: 3, gear: 1 }, lvl: 3, place: 'forge' },
  { id: 'bag3', cost: { cloth: 6, metal: 2 }, lvl: 3, place: 'forge' },
  // Кухня
  { id: 'stew', cost: { food: 2, water: 1, herbs: 1 }, kitchen: 1, place: 'kitchen', use: 'все силы и сытость до утра' },
  { id: 'ration', cost: { food: 3 }, kitchen: 2, place: 'kitchen' },
];
const PLACE_NAMES = { hand: 'Руками', woodpile: 'У колоды', forge: 'Кузница', kitchen: 'Кухня' };

// Где можно делать: руками — везде в Глэйде; колода — у колоды или в кузнице; кузница и кухня — рядом с ними
function placeBlocker(r) {
  if (r.place === 'hand') return null;
  if (r.place === 'woodpile') {
    if ((isBuilt('woodpile') && Math.hypot(Game.player.x - LAYOUT.woodpile.x, Game.player.y - LAYOUT.woodpile.y) < 3.2) || (isBuilt('forge') && nearHouse('forge', 12))) return null;
    return isBuilt('woodpile') || isBuilt('forge') ? 'подойди к колоде или к кузнице' : 'сначала построй колоду и дровницу';
  }
  if (r.place === 'forge') {
    if (!isBuilt('forge')) return 'сначала построй кузницу';
    return nearHouse('forge', 12) ? null : 'подойди к кузнице';
  }
  if (!isBuilt('dining')) return 'сначала построй столовую';
  return nearHouse('dining', 12) || nearHouse('forge', 12) ? null : 'подойди к столовой';
}

function craftBlocker(r) {
  const def = ITEM_DEFS[r.id];
  const free = Admin.creative;                      // креатив: без мастерской, кухни и места
  if (!free && r.lvl && Life.lvl.workshop < r.lvl) return `нужна мастерская ${r.lvl}-го уровня`;
  if (!free && r.kitchen && Life.lvl.kitchen < r.kitchen) return `нужна кухня ${r.kitchen}-го уровня`;
  const where = !free && placeBlocker(r);
  if (where) return where;
  if (def && def.bag && def.bag <= Items.bag) return 'у тебя сумка не хуже';
  if (!canPay(r.cost)) return 'не хватает запасов';
  if (r.out) return Object.keys(r.out).some(k => Life.res[k] >= storageCap()) ? 'на складе нет места' : null;
  if (!def.bag && Items.inv.length >= itemCap()) return 'в сумке нет места';
  return null;
}

function recipeName(r) { return r.out ? RES_NAMES[Object.keys(r.out)[0]] : ITEM_DEFS[r.id].name; }

function craft(r) {
  if (craftBlocker(r)) return;
  pay(r.cost);
  if (r.out) for (const [k, v] of Object.entries(r.out)) addRes(k, v);
  else giveItem(r.id);
  const p = Game.player;
  Sound.work(r.place === 'kitchen' ? 'hoe' : 'hammer', tw(p.x), p.h, tw(p.y));
  toast(`Сделано: ${recipeName(r)}${r.out ? ' +' + Object.values(r.out)[0] : ''}.`, 'good');
  Story.onCraft(r.id);
  Tutorial.event('craft-item');
  Tutorial.event('craft-' + r.id);
}

function openCraft() {
  if (!inGladeNow()) { toast('Мастерить можно только в Глэйде.', 'info'); return; }
  togglePanel('craft', 'Ремесло', renderCraft, { icon: 'i-hammer' });
  Tutorial.event('craft');
}

function renderCraft(body) {
  body.append(el('p', 'panel-lead', `Мастерская ${Life.lvl.workshop || 0}-го уровня, кухня ${Life.lvl.kitchen || 0}-го. Груз: ${carryWeight().toFixed(1)} из ${carryCap()} кг, сумка: ${BAGS[Items.bag].name.toLowerCase()}.`));
  const grid = el('div', 'res-grid small');
  for (const [k, name] of Object.entries(RES_NAMES)) {
    const c = el('div', 'res');
    c.append(el('b', '', Math.floor(Life.res[k])), el('span', '', name));
    grid.append(c);
  }
  body.append(grid);
  for (const place of ['hand', 'woodpile', 'forge', 'kitchen']) {
    body.append(el('h3', 'panel-sub', PLACE_NAMES[place]));
    for (const r of RECIPES.filter(q => q.place === place)) {
      const def = ITEM_DEFS[r.id], why = craftBlocker(r), card = el('div', 'bcard' + (why && why !== 'не хватает запасов' ? ' locked' : ''));
      const head = el('div', 'bhead');
      head.append(el('b', '', recipeName(r)), el('span', 'lvl', r.out ? `+${Object.values(r.out)[0]} на склад` : def.bag ? `${BAGS[def.bag].slots} мест, ${BAGS[def.bag].cap} кг` : `${def.w} кг`));
      card.append(head);
      const use = r.use || (def && def.hint);
      if (use) card.append(el('p', '', use[0].toUpperCase() + use.slice(1) + '.'));
      const need = [r.lvl ? `мастерская ${r.lvl}` : '', r.kitchen ? `кухня ${r.kitchen}` : ''].filter(Boolean).join(', ');
      card.append(el('p', 'panel-note', `Нужно: ${costText(r.cost)}${need ? ` · ${need}` : ''}${why ? ` · ${why}` : ''}`));
      card.append(button('Сделать', () => { craft(r); refreshPanel(); }, { cls: 'btn small', disabled: !!why }));
      body.append(card);
    }
  }
}
