// Настоящие фотосканы: текстуры и модели Poly Haven (лицензия CC0, папка assets).
// Если файлы не загрузились (или игра открыта прямо с диска), игра рисует свои текстуры.

const ASSET_LIST = {
  textures: ['concrete_layers', 'concrete_moss', 'stony_dirt_path', 'leafy_grass', 'forest_ground_04', 'raked_dirt',
    'weathered_planks', 'thatch_roof_angled', 'bark_brown_02', 'rusty_metal_02'],
  models: ['grass_medium_01', 'fern_02', 'rock_moss_set_01', 'tree_stump_01', 'stone_fire_pit', 'wooden_crate_01', 'Lantern_01'],
  // Модели, сделанные в Blender (папка blender/, лежат в assets/blender)
  blender: ['house_forge', 'house_bunk1', 'house_bunk2', 'house_dining', 'house_storage', 'house_blood', 'tower',
    'tree_oak', 'tree_tall', 'tree_mid', 'tree_young', 'bed', 'table_long', 'hearth', 'furnace', 'anvil', 'shelf', 'chest',
    'barrel', 'sacks', 'mapboard', 'workbench', 'stool', 'grave', 'bridge', 'campfire_logs', 'glader', 'teresa', 'item_bag',
    // Руки от первого лица и вещи «как в Rust» (blender/viewmodel.py, build_gear.py): в руке, у жителей и на земле
    'fp_arms', 'gear_axe', 'gear_pickaxe', 'gear_hammer', 'gear_knife', 'gear_spear', 'gear_torch', 'gear_crowbar', 'gear_hoe',
    'gear_ladle', 'gear_lantern', 'gear_bucket', 'gear_flask', 'gear_apple', 'gear_ration', 'gear_bandage', 'gear_stew',
    'gear_watch', 'gear_map', 'gear_note', 'gear_keycard', 'gear_scrap', 'gear_herb', 'gear_gear', 'gear_rope',
    // Лабиринт: секции стен, створки ворот, завал, плита-ловушка, рычаг, табличка сектора и гривер
    'wall_0', 'wall_1', 'wall_2', 'gate_a', 'gate_b', 'rubble', 'trap_plate', 'lever', 'plaque', 'code_stand', 'griever',
    // Глэйд: Ящик, факелы, скамьи, загон, поленница, стройка, Кутузка, грядки и живность
    'box_lift', 'torch_post', 'bench_log', 'fence', 'trough', 'hay_bale', 'woodpile', 'scaffold', 'slammer',
    'crop_corn', 'crop_tomato', 'crop_pumpkin', 'scarecrow', 'bird', 'crow', 'rabbit', 'pig', 'chicken',
    // Новые постройки, рельеф и следы жизни: корни, камыш, бревно-переход, тачка, телега, инструменты, утварь
    'house_pantry', 'house_shed', 'house_medhut', 'roots_flare', 'root_arc', 'reeds', 'log_fallen',
    'wheelbarrow', 'cart', 'tools_lean', 'tools_ground', 'bucket', 'basket', 'laundry_line', 'sign_post', 'sign_board',
    'hammock', 'clothes_pile', 'firepit_small', 'bench_simple', 'cauldron', 'dishes', 'butcher_table', 'meat_rack',
    'tool_rack', 'weapon_rack', 'rug', 'cot', 'herb_rack', 'jar_shelf', 'map_table',
    // Лабиринт: ориентиры секторов и приметы участков
    'lm_tree_giant', 'lm_tree_dead', 'lm_mast', 'lm_column', 'lm_gear', 'lm_slab', 'lm_pool', 'lm_camp',
    'pipe_run', 'floor_grate', 'wall_roots', 'concrete_chunks',
    // Выживание: частокол, бочка для дождя
    'palisade', 'rain_barrel'],
};

const ASSETS = { tex: {}, models: {}, gltf: {}, leaves: null, real: false, blocked: location.protocol === 'file:' };

