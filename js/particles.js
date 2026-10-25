// Частицы: огонь, искры, дым, пыль, туман, светлячки. Каждая система — один THREE.Points,
// размер частиц задаётся в метрах. Цвета — в линейном пространстве, яркие (> 1) светятся через bloom.

const PARTICLE_VS = `
attribute float size;
attribute vec4 color;
attribute float rot;
uniform float uScale;
uniform float uFogDensity;
varying vec4 vColor;
varying float vRot;
varying float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
  vColor = color;
  vRot = rot;
  float d = -mv.z * uFogDensity;
  vFog = exp(-d * d);
}`;

const PARTICLE_FS = `
uniform sampler2D map;
uniform vec3 uFogColor;
uniform float uAdditive;
varying vec4 vColor;
varying float vRot;
varying float vFog;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = mat2(c, -s, s, c) * p + 0.5;
  vec4 t = texture2D(map, p);
  float a = t.a * vColor.a;
  vec3 col = vColor.rgb * t.rgb;
  if (uAdditive > 0.5) gl_FragColor = vec4(col * a * vFog, 1.0);
  else gl_FragColor = vec4(mix(uFogColor, col, vFog), a);
}`;

class Particles {
  constructor(cap, { additive = false, map = TEX.dot } = {}) {
    this.cap = cap;
    this.n = 0;
    const f = k => new Float32Array(cap * k);
    Object.assign(this, {
      pos: f(3), vel: f(3), life: f(1), max: f(1), s0: f(1), s1: f(1),
      c0: f(4), c1: f(4), grav: f(1), drag: f(1), spin: f(1), rot: f(1),
    });
    this.aSize = f(1);
    this.aCol = f(4);
    this.aRot = f(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.aCol, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('rot', new THREE.BufferAttribute(this.aRot, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: map }, uScale: { value: 500 }, uFogDensity: { value: 0 },
        uFogColor: { value: new THREE.Color() }, uAdditive: { value: additive ? 1 : 0 },
      },
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    this.geo = geo;
  }

  // o: x y z, vx vy vz, life, size, size1, color [r,g,b,a], color1, grav, drag, spin
  emit(o) {
    if (this.n >= this.cap) return;
    const i = this.n++, i3 = i * 3, i4 = i * 4;
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    this.life[i] = this.max[i] = o.life;
    this.s0[i] = o.size;
    this.s1[i] = o.size1 !== undefined ? o.size1 : o.size;
    const c = o.color, c1 = o.color1 || [c[0], c[1], c[2], 0];
    for (let k = 0; k < 4; k++) { this.c0[i4 + k] = c[k]; this.c1[i4 + k] = c1[k]; }
    this.grav[i] = o.grav || 0;
    this.drag[i] = o.drag || 0;
    this.spin[i] = o.spin || 0;
    this.rot[i] = Math.random() * 6.28;
  }

  copy(from, to) {
    const m = (arr, k) => { for (let j = 0; j < k; j++) arr[to * k + j] = arr[from * k + j]; };
    m(this.pos, 3); m(this.vel, 3); m(this.c0, 4); m(this.c1, 4);
    for (const a of [this.life, this.max, this.s0, this.s1, this.grav, this.drag, this.spin, this.rot]) a[to] = a[from];
  }

  update(dt) {
    for (let i = 0; i < this.n;) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.n--;
        if (i !== this.n) this.copy(this.n, i);
        continue;
      }
      const i3 = i * 3, i4 = i * 4, k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3 + 1] -= this.grav[i] * dt;
      for (let j = 0; j < 3; j++) {
        this.vel[i3 + j] *= k;
        this.pos[i3 + j] += this.vel[i3 + j] * dt;
      }
      const t = 1 - this.life[i] / this.max[i];
      this.aSize[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fadeIn = Math.min(1, t * 8);
      for (let j = 0; j < 4; j++) this.aCol[i4 + j] = this.c0[i4 + j] + (this.c1[i4 + j] - this.c0[i4 + j]) * t;
      this.aCol[i4 + 3] *= fadeIn;
      this.rot[i] += this.spin[i] * dt;
      this.aRot[i] = this.rot[i];
      i++;
    }
    for (const name of ['position', 'size', 'color', 'rot']) this.geo.attributes[name].needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
}

