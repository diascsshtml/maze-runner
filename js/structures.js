// Постройки Глэйда: дома с обстановкой, Башня с настилами и лестницами, мостик, костёр, кладбище,
// плантации, Кутузка, дровница, стройка, факелы, Ящик; следы жизни вокруг (телега, тачки, инструменты,
// бельё, гамак, кострища), указатели и Стена имён. Здесь же — места, где лежат предметы.

const DOOR_ROT = { E: 0, W: Math.PI, S: -Math.PI / 2, N: Math.PI / 2 };
const ITEM_SPAWNS = [];          // { type, x, y, z } — что где лежит в начале игры
const HOUSE_INFO = {};           // id → { cx, cz, y, w, d, floor }

function rectWorld(r) {
  return { x: tw((r.x0 + r.x1) / 2), z: tw((r.y0 + r.y1) / 2), w: (r.x1 - r.x0 + 1) * S, d: (r.y1 - r.y0 + 1) * S };
}

function pole(x, z, h, r = 0.13, y0 = null) {
  const y = y0 === null ? groundH(x, z) : y0;
  addCircle(x, z, r + 0.04, y - 1, y + h);
  return mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 8), GM.bark, x, y + h / 2, z);
}

/* ---------- дома ---------- */

function houseWalls(h, I) {
  const t = 0.32, y0 = I.y, y1 = I.y + 3.2;
  const x0 = I.cx - I.w / 2, x1 = I.cx + I.w / 2, z0 = I.cz - I.d / 2, z1 = I.cz + I.d / 2;
  const door = { x: tw(h.doorTile.x), z: tw(h.doorTile.y) }, half = 0.7;
  const wallX = (x, za, zb, gap) => {
    if (gap) {
      addBox(x, (za + door.z - half) / 2, t, door.z - half - za, y0, y1);
      addBox(x, (door.z + half + zb) / 2, t, zb - door.z - half, y0, y1);
    } else addBox(x, (za + zb) / 2, t, zb - za, y0, y1);
  };
  const wallZ = (z, xa, xb, gap) => {
    if (gap) {
      addBox((xa + door.x - half) / 2, z, door.x - half - xa, t, y0, y1);
      addBox((door.x + half + xb) / 2, z, xb - door.x - half, t, y0, y1);
    } else addBox((xa + xb) / 2, z, xb - xa, t, y0, y1);
  };
  wallX(x1, z0, z1, h.door === 'E');
  wallX(x0, z0, z1, h.door === 'W');
  wallZ(z1, x0, x1, h.door === 'S');
  wallZ(z0, x0, x1, h.door === 'N');
}

function lantern(x, y, z) {
  fitModel('Lantern_01', x, z, 0.3, 0, y);
  GLADE3D.lanterns.push({ x, y: y + 0.2, z });
}

function buildHouses() {
  const INSET = 0.5;
  for (const h of HOUSES) withStruct(h.id, () => {
    const R = rectWorld(h.r), y = groundH(R.x, R.z);
    const I = HOUSE_INFO[h.id] = { cx: R.x, cz: R.z, y, w: R.w - INSET * 2, d: R.d - INSET * 2, floor: y + 0.3 };
    if (!put('house_' + h.id, R.x, y, R.z, DOOR_ROT[h.door])) {
      const walls = mesh(boxGeo(I.w, 2.9, I.d), GM.woodDark, R.x, y + 1.45, R.z);
      walls.material = GM.woodDark;
      mesh(new THREE.ConeGeometry(Math.hypot(I.w, I.d) / 2 + 0.6, 2.4, 4), GM.thatch, R.x, y + 4.1, R.z).rotation.y = Math.PI / 4;
    }
    addPlatform({ x0: R.x - I.w / 2, x1: R.x + I.w / 2, z0: R.z - I.d / 2, z1: R.z + I.d / 2, h: I.floor });
    houseWalls(h, I);
    furnish(h, I);
  });
}

// Предмет мебели на полу дома: модель, препятствие (w×d после поворота) и высота
function furniture(id, x, z, I, rotY = 0, w = 0, d = 0, top = 1.2) {
  const m = put(id, x, I.floor, z, rotY);
  if (w && d) addBox(x, z, w, d, I.floor, I.floor + top);
  return m;
}

