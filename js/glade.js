// Глэйд: земля с рельефом, трава, лес, река. Постройки — в structures.js.
// Модели из Blender (assets/blender) ставятся копиями; если их нет — рисуем запасной вариант.

const WIND = { uTime: { value: 0 }, uGust: { value: 1 } };   // uGust — сила порыва (её же слышно в звуке ветра)
const GLADE3D = { fires: [], torches: [], lanterns: [], water: null };
const tw = t => t * S;                                  // тайл → метры

// Ветер: травинки и листья качаются, верх сильнее низа (heightRef ≤ 0 — качается целиком)
function windPatch(mat, strength, heightRef) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = WIND.uTime;
    sh.uniforms.uGust = WIND.uGust;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGust;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        float hk = ${heightRef > 0 ? `clamp(position.y / ${heightRef.toFixed(2)}, 0.0, 1.0)` : '1.0'};
        hk *= hk;
        float wv = sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.23) * 0.65 + sin(uTime * 3.3 + ip.x * 0.9 + ip.z * 0.5) * 0.25;
        transformed.x += wv * ${strength.toFixed(3)} * hk * uGust;
        transformed.z += wv * ${(strength * 0.6).toFixed(3)} * hk * uGust;`);
  };
  mat.customProgramCacheKey = () => 'wind' + strength + '_' + heightRef;
  return mat;
}

function grassClumpGeometry(blades = 7, height = 0.55) {
  const pos = [], col = [], nrm = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const a = Math.random() * 6.28, r = Math.random() * 0.13;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const h = height * (0.55 + Math.random() * 0.7), w = 0.016 + Math.random() * 0.012;
    const lean = (Math.random() - 0.5) * 0.7, rot = Math.random() * 6.28, base = pos.length / 3;
    for (let s = 0; s <= 3; s++) {
      const t = s / 3, bend = lean * t * t * h, ww = w * (1 - t * 0.9);
      for (const side of [-1, 1]) {
        pos.push(bx + Math.cos(rot) * ww * side + Math.cos(rot + 1.57) * bend, h * t, bz + Math.sin(rot) * ww * side + Math.sin(rot + 1.57) * bend);
        nrm.push(0, 1, 0);
        const sh = 0.5 + 0.5 * t;
        col.push(sh, sh, sh * (0.85 + t * 0.2));
      }
      if (s < 3) { const i = base + s * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function srgb(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

function grassMaterial() {
  const m = windPatch(new THREE.MeshStandardMaterial({ color: srgb('#7d9a4a'), vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.45 }), 0.09, 0.35);
  m.userData.season = 'grass';          // цвет меняется по временам года (economy.js)
  return m;
}

/* ---------- помощники ---------- */

// Масштабирует UV граней коробки, чтобы текстура лежала в метрах, а не растягивалась
function boxGeo(w, h, d, unit = 2.5) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / unit, uv.getY(i) * dims[f][1] / unit);
    }
  }
  return g;
}

function mesh(geo, mat, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  (parent || World.scene).add(m);
  return m;
}

// Копия модели (Blender или Poly Haven) в точке; поворот вокруг вертикали
function put(id, x, y, z, rotY = 0, scale = 1) {
  const src = ASSETS.models[id];
  if (!src) return null;
  const m = src.clone(true);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.scale.setScalar(scale);
  World.scene.add(m);
  return m;
}

// Ставит модель Poly Haven на землю, подогнав её размер (по наибольшей стороне в плане)
function fitModel(id, x, z, size, rotY = 0, y = null) {
  const m = placeModel(id, 0, 0, 0, { rotY });
  if (!m) return null;
  const box = new THREE.Box3().setFromObject(m), dim = box.getSize(new THREE.Vector3());
  m.scale.setScalar(size / Math.max(dim.x, dim.z));
  box.setFromObject(m);
  const gy = y === null ? groundH(x, z) : y;
  m.position.set(x - (box.min.x + box.max.x) / 2, gy - box.min.y, z - (box.min.z + box.max.z) / 2);
  return m;
}

// Геометрия одного меша модели, поставленная основанием в начало координат (для InstancedMesh)
function groundedGeometry(src, keepBase = false) {
  const g = src.geometry.clone();
  g.applyMatrix4(src.matrixWorld);
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.min.x + b.max.x) / 2 * (keepBase ? 0 : 1), keepBase ? 0 : -b.min.y, -(b.min.z + b.max.z) / 2 * (keepBase ? 0 : 1));
  return g;
}

// Все меши модели как InstancedMesh: positions — [{x, y, z, rot, s, sx, sy}] (sx, sy — растяжение вдоль X и по высоте)
function instanceModel(id, positions, { shadow = true } = {}) {
  const root = ASSETS.models[id];
  if (!root || !positions.length) return [];
  root.updateMatrixWorld(true);
  const out = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const im = new THREE.InstancedMesh(g, o.material, positions.length);
    positions.forEach((p, i) => {
      const s = p.s || 1;
      m4.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rot || 0), sc.set(s * (p.sx || 1), s * (p.sy || 1), s));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.frustumCulled = false;
    if (o.material.name === 'leaves') {
      im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: o.material.map, alphaTest: 0.5 });
    }
    World.scene.add(im);
    out.push(im);
  });
  return out;
}

function solid(obj, shrink = 0, y0 = -50, y1 = 100) {
  if (!obj) return obj;
  const b = new THREE.Box3().setFromObject(obj);
  addBox((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, b.max.x - b.min.x - shrink, b.max.z - b.min.z - shrink, y0, y1);
  return obj;
}

const GM = {};
function gladeMaterials() {
  const std = o => new THREE.MeshStandardMaterial({ roughness: 0.88, ...o });
  const pick = (id, rep, fallback) => {
    const r = realMaps(id, rep);
    return r ? { map: r.map, normalMap: r.normal } : { map: fallback.map, normalMap: fallback.normal };
  };
  GM.wood = std(pick('weathered_planks', 1, TEX.wood));
  GM.woodDark = std({ ...pick('weathered_planks', 1, TEX.woodDark), color: srgb('#9a8c7c') });
  GM.thatch = std({ ...pick('thatch_roof_angled', 0.6, TEX.thatch), roughness: 1 });
  GM.bark = std({ ...pick('bark_brown_02', 1, TEX.bark), roughness: 0.95 });
  GM.bark.map.repeat.set(2, 3);
  GM.bark.normalMap.repeat.set(2, 3);
  GM.concrete = std({ ...pick('concrete_layers', 0.3, TEX.walls[0]), roughness: 0.95 });
  GM.rock = std({ map: TEX.rock.map, normalMap: TEX.rock.normal, roughness: 0.95 });
  GM.metal = std({ ...pick('rusty_metal_02', 1, TEX.metal), metalness: 0.7, roughness: 0.6 });
  GM.hole = new THREE.MeshBasicMaterial({ color: 0x050505 });
  GM.cloth = std({ map: TEX.fabric.map, normalMap: TEX.fabric.normal, color: srgb('#b5a88e'), side: THREE.DoubleSide });
  GM.soil = std({ map: TEX.soil.map, normalMap: TEX.soil.normal, color: srgb('#8a7a64') });
  GM.leaves = windPatch(new THREE.MeshStandardMaterial({ map: TEX.leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, envMapIntensity: 0.6 }), 0.07, 0);
  GM.leaves.userData.season = 'leaves';
  GM.crop = std({ color: srgb('#5d8a35'), roughness: 0.8 });
}

/* ---------- земля с рельефом ---------- */

function buildGladeGround(quality) {
  const span = (GLADE_T1 - GLADE_T0 + 1) * S, c = tw(MID);
  let grassM = realMaps('leafy_grass', span / 3);
  if (!grassM) {
    grassM = { map: TEX.ground.map.clone(), normal: TEX.ground.normal.clone() };
    for (const t of [grassM.map, grassM.normal]) { t.needsUpdate = true; t.repeat.set(span / 3, span / 3); }
  }
  const sub = (id, fallback) => {
    const r = realMaps(id, 1);
    const t = r ? r.map : fallback.map.clone();
    t.needsUpdate = true;
    t.encoding = THREE.LinearEncoding;      // в шейдере переводим в линейный цвет сами
    return t;
  };
  const dirtMap = sub('forest_ground_04', TEX.dirt), soilMap = sub('raked_dirt', TEX.soil), mudMap = sub('stony_dirt_path', TEX.dirt);
  const mat = new THREE.MeshStandardMaterial({ map: grassM.map, normalMap: grassM.normal, roughness: 0.95, aoMap: Walls.ao, envMapIntensity: 0.6 });
  if (ASSETS.tex.leafy_grass) mat.color.setRGB(0.5, 0.66, 0.36);
  mat.userData.season = 'ground';
  const P = LAYOUT.plantations;
  const pts = LAYOUT.river.map(([dx, dy]) => `vec2(${(MID + dx).toFixed(2)}, ${(MID + dy).toFixed(2)})`).join(', ');
  patchWorldPos(mat, `
    vec2 wt = vWPos.xz / ${S.toFixed(2)};
    float gn = gNoise(wt * 1.7);
    float path = 1.0 - smoothstep(0.3, 0.5 + gn * 0.18, min(abs(wt.x - ${MID.toFixed(1)}), abs(wt.y - ${MID.toFixed(1)})));
    float forest = smoothstep(${(MID + 1.2).toFixed(1)}, ${(MID + 2.8).toFixed(1)}, wt.y + gn * 0.9);
    float fx = smoothstep(${(P.x0 - 0.6).toFixed(1)}, ${(P.x0 - 0.3).toFixed(1)}, wt.x) * (1.0 - smoothstep(${(P.x1 + 0.3).toFixed(1)}, ${(P.x1 + 0.6).toFixed(1)}, wt.x));
    float fy = smoothstep(${(P.y0 - 0.6).toFixed(1)}, ${(P.y0 - 0.3).toFixed(1)}, wt.y) * (1.0 - smoothstep(${(P.y1 + 0.3).toFixed(1)}, ${(P.y1 + 0.6).toFixed(1)}, wt.y));
    vec2 rp[${LAYOUT.river.length}] = vec2[](${pts});
    float rd = 1e9;
    for (int i = 0; i < ${LAYOUT.river.length - 1}; i++) {
      vec2 a = rp[i], b = rp[i + 1], ab = b - a;
      float t = clamp(dot(wt - a, ab) / dot(ab, ab), 0.0, 1.0);
      rd = min(rd, length(wt - a - ab * t));
    }
    float bank = 1.0 - smoothstep(0.45, 1.05 + gn * 0.2, rd);
    vec3 dirtC = pow(texture2D(dirtMap, vUv * 0.9).rgb, vec3(2.2));
    vec3 soilC = pow(texture2D(soilMap, vUv * 0.7).rgb, vec3(2.2));
    vec3 mudC = pow(texture2D(mudMap, vUv * 1.3).rgb, vec3(2.2)) * vec3(0.7, 0.66, 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, dirtC, clamp(max(path, forest * 0.9), 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, soilC, fx * fy);
    diffuseColor.rgb = mix(diffuseColor.rgb, mudC, bank);`,
  'roughnessFactor = mix(roughnessFactor, 0.45, bank * 0.8);',
  { uniforms: { dirtMap: { value: dirtMap }, soilMap: { value: soilMap }, mudMap: { value: mudMap } }, decl: 'uniform sampler2D dirtMap;\nuniform sampler2D soilMap;\nuniform sampler2D mudMap;\n' });
  const seg = { high: 260, medium: 180, low: 120 }[quality];
  const geo = new THREE.PlaneGeometry(span, span, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i) + c, p.getZ(i) + c) + 0.012);
  geo.computeVertexNormals();
  const ground = mesh(geo, mat, c, 0, c, null, false);
  setAoUv(ground);

  // Трава: на поляне густо, в лесу редко; не растёт на тропах, в реке, на пашне и в домах
  const blockedRects = [...HOUSES.map(h => h.r), LAYOUT.plantations, rect(1, -5, 3, -3)];
  const free = (tx, ty) => {
    if (Math.abs(tx - MID) < 0.55 || Math.abs(ty - MID) < 0.55) return false;
    if (blockedRects.some(r => tx > r.x0 - 0.5 && tx < r.x1 + 0.5 && ty > r.y0 - 0.5 && ty < r.y1 + 0.5)) return false;
    if (Math.hypot(tx - LAYOUT.campfire.x, ty - LAYOUT.campfire.y) < 1.1) return false;
    if (riverDistTiles(tx, ty) < 0.5) return false;
    return !(ty > MID + 2 && Math.random() < 0.75);
  };
  const scatter = (count, place) => {
    let n = 0;
    for (let tries = 0; n < count && tries < count * 4; tries++) {
      const tx = GLADE_T0 - 0.45 + Math.random() * (GLADE_T1 - GLADE_T0 + 0.9);
      const ty = GLADE_T0 - 0.45 + Math.random() * (GLADE_T1 - GLADE_T0 + 0.9);
      if (free(tx, ty)) place(n++, tw(tx), tw(ty));
    }
    return n;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  const count = { high: 20000, medium: 11000, low: 4000 }[quality];
  const grass = new THREE.InstancedMesh(grassClumpGeometry(8, 0.27), grassMaterial(), count);
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  grass.count = scatter(count, (n, x, z) => {
    const s = 0.65 + Math.random() * 0.55;
    m4.compose(v3.set(x, groundH(x, z), z), q.setFromEuler(e.set(0, Math.random() * 6.28, 0)), sc.set(s, s * (0.6 + Math.random() * 0.5), s));
    grass.setMatrixAt(n, m4);
    const v = 0.6 + Math.random() * 0.4, dry = Math.random() < 0.15 ? 0.25 : 0;
    grass.setColorAt(n, col.setRGB(v * (0.9 + Math.random() * 0.15 + dry), v * (1 - dry * 0.2), v * (0.75 - dry)));
  });
  World.scene.add(grass);

  // Настоящие пучки травы из фотоскана
  const clumps = modelMeshes('grass_medium_01').sort((a, b) => a.geometry.index.count - b.geometry.index.count).slice(0, 3);
  const per = { high: 700, medium: 300, low: 0 }[quality];
  for (const src of clumps) {
    src.material.userData.season = 'grass';
    const im = new THREE.InstancedMesh(groundedGeometry(src), src.material, per);
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.count = scatter(per, (n, x, z) => {
      const s = 0.7 + Math.random() * 0.6;
      m4.compose(v3.set(x, groundH(x, z), z), q.setFromEuler(e.set(0, Math.random() * 6.28, 0)), sc.set(s, s, s));
      im.setMatrixAt(n, m4);
    });
    World.scene.add(im);
  }
}

/* ---------- лес ---------- */

const TREE_KINDS = { tree_oak: 0.62, tree_tall: 0.55, tree_mid: 0.45, tree_young: 0.26 };

function buildForest(quality) {
  const rndOf = (x, y, k) => thash(Math.round(x * 13), Math.round(y * 7) + k);
  const sets = { tree_oak: [], tree_tall: [], tree_mid: [], tree_young: [] };
  const add = (kind, xm, zm, rot, s) => {
    sets[kind].push({ x: xm, y: groundH(xm, zm) - 0.15, z: zm, rot, s });
    addCircle(xm, zm, TREE_KINDS[kind] * s);
  };
  for (const t of LAYOUT.trees) {
    const r = rndOf(t.x, t.y, 1);
    const kind = r < 0.45 ? 'tree_oak' : r < 0.8 ? 'tree_tall' : 'tree_mid';
    add(kind, tw(t.x) + (rndOf(t.x, t.y, 2) - 0.5) * 0.8, tw(t.y) + (rndOf(t.x, t.y, 3) - 0.5) * 0.8, rndOf(t.x, t.y, 4) * 6.28, 0.85 + rndOf(t.x, t.y, 5) * 0.35);
  }
  for (const t of LAYOUT.cornerTrees) {
    const r = rndOf(t.x, t.y, 6);
    add(r < 0.55 ? 'tree_mid' : 'tree_young', tw(t.x), tw(t.y), r * 6.28, 0.75 + rndOf(t.x, t.y, 7) * 0.4);
  }
  if (hasModel('tree_oak')) {
    for (const kind of Object.keys(sets)) instanceModel(kind, sets[kind]);
  } else {
    // Запасной вариант без моделей: простые стволы
    for (const kind of Object.keys(sets)) {
      for (const p of sets[kind]) mesh(new THREE.CylinderGeometry(0.2, 0.45, 10 * p.s, 8).translate(0, 5 * p.s, 0), GM.bark, p.x, p.y, p.z);
    }
  }

  // Папоротники из фотоскана на лесной подстилке
  const ferns = modelMeshes('fern_02').sort((a, b) => a.geometry.index.count - b.geometry.index.count).slice(0, 2);
  const per = { high: 380, medium: 170, low: 50 }[quality];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const src of ferns) {
    src.material.userData.season = 'leaves';
    const im = new THREE.InstancedMesh(groundedGeometry(src), src.material, per);
    im.receiveShadow = true;
    im.frustumCulled = false;
    let k = 0;
    for (let tries = 0; k < per && tries < per * 6; tries++) {
      const tx = GLADE_T0 + Math.random() * (GLADE_T1 - GLADE_T0), ty = MID + 1.6 + Math.random() * (GLADE_T1 - MID - 1.6);
      if (Math.abs(tx - MID) < 0.6 || riverDistTiles(tx, ty) < 0.55 || decoBlocked(Math.round(tx), Math.round(ty))) continue;
      if (HOUSES.some(h => inRect({ x: Math.round(tx), y: Math.round(ty) }, h.r))) continue;
      const s = 0.8 + Math.random() * 0.7, x = tw(tx), z = tw(ty);
      m4.compose(v3.set(x, groundH(x, z), z), q.setFromEuler(e.set(0, Math.random() * 6.28, 0)), sc.set(s, s, s));
      im.setMatrixAt(k++, m4);
    }
    im.count = k;
    World.scene.add(im);
  }
  // Пни у стен — Глэйдеры рубят тут лес на дрова
  for (let i = 0; i < 14; i++) {
    const side = i % 4, along = GLADE_T0 + 1 + thash(i, 9) * (GLADE_T1 - GLADE_T0 - 2);
    if (Math.abs(along - MID) < 1.5) continue;
    const tx = [along, GLADE_T1 - 0.2, along, GLADE_T0 + 0.2][side], ty = [GLADE_T0 + 0.2, along, GLADE_T1 - 0.2, along][side];
    if (riverDistTiles(tx, ty) < 1 || HOUSES.some(h => inRect({ x: Math.round(tx), y: Math.round(ty) }, h.r, 1))) continue;
    const st = fitModel('tree_stump_01', tw(tx), tw(ty), 0.7 + thash(i, 3) * 0.5, thash(i, 4) * 6);
    if (st) addCircle(tw(tx), tw(ty), 0.4);
  }
}

/* ---------- река ---------- */

function waterNormalMap() {
  const n = 256, c = makeCanvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n);
  const noise = tileNoise(301, 16), h = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] = fbm(noise, x / 16, y / 16, 4);
  return canvasTex(normalCanvas(h, n, n, 5), { srgb: false });
}

function buildRiver() {
  const pts = LAYOUT.river.map(([dx, dy]) => new THREE.Vector2(tw(MID + dx), tw(MID + dy)));
  const curve = new THREE.SplineCurve(pts);
  const samples = curve.getSpacedPoints(160), half = RIVER.half + 0.55;
  const pos = [], uv = [], idx = [];
  samples.forEach((p, i) => {
    const t = curve.getTangent(Math.min(1, i / 160)), nx = -t.y, nz = t.x;
    const y = (waterLevel(p.x, p.y) ?? riverBase(i / 160) - RIVER.water) + 0.02;
    for (const s of [-1, 1]) {
      pos.push(p.x + nx * half * s, y, p.y + nz * half * s);
      uv.push(i * 0.25, (s + 1) / 2);
    }
    // Обход вершин против часовой стрелки, если смотреть сверху: лицевая сторона воды — вверх
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const normalMap = waterNormalMap();
  normalMap.repeat.set(1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: srgb('#24402f'), roughness: 0.06, metalness: 0.1, normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: true, opacity: 0.86, envMapIntensity: 0.85,
  });
  const water = new THREE.Mesh(geo, mat);
  water.receiveShadow = true;
  water.renderOrder = 1;
  World.scene.add(water);
  GLADE3D.water = normalMap;
  // Камни вдоль берегов
  const rocks = [];
  for (let i = 0; i < 46; i++) {
    const p = curve.getPoint(thash(i, 1)), t = curve.getTangent(thash(i, 1)), s = thash(i, 2) < 0.5 ? -1 : 1;
    const off = half + 0.2 + thash(i, 3) * 1.2, x = p.x - t.y * off * s, z = p.y + t.x * off * s;
    if (Math.abs(x - tw(MID)) < 2.5) continue;          // у мостика пусто
    rocks.push({ x, y: groundH(x, z) - 0.1, z, rot: thash(i, 4) * 6.28, s: 0.25 + thash(i, 5) * 0.55 });
  }
  const src = modelMeshes('rock_moss_set_01')[2];
  if (src) {
    const g = groundedGeometry(src);
    const im = new THREE.InstancedMesh(g, src.material, rocks.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    rocks.forEach((r, i) => { m4.compose(v.set(r.x, r.y, r.z), q.setFromAxisAngle(up, r.rot), sc.setScalar(r.s)); im.setMatrixAt(i, m4); });
    im.castShadow = im.receiveShadow = true;
    World.scene.add(im);
  }
}

function buildGlade(quality) {
  gladeMaterials();
  buildGladeGround(quality);
  buildForest(quality);
  buildRiver();
  buildStructures(quality);
  for (const l of GLADE3D.lanterns) {
    l.glow = glowSprite(0xffa040, 1.2, 0);
    l.glow.position.set(l.x, l.y, l.z);
    World.scene.add(l.glow);
  }
}

// Огонь, дым, искры, фонари ночью, рябь на воде
function updateGlade(dt, night, px, pz) {
  WIND.uTime.value += dt;
  for (const f of [...GLADE3D.fires, ...GLADE3D.torches]) {
    if (Math.hypot(f.x - px, f.z - pz) < 90) emitFire(f.x, f.y, f.z, dt, f.power * (f.power < 1 ? 0.5 + night * 0.5 : 1));
  }
  for (const l of GLADE3D.lanterns) if (l.glow) l.glow.material.opacity = Math.max(0, night - 0.3) * (0.85 + Math.sin(Game.time * 9 + l.x) * 0.1);
  if (GLADE3D.water) GLADE3D.water.offset.x -= dt * 0.05;
}
