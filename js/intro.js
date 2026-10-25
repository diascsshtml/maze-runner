// Вступление: подъём в Ящике. Томас лежит в клетке среди ящиков с припасами, клетка ползёт вверх по тёмной шахте,
// мимо проплывают аварийные лампы; рывок, остановка, створки над головой откидываются — и впервые виден Глэйд.
// Потом камера, как в кино, вылетает из Ящика, облетает Глэйд, стены и Лабиринт и опускается в глаза Томаса —
// только тогда управление переходит игроку. Пропустить — пробел, Enter, Esc или кнопка в любой момент.
// Тот же Ящик потом привозит новичков (короткий подъём без камеры).

const LIFT_DEPTH = 28;                    // глубина шахты, м
const LIFT_FLOOR = -2.45;                 // пол клетки, когда она наверху (створки — вровень с землёй)
const LIFT_STOP = 16.5, LIFT_OPEN = 17.2; // остановка и начало открытия створок, с
const LIFT_FLY = 18.8;                    // камера вылетает из Ящика
const Lift = { active: false, t: 0, dur: 33.2, fade: 1, light: 1, cageY: LIFT_FLOOR - LIFT_DEPTH, doors: 0, doorDir: 0,
  shaft: null, cage: null, lamps: [], skipEl: null, done: null, out: false };

// Где Томас встаёт после облёта: в тайлах к югу от Ящика, взгляд на Башню (и на сумку у края Ящика)
const LIFT_EXIT = { dy: 0.9, yaw: -1.18, pitch: 0.08 };
const LIFT_EXIT_LOOK = [Math.cos(LIFT_EXIT.yaw) * Math.cos(LIFT_EXIT.pitch) * 4, 1.68 + Math.sin(LIFT_EXIT.pitch) * 4,
  tw(LIFT_EXIT.dy) + Math.sin(LIFT_EXIT.yaw) * Math.cos(LIFT_EXIT.pitch) * 4];
// Облёт: время и точки камеры в метрах от центра Ящика (y — от нуля). Первая — где стоит Томас в клетке,
// последняя — его глаза у Ящика (как встаёт finishLift)
const FLY_KEYS = [
  { t: LIFT_FLY, p: [0, LIFT_FLOOR + 1.67, 0], l: [0, LIFT_FLOOR + 1.67 + 3.25, -2.33] },
  // Вылет лицом к Башне, отход назад и вверх, дуга по западу и северу над стеной, спуск сверху к Ящику.
  // Путь проверен на зазор с кронами и Башней: юго-восток у Ящика — роща, туда камера не летит
  { t: 20.6, p: [-0.3, 3.5, -0.4], l: [5, 8, -13] },
  { t: 22.6, p: [-4, 12, 4], l: [6, 9, -14] },
  { t: 25.0, p: [-24, 36, 4], l: [0, 2, -6] },
  { t: 27.4, p: [-36, 46, -24], l: [0, 0, -2] },
  { t: 29.6, p: [-20, 50, -44], l: [0, 0, 4] },
  { t: 31.5, p: [-3.5, 17, -0.5], l: [1, 0, -3] },
  { t: 33.2, p: [0, 1.68, tw(LIFT_EXIT.dy)], l: LIFT_EXIT_LOOK, ground: true },
];
// Подписи на облёте
const FLY_CAPTIONS = [
  { t0: 21.0, t1: 25.0, title: 'Глэйд', text: 'Поляна посреди Лабиринта' },
  { t0: 25.4, t1: 29.2, title: 'Стены', text: 'На закате ворота закрываются' },
  { t0: 29.6, t1: 32.6, title: 'Лабиринт', text: 'Каждую ночь он меняется' },
];