function furnish(h, I) {
  const fl = I.floor, west = I.cx - I.w / 2, east = I.cx + I.w / 2, north = I.cz - I.d / 2, south = I.cz + I.d / 2;
  // Предметы «у стены» из build_life.py стоят спиной к +Z; поворот разворачивает их лицом в комнату
  const WALL = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };
  const crate = (x, z, s, rot, y = fl) => { if (fitModel('wooden_crate_01', x, z, s, rot, y)) addBox(x, z, s, s, fl, y + s); };
  if (h.id.startsWith('bunk')) {
    for (const b of BEDS.filter(b => b.house === h.id)) {
      furniture('bed', tw(b.wx), tw(b.wy), I, b.yaw, 2.05, 0.98, 0.7);
      if (thash(b.x, b.y) < 0.6) furniture('chest', tw(b.wx) + 0.75, tw(b.wy) + (tw(b.wy) < I.cz ? 0.85 : -0.85), I, 0, 1.0, 0.56, 0.6);
      else if (thash(b.y, b.x) < 0.5) put('clothes_pile', tw(b.wx) + 1.25, fl, tw(b.wy) + (tw(b.wy) < I.cz ? 0.75 : -0.75), thash(b.x, 7) * 6);
    }
    put('rug', I.cx + 0.4, fl, I.cz, 0.05);
    furniture('stool', I.cx - 0.6, I.cz, I, 0, 0.42, 0.42, 0.5);
    put('bucket', west + 0.45, fl, I.cz + 0.4);
    lantern(I.cx, fl + 2.1, I.cz);
    ITEM_SPAWNS.push({ type: 'flask', x: I.cx - 0.6, y: fl + 0.52, z: I.cz });
  } else if (h.id === 'forge') {
    const f = LAYOUT.interior.furnace, a = LAYOUT.interior.anvil;
    const fx = west + 0.75, fz = tw(f.y);
    furniture('furnace', fx, fz, I, Math.PI / 2, 1.3, 1.7, 3);
    GLADE3D.fires.push({ x: fx + 0.45, y: fl + 0.3, z: fz, power: 0.55 });
    I.light = { x: fx + 0.8, y: fl + 1.2, z: fz };
    furniture('anvil', tw(a.x) + 0.6, tw(a.y), I, 0, 0.7, 0.6, 1.0);
    put('bucket', tw(a.x) + 1.25, fl, tw(a.y) + 0.45);                // вода — закаливать
    furniture('workbench', I.cx + 1.2, north + 0.5, I, 0, 1.6, 0.7, 1.0);
    put('tool_rack', I.cx + 1.2, fl, north + 0.03, WALL.N);
    furniture('weapon_rack', I.cx + 1.4, south - 0.55, I, 0, 1.8, 0.7, 2.0);
    furniture('barrel', east - 0.6, north + 0.6, I, 0, 0.7, 0.7, 1.0);
    furniture('barrel', west + 0.6, south - 0.6, I, 0, 0.7, 0.7, 1.0);
    ITEM_SPAWNS.push({ type: 'knife', x: I.cx + 1.0, y: fl + 0.9, z: north + 0.45 }, { type: 'spear', x: I.cx + 1.6, y: fl + 0.92, z: north + 0.5 });
    lantern(I.cx + 1.5, fl + 2.1, I.cz + 1.5);
  } else if (h.id === 'dining') {
    const hr = LAYOUT.interior.hearth, hx = west + 0.9, hz = tw(hr.y);
    furniture('hearth', hx, hz, I, 0, 1.6, 1.6, 1.6);
    GLADE3D.fires.push({ x: hx, y: fl + 0.1, z: hz, power: 0.8 });
    I.light = { x: hx + 0.4, y: fl + 1.4, z: hz };
    for (const t of LAYOUT.interior.tables) {
      const tz = tw(t.y) + (tw(t.y) < I.cz ? 0.25 : -0.25);
      furniture('table_long', tw(t.x), tz, I, 0, 3.0, 1.95, 1.0);
      put('dishes', tw(t.x) - 0.75, fl + 0.81, tz + 0.1, thash(t.x, t.y) * 0.6);
      put('dishes', tw(t.x) + 0.9, fl + 0.81, tz - 0.12, Math.PI + thash(t.y, t.x) * 0.6);
    }
    furniture('shelf', I.cx + 2.5, north + 0.35, I, 0, 2.0, 0.5, 2.0);
    put('jar_shelf', I.cx + 0.6, fl, south - 0.03, WALL.S);
    addBox(I.cx + 0.6, south - 0.2, 1.25, 0.4, fl, fl + 1.6);
    furniture('barrel', east - 0.6, north + 0.6, I, 0, 0.7, 0.7, 1.0);
    furniture('barrel', west + 0.6, north + 0.6, I, 0, 0.7, 0.7, 1.0);
    furniture('sacks', west + 0.9, south - 0.9, I, 0.4, 1.4, 1.2, 1.0);
    put('basket', west + 2.0, fl, south - 0.5, 0.7);
    put('bucket', hx + 1.1, fl, hz + 0.9);
    lantern(I.cx - 1.5, fl + 2.1, I.cz);
    lantern(I.cx + 2.5, fl + 2.1, I.cz);
    const t0 = LAYOUT.interior.tables[0];
    ITEM_SPAWNS.push({ type: 'apple', x: tw(t0.x) - 0.6, y: fl + 0.86, z: tw(t0.y) + 0.25 }, { type: 'apple', x: tw(t0.x) + 0.4, y: fl + 0.86, z: tw(t0.y) + 0.2 },
      { type: 'flask', x: tw(t0.x) + 1.1, y: fl + 0.88, z: tw(t0.y) + 0.3 }, { type: 'torch', x: east - 1.2, y: fl + 0.05, z: north + 0.4 });
  } else if (h.id === 'storage') {
    for (let i = 0; i < 3; i++) furniture('shelf', east - 0.35, north + 1.5 + i * 2.5, I, Math.PI / 2, 0.5, 2.0, 2.0);
    furniture('sacks', west + 1.0, south - 1.0, I, 0, 1.4, 1.2, 1.0);
    furniture('sacks', I.cx + 0.5, south - 1.0, I, 1.2, 1.4, 1.2, 1.0);
    furniture('chest', west + 0.8, north + 0.6, I, 0, 1.0, 0.56, 0.6);
    furniture('mapboard', I.cx, north + 0.05, I, -Math.PI / 2, 1.7, 0.2, 2.2);
    // Стол бегунов: на нём сверяют карты секторов
    if (!furniture('map_table', I.cx, I.cz - 0.6, I, 0, 2.1, 1.1, 1.0)) furniture('workbench', I.cx, I.cz - 0.6, I, 0, 1.6, 0.7, 1.0);
    put('rug', I.cx, fl, I.cz + 1.3, Math.PI / 2);
    lantern(I.cx, fl + 2.1, I.cz + 0.8);
    ITEM_SPAWNS.push({ type: 'map', x: I.cx - 0.3, y: fl + 0.9, z: I.cz - 0.6 }, { type: 'rope', x: west + 0.8, y: fl + 0.62, z: north + 0.6 });
  } else if (h.id === 'blood') {
    furniture('workbench', I.cx, north + 0.5, I, 0, 1.6, 0.7, 1.0);
    furniture('butcher_table', I.cx - 1.2, I.cz + 0.3, I, 0.1, 1.4, 0.8, 1.0);
    furniture('meat_rack', east - 1.4, I.cz + 0.2, I, Math.PI / 2, 0.9, 2.3, 2.1);
    put('bucket', I.cx - 0.2, fl, I.cz + 0.9);
    furniture('barrel', east - 0.6, south - 0.6, I, 0, 0.7, 0.7, 1.0);
    furniture('sacks', east - 1.0, north + 0.9, I, 0.8, 1.4, 1.2, 1.0);       // у дальней стены — дверь не загораживают
    lantern(I.cx, fl + 2.1, I.cz);
  } else if (h.id === 'pantry') {
    // Кладовая: всё, что приходит в Ящике, — ящики, мешки, бочки, банки с солениями
    for (let i = 0; i < 4; i++) crate(east - 0.65 - i * 0.95, north + 0.6, 0.85, thash(i, 2) * 0.3);
    crate(east - 0.65, north + 0.6, 0.8, 0.4, fl + 0.85);
    crate(east - 1.6, north + 0.62, 0.75, -0.3, fl + 0.85);
    furniture('shelf', east - 0.35, I.cz + 1.4, I, Math.PI / 2, 0.5, 2.0, 2.0);
    put('jar_shelf', west + 1.6, fl, north + 0.03, WALL.N);
    addBox(west + 1.6, north + 0.2, 1.25, 0.4, fl, fl + 1.6);
    furniture('sacks', I.cx - 0.6, south - 0.9, I, 0.3, 1.4, 1.2, 1.0);
    furniture('sacks', I.cx + 1.1, south - 0.9, I, 1.5, 1.4, 1.2, 1.0);
    for (const [dx, dz] of [[0.6, 0.6], [1.35, 0.55], [0.95, 1.25]]) furniture('barrel', west + dx, south - dz, I, 0, 0.7, 0.7, 1.0);
    put('basket', I.cx, fl, I.cz - 0.3, 0.4);
    put('basket', I.cx + 0.6, fl, I.cz + 0.2, 1.9);
    lantern(I.cx, fl + 2.1, I.cz);
    ITEM_SPAWNS.push({ type: 'ration', x: I.cx - 0.2, y: fl + 0.05, z: I.cz + 0.6 }, { type: 'apple', x: I.cx + 0.55, y: fl + 0.3, z: I.cz + 0.2 });
  } else if (h.id === 'shed') {
    // Сарай: инструменты для плантаций и стройки
    furniture('workbench', I.cx + 0.4, north + 0.5, I, 0, 1.6, 0.7, 1.0);
    put('tool_rack', I.cx + 0.4, fl, north + 0.03, WALL.N);
    put('tools_lean', east - 0.03, fl, I.cz - 0.6, WALL.E);
    addBox(east - 0.25, I.cz - 0.6, 0.45, 1.3, fl, fl + 1.5);
    furniture('wheelbarrow', I.cx + 0.3, south - 0.8, I, 0.2, 2.2, 0.9, 0.9);
    furniture('sacks', west + 0.9, north + 0.9, I, 0.6, 1.4, 1.2, 1.0);
    put('bucket', east - 0.5, fl, south - 0.5);
    put('bucket', east - 0.95, fl, south - 0.35, 1.2);
    put('basket', west + 0.6, fl, I.cz + 0.6);
    lantern(I.cx, fl + 2.1, I.cz);
    ITEM_SPAWNS.push({ type: 'rope', x: I.cx + 0.1, y: fl + 0.92, z: north + 0.45 });
  } else if (h.id === 'medhut') {
    // Лазарет медаков: койки, травы сушатся под крышей, полка со склянками
    for (let i = 0; i < 3; i++) furniture('cot', west + 0.9 + i * 1.15, north + 1.15, I, Math.PI / 2, 0.85, 2.05, 0.6);
    put('herb_rack', I.cx + 1.4, fl + 2.55, I.cz - 0.9, 0.2);
    put('herb_rack', I.cx - 1.6, fl + 2.55, south - 0.7, -0.1);
    put('jar_shelf', east - 0.03, fl, north + 1.0, WALL.E);
    addBox(east - 0.2, north + 1.0, 0.4, 1.25, fl, fl + 1.6);
    furniture('workbench', I.cx + 1.6, south - 0.55, I, 0, 1.6, 0.7, 1.0);
    put('rug', I.cx - 0.6, fl, I.cz + 0.9, 0.1);
    furniture('chest', west + 0.7, south - 0.5, I, 0, 1.0, 0.56, 0.6);
    furniture('stool', I.cx + 0.8, south - 1.2, I, 0, 0.42, 0.42, 0.5);
    put('bucket', I.cx + 2.7, fl, south - 0.4);
    lantern(I.cx, fl + 2.1, I.cz);
    ITEM_SPAWNS.push({ type: 'bandage', x: I.cx + 1.3, y: fl + 0.92, z: south - 0.6 }, { type: 'herb', x: I.cx + 1.9, y: fl + 0.92, z: south - 0.5 });
  }
}

