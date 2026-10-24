// Вступление: подъём в Ящике. Томас лежит в клетке среди ящиков с припасами, клетка ползёт вверх по тёмной шахте,
// мимо проплывают аварийные лампы; рывок, остановка, створки над головой откидываются — и впервые виден Глэйд.
// Пропустить — пробел, Enter, Esc или кнопка. Тот же Ящик потом привозит новичков (короткий подъём без камеры).

const LIFT_DEPTH = 28;                    // глубина шахты, м
const LIFT_FLOOR = -2.45;                 // пол клетки, когда она наверху (створки — вровень с землёй)
const Lift = { active: false, t: 0, dur: 21, fade: 1, light: 1, cageY: LIFT_FLOOR - LIFT_DEPTH, doors: 0, doorDir: 0,
  shaft: null, cage: null, lamps: [], skipEl: null, done: null, out: false };

function liftEase(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

// Шахта и клетка строятся один раз; пока подъёма нет, они спрятаны под землёй
function initLift() {
  const x = tw(MID), z = tw(MID), W = 3.2;
  const shaft = new THREE.Group(), conc = GM.concrete.clone(), steel = MAT.steel || GM.metal;
  conc.color = srgb('#6e6a63');
  for (const [dx, dz, w, d] of [[0, -W / 2 - 0.1, W + 0.4, 0.2], [0, W / 2 + 0.1, W + 0.4, 0.2], [-W / 2 - 0.1, 0, 0.2, W], [W / 2 + 0.1, 0, 0.2, W]]) {
    const wall = new THREE.Mesh(boxGeo(w, LIFT_DEPTH + 4, d, 3), conc);
    wall.position.set(x + dx, -1.4 - (LIFT_DEPTH + 4) / 2, z + dz);
    wall.receiveShadow = true;
    shaft.add(wall);
  }
  // Направляющие и балки шахты, аварийные лампы через каждые 4 м
  const rail = new THREE.BoxGeometry(0.12, LIFT_DEPTH + 4, 0.12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const r = new THREE.Mesh(rail, steel);
    r.position.set(x + sx * (W / 2 - 0.1), -1.4 - (LIFT_DEPTH + 4) / 2, z + sz * (W / 2 - 0.1));
    shaft.add(r);
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x220a04, emissive: 0xff5a1e, emissiveIntensity: 2.2 });
  Lift.lamps = [];
  for (let y = -3.5; y > -LIFT_DEPTH - 2; y -= 4) {
    const side = Math.round(-y / 4) % 2 ? 1 : -1;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.3), lampMat);
    lamp.position.set(x + side * (W / 2 - 0.02), y, z);
    shaft.add(lamp);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.18, 0.18), steel);
    beam.position.set(x, y - 1.5, z + (side > 0 ? W / 2 - 0.05 : -W / 2 + 0.05));
    shaft.add(beam);
    Lift.lamps.push(lamp);
  }
  shaft.visible = false;
  World.scene.add(shaft);
  // Клетка: пол из рифлёной стали, стойки, решётка по бокам, внутри припасы
  const cage = new THREE.Group();
  const floor = new THREE.Mesh(boxGeo(W - 0.15, 0.12, W - 0.15, 1), steel);
  floor.position.y = -0.06;
  cage.add(floor);
  const bar = new THREE.CylinderGeometry(0.025, 0.025, 2.5, 6);
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i <= 8; i++) {
      const u = -W / 2 + 0.12 + i * (W - 0.24) / 8, b = new THREE.Mesh(bar, steel);
      if (k < 2) b.position.set(u, 1.25, (k ? 1 : -1) * (W / 2 - 0.12)); else b.position.set((k === 2 ? 1 : -1) * (W / 2 - 0.12), 1.25, u);
      cage.add(b);
    }
  }
  for (const y of [0.9, 2.4]) {
    for (const [w, d, ox, oz] of [[W - 0.2, 0.06, 0, -(W / 2 - 0.12)], [W - 0.2, 0.06, 0, W / 2 - 0.12], [0.06, W - 0.2, -(W / 2 - 0.12), 0], [0.06, W - 0.2, W / 2 - 0.12, 0]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), steel);
      r.position.set(ox, y, oz);
      cage.add(r);
    }
  }
  const supply = (id, px, pz, rot, s) => {
    const src = ASSETS.models[id];
    if (!src) return;
    const m = src.clone(true), b = new THREE.Box3().setFromObject(m), size = b.getSize(new THREE.Vector3());
    if (s) m.scale.setScalar(s / Math.max(size.x, size.z));
    b.setFromObject(m);
    m.position.set(px - (b.min.x + b.max.x) / 2, -b.min.y, pz - (b.min.z + b.max.z) / 2);
    m.rotation.y = rot;
    cage.add(m);
  };
  supply('wooden_crate_01', -0.95, -0.9, 0.2, 0.85);
  supply('wooden_crate_01', -0.95, 0.05, -0.1, 0.8);
  supply('wooden_crate_01', 0.9, -1.0, 0.5, 0.75);
  supply('sacks', 0.85, 0.55, 1.2);
  supply('barrel', -0.95, 1.0, 0);
  cage.position.set(x, Lift.cageY, z);
  cage.visible = false;
  World.scene.add(cage);
  // Тусклый тёплый свет в клетке (мигает, как в фильме)
  Lift.lightSrc = new THREE.PointLight(0xffb070, 0, 9, 2);
  World.scene.add(Lift.lightSrc);
  Object.assign(Lift, { shaft, cage });
  // Створки Ящика — узлы модели box_lift (у каждой ось на петле)
  const box = GLADE3D.box;
  Lift.doorL = box && box.getObjectByName('door_l');
  Lift.doorR = box && box.getObjectByName('door_r');
  setBoxDoors(0);
}

