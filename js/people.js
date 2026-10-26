// Люди на моделях из Blender (MakeHuman): жители Глэйда и Тереза (скелет + анимации), тело Томаса (видны ноги)
// и рука от первого лица. Если моделей нет — жители рисуются запасной моделью из humans.js.

const PEOPLE = { npcs: new Map(), body: null, fp: null };
const _bv1 = new THREE.Vector3(), _bv2 = new THREE.Vector3(), _bv3 = new THREE.Vector3(), _bv4 = new THREE.Vector3();
const _bq = new THREE.Quaternion(), _bm = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _down = new THREE.Vector3(0, -1, 0);
const MODEL_H = { glader: 1.88, teresa: 1.62 };           // рост моделей в метрах (с причёской)
// Естественная скорость клипов из записей движений (м/с при timeScale 1) — по ней темп шага подгоняется под скорость
const GAIT = { glader: { walk: 1.44, run: 3.53, carry: 0.66 }, teresa: { walk: 1.22, run: 3.0, carry: 0.56 } };
// Кулак правой руки (как в Blender: сгиб вокруг оси X кости) — поверх любого клипа, пока в руке инструмент
// Хват инструмента — как у рук игрока (viewmodel.py: GRIP 62°, мизинец сжат сильнее указательного): пальцы
// обхватывают рукоять, а точка хвата grip_r в модели стоит в середине этого обхвата
const FIST = [['index', [0.85, 1, 0.75], 58.3], ['middle', [0.85, 1, 0.75], 62], ['ring', [0.85, 1, 0.75], 65.1], ['pinky', [0.85, 1, 0.75], 68.2],
  ['thumb', [0.35, 0.6, 0.6], 50]];
const _xAxis = new THREE.Vector3(1, 0, 0);

function tinted(mat, hex) {
  const m = mat.clone();
  m.color = new THREE.Color(hex).convertSRGBToLinear();
  return m;
}

// Клон глэйдера (или Терезы) со своими цветами кожи, одежды и волос, причёской и набором анимаций
function makeGladerModel(spec) {
  const id = spec.style === 'long' && ASSETS.gltf.teresa ? 'teresa' : 'glader', g = ASSETS.gltf[id];
  const root = THREE.SkeletonUtils.clone(g.scene);
  const colors = { skin: spec.skin, shirt: spec.shirt, pants: spec.pants, hair: spec.hair, brows: spec.hair };
  const cache = {};
  const bones = {};
  root.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    // У каждой причёски своя текстура, а цвет — общий цвет волос
    const remap = m => {
      const hex = colors[m.name.startsWith('hair_') ? 'hair' : m.name];
      if (!hex) return m;
      return cache[m.name] || (cache[m.name] = tinted(m, hex));
    };
    o.material = Array.isArray(o.material) ? o.material.map(remap) : remap(o.material);
    if (o.name.startsWith('hair_')) o.visible = o.name === 'hair_' + (spec.style || 'short');
  });
  const holder = new THREE.Group();
  holder.add(root);
  // Рост жителей задан относительно модели парня; модель Терезы уже своего роста
  const scale = id === 'teresa' ? spec.height / 0.95 : spec.height || 1;
  root.scale.setScalar(scale);
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of g.animations) actions[clip.name] = mixer.clipAction(clip);
  // Поза головы в покое: в клипах, где голова не двигается, дорожки для неё нет,
  // поэтому перед каждым кадром возвращаем её сюда и уже потом поворачиваем к Томасу
  const headRest = bones.head ? bones.head.quaternion.clone() : null;
  const fist = [];
  for (const [f, k, deg] of FIST) {
    for (let j = 1; j <= 3; j++) {
      const b = bones[`${f}_0${j}_r`];
      if (b) fist.push([b, b.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(_xAxis, THREE.MathUtils.degToRad(deg * k[j - 1])))]);
    }
  }
  return { holder, root, mixer, actions, bones, headRest, fist, grip: root.getObjectByName('grip_r'), gait: GAIT[id], gaitK: scale,
    current: null, height: MODEL_H[id] * scale, speed: 0 };
}

function playAct(m, name, speed = 1, start = 0) {
  const a = m.actions[name] || m.actions.idle;
  if (!a) return;
  a.timeScale = speed;
  if (m.current === a) return;
  a.reset().play();
  a.time = start;
  if (m.current) a.crossFadeFrom(m.current, 0.3, false);
  m.current = a;
}

