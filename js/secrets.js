// Тайны Лабиринта: тайные комнаты за стенами со знаком, рычаги-механизмы, ловушки, завалы,
// знаки секторов, записки создателей, металлолом и редкие находки. В лесу Глэйда растут травы.
// Всё лежит в клетках и на внешней стене круга — ночной сдвиг секторов этого не трогает.

T.SECRET = 5;     // стена с вырезанным знаком: за ней тайная комната
T.RUBBLE = 6;     // завал из камней: не пройти, пока не разберёшь

const Secrets = {
  rooms: [], traps: [], symbols: [], levers: [], rubble: new Map(), meshes: [],
  caveT: 60, clearing: null, hintRoom: null,
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const SYMBOL_WORDS = ['Начало', 'Память', 'Страх', 'Выбор', 'Боль', 'Доверие', 'Жертва', 'Выход'];

function isCellTile(x, y) { return x % 2 === 1 && y % 2 === 1; }
function tileToCell(v) { return (v - 1) / 2; }
function deadEnd(x, y) { return DIRS.filter(d => Maze.at(x + d.x, y + d.y) !== T.WALL).length === 1; }
function solidTile(t) { return t === T.WALL || t === T.SECRET; }

/* ---------- генерация ---------- */

// Края круга: клетка, стена за ней и пустота дальше
function edgeSpots() {
  const out = [];
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      if (!validCell(cx, cy)) continue;
      for (const d of DIRS) {
        if (validCell(cx + d.x, cy + d.y) || inGlade(cx + d.x, cy + d.y)) continue;
        const x = cx * 2 + 1, y = cy * 2 + 1;
        if (Maze.exit && x + d.x === Maze.exit.x && y + d.y === Maze.exit.y) continue;
        out.push({ x, y, d, sector: sectorOfCell(cx, cy) });
      }
    }
  }
  return shuffle(out);
}

// Комната 3×3 тайла за стеной клетки: всё вокруг должно быть сплошной стеной
function roomFits(s) {
  const px = -s.d.y, py = s.d.x;
  for (let k = 1; k <= 5; k++) {
    for (let j = -2; j <= 2; j++) {
      const x = s.x + s.d.x * k + px * j, y = s.y + s.d.y * k + py * j;
      if (x < 1 || y < 1 || x > SIZE - 2 || y > SIZE - 2) return false;
      if (k === 1 && j === 0) continue;
      if (Maze.at(x, y) !== T.WALL) return false;
    }
  }
  return true;
}

function generateSecrets() {
  clearSecretMeshes();
  Object.assign(Secrets, { rooms: [], traps: [], symbols: [], levers: [], rubble: new Map(), caveT: 60, clearing: null, hintRoom: null });
  const used = new Set(), spots = edgeSpots();
  const take = s => used.add((s.y + s.d.y) * SIZE + s.x + s.d.x);
  // Тайные комнаты — по одной в шести разных секторах
  const sectors = new Set();
  for (const s of spots) {
    if (Secrets.rooms.length >= 6) break;
    if (sectors.has(s.sector) || !roomFits(s)) continue;
    sectors.add(s.sector);
    take(s);
    const door = { x: s.x + s.d.x, y: s.y + s.d.y }, px = -s.d.y, py = s.d.x;
    Maze.set(door.x, door.y, T.SECRET);
    for (let k = 2; k <= 4; k++) for (let j = -1; j <= 1; j++) Maze.set(s.x + s.d.x * k + px * j, s.y + s.d.y * k + py * j, T.FLOOR);
    Secrets.rooms.push({ door, cell: { x: s.x, y: s.y }, d: s.d, sector: s.sector, center: { x: s.x + s.d.x * 3, y: s.y + s.d.y * 3 }, open: false });
  }
  // Знаки секторов — на внешней стене, которая никогда не двигается
  for (let sec = 1; sec <= 8; sec++) {
    const s = spots.find(q => q.sector === sec && !used.has((q.y + q.d.y) * SIZE + q.x + q.d.x) && gladeDistance(tileToCell(q.x), tileToCell(q.y)) >= 3);
    if (!s) continue;
    take(s);
    Secrets.symbols.push({ sector: sec, cell: { x: s.x, y: s.y }, d: s.d, found: false });
  }
  // Ловушки — в коридорах подальше от Глэйда
  const cells = [];
  for (let cy = 0; cy < CELLS; cy++) for (let cx = 0; cx < CELLS; cx++) if (validCell(cx, cy) && gladeDistance(cx, cy) >= 3) cells.push({ x: cx * 2 + 1, y: cy * 2 + 1 });
  shuffle(cells);
  const busy = new Set(Game.items.map(it => it.y * SIZE + it.x));
  const free = c => !busy.has(c.y * SIZE + c.x);
  for (const c of cells) {
    if (Secrets.traps.length >= 16) break;
    if (!free(c) || deadEnd(c.x, c.y)) continue;
    busy.add(c.y * SIZE + c.x);
    Secrets.traps.push({ x: c.x, y: c.y, type: Math.random() < 0.6 ? 'darts' : 'collapse', armed: true, seen: false });
  }
  // Завалы
  for (const c of cells) {
    if (Secrets.rubble.size >= 6) break;
    if (!free(c) || deadEnd(c.x, c.y) || gladeDistance(tileToCell(c.x), tileToCell(c.y)) < 4) continue;
    busy.add(c.y * SIZE + c.x);
    Maze.set(c.x, c.y, T.RUBBLE);
    Secrets.rubble.set(c.y * SIZE + c.x, null);
  }
  Secrets.busy = busy;
}

