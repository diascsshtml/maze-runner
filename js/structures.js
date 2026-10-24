// Постройки Глэйда: дома с обстановкой, Башня с настилами и лестницами, мостик, костёр, кладбище,
// плантации, Кутузка, дровница, стройка, факелы, Ящик. Здесь же — места, где лежат предметы.

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
  for (const h of HOUSES) {
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
  }
}

// Предмет мебели на полу дома: модель, препятствие (w×d после поворота) и высота
function furniture(id, x, z, I, rotY = 0, w = 0, d = 0, top = 1.2) {
  const m = put(id, x, I.floor, z, rotY);
  if (w && d) addBox(x, z, w, d, I.floor, I.floor + top);
  return m;
}

function furnish(h, I) {
  const fl = I.floor, west = I.cx - I.w / 2, east = I.cx + I.w / 2, north = I.cz - I.d / 2, south = I.cz + I.d / 2;
  if (h.id.startsWith('bunk')) {
    for (const b of BEDS.filter(b => b.house === h.id)) {
      furniture('bed', tw(b.wx), tw(b.wy), I, b.yaw, 2.05, 0.98, 0.7);
      if (thash(b.x, b.y) < 0.6) furniture('chest', tw(b.wx) + 0.75, tw(b.wy) + (tw(b.wy) < I.cz ? 0.85 : -0.85), I, 0, 1.0, 0.56, 0.6);
    }
    furniture('stool', I.cx - 0.6, I.cz, I, 0, 0.42, 0.42, 0.5);
    lantern(I.cx, fl + 2.1, I.cz);
    ITEM_SPAWNS.push({ type: 'flask', x: I.cx - 0.6, y: fl + 0.52, z: I.cz });
  } else if (h.id === 'forge') {
    const f = LAYOUT.interior.furnace, a = LAYOUT.interior.anvil;
    const fx = west + 0.75, fz = tw(f.y);
    furniture('furnace', fx, fz, I, Math.PI / 2, 1.3, 1.7, 3);
    GLADE3D.fires.push({ x: fx + 0.45, y: fl + 0.3, z: fz, power: 0.55 });
    I.light = { x: fx + 0.8, y: fl + 1.2, z: fz };
    furniture('anvil', tw(a.x) + 0.6, tw(a.y), I, 0, 0.7, 0.6, 1.0);
    furniture('workbench', I.cx + 1.2, north + 0.5, I, 0, 1.6, 0.7, 1.0);
    furniture('barrel', east - 0.6, north + 0.6, I, 0, 0.7, 0.7, 1.0);
    furniture('barrel', west + 0.6, south - 0.6, I, 0, 0.7, 0.7, 1.0);
    ITEM_SPAWNS.push({ type: 'knife', x: I.cx + 1.0, y: fl + 0.9, z: north + 0.45 }, { type: 'spear', x: I.cx + 1.6, y: fl + 0.92, z: north + 0.5 });
    lantern(I.cx + 1.5, fl + 2.1, I.cz + 1.5);
  } else if (h.id === 'dining') {
    const hr = LAYOUT.interior.hearth, hx = west + 0.9, hz = tw(hr.y);
    furniture('hearth', hx, hz, I, 0, 1.6, 1.6, 1.6);
    GLADE3D.fires.push({ x: hx, y: fl + 0.1, z: hz, power: 0.8 });
    I.light = { x: hx + 0.4, y: fl + 1.4, z: hz };
    for (const t of LAYOUT.interior.tables) furniture('table_long', tw(t.x), tw(t.y) + (tw(t.y) < I.cz ? 0.25 : -0.25), I, 0, 3.0, 1.95, 1.0);
    furniture('shelf', I.cx + 2.5, north + 0.35, I, 0, 2.0, 0.5, 2.0);
    furniture('barrel', east - 0.6, north + 0.6, I, 0, 0.7, 0.7, 1.0);
    furniture('barrel', west + 0.6, north + 0.6, I, 0, 0.7, 0.7, 1.0);
    furniture('sacks', west + 0.9, south - 0.9, I, 0.4, 1.4, 1.2, 1.0);
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
    furniture('workbench', I.cx, I.cz - 0.6, I, 0, 1.6, 0.7, 1.0);
    lantern(I.cx, fl + 2.1, I.cz + 0.8);
    ITEM_SPAWNS.push({ type: 'map', x: I.cx - 0.3, y: fl + 0.92, z: I.cz - 0.6 }, { type: 'rope', x: west + 0.8, y: fl + 0.62, z: north + 0.6 });
  } else if (h.id === 'blood') {
    furniture('workbench', I.cx, north + 0.5, I, 0, 1.6, 0.7, 1.0);
    furniture('barrel', east - 0.6, south - 0.6, I, 0, 0.7, 0.7, 1.0);
    furniture('sacks', west + 1.0, south - 0.9, I, 0.8, 1.4, 1.2, 1.0);
    lantern(I.cx, fl + 2.1, I.cz);
  }
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

const FENCES = [];

function buildPlantations() {
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
    fenceRun(ax, az, bx, bz, gy, FENCES);
  };
  const fx0 = x0 - 0.5, fx1 = x1 + 0.5, fz0 = z0 - 0.5, fz1 = z1 + 0.5;
  run(fx0, fz0, fx1, fz0);
  run(fx1, fz0, fx1, fz1);
  run(fx0 + 2.5, fz1, fx1, fz1);
  run(fx0, fz0, fx0, fz1);
  ITEM_SPAWNS.push({ type: 'apple', x: fx0 + 1.2, y: gy + 0.05, z: fz1 + 0.6 }, { type: 'apple', x: fx0 + 1.6, y: gy + 0.05, z: fz1 + 0.9 });
}