// Инструмент в правой руке (Blender: рукоять вдоль +Y, хват в начале координат, лезвие/боёк — к +X).
// Хват — середина ладони; рукоять идёт поперёк кулака (от мизинца к указательному), лезвие смотрит
// туда же, куда кисть. Копьё стража держится вертикально, мотыга клонится к земле
function placeTool(m, toolType) {
  if (!m.tool) return;
  const B = m.bones, hand = B.hand_r, fore = B.lowerarm_r;
  if (!hand || !fore) return;
  hand.getWorldPosition(_bv2);
  fore.getWorldPosition(_bv4);
  _bv4.subVectors(_bv2, _bv4).normalize();                     // предплечье → кисть
  if (B.middle_01_r && B.index_01_r && B.pinky_01_r) {
    B.middle_01_r.getWorldPosition(_bv1);
    _bv2.lerp(_bv1, 0.65);
    B.index_01_r.getWorldPosition(_bv1);
    B.pinky_01_r.getWorldPosition(_bv3);
    _bv1.sub(_bv3).normalize().multiplyScalar(0.85).addScaledVector(_bv4, 0.3).normalize();
  } else _bv1.copy(_bv4);
  m.tool.position.copy(_bv2);
  if (toolType === 'spear') { m.tool.quaternion.identity(); return; }
  if (toolType === 'hoe') _bv1.lerp(_down, 0.35).normalize();
  // Базис инструмента: Y — рукоять, X — лезвие по направлению кисти (без составляющей вдоль рукояти)
  _bv3.copy(_bv4).addScaledVector(_bv1, -_bv4.dot(_bv1));
  if (_bv3.lengthSq() < 1e-6) { m.tool.quaternion.setFromUnitVectors(_up, _bv1); return; }
  _bv3.normalize();
  _bv2.crossVectors(_bv3, _bv1);
  m.tool.quaternion.setFromRotationMatrix(_bm.makeBasis(_bv3, _bv1, _bv2));
}

// Инструмент — в кулак, на точку хвата из Blender (рукоять через кулак, лезвие — по костяшкам).
// Копьё стража стоит древком к земле, его ставим отдельно (placeTool); без точки хвата — тоже по-старому
function attachTool(m, type) {
  if (m.grip && type !== 'spear' && (ASSETS.models['gear_' + type] || ASSETS.models['tool_' + type])) m.grip.add(m.tool);
  else World.scene.add(m.tool);
}

function dropTool(m) {
  if (m.tool && m.tool.parent) m.tool.parent.remove(m.tool);
}

// Житель сменил работу — в руке другой инструмент
function refreshNpcTool(n) {
  const m = PEOPLE.npcs.get(n);
  if (!m) return;
  dropTool(m);
  m.tool = n.tool ? toolModel(n.tool) : null;
  if (m.tool) attachTool(m, n.tool);
}

function toolModel(type) {
  const src = ASSETS.models['gear_' + type] || ASSETS.models['tool_' + type];
  if (!src) return makeTool(type);
  const t = src.clone(true);
  t.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return t;
}

// Охапка поленьев в руках у того, кто несёт дрова к поленнице
function logBundle() {
  const g = new THREE.Group(), geo = new THREE.CylinderGeometry(0.07, 0.075, 0.62, 8).rotateZ(Math.PI / 2);
  [[0, 0, 0], [0, 0.11, 0.04], [0, 0.03, 0.13], [0.04, 0.13, 0.15]].forEach(([x, y, z], i) => {
    const log = new THREE.Mesh(geo, GM.bark);
    log.position.set(x, y, z);
    log.rotation.y = (i - 1.5) * 0.12;
    log.castShadow = true;
    g.add(log);
  });
  return g;
}

// Работа у предмета: насколько близко к нему подходит житель (центр предмета — в goal.face)
function workReach(n) {
  const f = n.goal && n.goal.face;
  if (!f) return 0;
  if (f === LAYOUT.chopBlock && n.act === 'chop') return 1.15;
  if (f === LAYOUT.woodpile && n.act === 'pickup') return 1.9;
  if (f === LAYOUT.scaffold && n.act === 'hammer') return 1.75;
  return 0;
}

// Какую анимацию играть: раненый хромает, Чак прыгает от радости, на пожаре плещут водой, дрова несут в охапке
function visualAct(n) {
  if (n.injured > 0 && (n.act === 'walk' || n.act === 'run')) return 'walk';
  if (n.act === 'wave' || (n.act === 'idle' && n.waveT > 0)) return n.role === 'follower' ? 'jump' : 'wave';
  if (n.act === 'cook' && n.goal && n.goal.fire) return 'throw';
  if (n.act === 'walk' && n.goal && n.goal.carry) return 'carry';
  return n.act;
}

