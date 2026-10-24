// Гривер, таблички с кодом и маяк выхода. Модели смотрят вдоль +X.

const S = 3.5;        // метров в одном тайле
const WALL_H = 26;    // высота стен Лабиринта (у каждой секции своя: ±14%)
const MAT = {};

function initMaterials() {
  MAT.steel = new THREE.MeshStandardMaterial({ map: TEX.metal.map, normalMap: TEX.metal.normal, metalness: 0.85, roughness: 0.42 });
  MAT.darkSteel = new THREE.MeshStandardMaterial({ color: 0x55585c, map: TEX.metal.map, normalMap: TEX.metal.normal, metalness: 0.9, roughness: 0.5 });
  MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 1, roughness: 0.22 });
  MAT.sensor = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 2.5 });
  MAT.flesh = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.18, envMapIntensity: 0.5,
    normalMap: TEX.flesh, normalScale: new THREE.Vector2(0.9, 0.9),
  });
  TEX.flesh.repeat.set(5, 3);
}

function glowSprite(color, scale, opacity = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.dot, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.scale.set(scale, scale, 1);
  return sp;
}

function shadowed(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

/* ---------- шум для органических форм ---------- */

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

// Бугристое слизистое тело: сфера, вытянутая назад, с шумовыми наплывами
function grieverBodyGeometry() {
  const geo = new THREE.SphereGeometry(1, 56, 36);
  const p = geo.attributes.position, colors = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise3(v.x * 2.2 + 5, v.y * 2.2, v.z * 2.2) * 0.6 + noise3(v.x * 5.5, v.y * 5.5 + 3, v.z * 5.5) * 0.4;
    const r = 1 + (n - 0.5) * 0.32;
    const taper = v.x < 0 ? 1 + v.x * 0.38 : 1 + v.x * 0.08;
    v.set(v.x * 1.75, v.y * 0.72 * taper, v.z * 0.92 * taper).multiplyScalar(r);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.4;   // плоское брюхо
    p.setXYZ(i, v.x, v.y, v.z);
    const patch = Math.max(0, n - 0.52) * 2.4;
    colors[i * 3] = 0.05 + patch * 0.13;
    colors[i * 3 + 1] = 0.042 + patch * 0.08;
    colors[i * 3 + 2] = 0.038 + patch * 0.07;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

let GRIEVER_GEO = null;

function grieverGeometries() {
  if (GRIEVER_GEO) return GRIEVER_GEO;
  const seg = (r1, r2, len) => new THREE.CylinderGeometry(r1, r2, len, 10).translate(0, len / 2, 0);
  GRIEVER_GEO = {
    body: grieverBodyGeometry(),
    plate: new THREE.CylinderGeometry(0.62, 0.62, 0.5, 18, 1, true, -Math.PI * 0.42, Math.PI * 0.84).rotateZ(Math.PI / 2),
    spike: new THREE.ConeGeometry(0.06, 0.55, 8),
    coxa: seg(0.09, 0.08, 0.45),
    femur: seg(0.075, 0.06, 1.75),
    tibia: seg(0.06, 0.012, 2.35),
    piston: seg(0.03, 0.03, 0.9),
    joint: new THREE.SphereGeometry(0.11, 12, 10),
    tailSeg: new THREE.SphereGeometry(0.17, 14, 10).scale(1.3, 1, 1),
    stinger: new THREE.ConeGeometry(0.07, 0.6, 10).translate(0, 0.3, 0),
    sensor: new THREE.SphereGeometry(0.045, 10, 8),
    claw: new THREE.ConeGeometry(0.06, 0.75, 6).translate(0, 0.375, 0),
    saw: new THREE.CylinderGeometry(0.42, 0.42, 0.025, 28),
    tooth: new THREE.ConeGeometry(0.035, 0.09, 4),
  };
  return GRIEVER_GEO;
}

// Гривер из Blender: слизистое тело в складках, бронепластины, восемь механических лап, хвост с жалом,
// клешни и пила; анимации ползания, покоя и удара. Красное свечение — у главного глаза (кость body)
function makeGrieverGlb() {
  const g = ASSETS.gltf.griever;
  const root = new THREE.Group(), body = THREE.SkeletonUtils.clone(g.scene);
  root.add(body);
  const bones = {};
  body.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; }
  });
  const mixer = new THREE.AnimationMixer(body), actions = {};
  for (const clip of g.animations) actions[clip.name] = mixer.clipAction(clip);
  const glow = glowSprite(0xff2a18, 0.8, 0.8);
  root.updateMatrixWorld(true);
  const eye = new THREE.Vector3(1.86, 1.61, 0);
  if (bones.body) { bones.body.add(glow); glow.position.copy(bones.body.worldToLocal(eye)); } else { glow.position.copy(eye); root.add(glow); }
  root.scale.setScalar(1.1);
  return { root, glb: true, mixer, actions, current: null, glow };
}

