// Люди Глэйда: процедурная модель с суставами и набором анимаций.
// Модель смотрит вдоль +X. Поворот сустава по Z — мах вперёд (+) / назад (−).

const HUMAN = { geo: null, mats: new Map() };

function humanMat(hex, { fabric = false, rough = 0.85 } = {}) {
  const key = hex + (fabric ? ':f' : '');
  if (!HUMAN.mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).convertSRGBToLinear(), roughness: rough });
    if (fabric) {
      m.map = TEX.fabric.map;
      m.normalMap = TEX.fabric.normal;
      m.normalScale.set(0.5, 0.5);
    }
    HUMAN.mats.set(key, m);
  }
  return HUMAN.mats.get(key);
}

function humanGeometry() {
  if (HUMAN.geo) return HUMAN.geo;
  const cap = (r, len, down) => new THREE.CapsuleGeometry(r, len, 4, 12).translate(0, down ? -(len / 2 + r) : 0, 0);
  // Туловище: профиль талия → грудь → плечи, вращаем вокруг оси и сплющиваем
  const torso = new THREE.LatheGeometry([
    [0.0, -0.02], [0.135, 0.0], [0.142, 0.1], [0.162, 0.24], [0.17, 0.33], [0.158, 0.41], [0.115, 0.47], [0.05, 0.505], [0.0, 0.51],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 18).scale(0.8, 1, 1.26);
  const boot = new THREE.CapsuleGeometry(0.06, 0.16, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.8, 1).translate(0.045, -0.035, 0);
  HUMAN.geo = {
    torso,
    pelvis: new THREE.CapsuleGeometry(0.13, 0.13, 4, 12).rotateX(Math.PI / 2).scale(0.8, 1, 1),
    thigh: cap(0.088, 0.28, true),
    shin: cap(0.068, 0.3, true),
    boot,
    upperArm: cap(0.062, 0.18, true),
    forearm: cap(0.052, 0.16, true),
    hand: new THREE.SphereGeometry(0.056, 10, 8).scale(0.7, 1.25, 0.45).translate(0, -0.055, 0),
    joint: new THREE.SphereGeometry(0.075, 12, 10),
    neck: new THREE.CylinderGeometry(0.045, 0.052, 0.11, 12),
    head: new THREE.SphereGeometry(0.1, 24, 18).scale(1.02, 1.16, 0.86),
    jaw: new THREE.SphereGeometry(0.072, 16, 12).scale(1.0, 0.82, 1.05),
    nose: new THREE.ConeGeometry(0.017, 0.045, 6).rotateZ(-Math.PI / 2),
    eye: new THREE.SphereGeometry(0.0115, 8, 6),
    brow: new THREE.BoxGeometry(0.008, 0.008, 0.036),
    mouth: new THREE.BoxGeometry(0.006, 0.006, 0.04),
    ear: new THREE.SphereGeometry(0.026, 8, 6).scale(0.55, 1, 0.35),
    hairCap: new THREE.SphereGeometry(0.108, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
    tuft: new THREE.IcosahedronGeometry(0.035, 0),
    pack: new THREE.BoxGeometry(0.13, 0.36, 0.28),
    strap: new THREE.BoxGeometry(0.02, 0.5, 0.035),
  };
  return HUMAN.geo;
}

function part(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function makeTool(type) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: TEX.wood.map, normalMap: TEX.wood.normal, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b8f94, metalness: 0.85, roughness: 0.35 });
  const handle = (len, r = 0.018) => part(g, new THREE.CylinderGeometry(r, r, len, 8).translate(0, len / 2 - 0.12, 0), wood);
  if (type === 'hoe') {
    handle(1.45);
    part(g, new THREE.BoxGeometry(0.2, 0.02, 0.16), steel, 0.08, 1.31, 0);
  } else if (type === 'axe') {
    handle(0.85, 0.02);
    part(g, new THREE.BoxGeometry(0.16, 0.12, 0.025), steel, 0.07, 0.66, 0);
  } else if (type === 'hammer') {
    handle(0.38, 0.015);
    part(g, new THREE.BoxGeometry(0.05, 0.05, 0.14), steel, 0, 0.25, 0);
  } else if (type === 'spear') {
    handle(2.1, 0.02);
    part(g, new THREE.ConeGeometry(0.035, 0.24, 6), steel, 0, 2.08, 0);
  } else if (type === 'ladle') {
    handle(0.5, 0.012);
    part(g, new THREE.SphereGeometry(0.05, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel, 0, 0.38, 0);
  }
  return g;
}

// spec: { skin, shirt, pants, hair, style, height, pack, tool }
function makeHuman(spec) {
  const G = humanGeometry();
  // Тёмные штаны на солнце выглядят чёрными — подмешиваем выгоревший хаки
  const faded = hex => '#' + new THREE.Color(hex).lerp(new THREE.Color('#8a7f6a'), 0.35).getHexString();
  const skin = humanMat(spec.skin, { rough: 0.6 });
  const shirt = humanMat(spec.shirt, { fabric: true, rough: 0.92 });
  const pants = humanMat(faded(spec.pants), { fabric: true, rough: 0.95 });
  const hair = humanMat(spec.hair, { rough: 0.95 });
  const boots = humanMat('#2f241a', { rough: 0.7 });
  const dark = humanMat('#1c1410', { rough: 0.5 });
  const lip = humanMat('#7a4038', { rough: 0.6 });

  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  const hips = joint(body, 0, 0.96, 0);
  part(hips, G.pelvis, pants);
  const spine = joint(hips, 0, 0.06, 0);
  part(spine, G.torso, shirt);
  const neck = joint(spine, 0, 0.5, 0);
  part(neck, G.neck, skin, 0, 0.04, 0);
  const head = joint(neck, 0, 0.08, 0);
  head.scale.setScalar(1.07);
  part(head, G.head, skin, 0, 0.11, 0);
  part(head, G.jaw, skin, 0.022, 0.045, 0);
  part(head, G.nose, skin, 0.106, 0.1, 0, false);
  for (const s of [-1, 1]) {
    part(head, G.eye, dark, 0.088, 0.128, s * 0.036, false);
    part(head, G.brow, hair, 0.094, 0.153, s * 0.037, false);
    part(head, G.ear, skin, -0.005, 0.11, s * 0.087, false);
  }
  part(head, G.mouth, lip, 0.096, 0.058, 0, false);
  const capMesh = part(head, G.hairCap, hair, -0.012, 0.128, 0);
  capMesh.rotation.z = 0.32;
  capMesh.scale.set(spec.style === 'buzz' ? 0.98 : 1.04, 1.12, 0.92);
  if (spec.style === 'messy' || spec.style === 'curly') {
    const n = spec.style === 'curly' ? 16 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const t = part(head, G.tuft, hair, -0.02 + Math.cos(a) * 0.06, 0.2 + Math.random() * 0.025, Math.sin(a) * 0.06);
      t.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      t.scale.setScalar(spec.style === 'curly' ? 0.9 : 1.1);
    }
  } else if (spec.style === 'long') {
    const tail = part(head, new THREE.CapsuleGeometry(0.045, 0.2, 4, 10), hair, -0.11, 0.0, 0);
    tail.rotation.z = -0.25;
    for (const s of [-1, 1]) part(head, new THREE.CapsuleGeometry(0.03, 0.12, 4, 8), hair, -0.02, 0.06, s * 0.085);
  }

  const arm = side => {
    const sh = joint(spine, 0, 0.42, side * 0.2);
    part(sh, G.joint, shirt);
    part(sh, G.upperArm, spec.sleeves === 'long' ? shirt : shirt);
    const el = joint(sh, 0, -0.29, 0);
    part(el, G.forearm, spec.sleeves === 'long' ? shirt : skin);
    const wr = joint(el, 0, -0.26, 0);
    part(wr, G.hand, skin);
    return { sh, el, wr };
  };
  const L = arm(-1), R = arm(1);

  const leg = side => {
    const th = joint(hips, 0, -0.02, side * 0.095);
    part(th, G.thigh, pants);
    const kn = joint(th, 0, -0.44, 0);
    part(kn, G.shin, pants);
    const an = joint(kn, 0, -0.43, 0);
    part(an, G.boot, boots);
    return { th, kn, an };
  };
  const LL = leg(-1), RL = leg(1);

  if (spec.pack) {
    const canvas = humanMat('#4d4a36', { fabric: true });
    part(spine, G.pack, canvas, -0.19, 0.26, 0);
    for (const s of [-1, 1]) {
      const st = part(spine, G.strap, canvas, 0.08, 0.27, s * 0.1);
      st.rotation.z = -0.12;
    }
  }

  let tool = null;
  if (spec.tool) {
    tool = makeTool(spec.tool);
    tool.position.y = -0.07;
    R.wr.add(tool);
  }

  root.scale.setScalar(spec.height || 1);
  return {
    root, body, hips, spine, neck, head, tool, toolType: spec.tool,
    shL: L.sh, elL: L.el, shR: R.sh, elR: R.el,
    thL: LL.th, knL: LL.kn, anL: LL.an, thR: RL.th, knR: RL.kn, anR: RL.an,
    cur: null,
  };
}