// Звуки в такт движению из записи: удар — в нижней точке замаха правой руки (если она опустилась на столько метров),
// шаг — когда стопа, опускаясь, касается земли
const WORK_HIT = { hammer: 0.1, chop: 0.3, hoe: 0.25 };
function lowPoint(m, key, bone, drop) {
  bone.getWorldPosition(_bv3);
  const y = _bv3.y, s = m[key] || (m[key] = { y, top: y, v: 0 });
  const v = y - s.y, hit = s.v < -1e-4 && v >= 0 && s.top - y > drop;
  if (hit) s.top = y;
  else if (y > s.top) s.top = y;
  s.y = y;
  s.v = v;
  return hit;
}

function workSounds(m, act, d, x, y, z) {
  if (d > 40 || !m.node.visible) return;
  const B = m.bones;
  if (WORK_HIT[act] !== undefined && B.hand_r) {
    if (lowPoint(m, 'hitR', B.hand_r, WORK_HIT[act] * m.gaitK)) Sound.work(act, x, y, z);
  } else if ((act === 'walk' || act === 'run' || act === 'carry') && d < 14 && B.foot_l) {
    if (lowPoint(m, 'stepL', B.foot_l, 0.03) || lowPoint(m, 'stepR', B.foot_r, 0.03)) Sound.work('step', x, y, z);
  }
}

// Где житель виден на самом деле (в тайлах): у рабочего места модель стоит ближе к предмету, чем клетка пути
function npcSpot(n) {
  const m = PEOPLE.npcs.get(n);
  return m && m.node ? { x: m.node.position.x / S, y: m.node.position.z / S } : n;
}

function npcY(n) {
  const x = tw(n.x), z = tw(n.y), box = boxFloorAt(x, z);
  if (box !== null) return box;            // новичок стоит в открытом Ящике
  return supportH(x, z, groundH(x, z) + 1.5);
}

