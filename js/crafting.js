// Мастерская: из запасов Глэйда делаются факелы, бинты, инструменты и сумки получше.
// Что доступно — зависит от уровня мастерской (пайки — от кухни). Работать можно только у кузницы.

const RECIPES = [
  { id: 'torch', cost: { wood: 1, cloth: 1 }, lvl: 1 },
  { id: 'bandage', cost: { cloth: 1, herbs: 2 }, lvl: 1 },
  { id: 'knife', cost: { metal: 1, wood: 1 }, lvl: 1 },
  { id: 'rope', cost: { cloth: 3 }, lvl: 1 },
  { id: 'ration', cost: { food: 3 }, lvl: 1, kitchen: 2 },
  { id: 'spear', cost: { wood: 2, metal: 1 }, lvl: 2 },
  { id: 'crowbar', cost: { metal: 3 }, lvl: 2 },
  { id: 'lantern', cost: { metal: 2, cloth: 1, wood: 1 }, lvl: 2 },
  { id: 'bag2', cost: { cloth: 4, food: 2 }, lvl: 2 },
  { id: 'watch', cost: { metal: 3, gear: 1 }, lvl: 3 },
  { id: 'bag3', cost: { cloth: 6, metal: 2 }, lvl: 3 },
];

function craftBlocker(r) {
  const def = ITEM_DEFS[r.id];
  if (Life.lvl.workshop < r.lvl) return `нужна мастерская ${r.lvl}-го уровня`;
  if (r.kitchen && Life.lvl.kitchen < r.kitchen) return `нужна кухня ${r.kitchen}-го уровня`;
  if (def.bag && def.bag <= Items.bag) return 'у тебя сумка не хуже';
  if (!canPay(r.cost)) return 'не хватает запасов';
  if (!def.bag && Items.inv.length >= itemCap()) return 'в сумке нет места';
  return null;
}

function craft(r) {
  if (craftBlocker(r)) return;
  pay(r.cost);
  giveItem(r.id);
  const h = houseOf('forge');
  Sound.work('hammer', tw(h.doorTile.x), 0, tw(h.doorTile.y));
  toast(`Сделано: ${ITEM_DEFS[r.id].name}.`, 'good');
  Story.onCraft(r.id);
  Tutorial.event('craft-item');
}

function openCraft() {
  if (!inGladeNow() || !nearHouse('forge', 12)) {
    toast('Мастерская — в кузнице, в северо-западном углу Глэйда. Подойди к ней и нажми ' + keyLabel(Settings.keys.craft) + '.', 'info');
    return;
  }
  togglePanel('craft', 'Мастерская', renderCraft, { icon: 'i-hammer' });
  Tutorial.event('craft');
}

function renderCraft(body) {
  body.append(el('p', 'panel-lead', `Мастерская ${Life.lvl.workshop}-го уровня. Груз: ${carryWeight().toFixed(1)} из ${carryCap()} кг, сумка: ${BAGS[Items.bag].name.toLowerCase()}.`));
  const grid = el('div', 'res-grid small');
  for (const [k, name] of Object.entries(RES_NAMES)) {
    const c = el('div', 'res');
    c.append(el('b', '', Math.floor(Life.res[k])), el('span', '', name));
    grid.append(c);
  }
  body.append(grid);
  for (const r of RECIPES) {
    const def = ITEM_DEFS[r.id], why = craftBlocker(r), card = el('div', 'bcard' + (Life.lvl.workshop < r.lvl ? ' locked' : ''));
    const head = el('div', 'bhead');
    head.append(el('b', '', def.name), el('span', 'lvl', def.bag ? `${BAGS[def.bag].slots} мест, ${BAGS[def.bag].cap} кг` : `${def.w} кг`));
    card.append(head);
    if (def.hint) card.append(el('p', '', def.hint[0].toUpperCase() + def.hint.slice(1) + '.'));
    card.append(el('p', 'panel-note', `Нужно: ${costText(r.cost)}${why ? ` · ${why}` : ''}`));
    card.append(button('Сделать', () => { craft(r); refreshPanel(); }, { cls: 'btn small', disabled: !!why }));
    body.append(card);
  }
}
