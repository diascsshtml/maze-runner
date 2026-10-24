// Живность: стаи птиц над Глэйдом, кролики в лесу, бабочки, свиньи и куры в загоне,
// вороны на стенах Лабиринта. Вороны пугаются бега и взлетают с карканьем — а гриверы идут на шум.
// Шум (бег, обвалы, механизмы, вороны) — общий: гриверы в его радиусе идут проверить, что там.

const Fauna = { birds: [], crows: [], rabbits: [], pen: [], crowT: 0, flockA: 0 };

/* ---------- шум ---------- */

// Гриверы в радиусе r тайлов (по коридорам) идут к источнику шума
function makeNoise(x, y, r) {
  r *= Weather.noiseK();
  const sx = Math.round(x), sy = Math.round(y);
  const start = grieverPass(sx, sy) ? { x: sx, y: sy } : nearestPassable(sx, sy, grieverPass);
  if (!start) return;
  if (Game.noise && Game.noise.t > 5 && Game.noise.r >= r && Math.hypot(Game.noise.x - start.x, Game.noise.y - start.y) < 3) return;
  Game.noise = { x: start.x, y: start.y, r, t: 7, field: distanceField(start.x, start.y) };
}

function updateNoise(dt) {
  if (!Game.noise) return;
  Game.noise.t -= dt;
  if (Game.noise.t <= 0) Game.noise = null;
}

/* ---------- модели ---------- */

// Животное из Blender со скелетом и анимациями (смотрит вдоль +Z), или null — тогда рисуем запасное.
// tint — перекрасить материал (кролик зимой белеет): { имя материала: цвет }
function animalGlb(id, tint = null) {
  const g = ASSETS.gltf[id];
  if (!g || !THREE.SkeletonUtils) return null;
  const root = THREE.SkeletonUtils.clone(g.scene), holder = new THREE.Group();
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (tint && tint[o.material.name]) { o.material = o.material.clone(); o.material.color.set(tint[o.material.name]).convertSRGBToLinear(); }
  });
  holder.add(root);
  const mixer = new THREE.AnimationMixer(root), actions = {};
  for (const clip of g.animations) actions[clip.name] = mixer.clipAction(clip);
  holder.anim = { mixer, actions, current: null };
  return holder;
}

// Анимация животного: name — клип, speed — темп; возвращает false, если это запасная модель
function animalAct(o, name, speed, dt) {
  const A = o.anim;
  if (!A) return false;
  const a = A.actions[name];
  if (a && A.current !== a) {
    a.reset().play();
    a.time = Math.random() * a.getClip().duration;
    if (A.current) a.crossFadeFrom(A.current, 0.25, false);
    A.current = a;
  }
  if (a) a.timeScale = speed;
  A.mixer.update(dt);
  return true;
}

function birdMesh(color) {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: srgb(color), roughness: 0.9, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat);
  body.scale.set(1, 0.7, 2.2);
  g.add(body);
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.14, 0.55, 0, -0.02], 3));
  wing.computeVertexNormals();
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wing, mat);
    w.scale.x = s;
    g.add(w);
  }
  g.userData.wings = [g.children[1], g.children[2]];
  return g;
}

function rabbitMesh(winter) {
  const g = new THREE.Group(), fur = new THREE.MeshStandardMaterial({ color: srgb(winter ? '#e8e6e0' : '#8a7458'), roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fur);
  body.scale.set(1, 0.85, 1.4);
  body.position.y = 0.16;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), fur);
  head.position.set(0, 0.28, 0.2);
  g.add(body, head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.05), fur);
    ear.position.set(s * 0.035, 0.4, 0.17);
    ear.rotation.x = -0.25;
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 1 }));
  tail.position.set(0, 0.2, -0.22);
  g.add(tail);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function pigMesh() {
  const g = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: srgb('#d9a08c'), roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 9), skin);
  body.scale.set(0.9, 0.8, 1.45);
  body.position.y = 0.42;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.set(0, 0.48, 0.48);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), new THREE.MeshStandardMaterial({ color: srgb('#c88878'), roughness: 0.9 }));
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.45, 0.67);
  g.add(body, head, snout);
  for (const [x, z] of [[-0.15, -0.28], [0.15, -0.28], [-0.15, 0.28], [0.15, 0.28]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6), skin);
    leg.position.set(x, 0.11, z);
    g.add(leg);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function chickenMesh() {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: srgb('#ece6d8'), roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), white);
  body.scale.set(0.9, 0.95, 1.2);
  body.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), white);
  head.position.set(0, 0.34, 0.11);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.06), new THREE.MeshStandardMaterial({ color: srgb('#c0302a') }));
  comb.position.set(0, 0.4, 0.11);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 5), new THREE.MeshStandardMaterial({ color: srgb('#d8a030') }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.33, 0.18);
  g.add(body, head, comb, beak);
  return g;
}

/* ---------- создание ---------- */

