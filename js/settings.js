// Настройки: звук, графика, мышь и клавиши, интерфейс. Хранятся в браузере и применяются сразу.

const KEY_ACTIONS = [
  { id: 'forward', name: 'Вперёд', key: 'KeyW', group: 'Движение' },
  { id: 'back', name: 'Назад', key: 'KeyS', group: 'Движение' },
  { id: 'left', name: 'Шаг влево', key: 'KeyA', group: 'Движение' },
  { id: 'right', name: 'Шаг вправо', key: 'KeyD', group: 'Движение' },
  { id: 'sprint', name: 'Рывок', key: 'ShiftLeft', group: 'Движение' },
  { id: 'jump', name: 'Прыжок', key: 'Space', group: 'Движение' },
  { id: 'action', name: 'Действие: взять, говорить, лестница', key: 'KeyE', group: 'Действия' },
  { id: 'use', name: 'Использовать предмет', key: 'KeyF', group: 'Действия' },
  { id: 'stow', name: 'Убрать в сумку', key: 'KeyQ', group: 'Действия' },
  { id: 'drop', name: 'Бросить предмет', key: 'KeyG', group: 'Действия' },
  { id: 'inventory', name: 'Сумка', key: 'KeyI', group: 'Окна' },
  { id: 'map', name: 'Карта', key: 'KeyM', group: 'Окна' },
  { id: 'journal', name: 'Журнал', key: 'KeyJ', group: 'Окна' },
  { id: 'craft', name: 'Мастерская', key: 'KeyC', group: 'Окна' },
  { id: 'glade', name: 'Совет Глэйда', key: 'KeyB', group: 'Окна' },
  { id: 'squad', name: 'Отряд', key: 'KeyT', group: 'Окна' },
  { id: 'photo', name: 'Фоторежим', key: 'KeyO', group: 'Окна' },
  { id: 'pause', name: 'Пауза (и Esc)', key: 'KeyP', group: 'Окна' },
];

const SETTING_DEFAULTS = {
  sens: 1, invertY: false, fov: 72, volMaster: 0.8, volWorld: 1, volUI: 0.7, hints: true, skipIntro: false,
  brightness: 1, headBob: true, uiScale: 1, keyHints: true, muted: false,
};
const Settings = { ...SETTING_DEFAULTS, keys: Object.fromEntries(KEY_ACTIONS.map(a => [a.id, a.key])) };

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('maze-runner-settings'));
    if (s) Object.assign(Settings, s, { keys: { ...Settings.keys, ...(s.keys || {}) } });
  } catch (e) { /* настройки по умолчанию */ }
}

function saveSettings() {
  try { localStorage.setItem('maze-runner-settings', JSON.stringify(Settings)); } catch (e) { /* без сохранения */ }
}

// Какое действие висит на клавише (правый Shift работает как левый, стрелки — всегда ходьба)
function keyAction(code) {
  if (code === 'ShiftRight' && Settings.keys.sprint === 'ShiftLeft') return 'sprint';
  for (const a of KEY_ACTIONS) if (Settings.keys[a.id] === code) return a.id;
  return null;
}

function keyDown(id) { return Input.keys.has(Settings.keys[id]); }

