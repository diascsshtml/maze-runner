// 3D-мир: рендерер, свет и время суток, существа, атмосферные эффекты, камера от первого лица.
// Координаты логики — тайлы; в 3D тайл (x, y) стоит в точке (x·S, 0, y·S).

// Что закладывается при запуске (сколько травы и плюща, предел чёткости). «Авто», высокое и среднее строят
// полный мир, а дальше всё решают ступени ниже; низкое — облегчённый мир для телефонов и слабых машин
const QUALITY = {
  auto: { pr: 1.5, msaa: 4, shadow: 4096, density: 1, bloom: true, flashShadow: true },
  high: { pr: 1.5, msaa: 4, shadow: 4096, density: 1, bloom: true, flashShadow: true },
  medium: { pr: 1.5, msaa: 4, shadow: 4096, density: 1, bloom: true, flashShadow: true },
  low: { pr: 1.0, msaa: 0, shadow: 1024, density: 0.3, bloom: false, flashShadow: false },
};
// Ступени качества меняются на ходу, без перезапуска: чёткость, сглаживание, тени (размер карты и как часто
// её перерисовывать), трава, на каком расстоянии видно жителей, свечение
const TIERS = [
  { scale: 1, msaa: 4, shadow: 4096, shadowEvery: 1, grass: 1, npc: 140, bloom: true },
  { scale: 0.9, msaa: 4, shadow: 2048, shadowEvery: 1, grass: 0.85, npc: 120, bloom: true },
  { scale: 0.8, msaa: 2, shadow: 2048, shadowEvery: 2, grass: 0.7, npc: 100, bloom: true },
  { scale: 0.7, msaa: 0, shadow: 1024, shadowEvery: 2, grass: 0.5, npc: 80, bloom: true },
  { scale: 0.6, msaa: 0, shadow: 1024, shadowEvery: 3, grass: 0.35, npc: 65, bloom: false },
  { scale: 0.5, msaa: 0, shadow: 1024, shadowEvery: 4, grass: 0.25, npc: 50, bloom: false },
];
const QUALITY_TIER = { high: 0, medium: 2, low: 4 };

const World = {
  items: new Map(), grievers: new Map(), npcs: new Map(),
  exitBeacon: null, fov: 72, scale: 1, frameTimes: [], envT: 0, envDark: -1, quality: 'auto',
  mazeK: 0, gust: 0, morning: 0, tier: 0, shadowEvery: 1, shadowTick: 0, npcDist: 140,
};

// Туман у земли: стелется по Глэйду и коридорам, в низинах гуще, к верху стен редеет.
// Встраивается в общий туман three.js, поэтому действует на все материалы сразу.
// x — плотность у земли, y — высота земли относительно камеры (обновляется каждый кадр),
// z — спад на метр высоты, w — как быстро набирается с расстоянием
const HEIGHT_FOG = new THREE.Vector4(0, 0, 0.25, 0.01);
HEIGHT_FOG.clone = function () { return this; };     // каждый материал получает ссылку на этот же объект
(function patchFogChunks() {
  const SC = THREE.ShaderChunk;
  const rep = (src, a, b) => (src.includes(a) ? src.replace(a, b) : null);
  // Высота точки над камерой: viewMatrix[1] — вертикаль мира в осях камеры
  // (так не нужна позиция камеры в шейдере: three передаёт её не всем материалам)
  const pv = rep(SC.fog_pars_vertex, 'varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogRelY;');
  const v = rep(SC.fog_vertex, 'vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvFogRelY = dot( viewMatrix[ 1 ].xyz, mvPosition.xyz );');
  const pf = rep(SC.fog_pars_fragment, 'varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogRelY;\n\tuniform vec4 uHeightFog;');
  const f = rep(SC.fog_fragment, 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );',
    `float hFog = uHeightFog.x * exp( - max( vFogRelY - uHeightFog.y, 0.0 ) * uHeightFog.z ) * ( 1.0 - exp( - vFogDepth * uHeightFog.w ) );
	fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - clamp( hFog, 0.0, 0.97 ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );`);
  if (!pv || !v || !pf || !f) return;                // другая версия three — обычный туман
  Object.assign(SC, { fog_pars_vertex: pv, fog_vertex: v, fog_pars_fragment: pf, fog_fragment: f });
  for (const k in THREE.ShaderLib) {
    const u = THREE.ShaderLib[k].uniforms;
    if (u && u.fogColor) u.uHeightFog = { value: HEIGHT_FOG };
  }
})();

// Порывы ветра: медленная смесь синусов. Общие для травы, листвы, пыли и звука ветра
function windGust(t) {
  const raw = 0.5 + 0.28 * Math.sin(t * 0.19) + 0.2 * Math.sin(t * 0.47 + 1.3) + 0.12 * Math.sin(t * 1.13 + 0.4);
  const g = Math.min(1, Math.max(0, (raw - 0.3) / 0.6));
  return g * g * (3 - 2 * g);
}