function initFauna(scene) {
  for (let i = 0; i < 9; i++) {
    const b = animalGlb('bird') || birdMesh('#3a342c');
    b.userData.ph = Math.random() * 6.28;
    b.userData.off = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8);
    scene.add(b);
    Fauna.birds.push(b);
  }
  for (let i = 0; i < 3; i++) {
    const c = animalGlb('crow') || birdMesh('#141312');
    c.visible = false;
    c.userData.state = 'off';
    scene.add(c);
    Fauna.crows.push(c);
  }
  const P = LAYOUT.pen;
  for (let i = 0; i < 5; i++) {
    const m = i < 2 ? animalGlb('pig') || pigMesh() : animalGlb('chicken') || chickenMesh();
    m.userData = { kind: i < 2 ? 'pig' : 'chicken', x: tw(P.x0 + 0.5 + Math.random()), z: tw(P.y0 + 0.5 + Math.random() * 2.5), tx: 0, tz: 0, wait: Math.random() * 3, t: Math.random() * 10 };
    scene.add(m);
    Fauna.pen.push(m);
  }
  spawnRabbits(scene);
}

function spawnRabbits(scene = World.scene) {
  for (const r of Fauna.rabbits) scene.remove(r);
  Fauna.rabbits = [];
  for (let i = 0; i < 5; i++) {
    const r = animalGlb('rabbit', Life.season === 2 ? { rabbit_fur: '#e8e6e0' } : null) || rabbitMesh(Life.season === 2);
    const tx = GLADE_T0 + 2 + Math.random() * (GLADE_T1 - GLADE_T0 - 4), ty = MID + 2 + Math.random() * 9;
    r.userData = { x: tw(tx), z: tw(ty), dir: Math.random() * 6.28, hop: 0, wait: Math.random() * 3, flee: 0 };
    scene.add(r);
    Fauna.rabbits.push(r);
  }
}

/* ---------- каждый кадр ---------- */

function updateFauna(dt) {
  const p = Game.player, px = tw(p.x), pz = tw(p.y), t = Game.time, dn = Math.min(1, Game.darkness / 0.9);
  const dayAnimals = dn < 0.6 && Life.season !== 2;
  // Стая кружит над Глэйдом
  Fauna.flockA += dt * 0.12;
  const fx = tw(MID) + Math.cos(Fauna.flockA) * 30, fz = tw(MID) + Math.sin(Fauna.flockA * 0.8) * 26, fy = 34 + Math.sin(t * 0.3) * 4;
  for (const b of Fauna.birds) {
    b.visible = dayAnimals;
    if (!b.visible) continue;
    const u = b.userData;
    b.position.set(fx + u.off.x + Math.sin(t * 0.7 + u.ph) * 2, fy + u.off.y, fz + u.off.z + Math.cos(t * 0.6 + u.ph) * 2);
    b.rotation.y = -Fauna.flockA * 1.0 + Math.PI;
    if (animalAct(b, 'fly', 0.75 + (u.ph % 1) * 0.3, dt)) continue;
    const flap = Math.sin(t * 9 + u.ph) * 0.7;
    u.wings[0].rotation.z = flap;
    u.wings[1].rotation.z = -flap;
  }
  updateCrows(dt, p, px, pz);
  // Кролики прыгают по лесу и убегают от Томаса
  for (const r of Fauna.rabbits) {
    const u = r.userData;
    r.visible = dn < 0.7;
    if (!r.visible) continue;
    const d = Math.hypot(u.x - px, u.z - pz);
    if (d < 6 && u.flee <= 0) { u.flee = 2.5; u.dir = Math.atan2(u.z - pz, u.x - px) + (Math.random() - 0.5) * 0.6; }
    u.flee -= dt;
    u.wait -= dt;
    if (u.wait <= 0 || u.flee > 0) {
      u.hop += dt * (u.flee > 0 ? 9 : 5);
      const sp = (u.flee > 0 ? 4.5 : 1.2) * dt;
      const nx = u.x + Math.cos(u.dir) * sp, nz = u.z + Math.sin(u.dir) * sp;
      const tx = nx / S, ty = nz / S;
      if (tx < GLADE_T0 + 1 || tx > GLADE_T1 - 1 || ty < MID + 1 || ty > GLADE_T1 - 1 || riverDistTiles(tx, ty) < 0.8) u.dir += Math.PI * 0.7;
      else { u.x = nx; u.z = nz; }
      if (u.hop > Math.PI && u.flee <= 0) { u.hop = 0; u.wait = 0.5 + Math.random() * 2.5; u.dir += (Math.random() - 0.5) * 1.5; }
    }
    const hopping = u.wait <= 0 || u.flee > 0;
    // У модели из Blender прыжок — в анимации (тело и лапы), у запасной — подскок всей фигуры
    const lift = r.anim ? 0 : Math.abs(Math.sin(u.hop)) * (u.flee > 0 ? 0.25 : 0.12);
    r.position.set(u.x, groundH(u.x, u.z) + lift, u.z);
    r.rotation.y = Math.PI / 2 - u.dir;
    animalAct(r, hopping ? 'hop' : 'idle', u.flee > 0 ? 1.8 : 1.1, dt);
  }
  // Загон: свиньи и куры бродят внутри
  const P = LAYOUT.pen;
  for (const m of Fauna.pen) {
    const u = m.userData;
    u.t += dt;
    u.wait -= dt;
    if (u.wait <= 0) {
      u.tx = tw(P.x0 - 0.3 + Math.random() * (P.x1 - P.x0 + 0.6));
      u.tz = tw(P.y0 - 0.3 + Math.random() * (P.y1 - P.y0 + 0.6));
      u.wait = 3 + Math.random() * 5;
    }
    const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
    if (d > 0.1) {
      const sp = (u.kind === 'pig' ? 0.5 : 0.8) * dt;
      u.x += dx / d * Math.min(sp, d);
      u.z += dz / d * Math.min(sp, d);
      m.rotation.y = Math.atan2(dx, dz);
    }
    const bob = m.anim ? 0 : u.kind === 'chicken' ? Math.abs(Math.sin(u.t * 7)) * 0.03 : Math.abs(Math.sin(u.t * 4)) * 0.015;
    m.position.set(u.x, groundH(u.x, u.z) + bob, u.z);
    // Свинья в покое роется и похрюкивает, курица клюёт землю
    animalAct(m, d > 0.1 ? 'walk' : u.kind === 'pig' ? 'idle' : 'peck', u.kind === 'pig' ? 1.1 : 1.5, dt);
  }
  // Бабочки над Глэйдом днём весной и летом
  if ((Life.season === 0 || Life.season === 3) && dn < 0.4 && playerTile() === T.GLADE && Math.random() < dt * 3) {
    const cols = [[2.2, 1.6, 0.3], [1.8, 0.7, 0.3], [1.4, 1.6, 2.2], [2, 2, 1.8]];
    FX.glow.emit({ x: px + rnd(-10, 10), y: rnd(0.4, 1.6), z: pz + rnd(-10, 10), vx: rnd(-0.5, 0.5), vy: rnd(-0.1, 0.25), vz: rnd(-0.5, 0.5), life: rnd(3, 5), size: 0.06, size1: 0.05, color: [...cols[rand(cols.length)], 0.9], spin: rnd(-6, 6) });
  }
}

