// Небо и постобработка. Сцена рисуется в HDR-буфер (HalfFloat), потом:
// яркие места → размытие (bloom) → тональная кривая ACES, цветокоррекция, виньетка, зерно.

/* ---------- небо: градиент, солнце, облака, звёзды, луна ---------- */

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = `
uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uMoonDir, uCloudColor;
uniform float uTime, uStars, uCloud, uFlash;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.45)) : mix(uHorizon, uBottom, clamp(-h * 4.0, 0.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.2 + pow(sd, 64.0) * 0.5);
  col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 25.0;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(uv * 1.3);
    c = smoothstep(0.55 - uCloud * 0.25, 0.88, c) * smoothstep(0.0, 0.25, h);
    vec3 cc = uCloudColor * (0.7 + 0.5 * fbm(uv * 2.6 + 3.0)) + uSunColor * pow(sd, 8.0) * 0.5;
    // Вспышка молнии подсвечивает облака изнутри
    cc += vec3(1.6, 1.7, 2.0) * uFlash * (0.4 + 0.6 * fbm(uv * 1.7 + 7.0));
    col = mix(col, cc, c * 0.9);
  }
  col += vec3(0.25, 0.27, 0.34) * uFlash;
  if (uStars > 0.0 && h > 0.0) {
    vec2 sp = vec2(atan(d.z, d.x), asin(h)) * 160.0;
    float r = hash(floor(sp));
    float star = step(0.9965, r) * smoothstep(0.45, 0.0, length(fract(sp) - 0.5));
    star *= 0.6 + 0.4 * sin(uTime * 3.0 + r * 100.0);
    col += vec3(star) * uStars * 2.5 * smoothstep(0.0, 0.2, h);
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.8, 0.85, 1.0) * (smoothstep(0.999, 0.9994, md) * 3.0 + pow(md, 200.0) * 0.3) * uStars;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const Sky = {};

function makeSkyMaterial() {
  const v3 = () => ({ value: new THREE.Vector3() });
  const col = () => ({ value: new THREE.Color() });
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: col(), uHorizon: col(), uBottom: col(), uSunColor: col(), uCloudColor: col(),
      uSunDir: v3(), uMoonDir: v3(), uTime: { value: 0 }, uStars: { value: 0 }, uCloud: { value: 0.4 }, uFlash: { value: 0 },
    },
    vertexShader: SKY_VS,
    fragmentShader: SKY_FS,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

function initSky(renderer, scene) {
  Sky.mat = makeSkyMaterial();
  Sky.mesh = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), Sky.mat);
  Sky.mesh.renderOrder = -10;
  Sky.mesh.frustumCulled = false;
  scene.add(Sky.mesh);
  // Отдельная маленькая копия неба для карты отражений
  Sky.envScene = new THREE.Scene();
  Sky.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), Sky.mat));
  Sky.pmrem = new THREE.PMREMGenerator(renderer);
  Sky.envRT = null;
}

// Пересчитывает карту отражений по текущему небу (раз в несколько секунд)
function updateEnvMap(scene) {
  const old = Sky.envRT;
  Sky.envRT = Sky.pmrem.fromScene(Sky.envScene, 0.02, 0.1, 100);
  scene.environment = Sky.envRT.texture;
  if (old) old.dispose();
}

/* ---------- постобработка ---------- */

const PASS_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FS = `
uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(0.5, -0.5)).rgb
         + texture2D(tDiffuse, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(min(c * smoothstep(uThreshold, uThreshold * 2.0, l), vec3(40.0)), 1.0);
}`;

const BLUR_FS = `
uniform sampler2D tDiffuse; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
  c += texture2D(tDiffuse, vUv + uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tDiffuse, vUv - uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tDiffuse, vUv + uDir * 3.2307692308) * 0.0702702703;
  c += texture2D(tDiffuse, vUv - uDir * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}`;

const COMPOSITE_FS = `
uniform sampler2D tScene, tBloom1, tBloom2, tBright;
uniform float uExposure, uBloom, uTime, uVignette, uGrain, uSaturation, uContrast, uHurt, uAberration, uFade, uRays;
uniform vec3 uLift, uGain;
uniform vec2 uSunUv;
varying vec2 vUv;
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 cc = vUv - 0.5;
  float r2 = dot(cc, cc);
  float ab = uAberration * r2;
  vec3 col = vec3(texture2D(tScene, vUv + cc * ab).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - cc * ab).b);
  col += (texture2D(tBloom1, vUv).rgb + texture2D(tBloom2, vUv).rgb * 0.9) * uBloom;
  // Лучи: собираем яркие места по пути к солнцу — стены и кроны их перекрывают, остаются полосы света
  if (uRays > 0.001) {
    vec2 st = (uSunUv - vUv) / 28.0, ruv = vUv;
    float w = 1.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 28; i++) {
      ruv += st;
      acc += texture2D(tBright, ruv).rgb * w;
      w *= 0.95;
    }
    col += acc * (uRays / 28.0) * exp(-length(vUv - uSunUv) * 1.8);
  }
  col = aces(col * uExposure);
  col = pow(col, vec3(1.0 / 2.2));
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col = col * uGain + uLift;
  col *= 1.0 - uVignette * smoothstep(0.08, 0.55, r2);
  col = mix(col, vec3(0.45, 0.0, 0.0), uHurt * smoothstep(0.05, 0.45, r2));
  col += (rand(vUv * 913.0 + fract(uTime)) - 0.5) * uGrain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * uFade, 1.0);
}`;

const PostFX = {
  bloom: true,
  params: {
    exposure: 1, bloom: 0.6, vignette: 0.45, grain: 0.035, saturation: 1.05, contrast: 1.04,
    hurt: 0, aberration: 0.012, fade: 1, lift: new THREE.Vector3(), gain: new THREE.Vector3(1, 1, 1),
    rays: 0, sunUv: new THREE.Vector2(0.5, 0.5),
  },
};

function initPostFX(renderer, { msaa = 4, bloom = true } = {}) {
  PostFX.renderer = renderer;
  PostFX.bloom = bloom;
  PostFX.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  PostFX.quad = new THREE.Mesh(geo);
  PostFX.quad.frustumCulled = false;
  PostFX.scene = new THREE.Scene();
  PostFX.scene.add(PostFX.quad);
  const rt = opts => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, ...opts });
  PostFX.rtScene = rt({ samples: msaa });
  for (const k of ['rtBright', 'rtA', 'rtB', 'rtC', 'rtD']) PostFX[k] = rt({ depthBuffer: false });
  const sm = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: PASS_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
  PostFX.bright = sm(BRIGHT_FS, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.6 } });
  PostFX.blur = sm(BLUR_FS, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });
  const u = { value: 0 };
  PostFX.composite = sm(COMPOSITE_FS, {
    tScene: { value: null }, tBloom1: { value: null }, tBloom2: { value: null }, tBright: { value: null },
    uExposure: { ...u }, uBloom: { ...u }, uTime: { ...u }, uVignette: { ...u }, uGrain: { ...u },
    uSaturation: { ...u }, uContrast: { ...u }, uHurt: { ...u }, uAberration: { ...u }, uFade: { ...u }, uRays: { ...u },
    uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
  });
}

function resizePostFX(w, h) {
  PostFX.w = w;
  PostFX.h = h;
  PostFX.rtScene.setSize(w, h);
  PostFX.rtBright.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  for (const k of ['rtA', 'rtB']) PostFX[k].setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  for (const k of ['rtC', 'rtD']) PostFX[k].setSize(Math.max(1, w >> 3), Math.max(1, h >> 3));
}

function fxPass(mat, target) {
  PostFX.quad.material = mat;
  PostFX.renderer.setRenderTarget(target);
  PostFX.renderer.render(PostFX.scene, PostFX.cam);
}

function blurInto(src, mid, dst) {
  const b = PostFX.blur.uniforms;
  b.tDiffuse.value = src.texture;
  b.uDir.value.set(1.2 / mid.width, 0);
  fxPass(PostFX.blur, mid);
  b.tDiffuse.value = mid.texture;
  b.uDir.value.set(0, 1.2 / mid.height);
  fxPass(PostFX.blur, dst);
}

function renderPostFX(scene, camera, time) {
  const r = PostFX.renderer;
  r.setRenderTarget(PostFX.rtScene);
  r.render(scene, camera);
  const c = PostFX.composite.uniforms, p = PostFX.params;
  if (PostFX.bloom) {
    const br = PostFX.bright.uniforms;
    br.tDiffuse.value = PostFX.rtScene.texture;
    br.uTexel.value.set(1 / PostFX.w, 1 / PostFX.h);
    fxPass(PostFX.bright, PostFX.rtBright);
    blurInto(PostFX.rtBright, PostFX.rtA, PostFX.rtB);
    blurInto(PostFX.rtB, PostFX.rtC, PostFX.rtD);
  }
  c.tScene.value = PostFX.rtScene.texture;
  c.tBloom1.value = PostFX.rtB.texture;
  c.tBloom2.value = PostFX.rtD.texture;
  c.uExposure.value = p.exposure;
  c.uBloom.value = PostFX.bloom ? p.bloom : 0;
  c.uTime.value = time;
  c.uVignette.value = p.vignette;
  c.uGrain.value = p.grain;
  c.uSaturation.value = p.saturation;
  c.uContrast.value = p.contrast;
  c.uHurt.value = p.hurt;
  c.uAberration.value = p.aberration;
  c.uFade.value = p.fade;
  c.uLift.value.copy(p.lift);
  c.uGain.value.copy(p.gain);
  // Лучам нужна карта ярких мест, а её считает только bloom (на низкой графике лучей нет)
  c.tBright.value = PostFX.rtBright.texture;
  c.uRays.value = PostFX.bloom ? p.rays : 0;
  c.uSunUv.value.copy(p.sunUv);
  fxPass(PostFX.composite, null);
}
