/* ---------- свободная стройка домов ----------
   Дом можно поставить где угодно в Глэйде и повернуть на четверть оборота. Мир строит каждый дом один раз —
   на его месте из планировки, со всем, что в нём есть (модель, мебель, препятствия, пол, дверь, огонь очага,
   фонари, предметы; всё это помечено постройкой в withStruct). Перенос — жёсткий сдвиг и поворот всего этого
   от исходного места: группа объектов двигается целиком, а данные в метрах и клетках пересчитываются из
   снимка исходных значений. Так же переезжают кровати, рабочие места жителей, стены для их маршрутов и мебельные
   клетки. Трава под новым домом прячется; на склоне дом встаёт на фундамент, к двери — ступени.
   Место (Settle.place[id] = { x, y, k, dy }: центр в клетках, четверти поворота, подъём в метрах) хранится в сохранении. */

const PLACE = { orig: null, ghosts: {}, grass: [], extras: {} };
// Рабочие места жителей, которые стоят в доме или у него
const PLACE_STATIONS = { cook: 'dining', smith: 'forge', medjackA: 'medhut', medjackB: 'medhut', mapRoom: 'storage' };
const PLACE_DOORS = ['E', 'S', 'W', 'N'];          // по часовой стрелке на карте (север сверху)

// Поворот на k четвертей по часовой стрелке на карте: восток → юг → запад → север
function rotQ(dx, dy, k) {
  for (let i = 0; i < (k & 3); i++) [dx, dy] = [-dy, dx];
  return [dx, dy];
}

// Снимок исходных данных домов — переносы считаются от него, сколько бы раз их ни меняли
function placeSnapshot() {
  if (PLACE.orig) return PLACE.orig;
  const O = PLACE.orig = {};
  const lists = [...GLADE3D.fires, ...GLADE3D.torches, ...GLADE3D.lanterns];
  for (const h of HOUSES) {
    const id = h.id;
    O[id] = {
      r: { ...h.r }, door: h.door, doorTile: { ...h.doorTile }, doorOut: { ...h.doorOut },
      info: JSON.parse(JSON.stringify(HOUSE_INFO[id] || {})),
      colliders: COLLIDERS.filter(c => c.struct === id).map(c => [c, c.round ? { x: c.x, z: c.z, y0: c.y0, y1: c.y1 } : { x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y0: c.y0, y1: c.y1 }]),
      platforms: TERRAIN.platforms.filter(p => p.struct === id).map(p => [p, p.round ? { x: p.x, z: p.z, h: p.h } : { x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, h: p.h }]),
      points: [...lists, ...ITEM_SPAWNS].filter(f => f.struct === id).map(f => [f, { x: f.x, y: f.y, z: f.z }]),
      doors: HOUSE_DOORS.filter(D => D.id === id).map(D => [D, { x: D.x, y: D.y, z: D.z }]),
      beds: BEDS.filter(b => b.house === id).map(b => [b, { x: b.x, y: b.y, wx: b.wx, wy: b.wy, yaw: b.yaw }]),
      stations: Object.keys(PLACE_STATIONS).filter(k => PLACE_STATIONS[k] === id).map(k => [STATIONS[k], { x: STATIONS[k].x, y: STATIONS[k].y, face: { ...STATIONS[k].face } }]),
      blocked: [...BLOCK_OWNER].filter(([, o]) => o === id).map(([k]) => k),
    };
  }
  return O;
}

function houseDims(id, k) {
  const r = placeSnapshot()[id].r, w = r.x1 - r.x0 + 1, d = r.y1 - r.y0 + 1;
  return k & 1 ? [d, w] : [w, d];
}

// Центр дома (в клетках) по точке прицела: клетки дома ложатся ровно на сетку
function placeCenter(id, k, tx, ty) {
  const [w, d] = houseDims(id, k);
  return { x: Math.round(tx - (w - 1) / 2) + (w - 1) / 2, y: Math.round(ty - (d - 1) / 2) + (d - 1) / 2 };
}