function loadQuality() {
  let q = null;
  try { q = localStorage.getItem('maze-runner-quality'); } catch (e) { /* без сохранения */ }
  if (!QUALITY[q]) q = matchMedia('(pointer: coarse)').matches ? 'low' : 'auto';
  return q;
}

function initWorld() {
  World.quality = loadQuality();
  const Q = QUALITY[World.quality];
  World.mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: false, powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.LinearEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9fb6cc, 0.004);
  const camera = new THREE.PerspectiveCamera(World.fov, 1, 0.05, 1500);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  Object.assign(World, { renderer, scene, camera, Q });

  initTextures();
  initMaterials();
  initSky(renderer, scene);
  initPostFX(renderer, { msaa: Q.msaa, bloom: Q.bloom });
  initParticles(scene);

  World.sun = new THREE.DirectionalLight(0xffffff, 3);
  World.sun.castShadow = true;
  World.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(World.sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 });
  World.sun.shadow.bias = -0.0004;
  World.sun.shadow.normalBias = 0.03;
  World.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4030, 0.3);
  scene.add(World.sun, World.sun.target, World.hemi);

  World.flash = new THREE.SpotLight(0xfff0d0, 0, 45, 0.5, 0.6, 1.3);
  World.flash.position.set(0.25, -0.2, 0);
  World.flash.target.position.set(0, -0.05, -1);
  World.flash.castShadow = Q.flashShadow;
  World.flash.shadow.mapSize.set(1024, 1024);
  World.flash.shadow.bias = -0.0005;
  camera.add(World.flash, World.flash.target);

  // Огни фиксированные: число источников не меняется, шейдеры не пересобираются
  const pl = (color, dist, x, y, z) => { const l = new THREE.PointLight(color, 0, dist, 2); l.position.set(x, y, z); scene.add(l); return l; };
  const cfx = tw(LAYOUT.campfire.x), cfz = tw(LAYOUT.campfire.y);
  World.fireLight = pl(0xff8a3a, 28, cfx, groundH(cfx, cfz) + 1.6, cfz);
  World.kitchenLight = pl(0xff9040, 12, 0, -20, 0);
  World.forgeLight = pl(0xff7a30, 12, 0, -20, 0);
  World.gateLights = GATES.map(g => pl(0xffa050, 16, tw(g.x + Math.sign(MID - g.x) * 1.2), 3.5, tw(g.y + Math.sign(MID - g.y) * 1.2)));
  World.exitLight = pl(0x8ff0dc, 30, 0, 3, 0);
  World.eventLight = pl(0xff6a2a, 32, 0, -20, 0);     // пожар в Глэйде (обычно выключен)
  // Факел в руке: тёплый свет рядом с камерой (выключен, пока факела нет)
  World.handLight = new THREE.PointLight(0xffa050, 0, 18, 2);
  World.handLight.position.set(0.35, -0.2, -0.5);
  camera.add(World.handLight);

  initWalls(scene, Q.density);
  makeProcModels();
  buildGlade(World.quality);
  initLift();
  initWeather(scene);
  initFauna(scene);
  for (const [l, id] of [[World.kitchenLight, 'dining'], [World.forgeLight, 'forge']]) {
    const L = HOUSE_INFO[id] && HOUSE_INFO[id].light;
    if (L) l.position.set(L.x, L.y, L.z);
  }
  initFirstPerson();
  initPlayerBody();

  const resize = () => {
    const pr = Math.min(window.devicePixelRatio || 1, Q.pr) * World.scale;
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    resizePostFX(size.x, size.y);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  World.resize = resize;
  resize();
  window.addEventListener('resize', resize);
  // Неподвижные детали построек — одним куском на материал (см. batch.js)
  World.batched = batchStatic();
  applyTier(World.quality === 'auto' ? 1 : QUALITY_TIER[World.quality] ?? 0);
}

// Ступень качества — сразу, без перезапуска
function applyTier(i) {
  i = Math.max(0, Math.min(TIERS.length - 1, i));
  const T = TIERS[i];
  World.tier = i;
  World.shadowEvery = T.shadowEvery;
  World.npcDist = T.npc;
  if (World.Q.msaa) setPostMSAA(T.msaa);
  PostFX.bloom = World.Q.bloom && T.bloom;
  const sh = World.sun.shadow, size = Math.min(T.shadow, World.Q.shadow);
  if (sh.mapSize.x !== size) {
    sh.mapSize.set(size, size);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
  }
  for (const g of GLADE3D.grassSets || []) g.im.count = Math.round(g.full * T.grass);
  if (World.scale !== T.scale) { World.scale = T.scale; World.resize(); }
}