function makeGrieverModel() {
  if (ASSETS.gltf.griever && THREE.SkeletonUtils) return makeGrieverGlb();
  const G = grieverGeometries();
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const body = shadowed(new THREE.Mesh(G.body, MAT.flesh));
  body.position.y = 1.45;
  rig.add(body);

  // Бронепластины и шипы вдоль спины
  for (let i = 0; i < 4; i++) {
    const pl = shadowed(new THREE.Mesh(G.plate, MAT.steel));
    pl.position.set(-0.9 + i * 0.55, 1.62 + Math.sin(i) * 0.04, 0);
    pl.scale.set(1, 1 - i * 0.04, 1);
    rig.add(pl);
    for (const s of [-1, 1]) {
      const sp = shadowed(new THREE.Mesh(G.spike, MAT.chrome));
      sp.position.set(-0.9 + i * 0.55, 2.2, s * 0.22);
      sp.rotation.set(s * 0.35, 0, 0.45);
      rig.add(sp);
    }
  }

  // Восемь механических лап: тазик → бедро вверх → голень вниз к земле
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, k = i % 4;
    const hip = new THREE.Group();
    hip.position.set(1.0 - k * 0.65, 1.3, side * 0.6);
    hip.rotation.y = side * (k - 1.5) * 0.25;
    const coxa = new THREE.Group();
    coxa.rotation.x = side * 1.2;
    coxa.add(shadowed(new THREE.Mesh(G.coxa, MAT.darkSteel)));
    const femur = new THREE.Group();
    femur.position.y = 0.45;
    femur.rotation.x = -side * 0.75;
    femur.add(shadowed(new THREE.Mesh(G.femur, MAT.darkSteel)), shadowed(new THREE.Mesh(G.joint, MAT.chrome)));
    const piston = shadowed(new THREE.Mesh(G.piston, MAT.chrome));
    piston.position.set(0.09, 0.2, 0);
    femur.add(piston);
    const tibia = new THREE.Group();
    tibia.position.y = 1.75;
    tibia.rotation.x = -side * 2.1;
    tibia.add(shadowed(new THREE.Mesh(G.tibia, MAT.steel)), shadowed(new THREE.Mesh(G.joint, MAT.chrome)));
    femur.add(tibia);
    coxa.add(femur);
    hip.add(coxa);
    rig.add(hip);
    legs.push({ hip, femur, tibia, side, phase: (k % 2 ? Math.PI : 0) + (side > 0 ? Math.PI : 0) + k * 0.4 });
  }

  // Хвост с жалом, изогнутый над спиной
  const tail = [];
  let parent = rig;
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    if (i === 0) g.position.set(-1.7, 1.55, 0);
    else g.position.set(-0.32, 0, 0);
    g.add(shadowed(new THREE.Mesh(G.tailSeg, i % 2 ? MAT.flesh : MAT.darkSteel)));
    g.scale.setScalar(i === 0 ? 1 : 0.92);
    parent.add(g);
    tail.push(g);
    parent = g;
  }
  const sting = shadowed(new THREE.Mesh(G.stinger, MAT.chrome));
  sting.position.set(-0.2, 0, 0);
  sting.rotation.z = Math.PI / 2;
  parent.add(sting);

  // Морда: кластер красных сенсоров, клешни и пила
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(G.sensor, MAT.sensor);
    const a = (i / 7) * Math.PI * 2;
    s.position.set(1.72, 1.5 + Math.sin(a) * 0.14, Math.cos(a) * 0.18);
    rig.add(s);
  }
  const glow = glowSprite(0xff2a18, 0.8, 0.8);
  glow.position.set(1.85, 1.5, 0);
  rig.add(glow);
  const claws = [];
  for (const side of [-1, 1]) {
    const c = new THREE.Group();
    c.position.set(1.55, 1.15, side * 0.35);
    c.add(shadowed(new THREE.Mesh(G.claw, MAT.chrome)));
    c.rotation.set(side * 0.3, 0, -1.3);
    rig.add(c);
    claws.push({ g: c, side });
  }
  const sawArm = new THREE.Group();
  sawArm.position.set(1.3, 1.85, 0.45);
  const arm = shadowed(new THREE.Mesh(G.femur, MAT.darkSteel));
  arm.scale.set(0.8, 0.45, 0.8);
  arm.rotation.z = -1.0;
  sawArm.add(arm);
  const saw = new THREE.Group();
  saw.position.set(0.68, 0.42, 0);
  saw.rotation.x = Math.PI / 2;
  saw.add(shadowed(new THREE.Mesh(G.saw, MAT.chrome)));
  for (let i = 0; i < 16; i++) {
    const t = new THREE.Mesh(G.tooth, MAT.chrome);
    const a = (i / 16) * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
    t.rotation.set(Math.PI / 2, 0, -a);
    saw.add(t);
  }
  sawArm.add(saw);
  rig.add(sawArm);

  root.scale.setScalar(1.15);
  return { root, rig, body, legs, tail, claws, saw, glow };
}