function syncNpcs(t, dt) {
  const p = Game.player, useGlb = !!ASSETS.gltf.glader && !!THREE.SkeletonUtils;
  for (const n of Game.npcs) {
    let m = PEOPLE.npcs.get(n);
    if (!m) {
      m = useGlb ? makeGladerModel(n) : { procedural: makeHuman(n) };
      const node = m.holder || m.procedural.root;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(n.name), transparent: true, depthWrite: false, fog: false }));
      label.scale.set(1.15, 0.29, 1);
      label.position.y = m.height ? m.height + 0.24 : 2.12;
      node.add(label);
      m.label = label;
      m.node = node;
      if (useGlb && n.tool) {
        m.tool = toolModel(n.tool);
        attachTool(m, n.tool);
      }
      if (useGlb && n.role === 'woodcutter') {
        m.bundle = logBundle();
        m.bundle.position.set(0, 1.12, 0.33);
        m.bundle.visible = false;
        m.root.add(m.bundle);
      }
      m.off = new THREE.Vector2();
      m.lastWalk = n.walk;
      World.scene.add(node);
      PEOPLE.npcs.set(n, m);
    }
    const d = Math.hypot(n.x - p.x, n.y - p.y) * S;
    m.label.visible = d < 14 && n.act !== 'sleep';
    m.node.visible = d < World.npcDist;                 // дальность — от ступени качества
    // Дальние жители дешевле: дальше 30 м без тени, дальше 60 м без мелочей лица и с анимацией через кадр
    const band = d < 30 ? 0 : d < 60 ? 1 : 2;
    if (m.band !== band && !m.procedural) npcDetail(m, band);
    let x = tw(n.x), z = tw(n.y), y = npcY(n), face = n.face;
    // У колоды, поленницы и стройки житель подходит к самому предмету (клетка пути — в нескольких метрах)
    const reach = m.procedural ? 0 : workReach(n);
    let tx = 0, tz = 0;
    if (reach) {
      const fx = tw(n.goal.face.x) - x, fz = tw(n.goal.face.y) - z, fd = Math.hypot(fx, fz);
      // Вдвоём у одного места встают рядом, а не друг в друга
      const side = (n.seat % 2 ? 0.5 : -0.5);
      if (fd > reach) { tx = fx / fd * (fd - reach) - fz / fd * side; tz = fz / fd * (fd - reach) + fx / fd * side; }
    }
    const approaching = Math.hypot(tx - m.off.x, tz - m.off.y) > 0.12;
    m.off.x += (tx - m.off.x) * Math.min(1, dt * 1.6);
    m.off.y += (tz - m.off.y) * Math.min(1, dt * 1.6);
    x += m.off.x;
    z += m.off.y;
    m.node.rotation.set(0, 0, 0);
    if (n.act === 'sleep' && n.goal && n.goal.bed) {
      // Лежит на кровати на спине, головой к западной стороне кровати
      const b = n.goal.bed;
      x = tw(b.wx) + 0.88;
      z = tw(b.wy);
      y = supportH(tw(b.wx), tw(b.wy), y + 0.5) + 0.58;
      m.node.rotation.order = 'YXZ';
      m.node.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
    } else if (n.act === 'sit') {
      // Сидит на бревне: ближний или дальний круг скамеек у костра
      const fx = tw(LAYOUT.campfire.x), fz = tw(LAYOUT.campfire.y);
      const dx = x - fx, dz = z - fz, dist = Math.hypot(dx, dz) || 1, r = dist < 5.4 ? 4.0 : 6.4;
      x = fx + dx / dist * r;
      z = fz + dz / dist * r;
      y = groundH(x, z) + 0.42;
      face = Math.atan2(-dz, -dx);
    }
    n.wy = y;
    m.node.position.set(x, y, z);
    if (n.act !== 'sleep') m.node.rotation.y = Math.PI / 2 - face;
    m.node.updateMatrixWorld(true);
    if (m.procedural) {
      if (n.act !== 'sleep') m.node.rotation.y = -face;
      animateHuman(m.procedural, n.act === 'sleep' ? 'idle' : n.act, n.walk * (n.act === 'run' ? 1.96 : 4.19), n.t, dt, n.lookYaw);
      continue;
    }
    // Шаг и бег в темп настоящей скорости (м/с), чтобы ноги не скользили по земле.
    // Раненый хромает: медленный шаг и крен в сторону больной ноги
    m.speed += ((n.walk - m.lastWalk) / Math.max(dt, 1e-3) - m.speed) * Math.min(1, dt * 6);
    m.lastWalk = n.walk;
    const limp = n.injured > 0 && (n.act === 'walk' || n.act === 'run');
    let act = approaching && reach ? (n.goal.carry ? 'carry' : 'walk') : visualAct(n), speed = 1;
    if (act === 'walk' || act === 'carry') speed = approaching && reach ? 1.2 : Math.min(2.2, Math.max(0.6, m.speed / (m.gait[act] * m.gaitK)));
    else if (act === 'run') speed = Math.min(2.2, Math.max(0.7, m.speed / (m.gait.run * m.gaitK)));
    if (limp) speed = 0.8;
    if (m.headRest) m.bones.head.quaternion.copy(m.headRest);
    playAct(m, act, speed);
    if (limp) m.node.rotation.z = Math.sin(n.t * 4.5) * 0.09 + 0.05;
    // Невидимого не анимируем; далёкого — через кадр (время копится, шаг не сбивается)
    m.mixAcc = Math.min(1, (m.mixAcc || 0) + dt);
    if (m.node.visible && (band < 2 || (m.skip = !m.skip))) {
      m.mixer.update(m.mixAcc);
      m.mixAcc = 0;
      if (m.tool && m.tool.visible && act !== 'sit') for (const [b, q] of m.fist) b.quaternion.copy(q);
    }
    workSounds(m, act, d, x, y, z);
    if (m.headRest && n.act !== 'sleep') m.bones.head.rotateY(n.lookYaw * 0.6);
    if (m.tool) {
      m.tool.visible = m.node.visible && n.act !== 'sleep' && n.act !== 'sit' && act !== 'jump';
      if (m.tool.parent === World.scene) placeTool(m, n.tool);
    }
    if (m.bundle) m.bundle.visible = act === 'carry';
  }
}

// Детали жителя по расстоянию: 0 — всё с тенью, 1 — без тени, 2 — ещё и без глаз, бровей и ресниц.
// Мелочи лица тень не отбрасывают никогда; спрятанные варианты причёсок остаются спрятанными
const FACE_BITS = ['eyes', 'brows', 'lashes'];
function npcDetail(m, band) {
  m.band = band;
  if (!m.parts) {
    m.parts = [];
    m.node.traverse(o => { if (o.isMesh) m.parts.push({ o, shown: o.visible, face: FACE_BITS.includes(o.name) }); });
  }
  for (const p of m.parts) {
    p.o.castShadow = band === 0 && !p.face;
    if (p.face) p.o.visible = p.shown && band < 2;
  }
}

function clearNpcModels() {
  for (const m of PEOPLE.npcs.values()) {
    World.scene.remove(m.node);
    dropTool(m);
  }
  PEOPLE.npcs.clear();
}

/* ---------- тело Томаса: видны ноги, когда смотришь вниз ---------- */

// Голову и руки тела прячем: их место занимают камера и рука от первого лица
const HIDDEN_BONES = ['head', 'upperarm_l', 'upperarm_r'];

