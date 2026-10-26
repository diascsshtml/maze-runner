/* ---------- живой огонь: языки пламени шейдером ----------
   Каждый язык — вертикальная полоса, всегда развёрнутая к камере (вращается только вокруг вертикали, поэтому
   пламя тянется вверх, как ни наклони факел). Форму даёт шейдер: шум поднимается снизу вверх, язык сужается
   к макушке, отрывается кусками и колышется; середина у основания почти белая, края красно-оранжевые.
   Костёр — несколько языков разного роста, факел — два-три. Частицы остаются только для искр, дыма и
   редких отрывающихся языков (emitFire с fireK < 1). */

const FLAME = { mat: null, geo: null, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uGain: { value: 1.6 } };

function flameMaterial() {
  if (FLAME.mat) return FLAME.mat;
  FLAME.mat = new THREE.ShaderMaterial({
    uniforms: { uTime: FLAME.uTime, uCam: FLAME.uCam, uGain: FLAME.uGain },
    vertexShader: `
      uniform vec3 uCam;
      attribute vec3 aBase, aSize;           // основание языка в осях огня; ширина, высота, яркость
      varying vec2 vUv;
      varying float vSeed, vFade;
      void main() {
        vec3 base = (modelMatrix * vec4(aBase, 1.0)).xyz;
        float k = length(modelMatrix[1].xyz), sx = aSize.x * k, sy = aSize.y * k;
        vec3 toCam = uCam - base;
        toCam.y = 0.0;
        vec3 right = length(toCam) > 1e-4 ? normalize(vec3(toCam.z, 0.0, -toCam.x)) : vec3(1.0, 0.0, 0.0);
        vec3 wp = base + right * position.x * sx + vec3(0.0, position.y * sy, 0.0);
        vUv = uv;
        vSeed = fract(sin(dot(base.xz + base.y, vec2(12.9898, 78.233))) * 43758.5453);
        // У костра языки накладываются друг на друга — каждый тусклее (aSize.z)
        vFade = (1.0 - smoothstep(70.0, 95.0, distance(uCam, base))) * aSize.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime, uGain;
      varying vec2 vUv;
      varying float vSeed, vFade;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; }
        return v;
      }
      void main() {
        float t = uTime + vSeed * 17.0;
        vec2 uv = vUv;
        // Крупный шум колышет язык вбок, мелкий — рвёт его край и макушку; оба бегут вверх
        float n = fbm(vec2(uv.x * 2.2 + vSeed * 5.0, uv.y * 1.8 - t * 2.1));
        float n2 = fbm(vec2(uv.x * 5.0 - vSeed * 3.0, uv.y * 3.6 - t * 3.6));
        float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 1.1 * uv.y;
        float y = uv.y + (n2 - 0.5) * 0.3 * uv.y;
        float w = 0.8 * pow(max(0.0, 1.0 - y), 0.75) * smoothstep(-0.04, 0.16, uv.y) + 0.015;
        float body = 1.0 - smoothstep(w * 0.35, w, abs(x));
        body *= smoothstep(0.22, 0.6, n2 + (1.0 - y) * 0.75);       // к макушке язык рвётся на клочья
        body *= 1.0 - smoothstep(0.78, 1.0, y);
        float core = (1.0 - smoothstep(0.0, w * 0.5, abs(x))) * (1.0 - smoothstep(0.08, 0.55, y)) * smoothstep(0.0, 0.12, uv.y);
        vec3 col = mix(vec3(0.75, 0.12, 0.015), vec3(1.0, 0.45, 0.07), smoothstep(0.05, 0.75, body));
        col = mix(col, vec3(1.0, 0.8, 0.42), core * 0.85);
        float a = clamp(body, 0.0, 1.0) * (0.75 + 0.25 * n2);
        gl_FragColor = vec4(col * a * uGain * vFade, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return FLAME.mat;
}

// Огонь из нескольких языков — одна сетка на весь огонь (один вызов отрисовки). size — высота главного языка (м),
// n — сколько языков, spread — разброс оснований, gain — яркость каждого
function makeFlame(size, n = 3, spread = 0.1, gain = 1) {
  const pos = [], uv = [], base = [], sz = [], idx = [];
  for (let i = 0; i < n; i++) {
    const main = i === 0, a = i * 2.4, r = main ? 0 : spread * (0.6 + 0.4 * ((i * 37) % 10) / 10);
    const h = size * (main ? 1 : 0.55 + 0.35 * ((i * 53) % 10) / 10);
    for (const [x, y] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) {
      pos.push(x, y, 0);
      uv.push(x + 0.5, y);
      base.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      sz.push(h * 0.62, h, gain);
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 3));
  geo.setIndex(idx);
  // Вершины двигает шейдер — границы для отсечения задаём сами
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, size * 0.5, 0), size * 0.7 + spread);
  const m = new THREE.Mesh(geo, flameMaterial());
  m.renderOrder = 2;
  return m;
}

// Огни Глэйда (костёр, очаг, горн, кухня, факелы на столбах): языки ставятся при первом обновлении
function flameForFire(f) {
  const p = f.power;
  const size = p > 1.5 ? 1.6 : p > 0.7 ? 0.55 : p > 0.42 ? 0.42 : 0.32;
  const g = makeFlame(size, p > 1.5 ? 6 : p > 0.7 ? 4 : 3, p > 1.5 ? 0.3 : 0.06 + p * 0.06, p > 1.5 ? 0.5 : p > 0.7 ? 0.7 : 0.85);
  g.position.set(f.x, f.y - (p > 1.5 ? 0.12 : 0.04), f.z);
  World.scene.add(g);
  return g;
}

function updateFlames(dt) {
  FLAME.uTime.value += dt;
  if (World.camera) World.camera.getWorldPosition(FLAME.uCam.value);
  // Днём пламя на ярком фоне бледнее, ночью — ярче
  FLAME.uGain.value = 0.85 + (Game.darkness || 0) * 0.1;
}
