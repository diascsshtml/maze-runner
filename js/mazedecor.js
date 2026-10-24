// Облик секторов Лабиринта: ориентиры на площадях (дерево-великан, мачта с маяком, колонна, шестерня…),
// приметы участков — трубы и решётки, корни из стен, обломки плит, стоячая вода, кострища, царапины гриверов —
// и брошенные вещи бегунов в тупиках. Стены и пол секторов красит шейдер (walls.js), здесь — предметы.
// Ориентиры берутся из тайлов T.MARK, поэтому после загрузки сохранения встают на свои места сами.

const MazeDecor = { landmarks: [], props: [], beacons: [], seen: new Set(), entered: new Set(), ivyFound: new Set(), mats: null };

function decorMats() {
  if (MazeDecor.mats) return MazeDecor.mats;
  const nm = waterNormalMap();
  nm.repeat.set(1.5, 1.5);
  MazeDecor.waterNormal = nm;
  MazeDecor.mats = {
    water: new THREE.MeshStandardMaterial({ color: srgb('#1f2420'), roughness: 0.04, metalness: 0.15, normalMap: nm, normalScale: new THREE.Vector2(0.1, 0.1),
      transparent: true, opacity: 0.86, envMapIntensity: 1, depthWrite: false }),
    scorch: new THREE.MeshStandardMaterial({ map: blotchTexture('rgba(8, 7, 6, 0.9)', 7), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    claws: new THREE.MeshStandardMaterial({ map: clawTexture(), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }),
    stream: new THREE.MeshStandardMaterial({ color: srgb('#9fb5b0'), roughness: 0.1, transparent: true, opacity: 0.45, depthWrite: false }),
  };
  return MazeDecor.mats;
}

// Пятно копоти: неровная клякса с мягким краем
function blotchTexture(color, seed) {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const a = thash(i, seed) * 6.28, r = thash(seed, i) * 70, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r, R = 30 + thash(i, seed + 1) * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

// Следы когтей гривера: пучки глубоких борозд со светлым сколом бетона по краю
function clawTexture() {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  g.lineCap = 'round';
  for (let set = 0; set < 2; set++) {
    const x0 = 50 + set * 90, y0 = 30 + set * 40, ang = 1.05 + set * 0.25;
    for (let k = 0; k < 4; k++) {
      const ox = x0 + k * 16, oy = y0 + k * 5, len = 150 - k * 12;
      for (const [w, col, dx] of [[9, 'rgba(225, 220, 205, 0.5)', 2], [6, 'rgba(14, 13, 12, 0.92)', 0]]) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(ox + dx, oy + dx);
        g.quadraticCurveTo(ox + Math.cos(ang) * len * 0.5 + 10, oy + Math.sin(ang) * len * 0.5, ox + Math.cos(ang) * len + dx, oy + Math.sin(ang) * len + dx);
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function clearMazeDecor(full) {
  for (const o of MazeDecor.props) { World.scene.remove(o); if (o.isInstancedMesh) o.geometry.dispose(); }
  MazeDecor.props = [];
  for (let i = COLLIDERS.length - 1; i >= 0; i--) if (COLLIDERS[i].maze === 'prop' || (full && COLLIDERS[i].maze)) COLLIDERS.splice(i, 1);
  if (!full) return;
  for (const o of MazeDecor.landmarks) World.scene.remove(o);
  MazeDecor.landmarks = [];
  MazeDecor.beacons = [];
}

function mazeCollider(kind, c) { c.maze = kind; COLLIDERS.push(c); }
function mazeBox(kind, cx, cz, w, d, y1 = 100) { mazeCollider(kind, { round: false, x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, y0: -50, y1 }); }

function rebuildMazeDecor(full) {
  if (!World.scene) return;
  clearMazeDecor(full);
  if (full) {
    MazeDecor.seen.clear();
    MazeDecor.entered.clear();
    MazeDecor.ivyFound.clear();
    buildLandmarks();
  }
  buildMazeProps();
}

/* ---------- ориентиры ---------- */

function buildLandmarks() {
  const M = decorMats();
  MazeDecor.plazas = Maze.plazas();
  for (const p of MazeDecor.plazas) {
    const th = SECTOR_THEMES[p.sector];
    if (!th) continue;
    const X = p.x * S, Z = p.y * S, quarter = Math.floor(hash3(p.x, p.y, 5) * 4), rot = quarter * Math.PI / 2;
    const add = o => { if (o) MazeDecor.landmarks.push(o); return o; };
    let m = add(put(th.landmark, X, 0, Z, rot));
    if (!m) m = add(landmarkFallback(th.landmark, X, Z));
    // Направление «вдоль» после поворота (для коллайдеров, вынесенных из центрального тайла)
    const ax = Math.round(Math.cos(rot)), az = Math.round(-Math.sin(rot));
    if (th.landmark === 'lm_mast') {
      const glow = add(glowSprite(0xff2a10, 3.2, 1));
      glow.position.set(X, 47.25, Z);
      World.scene.add(glow);
      MazeDecor.beacons.push(glow);
    } else if (th.landmark === 'lm_gear') {
      mazeBox('lm', X, Z, Math.abs(ax) * 7.2 + Math.abs(az) * 0.95, Math.abs(az) * 7.2 + Math.abs(ax) * 0.95, 5);
    } else if (th.landmark === 'lm_slab') {
      // Под плитой можно пройти, у её подножия — нет
      mazeBox('lm', X + ax * 4.65, Z + az * 4.65, Math.abs(ax) * 0.9 + Math.abs(az) * 3.4, Math.abs(az) * 0.9 + Math.abs(ax) * 3.4, 2.4);
    } else if (th.landmark === 'lm_pool') {
      const w = add(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), M.water));
      w.position.set(X, 0.42, Z);
      w.renderOrder = 1;
      World.scene.add(w);
      // Струя из ржавой трубы (труба загибается к центру бассейна)
      const ox = 0.4, oz = -0.4, c = Math.cos(rot), s = Math.sin(rot);
      const sx = X + ox * c + oz * s, sz = Z - ox * s + oz * c;
      const jet = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.95, 8, 1, true), M.stream));
      jet.position.set(sx, 0.42 + 1.47, sz);
      World.scene.add(jet);
      MazeDecor.pool = { x: sx, z: sz };
    }
  }
}

// Если модели нет — простые формы, чтобы ориентир всё равно был виден
function landmarkFallback(id, X, Z) {
  const mat = new THREE.MeshStandardMaterial({ color: id.includes('tree') ? 0x4a3b2c : 0x77736b, roughness: 0.9, metalness: id === 'lm_mast' || id === 'lm_gear' ? 0.6 : 0 });
  const geo = {
    lm_tree_giant: () => new THREE.CylinderGeometry(0.6, 1.4, 36, 10).translate(0, 18, 0),
    lm_tree_dead: () => new THREE.CylinderGeometry(0.4, 1.2, 32, 8).translate(0, 16, 0),
    lm_mast: () => new THREE.CylinderGeometry(0.3, 1.2, 44, 3).translate(0, 22, 0),
    lm_column: () => new THREE.CylinderGeometry(1.3, 1.45, 30, 16).translate(0, 15, 0),
    lm_gear: () => new THREE.TorusGeometry(3.2, 0.4, 8, 24).translate(0, 1.3, 0),
    lm_slab: () => new THREE.BoxGeometry(3.3, 9, 3.3).translate(0, 4.5, 0),
    lm_pool: () => new THREE.BoxGeometry(3.3, 0.5, 3.3).translate(0, 0.25, 0),
    lm_camp: () => new THREE.ConeGeometry(1.2, 1.8, 4).translate(0, 0.9, 0),
  }[id];
  if (!geo) return null;
  const m = new THREE.Mesh(geo(), mat);
  m.position.set(X, 0, Z);
  m.castShadow = m.receiveShadow = true;
  World.scene.add(m);
  return m;
}

/* ---------- приметы участков ---------- */

function buildMazeProps() {
  const M = decorMats(), lists = {}, push = (id, p) => (lists[id] = lists[id] || []).push(p);
  const busy = new Set();                  // тайлы, где лежат предметы, ловушки и коды — их не загораживаем
  for (const t of Secrets.traps || []) busy.add(t.y * SIZE + t.x);
  for (const it of Game.items || []) busy.add(it.y * SIZE + it.x);
  if (Maze.exit) busy.add(Maze.exit.y * SIZE + Maze.exit.x);
  const water = [], scorch = [], claws = [];
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      if (Maze.at(x, y) !== T.FLOOR) continue;
      const sec = sectorOfTile(x, y);
      if (!sec) continue;
      const r = k => hash3(x * 3 + 1, y * 5 + 2, k + 300), X = x * S, Z = y * S, free = !busy.has(y * SIZE + x);
      // У стен: трубы, корни, обломки, царапины — смотрят из стены в коридор
      DIRS.forEach((d, f) => {
        if (Maze.at(x + d.x, y + d.y) !== T.WALL) return;
        const q = k => hash3(x * 7 + f, y * 11 + f, k + 330), rot = Math.atan2(-d.x, -d.y);
        const wx = X + d.x * S / 2, wz = Z + d.y * S / 2;
        if (sec === 3 && q(1) < 0.2) push('pipe_run', { x: wx, y: 0, z: wz, rot });
        if (sec === 5 && q(2) < 0.11) push('wall_roots', { x: wx, y: 0, z: wz, rot, s: 0.85 + q(3) * 0.35 });
        if ((sec === 2 && q(4) < 0.16) || (sec === 7 && q(4) < 0.05)) {
          push('concrete_chunks', { x: wx, y: 0, z: wz, rot, s: 0.8 + q(5) * 0.4 });
          mazeCollider('prop', { round: true, x: wx - d.x * 0.45, z: wz - d.y * 0.45, r: 0.55, y0: -50, y1: 0.7 });
        }
        if (sec === 8 && q(6) < 0.3) claws.push({ x: wx - d.x * 0.03, z: wz - d.y * 0.03, y: 1.2 + q(7) * 4.5, rot, s: 1.2 + q(8) * 1.3 });
      });
      // На полу: решётки, стоячая вода, кострища, брошенные вещи бегунов
      if (!(x % 2 && y % 2)) continue;
      if (sec === 3 && free && r(1) < 0.12) push('floor_grate', { x: X + (r(2) - 0.5) * 1.2, y: 0.005, z: Z + (r(3) - 0.5) * 1.2, rot: Math.floor(r(4) * 4) * Math.PI / 2 });
      if (sec === 4 && r(1) < 0.35) water.push({ x: X + (r(2) - 0.5) * 1.4, z: Z + (r(3) - 0.5) * 1.4, s: 0.9 + r(4) * 1.4, rot: r(5) * 6.28 });
      if (sec === 6 && r(1) < 0.18) scorch.push({ x: X + (r(2) - 0.5), z: Z + (r(3) - 0.5), s: 1.5 + r(4) * 2.2, rot: r(5) * 6.28 });
      if (deadEnd(x, y) && free) {
        if (sec === 6 && r(6) < 0.4) {
          push('firepit_small', { x: X, y: 0, z: Z, rot: r(7) * 6.28 });
          mazeCollider('prop', { round: true, x: X, z: Z, r: 0.65, y0: -50, y1: 0.3 });
        } else if (r(6) < 0.14) {
          // Вещи бегуна, который здесь пережидал или прятался
          const kit = ['item_bag', 'clothes_pile', 'item_rope', 'item_flask', 'bucket'][Math.floor(r(8) * 5)];
          push(kit, { x: X + (r(9) - 0.5) * 1.2, y: kit.startsWith('item') ? 0.03 : 0, z: Z + (r(10) - 0.5) * 1.2, rot: r(11) * 6.28 });
        }
      }
    }
  }
  for (const [id, list] of Object.entries(lists)) for (const im of instanceModel(id, list, { shadow: id !== 'floor_grate' })) MazeDecor.props.push(im);
  const flat = (geo, mat, list, y, vertical) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    list.forEach((p, i) => im.setMatrixAt(i, m4.compose(v.set(p.x, p.y ?? y, p.z), q.setFromEuler(vertical ? e.set(0, p.rot, 0) : e.set(-Math.PI / 2, 0, p.rot)), sc.setScalar(p.s))));
    im.receiveShadow = true;
    im.renderOrder = 1;
    World.scene.add(im);
    MazeDecor.props.push(im);
  };
  flat(new THREE.CircleGeometry(1, 20), M.water, water, 0.025);
  flat(new THREE.PlaneGeometry(1, 1), M.scorch, scorch, 0.02);
  flat(new THREE.PlaneGeometry(1, 1), M.claws, claws, 0, true);
}