function initPlayerBody() {
  if (!ASSETS.gltf.glader || !THREE.SkeletonUtils) return;
  // Рост подобран так, чтобы глаза модели были на высоте камеры (1.68 м)
  const m = makeGladerModel({ skin: '#e2b896', shirt: '#7d8a92', pants: '#5c5446', hair: '#3a2718', style: 'short', height: 0.965 });
  for (const b of HIDDEN_BONES) if (m.bones[b]) m.bones[b].scale.setScalar(0.001);
  m.root.traverse(o => { if (o.isMesh && (o.name.startsWith('hair_') || ['eyes', 'brows', 'lashes'].includes(o.name))) o.visible = false; });
  World.scene.add(m.holder);
  PEOPLE.body = m;
}

function updatePlayerBody(dt) {
  const m = PEOPLE.body, p = Game.player;
  if (!m) return;
  m.holder.visible = Game.state !== 'title' && !Lift.active;   // в Ящике камера своя — тело стояло бы над проёмом
  const back = 0.18;
  m.holder.position.set(tw(p.x) - Math.cos(p.yaw) * back, p.h, tw(p.y) - Math.sin(p.yaw) * back);
  m.holder.rotation.y = Math.PI / 2 - p.yaw;
  // Томас и шагом идёт быстро (~6 м/с — как трусца), поэтому ноги — из клипа бега, в темп настоящей скорости.
  // В прыжке пропускаем присед из начала клипа: Томас отрывается от земли сразу
  const v = Math.hypot(p.x - (m.px ?? p.x), p.y - (m.py ?? p.y)) * S / Math.max(dt, 1e-3);
  m.px = p.x;
  m.py = p.y;
  m.v = (m.v || 0) + (v - (m.v || 0)) * Math.min(1, dt * 8);
  const act = p.climb ? 'climb' : p.air ? 'jump' : !p.moving ? 'idle' : 'run';
  playAct(m, act, act === 'run' ? Math.min(2.4, Math.max(0.8, m.v / m.gait.run)) : act === 'climb' ? (Input.forward() ? 1 : 0) : act === 'jump' ? 1.25 : 1,
    act === 'jump' ? 0.38 : 0);
  m.mixer.update(dt);
  for (const b of HIDDEN_BONES) if (m.bones[b]) m.bones[b].scale.setScalar(0.001);
}

/* ---------- рука от первого лица с предметом ---------- */

// Рука и предмет в ней почти касаются света факела: яркость выше колена мягко сжимаем
// (весь цвет разом, чтобы не терять оттенок кожи), иначе кисть выгорает в белое пятно
function viewModelMat(src) {
  const m = src.clone();
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <output_fragment>', `float vmL = max(max(outgoingLight.r, outgoingLight.g), max(outgoingLight.b, 1e-4));
      if (vmL > 0.3) outgoingLight *= (0.3 + (vmL - 0.3) / (1.0 + (vmL - 0.3) * 3.0)) / vmL;
      #include <output_fragment>`);
  };
  m.customProgramCacheKey = () => 'viewModel';
  return m;
}

// Как держать вещь: поза покоя (клип hold_*), точка хвата в кисти и движение работы (клип use_*)
const FP_HOLD = {
  axe: ['tool', 'grip_r', 'use_chop'], pickaxe: ['tool', 'grip_r', 'use_chop'], hammer: ['tool', 'grip_r', 'use_hammer'],
  crowbar: ['tool', 'grip_r', 'use_hammer'], knife: ['tool', 'grip_r', 'use_slash'], spear: ['spear', 'grip_r', 'use_thrust'],
  torch: ['torch', 'grip_r', null], lantern: ['lantern', 'hang_r', null], bucket: ['bucket', 'hang_r', null],
  map: ['paper', 'palm_r', null], note: ['paper', 'palm_r', null], keycard: ['paper', 'palm_r', null],
  apple: ['small', 'palm_r', 'use_eat'], ration: ['small', 'palm_r', 'use_eat'], stew: ['small', 'palm_r', 'use_eat'],
  flask: ['small', 'palm_r', 'use_drink'], bandage: ['small', 'palm_r', 'use_bandage'],
};
const FP_SMALL = ['small', 'palm_r', null];
const FP_SHEET = { map: 0.06, note: 0.035 };      // на сколько лист сдвинут от середины ладони к кончикам пальцев
const _fq1 = new THREE.Quaternion(), _fq2 = new THREE.Quaternion(), _fv = new THREE.Vector3();