// Выбор в настройках: «Авто» подстраивается само, остальное — постоянная ступень
function setQuality(q) {
  World.quality = q;
  Auto.cool = 2;
  Auto.floor = 0;
  applyTier(q === 'auto' ? World.tier : QUALITY_TIER[q] ?? 0);
}

// «Авто»: смотрим на настоящую частоту кадров. Меньше 50 — ступень вниз; стабильно больше 80 — осторожно вверх.
// Если после подъёма снова тормозит — какое-то время выше не лезем, чтобы качество не прыгало туда-сюда
const Auto = { acc: 0, n: 0, cool: 3, up: 0, floor: 0, floorT: 0, lastUp: -99, t: 0 };
function adaptResolution(dt) {
  Auto.t += dt;
  Auto.floorT -= dt;
  if (Auto.floorT <= 0) Auto.floor = 0;
  if (World.quality !== 'auto') return;
  Auto.cool -= dt;
  if (Auto.cool > 0) { Auto.acc = Auto.n = 0; return; }        // загрузка, сборка шейдеров — не считаем
  Auto.acc += dt;
  Auto.n++;
  if (Auto.acc < 1.5) return;
  const fps = Auto.n / Auto.acc;
  Auto.acc = Auto.n = 0;
  if (fps < 50 && World.tier < TIERS.length - 1) {
    if (Auto.t - Auto.lastUp < 10) { Auto.floor = World.tier + 1; Auto.floorT = 90; }
    applyTier(World.tier + 1);
    Auto.cool = 2;
    Auto.up = 0;
  } else if (fps > 80 && World.tier > Auto.floor) {
    Auto.up += 1.5;
    if (Auto.up >= 6) { applyTier(World.tier - 1); Auto.cool = 3; Auto.up = 0; Auto.lastUp = Auto.t; }
  } else Auto.up = 0;
}

/* ---------- существа и предметы ---------- */

function syncItems(t) {
  for (const it of Game.items) {
    let m = World.items.get(it);
    if (!m && !it.taken) {
      m = makeItemModel(it.word);
      m.group.position.set(tw(it.x), 0, tw(it.y));
      World.scene.add(m.group);
      World.items.set(it, m);
    }
    if (!m) continue;
    if (it.taken) {
      World.scene.remove(m.group);
      World.items.delete(it);
      continue;
    }
    if (!m.fixed) {
      m.spin.rotation.y = t * 1.2 + it.x;
      m.spin.position.y = 1.4 + Math.sin(t * 2.2 + it.y) * 0.12;
    }
    if (Math.random() < 0.06) FX.glow.emit({ x: tw(it.x) + rnd(-0.5, 0.5), y: 0.3, z: tw(it.y) + rnd(-0.5, 0.5), vy: rnd(0.4, 0.9), life: 2, size: 0.05, color: [4, 2.6, 0.8, 1], color1: [2, 1, 0.2, 0] });
  }
}

function syncGrievers(t, dt, night) {
  const alive = new Set(Game.grievers);
  for (const [g, m] of World.grievers) {
    if (!alive.has(g)) { World.scene.remove(m.root); World.grievers.delete(g); }
  }
  const p = Game.player;
  for (const g of Game.grievers) {
    let m = World.grievers.get(g);
    if (!m) {
      m = makeGrieverModel();
      World.scene.add(m.root);
      World.grievers.set(g, m);
    }
    // Выбираются из-под земли и уходят обратно на рассвете
    const x = tw(g.x), z = tw(g.y);
    m.root.position.set(x, -(1 - g.fade) * 4.5, z);
    m.root.rotation.y = -g.face;
    const moving = !!(g.dx || g.dy) && g.stun <= 0;
    g.strikeT = Math.max(0, (g.strikeT || 0) - dt);
    animateGriever(m, g.t, moving, g.hunting, g.fade, night, dt, g.strikeT > 0);
    if (Math.hypot(g.x - p.x, g.y - p.y) < 14) {
      if (Math.random() < dt * 2) FX.drops.emit({ x: x + rnd(-0.8, 0.8), y: 1.0, z: z + rnd(-0.5, 0.5), vy: -0.5, life: 0.9, size: 0.07, color: [0.03, 0.05, 0.02, 0.9], color1: [0.03, 0.05, 0.02, 0.9], grav: 9 });
      if (g.hunting && Math.random() < dt * 5) {
        const bx = x - Math.cos(g.face) * 1.6, bz = z - Math.sin(g.face) * 1.6;
        const sk = 0.5 * (1 - 0.8 * night);
        FX.smoke.emit({ x: bx, y: 2.1, z: bz, vx: rnd(-0.3, 0.3), vy: rnd(1, 1.8), vz: rnd(-0.3, 0.3), life: 1.4, size: 0.3, size1: 1.6, color: [sk, sk * 1.04, sk * 1.1, 0.25], color1: [sk, sk * 1.04, sk * 1.1, 0], drag: 1 });
      }
    }
  }
}

