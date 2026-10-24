// Погода: ясно, облачно, туман, дождь, гроза, снег. Выбирается каждое утро по сезону и иногда меняется днём.
// Туман прячет коридоры и сужает разведку карты, дождь глушит шаги, в грозу гриверы злее,
// а молния на миг освещает Лабиринт — успей запомнить, куда бежать.

const WEATHER = {
  clear: { name: 'ясно', cloud: 0.25, fog: 1, rain: 0, snow: 0 },
  cloudy: { name: 'облачно', cloud: 0.75, fog: 1.15, rain: 0, snow: 0 },
  fog: { name: 'туман', cloud: 0.6, fog: 3.2, rain: 0, snow: 0 },
  rain: { name: 'дождь', cloud: 0.9, fog: 1.6, rain: 0.6, snow: 0 },
  storm: { name: 'гроза', cloud: 1, fog: 1.8, rain: 1, snow: 0 },
  snow: { name: 'снег', cloud: 0.85, fog: 1.7, rain: 0, snow: 1 },
};
const NEXT_WEATHER = { clear: 'cloudy', cloudy: 'rain', rain: 'storm', storm: 'rain', fog: 'cloudy', snow: 'cloudy' };

const Weather = {
  kind: 'clear', cur: { cloud: 0.25, fog: 1, rain: 0, snow: 0 }, flash: 0, boltT: 8, midday: false,
  label() { return WEATHER[Weather.kind].name; },
  // Множители для игры
  noiseK() { return 1 - 0.45 * Weather.cur.rain + 0.15 * Weather.cur.snow; },
  storm() { return Weather.kind === 'storm'; },
};

function initWeather(scene) {
  // Дождь — отрезки-струи, снег — точки; и то и другое живёт в коробке вокруг камеры
  const N = 1800, R = new Float32Array(N * 6), drops = [];
  for (let i = 0; i < N; i++) drops.push({ x: (Math.random() - 0.5) * 34, y: Math.random() * 22, z: (Math.random() - 0.5) * 34, v: 14 + Math.random() * 5 });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(R, 3).setUsage(THREE.DynamicDrawUsage));
  Weather.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9aaabb, transparent: true, opacity: 0, depthWrite: false }));
  Weather.rain.frustumCulled = false;
  Weather.rain.renderOrder = 4;
  Weather.drops = drops;
  const M = 1400, P = new Float32Array(M * 3), flakes = [];
  for (let i = 0; i < M; i++) flakes.push({ x: (Math.random() - 0.5) * 34, y: Math.random() * 20, z: (Math.random() - 0.5) * 34, v: 0.9 + Math.random() * 0.8, ph: Math.random() * 6.28 });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
  Weather.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xf2f6ff, size: 0.07, transparent: true, opacity: 0, depthWrite: false }));
  Weather.snow.frustumCulled = false;
  Weather.snow.renderOrder = 4;
  Weather.flakes = flakes;
  scene.add(Weather.rain, Weather.snow);
}

function resetWeather() {
  Weather.kind = 'clear';
  Object.assign(Weather.cur, { cloud: 0.25, fog: 1, rain: 0, snow: 0 });
  Weather.flash = 0;
  Weather.midday = false;
}

function pickWeather() {
  const table = SEASONS[Life.season].weather;
  let r = Math.random() * Object.values(table).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(table)) if ((r -= w) < 0) return k;
  return 'clear';
}

function setWeather(kind, announce = true) {
  if (Weather.kind === kind) return;
  Weather.kind = kind;
  if (!announce) return;
  const msg = {
    clear: 'Небо прояснилось.', cloudy: 'Небо затянуло облаками.',
    fog: 'Опустился густой туман: в Лабиринте почти ничего не видно, карта открывается хуже.',
    rain: 'Пошёл дождь. Шаги почти не слышно — гриверам тебя труднее услышать.',
    storm: 'Начинается гроза! Гриверы беспокоятся. Вспышки молний освещают коридоры.',
    snow: 'Пошёл снег. Шаги скрипят — тебя слышно издалека.',
  }[kind];
  toast(msg, kind === 'storm' || kind === 'fog' ? 'warn' : 'info');
}