/* ---------- следы жизни вокруг построек ---------- */

// Свободно ли место (метры): нет препятствий, построек, воды и середины тропы
function clearSpot(x, z, r, pathOk = 0.5) {
  const tx = x / S, ty = z / S;
  if (tx < GLADE_T0 - 0.2 || tx > GLADE_T1 + 0.2 || ty < GLADE_T0 - 0.2 || ty > GLADE_T1 + 0.2) return false;
  if (waterLevel(x, z) !== null || groundMask('path', x, z) > pathOk) return false;
  if (HOUSES.some(h => inRect({ x: tx, y: ty }, h.r, 0.5 + r / S))) return false;
  return COLLIDERS.every(c => c.round ? Math.hypot(x - c.x, z - c.z) > c.r + r : x < c.x0 - r || x > c.x1 + r || z < c.z0 - r || z > c.z1 + r);
}

// Предмет на земле с препятствием-кругом (r) или без; тайл закрывается для жителей, если block
function prop(id, tx, ty, rot = 0, r = 0, block = false) {
  const x = tw(MID + tx), z = tw(MID + ty), m = put(id, x, groundH(x, z), z, rot);
  if (m && r) addCircle(x, z, r);
  if (m && block) blockTile({ x: Math.round(MID + tx), y: Math.round(MID + ty) });
  return m;
}