function liftEase(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

// Шахта и клетка строятся один раз; пока подъёма нет, они спрятаны под землёй
function initLift() {
  const x = tw(MID), z = tw(MID), W = 3.2;
  const shaft = new THREE.Group(), conc = GM.concrete.clone(), steel = MAT.steel || GM.metal;
  conc.color = srgb('#6e6a63');
  // Стены шахты доходят до самой земли: сверху в открытый проём не видно пустоты под Глэйдом
  const H = LIFT_DEPTH + 5.4, top = -0.02;
  for (const [dx, dz, w, d] of [[0, -W / 2 - 0.1, W + 0.4, 0.2], [0, W / 2 + 0.1, W + 0.4, 0.2], [-W / 2 - 0.1, 0, 0.2, W], [W / 2 + 0.1, 0, 0.2, W]]) {
    const wall = new THREE.Mesh(boxGeo(w, H, d, 3), conc);
    wall.position.set(x + dx, top - H / 2, z + dz);
    wall.receiveShadow = true;
    shaft.add(wall);
  }
  // Направляющие и балки шахты, аварийные лампы через каждые 4 м
  const rail = new THREE.BoxGeometry(0.12, H, 0.12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const r = new THREE.Mesh(rail, steel);
    r.position.set(x + sx * (W / 2 - 0.1), top - H / 2, z + sz * (W / 2 - 0.1));
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
  // Припасы: крупное — в южной половине, за головой лежащего Томаса (он смотрит вверх и на север);
  // на севере — только низкие ящики в углах. Видно, когда он садится и озирается, но в лицо не лезет
  supply('sacks', -0.95, 1.0, 1.2);
  supply('barrel', 1.05, 1.05, 0);
  supply('wooden_crate_01', -1.02, 0.15, -0.1, 0.75);
  supply('wooden_crate_01', -1.08, -1.08, 0.2, 0.55);
  supply('wooden_crate_01', 1.1, -1.1, 0.5, 0.5);
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
  // Пока створки открыты, в шахту не шагнуть: невидимая стенка по краю проёма
  Lift.block = { round: false, x0: x - W / 2, z0: z - W / 2, x1: x + W / 2, z1: z + W / 2, y0: -50, y1: 100, off: true };
  COLLIDERS.push(Lift.block);
  setBoxDoors(0);
}

// В модели начало координат створок не на петлях: закрытые, они ложились друг на друга со сдвигом на север.
// Переносим геометрию так, чтобы петля шла по внешнему краю проёма, а закрытые створки закрывали каждая свою половину.
// Зовётся из buildBox — ещё до меню
function hingeBoxDoors(box, x, z) {
  const v = new THREE.Vector3();
  for (const [door, side] of [[box.getObjectByName('door_l'), -1], [box.getObjectByName('door_r'), 1]]) {
    if (!door || !door.geometry) continue;
    door.rotation.z = 0;
    const g = door.geometry.clone();
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(-(side < 0 ? bb.min.x : bb.max.x), -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    g.computeBoundingSphere();
    door.geometry = g;
    door.parent.updateMatrixWorld(true);
    door.position.copy(door.parent.worldToLocal(v.set(x + side * BOX_HALF, side < 0 ? 0.045 : 0.05, z)));
  }
}

// Сколько метров от точки до края Ящика (0 — внутри проёма)
function boxGap(x, z) {
  const dx = Math.max(0, Math.abs(x - tw(MID)) - 1.6), dz = Math.max(0, Math.abs(z - tw(MID)) - 1.6);
  return Math.hypot(dx, dz);
}

// Высота пола под человеком в открытом Ящике: в клетке — её пол, у края проёма выбирается наверх; null — Ящик ни при чём
function boxFloorAt(x, z) {
  if (!Lift.cage || !Lift.cage.visible || Lift.doors <= 0.02) return null;
  const e = Math.max(Math.abs(x - tw(MID)), Math.abs(z - tw(MID)));
  if (e >= 1.6) return null;
  const floor = Lift.cage.position.y;
  return floor + (groundH(x, z) - floor) * liftEase((e - 1.0) / 0.6);
}

// Плавная тряска: сумма синусов вместо случайного рывка каждый кадр (axis — свой набор частот на ось)
function shakeWave(t, axis) {
  const a = axis * 1.7;
  return Math.sin(t * 31 + a) * 0.5 + Math.sin(t * 19.3 + a * 2.1) * 0.32 + Math.sin(t * 7.1 + a * 3.3) * 0.18;
}

// 0 — закрыты, 1 — откинуты вверх-наружу
function setBoxDoors(k) {
  Lift.doors = k;
  // Пока клетка наверху и створки открыты, видно её саму с припасами, а не тёмную шахту
  const up = !!(Lift.cage && Lift.cage.visible && k > 0.02);
  if (GLADE3D.boxHole) GLADE3D.boxHole.visible = !up;
  GROUND_LIFE.hole.value = up || Lift.active ? 1 : 0;      // из шахты сквозь закрытые створки видно небо
  if (Lift.block) Lift.block.off = !up;
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
  Object.assign(Lift, { stopped: false, opened: false, joint: null, cap: -1 });
  Sound.liftRise(LIFT_STOP + 0.1);
  Sound.introMusic();
}

function skipLift() {
  if (!Lift.active) return;
  Sound.stopIntroMusic();
  Lift.t = Lift.dur;
  updateLift(0);
}

function updateLift(dt) {
  const L = Lift;
  L.t += dt;
  const t = L.t;
  // Подъём: медленно трогается, ползёт, у самого верха тормозит; рывок при остановке
  const rise = liftEase(Math.min(1, t / LIFT_STOP));
  L.cageY = LIFT_FLOOR - LIFT_DEPTH * (1 - rise);
  if (t > LIFT_STOP && !L.stopped) { L.stopped = true; Game.shake = 0.9; Sound.stopLift(); if (dt > 0) Sound.liftStop(); }   // при пропуске без визга тормоза
  if (t < LIFT_STOP && (L.clank -= dt) <= 0) { L.clank = 1.6 + Math.random() * 2; Sound.clank(); Game.shake = Math.max(Game.shake, 0.25); }
  // Стыки направляющих: стук чаще, пока клетка разгоняется, и реже, когда тормозит
  const joint = Math.floor(L.cageY / 2.2);
  if (t < LIFT_STOP && dt > 0 && L.joint !== null && joint !== L.joint) Sound.liftJoint();
  L.joint = joint;
  Game.shake = Math.max(0, Game.shake - dt * 1.5);
  L.cage.position.y = L.cageY;
  // Створки открываются с 17.2 с; дневной свет заливает клетку. С этого мига идёт время дня — утренняя дымка редеет на облёте
  const open = Math.max(0, Math.min(1, (t - LIFT_OPEN) / 1.6));
  if (open > 0 && !L.opened) { L.opened = true; Sound.boxArrives(); }
  setBoxDoors(open);
  Game.timeLeft = Game.dayLen - Math.max(0, t - LIFT_OPEN);
  // Утренняя дымка на облёте редеет быстрее часов (иначе Глэйд сверху белый, как в снегу); к концу облёта её нет
  World.mistLead = Math.max(0, t - LIFT_OPEN) * 2;
  liftCaption(t);
  L.fade = Math.min(1, t / 2.5);
  const depth = -L.cageY + LIFT_FLOOR;     // насколько клетка ниже верха
  L.light = 0.03 + 0.97 * Math.max(liftEase(1 - depth / 9) * 0.35, open);
  const flick = 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.3) + (Math.random() < 0.03 ? -0.6 : 0);
  L.lightSrc.position.set(tw(MID), L.cageY + 2.3, tw(MID));
  L.lightSrc.intensity = (1 - open) * 2.4 * Math.max(0.15, flick);
  for (const lamp of L.lamps) lamp.material.emissiveIntensity = 1.6 + Math.sin(t * 4) * 0.8;
  if (t >= L.dur) finishLift();
}

// Подпись внизу слева на облёте: «Глэйд», «Стены», «Лабиринт»
function liftCaption(t) {
  const el = document.getElementById('lift-caption');
  if (!el) return;
  const i = FLY_CAPTIONS.findIndex(c => t >= c.t0 && t < c.t1);
  if (i === Lift.cap) return;
  Lift.cap = i;
  el.classList.toggle('on', i >= 0);
  if (i >= 0) {
    document.getElementById('lift-cap-title').textContent = FLY_CAPTIONS[i].title;
    document.getElementById('lift-cap-text').textContent = FLY_CAPTIONS[i].text;
  }
}

// Ход облёта: плавный разгон в начале и торможение в конце, посередине — ровно
function flyTime(t) {
  const T0 = LIFT_FLY, T = Lift.dur - T0, A = 1.6, B = 1.8, u = Math.max(0, Math.min(T, t - T0));
  const area = T - A / 2 - B / 2;
  const s = u < A ? u * u / (2 * A) : u < T - B ? u - A / 2 : area - (T - u) * (T - u) / (2 * B);
  return T0 + s * T / area;
}

// Кривая Катмулла — Рома через точки облёта
function flyPoint(key, t, out) {
  const K = FLY_KEYS, x = tw(MID), z = tw(MID);
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1].t) i++;
  const u = Math.max(0, Math.min(1, (t - K[i].t) / (K[i + 1].t - K[i].t)));
  const pick = j => {
    const k = K[Math.max(0, Math.min(K.length - 1, j))], v = k[key];
    return [x + v[0], v[1] + (k.ground ? groundH(x + k.p[0], z + k.p[2]) : 0), z + v[2]];
  };
  const p0 = pick(i - 1), p1 = pick(i), p2 = pick(i + 1), p3 = pick(i + 2), u2 = u * u, u3 = u2 * u;
  const c = a => 0.5 * (2 * p1[a] + (p2[a] - p0[a]) * u + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * u2 + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * u3);
  return out.set(c(0), c(1), c(2));
}

