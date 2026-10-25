// Люди на моделях из Blender (MakeHuman): жители Глэйда и Тереза (скелет + анимации), тело Томаса (видны ноги)
// и рука от первого лица. Если моделей нет — жители рисуются запасной моделью из humans.js.

const PEOPLE = { npcs: new Map(), body: null, fp: null };
const _bv1 = new THREE.Vector3(), _bv2 = new THREE.Vector3(), _bv3 = new THREE.Vector3(), _bv4 = new THREE.Vector3();
const _bq = new THREE.Quaternion(), _bm = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _down = new THREE.Vector3(0, -1, 0);
const MODEL_H = { glader: 1.88, teresa: 1.62 };           // рост моделей в метрах (с причёской)

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
  return { holder, root, mixer, actions, bones, headRest, current: null, height: MODEL_H[id] * scale, speed: 0 };
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

// Инструмент из Blender (топор, молоток, мотыга, половник, копьё) или запасной из примитивов
// Житель сменил работу — в руке другой инструмент
function refreshNpcTool(n) {
  const m = PEOPLE.npcs.get(n);
  if (!m) return;
  if (m.tool) World.scene.remove(m.tool);
  m.tool = n.tool ? toolModel(n.tool) : null;
  if (m.tool) World.scene.add(m.tool);
}

function toolModel(type) {
  const src = ASSETS.models['tool_' + type];
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

// Звуки работы в такт анимации: удар молота, топора, мотыги (доля клипа, где инструмент бьёт), шаги тех, кто рядом
const WORK_HIT = { hammer: 0.75, chop: 0.68, hoe: 0.75 };
function workSounds(m, act, d, x, y, z) {
  const a = m.current;
  if (!a || d > 40) { m.ph = null; return; }
  const dur = a.getClip().duration, ph = (a.time % dur) / dur;
  if (m.phAct !== a || m.ph === null || m.ph === undefined) { m.phAct = a; m.ph = ph; return; }
  const last = m.ph, crossed = at => (last <= ph ? last < at && ph >= at : at > last || ph >= at);
  m.ph = ph;
  const hit = WORK_HIT[act];
  if (hit !== undefined && crossed(hit)) Sound.work(act, x, y, z);
  else if ((act === 'walk' || act === 'run' || act === 'carry') && d < 14 && (crossed(0.25) || crossed(0.75))) Sound.work('step', x, y, z);
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
        World.scene.add(m.tool);
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
    m.node.visible = d < 170;
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
      y = supportH(tw(b.wx), tw(b.wy), y + 0.5) + 0.62;
      m.node.rotation.order = 'YXZ';
      m.node.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
    } else if (n.act === 'sit') {
      // Сидит на бревне: ближний или дальний круг скамеек у костра
      const fx = tw(LAYOUT.campfire.x), fz = tw(LAYOUT.campfire.y);
      const dx = x - fx, dz = z - fz, dist = Math.hypot(dx, dz) || 1, r = dist < 5.4 ? 4.0 : 6.4;
      x = fx + dx / dist * r;
      z = fz + dz / dist * r;
      y = groundH(x, z) + 0.02;
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
    if (act === 'walk' || act === 'carry') speed = approaching && reach ? 1.2 : Math.min(2.2, Math.max(0.6, m.speed / 1.12));
    else if (act === 'run') speed = Math.min(2.2, Math.max(0.7, m.speed / 3.8));
    if (limp) speed = 0.8;
    if (m.headRest) m.bones.head.quaternion.copy(m.headRest);
    playAct(m, act, speed);
    if (limp) m.node.rotation.z = Math.sin(n.t * 4.5) * 0.09 + 0.05;
    m.mixer.update(dt);
    workSounds(m, act, d, x, y, z);
    if (m.headRest && n.act !== 'sleep') m.bones.head.rotateY(n.lookYaw * 0.6);
    if (m.tool) {
      m.tool.visible = m.node.visible && n.act !== 'sleep' && n.act !== 'sit' && act !== 'jump';
      placeTool(m, n.tool);
    }
    if (m.bundle) m.bundle.visible = act === 'carry';
  }
}

function clearNpcModels() {
  for (const m of PEOPLE.npcs.values()) {
    World.scene.remove(m.node);
    if (m.tool) World.scene.remove(m.tool);
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
  const act = p.climb ? 'climb' : p.air ? 'jump' : !p.moving ? 'idle' : p.sprinting ? 'run' : 'walk';
  // В прыжке пропускаем присед из начала клипа: Томас отрывается от земли сразу
  playAct(m, act, act === 'walk' ? 1.5 : act === 'climb' ? (Input.forward() ? 1 : 0) : act === 'run' ? 1.8 : act === 'jump' ? 1.3 : 1.1, act === 'jump' ? 0.22 : 0);
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

function initFirstPerson() {
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

function updateFirstPerson(dt) {
  const F = PEOPLE.fp, p = Game.player;
  if (!F) return;
  const h = heldItem();
  const type = h ? h.type : null;
  if (type !== F.itemType) {
    if (F.item) F.grip.remove(F.item);
    F.item = null;
    if (type && ASSETS.models[ITEM_DEFS[type].model]) {
      F.item = ASSETS.models[ITEM_DEFS[type].model].clone(true);
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
    if (type === 'torch') emitFire(_bv2.x, _bv2.y - 0.05, _bv2.z, dt, 0.18);
    // Свет исходит от пламени (или стекла фонаря), а не от ладони
    World.handLight.position.copy(World.camera.worldToLocal(_bv2));
    World.handLight.position.y += type === 'torch' ? 0.12 : 0.04;
  }
}