function syncExit() {
  if (Game.exitOpen && !World.exitBeacon) {
    World.exitBeacon = makeExitBeacon();
    World.exitBeacon.position.set(tw(Maze.exit.x), 0, tw(Maze.exit.y));
    World.scene.add(World.exitBeacon);
    World.exitLight.position.set(tw(Maze.exit.x), 3, tw(Maze.exit.y));
  } else if (!Game.exitOpen && World.exitBeacon) {
    World.scene.remove(World.exitBeacon);
    World.exitBeacon = null;
  }
  World.exitLight.intensity = Game.exitOpen ? 8 : 0;
  if (Game.exitOpen && Math.random() < 0.5) {
    FX.glow.emit({ x: tw(Maze.exit.x) + rnd(-1.2, 1.2), y: rnd(0, 2), z: tw(Maze.exit.y) + rnd(-1.2, 1.2), vy: rnd(1.5, 4), life: rnd(2, 4), size: rnd(0.05, 0.12), color: [1, 5, 4.2, 1], color1: [0.4, 2, 1.8, 0] });
  }
}

function resetWorld() {
  for (const m of World.items.values()) World.scene.remove(m.group);
  for (const m of World.grievers.values()) World.scene.remove(m.root);
  clearNpcModels();
  World.items.clear();
  World.grievers.clear();
  if (World.exitBeacon) World.scene.remove(World.exitBeacon);
  World.exitBeacon = null;
  resetWalls();
}

/* ---------- время суток ---------- */

const C = (r, g, b) => new THREE.Vector3(r, g, b);
const SKYC = {
  dayTop: C(0.09, 0.24, 0.62), dayHor: C(0.55, 0.68, 0.85), duskTop: C(0.1, 0.12, 0.3), duskHor: C(1.5, 0.58, 0.22),
  nightTop: C(0.002, 0.003, 0.008), nightHor: C(0.008, 0.011, 0.02),
  sunDay: C(3.2, 3.0, 2.7), sunDusk: C(3.2, 1.3, 0.4),
  cloudDay: C(1.3, 1.3, 1.35), cloudDusk: C(0.9, 0.42, 0.28), cloudNight: C(0.012, 0.014, 0.02),
};
// Цвета тумана и ночного неба: утренняя дымка, лунная ночь
const FOGC = { morning: C(0.62, 0.66, 0.7), night: C(0.016, 0.02, 0.034), moon: new THREE.Color(0.3, 0.36, 0.55) };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _sunDir = new THREE.Vector3(), _moonDir = new THREE.Vector3(0.3, 0.75, -0.45).normalize();
const mix3 = (out, a, b, t) => out.copy(a).lerp(b, t);