// Перевод точек исходного дома на новое место: в клетках (T) и в метрах (TW)
function placeXform(id, pl) {
  const O = placeSnapshot()[id], c0 = { x: (O.r.x0 + O.r.x1) / 2, y: (O.r.y0 + O.r.y1) / 2 };
  const c1 = pl ? { x: pl.x, y: pl.y } : c0, k = pl ? pl.k & 3 : 0, dy = pl ? pl.dy || 0 : 0;
  const T = (x, y) => { const [a, b] = rotQ(x - c0.x, y - c0.y, k); return { x: c1.x + a, y: c1.y + b }; };
  const TW = (x, z) => { const [a, b] = rotQ(x - tw(c0.x), z - tw(c0.y), k); return { x: tw(c1.x) + a, z: tw(c1.y) + b }; };
  const TR = r => { const a = T(r.x0, r.y0), b = T(r.x1, r.y1); return { x0: Math.round(Math.min(a.x, b.x)), x1: Math.round(Math.max(a.x, b.x)), y0: Math.round(Math.min(a.y, b.y)), y1: Math.round(Math.max(a.y, b.y)) }; };
  const TB = (x0, z0, x1, z1) => { const a = TW(x0, z0), b = TW(x1, z1); return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }; };
  return { O, c0, c1, k, dy, T, TW, TR, TB };
}

// Внешний прямоугольник дома в метрах на новом месте
function placeOuter(id, pl) {
  const X = placeXform(id, pl), I = X.O.info;
  return X.TB(I.cx - I.outerW / 2, I.cz - I.outerD / 2, I.cx + I.outerW / 2, I.cz + I.outerD / 2);
}

/* ---------- перенос ---------- */

function applyPlace(id, pl) {
  const X = placeXform(id, pl), { O, T, TW, TR, TB, k, dy } = X, h = HOUSES.find(q => q.id === id);
  // Клетки: дом, дверь, стены для маршрутов жителей
  Object.assign(h.r, TR(O.r));
  h.door = PLACE_DOORS[(PLACE_DOORS.indexOf(O.door) + k) % 4];
  const dt = T(O.doorTile.x, O.doorTile.y), dout = T(O.doorOut.x, O.doorOut.y);
  h.doorTile = { x: Math.round(dt.x), y: Math.round(dt.y) };
  h.doorOut = { x: Math.round(dout.x), y: Math.round(dout.y) };
  for (const [key, owner] of [...WALL_EDGES]) if (owner === id) WALL_EDGES.delete(key);
  const r = h.r;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ex, ny = y + ey;
        if (inRect({ x: nx, y: ny }, r)) continue;
        if (x === h.doorTile.x && y === h.doorTile.y && nx === h.doorOut.x && ny === h.doorOut.y) continue;
        WALL_EDGES.set(edgeKey(y * SIZE + x, ny * SIZE + nx), id);
      }
    }
  }
  // Мебельные клетки (очаг, столы, горн…)
  for (const key of [...BLOCK_OWNER.keys()]) if (BLOCK_OWNER.get(key) === id) { BLOCK_OWNER.delete(key); BLOCKED.delete(key); }
  for (const key of O.blocked) {
    const p = T(key % SIZE, Math.floor(key / SIZE)), nk = Math.round(p.y) * SIZE + Math.round(p.x);
    BLOCKED.add(nk);
    BLOCK_OWNER.set(nk, id);
  }
  // Дом в метрах
  const I = HOUSE_INFO[id], oi = O.info;
  if (I && oi.cx !== undefined) {
    const c = TW(oi.cx, oi.cz), dr = TW(oi.door.x, oi.door.z);
    Object.assign(I, { cx: c.x, cz: c.z, y: oi.y + dy, floor: oi.floor + dy, door: { x: dr.x, z: dr.z } });
    Object.assign(I, k & 1 ? { outerW: oi.outerD, outerD: oi.outerW, w: oi.d, d: oi.w } : { outerW: oi.outerW, outerD: oi.outerD, w: oi.w, d: oi.d });
    if (oi.light) { const L = TW(oi.light.x, oi.light.z); I.light = { x: L.x, y: oi.light.y + dy, z: L.z }; }
  }
  for (const [c, o] of O.colliders) {
    if (c.round) { const p = TW(o.x, o.z); Object.assign(c, { x: p.x, z: p.z }); }
    else Object.assign(c, TB(o.x0, o.z0, o.x1, o.z1));
    c.y0 = o.y0 + dy;
    c.y1 = o.y1 + dy;
  }
  for (const [p, o] of O.platforms) {
    if (p.round) Object.assign(p, TW(o.x, o.z));
    else Object.assign(p, TB(o.x0, o.z0, o.x1, o.z1));
    p.h = o.h + dy;
  }
  for (const [f, o] of O.points) {
    const p = TW(o.x, o.z);
    Object.assign(f, { x: p.x, y: o.y + dy, z: p.z });
    if (f.flame) { f.flame.parent && f.flame.parent.remove(f.flame); f.flame = null; }   // пламя очага встанет на новое место само
  }
  for (const [D, o] of O.doors) {
    const p = TW(o.x, o.z);
    Object.assign(D, { x: p.x, y: o.y + dy, z: p.z });
    D.max = undefined;                                        // насколько открывается — пересчитать по новой обстановке
  }
  for (const [b, o] of O.beds) {
    const p = T(o.x, o.y), w = T(o.wx, o.wy);
    Object.assign(b, { x: Math.round(p.x), y: Math.round(p.y), wx: w.x, wy: w.y, yaw: o.yaw - k * Math.PI / 2 });
  }
  for (const [st, o] of O.stations) {
    const p = T(o.x, o.y), f = T(o.face.x, o.face.y);
    Object.assign(st, { x: Math.round(p.x), y: Math.round(p.y), face: { x: Math.round(f.x), y: Math.round(f.y) } });
    // Место у дома снаружи (бегуны сверяют карты у картохранилища) могло попасть на дерево или в реку
    if (pl && !inRect(st, h.r) && !npcPass(st.x, st.y)) {
      const q = nearestPassable(st.x, st.y, npcPass) || h.doorOut;
      Object.assign(st, { x: q.x, y: q.y });
    }
  }
  // Сама группа объектов: поворот вокруг исходного центра и перенос в новый
  const rec = STRUCTS[id];
  if (rec) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -k * Math.PI / 2);
    const c0 = new THREE.Vector3(tw(X.c0.x), 0, tw(X.c0.y)).applyQuaternion(q);
    rec.group.quaternion.copy(q);
    rec.group.position.set(tw(X.c1.x) - c0.x, dy, tw(X.c1.y) - c0.z);
    rec.group.updateMatrixWorld(true);
  }
  for (const [l, hid] of [[World.kitchenLight, 'dining'], [World.forgeLight, 'forge']]) {
    if (hid === id && l && I && I.light) l.position.set(I.light.x, I.light.y, I.light.z);
  }
  placeExtras(id, pl);
  // Колышки и стройплощадка встанут на новое место заново
  for (const store of [Settle.plots, Settle.siteMeshes]) {
    if (store[id]) { store[id].parent && store[id].parent.remove(store[id]); delete store[id]; }
  }
}

