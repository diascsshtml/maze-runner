// Глэйд: земля с рельефом, трава, лес, река. Постройки — в structures.js.
// Модели из Blender (assets/blender) ставятся копиями; если их нет — рисуем запасной вариант.

const WIND = { uTime: { value: 0 }, uGust: { value: 1 } };   // uGust — сила порыва (её же слышно в звуке ветра)
const GLADE3D = { fires: [], torches: [], lanterns: [], water: null };
const tw = t => t * S;                                  // тайл → метры
// Насколько протоптаны тропы и вспахан огород: в новом поселении тропы едва заметны и проступают, когда Глэйд обживается
const GROUND_LIFE = { tread: { value: 1 }, tilled: { value: 1 } };

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
  const dirtMap = sub('forest_ground_04', TEX.dirt), soilMap = sub('raked_dirt', TEX.soil), pathMap = sub('stony_dirt_path', TEX.dirt);
  const mat = new THREE.MeshStandardMaterial({ map: grassM.map, normalMap: grassM.normal, roughness: 0.95, aoMap: Walls.ao, envMapIntensity: 0.6 });
  if (ASSETS.tex.leafy_grass) mat.color.setRGB(0.5, 0.66, 0.36);
  mat.userData.season = 'ground';
  const P = LAYOUT.plantations;
  // Маски земли (тропы, грязь, гравий русла) — из terrain.js, одной текстурой
  groundH(0, 0);
  const M = TERRAIN.mask, data = new Uint8Array(M.N * M.N * 4);
  for (let k = 0; k < M.N * M.N; k++) {
    data[k * 4] = Math.round(M.path[k] * 255);
    data[k * 4 + 1] = Math.round(M.mud[k] * 255);
    data[k * 4 + 2] = Math.round(M.bed[k] * 255);
    data[k * 4 + 3] = 255;
  }
  const maskTex = new THREE.DataTexture(data, M.N, M.N, THREE.RGBAFormat);
  maskTex.magFilter = maskTex.minFilter = THREE.LinearFilter;
  maskTex.needsUpdate = true;
  patchWorldPos(mat, `
    vec2 wt = vWPos.xz / ${S.toFixed(2)};
    float gn = gNoise(wt * 1.7);
    vec4 gm = texture2D(groundMask, (vWPos.xz - vec2(${M.x0.toFixed(3)})) / ${(M.cell * M.N).toFixed(3)});
    float path = gm.r, mud = gm.g, bed = gm.b;
    float forest = smoothstep(${(MID + 1.2).toFixed(1)}, ${(MID + 2.8).toFixed(1)}, wt.y + gn * 0.9);
    float fx = smoothstep(${(P.x0 - 0.6).toFixed(1)}, ${(P.x0 - 0.3).toFixed(1)}, wt.x) * (1.0 - smoothstep(${(P.x1 + 0.3).toFixed(1)}, ${(P.x1 + 0.6).toFixed(1)}, wt.x));
    float fy = smoothstep(${(P.y0 - 0.6).toFixed(1)}, ${(P.y0 - 0.3).toFixed(1)}, wt.y) * (1.0 - smoothstep(${(P.y1 + 0.3).toFixed(1)}, ${(P.y1 + 0.6).toFixed(1)}, wt.y));
    vec3 dirtC = pow(texture2D(dirtMap, vUv * 0.9).rgb, vec3(2.2));
    vec3 soilC = pow(texture2D(soilMap, vUv * 0.7).rgb, vec3(2.2));
    vec3 pathC = pow(texture2D(pathMap, vUv * 1.3).rgb, vec3(2.2)) * vec3(0.95, 0.88, 0.78);
    // Утоптанная земля: середина тропы светлее и суше, к краям — примятая трава
    float tread = smoothstep(0.05, 0.75, path) * (0.8 + 0.2 * gn) * uTread;
    diffuseColor.rgb = mix(diffuseColor.rgb, dirtC, forest * 0.9);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(dirtC, pathC, 0.7), tread);
    diffuseColor.rgb = mix(diffuseColor.rgb, soilC, fx * fy * uTilled);
    vec3 mudC = mix(pathC, dirtC, 0.45) * vec3(0.4, 0.36, 0.31);
    diffuseColor.rgb = mix(diffuseColor.rgb, mudC, smoothstep(0.1, 0.8, mud));
    diffuseColor.rgb = mix(diffuseColor.rgb, pathC * vec3(0.5, 0.52, 0.48), bed);`,
  'roughnessFactor = mix(roughnessFactor, 0.32, max(smoothstep(0.3, 0.9, mud) * 0.85, bed * 0.6));',
  { uniforms: { dirtMap: { value: dirtMap }, soilMap: { value: soilMap }, pathMap: { value: pathMap }, groundMask: { value: maskTex }, uTread: GROUND_LIFE.tread, uTilled: GROUND_LIFE.tilled },
    decl: 'uniform sampler2D dirtMap;\nuniform sampler2D soilMap;\nuniform sampler2D pathMap;\nuniform sampler2D groundMask;\nuniform float uTread;\nuniform float uTilled;\n' });
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
    const x = tw(tx), z = tw(ty);
    if (groundMask('path', x, z) > 0.25 + Math.random() * 0.35 || groundMask('mud', x, z) > 0.45 || groundMask('bed', x, z) > 0.05) return false;
    if (blockedRects.some(r => tx > r.x0 - 0.5 && tx < r.x1 + 0.5 && ty > r.y0 - 0.5 && ty < r.y1 + 0.5)) return false;
    if (Math.hypot(tx - LAYOUT.campfire.x, ty - LAYOUT.campfire.y) < 1.1) return false;
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
  const all = [];
  const add = (kind, xm, zm, rot, s) => {
    const p = { x: xm, y: groundH(xm, zm) - 0.15, z: zm, rot, s };
    sets[kind].push(p);
    all.push({ ...p, kind });
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
    buildRoots(all);
    GLADE3D.treeList = all;               // деревья — узлы добычи (gather.js)
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
      if (groundMask('path', tw(tx), tw(ty)) > 0.2 || groundMask('mud', tw(tx), tw(ty)) > 0.4 || riverDistTiles(tx, ty) < 0.55 || decoBlocked(Math.round(tx), Math.round(ty))) continue;
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

// Точка оси реки и направление течения на доле длины s (0..1)
function riverAt(s) {
  const pts = TERRAIN.riverPts, want = s * TERRAIN.riverLen;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + len >= want || i === pts.length - 2) {
      const t = Math.max(0, Math.min(1, (want - acc) / len));
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / len, tz: (b.z - a.z) / len };
    }
    acc += len;
  }
  return null;
}