// Собирает бинарный glTF (GLB) в памяти: JSON-часть + геометрия. Модели хранятся как .json
// с геометрией в extras.bin (base64), потому что страница-артефакт не отдаёт файлы .bin/.gltf.
function makeGlb(json, bin) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - jsonBytes.length % 4) % 4, binPad = (4 - bin.length % 4) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad;
  const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint32(0, 0x46546C67, true);           // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length + jsonPad, true);
  dv.setUint32(16, 0x4E4F534A, true);          // 'JSON'
  u8.set(jsonBytes, 20);
  u8.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad);
  const o = 20 + jsonBytes.length + jsonPad;
  dv.setUint32(o, bin.length + binPad, true);
  dv.setUint32(o + 4, 0x004E4942, true);       // 'BIN'
  u8.set(bin, o + 8);
  return buf;
}

async function loadModel(id, base = 'assets/models') {
  const res = await fetch(`${base}/${id}/${id}.json`);
  if (!res.ok) throw new Error(id);
  const json = await res.json();
  const raw = atob(json.extras.bin);
  const bin = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
  delete json.extras.bin;
  return new Promise((ok, fail) => new THREE.GLTFLoader().parse(makeGlb(json, bin), `${base}/${id}/`, g => { shareSources(g, `${base}/${id}/`); ok(g); }, fail));
}

// Одна картинка — одна копия. Каждая модель из Blender грузит свои «доски», «кору», «верёвку» заново
// (у загрузчика glTF кэш на один файл), и в видеопамяти их набиралось по 40–60 одинаковых.
// По адресу файла подставляем уже загруженную картинку; лишнюю освобождаем
const SHARED_SOURCES = new Map();
function shareSources(g, base) {
  const json = g.parser && g.parser.json, assoc = g.parser && g.parser.associations;
  if (!json || !json.images || !assoc) return;
  const uriOf = new Map();
  for (const [obj, a] of assoc) {
    if (!obj || !obj.isTexture || !a || a.textures === undefined) continue;
    const img = json.images[json.textures[a.textures].source];
    if (img && img.uri) uriOf.set(obj.source, new URL(img.uri, new URL(base, location.href)).href);
  }
  const old = new Set();
  g.scene.traverse(o => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) {
      for (const k of Object.keys(m)) {
        const t = m[k];
        if (!t || !t.isTexture || !uriOf.has(t.source)) continue;
        const uri = uriOf.get(t.source), shared = SHARED_SOURCES.get(uri);
        if (!shared) SHARED_SOURCES.set(uri, t.source);
        else if (shared !== t.source) { old.add(t.source); t.source = shared; t.needsUpdate = true; }
      }
    }
  });
  for (const s of old) if (s.data && s.data.close) s.data.close();
}