// Фундамент по периметру и ступени к двери — если дом на склоне
function placeExtras(id, pl) {
  const old = PLACE.extras[id];
  if (old) {
    for (const m of old.meshes) m.parent && m.parent.remove(m);
    for (const p of old.platforms) { const i = TERRAIN.platforms.indexOf(p); if (i >= 0) TERRAIN.platforms.splice(i, 1); }
  }
  delete PLACE.extras[id];
  if (!pl) return;
  const I = HOUSE_INFO[id], h = HOUSES.find(q => q.id === id), rec = STRUCTS[id];
  if (!I || !rec) return;
  const out = { meshes: [], platforms: [] }, inv = new THREE.Matrix4().copy(rec.group.matrixWorld).invert();
  const add = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.updateMatrix();
    m.applyMatrix4(inv);                     // в группе дома: видно, только когда дом построен
    m.castShadow = m.receiveShadow = true;
    rec.group.add(m);
    out.meshes.push(m);
  };
  const x0 = I.cx - I.outerW / 2, x1 = I.cx + I.outerW / 2, z0 = I.cz - I.outerD / 2, z1 = I.cz + I.outerD / 2, top = I.y + 0.08;
  const lowAlong = (ax, az, bx, bz) => { let lo = 1e9; for (let i = 0; i <= 8; i++) { const t = i / 8; lo = Math.min(lo, groundH(ax + (bx - ax) * t, az + (bz - az) * t)); } return lo; };
  for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
    const lo = lowAlong(ax, az, bx, bz) - 0.15, hgt = top - lo;
    if (hgt < 0.25) continue;
    const len = Math.hypot(bx - ax, bz - az) + 0.3;
    add(new THREE.BoxGeometry(len, hgt, 0.42), GM.rock, (ax + bx) / 2, lo + hgt / 2, (az + bz) / 2, -Math.atan2(bz - az, bx - ax));
  }
  // Ступени: от порога вниз до земли, шаг не выше 0.28 м (Томас и жители поднимаются сами)
  const [ox, oz] = DOOR_DIR[h.door], dx = I.door.x, dz = I.door.z;
  const gap = I.floor - groundH(dx + ox * 1.2, dz + oz * 1.2);
  if (gap > 0.3) {
    const n = Math.min(6, Math.ceil(gap / 0.28)), rise = gap / n, run = 0.38, width = 1.5;
    for (let i = 1; i <= n; i++) {
      const hgt = I.floor - rise * i, cx = dx + ox * (0.25 + run * (i - 0.5)), cz = dz + oz * (0.25 + run * (i - 0.5));
      const lo = groundH(cx, cz) - 0.1, w = ox ? run : width, d = ox ? width : run;
      add(boxGeo(w, Math.max(0.05, hgt - lo), d, 1), GM.wood, cx, (hgt + lo) / 2, cz);
      const p = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h: hgt, struct: id };
      TERRAIN.platforms.push(p);
      out.platforms.push(p);
    }
  }
  PLACE.extras[id] = out;
}