// Находки раскладываются после того, как появились предметы Глэйда
function spawnSecretItems() {
  const busy = Secrets.busy || new Set();
  const notes = shuffle([...Array(NOTES.length).keys()]);
  const rooms = Secrets.rooms;
  // Карта-ключ — в самой дальней комнате, шестерни и рычаги — в других
  const far = rooms.slice().sort((a, b) => Math.hypot(b.center.x - MID, b.center.y - MID) - Math.hypot(a.center.x - MID, a.center.y - MID));
  rooms.forEach((r, i) => {
    const px = -r.d.y, py = r.d.x, spot = j => ({ x: tw(r.center.x + px * j * 0.7), z: tw(r.center.y + py * j * 0.7) });
    const a = spot(-1), b = spot(1);
    spawnWorldItem('note', a.x, 0.02, a.z, { note: notes.pop() });
    if (r === far[0]) spawnWorldItem('keycard', b.x, 0.02, b.z);
    else if (i % 2 === 0) spawnWorldItem('gear', b.x, 0.02, b.z);
    else spawnWorldItem('scrap', b.x, 0.02, b.z);
    if (i === 1 || i === 4) Secrets.levers.push({ room: r, pulled: false });
  });
  // Остальные записки и металлолом — в тупиках
  const ends = [];
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      const x = cx * 2 + 1, y = cy * 2 + 1;
      if (validCell(cx, cy) && gladeDistance(cx, cy) >= 2 && Maze.at(x, y) === T.FLOOR && !busy.has(y * SIZE + x) && deadEnd(x, y)) ends.push({ x, y, far: gladeDistance(cx, cy) });
    }
  }
  shuffle(ends);
  ends.filter(e => e.far >= 4).slice(0, notes.length).forEach(e => {
    busy.add(e.y * SIZE + e.x);
    spawnWorldItem('note', tw(e.x), 0.02, tw(e.y), { note: notes.pop() });
  });
  ends.filter(e => !busy.has(e.y * SIZE + e.x)).slice(0, 14).forEach(e => spawnWorldItem('scrap', tw(e.x) + (Math.random() - 0.5), 0.02, tw(e.y) + (Math.random() - 0.5)));
}

/* ---------- травы в лесу Глэйда (вырастают за ночь) ---------- */

function spawnHerbs() {
  for (const it of Items.world.filter(i => i.type === 'herb' && i.wild)) removeWorldItem(it);
  const n = [8, 5, 0, 10][Life.season];
  for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
    const tx = GLADE_T0 + 1 + Math.random() * (GLADE_T1 - GLADE_T0 - 2), ty = MID + 3 + Math.random() * (GLADE_T1 - MID - 4);
    if (decoBlocked(Math.round(tx), Math.round(ty)) || riverDistTiles(tx, ty) < 1) continue;
    if (LAYOUT.trees.some(t => Math.hypot(t.x - tx, t.y - ty) < 0.5)) continue;
    const x = tw(tx), z = tw(ty);
    spawnWorldItem('herb', x, groundH(x, z) + 0.01, z, { wild: true });
    i++;
  }
}