function buildSmallThings() {
  // Кутузка: яма с решёткой из брёвен
  const s = LAYOUT.slammer, sx = tw(s.x), sz = tw(s.y), sy = groundH(sx, sz);
  mesh(new THREE.PlaneGeometry(2.6, 2.6), GM.hole, sx, sy + 0.02, sz, null, false).rotation.x = -Math.PI / 2;
  if (!put('slammer', sx, sy, sz)) {
    for (let i = -2; i <= 2; i++) {
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), GM.bark, sx + i * 0.6, sy + 0.1, sz).rotation.x = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), GM.bark, sx, sy + 0.17, sz + i * 0.6).rotation.z = Math.PI / 2;
    }
  }
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
  // Ящик: стальная рама и решётчатые створки над тёмной шахтой
  const x = tw(MID), z = tw(MID);
  mesh(new THREE.PlaneGeometry(3, 3), GM.hole, x, 0.035, z, null, false).rotation.x = -Math.PI / 2;
  if (!put('box_lift', x, 0, z)) {
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
  ITEM_SPAWNS.push({ type: 'bag', x: x + 0.7, y: 0.12, z: z + 0.5 });
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
  // Загон живодерни: изгородь, сено и кормушка
  const P = rectWorld(LAYOUT.pen), pw = P.w - 0.8, pd = P.d - 0.8, py = groundH(P.x, P.z);
  const px0 = P.x - pw / 2, px1 = P.x + pw / 2, pz0 = P.z - pd / 2, pz1 = P.z + pd / 2;
  fenceRun(px0, pz0, px1, pz0, py, FENCES);
  fenceRun(px1, pz0, px1, pz1, py, FENCES);
  fenceRun(px1, pz1, px0, pz1, py, FENCES);
  fenceRun(px0, pz1, px0, pz0, py, FENCES);
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

function buildStructures() {
  FENCES.length = 0;
  buildHouses();
  buildTower();
  buildBridge();
  buildCampfire();
  buildGraveyard();
  buildPlantations();
  buildSmallThings();
  instanceModel('fence', FENCES);
}