// Камера: лёжа смотрит вверх в шахту, озирается, садится, встаёт; когда створки открылись — вылетает наружу
// и облетает Глэйд, а в конце опускается в глаза Томаса
const _lp = new THREE.Vector3(), _ll = new THREE.Vector3();
function liftCamera(cam) {
  const L = Lift, t = L.t, x = tw(MID), z = tw(MID), y = L.cageY;
  if (t >= LIFT_FLY) {
    const ft = flyTime(t);
    cam.position.copy(flyPoint('p', ft, _lp));
    cam.lookAt(flyPoint('l', ft, _ll));
    return;
  }
  const sit = liftEase((t - 8) / 2.5), stand = liftEase((t - 12) / 2.2);
  const eye = 0.32 + sit * 0.6 + stand * 0.75;
  // Озирается; к остановке взгляд замирает на проёме над головой (с этой позы начинается облёт)
  const look = t < 8 ? Math.sin(t * 0.55) * 0.9 : t < 12 ? -0.8 + (t - 8) * 0.5 : 0.4 * Math.sin(t * 0.4) * (1 - liftEase((t - 14) / 3));
  const pitch = t < 8 ? 1.25 - Math.max(0, Math.sin(t * 0.8)) * 0.35 : t < 14 ? 0.15 + (t - 8) * 0.03 : 0.33 + liftEase((t - 14) / 1.6) * 0.62;
  _lp.set(x + (1 - sit) * 0.35, y + eye, z + (1 - sit) * 0.2);
  const sh = Game.shake * 0.06;
  _lp.x += shakeWave(t, 0) * sh;
  _lp.y += shakeWave(t, 1) * sh;
  _lp.z += shakeWave(t, 2) * sh * 0.6;
  cam.position.copy(_lp);
  cam.rotation.set(pitch, -look, (1 - sit) * 0.35);
}