/* ---------- 3D: знаки, плиты ловушек, завалы, рычаги ---------- */

function clearSecretMeshes() {
  for (const m of Secrets.meshes) World.scene.remove(m);
  Secrets.meshes = [];
  for (const k of Secrets.rubble.keys()) Secrets.rubble.set(k, null);
}

function glyphTexture(kind, label) {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = kind === 'door' ? '#7ff0d8' : '#f0c070';
  g.fillStyle = g.strokeStyle;
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath(); g.arc(128, 128, 92, 0, Math.PI * 2); g.stroke();
  if (kind === 'door') {
    g.beginPath(); g.moveTo(128, 52); g.lineTo(196, 172); g.lineTo(60, 172); g.closePath(); g.stroke();
    g.beginPath(); g.arc(128, 132, 14, 0, Math.PI * 2); g.fill();
  } else {
    g.font = '700 86px Tektur, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 128, 132);
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

// Плоскость на грани стены, обращённой к клетке (x, y) в сторону d
function wallDecal(cell, d, size, mat, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.position.set(tw(cell.x) + d.x * (S / 2 - 0.02), h, tw(cell.y) + d.y * (S / 2 - 0.02));
  m.rotation.y = Math.atan2(-d.x, -d.y);
  World.scene.add(m);
  Secrets.meshes.push(m);
  return m;
}

function buildSecretMeshes() {
  clearSecretMeshes();
  const doorMat = new THREE.MeshStandardMaterial({ map: glyphTexture('door'), transparent: true, emissive: 0x3fbfa8, emissiveMap: null, emissiveIntensity: 0.15, roughness: 0.9, depthWrite: false });
  doorMat.emissiveMap = doorMat.map;
  for (const r of Secrets.rooms) if (!r.open) r.decal = wallDecal(r.cell, r.d, 1.6, doorMat.clone(), 1.7);
  for (const s of Secrets.symbols) {
    const mat = new THREE.MeshStandardMaterial({ map: glyphTexture('sym', ROMAN[s.sector - 1]), transparent: true, emissive: 0xf0a040, roughness: 0.6, metalness: 0.4, depthWrite: false });
    mat.emissiveMap = mat.map;
    mat.emissiveIntensity = s.found ? 0.6 : 0.2;
    // Стальная табличка на болтах (Blender), поверх неё — светящийся номер сектора
    const plaque = put('plaque', tw(s.cell.x) + s.d.x * (S / 2 - 0.03), 1.8, tw(s.cell.y) + s.d.y * (S / 2 - 0.03), Math.atan2(-s.d.x, -s.d.y));
    if (plaque) Secrets.meshes.push(plaque);
    else {
      const plate = wallDecal(s.cell, s.d, 1.3, new THREE.MeshStandardMaterial({ color: srgb('#4a4640'), metalness: 0.7, roughness: 0.5 }), 1.8);
      plate.position.addScaledVector(new THREE.Vector3(-s.d.x, 0, -s.d.y), 0.01);
    }
    s.decal = wallDecal(s.cell, s.d, 1.15, mat, 1.8);
    s.decal.position.addScaledVector(new THREE.Vector3(-s.d.x, 0, -s.d.y), plaque ? 0.045 : 0.025);
  }
  const plateTex = (() => {
    const c = makeCanvas(128, 128), g = c.getContext('2d');
    g.fillStyle = '#5a554c'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#2a2722'; g.lineWidth = 6; g.strokeRect(10, 10, 108, 108);
    g.beginPath(); g.moveTo(30, 64); g.lineTo(98, 64); g.moveTo(64, 30); g.lineTo(64, 98); g.stroke();
    return new THREE.CanvasTexture(c);
  })();
  for (const t of Secrets.traps) {
    if (!t.armed) continue;
    // Плита из Blender: замеченная ловушка светится красным из щелей рамы
    t.mesh = put('trap_plate', tw(t.x), 0, tw(t.y), Math.round(hash3(t.x, t.y, 5) * 4) * Math.PI / 2);
    if (t.mesh) {
      t.mesh.traverse(o => {
        if (!o.isMesh || o.material.name !== 'plate_dark') return;
        o.material = o.material.clone();
        o.material.emissive.set(0xff2010);
        o.material.emissiveIntensity = 0;
        t.glow = o.material;
      });
    } else {
      t.mesh = mesh(new THREE.BoxGeometry(1.3, 0.05, 1.3), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.85, emissive: 0x801010, emissiveIntensity: 0 }), tw(t.x), 0.025, tw(t.y), null, false);
      t.glow = t.mesh.material;
    }
    Secrets.meshes.push(t.mesh);
  }
  for (const k of Secrets.rubble.keys()) buildRubble(k);
  for (const l of Secrets.levers) buildLever(l);
}