function buildLife() {
  const P = LAYOUT.plantations, fenceZ = tw(P.y1) + S / 2 - 0.8 + 0.5;
  // Телега с мешками у кладовой
  withStruct('pantry', () => {
    const cx = tw(MID + 6.8), cz = tw(MID - 1.0);
    if (put('cart', cx, groundH(cx, cz), cz, 0)) { addBox(cx + 0.75, cz, 3.6, 1.5, -50, groundH(cx, cz) + 1.1); blockTile({ x: MID + 7, y: MID - 1 }); }
  });
  // Огород: тачка у калитки, инструменты у изгороди, корзины с урожаем
  withStruct('plantations', () => {
    prop('wheelbarrow', 4.1, -4.75, -1.2, 0.6);
    for (const x of [6.4, 9.6]) {
      const X = tw(MID + x);
      put('tools_lean', X, groundH(X, fenceZ - 0.15), fenceZ - 0.15, Math.PI);
    }
    prop('tools_ground', 8.6, -6.25, 0.4);
    prop('basket', 4.45, -3.1, 0.3, 0.3);
    prop('basket', 7.6, -4.6, 2.2, 0.3);
  });
  withStruct('shed', () => {
    const shedI = HOUSE_INFO.shed;
    if (!shedI) return;
    const X = shedI.cx - shedI.w / 2 - 0.04, Z = shedI.cz - 1.6;
    if (put('tools_lean', X, groundH(X, Z), Z, -Math.PI / 2)) addBox(X - 0.25, Z, 0.5, 1.3);
    put('item_rope', X - 0.5, groundH(X - 0.5, Z + 1.6) + 0.02, Z + 1.6, 0.4);
  });
  // Вёдра там, где носят воду
  withStruct('pen', () => prop('bucket', 9.25, 4.55, 0, 0.22));
  withStruct('forge', () => prop('bucket', -6.7, -10.55, 2.0, 0.22));
  // Столовая: котёл над огнём на улице, вёдра и корзина у двери
  withStruct('dining', () => {
    prop('bucket', -6.55, -3.62, 1.1, 0.22);
    prop('basket', -6.45, -2.42, 1.0, 0.3);
    const kx = tw(MID - 8.4), kz = tw(MID - 1.0), ky = groundH(kx, kz);
    if (put('cauldron', kx, ky, kz, 0.3)) {
      addCircle(kx, kz, 0.75);
      GLADE3D.fires.push({ x: kx, y: ky + 0.12, z: kz, power: 0.4 });
      blockTile({ x: MID - 8, y: MID - 1 });
    }
    prop('bucket', -7.9, -0.55, 0.5, 0.22);
  });
  // Бельё сушится в проулке между спальней и столовой
  withStruct('bunk1', () => {
    const lx = tw(MID - 9.7), lz = tw(MID - 5.0);
    if (put('laundry_line', lx, groundH(lx, lz), lz, 0)) for (const s of [-1, 1]) addCircle(lx + s * 2.23, lz, 0.1);
  });
  // Кострище с брёвнами-скамейками на северном пригорке: тут сидят вечерами строители
  withStruct('life_north', () => {
    if (prop('firepit_small', -3.4, -8.2, 0.2, 0.7, true)) {
      prop('bench_simple', -3.4, -7.55, 0, 0.3);
      prop('bench_simple', -2.75, -8.35, Math.PI / 2, 0.3);
    }
  });
  // Скамьи у лазарета, у спален и у кладбища
  withStruct('medhut', () => prop('bench_simple', -7.65, 2.75, Math.PI / 2, 0.3));
  withStruct('bunk2', () => prop('bench_simple', -6.62, -7.2, Math.PI / 2, 0.3));
  withStruct('graveyard', () => prop('bench_simple', -6.35, 3.4, Math.PI / 2, 0.3));
  // Тачка и щепа у колоды
  withStruct('woodpile', () => {
    prop('wheelbarrow', -1.3, 2.55, 0.35, 0.6);
    const chips = [], c = LAYOUT.chopBlock;
    for (let i = 0; i < 70; i++) {
      const a = thash(i, 61) * 6.28, d = 0.5 + thash(i, 62) * 1.6, x = tw(c.x) + Math.cos(a) * d, z = tw(c.y) + Math.sin(a) * d;
      chips.push({ x, z, a: thash(i, 63) * 6.28, s: 0.5 + thash(i, 64) });
    }
    const chip = new THREE.InstancedMesh(boxGeo(0.12, 0.015, 0.05, 1), GM.wood, chips.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    chips.forEach((p, i) => chip.setMatrixAt(i, m4.compose(v.set(p.x, groundH(p.x, p.z) + 0.01, p.z), q.setFromEuler(e.set(0, p.a, 0.1)), sc.setScalar(p.s))));
    chip.receiveShadow = true;
    World.scene.add(chip);
  });
  // Гамак, сброшенная одежда и холодное кострище на поляне в лесу; брошенная фляга у брода
  withStruct('life_forest', () => {
    for (let i = 0; i < 300; i++) {
      const tx = -10 + thash(i, 71) * 20, ty = 2.6 + thash(i, 72) * 6, rot = thash(i, 73) * Math.PI, x = tw(MID + tx), z = tw(MID + ty);
      const ax = Math.cos(rot) * 1.95, az = -Math.sin(rot) * 1.95;
      if (!clearSpot(x, z, 1.4, 0.15) || !clearSpot(x + ax, z + az, 0.5, 0.15) || !clearSpot(x - ax, z - az, 0.5, 0.15)) continue;
      if (Math.abs(groundH(x + ax, z + az) - groundH(x - ax, z - az)) > 0.35) continue;
      if (put('hammock', x, groundH(x, z), z, rot)) {
        addCircle(x + ax, z + az, 0.14);
        addCircle(x - ax, z - az, 0.14);
        const px = x - Math.sin(rot) * 1.3, pz = z - Math.cos(rot) * 1.3;
        put('clothes_pile', px, groundH(px, pz), pz, rot + 0.5);
        put('item_bag', px + 0.6, groundH(px + 0.6, pz) + 0.02, pz + 0.2, 1.3);
        const fx = x + Math.sin(rot) * 2.4, fz = z + Math.cos(rot) * 2.4;
        if (clearSpot(fx, fz, 0.8, 0.3)) { put('firepit_small', fx, groundH(fx, fz), fz, 0.6); addCircle(fx, fz, 0.7); }
        LAYOUT.hammock = { x: x / S, y: z / S };
      }
      break;
    }
    const fx = tw(MID - 7.7), fz = tw(MID + 9.0);
    put('item_flask', fx, groundH(fx, fz) + 0.05, fz, 1.2);
    prop('bucket', -7.65, 9.15, 0.4, 0.22);
  });
  withStruct('signs', buildSigns);
  withStruct('rainbarrel', () => prop('rain_barrel', 5.3, -0.95, 0.3, 0.45, true));
  // Частокол и сторожевые огни — по обе стороны каждых ворот, со стороны Глэйда
  for (const g of GATES) {
    const ox = Math.sign(MID - g.x), oy = Math.sign(MID - g.y);          // внутрь Глэйда
    const ix = g.x + ox * 1.15, iy = g.y + oy * 1.15, sx = -oy, sy = ox;  // сбоку от проёма
    for (const side of [-1, 1]) {
      const x = tw(ix + sx * side * 1.3), z = tw(iy + sy * side * 1.3), rot = Math.atan2(-ox, -oy);
      withStruct('palisade', () => { if (put('palisade', x, groundH(x, z), z, rot)) addBox(x, z, Math.abs(sx) * 3.4 + 0.5, Math.abs(sy) * 3.4 + 0.5); });
      const fx = tw(ix + sx * side * 0.75 + ox * 0.4), fz = tw(iy + sy * side * 0.75 + oy * 0.4);
      withStruct('watchfires', () => {
        if (!put('torch_post', fx, groundH(fx, fz), fz, 0)) return;
        addCircle(fx, fz, 0.16);
        GLADE3D.torches.push({ x: fx, y: groundH(fx, fz) + 2.85, z: fz, power: 0.5 });
      });
    }
  }
  buildNameWall();
}

// Надпись на доске указателя: углём по дереву
function signTexture(text) {
  const c = makeCanvas(512, 96), g = c.getContext('2d');
  g.clearRect(0, 0, 512, 96);
  g.font = '600 64px Caveat, "Segoe Print", cursive';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(28, 20, 14, 0.88)';
  g.fillText(text, 26, 50, 400);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}

function buildSigns() {
  if (!hasModel('sign_post')) return;
  const geo = new THREE.PlaneGeometry(0.88, 0.165);
  for (const s of LAYOUT.signs) {
    const x = tw(MID + s.at[0]), z = tw(MID + s.at[1]), y = groundH(x, z);
    put('sign_post', x, y, z, 0);
    addCircle(x, z, 0.12);
    blockTile({ x: Math.round(MID + s.at[0]), y: Math.round(MID + s.at[1]) });
    s.to.forEach(([text, tx, ty], i) => {
      const rot = -Math.atan2(tw(MID + ty) - z, tw(MID + tx) - x), h = y + 1.95 - i * 0.27;
      const board = put('sign_board', x, h, z, rot);
      if (!board) return;
      const mat = new THREE.MeshStandardMaterial({ map: signTexture(text), transparent: true, alphaTest: 0.2, roughness: 0.9, depthWrite: false });
      for (const side of [1, -1]) {
        const label = new THREE.Mesh(geo, mat);
        label.position.set(0.55, 0, side * 0.0215);
        if (side < 0) label.rotation.y = Math.PI;
        board.add(label);
      }
    });
  }
}

// Стена имён: глэйдеры вырезают свои имена на стене Лабиринта; имена погибших зачёркнуты.
// В поселении на стене только те, кто уже пришёл (Томас — со второго дня)
const OLD_NAMES = ['ДЖОРДЖ', 'ГЭВИН', 'ТИМ', 'МАРК', 'ПИТЕР', 'ЛУКАС', 'СЭМ', 'ДЖОН', 'РАЙАН', 'ТОББИ', 'КАЙЛ', 'ДЕННИС', 'ЭЙДАН', 'МАЙК', 'ОЛЛИ', 'РОБ', 'ГАРРИ', 'ЭНДИ', 'КЕВИН', 'ФРЭНК'];
const DEAD_NAMES = new Set(['НИК', 'ДЖОРДЖ', 'ГЭВИН', 'ТИМ', 'МАРК', 'ЛУКАС', 'КАЙЛ', 'ОЛЛИ', 'ГАРРИ', 'ФРЭНК']);

function buildNameWall() {
  const c = makeCanvas(2048, 880), tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 });
  const face = tw(GLADE_T0) - S / 2 + 0.04, z = tw(MID + 3.6);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.1), mat);
  wall.position.set(face, groundH(face + 0.5, z) + 2.0, z);
  wall.rotation.y = Math.PI / 2;
  wall.receiveShadow = true;
  World.scene.add(wall);
  LAYOUT.nameWall = { x: GLADE_T0 - 0.4, y: MID + 3.6 };
  GLADE3D.nameWall = { c, tex, key: '' };
  refreshNameWall();
}

