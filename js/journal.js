// Журнал (J): задания, записки, найденные места, фото и отношения с жителями.
// Фоторежим (O): свободная камера рядом с Томасом; снимок попадает в журнал с подписью места.
// Сфотографированный знак сектора тоже считается найденным.

const Journal = { tab: 'quests', places: [], photos: [] };
const PHOTO_KEY = 'maze-runner-photos', PHOTO_MAX = 12;

Object.assign(Journal, {
  addPlace(text, where) {
    if (Journal.places.some(p => p.text === text)) return;
    Journal.places.unshift({ text, where, day: Game.day });
    if (Journal.places.length > 60) Journal.places.length = 60;
  },
  loadPhotos() {
    try { Journal.photos = JSON.parse(localStorage.getItem(PHOTO_KEY)) || []; } catch (e) { Journal.photos = []; }
  },
  savePhotos() {
    for (;;) {
      try { localStorage.setItem(PHOTO_KEY, JSON.stringify(Journal.photos)); return true; } catch (e) {
        if (!Journal.photos.length) return false;
        Journal.photos.pop();                          // место кончилось — убираем самый старый снимок
      }
    }
  },
});

function openJournal(tab) {
  if (tab) Journal.tab = tab;
  if (tab && Panel.open === 'journal') { refreshPanel(); return; }
  togglePanel('journal', 'Журнал', renderJournal, { icon: 'i-book', kind: 'journal' });
  Tutorial.event('journal');
}

const QUEST_STATE = {
  ready: { pill: 'готово', icon: 'i-check' }, active: { pill: 'в работе', icon: 'i-flag' }, offered: { pill: 'предложено', icon: 'i-flag' },
  done: { pill: 'выполнено', icon: 'i-check' }, failed: { pill: 'провалено', icon: 'i-close' },
};