// Руки от первого лица, как в Rust (fp_arms из Blender): обе руки на скелете, вещь в кулаке, на ладони или на дужке,
// клипы покоя и работы. Без модели — прежняя рука из одной формы
function initFirstPerson() {
  const g = ASSETS.gltf.fp_arms;
  if (!g || !THREE.SkeletonUtils) { initLegacyArm(); return; }
  const root = THREE.SkeletonUtils.clone(g.scene);
  const tint = { skin: '#e2b896', shirt: '#7d8a92' };
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.frustumCulled = false;
    const fix = m => {
      const v = viewModelMat(m);
      if (tint[m.name]) v.color = new THREE.Color(tint[m.name]).convertSRGBToLinear();
      return v;
    };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
  // Глаза модели — в камеру: модель смотрит по +Z, камера — по −Z
  const holder = new THREE.Group();
  holder.add(root);
  root.rotation.y = Math.PI;
  root.updateMatrixWorld(true);
  const eye = root.getObjectByName('eye');
  if (eye) root.position.sub(eye.getWorldPosition(new THREE.Vector3()));
  World.camera.add(holder);
  const mixer = new THREE.AnimationMixer(root), actions = {};
  for (const clip of g.animations) {
    const a = actions[clip.name] = mixer.clipAction(clip);
    if (clip.name.startsWith('use_')) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
  }
  const sockets = {};
  for (const n of ['grip_r', 'palm_r', 'hang_r']) sockets[n] = root.getObjectByName(n);
  PEOPLE.fp = { holder, root, mixer, actions, sockets, cur: null, use: null, itemType: null, item: null, hold: null,
    sway: 0, swayY: 0, draw: 1, sprint: 0, lastSw: 0, lock: null };
}

function fpPlay(F, name, fade = 0.22) {
  const a = F.actions[name] || F.actions.hold_small;
  if (!a || F.cur === a) return;
  a.reset().play();
  if (F.cur) a.crossFadeFrom(F.cur, fade, false);
  F.cur = a;
}

// Движение работы: один раз, потом снова поза покоя. from — с какой доли клипа начать (удар звучит сразу,
// поэтому взмах инструментом начинаем с вершины замаха — лезвие опускается вместе со звуком)
const FP_STRIKE = { use_chop: 0.3, use_hammer: 0.35, use_slash: 0.3, use_grab: 0.25 };
function fpUseClip(F, name, from = 0) {
  if (!name || !F.actions[name]) return;
  F.cur = null;
  fpPlay(F, name, 0.08);
  F.use = F.actions[name];
  F.use.time = from * F.use.getClip().duration;
}

// Из useHeld: съесть, выпить, перевязаться — вещь видна в руке, пока идёт движение, даже если уже израсходована
function fpUse(type) {
  const F = PEOPLE.fp, clip = FP_HOLD[type] && FP_HOLD[type][2];
  if (!F || !F.mixer || !clip || !F.actions[clip]) return;
  F.lock = { type, t: F.actions[clip].getClip().duration };
  if (F.itemType !== type) { fpItem(F, type); F.itemType = type; }
  fpUseClip(F, clip);
}

function fpItem(F, type) {
  if (F.item && F.item.parent) F.item.parent.remove(F.item);
  F.item = null;
  F.hold = type ? FP_HOLD[type] || FP_SMALL : ['empty', null, null];
  const id = type && itemModel(type), src = id && ASSETS.models[id];
  if (!src) return;
  F.item = src.clone(true);
  F.item.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.frustumCulled = false;
    o.material = Array.isArray(o.material) ? o.material.map(viewModelMat) : viewModelMat(o.material);
  });
  // Сумки и вещи без новой модели — маленькими на ладони
  if (!id.startsWith('gear_')) F.item.scale.setScalar(ITEM_DEFS[type].bag ? 0.45 : 0.8);
  // Лист держат за нижний край: он лежит на пальцах и выше них, большой палец прижимает его спереди
  if (FP_SHEET[type]) F.item.position.z = -FP_SHEET[type];
  // Факел — с живым пламенем (flame.js) над намоткой; горит, пока есть смола
  if (type === 'torch') {
    F.flame = makeFlame(0.24, 3, 0.012);
    (F.item.getObjectByName('flame') || F.item).add(F.flame);
    F.flame.position.y -= 0.03;
  } else F.flame = null;
  (F.sockets[F.hold[1]] || F.sockets.grip_r || F.root).add(F.item);
}