function buildRubble(k) {
  const x = k % SIZE, y = Math.floor(k / SIZE);
  // Обломки бетонных плит с торчащей арматурой (Blender); куча у каждого завала повёрнута по-своему
  const pile = put('rubble', tw(x), 0, tw(y), hash3(x, y, 3) * 6.28);
  if (pile) {
    // Шире прохода и выше человека: сразу видно, что здесь не пройти
    pile.scale.set(1.12, 1.5 + hash3(x, y, 4) * 0.4, 1.12);
    Secrets.meshes.push(pile);
    Secrets.rubble.set(k, pile);
    return;
  }
  const g = new THREE.Group();
  const mat = Walls.rocks ? Walls.rocks.material : GM.bark;
  for (let i = 0; i < 9; i++) {
    const r = j => hash3(x * 3 + i, y * 7, j);
    const s = 0.5 + r(1) * 0.7, rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
    rock.position.set((r(2) - 0.5) * 2.6, s * 0.5 + r(3) * (i > 5 ? 0.9 : 0.2), (r(4) - 0.5) * 2.6);
    rock.rotation.set(r(5) * 3, r(6) * 3, r(7) * 3);
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
  }
  g.position.set(tw(x), 0, tw(y));
  World.scene.add(g);
  Secrets.meshes.push(g);
  Secrets.rubble.set(k, g);
}

function buildLever(l) {
  const r = l.room;
  // Рычаг на дальней стене комнаты
  const wx = r.center.x + r.d.x * 1.45, wy = r.center.y + r.d.y * 1.45;
  // Механизм из Blender: корпус с шестернёй на стене, рукоять (узел handle) откидывается вниз к себе
  const model = put('lever', tw(r.center.x) + r.d.x * (S * 1.5 - 0.22), 1.25, tw(r.center.y) + r.d.y * (S * 1.5 - 0.22), Math.atan2(-r.d.x, -r.d.y));
  if (model) {
    l.mesh = model;
    l.arm = model.getObjectByName('handle');
    l.armUp = 0.15;
    l.armDown = 2.3;
    if (l.arm) l.arm.rotation.x = l.pulled ? l.armDown : l.armUp;
    Secrets.meshes.push(model);
    l.pos = { x: tw(wx) - r.d.x * 0.5, z: tw(wy) - r.d.y * 0.5 };
    return;
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.18), new THREE.MeshStandardMaterial({ color: srgb('#3a3631'), metalness: 0.7, roughness: 0.5 })));
  const arm = new THREE.Group(), stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), new THREE.MeshStandardMaterial({ color: srgb('#8a2a1a'), metalness: 0.5, roughness: 0.5 }));
  stick.position.y = 0.3;
  arm.add(stick);
  arm.rotation.x = l.pulled ? 0.9 : -0.9;
  arm.position.z = 0.1;
  g.add(arm);
  g.position.set(tw(wx), 1.2, tw(wy));
  g.rotation.y = Math.atan2(-r.d.x, -r.d.y);
  World.scene.add(g);
  Secrets.meshes.push(g);
  l.mesh = g;
  l.arm = arm;
  l.pos = { x: tw(wx) - r.d.x * 0.5, z: tw(wy) - r.d.y * 0.5 };
}

/* ---------- действия Томаса ---------- */