function finishLift() {
  const L = Lift;
  if (!L.active) return;
  L.active = false;
  L.cage.position.y = LIFT_FLOOR;
  setBoxDoors(1);                          // клетка наверху, створки открыты — шахта и клетка видны сквозь проём
  L.lightSrc.intensity = 0;
  document.body.classList.remove('lift');
  if (L.skipEl) L.skipEl.hidden = true;
  const cap = document.getElementById('lift-caption');
  if (cap) cap.classList.remove('on');
  Sound.stopLift();
  // Томас выбрался из Ящика и стоит к югу от него лицом к Башне — там, куда опустилась камера облёта
  const p = Game.player, ex = LIFT_EXIT;
  Object.assign(p, { x: MID, y: MID + ex.dy, h: groundH(tw(MID), tw(MID + ex.dy)), vh: 0, yaw: ex.yaw, pitch: ex.pitch });
  Game.shake = 0;
  L.out = true;
  if (L.done) L.done();
}

// Створки захлопываются, как только Томас отошёл от Ящика на 3 м и в клетке никого не осталось
function updateBoxDoors(dt) {
  const L = Lift;
  if (L.active || !L.cage) return;
  if (L.out && L.doors >= 1) {
    const p = Game.player;
    const busy = Game.npcs.some(n => (n.fresh && n.fresh.stage === 'box') || boxGap(tw(n.x), tw(n.y)) < 0.8);
    if (boxGap(tw(p.x), tw(p.y)) > 3 && !busy) { L.out = false; L.doorDir = -1; }
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
}
