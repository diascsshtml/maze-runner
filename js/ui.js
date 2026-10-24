// Окна поверх игры: карта, сумка, журнал, мастерская, совет Глэйда, отряд, разговоры.
// Одна оболочка: значок, заголовок, подпись, вкладки, тело и подвал. Пока окно открыто, мир стоит на месте.

const Panel = { open: null, title: '', render: null, icon: 'i-book', kind: '', sub: '' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text, onClick, { cls = 'chip', disabled = false, title = '', icon = '' } = {}) {
  const b = el('button', cls);
  b.type = 'button';
  if (icon) b.appendChild(svgIcon(icon));
  b.append(text);
  b.disabled = disabled;
  if (title) b.title = title;
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

// opts: icon — значок окна, kind — вид оформления (map, inventory, talk, journal…), sub — подпись справа от заголовка
function openPanel(id, title, render, { icon = 'i-book', kind = id, sub = '' } = {}) {
  if (Game.state !== 'play' && Game.state !== 'ui' && Game.state !== 'pause') return;
  const fromPause = Game.state === 'pause';
  Object.assign(Panel, { open: id, title, render, icon, kind, sub });
  if (Game.state === 'play' || fromPause) {
    Game.state = 'ui';
    Input.clear();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  if (fromPause) showScreen(null);
  const p = $('panel');
  p.dataset.kind = kind;
  p.hidden = false;
  Sound.ui('open');
  refreshPanel();
  const first = p.querySelector('.tab.on, .talk-opt:not(:disabled), .inv-slot:not(.empty), .win-body button:not(:disabled)');
  if (first && !World.mobile) first.focus({ preventScroll: true });
}

function refreshPanel() {
  if (!Panel.open) return;
  $('panel-title').textContent = Panel.title;
  $('panel-sub').textContent = Panel.sub || '';
  $('panel-ico').setAttribute('href', '#' + Panel.icon);
  const body = $('panel-body'), tabs = $('panel-tabs'), foot = $('panel-foot');
  const scroll = body.scrollTop;
  body.innerHTML = '';
  tabs.innerHTML = '';
  foot.innerHTML = '';
  foot.hidden = true;
  Panel.render(body);
  body.scrollTop = scroll;
}

// Вкладки окна: list — [{ id, label, icon, count }], выбранная подсвечена
function panelTabs(list, current, pick) {
  const tabs = $('panel-tabs');
  tabs.innerHTML = '';
  for (const t of list) {
    const b = el('button', 'tab' + (t.id === current ? ' on' : ''));
    b.type = 'button';
    if (t.icon) b.appendChild(svgIcon(t.icon));
    b.append(t.label);
    if (t.count !== undefined) b.appendChild(el('span', 'count', String(t.count)));
    b.addEventListener('click', () => { if (t.id !== current) { pick(t.id); refreshPanel(); } });
    tabs.appendChild(b);
  }
}

// Подвал окна: подсказки по клавишам или кнопки
function panelFoot(...nodes) {
  const foot = $('panel-foot');
  foot.innerHTML = '';
  foot.append(...nodes);
  foot.hidden = false;
}

// Строка подсказки вида «клавиша — что делает» для подвала окон
function keyHintLine(pairs) {
  const s = el('span', 'grow');
  pairs.forEach(([k, text], i) => {
    if (i) s.append(' · ');
    if (k) { s.appendChild(el('kbd', '', k)); s.append(' '); }
    s.append(text);
  });
  return s;
}

function closePanel() {
  if (!Panel.open) return;
  Panel.open = null;
  $('panel').hidden = true;
  Sound.ui('close');
  if (Game.state === 'ui') {
    Game.state = 'play';
    lockPointer();
  }
}

function togglePanel(id, title, render, opts) {
  if (Panel.open === id) closePanel();
  else openPanel(id, title, render, opts);
}

// Строка «ресурс: сколько» для стоимости
function costText(cost) {
  return Object.entries(cost).map(([k, v]) => `${RES_NAMES[k] || ITEM_DEFS[k].name} ${v}`).join(', ');
}

function bindPanel() {
  $('panel-close').addEventListener('click', closePanel);
  $('panel').addEventListener('pointerdown', e => { if (e.target.id === 'panel') closePanel(); });
}