// Что перед Томасом: тайная стена, завал, ловушка, знак или рычаг (до ~2.4 м)
function secretInFront(p) {
  const fx = Math.cos(p.yaw), fy = Math.sin(p.yaw), px = tw(p.x), pz = tw(p.y);
  const ahead = (t, dist = 1.2) => {
    const tx = Math.round(p.x + fx * 0.6), ty = Math.round(p.y + fy * 0.6);
    return tx === t.x && ty === t.y && Math.hypot(tw(t.x) - px, tw(t.y) - pz) < S * dist;
  };
  for (const r of Secrets.rooms) if (!r.open && ahead(r.door, 1.15)) return { kind: 'door', r };
  for (const k of Secrets.rubble.keys()) {
    const t = { x: k % SIZE, y: Math.floor(k / SIZE) };
    if (ahead(t, 1.3)) return { kind: 'rubble', t, k };
  }
  for (const s of Secrets.symbols) {
    const w = { x: s.cell.x + s.d.x, y: s.cell.y + s.d.y };
    if (Math.round(p.x) === s.cell.x && Math.round(p.y) === s.cell.y && fx * s.d.x + fy * s.d.y > 0.6) return { kind: 'symbol', s, w };
  }
  for (const l of Secrets.levers) if (!l.pulled && l.pos && Math.hypot(l.pos.x - px, l.pos.z - pz) < 1.6) return { kind: 'lever', l };
  for (const t of Secrets.traps) if (t.armed && t.seen && hasItem('knife') && Math.hypot(tw(t.x) - px, tw(t.y) - pz) < 2.2 && Math.hypot(tw(t.x) - px, tw(t.y) - pz) > 0.9) return { kind: 'trap', t };
  return null;
}

function secretPrompt(p) {
  if (Secrets.clearing) return `${Secrets.clearing.climb ? 'Перелезаю завал' : 'Разбираю завал'}… ${Math.round(Secrets.clearing.t / Secrets.clearing.need * 100)}%`;
  const s = secretInFront(p);
  if (!s) return '';
  const k = keyLabel(Settings.keys.action);
  if (s.kind === 'door') return `${k} — нажать на знак в стене`;
  if (s.kind === 'rubble') return hasItem('rope') ? `${k} — перелезть по верёвке` : hasItem('crowbar') ? `${k} — разобрать завал ломом` : `${k} — разбирать завал руками (долго)`;
  if (s.kind === 'symbol') return `${k} — осмотреть знак сектора ${ROMAN[s.s.sector - 1]}`;
  if (s.kind === 'lever') return `${k} — потянуть рычаг`;
  if (s.kind === 'trap') return `${k} — обезвредить ловушку ножом`;
  return '';
}

function secretAction(p) {
  const s = secretInFront(p);
  if (!s) return false;
  if (s.kind === 'door') openRoom(s.r);
  else if (s.kind === 'rubble') {
    const climb = hasItem('rope');
    Secrets.clearing = { k: s.k, t: 0, need: climb ? 1.5 : hasItem('crowbar') ? 1.4 : 3.2, climb, x: p.x, y: p.y };
  } else if (s.kind === 'symbol') findSymbol(s.s);
  else if (s.kind === 'lever') pullLever(s.l);
  else if (s.kind === 'trap') {
    s.t.armed = false;
    World.scene.remove(s.t.mesh);
    Sound.clank();
    giveItem('scrap');
    toast('Ловушка обезврежена. Из механизма вышел неплохой кусок металла.', 'good');
  }
  return true;
}

function openRoom(r) {
  r.open = true;
  Maze.set(r.door.x, r.door.y, T.FLOOR);
  if (r.decal) World.scene.remove(r.decal);
  Maze.reveal(r.center.x, r.center.y, 2);
  if (Sound.ctx) Sound.grind(Sound.spot({ x: tw(r.door.x), y: 3, z: tw(r.door.y) }, { ref: 8, life: 5 }), Sound.ctx.currentTime, 2.4, 0.8);
  Game.shake = Math.max(Game.shake, 0.4);
  toast(`Стена со знаком отъехала! За ней тайная комната (сектор ${r.sector}).`, 'good');
  Journal.addPlace(`Тайная комната в секторе ${r.sector}`, 'Лабиринт');
  makeNoise(r.door.x, r.door.y, 12);
}

function findSymbol(s) {
  if (s.found) { toast(`Знак сектора ${ROMAN[s.sector - 1]}: «${SYMBOL_WORDS[s.sector - 1]}». Он уже в журнале.`, 'info'); return; }
  s.found = true;
  if (s.decal) s.decal.material.emissiveIntensity = 0.6;
  toast(`Знак сектора ${ROMAN[s.sector - 1]}: под цифрой вырезано слово «${SYMBOL_WORDS[s.sector - 1]}».`, 'good');
  Journal.addPlace(`Знак сектора ${ROMAN[s.sector - 1]} — «${SYMBOL_WORDS[s.sector - 1]}»`, 'Лабиринт');
  Story.checkQuests();
}