const FX = {};

function initParticles(scene) {
  FX.fire = new Particles(2000, { additive: true });
  FX.glow = new Particles(2000, { additive: true });
  FX.smoke = new Particles(1400, { map: TEX.smoke });
  FX.drops = new Particles(800);
  FX.all = [FX.smoke, FX.drops, FX.fire, FX.glow];
  for (const p of FX.all) scene.add(p.points);
}

function updateParticles(dt, camera, renderer, fog) {
  const scale = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  for (const p of FX.all) {
    p.mat.uniforms.uScale.value = scale;
    p.mat.uniforms.uFogDensity.value = fog.density;
    p.mat.uniforms.uFogColor.value.copy(fog.color);
    p.update(dt);
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- готовые эффекты ---------- */

// Пламя костра или факела в точке (x, y, z); power — размер огня
function emitFire(x, y, z, dt, power = 1) {
  const n = Math.random() < dt * 45 * power ? 1 + Math.floor(power) : 0;
  for (let i = 0; i < n; i++) {
    FX.fire.emit({
      x: x + rnd(-0.25, 0.25) * power, y: y + rnd(0, 0.15), z: z + rnd(-0.25, 0.25) * power,
      vx: rnd(-0.15, 0.15), vy: rnd(1.2, 2.2) * (0.6 + power * 0.4), vz: rnd(-0.15, 0.15),
      life: rnd(0.35, 0.75), size: rnd(0.5, 0.8) * power, size1: 0.08,
      color: [6, 2.4, 0.6, 0.9], color1: [3, 0.5, 0.08, 0], drag: 0.8, spin: rnd(-2, 2),
    });
  }
  if (Math.random() < dt * 5 * power) {
    FX.glow.emit({
      x: x + rnd(-0.2, 0.2), y: y + 0.3, z: z + rnd(-0.2, 0.2),
      vx: rnd(-0.6, 0.6), vy: rnd(2, 4), vz: rnd(-0.6, 0.6),
      life: rnd(0.8, 1.8), size: 0.05, size1: 0.02,
      color: [8, 3.5, 1, 1], color1: [4, 0.8, 0.1, 0], drag: 0.6, grav: -0.3,
    });
  }
  if (Math.random() < dt * 6 * power) {
    // Ночью дым почти чёрный (светлее неба он светился бы столбом), у огня подсвечен тёплым
    const nk = Math.min(1, Game.darkness / 0.9), dk = 1 - 0.85 * nk;
    FX.smoke.emit({
      x: x + rnd(-0.2, 0.2), y: y + 0.9 * power, z: z + rnd(-0.2, 0.2),
      vx: rnd(-0.2, 0.2) + 0.25, vy: rnd(0.8, 1.3), vz: rnd(-0.2, 0.2),
      life: rnd(3, 5), size: 0.6 * power, size1: 3.2 * power,
      color: [0.08 * dk + 0.05 * nk, 0.075 * dk + 0.022 * nk, 0.07 * dk + 0.008 * nk, 0.35], color1: [0.12 * dk, 0.12 * dk, 0.12 * dk, 0],
      drag: 0.2, spin: rnd(-0.4, 0.4),
    });
  }
}

// Пламя факела в руке: язык огня ~20 см из множества мелких коротких языков (крупные редкие частицы костра
// у самых глаз выглядели бы отдельными светящимися шарами), редкие искры и тонкая струйка дыма
function emitTorch(x, y, z, dt) {
  const n = Math.floor(dt * 90 + Math.random());
  for (let i = 0; i < n; i++) {
    FX.fire.emit({
      x: x + rnd(-0.022, 0.022), y: y + rnd(-0.01, 0.03), z: z + rnd(-0.022, 0.022),
      vx: rnd(-0.05, 0.05), vy: rnd(0.5, 0.9), vz: rnd(-0.05, 0.05),
      life: rnd(0.22, 0.45), size: rnd(0.06, 0.09), size1: 0.012,
      // Частицы ложатся друг на друга (их ~20 сразу): каждая тусклая, иначе свечение сливается в белый шар
      color: [1.1, 0.42, 0.09, 0.85], color1: [0.8, 0.14, 0.02, 0], drag: 0.9, spin: rnd(-2, 2),
    });
  }
  if (Math.random() < dt * 1.6) {
    FX.glow.emit({
      x, y: y + 0.08, z, vx: rnd(-0.3, 0.3), vy: rnd(0.8, 1.6), vz: rnd(-0.3, 0.3),
      life: rnd(0.5, 1.1), size: 0.018, size1: 0.006,
      color: [8, 3.5, 1, 1], color1: [4, 0.8, 0.1, 0], drag: 0.6, grav: -0.3,
    });
  }
  if (Math.random() < dt * 4) {
    const nk = Math.min(1, Game.darkness / 0.9), dk = 1 - 0.85 * nk;
    FX.smoke.emit({
      x: x + rnd(-0.02, 0.02), y: y + 0.2, z: z + rnd(-0.02, 0.02),
      vx: rnd(-0.05, 0.05) + 0.06, vy: rnd(0.4, 0.7), vz: rnd(-0.05, 0.05),
      life: rnd(1.4, 2.4), size: 0.07, size1: 0.55,
      color: [0.07 * dk + 0.04 * nk, 0.065 * dk + 0.02 * nk, 0.06 * dk + 0.008 * nk, 0.22], color1: [0.1 * dk, 0.1 * dk, 0.1 * dk, 0],
      drag: 0.3, spin: rnd(-0.4, 0.4),
    });
  }
}

// Облако пыли (сдвиг стен, ворота)
function emitDust(x, y, z, spread, count, color = [0.32, 0.28, 0.22]) {
  const dk = 1 - 0.8 * Math.min(1, Game.darkness / 0.9);    // в темноте пыль не светится
  color = color.map(c => c * dk);
  for (let i = 0; i < count; i++) {
    FX.smoke.emit({
      x: x + rnd(-spread, spread), y: y + rnd(0, 1.5), z: z + rnd(-spread, spread),
      vx: rnd(-1.2, 1.2), vy: rnd(0.3, 1.6), vz: rnd(-1.2, 1.2),
      life: rnd(2.5, 5), size: rnd(1.2, 2.2), size1: rnd(4, 7),
      color: [...color, 0.5], color1: [...color, 0], drag: 0.6, spin: rnd(-0.3, 0.3),
    });
  }
}

// Осколки камня, падающие сверху
function emitDebris(x, y, z, spread, count) {
  for (let i = 0; i < count; i++) {
    FX.drops.emit({
      x: x + rnd(-spread, spread), y, z: z + rnd(-spread, spread),
      vx: rnd(-0.5, 0.5), vy: rnd(-1, 0), vz: rnd(-0.5, 0.5),
      life: rnd(1.2, 2.2), size: rnd(0.06, 0.14), color: [0.1, 0.09, 0.08, 1], color1: [0.1, 0.09, 0.08, 1], grav: 9,
    });
  }
}

function emitSparkles(x, y, z, count, color = [6, 4, 1.2]) {
  for (let i = 0; i < count; i++) {
    FX.glow.emit({
      x, y, z, vx: rnd(-2, 2), vy: rnd(-0.5, 3), vz: rnd(-2, 2),
      life: rnd(0.6, 1.4), size: rnd(0.05, 0.12), size1: 0.01,
      color: [...color, 1], color1: [color[0] * 0.5, color[1] * 0.3, color[2] * 0.2, 0], drag: 2, grav: 1.5,
    });
  }
}