function animateGriever(m, t, moving, hunting, fade, night, dt = 0, striking = false) {
  m.glow.material.opacity = fade * (0.05 + 0.75 * night) * (hunting ? 1 : 0.6);
  if (m.glb) {
    // Удар жалом — один раз целиком, потом снова ползёт или замирает
    const name = striking ? 'attack' : moving ? 'crawl' : 'idle', a = m.actions[name];
    if (a && m.current !== a) {
      a.reset().play();
      if (m.current) a.crossFadeFrom(m.current, name === 'attack' ? 0.12 : 0.35, false);
      m.current = a;
    }
    if (a) a.timeScale = name === 'crawl' ? (hunting ? 1.7 : 1.1) : name === 'idle' && hunting ? 1.8 : 1;
    m.mixer.update(dt);
    return;
  }
  const sp = moving ? (hunting ? 11 : 7) : 1.5;
  for (const l of m.legs) {
    const s = Math.sin(t * sp + l.phase);
    const lift = moving ? Math.max(0, s) : 0;
    l.hip.rotation.z = (moving ? Math.cos(t * sp + l.phase) * 0.35 : 0);
    l.femur.rotation.x = -l.side * (0.75 + lift * 0.35);
    l.tibia.rotation.x = -l.side * (2.1 - lift * 0.25);
  }
  const breath = 1 + Math.sin(t * (hunting ? 5 : 2)) * 0.035;
  m.body.scale.set(breath, 1 / breath, breath);
  m.rig.position.y = moving ? Math.abs(Math.sin(t * sp)) * 0.08 : Math.sin(t * 1.3) * 0.04;
  m.rig.rotation.z = moving ? Math.sin(t * sp * 0.5) * 0.02 : 0;
  // Хвост: в покое лежит дугой, на охоте поднимается и бьёт вперёд
  const curl = hunting ? 0.42 : 0.3;
  m.tail.forEach((g, i) => {
    g.rotation.z = -(i === 0 ? 0.5 : curl) - Math.sin(t * 2.2 - i * 0.6) * 0.06 - (hunting ? Math.max(0, Math.sin(t * 3)) * 0.08 : 0);
  });
  for (const c of m.claws) c.g.rotation.z = -1.3 + (hunting ? Math.sin(t * 12 + c.side) * 0.35 : Math.sin(t) * 0.05);
  m.saw.rotation.y += hunting ? 0.6 : 0.05;
}

/* ---------- фрагменты кода и выход ---------- */

function makeItemModel(word) {
  const g = new THREE.Group();
  const face = new THREE.MeshStandardMaterial({ map: wordTexture(word), metalness: 0.75, roughness: 0.32, emissive: 0x3a2200, emissiveIntensity: 1 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x5c6066, metalness: 0.9, roughness: 0.4 });
  const plate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 1.0), [edge, edge, edge, edge, edge, edge]));
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), face);
  front.position.x = 0.026;
  front.rotation.y = Math.PI / 2;
  const back = front.clone();
  back.position.x = -0.026;
  back.rotation.y = -Math.PI / 2;
  const spin = new THREE.Group();
  spin.add(plate, front, back);
  spin.position.y = 1.4;
  const glow = glowSprite(0xffa030, 2.6, 0.5);
  glow.position.y = 1.4;
  g.add(spin, glow);
  // Пластина стоит в рамке на стойке (Blender); без модели — висит и вращается в воздухе
  const stand = ASSETS.models.code_stand ? ASSETS.models.code_stand.clone(true) : null;
  if (stand) {
    stand.rotation.y = hash3(word.length, word.charCodeAt(0), 1) * 6.28;
    spin.rotation.y = stand.rotation.y;
    g.add(stand);
  }
  return { group: g, spin, fixed: !!stand };
}

function makeExitBeacon() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, 140, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 2.0), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.y = 70;
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.4, 140, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 6, 5), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  core.position.y = 70;
  g.add(beam, core);
  return g;
}