function pullLever(l) {
  l.pulled = true;
  if (l.arm) l.arm.rotation.x = l.armDown !== undefined ? l.armDown : 0.9;
  Sound.clank();
  // Механизм открывает короткий путь: стена между двумя клетками сектора ближе всего к Глэйду
  const sec = l.room.sector;
  let best = null, bd = 1e9;
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      if (Maze.at(x, y) !== T.WALL || (x % 2) === (y % 2)) continue;
      const a = x % 2 === 0 ? [x - 1, y, x + 1, y] : [x, y - 1, x, y + 1];
      const ca = [tileToCell(a[0]), tileToCell(a[1])], cb = [tileToCell(a[2]), tileToCell(a[3])];
      if (!validCell(...ca) || !validCell(...cb) || sectorOfCell(...ca) !== sec || sectorOfCell(...cb) !== sec) continue;
      const d = Math.hypot(x - MID, y - MID);
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  if (best) Maze.set(best.x, best.y, T.FLOOR);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (sectorOfTile(x, y) === sec) Maze.explored[y * SIZE + x] = 1;
  Game.fieldKey = -1;
  toast(`Где-то загрохотал механизм: в секторе ${sec} открылся короткий проход, его карта теперь известна.`, 'good');
  Journal.addPlace(`Механизм в секторе ${sec}: короткий путь`, 'Лабиринт');
  makeNoise(l.room.center.x, l.room.center.y, 16);
}

function finishClearing() {
  const c = Secrets.clearing, x = c.k % SIZE, y = Math.floor(c.k / SIZE);
  Secrets.clearing = null;
  if (c.climb) {
    // Перелезаем на ту сторону завала
    const p = Game.player, dx = Math.sign(Math.round(x - p.x)), dy = Math.sign(Math.round(y - p.y));
    const nx = x + dx, ny = y + dy;
    if (playerPass(nx, ny)) { p.x = nx; p.y = ny; toast('Перелез через завал по верёвке.', 'good'); }
    else toast('С той стороны нет прохода.', 'warn');
    return;
  }
  removeRubble(c.k);
  toast('Завал разобран — проход свободен.', 'good');
  makeNoise(x, y, 8);
}

function removeRubble(k) {
  const g = Secrets.rubble.get(k);
  if (g) World.scene.remove(g);
  Secrets.rubble.delete(k);
  const x = k % SIZE, y = Math.floor(k / SIZE);
  Maze.set(x, y, T.FLOOR);
  emitDust(tw(x), 0, tw(y), 1.6, 8);
  Game.fieldKey = -1;
}

function addRubble(x, y) {
  const k = y * SIZE + x;
  if (Maze.at(x, y) !== T.FLOOR || Secrets.rubble.has(k)) return false;
  Maze.set(x, y, T.RUBBLE);
  buildRubble(k);
  emitDust(tw(x), 1, tw(y), 2, 10);
  emitDebris(tw(x), 8, tw(y), 1.5, 8);
  Game.fieldKey = -1;
  return true;
}

/* ---------- каждый кадр ---------- */

function updateSecrets(dt) {
  const p = Game.player, px = tw(p.x), pz = tw(p.y);
  // Разбор завала идёт, пока Томас стоит рядом
  if (Secrets.clearing) {
    const c = Secrets.clearing;
    if (Math.hypot(p.x - c.x, p.y - c.y) > 0.25) { Secrets.clearing = null; toast('Бросил разбирать завал.', 'info'); }
    else {
      c.t += dt;
      if (Math.random() < dt * 6) Sound.noise(0.08, { vol: 0.12, freq: 900, type: 'bandpass' });
      if (c.t >= c.need) finishClearing();
    }
  }
  // Ловушки: видно с огнём в руке или с разведчиком в отряде
  const light = heldLight(), scout = Squad.hasRole('scout');
  for (const t of Secrets.traps) {
    if (!t.armed) continue;
    const d = Math.hypot(tw(t.x) - px, tw(t.y) - pz);
    if (!t.seen && d < (scout ? 12 : light ? 7 : 3)) {
      t.seen = true;
      if (d > 2.5) toast(scout ? 'Разведчик: «Стой! Впереди плита-ловушка».' : 'На полу впереди — странная плита. Похоже на ловушку.', 'warn');
    }
    if (t.glow) t.glow.emissiveIntensity = t.seen ? 0.35 + Math.sin(Game.time * 4) * 0.15 : 0;
    if (d < S * 0.42 && Math.abs(p.h) < 0.5 && !Admin.fly) triggerTrap(t, p);
  }
  for (const r of Secrets.rooms) {
    if (r.decal && !r.open) r.decal.material.emissiveIntensity = Math.max(0.12, (light ? 0.9 : 0.25) - Math.hypot(tw(r.door.x) - px, tw(r.door.y) - pz) * 0.03);
  }
  // Случайные обвалы днём в Лабиринте
  if (playerTile() !== T.GLADE && Game.phase === 'day') {
    Secrets.caveT -= dt;
    if (Secrets.caveT <= 0) {
      Secrets.caveT = 45 + Math.random() * 60;
      caveIn(p);
    }
  }
}

