// Поверх 3D-вида: мини-карта (окрестности, север сверху), большая карта в окне (M), компас-полоса
// с метками целей и облачко с репликой жителя Глэйда.

const MAP_K = 8;             // пикселей на тайл
const MINI_R = 12;           // мини-карта показывает 25×25 тайлов вокруг Томаса
const Overlay = { mapT: 0, marks: [] };
// Карта бегунов: углём по старой бумаге, Глэйд размыт зелёной краской, пометки красным и синим карандашом
const MAPC = {
  paper: '#cbbb93', floor: '#efe5c9', wall: '#3a3229', glade: '#93ad6c', house: '#7b6748', rubble: '#8c6a45', ivy: '#6f8f4a',
  mark: '#b77b2c', gateOpen: '#a8834c', gateShut: '#a8392a', exit: '#2f9384', secret: '#3d8f80',
  code: '#b5331f', symbol: '#bf7420', path: '#34619a', quest: '#c4501c', squad: '#4d7a2c', stranded: '#3c8a35', trap: '#b5331f',
  shift: 'rgba(181, 51, 31, 0.2)', sector: 'rgba(58, 50, 41, 0.45)', me: '#b5331f', meEdge: '#2a2318',
};

function initMinimap() {
  const c = document.getElementById('minimap');
  c.width = c.height = (MINI_R * 2 + 1) * MAP_K;
  Overlay.mctx = c.getContext('2d');
  buildCompass();
}

function tileColor(x, y) {
  const t = Maze.at(x, y);
  if (t === T.WALL) return MAPC.wall;
  if (t === T.SECRET) return Admin.xray || Secrets.hintRoom && Secrets.hintRoom.door.x === x && Secrets.hintRoom.door.y === y ? MAPC.secret : MAPC.wall;
  if (t === T.RUBBLE) return MAPC.rubble;
  if (t === T.IVY) return Admin.xray || MazeDecor.ivyFound.has(y * SIZE + x) ? MAPC.ivy : MAPC.wall;    // проход за плющом — только найденный
  if (t === T.MARK) return MAPC.mark;
  if (t === T.GLADE) return decoBlocked(x, y) ? MAPC.house : MAPC.glade;
  if (t === T.GATE) return Game.gate > 0.5 ? MAPC.gateShut : MAPC.gateOpen;
  if (t === T.EXIT) return MAPC.exit;
  return MAPC.floor;
}