function updateTimeOfDay(dt) {
  const dn = Math.min(1, Game.darkness / 0.9), dusk = Game.dusk;
  const menu = Game.state === 'title' || Game.state === 'exit';
  const prog = menu ? 0.86 : Game.phase === 'day' ? 1 - Game.timeLeft / Game.dayLen : 1;
  const elev = THREE.MathUtils.degToRad(4 + Math.sin(prog * Math.PI) * 58);
  const az = -Math.PI / 2 + prog * Math.PI * 0.95 + 0.3;
  _sunDir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev));

  const u = Sky.mat.uniforms;
  mix3(_a, SKYC.dayTop, SKYC.duskTop, dusk); _a.lerp(SKYC.nightTop, dn); u.uTop.value.setRGB(_a.x, _a.y, _a.z);
  mix3(_b, SKYC.dayHor, SKYC.duskHor, dusk); _b.lerp(SKYC.nightHor, dn); u.uHorizon.value.setRGB(_b.x, _b.y, _b.z);
  u.uBottom.value.setRGB(_b.x * 0.35, _b.y * 0.33, _b.z * 0.3);
  mix3(_a, SKYC.sunDay, SKYC.sunDusk, dusk).multiplyScalar(1 - dn); u.uSunColor.value.setRGB(_a.x, _a.y, _a.z);
  mix3(_a, SKYC.cloudDay, SKYC.cloudDusk, dusk); _a.lerp(SKYC.cloudNight, dn); u.uCloudColor.value.setRGB(_a.x, _a.y, _a.z);
  u.uSunDir.value.copy(_sunDir);
  u.uMoonDir.value.copy(_moonDir);
  u.uStars.value = dn * (1 - Weather.cur.cloud * 0.7);
  u.uTime.value = Game.time;
  u.uCloud.value = Weather.cur.cloud;
  u.uFlash.value = Weather.flash;

  // Солнце днём, луна ночью
  const night = dn > 0.5;
  const dir = night ? _moonDir : _sunDir;
  const p = Game.player, cx = tw(p.x), cz = tw(p.y);
  const snap = 120 / World.Q.shadow;   // привязка к текселю тени, чтобы тени не дрожали
  const tx = Math.round(cx / snap) * snap, tz = Math.round(cz / snap) * snap;
  World.sun.position.set(tx + dir.x * 150, dir.y * 150, tz + dir.z * 150);
  World.sun.target.position.set(tx, 0, tz);
  if (night) {
    World.sun.color.setRGB(0.55, 0.65, 1);
    World.sun.intensity = 0.38 * dn;
  } else {
    const warm = Math.max(dusk, 1 - Math.min(1, elev / 0.35));
    World.sun.color.setRGB(1, 0.93 - warm * 0.35, 0.85 - warm * 0.55);
    World.sun.intensity = (3.2 - warm * 1.3) * (1 - dn) * (1 - 0.55 * Math.max(0, Weather.cur.cloud - 0.3));   // в пасмурный день солнце тусклее
  }
  // Рассеянный свет неба; ночью — слабый синеватый от луны, чтобы читались силуэты
  World.hemi.color.setRGB(_b.x, _b.y, _b.z).multiplyScalar(0.6).lerp(FOGC.moon, dn);
  World.hemi.intensity = 0.42 * (1 - dn) + 0.06 + Weather.flash * 1.6;     // молния освещает всё на миг

  // Утро: первые полминуты дня и последние секунды ночи — над травой стелется молочная дымка
  const since = Game.dayLen - Game.timeLeft + (Game.day === 1 ? World.mistLead || 0 : 0);   // mistLead — облёт после Ящика
  const morning = menu ? 0 : Game.phase === 'day' ? Math.max(0, 1 - since / 30) : Math.max(0, (8 - Game.timeLeft) / 8);
  const inMaze = Game.state === 'play' && Maze.at(Math.round(p.x), Math.round(p.y)) !== T.GLADE ? 1 : 0;
  World.mazeK += (inMaze - World.mazeK) * Math.min(1, dt * 0.7);
  World.morning = morning;
  const mz = World.mazeK, mist = morning * (1 - dn);
  // Туман: днём лёгкая дымка цвета горизонта, ночью тёмно-синий, в коридорах гуще
  _a.set(_b.x, _b.y, _b.z).multiplyScalar(0.9).lerp(FOGC.morning, mist * 0.5).lerp(FOGC.night, dn);
  World.scene.fog.color.setRGB(_a.x, _a.y, _a.z);
  // Погода: в туман и дождь видно хуже
  World.scene.fog.density = (0.0032 + mz * 0.0016 + dusk * 0.0015 + mist * 0.0035 + dn * (0.016 + mz * 0.004)) * Weather.cur.fog;
  // Полёт ПОРОКа: чем выше, тем прозрачнее воздух — сверху виден весь Лабиринт
  if (Admin.fly && !menu) World.scene.fog.density *= 1 - Math.min(0.7, Math.max(0, (p.h - 12) / 50));
  HEIGHT_FOG.x = Math.min(0.95, (0.16 + mist * 0.55 + dusk * 0.12 + dn * (0.3 + mz * 0.2)) * (0.75 + 0.25 * Weather.cur.fog));
  HEIGHT_FOG.z = 0.22 + mist * 0.06;
  HEIGHT_FOG.w = 0.008 + mist * 0.03 + dn * 0.02 + mz * 0.008;

  const P = PostFX.params;
  P.exposure = 0.95 + dusk * 0.1 + dn * 0.7 + Weather.flash * 0.6;
  P.saturation = (1.06 - dn * 0.32) * (1 - mist * 0.12);
  P.vignette = 0.38 + dn * 0.25;
  P.bloom = 0.55 + dn * 0.45;
  P.grain = 0.028 + dn * 0.03;
  P.gain.set(1.02 + dusk * 0.06 - dn * 0.14, 1.0 - dusk * 0.02 - dn * 0.05, 0.97 - dusk * 0.1 + dn * 0.16);
  P.lift.set(mist * 0.012, 0.004 * dn + mist * 0.012, 0.012 * dn + mist * 0.016);

  // Свет вокруг игрока: с факелом — тёплый и яркий, без него — тусклый (глаза привыкли к темноте)
  // Фонарь светит ровнее и дальше факела
  const light = heldLight(), darkK = dn > 0.3 ? Math.min(1, (dn - 0.3) / 0.5) : 0;
  World.flash.intensity = (light ? 0.25 : 1.3) * darkK;
  const flick = 0.85 + Math.sin(Game.time * 13) * 0.1 + Math.sin(Game.time * 7.3) * 0.06;
  World.handLight.intensity = light ? (0.5 + dn * 3.4) * (light > 1 ? 1.5 : flick) : 0;
  World.handLight.distance = light > 1 ? 26 : 18;
  World.fireLight.intensity = (0.6 + dn * 3.2) * flick;
  World.kitchenLight.intensity = (0.6 + dn * 1.8) * flick * (isBuilt('dining') ? 1 : 0);
  World.forgeLight.intensity = (0.8 + dn * 1.6) * (0.8 + Math.sin(Game.time * 9) * 0.15) * (isBuilt('forge') ? 1 : 0);
  for (const l of World.gateLights) l.intensity = dn * 2.2 * flick;

  // Карта отражений — раз в несколько секунд или при заметной смене света
  World.envT -= dt;
  if (World.envT <= 0 || Math.abs(dn - World.envDark) > 0.08) {
    updateEnvMap(World.scene);
    World.envT = 5;
    World.envDark = dn;
  }
}