function refreshNameWall() {
  const NW = GLADE3D.nameWall;
  if (!NW) return;
  const names = !Settle.on ? [...NPC_DATA.map(d => d.name.toUpperCase()), ...OLD_NAMES]
    : [...(Game.day >= 2 ? ['ТОМАС'] : []), ...(Game.npcs || []).map(n => n.name.toUpperCase())];
  const key = names.join(',');
  if (key === NW.key) return;
  NW.key = key;
  const W = 2048, H = 880, g = NW.c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.textBaseline = 'middle';
  let x = 60, y = 70, i = 0;
  for (const n of names) {
    const size = 52 + Math.floor(thash(i, 81) * 30);
    g.font = `700 ${size}px Tektur, "Arial Narrow", sans-serif`;
    const w = g.measureText(n).width;
    if (x + w > W - 40) { x = 50 + thash(i, 82) * 80; y += 118; }
    if (y > H - 50) break;
    const yy = y + (thash(i, 83) - 0.5) * 26;
    g.save();
    g.translate(x, yy);
    g.rotate((thash(i, 84) - 0.5) * 0.09);
    // Вырезано: тёмная бороздка и светлый скол по нижнему краю
    g.fillStyle = 'rgba(235, 230, 215, 0.35)';
    g.fillText(n, 3, 3);
    g.fillStyle = 'rgba(22, 20, 17, 0.82)';
    g.fillText(n, 0, 0);
    if (!Settle.on && DEAD_NAMES.has(n)) {
      g.strokeStyle = 'rgba(22, 20, 17, 0.85)';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(-8, 4);
      g.lineTo(w + 8, -6);
      g.stroke();
    }
    g.restore();
    x += w + 60 + thash(i, 85) * 70;
    i++;
  }
  NW.tex.needsUpdate = true;
}

/* ---------- Башня-дерево: настилы, перила, лестницы ---------- */