function keyLabel(code) {
  if (!code) return '—';
  const named = { ShiftLeft: 'Shift', ShiftRight: 'Правый Shift', ControlLeft: 'Ctrl', ControlRight: 'Правый Ctrl', AltLeft: 'Alt', Space: 'Пробел',
    Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc' };
  if (named[code]) return named[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

// Звук, поле зрения, масштаб интерфейса и подсказки клавиш подстраиваются сразу
function applySettings() {
  World.fov = Settings.fov;
  if (World.camera) {
    World.camera.fov = Settings.fov;
    World.camera.updateProjectionMatrix();
  }
  Sound.muted = !!Settings.muted;
  Sound.applyVolume();
  document.documentElement.style.setProperty('--ui-scale', Settings.uiScale);
  if (typeof renderKeyHints === 'function') renderKeyHints();
  if (typeof updateSoundIcon === 'function') updateSoundIcon();
}

/* ---------- окно настроек ---------- */

const SETTING_TABS = [
  { id: 'sound', label: 'Звук', icon: 'i-sound' },
  { id: 'graphics', label: 'Графика', icon: 'i-display' },
  { id: 'controls', label: 'Управление', icon: 'i-keys' },
  { id: 'interface', label: 'Интерфейс', icon: 'i-ui' },
];
let settingsFrom = null, rebinding = null, settingsTab = 'sound';

function openSettings(from) {
  settingsFrom = from;
  rebinding = null;
  renderSettings();
  showScreen('screen-settings');
  Sound.ui('open');
}

function closeSettings() {
  rebinding = null;
  saveSettings();
  applySettings();
  Sound.ui('close');
  showScreen(settingsFrom);
  focusFirstItem();
}

function svgIcon(id, cls = 'ico') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls);
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#' + id);
  s.appendChild(u);
  return s;
}

function renderSettings() {
  const tabs = $('settings-tabs'), box = $('settings-body');
  tabs.innerHTML = '';
  for (const t of SETTING_TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab' + (settingsTab === t.id ? ' on' : '');
    b.append(svgIcon(t.icon), t.label);
    b.addEventListener('click', () => { settingsTab = t.id; rebinding = null; renderSettings(); });
    tabs.appendChild(b);
  }
  const scroll = box.scrollTop;
  box.innerHTML = '';
  const group = () => { const g = document.createElement('div'); g.className = 'set-group'; box.appendChild(g); return g; };
  let g = group();
  const row = (label, hint, control) => {
    const r = document.createElement('div');
    r.className = 'set-row';
    const l = document.createElement('div');
    l.className = 'set-label';
    const b = document.createElement('b');
    b.textContent = label;
    l.appendChild(b);
    if (hint) { const s = document.createElement('small'); s.textContent = hint; l.appendChild(s); }
    r.append(l, control);
    g.appendChild(r);
    return r;
  };
  const head = text => {
    const h = document.createElement('h3');
    h.textContent = text;
    h.style.marginTop = box.children.length ? '0.9rem' : '0';
    box.appendChild(h);
    g = group();
  };
  const slider = (key, min, max, step, fmt) => {
    const wrap = document.createElement('span');
    wrap.className = 'set-slider';
    const inp = document.createElement('input');
    Object.assign(inp, { type: 'range', min, max, step, value: Settings[key] });
    const out = document.createElement('output');
    const paint = () => { out.textContent = fmt(Settings[key]); inp.style.setProperty('--p', ((Settings[key] - min) / (max - min) * 100) + '%'); };
    paint();
    inp.addEventListener('input', () => { Settings[key] = +inp.value; paint(); applySettings(); });
    inp.addEventListener('change', saveSettings);
    wrap.append(inp, out);
    return wrap;
  };
  // Переключатель; invert — галочка означает «выключено» в настройке (звук включён = не muted)
  const toggle = (key, invert = false) => {
    const t = document.createElement('label');
    t.className = 'toggle';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = invert ? !Settings[key] : !!Settings[key];
    inp.addEventListener('change', () => { Settings[key] = invert ? !inp.checked : inp.checked; applySettings(); saveSettings(); Sound.ui('tab'); });
    t.append(inp, document.createElement('i'));
    return t;
  };
  const pct = v => Math.round(v * 100) + '%';

  if (settingsTab === 'sound') {
    row('Общая громкость', 'Всё сразу', slider('volMaster', 0, 1, 0.05, pct));
    row('Мир', 'Ветер, костёр, река, птицы, гриверы', slider('volWorld', 0, 1.5, 0.05, pct));
    row('Интерфейс', 'Щелчки кнопок и окон', slider('volUI', 0, 1, 0.05, pct));
    row('Звук включён', '', toggle('muted', true));
  } else if (settingsTab === 'graphics') {
    const seg = document.createElement('div');
    seg.className = 'seg';
    const chosen = loadQuality();
    for (const [q, name] of [['low', 'Низкое'], ['medium', 'Среднее'], ['high', 'Высокое']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.className = q === chosen ? 'on' : '';
      b.addEventListener('click', () => { try { localStorage.setItem('maze-runner-quality', q); } catch (e) { /* без сохранения */ } renderSettings(); });
      seg.appendChild(b);
    }
    row('Качество графики', 'Тени, трава, сглаживание. Меняется после перезапуска', seg);
    if (chosen !== World.quality) {
      const restart = document.createElement('button');
      restart.type = 'button';
      restart.className = 'btn small';
      restart.textContent = 'Перезапустить сейчас';
      restart.addEventListener('click', () => {
        if (Game.state === 'pause' || Game.state === 'play' || Game.state === 'ui') saveGame(true);
        location.reload();
      });
      row(`Сейчас: ${QUALITY_NAMES[World.quality]}, будет: ${QUALITY_NAMES[chosen]}`, 'Игра сохранится и откроется заново', restart);
    }
    row('Яркость', 'Если ночью совсем ничего не видно', slider('brightness', 0.7, 1.5, 0.05, pct));
    row('Поле зрения', 'Шире — видно больше, но сильнее искажения по краям', slider('fov', 60, 95, 1, v => v + '°'));
    row('Покачивание камеры', 'Камера качается в такт шагам', toggle('headBob'));
  } else if (settingsTab === 'controls') {
    row('Чувствительность мыши', '', slider('sens', 0.3, 2.5, 0.05, v => v.toFixed(2)));
    row('Инвертировать вертикаль', 'Мышь вверх — взгляд вниз', toggle('invertY'));
    const note = document.createElement('p');
    note.className = 'set-note';
    note.textContent = 'Нажми на клавишу в списке, потом новую клавишу. Esc — отмена. Если клавиша занята, действия поменяются местами.';
    let lastGroup = '';
    for (const a of KEY_ACTIONS) {
      if (a.group !== lastGroup) {
        head(a.group);
        if (!lastGroup) box.insertBefore(note, box.lastChild);
        lastGroup = a.group;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'keybind' + (rebinding === a.id ? ' wait' : '');
      b.textContent = rebinding === a.id ? 'Нажми клавишу…' : keyLabel(Settings.keys[a.id]);
      b.addEventListener('click', e => { e.preventDefault(); rebinding = a.id; renderSettings(); });
      row(a.name, '', b);
    }
    const def = document.createElement('button');
    def.type = 'button';
    def.className = 'btn ghost small';
    def.textContent = 'Вернуть клавиши по умолчанию';
    def.style.justifySelf = 'start';
    def.addEventListener('click', () => { Settings.keys = Object.fromEntries(KEY_ACTIONS.map(a => [a.id, a.key])); saveSettings(); applySettings(); renderSettings(); });
    box.appendChild(def);
  } else {
    row('Масштаб интерфейса', 'Крупнее или мельче все надписи и кнопки', slider('uiScale', 0.85, 1.3, 0.05, pct));
    row('Подсказки клавиш на экране', 'Справа внизу: сумка, журнал, карта, пауза', toggle('keyHints'));
    row('Обучение и подсказки', 'Советы новичку в углу экрана', toggle('hints'));
    row('Пропускать вступление', 'Новая игра сразу у Ящика, без подъёма в шахте', toggle('skipIntro'));
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn ghost small';
    reset.textContent = 'Пройти заново';
    reset.addEventListener('click', () => { Tutorial.restart(); reset.textContent = 'Начнётся заново'; reset.disabled = true; });
    row('Обучение', 'Начать подсказки с первого шага', reset);
  }
  box.scrollTop = scroll;
}

// Сбросить всё к значениям по умолчанию (клавиши тоже)
function resetSettings() {
  Object.assign(Settings, SETTING_DEFAULTS, { keys: Object.fromEntries(KEY_ACTIONS.map(a => [a.id, a.key])) });
  saveSettings();
  applySettings();
  renderSettings();
}

// Перехват клавиши при переназначении. true — нажатие съедено экраном настроек
function settingsKey(e) {
  if (!rebinding) {
    if (e.code === 'Escape') { e.preventDefault(); closeSettings(); return true; }
    return false;
  }
  e.preventDefault();
  if (e.code !== 'Escape') {
    // Клавиша уже занята — меняем действия местами
    const other = KEY_ACTIONS.find(a => Settings.keys[a.id] === e.code);
    if (other) Settings.keys[other.id] = Settings.keys[rebinding];
    Settings.keys[rebinding] = e.code;
    saveSettings();
    applySettings();
  }
  rebinding = null;
  renderSettings();
  return true;
}