/* ---------- атмосфера ---------- */

function ambientEffects(dt) {
  const p = Game.player, x = tw(p.x), z = tw(p.y), dn = Math.min(1, Game.darkness / 0.9);
  const inGlade = Maze.at(Math.round(p.x), Math.round(p.y)) === T.GLADE;
  // Ночной туман в коридорах
  if (dn > 0.4 && Math.random() < dt * 14) {
    FX.smoke.emit({ x: x + rnd(-18, 18), y: rnd(0.2, 1.2), z: z + rnd(-18, 18), vx: rnd(-0.3, 0.3), vz: rnd(-0.3, 0.3), life: rnd(6, 10), size: rnd(3, 5), size1: rnd(6, 9), color: [0.035, 0.04, 0.055, 0.22 * dn], color1: [0.035, 0.04, 0.055, 0], spin: rnd(-0.1, 0.1) });
  }
  // Светлячки над травой Глэйда
  if (dn > 0.5 && Math.random() < dt * 10) {
    const gx = tw(GLADE_T0 + Math.random() * (GLADE_T1 - GLADE_T0)), gz = tw(GLADE_T0 + Math.random() * (GLADE_T1 - GLADE_T0));
    if (Math.hypot(gx - x, gz - z) < 60) FX.glow.emit({ x: gx, y: rnd(0.4, 2.2), z: gz, vx: rnd(-0.4, 0.4), vy: rnd(-0.1, 0.2), vz: rnd(-0.4, 0.4), life: rnd(3, 6), size: 0.07, size1: 0.05, color: [2.5, 3.5, 0.6, 1], color1: [1.5, 2.5, 0.3, 0] });
  }
  // Ветер дует с запада-северо-запада; сила — общий порыв (тот же, что в звуке и в траве)
  const gust = World.gust, wx = 0.86, wz = 0.51;
  // Днём в воздухе висит пыль, видная в солнечных лучах; порывы её уносят
  if (dn < 0.3 && Math.random() < dt * 12) {
    FX.glow.emit({ x: x + rnd(-6, 6), y: rnd(0.3, 4), z: z + rnd(-6, 6), vx: rnd(-0.08, 0.08) + wx * gust * 0.8, vy: rnd(-0.02, 0.05), vz: rnd(-0.08, 0.08) + wz * gust * 0.8, life: rnd(4, 7), size: 0.022, color: [0.5, 0.45, 0.35, 0.6], color1: [0.5, 0.45, 0.35, 0] });
  }
  // Сильный порыв срывает листья и несёт их через Глэйд
  if (inGlade && gust > 0.5 && Math.random() < dt * 30 * (gust - 0.5)) {
    FX.drops.emit({ x: x - wx * 12 + rnd(-8, 8), y: rnd(1, 5), z: z - wz * 12 + rnd(-8, 8), vx: wx * rnd(2.5, 5) * gust, vy: rnd(-0.3, 0.5), vz: wz * rnd(2.5, 5) * gust, life: rnd(3, 5), size: rnd(0.035, 0.06), color: [0.09, 0.08, 0.025, 1], color1: [0.06, 0.05, 0.02, 1], grav: 0.5, spin: rnd(-4, 4) });
  }
  // Утром над травой ползёт молочная дымка
  if (World.morning > 0.25 && dn < 0.5 && Math.random() < dt * 10 * World.morning) {
    FX.smoke.emit({ x: x + rnd(-25, 25), y: rnd(0.2, 1.0), z: z + rnd(-25, 25), vx: wx * 0.3, vz: wz * 0.3, life: rnd(7, 11), size: rnd(3, 5), size1: rnd(6, 9), color: [0.55, 0.58, 0.62, 0.07 * World.morning], color1: [0.55, 0.58, 0.62, 0], spin: rnd(-0.08, 0.08) });
  }
  return inGlade;
}