function buildTower() {
  const T = LAYOUT.tower, spec = LAYOUT.towerSpec, tx = tw(T.x), tz = tw(T.y), ty = groundH(tx, tz);
  const decks = spec.decks, tr = spec.trunkR;
  if (!put('tower', tx, ty, tz)) {
    mesh(new THREE.CylinderGeometry(tr * 0.5, tr * 1.1, 18, 12).translate(0, 9, 0), GM.bark, tx, ty, tz);
    for (const d of decks) mesh(new THREE.CylinderGeometry(d.r, d.r, 0.12, 24), GM.wood, tx, ty + d.h - 0.06, tz);
  }
  // Ствол по ярусам и опоры нижнего настила
  addCircle(tx, tz, tr * 1.05, ty - 1, ty + decks[0].h);
  decks.forEach((d, i) => addCircle(tx, tz, tr * (1.0 - 0.03 * d.h) + 0.05, ty + d.h, ty + (decks[i + 1] ? decks[i + 1].h : 20)));
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + 0.35;
    addCircle(tx + Math.cos(a) * (decks[0].r - 0.1), tz + Math.sin(a) * (decks[0].r - 0.1), 0.15, ty - 1, ty + decks[0].h - 0.2);
  }
  const tops = {};
  for (const L of spec.ladders) tops[L.to] = L.angle;
  decks.forEach((d, i) => {
    addPlatform({ round: true, x: tx, z: tz, r: d.r, r0: tr * (1.0 - 0.03 * d.h), h: ty + d.h });
    // Перила по краю, кроме прохода у лестницы
    const n = Math.ceil(d.r * Math.PI * 2 / 0.32);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      if (tops[i] !== undefined && Math.abs(((a - tops[i] + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.32) continue;
      addCircle(tx + Math.cos(a) * (d.r - 0.08), tz + Math.sin(a) * (d.r - 0.08), 0.1, ty + d.h + 0.05, ty + d.h + 1.15);
    }
  });
  for (const L of spec.ladders) {
    const a = L.angle, R = decks[L.to].r + 0.15;
    addLadder({
      x: tx + Math.cos(a) * (R + 0.42), z: tz + Math.sin(a) * (R + 0.42), yaw: a + Math.PI,
      h0: ty + (L.from < 0 ? 0 : decks[L.from].h), h1: ty + decks[L.to].h,
      tx: tx + Math.cos(a) * (R - 0.85), tz: tz + Math.sin(a) * (R - 0.85),
    });
  }
  ITEM_SPAWNS.push({ type: 'spear', x: tx + Math.cos(1.2) * 4.6, y: groundH(tx + Math.cos(1.2) * 4.6, tz + Math.sin(1.2) * 4.6) + 0.05, z: tz + Math.sin(1.2) * 4.6 });
  ITEM_SPAWNS.push({ type: 'map', x: tx + Math.cos(2.4) * 1.6, y: ty + decks[2].h + 0.04, z: tz + Math.sin(2.4) * 1.6 });
}

/* ---------- мостик, костёр, кладбище, плантации и прочее ---------- */

function buildBridge() {
  const b = LAYOUT.bridge, bx = tw(b.x), bz = tw(b.y);
  const bank = Math.max(groundH(bx, bz - 2.8), groundH(bx, bz + 2.8));
  const y = bank - 0.32, top = y + 0.47;
  if (!put('bridge', bx, y, bz, Math.PI / 2)) mesh(boxGeo(1.7, 0.1, 5.6), GM.wood, bx, top - 0.05, bz);
  addPlatform({ x0: bx - 0.85, x1: bx + 0.85, z0: bz - 2.9, z1: bz + 2.9, h: top });
  for (const s of [-1, 1]) addBox(bx + s * 0.82, bz, 0.12, 5.2, top + 0.05, top + 1.3);
}

function buildCampfire() {
  const c = LAYOUT.campfire, x = tw(c.x), z = tw(c.y), y = groundH(x, z);
  fitModel('stone_fire_pit', x, z, 2.3);
  put('campfire_logs', x, y + 0.04, z, 0.4);
  // Два круга брёвен-скамеек: ближний (4.2 м) и дальний (6.6 м)
  const benches = [];
  for (let i = 0; i < 7; i++) benches.push([(i / 7) * 6.28 + 0.3, 4.2]);
  for (let i = 0; i < 11; i++) benches.push([(i / 11) * 6.28, 6.6]);
  const seats = benches.map(([a, rad]) => {
    const bx = x + Math.cos(a) * rad, bz = z + Math.sin(a) * rad;
    for (const k of [-0.8, 0, 0.8]) addCircle(bx - Math.sin(a) * k, bz + Math.cos(a) * k, 0.26, -50, groundH(bx, bz) + 0.45);
    return { x: bx, y: groundH(bx, bz), z: bz, rot: -a - Math.PI / 2, a };
  });
  // Скамьи — расколотые брёвна на чурбаках (Blender) вдоль окружности, иначе — цельные брёвна
  if (!instanceModel('bench_log', seats).length) {
    for (const s of seats) {
      const bench = mesh(new THREE.CylinderGeometry(0.22, 0.24, 2.4, 10), GM.bark, s.x, s.y + 0.2, s.z);
      bench.rotation.order = 'YXZ';
      bench.rotation.set(Math.PI / 2, -s.a, 0);
    }
  }
  GLADE3D.fires.push({ x, y: y + 0.25, z, power: 1.9 });
  addCircle(x, z, 1.15);
  ITEM_SPAWNS.push({ type: 'torch', x: x + 1.6, y: y + 0.05, z: z + 0.6 });
}

function buildGraveyard() {
  const R = rectWorld(LAYOUT.graveyard), w = R.w - 1, d = R.d - 1;
  for (let i = 0; i < 6; i++) {
    const x = R.x - w / 2 + 1.2 + (i % 3) * (w - 2.4) / 2, z = R.z - d / 4 + Math.floor(i / 3) * d / 2;
    if (!put('grave', x, groundH(x, z), z, thash(i, 1) * 0.3 - 0.15)) mesh(boxGeo(0.08, 1.1, 0.08, 1), GM.woodDark, x, groundH(x, z) + 0.55, z);
  }
  const post = new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6);
  for (let i = 0; i <= 8; i++) {
    for (const s of [-1, 1]) {
      for (const [x, z] of [[R.x - w / 2 + i * w / 8, R.z + s * d / 2], [R.x + s * w / 2, R.z - d / 2 + i * d / 8]]) {
        mesh(post, GM.bark, x, groundH(x, z) + 0.45, z);
        addCircle(x, z, 0.08);
      }
    }
  }
}

// Изгородь от точки a до точки b: секции по ~2 м (Blender, копятся в out и ставятся разом), иначе — столбы и жерди
function fenceRun(ax, az, bx, bz, y, out) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2)), rot = -Math.atan2(bz - az, bx - ax);
  if (hasModel('fence')) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      out.push({ x: ax + (bx - ax) * t, y, z: az + (bz - az) * t, rot, sx: len / n / 2 });
    }
    return;
  }
  const post = new THREE.CylinderGeometry(0.06, 0.07, 1.2, 6);
  for (let i = 0; i <= n; i++) mesh(post, GM.bark, ax + (bx - ax) * i / n, y + 0.6, az + (bz - az) * i / n);
  for (const h of [0.45, 0.95]) mesh(boxGeo(len, 0.07, 0.07, 1), GM.wood, (ax + bx) / 2, y + h, (az + bz) / 2).rotation.y = rot;
}