function updateFirstPerson(dt) {
  const F = PEOPLE.fp, p = Game.player;
  if (!F) return;
  if (!F.mixer) { updateLegacyArm(dt); return; }
  const h = heldItem();
  let type = h ? h.type : null;
  if (F.lock) {
    F.lock.t -= dt;
    if (F.lock.t > 0) type = F.lock.type;
    else F.lock = null;
  }
  if (type !== F.itemType || !F.hold) {
    fpItem(F, type);
    F.itemType = type;
    F.draw = 0;
    F.use = null;
  }
  const hold = F.hold;
  F.holder.visible = Game.state === 'play' && !Lift.active;
  // Удар инструментом (рубка, кирка, стройка) — по каждому взмаху; пустой рукой — сгрести хворост
  const sw = Math.max(Gather.swing, Settle.swing || 0);
  if (sw > F.lastSw + 0.5) {
    const clip = type ? (FP_STRIKE[hold[2]] !== undefined ? hold[2] : null) : 'use_grab';
    fpUseClip(F, clip, FP_STRIKE[clip] || 0);
  }
  F.lastSw = sw;
  if (F.use && (!F.use.isRunning() || p.climb)) F.use = null;
  if (!F.use) fpPlay(F, p.climb ? 'climb' : 'hold_' + hold[0]);
  if (F.actions.climb) F.actions.climb.timeScale = p.climb ? Math.abs(Input.forward()) * 1.3 : 1;
  F.mixer.update(dt);
  if (F.item) F.item.visible = !p.climb;
  // Достать вещь: рука поднимается снизу; рывок — руки опущены и наклонены; шаг — покачивание; поворот — рука отстаёт
  F.draw = Math.min(1, F.draw + dt * 3.2);
  const drawK = 1 - Math.pow(1 - F.draw, 3), d = Math.max(dt, 1e-3);
  F.sprint += ((p.sprinting && !p.climb ? 1 : 0) - F.sprint) * Math.min(1, dt * 7);
  const step = p.moving && !p.climb ? p.walk * S * (p.sprinting ? 1.7 : 2.1) : 0;
  const bob = Math.sin(step), bob2 = Math.cos(step / 2);
  let dyaw = p.yaw - (F.yaw ?? p.yaw);
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const dpitch = p.pitch - (F.pitch ?? p.pitch);
  F.yaw = p.yaw;
  F.pitch = p.pitch;
  F.sway += (Math.max(-0.05, Math.min(0.05, -dyaw / d * 0.01)) - F.sway) * Math.min(1, dt * 8);
  F.swayY += (Math.max(-0.04, Math.min(0.04, -dpitch / d * 0.008)) - F.swayY) * Math.min(1, dt * 8);
  const amp = p.sprinting ? 1.6 : 1;
  F.holder.position.set(F.sway + bob2 * 0.012 * amp, F.swayY - Math.abs(bob) * 0.012 * amp - F.sprint * 0.06 - (1 - drawK) * 0.32, F.sprint * 0.03);
  F.holder.rotation.set(-F.sprint * 0.3 - (1 - drawK) * 0.5 + F.swayY * 0.6, F.sway * 1.2 + F.sprint * 0.18, bob2 * 0.02 * amp + F.sprint * 0.12);
  // Фонарь и ведро висят отвесно, как бы ни была повёрнута кисть
  if (F.item && hold[1] === 'hang_r') {
    F.item.parent.getWorldQuaternion(_fq1).invert();
    World.camera.getWorldDirection(_fv);
    _fq2.setFromAxisAngle(_up, Math.atan2(-_fv.x, -_fv.z));
    F.item.quaternion.copy(_fq1.multiply(_fq2));
  }
  // Огонь факела и свет — от пламени (точка flame в модели), а не от ладони; стекло фонаря светится
  const lit = (type === 'torch' || type === 'lantern') && h && h.fuel > 0;
  if (F.flame) F.flame.visible = lit && Game.state === 'play';
  if (F.item && type === 'lantern') F.item.traverse(o => { if (o.isMesh && o.material.name === 'glass') { o.material.emissive.setRGB(1, 0.62, 0.3); o.material.emissiveIntensity = lit ? 1.4 : 0; } });
  if (lit && F.item && Game.state === 'play') {
    (F.item.getObjectByName('flame') || F.item).getWorldPosition(_bv2);
    if (type === 'torch') emitTorch(_bv2.x, _bv2.y - 0.02, _bv2.z, dt);
    World.handLight.position.copy(World.camera.worldToLocal(_bv2));
    World.handLight.position.y += type === 'torch' ? 0.1 : 0.03;
  }
}

function initLegacyArm() {
  const fp = new THREE.Group();
  fp.position.set(0.22, -0.3, -0.18);
  World.camera.add(fp);
  let arm = null, grip = fp;
  if (ASSETS.models.fp_arm) {
    arm = ASSETS.models.fp_arm.clone(true);
    arm.traverse(o => {
      if (o.isMesh) {
        o.castShadow = false;
        o.material = Array.isArray(o.material) ? o.material.map(viewModelMat) : viewModelMat(o.material);
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const mm of ms) {
          if (mm.name === 'skin') mm.color = new THREE.Color('#e2b896').convertSRGBToLinear();
          if (mm.name === 'shirt') mm.color = new THREE.Color('#7d8a92').convertSRGBToLinear();
        }
      }
      if (o.name === 'grip') grip = o;
    });
    // Предплечье тянется вперёд и чуть вверх, кисть — у правого нижнего края экрана
    arm.rotation.set(0.35, 0.1, 0);
    fp.add(arm);
  }
  // Левая рука — зеркальная копия правой: видна, когда работаешь, бежишь или лезешь по лестнице
  let left = null;
  if (arm) {
    left = new THREE.Group();
    left.position.set(-0.22, -0.3, -0.18);
    const armL = arm.clone(true);
    armL.scale.x = -1;
    armL.rotation.set(0.35, -0.1, 0);
    left.add(armL);
    left.visible = false;
    World.camera.add(left);
  }
  PEOPLE.fp = { group: fp, arm, grip, left, itemType: null, item: null, sway: 0 };
}