// Вода: полоса поперёк русла из 11 вершин; в каждой — глубина над дном. На мелком вода прозрачная
// и светлее, у самой кромки — пена, на глубине — тёмная
function buildRiverWater() {
  const n = Math.ceil(TERRAIN.riverLen / 0.6), across = 10;
  const pos = [], uv = [], dep = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n, c = riverAt(s), nx = -c.tz, nz = c.tx;
    const W = riverShape(s, c.x, c.z).half + 1.9, level = riverBase(s) - RIVER.water;
    for (let k = 0; k <= across; k++) {
      const u = k / across * 2 - 1, x = c.x + nx * u * W, z = c.z + nz * u * W;
      pos.push(x, level, z);
      uv.push(s * TERRAIN.riverLen / 2.5, (u + 1) / 2 * W / 2.5);
      dep.push(level - groundH(x, z));
      if (i && k) {
        const a = (i - 1) * (across + 1) + k - 1, b = a + across + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (geo.attributes.normal.getY(0) < 0) {           // лицевая сторона воды — вверх
    geo.index.array.reverse();
    geo.index.needsUpdate = true;
    geo.computeVertexNormals();
  }
  const normalMap = waterNormalMap();
  const mat = new THREE.MeshStandardMaterial({
    color: srgb('#24402f'), roughness: 0.06, metalness: 0.1, normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: true, opacity: 1, envMapIntensity: 0.85, depthWrite: false,
  });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTimeW = WIND.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth;\nvarying float vDepth;\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDepth = aDepth;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTimeW;\nvarying float vDepth;\nvarying vec3 vWPos;\n' + NOISE_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dk = smoothstep(0.0, 0.5, vDepth);
        diffuseColor.rgb = mix(vec3(0.16, 0.17, 0.12), vec3(0.025, 0.06, 0.045), dk);
        float edge = 1.0 - smoothstep(0.0, 0.07 + 0.05 * gNoise(vWPos.xz * 2.3), vDepth);
        float foam = edge * smoothstep(0.35, 0.75, gNoise(vWPos.xz * 4.0 + vec2(uTimeW * 0.6, 0.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.64, 0.6), foam * 0.7);
        diffuseColor.a = mix(0.35, 0.9, dk) * smoothstep(-0.015, 0.03, vDepth);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, foam);');
  };
  mat.customProgramCacheKey = () => 'river';
  const water = new THREE.Mesh(geo, mat);
  water.receiveShadow = true;
  water.renderOrder = 1;
  World.scene.add(water);
  GLADE3D.water = normalMap;
}

// Камень-переступ: приплюснутый, с плоской макушкой; основание в начале координат
function steppingStoneGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(0.42, 1), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(0.85 + thash(i * 7 + seed, seed) * 0.3);
    v.y = v.y > 0.12 ? 0.12 + (v.y - 0.12) * 0.25 : v.y;
    p.setXYZ(i, v.x, v.y + 0.42, v.z * 0.85);
  }
  g.computeVertexNormals();
  return g;
}