// 0 — закрыты, 1 — откинуты вверх-наружу
function setBoxDoors(k) {
  Lift.doors = k;
  // Пока клетка наверху и створки открыты, видно её саму с припасами, а не тёмную шахту
  const up = Lift.cage && Lift.cage.visible && k > 0.02;
  if (GLADE3D.boxHole) GLADE3D.boxHole.visible = !up;
  if (Lift.shaft && !Lift.active) Lift.shaft.visible = up;
  const a = liftEase(k) * 1.75;
  if (Lift.doorL) Lift.doorL.rotation.z = a;
  if (Lift.doorR) Lift.doorR.rotation.z = -a;
}

function startLift(onDone) {
  if (!Lift.cage) initLift();
  Object.assign(Lift, { active: true, t: 0, fade: 0, light: 0.02, out: false, done: onDone, cageY: LIFT_FLOOR - LIFT_DEPTH, clank: 2.5 });
  Lift.shaft.visible = Lift.cage.visible = true;
  setBoxDoors(0);
  document.body.classList.add('lift');
  if (!Lift.skipEl) {
    const b = document.createElement('button');
    b.className = 'btn ghost small lift-skip';
    b.type = 'button';
    b.textContent = 'Пропустить ▸';
    b.addEventListener('click', e => { e.stopPropagation(); skipLift(); });
    document.body.appendChild(b);
    Lift.skipEl = b;
  }
  Lift.skipEl.hidden = false;
  const cap = document.getElementById('lift-caption');
  if (cap) cap.hidden = false;
  Sound.liftRise(17);
}

function skipLift() {
  if (!Lift.active) return;
  Lift.t = Lift.dur;
  updateLift(0);
}

function updateLift(dt) {
  const L = Lift;
  L.t += dt;
  const t = L.t;
  // Подъём: медленно трогается, ползёт, у самого верха тормозит; рывок при остановке
  const rise = liftEase(Math.min(1, t / 16.5));
  L.cageY = LIFT_FLOOR - LIFT_DEPTH * (1 - rise);
  if (t > 16.5 && !L.stopped) { L.stopped = true; Game.shake = 0.9; Sound.clank(); Sound.clank(); }
  if (t < 16.5 && (L.clank -= dt) <= 0) { L.clank = 1.6 + Math.random() * 2; Sound.clank(); Game.shake = Math.max(Game.shake, 0.25); }
  Game.shake = Math.max(0, Game.shake - dt * 1.5);
  L.cage.position.y = L.cageY;
  // Створки открываются с 17.2 с; дневной свет заливает клетку
  const open = Math.max(0, Math.min(1, (t - 17.2) / 1.6));
  if (open > 0 && !L.opened) { L.opened = true; Sound.boxArrives(); }
  setBoxDoors(open);
  L.fade = Math.min(1, t / 2.5);
  const depth = -L.cageY + LIFT_FLOOR;     // насколько клетка ниже верха
  L.light = 0.03 + 0.97 * Math.max(liftEase(1 - depth / 9) * 0.35, open);
  const flick = 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.3) + (Math.random() < 0.03 ? -0.6 : 0);
  L.lightSrc.position.set(tw(MID), L.cageY + 2.3, tw(MID));
  L.lightSrc.intensity = (1 - open) * 2.4 * Math.max(0.15, flick);
  for (const lamp of L.lamps) lamp.material.emissiveIntensity = 1.6 + Math.sin(t * 4) * 0.8;
  if (t >= L.dur) finishLift();
}