function weatherOnDay() {
  Weather.midday = false;
  setWeather(Game.day === 1 ? 'clear' : pickWeather());
}

function updateWeather(dt) {
  const target = WEATHER[Weather.kind], k = Math.min(1, dt / 12);
  for (const key of ['cloud', 'fog', 'rain', 'snow']) Weather.cur[key] += (target[key] - Weather.cur[key]) * k;
  // Посреди дня погода может испортиться
  if (Game.phase === 'day' && !Weather.midday && Game.timeLeft < Game.dayLen * 0.5) {
    Weather.midday = true;
    if (Math.random() < 0.3) setWeather(NEXT_WEATHER[Weather.kind] === 'storm' && Life.season === 2 ? 'snow' : NEXT_WEATHER[Weather.kind]);
  }
  // Молнии
  Weather.flash = Math.max(0, Weather.flash - dt * 4);
  if (Weather.kind === 'storm' && Weather.cur.rain > 0.5) {
    Weather.boltT -= dt;
    if (Weather.boltT <= 0) {
      Weather.boltT = 6 + Math.random() * 12;
      Weather.flash = 1;
      const near = Math.random();
      Sound.thunder(0.3 + near * 2.4, 1 - near * 0.6);
      // Вспышка на миг открывает карту вокруг
      if (Game.state === 'play') Maze.reveal(Game.player.x, Game.player.y, 6);
    }
  }
}

// Струи и снежинки вокруг камеры; в доме их не видно
function renderWeather(dt, cam, indoor) {
  const c = Weather.cur, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  const rainOp = indoor ? 0 : Math.min(0.55, c.rain * 0.6), snowOp = indoor ? 0 : Math.min(0.9, c.snow);
  Weather.rain.material.opacity = rainOp;
  Weather.rain.visible = rainOp > 0.01;
  Weather.snow.material.opacity = snowOp;
  Weather.snow.visible = snowOp > 0.01;
  const wrap = (v, center) => { const d = v - center; return d > 17 ? v - 34 : d < -17 ? v + 34 : v; };
  const wind = (World.gust || 0) * 2.5;
  if (Weather.rain.visible) {
    const a = Weather.rain.geometry.attributes.position.array, n = Math.round(Weather.drops.length * Math.min(1, c.rain + 0.2));
    for (let i = 0; i < Weather.drops.length; i++) {
      const d = Weather.drops[i];
      d.y -= d.v * dt;
      d.x += wind * dt;
      if (d.y < cy - 3) d.y += 22;
      d.x = wrap(d.x + 0, cx);
      d.z = wrap(d.z, cz);
      const j = i * 6, on = i < n;
      a[j] = d.x; a[j + 1] = on ? d.y : -999; a[j + 2] = d.z;
      a[j + 3] = d.x + wind * 0.03; a[j + 4] = on ? d.y + 0.5 : -999; a[j + 5] = d.z;
    }
    Weather.rain.geometry.attributes.position.needsUpdate = true;
  }
  if (Weather.snow.visible) {
    const a = Weather.snow.geometry.attributes.position.array, t = Game.time;
    for (let i = 0; i < Weather.flakes.length; i++) {
      const f = Weather.flakes[i];
      f.y -= f.v * dt;
      f.x += (Math.sin(t * 0.8 + f.ph) * 0.4 + wind * 0.4) * dt;
      if (f.y < cy - 3) f.y += 20;
      f.x = wrap(f.x, cx);
      f.z = wrap(f.z, cz);
      a[i * 3] = f.x; a[i * 3 + 1] = f.y; a[i * 3 + 2] = f.z;
    }
    Weather.snow.geometry.attributes.position.needsUpdate = true;
  }
}