function triggerTrap(t, p) {
  t.armed = false;
  if (t.mesh) World.scene.remove(t.mesh);
  Sound.clank();
  if (t.type === 'darts') {
    p.bleed = 30;
    p.stamina = Math.max(0, p.stamina - 40);
    for (let i = 0; i < 12; i++) FX.drops.emit({ x: tw(t.x) + (Math.random() - 0.5) * 3, y: 1.2, z: tw(t.y) + (Math.random() - 0.5) * 3, vx: rnd(-6, 6), vy: rnd(-1, 1), vz: rnd(-6, 6), life: 0.4, size: 0.04, color: [0.2, 0.2, 0.2, 1], color1: [0.2, 0.2, 0.2, 1] });
    flash('hurt');
    toast('Из стен вылетели дротики! Ты ранен и истекаешь кровью — нужен бинт.', 'danger');
  } else {
    Sound.rumble(2);
    toast('Плита щёлкнула — сверху сыплются камни! Беги!', 'danger');
    const fx = Math.sign(Math.round(Math.cos(p.yaw))), fy = Math.sign(Math.round(Math.sin(p.yaw)));
    setTimeout(() => {
      if (Game.state !== 'play') return;
      addRubble(t.x - fx * 2, t.y - fy * 2) || addRubble(t.x + fx * 2, t.y + fy * 2);
      if (Math.round(Game.player.x) === t.x && Math.round(Game.player.y) === t.y) hurtPlayer('Тебя задело камнями!');
    }, 1300);
  }
  makeNoise(t.x, t.y, 10);
}

function caveIn(p) {
  const cands = [];
  for (let dy = -9; dy <= 9; dy++) {
    for (let dx = -9; dx <= 9; dx++) {
      const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy, d = Math.hypot(dx, dy);
      if (d < 4 || d > 9 || !isCellTile(x, y) || Maze.at(x, y) !== T.FLOOR) continue;
      if (Game.items.some(it => it.x === x && it.y === y && !it.taken)) continue;
      cands.push({ x, y });
    }
  }
  if (!cands.length || Secrets.rubble.size >= 14) return;
  const c = cands[rand(cands.length)];
  Sound.rumble(2.5);
  Game.shake = Math.max(Game.shake, 0.6);
  emitDebris(tw(c.x), 18, tw(c.y), 2, 14);
  setTimeout(() => {
    if (addRubble(c.x, c.y)) toast('Где-то рядом обвал — коридор завалило камнями.', 'warn');
  }, 900);
}

// Разговор Бена: на карте отмечается одна из нераскрытых тайных комнат
function revealSecretHint() {
  const r = Secrets.rooms.find(x => !x.open && x !== Secrets.hintRoom);
  if (!r) return;
  Secrets.hintRoom = r;
  Maze.reveal(r.cell.x, r.cell.y, 2);
  Journal.addPlace(`Бен видел знак на стене в секторе ${r.sector} (отмечено на карте)`, 'Лабиринт');
}

Object.assign(Secrets, {
  generate: generateSecrets, spawnItems: spawnSecretItems, build: buildSecretMeshes, update: updateSecrets,
  prompt: secretPrompt, action: secretAction, revealHint: revealSecretHint,
  symbolsFound: () => Secrets.symbols.filter(s => s.found).length,
});
