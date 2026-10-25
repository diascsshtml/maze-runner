// Стены Лабиринта: камень с рельефом и грязью, плющ из листьев, пол с затенением у стен,
// камни и трава у основания, ворота с зубьями, анимация сдвига с пылью.

const AO_MARGIN = 10;                   // тайлов пола за внешней стеной
const AO_N = SIZE + AO_MARGIN * 2;

const Walls = {
  h: new Float32Array(SIZE * SIZE),     // высота стены 0..1 (анимация сдвига)
  dirty: true, wasAnimating: false, density: 1,
};

const NOISE_GLSL = `
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

// Характер секторов в шейдере: по мировой позиции — номер сектора (как sectorByAngle), у границ — смесь
// с соседним. A: мох, сырость, ржавчина, копоть; B: лишайник, трещины, пятна, пыль; C: оттенок камня.
// Стены вокруг самого Глэйда — без темы
const THEME_A = [[1, 0, 0, 0], [1.7, 0.2, 0, 0], [0.5, 0, 0, 0], [0.6, 0.1, 1, 0], [1.2, 1, 0, 0], [1.4, 0.4, 0, 0], [0.15, 0, 0, 1], [0.3, 0, 0, 0], [0.7, 0.3, 0, 0.25]];
const THEME_B = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 1, 0, 0.6], [0, 0.3, 0.3, 0], [0, 0, 0.4, 0], [0, 0.2, 0.2, 0], [0, 0.4, 0, 0], [1, 0.2, 0, 0.8], [0, 0.3, 1, 0]];
const THEME_C = [[1, 1, 1], [0.92, 0.98, 0.88], [1.08, 1.05, 0.98], [1, 0.93, 0.86], [0.82, 0.86, 0.86], [0.95, 0.92, 0.86], [0.8, 0.78, 0.76], [1.18, 1.16, 1.1], [0.78, 0.78, 0.8]];
const glslArr = (type, rows) => `${type}[${rows.length}](${rows.map(r => `${type}(${r.map(v => v.toFixed(3)).join(', ')})`).join(', ')})`;
const THEME_GLSL = `
const vec4 TA[9] = ${glslArr('vec4', THEME_A)};
const vec4 TB[9] = ${glslArr('vec4', THEME_B)};
const vec3 TC[9] = ${glslArr('vec3', THEME_C)};
void themeAt(vec3 wp, out vec4 A, out vec4 B, out vec3 C) {
  vec2 t = wp.xz / ${S.toFixed(2)} - vec2(${MID.toFixed(1)});
  float g = 1.0 - step(12.9, max(abs(t.x), abs(t.y)));
  float a = mod(atan(t.y, t.x) + 1.9634954, 6.2831853) / 0.7853982;
  float fi = floor(a), fr = a - fi;
  int s1 = int(fi) + 1;
  int sn = fr < 0.5 ? (s1 == 1 ? 8 : s1 - 1) : (s1 == 8 ? 1 : s1 + 1);
  float w = 0.5 * (1.0 - smoothstep(0.0, 0.1, min(fr, 1.0 - fr)));
  A = mix(mix(TA[s1], TA[sn], w), TA[0], g);
  B = mix(mix(TB[s1], TB[sn], w), TB[0], g);
  C = mix(mix(TC[s1], TC[sn], w), TC[0], g);
}`;
// Плющ по секторам: сколько (множитель) и какого цвета (в Пепельном — засохший, в Меловом — бледный)
const IVY_K = [1, 1.9, 0.6, 0.7, 1.1, 1.3, 0.35, 0.5, 0.8];
const IVY_C = [[1, 1, 1], [1, 1.05, 0.95], [1, 1, 1], [0.95, 0.9, 0.85], [0.85, 0.95, 0.9], [1, 1, 1], [0.9, 0.6, 0.35], [1.05, 1.05, 0.8], [0.7, 0.75, 0.7]];
// Камни и трава у стен по секторам
const ROCK_K = [1, 0.8, 2.6, 1, 0.8, 1, 1.2, 1.6, 1];
const TUFT_K = [1, 2.6, 0.8, 0.6, 1.3, 1.5, 0.15, 0.6, 0.3];

// Высота секции стены: у каждой своя, поэтому верх Лабиринта неровный
function wallHv(x, y) { return 0.86 + hash3(x, y, 7) * 0.28; }

// Секция стены со скошенными вертикальными рёбрами: между соседними секциями получаются швы.
// Из Blender — три варианта блока со швами между плитами, сколотым верхом и грязью в цвете вершин
function wallGeometry(variant) {
  const src = modelMeshes('wall_' + variant)[0];
  if (src) return src.geometry.clone().applyMatrix4(src.matrixWorld);
  const h = S / 2, c = 0.32;
  const shape = new THREE.Shape([[-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c]]
    .map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: WALL_H, bevelEnabled: false }).rotateX(-Math.PI / 2);
}

// Добавляет в материал мировые координаты фрагмента (vWPos) и свой код окраски
function patchWorldPos(mat, fragCode, roughCode = '', extra = null) {
  mat.onBeforeCompile = sh => {
    if (extra) Object.assign(sh.uniforms, extra.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vWPos = (modelMatrix * wp).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\n' + (extra ? extra.decl : '') + NOISE_GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + fragCode)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + roughCode);
  };
  // Текст обработчика одинаков у всех материалов с этой правкой; без своего ключа three.js отдал бы
  // земле Глэйда уже собранный шейдер пола Лабиринта (с теми же картами), и тропы с грязью пропали бы
  mat.customProgramCacheKey = () => 'wp' + fragCode + roughCode;
  return mat;
}

// Бетон из фотоскана (или свой камень), сверху шейдером: мох пятнами и у земли, сырость, подтёки
function wallMaterial(variant) {
  let maps = realMaps('concrete_layers', 1 / 4.5);
  if (!maps) {
    const p = TEX.walls[variant];
    maps = { map: p.map.clone(), normal: p.normal.clone() };
    for (const t of [maps.map, maps.normal]) { t.needsUpdate = true; t.repeat.set(1 / S, 1 / S); }
  }
  const moss = realMaps('concrete_moss', 1 / 3);
  if (moss) moss.map.encoding = THREE.LinearEncoding;      // переводим в линейный цвет сами, в шейдере
  const tint = [[1, 1, 1], [0.9, 0.93, 0.88], [1.06, 1.03, 0.97]][variant];
  const baked = !!modelMeshes('wall_' + variant)[0];
  const m = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normal, roughness: 0.95, envMapIntensity: 0.85, vertexColors: baked });
  m.color.setRGB(...tint);
  return patchWorldPos(m, `
    vec4 tA, tB; vec3 tC;
    themeAt(vWPos, tA, tB, tC);
    float wallN = gNoise(vec2(vWPos.x + vWPos.z, vWPos.y * 0.1) * 0.3);
    float streak = gNoise(vec2((vWPos.x + vWPos.z) * 1.6, vWPos.y * 0.025));
    float damp = clamp((1.0 - smoothstep(0.0, 4.5 + tA.y * 6.0, vWPos.y)) * (1.0 + tA.y * 0.5) + tA.y * 0.2, 0.0, 1.0);
    float mn = gNoise(vec2(vWPos.x + vWPos.z, vWPos.y) * 0.16) * 0.65 + gNoise(vec2(vWPos.x - vWPos.z, vWPos.y) * 0.55) * 0.35;
    vec3 mossCol = ${moss ? 'pow(texture2D(mossMap, vUv * 1.5).rgb, vec3(2.2))' : 'vec3(0.05, 0.08, 0.025)'};
    float mossMask = clamp((smoothstep(0.58, 0.78, mn) * 0.85 + damp * smoothstep(0.3, 0.55, mn)) * tA.x, 0.0, 1.0);
    diffuseColor.rgb *= tC;
    diffuseColor.rgb *= mix(1.0, 0.55, damp * 0.8);
    diffuseColor.rgb *= 0.8 + 0.3 * wallN;
    diffuseColor.rgb *= 1.0 - 0.32 * smoothstep(0.55, 0.9, streak) * smoothstep(4.0, ${WALL_H.toFixed(1)}, vWPos.y + 6.0);
    // Ржавые потёки сверху вниз (от труб и креплений), копоть снизу, лишайник пятнами, трещины, тёмные пятна, пыль
    float rust = smoothstep(0.55, 0.85, gNoise(vec2((vWPos.x + vWPos.z) * 2.2, vWPos.y * 0.06))) * (0.4 + 0.6 * smoothstep(0.0, 14.0, vWPos.y)) * tA.z;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.13, 0.05), rust * 0.75);
    float soot = tA.w * (1.0 - smoothstep(0.0, 5.0 + 9.0 * gNoise(vec2(vWPos.x + vWPos.z, 1.0) * 0.45), vWPos.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.022, 0.02), clamp(soot, 0.0, 1.0) * 0.88);
    float lichen = smoothstep(0.62, 0.7, gNoise(vec2(vWPos.x + vWPos.z, vWPos.y) * 0.9)) * tB.x;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.71, 0.6), lichen * 0.75);
    float crack = 1.0 - smoothstep(0.0, 0.022, abs(gNoise(vec2(vWPos.x + vWPos.z, vWPos.y * 0.6) * 0.8) - 0.5));
    diffuseColor.rgb *= 1.0 - crack * tB.y * 0.65;
    float stain = smoothstep(0.55, 0.8, gNoise(vec2(vWPos.x - vWPos.z, vWPos.y * 0.3) * 0.5)) * tB.z;
    diffuseColor.rgb *= 1.0 - stain * 0.45;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.59, 0.54), tB.w * 0.25 * (1.0 - damp));
    diffuseColor.rgb = mix(diffuseColor.rgb, mossCol * 0.85, mossMask);`,
  'roughnessFactor *= mix(1.0, 0.7, damp) * (1.0 - tA.y * 0.4);',
  { uniforms: moss ? { mossMap: { value: moss.map } } : {}, decl: (moss ? 'uniform sampler2D mossMap;\n' : '') + THEME_GLSL + '\n' });
}

function initWalls(scene, density) {
  Walls.density = density;
  Walls.meshes = [0, 1, 2].map(variant => {
    const m = new THREE.InstancedMesh(wallGeometry(variant), wallMaterial(variant), SIZE * SIZE);
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  });

  // Плющ: карточки с гроздьями листьев
  const ivyMat = new THREE.MeshStandardMaterial({ map: TEX.ivy, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, envMapIntensity: 0.5 });
  Walls.ivy = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5), ivyMat, Math.round(42000 * density) + 100);
  Walls.ivy.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: TEX.ivy, alphaTest: 0.45 });
  Walls.ivy.castShadow = Walls.ivy.receiveShadow = true;
  Walls.ivy.frustumCulled = false;
  scene.add(Walls.ivy);

  // Камни у основания стен (их тысячи по всему Лабиринту: 36 треугольников на камень вместо 80)
  const rockGeo = new THREE.DodecahedronGeometry(0.3, 0);
  const rp = rockGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < rp.count; i++) {
    v.fromBufferAttribute(rp, i);
    v.multiplyScalar(0.75 + noise3(v.x * 6, v.y * 6, v.z * 6) * 0.5);
    rp.setXYZ(i, v.x, v.y * 0.7, v.z);
  }
  rockGeo.computeVertexNormals();
  // Камни берут фототекстуру замшелого камня из модели Poly Haven, если она загрузилась
  const rockSrc = modelMeshes('rock_moss_set_01')[0];
  const rockMat = rockSrc ? rockSrc.material.clone()
    : new THREE.MeshStandardMaterial({ color: srgb('#7d786f'), map: TEX.rock.map, normalMap: TEX.rock.normal, roughness: 0.95 });
  Walls.rocks = new THREE.InstancedMesh(rockGeo, rockMat, 6000);
  Walls.rocks.castShadow = Walls.rocks.receiveShadow = true;
  Walls.rocks.frustumCulled = false;
  scene.add(Walls.rocks);

  Walls.tufts = new THREE.InstancedMesh(grassClumpGeometry(6, 0.32), grassMaterial(), Math.round(7000 * density) + 50);
  Walls.tufts.receiveShadow = true;
  Walls.tufts.frustumCulled = false;
  scene.add(Walls.tufts);

  // Пол Лабиринта с затенением у стен (карта AO пересчитывается после сдвига)
  Walls.aoCanvas = makeCanvas(AO_N * 8, AO_N * 8);
  Walls.ao = new THREE.CanvasTexture(Walls.aoCanvas);
  let floorMaps = realMaps('stony_dirt_path', 1), texM = 3;
  if (!floorMaps) {
    floorMaps = { map: TEX.floor.map.clone(), normal: TEX.floor.normal.clone() };
    for (const t of [floorMaps.map, floorMaps.normal]) t.needsUpdate = true;
    texM = S;
  }
  const floorMat = new THREE.MeshStandardMaterial({ color: ASSETS.real ? 0xffffff : srgb('#9c968b'), map: floorMaps.map, normalMap: floorMaps.normal, roughness: 0.92, aoMap: Walls.ao, aoMapIntensity: 1, envMapIntensity: 0.5 });
  // Пол по секторам: трава в Плющевом, пыль и щебень в Обвальном, ржавые разводы, стоячая вода в Сыром,
  // пепел в Пепельном, светлая пыль в Меловом, тёмная слизь в Когтистом
  patchWorldPos(floorMat, `
    vec4 tA, tB; vec3 tC;
    themeAt(vWPos, tA, tB, tC);
    float fN = gNoise(vWPos.xz * 0.15);
    diffuseColor.rgb *= (0.8 + 0.3 * fN) * tC;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.7, 0.95, 0.55), clamp(tA.x - 1.0, 0.0, 1.0) * smoothstep(0.35, 0.7, gNoise(vWPos.xz * 0.6)));
    float pud = smoothstep(0.52, 0.6, gNoise(vWPos.xz * 0.32) * 0.75 + gNoise(vWPos.xz * 1.3) * 0.25) * tA.y;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.3, 0.33, 0.32), pud * 0.85);
    float frust = smoothstep(0.6, 0.8, gNoise(vWPos.xz * 0.5 + 3.0)) * tA.z;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.15, 0.07), frust * 0.6);
    float ash = smoothstep(0.35, 0.65, gNoise(vWPos.xz * 0.4 + 7.0)) * tA.w;
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.3, 0.29, 0.28), vec3(0.04, 0.035, 0.03), smoothstep(0.5, 0.8, gNoise(vWPos.xz * 1.7))), ash * 0.85);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.66, 0.63, 0.57), tB.w * 0.35 * smoothstep(0.3, 0.7, gNoise(vWPos.xz * 0.7 + 1.0)));
    float slime = smoothstep(0.6, 0.75, gNoise(vec2(vWPos.x * 0.6, vWPos.z * 2.5))) * tB.z;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.07, 0.04), slime * 0.6);`,
  'roughnessFactor = mix(roughnessFactor, 0.05, pud); roughnessFactor = mix(roughnessFactor, 0.3, slime * 0.7);',
  { uniforms: {}, decl: THEME_GLSL + '\n' });
  // Пол Лабиринта — четыре полосы вокруг Глэйда: внутри Глэйда своя земля с рельефом и рекой ниже нуля
  const lo = (-AO_MARGIN - 0.5) * S, hi = (SIZE - 1 + AO_MARGIN + 0.5) * S;
  const g0 = (GLADE_T0 - 0.5) * S, g1 = (GLADE_T1 + 0.5) * S;
  for (const [x0, x1, z0, z1] of [[lo, hi, lo, g0], [lo, hi, g1, hi], [lo, g0, g0, g1], [g1, hi, g0, g1]]) {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
    const floor = new THREE.Mesh(geo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    floor.receiveShadow = true;
    setAoUv(floor);
    // UV в метрах: одинаковая плотность текстуры на всех полосах
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + (x0 + x1) / 2) / texM, (-p.getY(i) + (z0 + z1) / 2) / texM);
    scene.add(floor);
  }

  initGates(scene);
}

// uv2 для карты затенения считаем из мировых координат вершин
function setAoUv(mesh) {
  mesh.updateMatrixWorld(true);
  const p = mesh.geometry.attributes.position, uv2 = new Float32Array(p.count * 2), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    uv2[i * 2] = (v.x / S + 0.5 + AO_MARGIN) / AO_N;
    uv2[i * 2 + 1] = 1 - (v.z / S + 0.5 + AO_MARGIN) / AO_N;
  }
  mesh.geometry.setAttribute('uv2', new THREE.BufferAttribute(uv2, 2));
}

function rebuildAO() {
  const small = makeCanvas(AO_N, AO_N), g = small.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, AO_N, AO_N);
  g.fillStyle = '#000';
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) if (isSolid(Maze.at(x, y))) g.fillRect(x + AO_MARGIN, y + AO_MARGIN, 1, 1);
  }
  const big = Walls.aoCanvas.getContext('2d');
  big.imageSmoothingEnabled = true;
  big.drawImage(small, 0, 0, Walls.aoCanvas.width, Walls.aoCanvas.height);
  big.globalCompositeOperation = 'screen';
  big.fillStyle = 'rgba(70, 70, 70, 1)';
  big.fillRect(0, 0, Walls.aoCanvas.width, Walls.aoCanvas.height);
  big.globalCompositeOperation = 'source-over';
  Walls.ao.needsUpdate = true;
}

const _m4 = new THREE.Matrix4(), _pos = new THREE.Vector3(), _quat = new THREE.Quaternion(), _scl = new THREE.Vector3(), _eul = new THREE.Euler(), _col = new THREE.Color();

// Тайная дверь (T.SECRET) выглядит и стоит как обычная стена, пока её не откроют
function isSolid(t) { return t === T.WALL || t === T.SECRET; }
function isOpen(x, y) { return !isSolid(Maze.at(x, y)); }

// Плющ только на стенах, которые стоят во весь рост и не двигаются
function rebuildIvy() {
  const mesh = Walls.ivy, cap = mesh.instanceMatrix.count;
  let n = 0;
  // Сначала перемешиваем стены стабильным пространственным хешем. Иначе лимит
  // InstancedMesh заполняется сверху вниз и оставляет дальнюю часть карты голой.
  const candidates = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x;
    if (Maze.tiles[i] === T.IVY || (isSolid(Maze.tiles[i]) && Walls.h[i] >= 1)) {
      candidates.push({ x, y, order: hash3(x, y, 701) });
    }
  }
  candidates.sort((a, b) => a.order - b.order || a.y - b.y || a.x - b.x);
  for (const { x, y } of candidates) {
      if (n >= cap) break;
      if (Maze.at(x, y) === T.IVY) { n = ivyCurtain(mesh, n, cap, x, y); continue; }
      const sec = sectorOfTile(x, y), ic = IVY_C[sec];
      DIRS.forEach((d, f) => {
        if (n >= cap || !isOpen(x + d.x, y + d.y)) return;
        const glade = Maze.at(x + d.x, y + d.y) === T.GLADE;
        const vines = Math.floor(hash3(x, y, f) * (glade ? 3.4 : 2.4 * IVY_K[sec]) * Walls.density + 0.2);
        const top = WALL_H * wallHv(x, y);
        // Плющ на макушке стены, у края
        for (let c = 0; c < 4 && n < cap; c++) {
          const q = k => hash3(x * 5 + c, y * 9 + f, k + 70);
          if (q(0) < 0.35) continue;
          const along = (q(1) - 0.5) * S * 0.9, inward = q(2) * 1.1;
          _pos.set(x * S + d.x * (S / 2 - inward) + (d.y !== 0 ? along : 0), top + 0.06,
            y * S + d.y * (S / 2 - inward) + (d.x !== 0 ? along : 0));
          _quat.setFromEuler(_eul.set(-Math.PI / 2 + (q(3) - 0.5) * 0.5, q(4) * 6.28, 0, 'YXZ'));
          const s = 1.1 + q(5) * 0.8;
          _scl.set(s, s, s);
          _m4.compose(_pos, _quat, _scl);
          mesh.setMatrixAt(n, _m4);
          _col.setRGB((0.8 + q(6) * 0.3) * ic[0], (0.9 + q(7) * 0.2) * ic[1], 0.75 * ic[2]);
          mesh.setColorAt(n++, _col);
        }
        _eul.order = 'XYZ';
        for (let v = 0; v < vines && n < cap; v++) {
          const r = k => hash3(x * 7 + v, y * 13 + f, k);
          const u0 = (r(1) - 0.5) * S * 0.8;
          const len = top * (0.25 + r(2) * 0.72);
          for (let yy = top - 0.4; yy > top - len && n < cap; yy -= 0.72) {
            const k = (top - yy) / len;
            if (hash3(x + v, Math.round(yy * 10), f) < k * 0.45) continue;
            const along = u0 + Math.sin(yy * 0.7 + r(3) * 6) * 0.35;
            _pos.set(x * S + d.x * (S / 2 + 0.05 + r(4) * 0.12) + (d.y !== 0 ? along : 0), yy,
              y * S + d.y * (S / 2 + 0.05 + r(4) * 0.12) + (d.x !== 0 ? along : 0));
            _eul.set(0, Math.atan2(d.x, d.y), 0);
            _quat.setFromEuler(_eul);
            const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), hash3(n, x, y) * 6.28);
            const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (hash3(n, y, x) - 0.5) * 0.6);
            _quat.multiply(tilt).multiply(roll);
            const s = (0.75 + hash3(x, n, y) * 0.5) * (1 - k * 0.35);
            _scl.set(s, s, s);
            _m4.compose(_pos, _quat, _scl);
            mesh.setMatrixAt(n, _m4);
            const g = 0.75 + hash3(n, n, x) * 0.45;
            _col.setRGB(g * (0.9 + hash3(y, n, 1) * 0.2) * ic[0], g * ic[1], g * 0.85 * ic[2]);
            mesh.setColorAt(n, _col);
            n++;
          }
        }
      });
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// Занавес из плюща в тайном проходе: густые листья во весь проём до перемычки, с обеих сторон
const IVY_GAP = 4.6;
function ivyCurtain(mesh, n, cap, x, y) {
  const along = isOpen(x, y - 1) && isOpen(x, y + 1);          // проход вдоль Y — занавес поперёк, в плоскости X
  for (const side of [-1, 1]) {
    for (let u = -1.45; u <= 1.46 && n < cap; u += 0.58) {
      for (let h = 0.35; h < IVY_GAP + 0.3 && n < cap; h += 0.5) {
        const r = k => hash3(x * 13 + Math.round(u * 10), y * 7 + Math.round(h * 10) + side, k + 90);
        const off = side * (0.05 + r(1) * 0.25);
        _pos.set(x * S + (along ? u + (r(2) - 0.5) * 0.3 : off), h + (r(3) - 0.5) * 0.3, y * S + (along ? off : u + (r(2) - 0.5) * 0.3));
        _quat.setFromEuler(_eul.set((r(4) - 0.5) * 0.6, (along ? 0 : Math.PI / 2) + (r(5) - 0.5) * 0.5, r(6) * 6.28, 'YXZ'));
        const sc = 1.15 + r(7) * 0.5;
        _scl.set(sc, sc, sc);
        _m4.compose(_pos, _quat, _scl);
        mesh.setMatrixAt(n, _m4);
        const g = 0.5 + r(8) * 0.35;                       // в тени проёма листья темнее, чем на солнечной стене
        _col.setRGB(g * 0.9, g, g * 0.78);
        mesh.setColorAt(n++, _col);
      }
    }
  }
  _eul.order = 'XYZ';
  return n;
}

// Камни и трава у основания стен в коридорах
function rebuildDebris() {
  let nr = 0, nt = 0;
  const capR = Walls.rocks.instanceMatrix.count, capT = Walls.tufts.instanceMatrix.count;
  // Декор тоже обходим в стабильном псевдослучайном порядке: при заполнении
  // буфера детали равномерно покрывают карту, а не обрываются в нижних рядах.
  const floors = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (Maze.at(x, y) === T.FLOOR) floors.push({ x, y, order: hash3(x, y, 702) });
  }
  floors.sort((a, b) => a.order - b.order || a.y - b.y || a.x - b.x);
  for (const { x, y } of floors) {
      if (nr >= capR && nt >= capT) break;
      const sec = sectorOfTile(x, y);
      DIRS.forEach((d, f) => {
        if (Maze.at(x + d.x, y + d.y) !== T.WALL) return;
        const count = Math.floor(hash3(x, y, f + 10) * 3.5 * ROCK_K[sec]);
        for (let k = 0; k < count && nr < capR; k++) {
          const r = j => hash3(x * 3 + k, y * 5 + f, j);
          const along = (r(1) - 0.5) * S * 0.9, out = S / 2 - 0.15 - r(2) * 0.5;
          _pos.set(x * S + d.x * out + (d.y !== 0 ? along : 0), 0.02, y * S + d.y * out + (d.x !== 0 ? along : 0));
          _quat.setFromEuler(_eul.set(r(3) * 3, r(4) * 6, r(5) * 3));
          const s = 0.2 + r(6) * r(6) * 0.8;
          _scl.set(s, s, s);
          _m4.compose(_pos, _quat, _scl);
          Walls.rocks.setMatrixAt(nr++, _m4);
        }
        const tufts = Math.floor(hash3(x, y, f + 20) * 6 * Walls.density * TUFT_K[sec]);
        for (let k = 0; k < tufts && nt < capT; k++) {
          const r = j => hash3(x * 11 + k, y * 3 + f, j + 40);
          const along = (r(1) - 0.5) * S, out = S / 2 - 0.1 - r(2) * r(2) * 1.2;
          _pos.set(x * S + d.x * out + (d.y !== 0 ? along : 0), 0, y * S + d.y * out + (d.x !== 0 ? along : 0));
          _quat.setFromEuler(_eul.set(0, r(3) * 6, 0));
          const s = 0.5 + r(4) * 0.8;
          _scl.set(s, s * (0.7 + r(5) * 0.6), s);
          _m4.compose(_pos, _quat, _scl);
          Walls.tufts.setMatrixAt(nt, _m4);
          _col.setRGB(0.75 + r(6) * 0.3, 0.8 + r(7) * 0.25, 0.6);
          Walls.tufts.setColorAt(nt++, _col);
        }
      });
  }
  Walls.rocks.count = nr;
  Walls.tufts.count = nt;
  for (const m of [Walls.rocks, Walls.tufts]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

function resetWalls() {
  for (let i = 0; i < SIZE * SIZE; i++) Walls.h[i] = isSolid(Maze.tiles[i]) ? 1 : 0;
  Walls.dirty = true;
  rebuildAO();
  rebuildIvy();
  rebuildDebris();
  rebuildMazeDecor(true);
}

// Стены растут из земли или уходят в неё; рядом с игроком летит пыль и сыплются камни
function updateWalls(dt, px, pz) {
  let animating = false, started = false;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const target = isSolid(Maze.tiles[i]) ? 1 : 0, h = Walls.h[i];
    if (h === target) continue;
    if ((h === 0 || h === 1) && !Walls.wasAnimating) started = true;
    Walls.h[i] = h < target ? Math.min(target, h + dt / 4) : Math.max(target, h - dt / 4);
    animating = true;
    const x = (i % SIZE) * S, z = Math.floor(i / SIZE) * S;
    if (Math.hypot(x - px, z - pz) < 55) {
      if (Math.random() < dt * 3) emitDust(x, 0, z, S * 0.6, 1);
      if (Math.random() < dt * 4) emitDebris(x, Walls.h[i] * WALL_H, z, S * 0.5, 2);
    }
  }
  if (started) rebuildIvy();                    // спрятать плющ с двигающихся стен
  if (Walls.wasAnimating && !animating) {        // сдвиг закончился
    rebuildAO();
    rebuildIvy();
    rebuildDebris();
    rebuildMazeDecor(false);
  }
  Walls.wasAnimating = animating;
  if (!animating && !Walls.dirty) return;
  Walls.dirty = false;
  const counts = [0, 0, 0];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const h = Walls.h[y * SIZE + x], ivy = Maze.tiles[y * SIZE + x] === T.IVY;
      if (h <= 0.001 && !ivy) continue;
      const v = Math.floor(hash3(x, y, 1) * 3), mesh = Walls.meshes[v];
      // Над проходом за плющом стена продолжается перемычкой
      _pos.set(x * S, ivy ? IVY_GAP : 0, y * S);
      _scl.set(1, ivy ? (WALL_H * wallHv(x, y) - IVY_GAP) / WALL_H : h * wallHv(x, y), 1);
      _m4.compose(_pos, _quat.identity(), _scl);
      mesh.setMatrixAt(counts[v], _m4);
      const l = 0.86 + hash3(x, y, 2) * 0.22;
      _col.setRGB(l, l * (0.98 + hash3(x, y, 4) * 0.04), l * 0.97);
      mesh.setColorAt(counts[v]++, _col);
    }
  }
  Walls.meshes.forEach((m, v) => {
    m.count = counts[v];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
}

/* ---------- ворота ---------- */

function initGates(scene) {
  let maps = realMaps('rusty_metal_02', 1, 6);
  if (!maps) {
    maps = { map: TEX.metal.map.clone(), normal: TEX.metal.normal.clone() };
    for (const t of [maps.map, maps.normal]) { t.needsUpdate = true; t.repeat.set(1, 4); }
  }
  const mat = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normal, color: 0x9a9690, metalness: 0.75, roughness: 0.55 });
  Walls.gates = [];
  for (const g of GATES) {
    for (const side of [-1, 1]) {
      // Створка из Blender: бетон в стальной раме, зубья смотрят на +X. Поворачиваем зубьями к середине прохода,
      // у соседних створок зубья сдвинуты по высоте (gate_b), чтобы входить друг между другом
      const leaf = put(side > 0 ? 'gate_b' : 'gate_a', 0, 0, 0, g.vertical ? side * Math.PI / 2 : side > 0 ? Math.PI : 0);
      if (leaf) {
        leaf.userData.y = 0;
        Walls.gates.push({ slab: leaf, g, side });
        continue;
      }
      const slab = new THREE.Mesh(
        g.vertical ? new THREE.BoxGeometry(S * 0.55, WALL_H, S / 2) : new THREE.BoxGeometry(S / 2, WALL_H, S * 0.55), mat);
      slab.castShadow = slab.receiveShadow = true;
      // Зубья на смыкающемся краю, у соседних створок вперемешку
      for (let k = 0; k < 14; k++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(g.vertical ? S * 0.35 : 0.45, 0.55, g.vertical ? 0.45 : S * 0.35), mat);
        const y = -WALL_H / 2 + 0.8 + k * 1.35 + (side > 0 ? 0.65 : 0);
        if (g.vertical) tooth.position.set(0, y, -side * (S / 4 + 0.2));
        else tooth.position.set(-side * (S / 4 + 0.2), y, 0);
        tooth.castShadow = true;
        slab.add(tooth);
      }
      slab.userData.y = WALL_H / 2;
      scene.add(slab);
      Walls.gates.push({ slab, g, side });
    }
  }
}

function updateGates(dt, px, pz) {
  const k = S / 4 + (1 - Game.gate) * S / 2 + (1 - Game.gate) * 0.25;
  for (const { slab, g, side } of Walls.gates) {
    slab.position.set(g.x * S + (g.vertical ? 0 : side * k), slab.userData.y, g.y * S + (g.vertical ? side * k : 0));
  }
  if (Game.gateDir) {
    for (const g of GATES) {
      if (Math.hypot(g.x * S - px, g.y * S - pz) > 60) continue;
      if (Math.random() < dt * 8) emitDust(g.x * S, 0, g.y * S, 1.2, 1);
      if (Math.random() < dt * 6) emitDebris(g.x * S, WALL_H * Math.random(), g.y * S, 0.6, 1);
    }
  }
}