// Вороны садятся на стены рядом с Томасом в Лабиринте; бег их пугает
function updateCrows(dt, p, px, pz) {
  const inMaze = playerTile() !== T.GLADE && Game.state === 'play';
  Fauna.crowT -= dt;
  for (const c of Fauna.crows) {
    const u = c.userData;
    if (u.state === 'sit') {
      const d = Math.hypot(u.x - px, u.z - pz);
      c.position.set(u.x, u.y, u.z);
      if (!inMaze || d > 60) { c.visible = false; u.state = 'off'; continue; }
      if ((p.sprinting && d < 10) || d < 4) {
        u.state = 'fly';
        u.vy = 4;
        u.dir = Math.atan2(u.z - pz, u.x - px);
        Sound.caw({ x: u.x, y: u.y, z: u.z });
        makeNoise(u.x / S, u.z / S, 16);
        if (!Story.flags.crowHint) { Story.flags.crowHint = true; toast('Вороны взлетели с карканьем — гриверы могли это услышать. Не беги мимо птиц!', 'warn'); }
      }
      if (!animalAct(c, 'sit', 1, dt)) {
        u.wings[0].rotation.z = 0.15;
        u.wings[1].rotation.z = -0.15;
      }
    } else if (u.state === 'fly') {
      u.x += Math.cos(u.dir) * 7 * dt;
      u.z += Math.sin(u.dir) * 7 * dt;
      u.y += u.vy * dt;
      c.position.set(u.x, u.y, u.z);
      c.rotation.y = Math.PI / 2 - u.dir;
      if (!animalAct(c, 'fly', 1.5, dt)) {
        const flap = Math.sin(Game.time * 16) * 0.8;
        u.wings[0].rotation.z = flap;
        u.wings[1].rotation.z = -flap;
      }
      if (u.y > WALL_H + 25) { c.visible = false; u.state = 'off'; }
    } else if (inMaze && Fauna.crowT <= 0 && Game.phase === 'day') {
      // Ищем верх стены у коридора в 12–24 м от Томаса
      for (let tries = 0; tries < 30; tries++) {
        const tx = Math.round(p.x + (Math.random() - 0.5) * 14), ty = Math.round(p.y + (Math.random() - 0.5) * 14);
        if (Maze.at(tx, ty) !== T.WALL || !DIRS.some(d => Maze.at(tx + d.x, ty + d.y) === T.FLOOR)) continue;
        const d = Math.hypot(tw(tx) - px, tw(ty) - pz);
        if (d < 12 || d > 24) continue;
        Object.assign(u, { state: 'sit', x: tw(tx) + (Math.random() - 0.5), y: WALL_H * wallHv(tx, ty) + 0.12, z: tw(ty) + (Math.random() - 0.5) });
        c.rotation.y = Math.random() * 6.28;
        c.visible = true;
        break;
      }
      Fauna.crowT = 8 + Math.random() * 10;
    }
  }
}