function renderJournal(body) {
  const known = new Set([...Story.notes, ...Meta.lore]);
  const live = Object.values(Story.quests).filter(s => s === 'active' || s === 'ready' || s === 'offered').length;
  panelTabs([
    { id: 'quests', label: 'Задания', icon: 'i-flag', count: live },
    { id: 'notes', label: 'Записки', icon: 'i-note', count: `${known.size}/${NOTES.length}` },
    { id: 'places', label: 'Места', icon: 'i-pin' },
    { id: 'photos', label: 'Фото', icon: 'i-camera', count: Journal.photos.length },
    { id: 'people', label: 'Жители', icon: 'i-people' },
  ], Journal.tab, id => { Journal.tab = id; });
  const t = Journal.tab;
  if (t === 'quests') {
    const order = { ready: 0, active: 1, offered: 2, done: 3, failed: 4 };
    const list = Object.entries(Story.quests).sort((a, b) => order[a[1]] - order[b[1]]);
    if (!list.length) body.append(el('p', 'panel-note', 'Заданий пока нет. Поговори с жителями Глэйда: подойди и нажми ' + keyLabel(Settings.keys.action) + '.'));
    for (const [id, st] of list) {
      const q = QUESTS[id], S = QUEST_STATE[st], card = el('div', 'quest ' + st);
      card.append(svgIcon(S.icon), el('b', '', q.title), el('span', 'pill', S.pill), el('p', '', q.text));
      const prog = st === 'active' && q.progress ? q.progress() : '';
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(prog);
      if (m) {
        const bar = el('div', 'bar'), fill = el('i');
        fill.style.width = Math.min(100, (+m[1] / +m[2]) * 100) + '%';
        bar.appendChild(fill);
        card.append(bar);
      }
      const who = st === 'ready' ? `Вернись к ${q.giver} за наградой` : st === 'offered' ? `Предлагает ${q.giver}` : `От ${q.giver}` + (prog ? ` · ${prog}` : '');
      card.append(el('span', 'qgiver', who));
      body.append(card);
    }
  } else if (t === 'notes') {
    body.append(el('p', 'panel-lead', `Записки создателей: ${known.size} из ${NOTES.length}. ${Game.ngPlus ? 'Прочитанные в прошлых забегах остаются в журнале.' : 'Они спрятаны в тупиках и тайных комнатах.'}`));
    const grid = el('div', 'notes-grid');
    NOTES.forEach((text, i) => {
      const card = el('div', 'paper' + (known.has(i) ? '' : ' unknown'));
      card.style.setProperty('--tilt', ((i % 3) - 1) * 0.7 + 'deg');
      card.append(el('b', '', `Записка ${i + 1}`), el('p', '', known.has(i) ? text : 'Ещё не найдена'));
      grid.append(card);
    });
    body.append(grid);
  } else if (t === 'places') {
    body.append(el('p', 'panel-lead', `Знаки секторов: ${Secrets.symbolsFound()} из ${Secrets.symbols.length}. Тайных комнат открыто: ${Secrets.rooms.filter(r => r.open).length} из ${Secrets.rooms.length}.`));
    if (!Journal.places.length) body.append(el('p', 'panel-note', 'Пока пусто. Здесь появятся найденные знаки, комнаты и механизмы.'));
    for (const p of Journal.places) body.append(el('p', 'place', `День ${p.day} · ${p.where}: ${p.text}`));
  } else if (t === 'photos') {
    body.append(el('p', 'panel-lead', `Фоторежим — ${keyLabel(Settings.keys.photo)}. Снимков: ${Journal.photos.length} из ${PHOTO_MAX}.`));
    const grid = el('div', 'photo-grid');
    Journal.photos.forEach((ph, i) => {
      const f = el('figure', 'photo'), img = el('img');
      img.src = ph.src;
      img.alt = ph.caption;
      const cap = el('figcaption', '', `День ${ph.day} · ${ph.caption}`);
      f.append(img, cap, button('Удалить', () => { Journal.photos.splice(i, 1); Journal.savePhotos(); refreshPanel(); }));
      grid.append(f);
    });
    body.append(grid);
  } else if (t === 'people') {
    body.append(el('p', 'panel-lead', `Дух Глэйда: ${moraleWord()}. Среднее доверие: ${Math.round(Story.avg())}.`));
    for (const n of Game.npcs) {
      const v = Math.round(Story.trust[n.name] ?? 50), card = el('div', 'bcard'), head = el('div', 'bhead');
      const st = [n.injured ? 'ранен' : '', n.companion ? 'в отряде' : '', n.stranded ? 'в Лабиринте' : ''].filter(Boolean).join(', ');
      head.append(el('b', '', n.name), el('span', 'lvl', st || `доверие ${v}`));
      const bar = el('div', 'trust'), fill = el('i');
      fill.style.width = v + '%';
      bar.append(fill);
      card.append(head, bar);
      body.append(card);
    }
  }
}

/* ---------- фоторежим ---------- */

const Photo = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, shoot: false };

function startPhoto() {
  if (Game.state !== 'play') return;
  const c = World.camera;
  Object.assign(Photo, { x: c.position.x, y: c.position.y, z: c.position.z, yaw: Game.player.yaw, pitch: Game.player.pitch, shoot: false });
  Game.state = 'photo';
  Input.clear();
  document.body.classList.add('photo-mode');
  $('photo-ui').hidden = false;
  $('photo-help').textContent = `${keyLabel(Settings.keys.forward)}${keyLabel(Settings.keys.left)}${keyLabel(Settings.keys.back)}${keyLabel(Settings.keys.right)} — лететь, мышь — смотреть, ${keyLabel(Settings.keys.action)}/${keyLabel(Settings.keys.stow)} — выше/ниже, ${keyLabel(Settings.keys.use)} или клик — снимок, ${keyLabel(Settings.keys.photo)} — выйти`;
}

function stopPhoto() {
  if (Game.state !== 'photo') return;
  Game.state = 'play';
  Input.clear();
  document.body.classList.remove('photo-mode');
  $('photo-ui').hidden = true;
}