function rockMaterial() {
  const src = modelMeshes('rock_moss_set_01')[0];
  return src ? src.material : new THREE.MeshStandardMaterial({ color: srgb('#7d786f'), map: TEX.rock.map, normalMap: TEX.rock.normal, roughness: 0.95 });
}

function buildRiver() {
  buildRiverWater();
  const rockMat = rockMaterial(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const crossings = [];
  // Брод: камни-переступы поперёк реки, по ним можно перейти, не замочив ног
  {
    const f = LAYOUT.ford, r = riverQuery(tw(f.x), tw(f.y)), c = riverAt(r.s), nx = -c.tz, nz = c.tx;
    const half = riverShape(r.s, c.x, c.z).half, level = riverBase(r.s) - RIVER.water;
    const count = Math.ceil((half * 2 + 0.6) / 0.78);
    for (let k = 0; k < count; k++) {
      const o = -half - 0.3 + (k + 0.5) * (half * 2 + 0.6) / count, j = (thash(k, 41) - 0.5) * 0.35;
      const x = c.x + nx * o + c.tx * j, z = c.z + nz * o + c.tz * j, bed = groundH(x, z);
      const top = Math.max(level + 0.12, bed + 0.12), sy = (top - bed + 0.12) / 0.54;
      const st = new THREE.Mesh(steppingStoneGeometry(k), rockMat);
      st.position.set(x, bed - 0.12, z);
      st.scale.set(1, sy, 1);
      st.rotation.y = thash(k, 3) * 6.28;
      st.castShadow = st.receiveShadow = true;
      World.scene.add(st);
      addPlatform({ round: true, x, z, r: 0.34, h: top });
    }
    crossings.push({ x: c.x, z: c.z, r: half + 1.2 });
  }
  // Упавшее дерево через реку: лежит на берегах, по стволу можно перейти
  {
    const L = LAYOUT.log, r = riverQuery(tw(L.x), tw(L.y)), c = riverAt(r.s), nx = -c.tz, nz = c.tx;
    const ends = [-3.2, 3.3].map(o => groundH(c.x + nx * o, c.z + nz * o));
    const y = (ends[0] + ends[1]) / 2 - 0.35, rot = -Math.atan2(nz, nx);
    if (put('log_fallen', c.x, y, c.z, rot)) {
      for (let o = -3.4; o <= 3.6; o += 0.45) {
        const top = y + 0.84 - (o + 3.6) / 7.3 * 0.2, x = c.x + nx * o, z = c.z + nz * o;
        addPlatform({ round: true, x, z, r: 0.3, h: top });
        addCircle(x, z, 0.38, y - 1, top - 0.05);
      }
      crossings.push({ x: c.x, z: c.z, r: 1.8 });
    }
  }
  const nearCrossing = (x, z) => crossings.some(c => Math.hypot(x - c.x, z - c.z) < c.r) || Math.hypot(x - tw(LAYOUT.bridge.x), z - tw(LAYOUT.bridge.y)) < 3.2;
  // Камни: по берегам и в самом русле (на мелком торчат из воды)
  const rocks = [];
  for (let i = 0; i < 90; i++) {
    const s = thash(i, 1), c = riverAt(s), side = thash(i, 2) < 0.5 ? -1 : 1, half = riverShape(s, c.x, c.z).half;
    const inWater = i % 3 === 0, off = inWater ? thash(i, 3) * half * 0.9 : half + 0.3 + thash(i, 3) * 1.4;
    const x = c.x - c.tz * off * side, z = c.z + c.tx * off * side;
    if (nearCrossing(x, z)) continue;
    rocks.push({ x, y: groundH(x, z) - 0.08, z, rot: thash(i, 4) * 6.28, s: inWater ? 0.18 + thash(i, 5) * 0.3 : 0.25 + thash(i, 5) * 0.55 });
  }
  const src = modelMeshes('rock_moss_set_01')[2];
  if (src) {
    const im = new THREE.InstancedMesh(groundedGeometry(src), src.material, rocks.length);
    rocks.forEach((r, i) => { m4.compose(v.set(r.x, r.y, r.z), q.setFromAxisAngle(up, r.rot), sc.setScalar(r.s)); im.setMatrixAt(i, m4); });
    im.castShadow = im.receiveShadow = true;
    World.scene.add(im);
  }
  // Камыш и рогоз у кромки воды, кое-где в мелкой воде
  const reeds = [];
  for (let i = 0; i < 160 && reeds.length < 75; i++) {
    const s = thash(i, 11), c = riverAt(s), side = thash(i, 12) < 0.5 ? -1 : 1, half = riverShape(s, c.x, c.z).half;
    const off = half - 0.2 + thash(i, 13) * 1.1, x = c.x - c.tz * off * side, z = c.z + c.tx * off * side;
    if (nearCrossing(x, z) || groundMask('path', x, z) > 0.3) continue;
    reeds.push({ x, y: groundH(x, z) - 0.05, z, rot: thash(i, 14) * 6.28, s: 0.7 + thash(i, 15) * 0.5 });
  }
  instanceModel('reeds', reeds, { shadow: false });
  GLADE3D.reedList = reeds;
}

// Лужи в низинах и на тропах: вода в ямке, края — где земля выше воды
function buildPuddles() {
  const nm = waterNormalMap();
  nm.repeat.set(2, 2);
  const mat = new THREE.MeshStandardMaterial({ color: srgb('#2a2620'), roughness: 0.04, metalness: 0.15, normalMap: nm, normalScale: new THREE.Vector2(0.12, 0.12),
    transparent: true, opacity: 0.88, envMapIntensity: 1.0, depthWrite: false });
  for (const p of LAYOUT.puddles) {
    const x = tw(MID + p.x), z = tw(MID + p.y), R = p.r * S * 1.15;
    const w = new THREE.Mesh(new THREE.CircleGeometry(R, 28).rotateX(-Math.PI / 2), mat);
    w.position.set(x, groundH(x, z) + 0.065, z);
    w.receiveShadow = true;
    w.renderOrder = 1;
    World.scene.add(w);
  }
}

// Валуны у стен, на холмах и в лесу; камешки по краям троп и в грязи
function buildRocks(quality) {
  const meshes = modelMeshes('rock_moss_set_01');
  if (!meshes.length) return;
  const geos = meshes.map(m => { const g = groundedGeometry(m); g.computeBoundingBox(); return g; });
  const sets = geos.map(() => []);
  const ok = (x, z, r) => {
    const tx = x / S, ty = z / S;
    if (groundMask('path', x, z) > 0.15 || groundMask('bed', x, z) > 0.02 || waterLevel(x, z) !== null) return false;
    if (HOUSES.some(h => inRect({ x: tx, y: ty }, h.r, 0.9)) || inRect({ x: tx, y: ty }, LAYOUT.plantations, 0.8) || inRect({ x: tx, y: ty }, LAYOUT.graveyard, 0.6)) return false;
    if (decoBlocked(Math.round(tx), Math.round(ty))) return false;
    return COLLIDERS.every(c => c.round ? Math.hypot(x - c.x, z - c.z) > c.r + r : x < c.x0 - r || x > c.x1 + r || z < c.z0 - r || z > c.z1 + r);
  };
  let placed = 0;
  for (let i = 0; i < 500 && placed < 34; i++) {
    const tx = GLADE_T0 + thash(i, 51) * (GLADE_T1 - GLADE_T0), ty = GLADE_T0 + thash(i, 52) * (GLADE_T1 - GLADE_T0);
    const edge = Math.min(tx - GLADE_T0, GLADE_T1 - tx, ty - GLADE_T0, GLADE_T1 - ty);
    const hill = LAYOUT.hills.some(h => Math.hypot(tx - MID - h.x, ty - MID - h.y) < h.r * 0.8);
    if (!(edge < 1.4 || hill || ty > MID + 2) || thash(i, 53) < 0.35) continue;
    const k = Math.floor(thash(i, 54) * geos.length), b = geos[k].boundingBox, size = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    const want = 0.6 + thash(i, 55) * thash(i, 55) * 1.6, s = want / size, x = tw(tx), z = tw(ty);
    if (!ok(x, z, want / 2)) continue;
    sets[k].push({ x, y: groundH(x, z) - (b.max.y - b.min.y) * s * 0.28, z, rot: thash(i, 56) * 6.28, s });
    (GLADE3D.boulders = GLADE3D.boulders || []).push({ x, z, r: want * 0.42 });
    if (want > 0.85) addCircle(x, z, want * 0.38, -50, groundH(x, z) + (b.max.y - b.min.y) * s * 0.7);
    placed++;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), e = new THREE.Euler();
  sets.forEach((list, k) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geos[k], meshes[k].material, list.length);
    list.forEach((r, i) => { m4.compose(v.set(r.x, r.y, r.z), q.setFromAxisAngle(up, r.rot), sc.setScalar(r.s)); im.setMatrixAt(i, m4); });
    im.castShadow = im.receiveShadow = true;
    World.scene.add(im);
  });
  const pebGeo = new THREE.DodecahedronGeometry(0.1, 0), pp = pebGeo.attributes.position, pv = new THREE.Vector3();
  for (let i = 0; i < pp.count; i++) { pv.fromBufferAttribute(pp, i); pp.setXYZ(i, pv.x * (0.8 + thash(i, 1) * 0.4), pv.y * 0.55, pv.z); }
  pebGeo.computeVertexNormals();
  const pebbles = [], want = { high: 900, medium: 500, low: 200 }[quality];
  for (let i = 0; i < want * 8 && pebbles.length < want; i++) {
    const x = tw(GLADE_T0 + Math.random() * (GLADE_T1 - GLADE_T0)), z = tw(GLADE_T0 + Math.random() * (GLADE_T1 - GLADE_T0));
    const p = groundMask('path', x, z), m = groundMask('mud', x, z);
    if (!((p > 0.15 && p < 0.6) || (p > 0.6 && Math.random() < 0.15) || m > 0.5) || HOUSES.some(h => inRect({ x: x / S, y: z / S }, h.r, 0.4))) continue;
    pebbles.push([x, z]);
  }
  const peb = new THREE.InstancedMesh(pebGeo, rockMaterial(), pebbles.length);
  pebbles.forEach(([x, z], i) => {
    const s = 0.35 + Math.random() * Math.random() * 1.6;
    m4.compose(v.set(x, groundH(x, z) + 0.01, z), q.setFromEuler(e.set(Math.random() * 3, Math.random() * 6, 0)), sc.setScalar(s));
    peb.setMatrixAt(i, m4);
  });
  peb.receiveShadow = true;
  peb.castShadow = quality === 'high';
  World.scene.add(peb);
}