function buildPlantations() {
  const fences = [];
  const P = LAYOUT.plantations, x0 = tw(P.x0) - S / 2 + 0.8, x1 = tw(P.x1) + S / 2 - 0.8, z0 = tw(P.y0) - S / 2 + 0.8, z1 = tw(P.y1) + S / 2 - 0.8;
  const gy = groundH((x0 + x1) / 2, (z0 + z1) / 2);
  const rows = 12, crops = { crop_corn: [], crop_tomato: [], crop_pumpkin: [] };
  for (let r = 0; r < rows; r++) {
    const z = z0 + (r + 0.5) * (z1 - z0) / rows;
    const ridge = mesh(new THREE.CylinderGeometry(0.35, 0.45, x1 - x0, 8, 1), GM.soil, (x0 + x1) / 2, gy - 0.15, z, null, false);
    ridge.rotation.z = Math.PI / 2;
    ridge.scale.set(1, 1, 0.6);
    // Ряды: две полосы кукурузы, томаты на кольях, тыквы
    const id = ['crop_corn', 'crop_corn', 'crop_tomato', 'crop_pumpkin'][r % 4];
    const step = { crop_corn: 0.75, crop_tomato: 1.0, crop_pumpkin: 1.3 }[id];
    for (let x = x0 + 0.4; x < x1 - 0.3; x += step) {
      const h = thash(Math.round(x * 10), r);
      crops[id].push({ x: x + (h - 0.5) * 0.2, y: gy + 0.08, z: z + (thash(r, Math.round(x * 10)) - 0.5) * 0.12, rot: h * 6.28, sy: 0.8 + h * 0.35 });
    }
  }
  const real = Object.entries(crops).map(([id, list]) => instanceModel(id, list).length).every(n => n > 0);
  if (!real) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
    const tall = [...crops.crop_corn, ...crops.crop_tomato], low = crops.crop_pumpkin;
    const stalk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.04, 1.8, 5).translate(0, 0.9, 0), GM.crop, tall.length);
    const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 1).scale(1, 0.65, 1), GM.crop, low.length);
    tall.forEach((p, i) => stalk.setMatrixAt(i, m4.compose(v3.set(p.x, gy, p.z), q.identity(), sc.set(1, p.sy, 1))));
    low.forEach((p, i) => bush.setMatrixAt(i, m4.compose(v3.set(p.x, gy + 0.12, p.z), q.identity(), sc.setScalar(p.sy))));
    for (const m of [stalk, bush]) { m.castShadow = m.receiveShadow = true; World.scene.add(m); }
  }
  const sx = (x0 + x1) / 2, sz = (z0 + z1) / 2;
  if (put('scarecrow', sx, gy, sz, 0.4)) addCircle(sx, sz, 0.12);
  else {
    pole(sx, sz, 2.6, 0.06);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), GM.bark, sx, gy + 2.0, sz).rotation.z = Math.PI / 2;
    mesh(boxGeo(0.5, 0.7, 0.3, 1), GM.cloth, sx, gy + 1.75, sz);
    mesh(new THREE.SphereGeometry(0.2, 10, 8), GM.cloth, sx, gy + 2.45, sz);
  }
  const run = (ax, az, bx, bz) => {
    addBox((ax + bx) / 2, (az + bz) / 2, Math.abs(bx - ax) + 0.14, Math.abs(bz - az) + 0.14);
    fenceRun(ax, az, bx, bz, gy, fences);
  };
  const fx0 = x0 - 0.5, fx1 = x1 + 0.5, fz0 = z0 - 0.5, fz1 = z1 + 0.5;
  run(fx0, fz0, fx1, fz0);
  run(fx1, fz0, fx1, fz1);
  run(fx0 + 2.5, fz1, fx1, fz1);
  run(fx0, fz0, fx0, fz1);
  ITEM_SPAWNS.push({ type: 'apple', x: fx0 + 1.2, y: gy + 0.05, z: fz1 + 0.6 }, { type: 'apple', x: fx0 + 1.6, y: gy + 0.05, z: fz1 + 0.9 });
  instanceModel('fence', fences);
}

function buildSmallThings() {
  withStruct('slammer', buildSlammer);
  withStruct('woodpile', buildWoodpile);
  withStruct('scaffold', buildScaffold);
  buildBox();
  withStruct('torches', buildTorches);
  withStruct('pen', buildPen);
}

function buildSlammer() {
  // Кутузка: яма с решёткой из брёвен
  const s = LAYOUT.slammer, sx = tw(s.x), sz = tw(s.y), sy = groundH(sx, sz);
  mesh(new THREE.PlaneGeometry(2.6, 2.6), GM.hole, sx, sy + 0.02, sz, null, false).rotation.x = -Math.PI / 2;
  if (!put('slammer', sx, sy, sz)) {
    for (let i = -2; i <= 2; i++) {
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), GM.bark, sx + i * 0.6, sy + 0.1, sz).rotation.x = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), GM.bark, sx, sy + 0.17, sz + i * 0.6).rotation.z = Math.PI / 2;
    }
  }
}

function buildWoodpile() {
  // Колода с воткнутым топором и дровница под навесом
  const c = LAYOUT.chopBlock, w = LAYOUT.woodpile, cx = tw(c.x), cz = tw(c.y), cy = groundH(cx, cz);
  const stump = fitModel('tree_stump_01', cx, cz, 1.1) || mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.7, 14), GM.bark, cx, cy + 0.35, cz);
  addCircle(cx, cz, 0.55);
  const top = new THREE.Box3().setFromObject(stump).max.y;
  const axe = new THREE.Group();
  axe.position.set(cx + 0.05, top - 0.04, cz);
  axe.rotation.y = 0.6;
  World.scene.add(axe);
  // Лезвие уходит в дерево, топорище торчит вверх под углом ~50°
  const tilt = Math.PI + 0.85, edge = new THREE.Vector3(0.17, 0.63, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
  const blade = put('tool_axe', -edge.x, -edge.y, 0);
  if (blade) {
    axe.add(blade);
    blade.rotation.z = tilt;
  } else {
    axe.position.y = cy + 0.75;
    axe.rotation.set(0.5, 0.6, 0);
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), GM.wood, 0, 0.35, 0, axe);
    mesh(new THREE.BoxGeometry(0.16, 0.12, 0.025), MAT.steel, 0.05, 0, 0, axe);
  }
  const wx = tw(w.x), wz = tw(w.y), wy = groundH(wx, wz);
  if (put('woodpile', wx, wy, wz)) addBox(wx, wz, 2.45, 2.45);
  else {
    const log = new THREE.CylinderGeometry(0.17, 0.17, 2.6, 10);
    for (let layer = 0; layer < 4; layer++) {
      for (let i = 0; i < 6 - layer; i++) mesh(log, GM.bark, wx + (i - (5 - layer) / 2) * 0.36, wy + 0.17 + layer * 0.31, wz).rotation.x = Math.PI / 2;
    }
    addBox(wx, wz, 2.3, 2.7);
  }
}