// Трава под перенесёнными домами прячется (экземпляры сжимаются в точку), при сбросе — возвращается
function placeGrass() {
  const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0), v = new THREE.Vector3();
  for (const [im, i, mat] of PLACE.grass) { im.setMatrixAt(i, mat); im.instanceMatrix.needsUpdate = true; }
  PLACE.grass = [];
  const boxes = Object.entries(Settle.place || {}).map(([id, pl]) => placeOuter(id, pl));
  if (!boxes.length) return;
  for (const set of GLADE3D.grassSets) {
    const im = set.im;
    for (let i = 0; i < set.full; i++) {
      im.getMatrixAt(i, m4);
      v.setFromMatrixPosition(m4);
      if (!boxes.some(b => v.x > b.x0 - 0.4 && v.x < b.x1 + 0.4 && v.z > b.z0 - 0.4 && v.z < b.z1 + 0.4)) continue;
      PLACE.grass.push([im, i, m4.clone()]);
      im.setMatrixAt(i, zero);
    }
    im.instanceMatrix.needsUpdate = true;
  }
}

// Все дома — на свои места из Settle.place (не перенесённые — на исходные)
function applyPlacements() {
  placeSnapshot();
  for (const h of HOUSES) applyPlace(h.id, Settle.place && Settle.place[h.id]);
  placeGrass();
  for (const n of Game.npcs || []) Object.assign(n, { path: null, repath: true });
}

/* ---------- можно ли тут строить ---------- */

const NAME_OF = id => (SETTLE_DEFS[id] && SETTLE_DEFS[id].name) || (HOUSES.find(h => h.id === id) || {}).name || id;