/* ---------- в игре: вход в сектор, найденные ориентиры, маяк ---------- */

function updateMazeDecor(dt, p) {
  for (const b of MazeDecor.beacons) b.material.opacity = (Math.sin(Game.time * 2.6) > 0.55 ? 1 : 0.08) * (0.6 + Game.darkness * 0.4);
  if (MazeDecor.waterNormal) MazeDecor.waterNormal.offset.x += dt * 0.01;
  if (MazeDecor.pool && Math.random() < dt * 6 && Math.hypot(MazeDecor.pool.x - tw(p.x), MazeDecor.pool.z - tw(p.y)) < 40) {
    emitDust(MazeDecor.pool.x, 0.45, MazeDecor.pool.z, 0.25, 1, [0.6, 0.66, 0.66]);
  }
  const tx = Math.round(p.x), ty = Math.round(p.y), t = Maze.at(tx, ty);
  if (t === T.IVY && !MazeDecor.ivyFound.has(ty * SIZE + tx)) {
    MazeDecor.ivyFound.add(ty * SIZE + tx);
    toast('Плющ расступился — за ним проход! Отмечен на карте.', 'good');
    Journal.addPlace('Проход за плющом', `Сектор ${ROMAN[sectorOfTile(tx, ty) - 1]}`);
  }
  if (t === T.FLOOR || t === T.IVY) {
    const sec = sectorOfTile(tx, ty), th = SECTOR_THEMES[sec];
    if (th && !MazeDecor.entered.has(sec)) {
      MazeDecor.entered.add(sec);
      toast(`Сектор ${ROMAN[sec - 1]} · ${th.name}. ${th.text}`, 'info');
    }
  }
  for (const pl of MazeDecor.plazas || []) {
    const key = pl.y * SIZE + pl.x;
    if (MazeDecor.seen.has(key) || Math.hypot(pl.x - p.x, pl.y - p.y) > 3.3) continue;
    MazeDecor.seen.add(key);
    const th = SECTOR_THEMES[pl.sector];
    Maze.reveal(pl.x, pl.y, 2);
    toast(`Ориентир: ${th.lm}. Отмечен на карте — по нему легко найти дорогу.`, 'good');
    Journal.addPlace(th.lm, `Сектор ${ROMAN[pl.sector - 1]}`);
  }
}