function updatePhoto(dt) {
  Photo.yaw += Input.lookX * 0.0024 * Settings.sens;
  Photo.pitch = Math.max(-1.45, Math.min(1.45, Photo.pitch - Input.lookY * 0.0024 * Settings.sens * (Settings.invertY ? -1 : 1)));
  Input.lookX = Input.lookY = 0;
  const f = keyDown('forward') - keyDown('back'), s = keyDown('right') - keyDown('left'), u = keyDown('action') - keyDown('stow');
  const sp = 6 * dt;
  Photo.x += (Math.cos(Photo.yaw) * f - Math.sin(Photo.yaw) * s) * sp;
  Photo.z += (Math.sin(Photo.yaw) * f + Math.cos(Photo.yaw) * s) * sp;
  Photo.y += u * sp;
  // Камера не улетает дальше 20 м от Томаса и не уходит под землю
  const p = Game.player, cx = tw(p.x), cz = tw(p.y), cy = p.h + 1.6;
  const dx = Photo.x - cx, dy = Photo.y - cy, dz = Photo.z - cz, d = Math.hypot(dx, dy, dz);
  if (d > 20) { Photo.x = cx + dx / d * 20; Photo.y = cy + dy / d * 20; Photo.z = cz + dz / d * 20; }
  Photo.y = Math.max(groundH(Photo.x, Photo.z) + 0.3, Math.min(45, Photo.y));
}

function placeName(x, z) {
  const tx = x / S, ty = z / S;
  if (Maze.at(Math.round(tx), Math.round(ty)) !== T.GLADE) return `Лабиринт, сектор ${sectorOfTile(Math.round(tx), Math.round(ty))}`;
  const spots = [
    ...HOUSES.map(h => ({ name: h.name, x: (h.r.x0 + h.r.x1) / 2, y: (h.r.y0 + h.r.y1) / 2 })),
    { name: 'Башня', ...LAYOUT.tower }, { name: 'Ящик', ...LAYOUT.box }, { name: 'Костёр', ...LAYOUT.campfire },
    { name: 'Кладбище жмуриков', x: (LAYOUT.graveyard.x0 + LAYOUT.graveyard.x1) / 2, y: (LAYOUT.graveyard.y0 + LAYOUT.graveyard.y1) / 2 },
    { name: 'Плантации', x: (LAYOUT.plantations.x0 + LAYOUT.plantations.x1) / 2, y: (LAYOUT.plantations.y0 + LAYOUT.plantations.y1) / 2 },
    { name: 'Мостик через реку', ...LAYOUT.bridge },
  ];
  let best = null, bd = 4;
  for (const s of spots) {
    const d = Math.hypot(s.x - tx, s.y - ty);
    if (d < bd) { bd = d; best = s; }
  }
  if (best) return `Глэйд, ${best.name}`;
  if (riverDistTiles(tx, ty) < 1.5) return 'Глэйд, река';
  return ty > MID + 2 ? 'Глэйд, лес' : 'Глэйд';
}

// Снимок делается сразу после кадра, пока картинка ещё в буфере
function capturePhoto() {
  Photo.shoot = false;
  const src = World.renderer.domElement, c = makeCanvas(320, 180), g = c.getContext('2d');
  const k = Math.min(src.width / 16, src.height / 9), sw = k * 16, sh = k * 9;
  g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, 320, 180);
  let data;
  try { data = c.toDataURL('image/jpeg', 0.82); } catch (e) { toast('Снимок не получился.', 'warn'); return; }
  const caption = placeName(Photo.x, Photo.z);
  Journal.photos.unshift({ src: data, caption, day: Game.day });
  if (Journal.photos.length > PHOTO_MAX) Journal.photos.length = PHOTO_MAX;
  Journal.savePhotos();
  flash('pickup');
  Sound.tone(1800, 0.05, { type: 'square', vol: 0.06, dest: Sound.master });
  Sound.noise(0.08, { vol: 0.12, freq: 3000, type: 'highpass', delay: 0.04, dest: Sound.master });
  // Знак сектора в кадре — тоже находка
  const fwd = new THREE.Vector3();
  World.camera.getWorldDirection(fwd);
  for (const s of Secrets.symbols) {
    if (s.found) continue;
    const sx = tw(s.cell.x) + s.d.x * S / 2, sz = tw(s.cell.y) + s.d.y * S / 2;
    const v = new THREE.Vector3(sx - Photo.x, 1.8 - Photo.y, sz - Photo.z), d = v.length();
    if (d < 14 && v.normalize().dot(fwd) > 0.8) findSymbol(s);
  }
  toast(`Снимок сохранён в журнал: ${caption}.`, 'good');
}