/* ---------- камера ---------- */

function updateCamera(dt) {
  const cam = World.camera, p = Game.player;
  if (Game.state === 'photo') {
    cam.position.set(Photo.x, Photo.y, Photo.z);
    cam.rotation.set(Photo.pitch, -Photo.yaw - Math.PI / 2, 0);
    return;
  }
  if (Game.state === 'title' || Game.state === 'exit') {
    menuCamera(cam, dt);
    return;
  }
  if (Lift.active) { liftCamera(cam); return; }
  const sh = Game.shake * 0.07, st = Game.time, bobK = Settings.headBob ? 1 : 0;
  const bob = p.moving ? Math.sin(p.walk * S * (p.sprinting ? 1.7 : 2.1)) * (p.sprinting ? 0.075 : 0.045) * bobK : 0;
  const sway = p.moving ? Math.cos(p.walk * S * (p.sprinting ? 0.85 : 1.05)) * (p.sprinting ? 0.05 : 0.025) * bobK : 0;
  // Пробуждение в Ящике: лежит, потом встаёт
  const wake = Game.intro > 0 ? Math.min(1, Game.intro / 3) : 0;
  const h = p.h + (Game.sleeping ? 0.6 : 1.68) - wake * 1.35 - (p.wet ? 0.1 : 0);
  cam.position.set(
    tw(p.x) + Math.sin(p.yaw) * sway + shakeWave(st, 0) * sh,
    h + (p.climb ? 0 : bob) + shakeWave(st, 1) * sh,
    tw(p.y) - Math.cos(p.yaw) * sway + shakeWave(st, 2) * sh,
  );
  cam.rotation.set(p.pitch + wake * 1.25, -p.yaw - Math.PI / 2, sway * 0.4 + wake * 0.5);
  const fov = Settings.fov + (p.sprinting ? 10 : 0);
  if (Math.abs(World.fov - fov) > 0.05) {
    World.fov += (fov - World.fov) * Math.min(1, dt * 5);
    cam.fov = World.fov;
    cam.updateProjectionMatrix();
  }
}

/* ---------- камера главного меню: неспешные планы Глэйда и Лабиринта на закате ---------- */

// Точки в тайлах (x, z) и метрах над землёй (h); abs — высота от нуля, а не от земли.
// Сдвиги от Ящика растут вместе с Глэйдом (MF); Башню снимаем от её собственного места
const MF = GLADE_LAYOUT_SCALE, MT = LAYOUT.tower;
const MENU_SHOTS = [
  { title: 'Глэйд · закат', text: 'Ворота скоро закроются', len: 17,
    p0: [MID + 2.0 * MF, 1.8, MID - 2.05 * MF], p1: [MID + 0.8 * MF, 2.15, MID - 2.6 * MF], l0: [MID - 6.6 * MF, 2.0, MID - 3.0 * MF], l1: [MID - 6.6 * MF, 2.0, MID - 3.9 * MF] },
  { title: 'Северные ворота', text: 'Каждую ночь они смыкаются', len: 15,
    p0: [MID + 0.7, 1.7, GLADE_LO * 2 + 3.1], p1: [MID - 0.4, 8.5, GLADE_LO * 2 + 2.5], l0: [MID, 6, GLADE_LO * 2 - 1], l1: [MID, 15, GLADE_LO * 2 - 1.5] },
  { title: 'Лабиринт', text: 'Стены сдвигаются по ночам', len: 16, abs: true,
    p0: [MID + 21 * MF, 50 * Math.sqrt(MF), MID - 10 * MF], p1: [MID + 18 * MF, 46 * Math.sqrt(MF), MID + 4 * MF], l0: [MID + 3 * MF, 0, MID - 2 * MF], l1: [MID + 2 * MF, 0, MID + 2 * MF] },
  { title: 'Башня', text: 'Отсюда видно весь Глэйд', len: 14,
    p0: [MT.x + 2.7, 1.6, MT.y + 2.5], p1: [MT.x + 1.9, 2.6, MT.y + 2.9], l0: [MT.x, 8, MT.y], l1: [MT.x, 13, MT.y] },
];
const MenuCam = { i: 0, t: 0, fade: 0, shown: -1 };
const _mp = new THREE.Vector3(), _ml = new THREE.Vector3();