// Камера: лёжа смотрит вверх в шахту, озирается, садится, встаёт, после остановки выбирается наверх
const _lp = new THREE.Vector3(), _ll = new THREE.Vector3();
function liftCamera(cam) {
  const L = Lift, t = L.t, x = tw(MID), z = tw(MID), y = L.cageY;
  const sit = liftEase((t - 8) / 2.5), stand = liftEase((t - 12) / 2.2), climb = liftEase((t - 19) / 1.9);
  const eye = 0.32 + sit * 0.6 + stand * 0.75;
  const look = t < 8 ? Math.sin(t * 0.55) * 0.9 : t < 12 ? -0.8 + (t - 8) * 0.5 : 0.4 * Math.sin(t * 0.4);
  const pitch = t < 8 ? 1.25 - Math.max(0, Math.sin(t * 0.8)) * 0.35 : t < 14 ? 0.15 + (t - 8) * 0.03 : 0.95 - liftEase((t - 17.5) / 1.5) * 0.85;
  _lp.set(x + (1 - sit) * 0.35, y + eye, z + (1 - sit) * 0.2 + climb * 2.1);
  _lp.y += climb * (-LIFT_FLOOR + 0.05);
  const sh = Game.shake * 0.12;
  _lp.x += (Math.random() - 0.5) * sh;
  _lp.y += (Math.random() - 0.5) * sh;
  cam.position.copy(_lp);
  cam.rotation.set(pitch * (1 - climb) + climb * -0.05, -Math.PI / 2 - (-Math.PI / 2 + look * (1 - climb)), (1 - sit) * 0.35);
}

function finishLift() {
  const L = Lift;
  if (!L.active) return;
  L.active = false;
  setBoxDoors(1);
  L.cage.position.y = LIFT_FLOOR;
  L.shaft.visible = false;
  L.lightSrc.intensity = 0;
  document.body.classList.remove('lift');
  if (L.skipEl) L.skipEl.hidden = true;
  const cap = document.getElementById('lift-caption');
  if (cap) cap.hidden = true;
  Sound.stopLift();
  // Томас выбрался из Ящика и стоит к югу от него лицом на север, к Башне
  const p = Game.player;
  Object.assign(p, { x: MID, y: MID + 0.62, h: groundH(tw(MID), tw(MID + 0.62)), vh: 0, yaw: -Math.PI / 2, pitch: -0.05 });
  Game.shake = 0;
  L.out = true;
  L.leaveT = 0;
  if (L.done) L.done();
}

// Клетка уходит вниз, когда Томас отошёл от Ящика; створки захлопываются
function updateBoxDoors(dt) {
  const L = Lift;
  if (L.active || !L.cage) return;
  if (L.out && Math.hypot(Game.player.x - MID, Game.player.y - MID) > 2.6) {
    L.leaveT += dt;
    if (L.leaveT > 4) { L.out = false; L.doorDir = -1; }
  }
  if (L.doorDir) {
    setBoxDoors(Math.max(0, Math.min(1, L.doors + L.doorDir * dt / 1.8)));
    if (L.doors <= 0 && L.doorDir < 0) {
      L.doorDir = 0;
      L.cage.visible = false;
      Sound.clank();
    } else if (L.doors >= 1 && L.doorDir > 0) L.doorDir = 0;
  }
}

// Ящик снова наверху (новичок, припасы): клетка поднимается, створки открываются
function boxOpen() {
  if (!Lift.cage) initLift();
  Lift.cage.position.y = LIFT_FLOOR;
  Lift.cage.visible = true;
  Lift.doorDir = 1;
  Lift.out = true;
  Lift.leaveT = 0;
}