function canPlace(id, pl) {
  const X = placeXform(id, pl), r = X.TR(X.O.r), out = placeOuter(id, pl);
  const dO = X.T(X.O.doorOut.x, X.O.doorOut.y), door = { x: Math.round(dO.x), y: Math.round(dO.y) };
  const bad = why => ({ ok: false, why });
  if (r.x0 < GLADE_T0 + 1 || r.x1 > GLADE_T1 - 1 || r.y0 < GLADE_T0 + 1 || r.y1 > GLADE_T1 - 1) return bad('слишком близко к стене Лабиринта');
  if (!inRect(door, { x0: GLADE_T0 + 1, x1: GLADE_T1 - 1, y0: GLADE_T0 + 1, y1: GLADE_T1 - 1 })) return bad('дверь упрётся в стену');
  if (inRect({ x: MID, y: MID }, r, 2.5)) return bad('здесь Ящик');
  for (const g of GATES) if (Math.hypot(g.x - (r.x0 + r.x1) / 2, g.y - (r.y0 + r.y1) / 2) < Math.max(r.x1 - r.x0, r.y1 - r.y0) / 2 + 3) return bad('загородит ворота');
  const p = Game.player;
  if (inRect({ x: Math.round(p.x), y: Math.round(p.y) }, r, 0.4)) return bad('отойди с места стройки');
  // Другие дома: построенные, строящиеся или уже размеченные — с проходом в клетку между ними
  for (const h of HOUSES) {
    if (h.id === id || !(isBuilt(h.id) || Settle.sites[h.id] || (Settle.place && Settle.place[h.id]))) continue;
    if (!(r.x1 + 1 < h.r.x0 || r.x0 - 1 > h.r.x1 || r.y1 + 1 < h.r.y0 || r.y0 - 1 > h.r.y1)) return bad('рядом дом: ' + h.name.toLowerCase());
    if (inRect(door, h.r) || inRect(h.doorOut, r)) return bad('загородит дверь дома: ' + h.name.toLowerCase());
  }
  // Участки остальных построек (костёр, огород, загон, мостик…) — их места заняты, даже если ещё не построены
  for (const [sid, d] of Object.entries(SETTLE_DEFS)) {
    if (d.house) continue;
    const R = plotRect(sid);
    if (!(out.x1 < R.x0 || out.x0 > R.x1 || out.z1 < R.z0 || out.z0 > R.z1)) return bad('место для: ' + d.name.toLowerCase());
  }
  // Клетки, через которые нельзя: деревья, река, корни Башни, мебель чужих домов
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const key = y * SIZE + x;
    if (BLOCKED.has(key) && BLOCK_OWNER.get(key) !== id) return bad('мешают деревья или вода');
    if (Maze.at(x, y) !== T.GLADE) return bad('здесь не Глэйд');
  }
  if (BLOCKED.has(door.y * SIZE + door.x) && BLOCK_OWNER.get(door.y * SIZE + door.x) !== id) return bad('перед дверью нет прохода');
  // Точные препятствия: стволы, валуны, Башня, чужие постройки
  for (const c of COLLIDERS) {
    if (c.off || c.struct === id || (c.struct && !isBuilt(c.struct)) || c.y1 < -10) continue;
    const hit = c.round ? c.x + c.r > out.x0 && c.x - c.r < out.x1 && c.z + c.r > out.z0 && c.z - c.r < out.z1
      : c.x1 > out.x0 && c.x0 < out.x1 && c.z1 > out.z0 && c.z0 < out.z1;
    if (hit) return bad('мешает дерево, камень или постройка');
  }
  // Вода и склон
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const x = out.x0 + (out.x1 - out.x0) * i / 6, z = out.z0 + (out.z1 - out.z0) * j / 6;
    if (waterLevel(x, z) !== null) return bad('здесь вода');
    const g = groundH(x, z);
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
  }
  if (hi - lo > 1.5) return bad('слишком крутой склон');
  return { ok: true, dy: hi - X.O.info.y, lift: hi - lo };
}

/* ---------- выбор места: «призрак» дома перед глазами ---------- */

const GHOST_MAT = {};
function ghostMat(ok) {
  return GHOST_MAT[ok] || (GHOST_MAT[ok] = new THREE.MeshBasicMaterial({ color: ok ? 0x7fe07a : 0xff5a3c, transparent: true, opacity: ok ? 0.3 : 0.36, depthWrite: false, fog: false }));
}

// Полупрозрачная копия дома: те же геометрии, без копирования, один материал
function makeGhost(id) {
  if (PLACE.ghosts[id]) return PLACE.ghosts[id];
  const rec = STRUCTS[id], g = new THREE.Group();
  rec.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(rec.group.matrixWorld).invert();
  rec.group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || (PLACE.extras[id] && PLACE.extras[id].meshes.includes(o))) return;
    const m = new THREE.Mesh(o.geometry, ghostMat(true));
    m.matrixAutoUpdate = false;
    m.matrix.multiplyMatrices(inv, o.matrixWorld);
    m.renderOrder = 3;
    m.frustumCulled = false;
    g.add(m);
  });
  g.visible = false;
  World.scene.add(g);
  PLACE.ghosts[id] = g;
  return g;
}

function startPlacing(id) {
  const d = SETTLE_DEFS[id];
  if (!d || !d.house || isBuilt(id) || Settle.sites[id]) return;
  if (siteNeedText(id)) { toast(`${d.name}: ${siteNeedText(id)}.`, 'warn'); return; }
  if (!canPay(d.cost)) { toast(`${d.name}: нужно ${costText(d.cost)}.`, 'warn'); return; }
  closePanel();
  Settle.work = null;
  Settle.placing = { id, k: 0, pl: null, test: { ok: false, why: '' } };
  makeGhost(id).visible = true;
  lockPointer();
  toast(World.mobile ? `${d.name}: выбери место. Наведи взгляд на землю; «действие» — заложить, «рывок» — повернуть, «пауза» — отмена.`
    : `${d.name}: выбери место. Наведи взгляд на землю; ${keyLabel(Settings.keys.action)} или клик — заложить, R — повернуть, Q или правая кнопка — отмена.`, 'info');
}