function menuCamera(cam, dt) {
  let s = MENU_SHOTS[MenuCam.i];
  if (!s) { MenuCam.i = 0; s = MENU_SHOTS[0]; }
  MenuCam.t += dt;
  if (MenuCam.t >= s.len) { MenuCam.t = 0; MenuCam.i = (MenuCam.i + 1) % MENU_SHOTS.length; s = MENU_SHOTS[MenuCam.i]; }
  const k = MenuCam.t / s.len, e = k * k * (3 - 2 * k);
  const at = (a, b, out) => {
    const x = tw(a[0] + (b[0] - a[0]) * e), z = tw(a[2] + (b[2] - a[2]) * e), h = a[1] + (b[1] - a[1]) * e;
    return out.set(x, s.abs ? h : groundH(x, z) + h, z);
  };
  cam.position.copy(at(s.p0, s.p1, _mp));
  cam.lookAt(at(s.l0, s.l1, _ml));
  // Затемнение на стыке планов
  MenuCam.fade = Math.min(1, MenuCam.t / 1.2, (s.len - MenuCam.t) / 1.2);
  if (MenuCam.shown !== MenuCam.i) {
    MenuCam.shown = MenuCam.i;
    const t = document.getElementById('caption-title'), x = document.getElementById('caption-text');
    if (t) { t.textContent = s.title; x.textContent = s.text; }
  }
}

// Экранные координаты точки над тайлом (для облачков с репликами)
const _v = new THREE.Vector3();
function screenPos(tx, ty, h) {
  _v.set(tw(tx), h, tw(ty)).project(World.camera);
  if (_v.z > 1) return null;
  return { x: (_v.x + 1) / 2 * window.innerWidth, y: (1 - _v.y) / 2 * window.innerHeight };
}

// Солнечные лучи между стенами и сквозь кроны: где на экране солнце и насколько видны лучи
const _sunScr = new THREE.Vector3(), _camFwd = new THREE.Vector3();
function updateSunRays(dn) {
  const P = PostFX.params, cam = World.camera;
  cam.getWorldDirection(_camFwd);
  _sunScr.copy(_sunDir).multiplyScalar(500).add(cam.position).project(cam);
  const k = _camFwd.dot(_sunDir) > 0.05 ? Math.max(0, 1 - Math.hypot(_sunScr.x, _sunScr.y) / 1.7) : 0;
  P.sunUv.set(_sunScr.x * 0.5 + 0.5, _sunScr.y * 0.5 + 0.5);
  P.rays = k * (1 - dn) * (0.22 + Game.dusk * 0.3 + World.morning * 0.25);
}

function renderWorld(dt) {
  const t = Game.time, p = Game.player;
  const dn = Math.min(1, Game.darkness / 0.9);
  World.gust = windGust(t) * (1 - 0.35 * dn);
  WIND.uGust.value = 0.5 + World.gust * 1.2;
  updateTimeOfDay(dt);
  if (Lift.active) {                       // в шахте темно: солнце и небо пробиваются, только когда клетка у верха
    World.sun.intensity *= Lift.light;
    World.hemi.intensity *= Lift.light;
  }
  adjustPost(PostFX.params);
  if (Lift.active) PostFX.params.exposure *= 0.4 + 0.6 * Lift.light;
  updateWalls(dt, tw(p.x), tw(p.y));
  updateGates(dt, tw(p.x), tw(p.y));
  updateGlade(dt, dn, tw(p.x), tw(p.y));
  syncItems(t);
  syncGrievers(t, dt, dn);
  syncNpcs(t, dt);
  updateHouseDoors(dt);
  syncExit();
  if (Game.state === 'play') ambientEffects(dt);
  updateFauna(dt);
  updateItems(dt);
  updateCamera(dt);
  World.camera.updateMatrixWorld();
  HEIGHT_FOG.y = -World.camera.position.y;          // земля (высота 0) относительно камеры
  Sound.listen(World.camera);
  updateSunRays(dn);
  updatePlayerBody(dt);
  updateFirstPerson(dt);
  Sky.mesh.position.copy(World.camera.position);
  renderWeather(dt, World.camera, Game.indoor);
  updateParticles(dt, World.camera, World.renderer, World.scene.fog);
  // Тени: на нижних ступенях карту солнца перерисовываем через кадр-два; тень фонарика — только когда он светит
  // (включать и выключать castShadow нельзя — пересоберутся шейдеры всех материалов)
  const sunSh = World.sun.shadow;
  World.shadowTick++;
  sunSh.autoUpdate = false;
  sunSh.needsUpdate = !sunSh.map || World.shadowEvery <= 1 || World.shadowTick % World.shadowEvery === 0;
  World.flash.shadow.autoUpdate = World.flash.castShadow && World.flash.intensity > 0.02;
  renderPostFX(World.scene, World.camera, t);
  if (dt > 0) adaptResolution(dt);
}