function loadAssets(onProgress) {
  // Chrome и Edge не дают WebGL брать картинки с диска (file://) — тогда сразу работаем на своих текстурах
  if (ASSETS.blocked || !THREE.GLTFLoader) return Promise.resolve();
  const total = ASSET_LIST.textures.length + ASSET_LIST.models.length + ASSET_LIST.blender.length + 1;
  let done = 0;
  const tick = () => onProgress(++done / total);
  const tl = new THREE.TextureLoader();
  const tex = (url, srgb) => new Promise(done => tl.load(url, t => {
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    done(t);
  }, undefined, () => done(null)));
  const jobs = ASSET_LIST.textures.map(id =>
    Promise.all([tex(`assets/textures/${id}/diffuse_1k.jpg`, true), tex(`assets/textures/${id}/nor_gl_1k.jpg`, false)])
      .then(([map, normal]) => { if (map && normal) ASSETS.tex[id] = { map, normal }; tick(); }));
  jobs.push(tex('assets/textures/leaves/diffuse_1k.jpg', true).then(t => { ASSETS.leaves = t; tick(); }));
  for (const id of ASSET_LIST.models) {
    jobs.push(loadModel(id).then(g => {
      g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      ASSETS.models[id] = g.scene;
    }).catch(() => { /* без этой модели — нарисуем своё */ }).then(tick));
  }
  for (const id of ASSET_LIST.blender) {
    // Хижины и мебель в них: дерево без мха (деревья, Башня и мост остаются замшелыми)
    const indoor = id.startsWith('house_') || ['bed', 'table_long', 'shelf', 'chest', 'workbench', 'stool', 'mapboard', 'barrel',
      'cot', 'jar_shelf', 'map_table', 'tool_rack', 'butcher_table', 'meat_rack', 'weapon_rack', 'bench_simple'].includes(id);
    jobs.push(loadModel(id, 'assets/blender').then(g => {
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          if (m.name === 'leaves') { m.alphaTest = 0.5; m.transparent = false; m.side = THREE.DoubleSide; }
          if (m.name === 'ember') m.emissiveIntensity = 3;
          if (m.name === 'sensor') m.emissiveIntensity = 2.5;
          if (m.name === 'beacon') m.emissiveIntensity = 4;
          if (m.name === 'flame') m.emissiveIntensity = 3;
          if (indoor && m.name === 'bark') weatheredWood(m, 0.35, '1.16, 0.95, 0.72');
          if (indoor && m.name === 'planks') weatheredWood(m, 0.8, '1.12, 0.96, 0.78');
        }
        // Шкура гривера блестит слизью: тот же материал, но с лаковым слоем
        if (ms.some(m => m.name.startsWith('flesh'))) {
          const slime = m => !m.name.startsWith('flesh') ? m : new THREE.MeshPhysicalMaterial({
            name: m.name, color: m.color, map: m.map, normalMap: m.normalMap, normalScale: m.normalScale, vertexColors: m.vertexColors,
            roughness: Math.max(0.5, m.roughness), metalness: m.metalness, clearcoat: 0.5, clearcoatRoughness: 0.32, envMapIntensity: 0.3,
          });
          o.material = Array.isArray(o.material) ? o.material.map(slime) : slime(o.material);
        }
      });
      ASSETS.models[id] = g.scene;
      ASSETS.gltf[id] = g;
    }).catch(() => { /* без этой модели — нарисуем своё */ }).then(tick));
  }
  return Promise.all(jobs).then(() => { ASSETS.real = Object.keys(ASSETS.tex).length > 0; });
}

// Брёвна и доски хижин: на фото коры полосы зелёного мха, а стены в фильме серо-коричневые.
// Цвет текстуры приглушаем (sat — сколько оставить насыщенности) и чуть утепляем.
function weatheredWood(m, sat, tint) {
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, ${sat.toFixed(2)}) * vec3(${tint});`);
  };
  // Текст функции одинаков для всех вызовов, поэтому шейдеры различаем явно
  m.customProgramCacheKey = () => 'wood' + sat + tint;
}

// Есть ли модель из Blender (иначе игра рисует запасной вариант)
function hasModel(id) { return !!ASSETS.models[id]; }

// Копия настоящей текстуры с нужным повтором (или null, если её нет)
function realMaps(id, rx = 1, ry = rx) {
  const t = ASSETS.tex[id];
  if (!t) return null;
  const map = t.map.clone(), normal = t.normal.clone();
  for (const m of [map, normal]) { m.needsUpdate = true; m.repeat.set(rx, ry); }
  return { map, normal };
}

// Все меши модели (для расстановки копий через InstancedMesh)
function modelMeshes(id) {
  const root = ASSETS.models[id], out = [];
  if (!root) return out;
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh) out.push(o); });
  return out;
}

// Копия модели целиком (для единичных предметов)
function placeModel(id, x, y, z, { scale = 1, rotY = 0, parent = null } = {}) {
  const src = ASSETS.models[id];
  if (!src) return null;
  const m = src.clone(true);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.scale.setScalar(scale);
  (parent || World.scene).add(m);
  return m;
}