// Кусок карты: x0, y0 — левый верхний тайл, n — сколько тайлов по стороне, k — пикселей на тайл
function drawMapView(g, x0, y0, n, k, big = false) {
  const p = Game.player;
  g.fillStyle = MAPC.paper;
  g.fillRect(0, 0, n * k, n * k);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const tx = x0 + x, ty = y0 + y;
      if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE || !(Admin.xray || Maze.isExplored(tx, ty))) continue;
      g.fillStyle = tileColor(tx, ty);
      g.fillRect(x * k, y * k, k, k);
    }
  }
  const inView = (x, y) => x >= x0 - 1 && y >= y0 - 1 && x <= x0 + n && y <= y0 + n;
  const dot = (x, y, r, color) => {
    if (!inView(x, y)) return;
    g.fillStyle = color;
    g.beginPath();
    g.arc((x - x0 + 0.5) * k, (y - y0 + 0.5) * k, r, 0, Math.PI * 2);
    g.fill();
  };
  // Прогноз Минхо: какие секторы ночью сдвинутся
  if (Story.flags.forecast && Game.shiftPlan && Game.phase === 'day') {
    g.fillStyle = MAPC.shift;
    for (let y = Math.max(0, y0); y < Math.min(SIZE, y0 + n); y++) {
      for (let x = Math.max(0, x0); x < Math.min(SIZE, x0 + n); x++) if (Game.shiftPlan.includes(sectorOfTile(x, y)) && Maze.isExplored(x, y)) g.fillRect((x - x0) * k, (y - y0) * k, k, k);
    }
  }
  for (const it of Game.items) if (!it.taken && (Admin.xray || Maze.isExplored(it.x, it.y))) dot(it.x, it.y, k * 0.6, MAPC.code);
  if (Game.exitOpen) dot(Maze.exit.x, Maze.exit.y, k * (0.8 + Math.sin(Game.time * 6) * 0.25), MAPC.exit);
  // Замеченные ловушки, найденные знаки, отряд и раненый, которого надо спасти
  g.strokeStyle = MAPC.trap;
  g.lineWidth = 1.5;
  for (const t of Secrets.traps) {
    if (!t.armed || !(t.seen || Admin.xray) || !inView(t.x, t.y)) continue;
    const ax = (t.x - x0) * k, ay = (t.y - y0) * k;
    g.beginPath();
    g.moveTo(ax + 1, ay + 1); g.lineTo(ax + k - 1, ay + k - 1);
    g.moveTo(ax + k - 1, ay + 1); g.lineTo(ax + 1, ay + k - 1);
    g.stroke();
  }
  for (const s of Secrets.symbols) if (s.found) dot(s.cell.x + s.d.x * 0.5, s.cell.y + s.d.y * 0.5, k * 0.45, MAPC.symbol);
  // Безопасные пути бегунов — пунктир; цель задания бегунов — флажок
  for (const path of [...(Story.flags.safePaths || []), Story.flags.trail || []]) for (const t of path) dot(t.x, t.y, k * 0.28, MAPC.path);
  const rq = runnerQuestTarget();
  if (rq) dot(rq.x, rq.y, k * (0.75 + Math.sin(Game.time * 4) * 0.2), MAPC.quest);
  for (const n2 of Squad.members) dot(n2.x, n2.y, k * 0.5, MAPC.squad);
  if (Squad.stranded) dot(Squad.stranded.x, Squad.stranded.y, k * (0.7 + Math.sin(Game.time * 5) * 0.25), MAPC.stranded);
  if (Admin.xray) adminMapLayer(dot, k);           // рентген ПОРОКа: гриверы, жители, тайники
  // Номера секторов на большой карте — те же, что на табличках в Лабиринте
  if (big) {
    g.font = `600 ${k * 2.4}px Oswald, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = MAPC.sector;
    for (let s = 1; s <= 8; s++) {
      const a = (s - 1) * Math.PI / 4 - Math.PI / 2, r = SIZE * 0.36;
      g.fillText(ROMAN[s - 1], (MID + Math.cos(a) * r + 0.5) * k, (MID + Math.sin(a) * r + 0.5) * k);
    }
  }
  // Томас — стрелка по направлению взгляда
  g.save();
  g.translate((p.x - x0 + 0.5) * k, (p.y - y0 + 0.5) * k);
  g.rotate(p.yaw);
  const a = k * (big ? 1.4 : 1.1);
  g.fillStyle = MAPC.me;
  g.strokeStyle = MAPC.meEdge;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(a, 0);
  g.lineTo(-a * 0.65, -a * 0.65);
  g.lineTo(-a * 0.25, 0);
  g.lineTo(-a * 0.65, a * 0.65);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

function drawMinimap(dt) {
  Overlay.mapT -= dt;
  if (Overlay.mapT > 0 || !Game.player) return;
  Overlay.mapT = 0.08;
  const p = Game.player, cx = Math.round(p.x), cy = Math.round(p.y);
  drawMapView(Overlay.mctx, cx - MINI_R, cy - MINI_R, MINI_R * 2 + 1, MAP_K);
}

/* ---------- окно карты ---------- */

function openMap() {
  const p = Game.player, sn = sectorOfTile(Math.round(p.x), Math.round(p.y));
  const sec = Maze.at(Math.round(p.x), Math.round(p.y)) === T.GLADE ? 'Глэйд' : `Сектор ${ROMAN[sn - 1] || '—'}${SECTOR_THEMES[sn] ? ' · ' + SECTOR_THEMES[sn].name : ''}`;
  togglePanel('map', 'Карта Лабиринта', renderMap, { icon: 'i-map', kind: 'map', sub: sec });
}

function renderMap(body) {
  const p = Game.player, layout = el('div', 'map-layout'), stage = el('div', 'map-stage'), canvas = el('canvas');
  canvas.id = 'bigmap';
  canvas.width = canvas.height = SIZE * MAP_K;
  drawMapView(canvas.getContext('2d'), 0, 0, SIZE, MAP_K, true);
  const north = el('div', 'map-north');
  north.append(svgIcon('i-arrow'), 'С');
  stage.append(canvas, north);
  // Сводка: сколько открыто, что найдено
  let open = 0, seen = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const t = Maze.at(x, y);
    if (t === T.WALL || t === T.GLADE) continue;
    open++;
    if (Maze.isExplored(x, y)) seen++;
  }
  const side = el('div', 'map-side'), rose = el('div', 'rose');
  for (const [l, x, y] of [['С', 50, 12], ['В', 88, 50], ['Ю', 50, 88], ['З', 12, 50]]) {
    const s = el('span', '', l);
    s.style.left = x + '%';
    s.style.top = y + '%';
    rose.append(s);
  }
  const needle = svgIcon('i-arrow', 'ico needle');
  needle.style.transform = `rotate(${headingDeg(p.yaw)}deg)`;
  rose.append(needle);
  const facts = el('dl', 'facts'), fact = (k, v) => { const d = el('div'); d.append(el('dt', '', k), el('dd', '', v)); facts.append(d); };
  fact('Открыто коридоров', Math.round(seen / Math.max(1, open) * 100) + '%');
  fact('Фрагменты кода', `${codeCount()} из ${CODE_WORDS.length}`);
  fact('Знаки секторов', `${Secrets.symbolsFound()} из ${Secrets.symbols.length}`);
  fact('Тайные комнаты', `${Secrets.rooms.filter(r => r.open).length} из ${Secrets.rooms.length}`);
  fact('Курс', `${compassWord(headingDeg(p.yaw))} · ${Math.round(headingDeg(p.yaw))}°`);
  adminMapHook(canvas, facts);                    // ПОРОК: клик по карте — телепорт
  const legend = el('ul', 'legend'), item = (sw, text) => { const li = el('li'); li.append(sw, text); legend.append(li); };
  const swatch = (color, round) => { const s = el('span', 'sw' + (round ? ' round' : '')); s.style.background = color; return s; };
  const arrow = svgIcon('i-arrow');
  arrow.style.color = MAPC.me;
  item(arrow, 'Ты и куда смотришь');
  item(swatch(MAPC.glade), 'Глэйд');
  item(swatch(Game.gate > 0.5 ? MAPC.gateShut : MAPC.gateOpen), Game.gate > 0.5 ? 'Ворота закрыты' : 'Ворота открыты');
  item(swatch(MAPC.floor), 'Пройденные коридоры');
  item(swatch(MAPC.code, true), 'Фрагмент кода');
  item(swatch(MAPC.symbol, true), 'Найденный знак сектора');
  const trap = svgIcon('i-trap');
  trap.style.color = MAPC.trap;
  item(trap, 'Замеченная ловушка');
  item(swatch(MAPC.rubble), 'Завал');
  if (Squad.members.length) item(swatch(MAPC.squad, true), 'Отряд');
  if (Game.exitOpen) item(swatch(MAPC.exit, true), 'Выход из Лабиринта');
  if (Story.flags.forecast) item(swatch('rgba(181, 51, 31, 0.5)'), 'Сдвинется этой ночью');
  side.append(rose, facts, el('h3', '', 'Обозначения'), legend);
  layout.append(stage, side);
  body.append(layout);
  panelFoot(keyHintLine([['', 'Карта рисуется сама, пока ты бежишь. Ночью и в туман видно меньше'], [keyLabel(Settings.keys.map), 'закрыть']]));
}

/* ---------- компас ---------- */

// Курс по компасу: 0° — север (верх карты), по часовой стрелке
function headingDeg(yaw) { return ((Math.atan2(Math.cos(yaw), -Math.sin(yaw)) * 180 / Math.PI) + 360) % 360; }
function bearingDeg(dx, dy) { return ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360; }
function compassWord(deg) { return ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'][Math.round(deg / 45) % 8]; }

function buildCompass() {
  const strip = document.getElementById('compass-strip');
  strip.innerHTML = '';
  const L = { 0: 'С', 45: 'СВ', 90: 'В', 135: 'ЮВ', 180: 'Ю', 225: 'ЮЗ', 270: 'З', 315: 'СЗ' };
  for (let d = -360; d < 720; d += 15) {
    const left = (d + 360) / 1080 * 100 + '%', a = ((d % 360) + 360) % 360;
    const tk = el('i', 'ctick' + (a % 45 === 0 ? ' mid' : ''));
    tk.style.left = left;
    strip.append(tk);
    if (L[a] !== undefined) {
      const s = el('span', 'clbl' + (a % 90 === 0 ? ' cardinal' : '') + (a === 0 ? ' north' : ''), L[a]);
      s.style.left = left;
      strip.append(s);
    }
  }
  const marks = document.getElementById('compass-marks');
  marks.innerHTML = '';
  Overlay.marks = [0, 1, 2, 3].map(() => {
    const m = el('div', 'compass-mark'), ico = svgIcon('i-home'), small = el('small');
    m.append(ico, small);
    m.hidden = true;
    marks.append(m);
    return { m, use: ico.firstChild, small, key: '' };
  });
}

// Цели на компасе: Глэйд (из Лабиринта), выход, раненый в Лабиринте
function compassTargets() {
  const p = Game.player, out = [];
  const outside = Maze.at(Math.round(p.x), Math.round(p.y)) !== T.GLADE;
  if (outside) out.push({ x: MID, y: MID, icon: 'i-home', cls: 'home', label: 'Глэйд', urgent: (Game.phase === 'day' && Game.timeLeft < 40) || !!Squad.escorting });
  if (Game.exitOpen) out.push({ x: Maze.exit.x, y: Maze.exit.y, icon: 'i-beacon', cls: 'exit', label: 'Выход', urgent: true });
  if (Squad.stranded && Story.quests.rescue === 'active') out.push({ x: Squad.stranded.x, y: Squad.stranded.y, icon: 'i-people', cls: 'rescue', label: Squad.stranded.name });
  const q = runnerQuestTarget();
  if (q) out.push({ x: q.x, y: q.y, icon: 'i-flag', cls: 'rescue', label: q.label });
  return out.slice(0, 4);
}

function updateCompass() {
  const p = Game.player;
  if (!p || Game.state === 'title') return;
  const h = headingDeg(p.yaw);
  document.getElementById('compass-strip').style.transform = `translateX(${(-(h + 360) / 1080 + 1 / 12) * 100}%)`;
  const deg = Math.round(h) % 360;
  if (Overlay.deg !== deg) { Overlay.deg = deg; document.getElementById('compass-deg').textContent = `${compassWord(h)} · ${deg}°`; }
  const targets = compassTargets();
  Overlay.marks.forEach((M, i) => {
    const t = targets[i];
    M.m.hidden = !t;
    if (!t) return;
    let rel = bearingDeg(t.x - p.x, t.y - p.y) - h;
    rel = ((rel + 540) % 360) - 180;
    // За краем полосы метка прижимается к краю (но не в затухание по бокам) и становится бледнее
    const behind = Math.abs(rel) > 64;
    M.m.style.left = (50 + Math.max(-64, Math.min(64, rel)) / 180 * 100) + '%';
    M.m.style.opacity = behind ? 0.7 : 1;
    const key = t.icon + t.cls + t.urgent;
    if (M.key !== key) {
      M.key = key;
      M.use.setAttribute('href', '#' + t.icon);
      M.m.className = 'compass-mark ' + t.cls + (t.urgent ? ' urgent' : '');
    }
    const text = `${t.label} ${Math.round(Math.hypot(t.x - p.x, t.y - p.y) * S)} м`;
    if (M.small.textContent !== text) M.small.textContent = text;
  });
}

function updateBubble() {
  const el2 = document.getElementById('bubble');
  const p = Game.player;
  let best = null, bd = 1e9;
  for (const n of Game.npcs) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (n.sayT > 0 && n.say && d < bd) { bd = d; best = n; }
  }
  const pos = best && Game.state === 'play' ? screenPos(best.x, best.y, (best.wy || 0) + (best.act === 'sit' ? 1.5 : 2.35)) : null;
  el2.hidden = !pos;
  if (!pos) return;
  if (el2.dataset.who !== best.name + best.say) {
    el2.dataset.who = best.name + best.say;
    el2.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = best.name;
    el2.append(b, document.createTextNode(best.say));
  }
  // Облачко целиком на экране: не выше верхнего края и не за боковыми краями
  const hw = el2.offsetWidth / 2 + 12;
  el2.style.left = Math.max(hw, Math.min(window.innerWidth - hw, pos.x)) + 'px';
  el2.style.top = Math.max(el2.offsetHeight + 16, Math.min(window.innerHeight - 16, pos.y)) + 'px';
  el2.style.opacity = Math.min(1, best.sayT * 2);
}