/* ---------- позы и анимации ---------- */

const POSE_KEYS = ['bodyY', 'spineZ', 'spineY', 'headY', 'headZ', 'thLZ', 'thRZ', 'thLX', 'thRX', 'knLZ', 'knRZ', 'anLZ', 'anRZ', 'shLZ', 'shRZ', 'shLX', 'shRX', 'elLZ', 'elRZ'];

function poseTargets(act, ph, t, o) {
  const breath = Math.sin(t * 1.7) * 0.012;
  Object.assign(o, {
    bodyY: 0, spineZ: -0.02 + breath, spineY: 0, headY: 0, headZ: 0,
    thLZ: 0, thRZ: 0, thLX: 0.03, thRX: -0.03, knLZ: -0.04, knRZ: -0.04, anLZ: 0.04, anRZ: 0.04,
    shLZ: 0.04 + Math.sin(t * 1.2) * 0.02, shRZ: 0.04 + Math.sin(t * 1.3 + 1) * 0.02, shLX: 0.1, shRX: -0.1, elLZ: 0.2, elRZ: 0.2,
  });
  const s = Math.sin(ph), c = Math.cos(ph);
  switch (act) {
    case 'walk':
      Object.assign(o, {
        thLZ: s * 0.42, thRZ: -s * 0.42,
        knLZ: -(0.08 + 0.6 * Math.max(0, c)), knRZ: -(0.08 + 0.6 * Math.max(0, -c)),
        shLZ: -s * 0.32, shRZ: s * 0.32, elLZ: 0.25 + Math.max(0, -s) * 0.25, elRZ: 0.25 + Math.max(0, s) * 0.25,
        bodyY: (Math.abs(c) - 1) * 0.035, spineY: s * 0.07, spineZ: -0.05,
      });
      break;
    case 'run':
      Object.assign(o, {
        thLZ: s * 0.8, thRZ: -s * 0.8,
        knLZ: -(0.25 + 1.25 * Math.max(0, c)), knRZ: -(0.25 + 1.25 * Math.max(0, -c)),
        shLZ: -s * 0.75, shRZ: s * 0.75, elLZ: 1.3, elRZ: 1.3,
        bodyY: Math.abs(c) * 0.07 - 0.06, spineY: s * 0.15, spineZ: -0.2,
      });
      break;
    case 'sit':
      Object.assign(o, {
        bodyY: -0.5, thLZ: 1.45, thRZ: 1.45, thLX: 0.08, thRX: -0.08, knLZ: -1.45, knRZ: -1.45, anLZ: 0, anRZ: 0,
        spineZ: -0.12 + breath, shLZ: 0.55, shRZ: 0.55, elLZ: 1.0, elRZ: 1.0, shLX: 0.05, shRX: -0.05,
        headZ: -0.08,
      });
      break;
    case 'hoe': {
      const a = Math.sin(t * 4.5);
      Object.assign(o, {
        spineZ: -0.35 - a * 0.08, shLZ: 0.9 + a * 0.45, shRZ: 0.9 + a * 0.45, elLZ: 0.5 - a * 0.25, elRZ: 0.5 - a * 0.25,
        shLX: -0.2, shRX: 0.2, thLZ: 0.25, thRZ: -0.15, knLZ: -0.3, knRZ: -0.1, bodyY: -0.04,
      });
      break;
    }
    case 'chop': {
      const u = (t % 1.8) / 1.8;
      const A = u < 0.55 ? 0.6 + (u / 0.55) * 2.3 : u < 0.68 ? 2.9 - ((u - 0.55) / 0.13) * 2.6 : 0.3 + ((u - 0.68) / 0.32) * 0.3;
      Object.assign(o, {
        shLZ: A, shRZ: A, elLZ: 0.2, elRZ: 0.2, shLX: -0.25, shRX: 0.25,
        spineZ: -0.32 + ((A - 0.3) / 2.6) * 0.45, thLZ: 0.2, thRZ: -0.2, knLZ: -0.2, knRZ: -0.12, bodyY: -0.03,
      });
      break;
    }
    case 'hammer': {
      const a = Math.sin(t * 7);
      Object.assign(o, {
        shRZ: 1.0 + a * 0.45, elRZ: 1.0 - a * 0.5, shLZ: 0.6, elLZ: 1.0, shLX: -0.15,
        spineZ: -0.3, bodyY: -0.03, knLZ: -0.15, knRZ: -0.15,
      });
      break;
    }
    case 'cook':
      Object.assign(o, {
        shRZ: 0.7 + Math.sin(t * 3) * 0.12, elRZ: 0.9 + Math.cos(t * 3) * 0.25, shRX: 0.05 + Math.sin(t * 3) * 0.1,
        shLX: 0.45, shLZ: -0.1, elLZ: 1.2, spineZ: -0.15,
      });
      break;
    case 'guard':
      Object.assign(o, { shRZ: 0.25, elRZ: 1.35, shRX: -0.12, headY: Math.sin(t * 0.35) * 0.6, thLX: 0.09, thRX: -0.09 });
      break;
    case 'talk':
      Object.assign(o, {
        shLZ: 0.25 + Math.sin(t * 2.1) * 0.2, elLZ: 1.0 + Math.sin(t * 2.9) * 0.3,
        shRZ: 0.2 + Math.sin(t * 1.7 + 1) * 0.25, elRZ: 0.9 + Math.sin(t * 2.3 + 2) * 0.35, headZ: Math.sin(t * 3.5) * 0.05,
      });
      break;
    case 'wave':
      Object.assign(o, { shRX: -2.5, shRZ: 0.2, elRZ: 0.6 + Math.sin(t * 9) * 0.45, headZ: 0.06 });
      break;
  }
  o.anLZ = act === 'sit' ? 0 : -(o.thLZ + o.knLZ) * 0.7;
  o.anRZ = act === 'sit' ? 0 : -(o.thRZ + o.knRZ) * 0.7;
}