function buildScaffold() {
  // Стройка Галли: леса из жердей, настил, приставная лестница и недостроенная стена (с юга)
  const b = LAYOUT.scaffold, bx = tw(b.x), bz = tw(b.y), by = groundH(bx, bz);
  if (put('scaffold', bx, by, bz, Math.PI)) {
    for (const dz of [-0.6, 0.6]) for (const dx of [-1.4, 1.4]) addCircle(bx + dx, bz + dz, 0.12);
  } else {
    for (const dz of [-0.6, 0.6]) for (const dx of [-1.4, 1.4]) pole(bx + dx, bz + dz, 4.5, 0.08);
    mesh(boxGeo(3.2, 0.08, 1.4), GM.wood, bx, by + 2.4, bz);
    mesh(boxGeo(3, 2.6, 0.2), GM.wood, bx, by + 1.3, bz + 0.7);
  }
  addBox(bx, bz + 0.7, 3, 0.26);
}

function buildBox() {
  // Ящик: стальная рама и решётчатые створки над тёмной шахтой
  const x = tw(MID), z = tw(MID);
  GLADE3D.boxHole = mesh(new THREE.PlaneGeometry(3, 3), GM.hole, x, 0.035, z, null, false);
  GLADE3D.boxHole.rotation.x = -Math.PI / 2;
  GLADE3D.box = put('box_lift', x, 0, z);
  if (GLADE3D.box) hingeBoxDoors(GLADE3D.box, x, z);
  if (!GLADE3D.box) {
    const cv = makeCanvas(256, 256), g = cv.getContext('2d');
    g.strokeStyle = '#fff';
    g.lineWidth = 12;
    for (let i = 0; i <= 256; i += 42) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
    }
    const grate = new THREE.MeshStandardMaterial({ color: 0x4f4a44, alphaMap: new THREE.CanvasTexture(cv), alphaTest: 0.5, metalness: 0.6, roughness: 0.65, envMapIntensity: 0.5, side: THREE.DoubleSide });
    for (const sd of [-1, 1]) mesh(new THREE.PlaneGeometry(1.45, 2.9), grate, x + sd * 0.74, 0.08, z).rotation.x = -Math.PI / 2;
    for (const [dx, dz, ww, dd] of [[0, -1.55, 3.3, 0.22], [0, 1.55, 3.3, 0.22], [-1.55, 0, 0.22, 3.3], [1.55, 0, 0.22, 3.3]]) mesh(new THREE.BoxGeometry(ww, 0.22, dd), MAT.steel, x + dx, 0.1, z + dz);
  }
  // Сумка — у края Ящика, где выбирается Томас (не на створках: открытые, они уходят из-под неё)
  ITEM_SPAWNS.push({ type: 'bag', x: x + 1.2, y: groundH(x + 1.2, z + 2.3) + 0.12, z: z + 2.3 });
}

function buildTorches() {
  // Факелы: бревно с железной корзиной для углей наверху
  for (const t of LAYOUT.torches) {
    const tx = tw(t.x), tz = tw(t.y), ty = groundH(tx, tz);
    if (!put('torch_post', tx, ty, tz, thash(t.x, t.y) * 6.28)) {
      mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 6), GM.bark, tx, ty + 1.3, tz);
      mesh(new THREE.CylinderGeometry(0.2, 0.08, 0.3, 8), MAT.darkSteel, tx, ty + 2.7, tz);
    }
    addCircle(tx, tz, 0.16);
    GLADE3D.torches.push({ x: tx, y: ty + 2.85, z: tz, power: 0.45 });
  }
}

function buildPen() {
  // Загон живодерни: изгородь, сено и кормушка
  const fences = [];
  const P = rectWorld(LAYOUT.pen), pw = P.w - 0.8, pd = P.d - 0.8, py = groundH(P.x, P.z);
  const px0 = P.x - pw / 2, px1 = P.x + pw / 2, pz0 = P.z - pd / 2, pz1 = P.z + pd / 2;
  fenceRun(px0, pz0, px1, pz0, py, fences);
  fenceRun(px1, pz0, px1, pz1, py, fences);
  fenceRun(px1, pz1, px0, pz1, py, fences);
  fenceRun(px0, pz1, px0, pz0, py, fences);
  instanceModel('fence', fences);
  for (const sd of [-1, 1]) {
    addBox(P.x, P.z + sd * pd / 2, pw + 0.16, 0.16);
    addBox(P.x + sd * pw / 2, P.z, 0.16, pd + 0.16);
  }
  if (hasModel('hay_bale')) {
    for (const [dx, dy, dz, r] of [[-0.6, 0, -1.6, 0.1], [0.45, 0, -1.55, -0.15], [-0.1, 0.45, -1.6, 0.05], [-0.4, 0, 1.4, 1.5]]) put('hay_bale', P.x + dx, py + dy, P.z + dz, r);
    put('trough', P.x + pw / 2 - 0.5, py, P.z + 0.3, Math.PI / 2);
  } else {
    const hay = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 14);
    [[-0.6, -1.5], [0.2, -1.6], [-0.4, 1.4]].forEach(([dx, dz]) => mesh(hay, GM.thatch, P.x + dx, py + 0.55, P.z + dz).rotation.z = Math.PI / 2);
  }
}

// Каждая постройка — своя группа (withStruct): в новой игре Глэйд пустой, и постройки появляются по мере стройки
function buildStructures() {
  buildHouses();
  buildTower();
  withStruct('bridge', buildBridge);
  withStruct('campfire', buildCampfire);
  withStruct('graveyard', buildGraveyard);
  withStruct('plantations', buildPlantations);
  buildSmallThings();
  buildLife();
}