function updateLegacyArm(dt) {
  const F = PEOPLE.fp, p = Game.player;
  if (!F) return;
  const h = heldItem();
  const type = h ? h.type : null;
  if (type !== F.itemType) {
    if (F.item) F.grip.remove(F.item);
    F.item = null;
    if (type && ASSETS.models[itemModel(type)]) {
      F.item = ASSETS.models[itemModel(type)].clone(true);
      F.item.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.material = Array.isArray(o.material) ? o.material.map(viewModelMat) : viewModelMat(o.material);
      });
      // Предметы смоделированы «вперёд по −Z»; в руке их поворачиваем остриём вперёд
      if (type === 'spear') F.item.position.z = 0.35;
      if (type === 'torch') F.item.rotation.x = 0.5;
      if (type === 'lantern') F.item.position.y = -0.3;      // фонарь висит под рукой на дужке
      if (type === 'bag' || type === 'flask' || type === 'apple') F.item.position.y = -0.02;
      if (type === 'crowbar') F.item.position.set(0, -0.02, -0.24);   // лом держат за конец
      if (type === 'herb') F.item.scale.setScalar(0.6);
      // Инструменты смоделированы стоймя: держим за черенок, головка вверх-вперёд
      if (['axe', 'pickaxe', 'hammer'].includes(type)) { F.item.rotation.set(-1.2, 0, 0.15); F.item.position.set(0, -0.06, 0.06); }
      if (type === 'bucket') { F.item.position.set(0, -0.42, 0.05); F.item.scale.setScalar(0.85); }
      if (type === 'stew') F.item.position.y = -0.03;
      if (type === 'note' || type === 'keycard' || type === 'watch') F.item.rotation.x = 0.9;    // разворачиваем к глазам
      F.grip.add(F.item);
    }
    F.itemType = type;
  }
  // Правая рука видна всегда (с предметом или пустая), левая — в работе, на бегу и на лестнице
  F.group.visible = Game.state === 'play' && !Lift.active && (!!type || !!F.arm);
  if (F.item) F.item.visible = !p.climb;
  // Покачивание руки при ходьбе и беге
  const bob = p.moving ? Math.sin(p.walk * S * (p.sprinting ? 1.7 : 2.1)) : 0;
  F.sway += ((Input.lookX || 0) * -0.0005 - F.sway) * Math.min(1, dt * 8);
  F.group.position.set(0.22 + bob * 0.012 + F.sway, -0.3 + Math.abs(bob) * (p.sprinting ? 0.03 : 0.015), -0.18);
  // Взмах инструментом при работе (рубка, кирка, стройка)
  const sw = Math.max(Gather.swing, Settle.swing || 0);
  F.group.rotation.x = sw > 0 ? Math.sin(sw * Math.PI) * 0.9 : 0;
  if (F.left) {
    const both = !!(Gather.work || Settle.work || p.climb || p.sprinting);
    F.left.visible = F.group.visible && both;
    const climbK = p.climb ? Math.sin(p.walk * S * 3) * 0.09 : 0, run = p.sprinting ? -bob * 0.05 : 0;
    F.left.position.set(-0.22 - bob * 0.012 + F.sway, -0.3 - climbK + run + (p.climb ? 0.12 : 0), -0.18);
    F.left.rotation.x = sw > 0 ? Math.sin(sw * Math.PI) * 0.6 : p.climb ? 0.5 : 0;
    if (p.climb) F.group.position.y += climbK + 0.12;
  }
  if ((type === 'torch' || type === 'lantern') && h.fuel > 0 && F.item && Game.state === 'play') {
    F.item.getWorldPosition(_bv1);
    _bv2.set(0, type === 'torch' ? 0 : 0.12, type === 'torch' ? -0.42 : 0).applyQuaternion(F.item.getWorldQuaternion(_bq)).add(_bv1);
    if (type === 'torch') emitTorch(_bv2.x, _bv2.y - 0.05, _bv2.z, dt);
    // Свет исходит от пламени (или стекла фонаря), а не от ладони
    World.handLight.position.copy(World.camera.worldToLocal(_bv2));
    World.handLight.position.y += type === 'torch' ? 0.12 : 0.04;
  }
}