function cancelPlacing(quiet) {
  const P = Settle.placing;
  if (!P) return;
  if (PLACE.ghosts[P.id]) PLACE.ghosts[P.id].visible = false;
  Settle.placing = null;
  if (!quiet) toast('Стройку не заложили.', 'info');
}

function rotatePlacing() {
  if (!Settle.placing) return;
  Settle.placing.k = (Settle.placing.k + 1) & 3;
  Sound.ui('hover');
}

// Каждый кадр: куда смотрит Томас — там и встанет дом
function updatePlacing() {
  const P = Settle.placing;
  if (!P) return;
  if (Game.state !== 'play' || isBuilt(P.id) || Settle.sites[P.id]) { cancelPlacing(true); return; }
  const cam = World.camera, o = cam.getWorldPosition(new THREE.Vector3()), dir = cam.getWorldDirection(new THREE.Vector3());
  let hit = null;
  for (let t = 1.5; t < 32; t += 0.25) {
    const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t;
    if (y <= groundH(x, z)) { hit = { x, z }; break; }
  }
  if (!hit) { const f = Math.hypot(dir.x, dir.z) || 1; hit = { x: o.x + dir.x / f * 14, z: o.z + dir.z / f * 14 }; }
  // Дом встаёт впереди точки прицела, а не на Томасе: сдвиг на половину глубины от игрока
  const [w, d] = houseDims(P.id, P.k), half = Math.max(w, d) * S / 2;
  const fx = dir.x / (Math.hypot(dir.x, dir.z) || 1), fz = dir.z / (Math.hypot(dir.x, dir.z) || 1);
  const pd = Math.hypot(hit.x - o.x, hit.z - o.z);
  if (pd < half + 4) { hit.x = o.x + fx * (half + 4); hit.z = o.z + fz * (half + 4); }
  const c = placeCenter(P.id, P.k, hit.x / S, hit.z / S);
  const pl = { x: c.x, y: c.y, k: P.k, dy: 0 };
  const test = canPlace(P.id, pl);
  pl.dy = test.ok ? test.dy : Math.max(...[0, 0.5, 1].map(a => groundH(tw(c.x) + a, tw(c.y)))) - placeSnapshot()[P.id].info.y;
  P.pl = pl;
  P.test = test;
  const g = makeGhost(P.id), X = placeXform(P.id, pl);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -X.k * Math.PI / 2);
  const c0 = new THREE.Vector3(tw(X.c0.x), 0, tw(X.c0.y)).applyQuaternion(q);
  g.quaternion.copy(q);
  g.position.set(tw(X.c1.x) - c0.x, pl.dy, tw(X.c1.y) - c0.z);
  const mat = ghostMat(test.ok);
  g.traverse(m => { if (m.isMesh) m.material = mat; });
  g.visible = true;
}

function confirmPlacing() {
  const P = Settle.placing;
  if (!P || !P.pl) return;
  if (!P.test.ok) { Sound.ui('error'); toast(`Здесь строить нельзя: ${P.test.why}.`, 'warn'); return; }
  const d = SETTLE_DEFS[P.id];
  if (!canPay(d.cost)) { Sound.ui('error'); toast(`Не хватает материалов: ${costText(d.cost)}.`, 'warn'); cancelPlacing(true); return; }
  Settle.place = Settle.place || {};
  Settle.place[P.id] = { x: P.pl.x, y: P.pl.y, k: P.pl.k, dy: +P.pl.dy.toFixed(3) };
  const id = P.id;
  cancelPlacing(true);
  applyPlacements();
  startSite(id);
}

function placingPrompt() {
  const P = Settle.placing;
  if (!P) return '';
  const d = SETTLE_DEFS[P.id], k = keyLabel(Settings.keys.action);
  return P.test.ok ? `${d.name}: ${k} или клик — заложить здесь · R — повернуть · Q — отмена`
    : `${d.name}: здесь нельзя — ${P.test.why} · R — повернуть · Q — отмена`;
}