// Корни у основания деревьев и корни поперёк лесных тропинок
function buildRoots(trees) {
  const flare = trees.map(t => ({ x: t.x, y: t.y + 0.1, z: t.z, rot: t.rot + 0.7, s: t.s * (t.kind === 'tree_young' ? 0.55 : t.kind === 'tree_mid' ? 0.8 : 1.05) }));
  instanceModel('roots_flare', flare);
  const arcs = [];
  for (const t of trees) {
    if (t.kind === 'tree_young' || arcs.length > 26) continue;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, x = t.x + Math.cos(a) * 1.9, z = t.z + Math.sin(a) * 1.9;
      if (groundMask('path', x, z) > 0.4 && groundMask('bed', x, z) < 0.01) {
        arcs.push({ x: t.x + Math.cos(a) * 1.75, y: groundH(x, z), z: t.z + Math.sin(a) * 1.75, rot: -a, s: 0.9 + thash(k, arcs.length) * 0.3 });
        break;
      }
    }
  }
  instanceModel('root_arc', arcs);
}

function buildGlade(quality) {
  gladeMaterials();
  buildGladeGround(quality);
  buildForest(quality);
  buildRiver();
  buildPuddles();
  buildStructures(quality);
  buildRocks(quality);
  for (const l of GLADE3D.lanterns) {
    l.glow = glowSprite(0xffa040, 1.2, 0);
    l.glow.position.set(l.x, l.y, l.z);
    if (l.struct) withStruct(l.struct, () => World.scene.add(l.glow)); else World.scene.add(l.glow);
  }
}

// Огонь, дым, искры, фонари ночью, рябь на воде
function updateGlade(dt, night, px, pz) {
  WIND.uTime.value += dt;
  for (const f of [...GLADE3D.fires, ...GLADE3D.torches]) {
    if (f.struct && !isBuilt(f.struct)) continue;
    if (Math.hypot(f.x - px, f.z - pz) < 90) emitFire(f.x, f.y, f.z, dt, f.power * (f.power < 1 ? 0.5 + night * 0.5 : 1));
  }
  for (const l of GLADE3D.lanterns) if (l.glow) l.glow.material.opacity = Math.max(0, night - 0.3) * (0.85 + Math.sin(Game.time * 9 + l.x) * 0.1);
  if (GLADE3D.water) GLADE3D.water.offset.x -= dt * 0.05;
}