// Угол инструмента в мире (по стороне), чтобы копьё держалось вертикально, а мотыга смотрела в землю
const TOOL_WORLD = { spear: 0, hoe: -2.3 };
const _pose = {};

function animateHuman(h, act, ph, t, dt, lookYaw = 0) {
  poseTargets(act, ph, t, _pose);
  _pose.headY += Math.max(-1.1, Math.min(1.1, lookYaw));
  if (!h.cur) h.cur = { ..._pose };
  const k = 1 - Math.exp(-dt * 12);
  const c = h.cur;
  for (const key of POSE_KEYS) c[key] += (_pose[key] - c[key]) * k;
  h.body.position.y = c.bodyY;
  h.spine.rotation.set(0, c.spineY, c.spineZ);
  h.head.rotation.set(0, c.headY, c.headZ);
  h.thL.rotation.set(c.thLX, 0, c.thLZ);
  h.thR.rotation.set(c.thRX, 0, c.thRZ);
  h.knL.rotation.z = c.knLZ;
  h.knR.rotation.z = c.knRZ;
  h.anL.rotation.z = c.anLZ;
  h.anR.rotation.z = c.anRZ;
  h.shL.rotation.set(c.shLX, 0, c.shLZ);
  h.shR.rotation.set(c.shRX, 0, c.shRZ);
  h.elL.rotation.z = c.elLZ;
  h.elR.rotation.z = c.elRZ;
  if (h.tool) {
    const handAngle = c.spineZ + c.shRZ + c.elRZ;
    const world = TOOL_WORLD[h.toolType];
    h.tool.rotation.z = world !== undefined ? world - handAngle : Math.PI;
  }
}
