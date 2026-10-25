// Персонажи: Томас (свободный бег от первого лица), гриверы и жители Глэйда.
// Гриверы и жители ходят «от центра тайла к центру тайла» — так они не застревают на углах.

// Постройки Глэйда не перекрывают тайлы целиком — для Томаса их точная форма лежит в COLLIDERS
function playerPass(x, y) {
  const t = Maze.at(x, y);
  if (t === T.FLOOR || t === T.EXIT || t === T.GLADE || t === T.IVY) return true;
  if (t === T.GATE) return Game.gate < 0.8;
  return false;
}
// Сквозь занавес плюща проходят все — и Томас, и гриверы, и бегуны
function grieverPass(x, y) { const t = Maze.at(x, y); return t === T.FLOOR || t === T.IVY; }
function npcPass(x, y) { return Maze.at(x, y) === T.GLADE && !decoBlocked(x, y); }
// Бегуны ходят и по Лабиринту, пока ворота открыты
function runnerPass(x, y) {
  const t = Maze.at(x, y);
  if (t === T.FLOOR || t === T.IVY) return true;
  if (t === T.GATE) return Game.gate < 0.5;
  return t === T.GLADE && !decoBlocked(x, y);
}

const Input = {
  keys: new Set(),
  sprint: false,
  lookX: 0, lookY: 0,                 // накопленное движение мыши за кадр
  touch: { f: 0, turn: 0 },           // экранные кнопки
  clear() {
    this.keys.clear();
    this.sprint = false;
    this.touch.f = this.touch.turn = 0;
  },
  down(...codes) { return codes.some(c => this.keys.has(c)) ? 1 : 0; },
  // Клавиши ходьбы берутся из настроек; стрелки работают всегда
  forward() { return this.down(Settings.keys.forward, 'ArrowUp') - this.down(Settings.keys.back, 'ArrowDown') + this.touch.f; },
  strafe() { return this.down(Settings.keys.right) - this.down(Settings.keys.left); },
  turn() { return this.down('ArrowRight') - this.down('ArrowLeft') + this.touch.turn; },
};

function atCenter(e) { return e.x === Math.round(e.x) && e.y === Math.round(e.y); }

// Двигает сущность на dist тайлов. choose решает, куда идти, когда она в центре тайла.
function stepEntity(e, dist, choose, pass) {
  for (let guard = 0; dist > 1e-6 && guard < 8; guard++) {
    if (atCenter(e)) {
      const d = choose(e, e.x, e.y);
      if (!d || !pass(e.x + d.x, e.y + d.y)) { e.dx = 0; e.dy = 0; return; }
      e.dx = d.x; e.dy = d.y;
    }
    if (!e.dx && !e.dy) return;
    const tx = e.dx > 0 ? Math.floor(e.x) + 1 : e.dx < 0 ? Math.ceil(e.x) - 1 : e.x;
    const ty = e.dy > 0 ? Math.floor(e.y) + 1 : e.dy < 0 ? Math.ceil(e.y) - 1 : e.y;
    const left = Math.abs(tx - e.x) + Math.abs(ty - e.y);
    if (dist >= left) {
      e.x = tx; e.y = ty; dist -= left;
    } else {
      e.x += e.dx * dist; e.y += e.dy * dist; dist = 0;
    }
  }
}

function turnToward(e, dt, speed, target) {
  if (target === undefined) {
    if (!e.dx && !e.dy) return;
    target = Math.atan2(e.dy, e.dx);
  }
  let diff = target - e.face;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  e.face += diff * Math.min(1, dt * speed);
}

function nearestPassable(rx, ry, pass) {
  for (let r = 0; r < 10; r++) {
    let best = null;
    for (let dx = -r; dx <= r; dx++) {
      const k = r - Math.abs(dx);
      for (const dy of k ? [-k, k] : [0]) {
        const x = rx + dx, y = ry + dy;
        if (!pass(x, y)) continue;
        if (!best || Maze.at(x, y) === T.GLADE) best = { x, y };
      }
    }
    if (best) return best;
  }
  return null;
}

function snapToPassable(e, pass) {
  if (pass(Math.floor(e.x), Math.floor(e.y)) && pass(Math.ceil(e.x), Math.ceil(e.y))) return false;
  const best = nearestPassable(Math.round(e.x), Math.round(e.y), pass);
  if (!best) return false;
  e.x = best.x; e.y = best.y; e.dx = 0; e.dy = 0;
  return true;
}

// Расстояние по коридорам от игрока до каждого тайла — по нему гриверы идут на охоту
function distanceField(sx, sy) {
  if (!grieverPass(sx, sy)) return null;
  const f = new Int16Array(SIZE * SIZE).fill(-1);
  const q = [sy * SIZE + sx];
  f[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const k = q[i], x = k % SIZE, y = (k - x) / SIZE;
    for (const d of DIRS) {
      const nx = x + d.x, ny = y + d.y, nk = ny * SIZE + nx;
      if (!grieverPass(nx, ny) || f[nk] !== -1) continue;
      f[nk] = f[k] + 1;
      q.push(nk);
    }
  }
  return f;
}

// Кратчайший путь по тайлам (поиск в ширину); без стартового тайла
function findPath(sx, sy, tx, ty, pass) {
  if (sx === tx && sy === ty) return [];
  const prev = new Int32Array(SIZE * SIZE).fill(-1);
  const start = sy * SIZE + sx, goal = ty * SIZE + tx;
  const q = [start];
  prev[start] = start;
  for (let i = 0; i < q.length; i++) {
    const k = q[i];
    if (k === goal) break;
    const x = k % SIZE, y = (k - x) / SIZE;
    for (const d of DIRS) {
      const nx = x + d.x, ny = y + d.y, nk = ny * SIZE + nx;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || prev[nk] !== -1 || !pass(nx, ny)) continue;
      if (wallBetween(x, y, nx, ny)) continue;          // в дом — только через дверь
      prev[nk] = k;
      q.push(nk);
    }
  }
  if (prev[goal] === -1) return null;
  const path = [];
  for (let k = goal; k !== start; k = prev[k]) path.push({ x: k % SIZE, y: Math.floor(k / SIZE) });
  return path.reverse();
}

/* ---------- Томас ---------- */

const PLAYER_R = 0.13;   // радиус Томаса в тайлах (~0.45 м)

function makePlayer() {
  return {
    x: MID, y: MID, yaw: -Math.PI / 2, pitch: 0,
    h: 0, vh: 0, climb: null, wet: false,      // h — высота ног над нулём, метры
    hearts: 3, stamina: 100, exhausted: false, sprinting: false, moving: false,
    invuln: 0, walk: 0, bleed: 0, boost: 0,     // bleed — секунды кровотечения, boost — быстрый бег после пайка
  };
}

// Выталкивает круг игрока из непроходимых тайлов и из людей — так он скользит вдоль стен
function collidePlayer(p) {
  const rx = Math.round(p.x), ry = Math.round(p.y);
  for (let ty = ry - 1; ty <= ry + 1; ty++) {
    for (let tx = rx - 1; tx <= rx + 1; tx++) {
      if (playerPass(tx, ty)) continue;
      const cx = Math.max(tx - 0.5, Math.min(p.x, tx + 0.5));
      const cy = Math.max(ty - 0.5, Math.min(p.y, ty + 0.5));
      const dx = p.x - cx, dy = p.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= PLAYER_R * PLAYER_R || d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (PLAYER_R - d);
      p.y += (dy / d) * (PLAYER_R - d);
    }
  }
  // Столбы, стволы и стены построек — по их настоящему размеру (в метрах)
  const R = PLAYER_R * S;
  let px = p.x * S, pz = p.y * S;
  for (const c of COLLIDERS) {
    if (c.off || c.y0 > p.h + 1.7 || c.y1 < p.h + 0.15) continue;     // выключенное, выше головы или ниже ног
    const qx = c.round ? c.x : Math.max(c.x0, Math.min(px, c.x1));
    const qz = c.round ? c.z : Math.max(c.z0, Math.min(pz, c.z1));
    const dx = px - qx, dz = pz - qz, d = Math.hypot(dx, dz), min = c.round ? R + c.r : R;
    if (d >= min) continue;
    if (d > 1e-6) {
      px += dx / d * (min - d);
      pz += dz / d * (min - d);
    } else if (!c.round) {
      // Центр оказался внутри прямоугольника — выталкиваем к ближайшей стороне
      const l = px - c.x0, r = c.x1 - px, u = pz - c.z0, b = c.z1 - pz, m = Math.min(l, r, u, b);
      if (m === l) px = c.x0 - R; else if (m === r) px = c.x1 + R; else if (m === u) pz = c.z0 - R; else pz = c.z1 + R;
    }
  }
  p.x = px / S;
  p.y = pz / S;
  for (const n of Game.npcs || []) {
    const dx = p.x - n.x, dy = p.y - n.y, d = Math.hypot(dx, dy), min = PLAYER_R + 0.1;
    if (d < min && d > 1e-6) { p.x += dx / d * (min - d); p.y += dy / d * (min - d); }
  }
}

function unstickPlayer(p) {
  if (playerPass(Math.round(p.x), Math.round(p.y))) return;
  const best = nearestPassable(Math.round(p.x), Math.round(p.y), playerPass);
  if (best) { p.x = best.x; p.y = best.y; }
}

// Лестница рядом: у подножия или наверху у выхода на настил
function findLadder(p) {
  const x = p.x * S, z = p.y * S;
  for (const l of TERRAIN.ladders) {
    if (Math.abs(p.h - l.h0) < 0.8 && Math.hypot(x - l.x, z - l.z) < 1.1) return { l, at: 'bottom' };
    if (Math.abs(p.h - l.h1) < 0.8 && Math.hypot(x - l.tx, z - l.tz) < 1.2) return { l, at: 'top' };
  }
  return null;
}

function startClimb(p, found) {
  p.climb = found.l;
  p.vh = 0;
  if (found.at === 'top') p.h = found.l.h1 - 0.25;
  p.x = found.l.x / S;
  p.y = found.l.z / S;
}

// На лестнице: W — вверх, S — вниз; на верхней ступени выходим на настил, внизу — на землю
function climbUpdate(p, dt) {
  const l = p.climb, f = Math.max(-1, Math.min(1, Input.forward()));
  let diff = l.yaw - p.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  p.yaw += diff * Math.min(1, dt * 8);
  p.h += f * 2.1 * dt;
  p.moving = f !== 0;
  p.sprinting = false;
  p.walk += Math.abs(f) * 2.1 * dt / S;
  if (p.h >= l.h1) {
    p.h = l.h1;
    p.x = l.tx / S;
    p.y = l.tz / S;
    p.climb = null;
  } else if (p.h <= l.h0) {
    p.h = l.h0;
    p.climb = null;
  }
}

function updatePlayer(p, dt) {
  const sens = 0.0024 * Settings.sens;
  p.yaw += Input.turn() * 2.4 * dt + Input.lookX * sens;
  p.pitch = Math.max(-1.2, Math.min(1.2, p.pitch - Input.lookY * sens * (Settings.invertY ? -1 : 1)));
  Tutorial.looked += Math.abs(Input.lookX) + Math.abs(Input.lookY);
  Input.lookX = Input.lookY = 0;
  p.bleed = Math.max(0, p.bleed - dt);
  p.boost = Math.max(0, p.boost - dt);
  if (Admin.fly) { adminFly(p, dt); return; }
  if (p.climb) {
    climbUpdate(p, dt);
    p.stamina = Math.min(100, p.stamina + 8 * dt);
    p.invuln = Math.max(0, p.invuln - dt);
    return;
  }

  const f = Math.max(-1, Math.min(1, Input.forward())), s = Input.strafe();
  let mx = Math.cos(p.yaw) * f - Math.sin(p.yaw) * s;
  let my = Math.sin(p.yaw) * f + Math.cos(p.yaw) * s;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  p.moving = len > 0.01;
  p.sprinting = Input.sprint && p.moving && f >= 0 && !p.exhausted;
  if (p.sprinting) {
    p.stamina -= 26 * dt;
    if (p.stamina <= 0) { p.stamina = 0; p.exhausted = true; }
  } else {
    // Силы восстанавливаются медленнее, если течёт кровь, ты голоден или мокнешь под дождём
    const regen = (p.bleed > 0 ? 0.6 : 1) * (Life.hunger ? 0.7 : 1) * (1 - 0.15 * (Weather.cur.rain + Weather.cur.snow));
    p.stamina = Math.min(100, p.stamina + (p.moving ? 12 : 22) * regen * dt);
    if (p.exhausted && p.stamina >= 35) p.exhausted = false;
  }
  // Тайлов в секунду: шаг ~6 м/с, рывок ~9.6 м/с; в реке (на броде — чуть быстрее), в грязи, с грузом,
  // раненым или с товарищем на плече — медленнее
  const wl = waterLevel(p.x * S, p.y * S);
  p.wet = wl !== null && p.h < wl - 0.05;
  const wade = p.wet ? (wl - p.h > 0.32 ? 0.5 : 0.72) : 1;
  const mud = !p.wet && groundMask('mud', p.x * S, p.y * S) > 0.55 && p.h - groundH(p.x * S, p.y * S) < 0.1 ? 0.86 : 1;
  const speed = (p.sprinting ? 2.75 : 1.75) * (f < 0 ? 0.7 : 1) * wade * mud * loadFactor() *
    (p.bleed > 0 ? 0.85 : 1) * (p.boost > 0 ? 1.15 : 1) * (Squad.escorting ? 0.6 : 1) * Math.min(3, Admin.speed);
  const bx = p.x, by = p.y;
  p.x += mx * speed * dt;
  collidePlayer(p);
  p.y += my * speed * dt;
  collidePlayer(p);
  p.walk += Math.hypot(p.x - bx, p.y - by);
  p.invuln = Math.max(0, p.invuln - dt);
  // Высота: земля, настилы и полы; с края настила — падаем, в прыжке — летим вверх
  const sup = supportH(p.x * S, p.y * S, p.h);
  if (p.h > sup + 0.02 || p.vh > 0) {
    p.vh -= 20 * dt;
    p.h = Math.max(sup, p.h + p.vh * dt);
    if (p.h === sup) {
      if (p.vh < -3) p.landed = -p.vh;          // приземление слышно (main.js)
      p.vh = 0;
    }
  } else {
    p.h = sup;
    p.vh = 0;
  }
  p.air = p.h > sup + 0.02;
}

// Прыжок с земли или настила: ~0.5 м вверх, тратит силы; с перегрузом — ниже
function playerJump(p) {
  if (p.climb || p.air || p.vh !== 0 || p.stamina < 6 || p.wet) return false;
  p.vh = loadFactor() < 1 ? 3.9 : 4.5;
  p.stamina -= 6;
  p.air = true;
  return true;
}

/* ---------- Гриверы ---------- */

function makeGriever(x, y, night) {
  return { x, y, dx: 0, dy: 0, face: 0, night, stun: 0, fade: 0, leaving: false, hunting: false, wasHunting: false, t: Math.random() * 10 };
}

// Ночной гривер быстрее шага Томаса (1.75), но медленнее рывка (2.75). В грозу и в «Новой игре+» — злее
function grieverSpeed(g) {
  const ng = Game.ngPlus || 0, storm = Weather.storm() ? 1.08 : 1;
  if (!g.night) return (1.4 + 0.08 * ng) * storm;
  return Math.min(2.6 + 0.1 * ng, 2.0 + 0.08 * (Game.day - 1) + 0.12 * ng) * storm;
}

// Шаг к меньшему значению поля расстояний
function downhill(f, x, y, opts) {
  let best = null, bd = 1e9;
  for (const d of opts) {
    const v = f[(y + d.y) * SIZE + x + d.x];
    if (v >= 0 && v < bd) { bd = v; best = d; }
  }
  return best;
}

// Видит ли гривер Томаса: вплотную или по прямому коридору. Огонь в руке видно дальше (свет их притягивает),
// в грозу — ближе. За стенами Глэйда не видит
function grieverSees(g, p) {
  const d = Math.hypot(g.x - p.x, g.y - p.y);
  if (d < 2.2) return true;
  const gx = Math.round(g.x), gy = Math.round(g.y), px = Math.round(p.x), py = Math.round(p.y);
  if (Maze.at(px, py) === T.GLADE) return false;
  const range = (Game.phase === 'night' ? 8 : 6) + (holdingTorch() ? 4 : 0) - (Weather.storm() ? 2 : 0);
  if (d > range || (gx !== px && gy !== py)) return false;
  const sx = Math.sign(px - gx), sy = Math.sign(py - gy);
  for (let x = gx + sx, y = gy + sy; x !== px || y !== py; x += sx, y += sy) if (!grieverPass(x, y)) return false;
  return true;
}

function grieverChoose(g, x, y) {
  const opts = DIRS.filter(d => grieverPass(x + d.x, y + d.y));
  if (!opts.length) return null;
  const f = Game.field, p = Game.player;
  const here = f ? f[y * SIZE + x] : -1;
  if (grieverSees(g, p)) {
    g.alert = Game.phase === 'night' ? 10 : 6;
    g.last = { x: Math.round(p.x), y: Math.round(p.y) };
  }
  // Ночью гривер чует Томаса через весь Лабиринт; днём — только если видел его совсем недавно
  const nightScent = Game.phase === 'night' && here >= 0 && here <= 120 && !(here > 12 && Math.random() < 0.15);
  g.hunting = here >= 0 && (nightScent || (g.alert || 0) > 0);
  if (g.hunting) {
    const best = downhill(f, x, y, opts);
    if (best) return best;
  }
  // Потерял из виду — идёт туда, где видел в последний раз, и принюхивается вокруг
  if (g.last && (g.searchT || 0) > 0) {
    if (x === g.last.x && y === g.last.y) g.last = null;
    else {
      const best = opts.slice().sort((a, b) => Math.hypot(x + a.x - g.last.x, y + a.y - g.last.y) - Math.hypot(x + b.x - g.last.x, y + b.y - g.last.y))[0];
      if (best) return best;
    }
  }
  // Услышал шум — идёт проверить
  const nz = Game.noise;
  if (nz && nz.field) {
    const v = nz.field[y * SIZE + x];
    if (v > 0 && v <= nz.r) {
      const best = downhill(nz.field, x, y, opts);
      if (best) return best;
    }
  }
  const fwd = opts.filter(d => d.x !== -g.dx || d.y !== -g.dy);
  const pool = fwd.length ? fwd : opts;
  return pool[rand(pool.length)];
}

function updateGriever(g, dt) {
  g.t += dt;
  g.fade = g.leaving ? Math.max(0, g.fade - dt * 0.6) : Math.min(1, g.fade + dt * 0.8);
  g.flinchCool = Math.max(0, (g.flinchCool || 0) - dt);
  const wasAlert = (g.alert || 0) > 0;
  g.alert = Math.max(0, (g.alert || 0) - dt);
  if (wasAlert && g.alert <= 0 && g.last) {
    g.searchT = 9;                         // потерял след: рыщет вокруг места, где видел Томаса
    if (Math.hypot(g.x - Game.player.x, g.y - Game.player.y) < 18) Sound.screech(0.35, { x: tw(g.x), y: 1.4, z: tw(g.y) });
  }
  g.searchT = Math.max(0, (g.searchT || 0) - dt);
  // Огонь в упор: гривер отшатывается (не чаще раза в 12 секунд)
  const p = Game.player, d = Math.hypot(g.x - p.x, g.y - p.y);
  if (holdingTorch() && d < 1.6 && g.flinchCool <= 0 && g.fade > 0.6) {
    const fx = Math.cos(p.yaw), fy = Math.sin(p.yaw);
    if (((g.x - p.x) * fx + (g.y - p.y) * fy) / Math.max(0.01, d) > 0.55) {
      g.stun = 1.4;
      g.flinchCool = 12;
      Sound.screech(0.7, { x: tw(g.x), y: 1.6, z: tw(g.y) });
      if (!Game.flinchTold) { Game.flinchTold = true; toast('Гривер отшатнулся от огня! Свет его не убьёт, но задержит на миг.', 'good'); }
    }
  }
  if (g.stun > 0) { g.stun -= dt; return; }
  const slow = !g.hunting && g.searchT > 0 ? 0.7 : 1;      // принюхивается — ползёт медленнее
  stepEntity(g, grieverSpeed(g) * slow * dt, grieverChoose, grieverPass);
  turnToward(g, dt, 6);
}

// Случайная клетка лабиринта подальше от игрока
function spawnPoint(p, minDist) {
  for (let tries = 0; tries < 400; tries++) {
    const cx = rand(CELLS), cy = rand(CELLS);
    if (!validCell(cx, cy)) continue;
    const x = cx * 2 + 1, y = cy * 2 + 1;
    if (Math.hypot(x - p.x, y - p.y) >= minDist) return { x, y };
  }
  return { x: 1, y: 1 };
}

/* ---------- Жители Глэйда ---------- */

const NIGHT_LINES = [
  'Ночью за стенами лучше не думать о том, что там ходит.',
  'Слышишь щелчки? Это они. За стеной.',
  'Утром ворота откроются. Как всегда.',
  'Поспи, шнурок. Завтра бежать.',
];

const NPC_DATA = [
  { name: 'Алби', role: 'leader', skin: '#5a3825', shirt: '#7d6f5a', pants: '#3f3a31', hair: '#1a1410', style: 'buzz', height: 1.03,
    lines: ['Правил три: делай свою работу, не вреди другим, никогда не выходи за стены.', 'Я здесь дольше всех. Лабиринт не прощает ошибок.', 'Каждый в Глэйде нужен. Найди своё дело.'] },
  { name: 'Ньют', role: 'wander', skin: '#e6c3a5', shirt: '#9a8e74', pants: '#4b4438', hair: '#c9a86a', style: 'messy', height: 1.0,
    lines: ['Добро пожаловать в Глэйд, шнурок.', 'Не лезь в Лабиринт без бегунов. Хотя тебя же не остановишь.', 'Все мы когда-то проснулись в Ящике.'] },
  { name: 'Минхо', role: 'runner', skin: '#dcb48a', shirt: '#3e4a52', pants: '#3a3630', hair: '#15110d', style: 'short', height: 0.99, pack: true,
    lines: ['Стены по ночам двигаются. Утром карта уже другая.', 'Шесть слов кода, шесть секторов. Собери все.', 'Бегун не останавливается. Никогда.'] },
  { name: 'Бен', role: 'runner', skin: '#e2bd9c', shirt: '#6b6248', pants: '#3e3a32', hair: '#5a3a20', style: 'messy', height: 1.0, pack: true,
    lines: ['Видел гривера днём. Днём! Что-то меняется.', 'Мы с Минхо проверили восьмой сектор. Пусто.'] },
  { name: 'Чак', role: 'follower', skin: '#efcfb4', shirt: '#9c4a38', pants: '#4a4034', hair: '#6b4424', style: 'curly', height: 0.82,
    lines: ['Томас, только вернись до заката, ладно?', 'Я занял тебе место у костра!', 'Говорят, гриверы щёлкают, прежде чем напасть.'] },
  { name: 'Галли', role: 'builder', tool: 'hammer', skin: '#e8c2a0', shirt: '#5e6640', pants: '#40392e', hair: '#3a2a1c', style: 'short', height: 1.04,
    lines: ['С тех пор как ты появился, всё пошло не так.', 'Только попробуй нарушить правила, шнурок.', 'Мы ищем выход три года. Его нет.'] },
  { name: 'Фрайпан', role: 'cook', tool: 'ladle', skin: '#5e3a26', shirt: '#b5ad9c', pants: '#4a4236', hair: '#141010', style: 'curly', height: 1.0,
    lines: ['Голодным в Лабиринт не бегают. Держи.', 'Сегодня похлёбка. Опять.'] },
  { name: 'Уинстон', role: 'woodcutter', tool: 'axe', skin: '#e0b896', shirt: '#6f5a43', pants: '#3e382f', hair: '#4a3220', style: 'buzz', height: 1.01,
    lines: ['Дрова сами себя не нарубят.', 'Лес в углу Глэйда зовут Мертвяками. Не спрашивай почему.'] },
  { name: 'Зарт', role: 'farmer', tool: 'hoe', skin: '#e9c6a6', shirt: '#7a7457', pants: '#4b4438', hair: '#8a6a3c', style: 'short', height: 0.98,
    lines: ['Без огорода мы бы тут не протянули.', 'Помидоры в этом году хорошие.'] },
  { name: 'Джефф', role: 'medjackA', skin: '#d9ad86', shirt: '#c4bcaa', pants: '#4a4236', hair: '#2b2018', style: 'short', height: 0.97,
    lines: ['Если ужалят — сразу к нам. Сыворотки нет, но мы попробуем.', 'Медаки работают круглые сутки.'] },
  { name: 'Клинт', role: 'medjackB', skin: '#e6c0a0', shirt: '#bdb4a0', pants: '#3f3a31', hair: '#7a5530', style: 'messy', height: 1.0,
    lines: ['Порезы, ушибы, укусы — это всё к нам.'] },
  { name: 'Стэн', role: 'farmer', tool: 'hoe', skin: '#cfa27c', shirt: '#6c6a52', pants: '#423b31', hair: '#2a2018', style: 'buzz', height: 1.0,
    lines: ['Работы на огороде хватит всем.'] },
  { name: 'Джек', role: 'farmer', tool: 'hoe', skin: '#ecc9ab', shirt: '#8a7f66', pants: '#4b4438', hair: '#b08850', style: 'short', height: 0.96,
    lines: ['Ты новенький? Не стой на грядке.'] },
  { name: 'Адам', role: 'guard0', tool: 'spear', skin: '#7a4a30', shirt: '#5b5446', pants: '#3a352d', hair: '#120e0c', style: 'buzz', height: 1.05,
    lines: ['Стою у западных ворот. Кто-то должен.'] },
  { name: 'Ли', role: 'guard1', tool: 'spear', skin: '#e3bc94', shirt: '#4f5a48', pants: '#3a352d', hair: '#16120e', style: 'short', height: 0.99,
    lines: ['Восточные ворота под присмотром.'] },
  { name: 'Эрик', role: 'guard2', tool: 'spear', skin: '#e8c6a8', shirt: '#6a5e4a', pants: '#3a352d', hair: '#4d3520', style: 'messy', height: 1.02,
    lines: ['Северные ворота закрываются первыми. Шучу, все одновременно.'] },
  { name: 'Ник', role: 'smith', tool: 'hammer', skin: '#dfb592', shirt: '#7d7563', pants: '#463f35', hair: '#3a2818', style: 'short', height: 1.0,
    lines: ['В кузнице жарко, зато ножи у нас свои.', 'Копьё против гривера — лучше, чем ничего.'] },
  { name: 'Сигги', role: 'woodcutter', tool: 'axe', skin: '#c8956c', shirt: '#5d5240', pants: '#3e382f', hair: '#1f1712', style: 'curly', height: 1.03,
    lines: ['Береги пальцы, когда рубишь.'] },
  { name: 'Дэйв', role: 'farmer', tool: 'hoe', skin: '#e4bf9a', shirt: '#6e6650', pants: '#45403a', hair: '#5b3d22', style: 'messy', height: 0.99,
    lines: ['Картошку храним в картохранилище, рядом с картами. Не перепутай.'] },
  { name: 'Билли', role: 'wander', skin: '#9a6644', shirt: '#857a62', pants: '#423c33', hair: '#161210', style: 'buzz', height: 1.01,
    lines: ['На башню лучше лезть днём. Ночью страшно смотреть на стены.', 'У реки прохладно. Можно набрать воды во флягу.'] },
];

// Кто ночью ложится спать, а кто сидит у костра и сторожит
const NIGHT_SLEEPERS = new Set(['Минхо', 'Бен', 'Чак', 'Уинстон', 'Зарт', 'Джефф', 'Стэн', 'Ли', 'Ник', 'Дэйв']);

const TERESA = {
  name: 'Тереза', role: 'wander', skin: '#f0d2bc', shirt: '#5d6a72', pants: '#3d3a36', hair: '#2a1c14', style: 'long', height: 0.95,
  lines: ['Томас… Я тебя помню. Кажется.', 'Это я последняя. Так было написано в записке.', 'Лабиринт — это код. Его можно разгадать.'],
};

function makeNpc(d, i) {
  const spots = [...SEATS];
  const s = spots[i % spots.length] || LAYOUT.box;
  return {
    ...d, x: s.x, y: s.y, dx: 0, dy: 0, face: Math.random() * 6.28, act: 'idle',
    walk: 0, path: null, goal: null, wait: 0, say: null, sayT: 0, cool: 3 + Math.random() * 5,
    seat: i, t: Math.random() * 10, lookYaw: 0, stuck: 0, target: null, linger: 0, waveT: 0,
  };
}

function makeNpcs() {
  if (Settle.on) return [];              // поселение: жители приходят по одному на Ящике
  let bed = 0;
  return NPC_DATA.map((d, i) => {
    const n = makeNpc(d, i);
    n.night = NIGHT_SLEEPERS.has(d.name) && bed < BEDS.length ? 'sleep' : 'fire';
    if (n.night === 'sleep') n.bed = bed++;
    return n;
  });
}

function stationFor(role) {
  if (role === 'cook') return STATIONS.cook;
  if (role === 'smith') return STATIONS.smith;
  if (role === 'medjackA') return STATIONS.medjackA;
  if (role === 'medjackB') return STATIONS.medjackB;
  if (role === 'builder') return STATIONS.build;
  if (role.startsWith('guard')) return STATIONS.guards[+role.slice(5)];
  return null;
}

function randomGladeTile() {
  for (let i = 0; i < 50; i++) {
    const x = GLADE_T0 + rand(GLADE_T1 - GLADE_T0 + 1), y = GLADE_T0 + rand(GLADE_T1 - GLADE_T0 + 1);
    if (npcPass(x, y)) return { x, y };
  }
  return { ...LAYOUT.box };
}

// Расстояние по коридорам от ворот Глэйда; пересчитывается раз в день (ночью стены сдвигаются)
let RUNNER_FIELD = null, RUNNER_FIELD_DAY = -1;
function runnerField() {
  if (RUNNER_FIELD && RUNNER_FIELD_DAY === Game.day) return RUNNER_FIELD;
  const f = new Int16Array(SIZE * SIZE).fill(-1), q = [];
  for (const g of GATES) { f[g.y * SIZE + g.x] = 0; q.push(g.y * SIZE + g.x); }
  for (let i = 0; i < q.length; i++) {
    const k = q[i], x = k % SIZE, y = (k - x) / SIZE;
    for (const d of DIRS) {
      const nx = x + d.x, ny = y + d.y, nk = ny * SIZE + nx;
      if (Maze.at(nx, ny) !== T.FLOOR || f[nk] !== -1) continue;
      f[nk] = f[k] + 1;
      q.push(nk);
    }
  }
  RUNNER_FIELD = f;
  RUNNER_FIELD_DAY = Game.day;
  return f;
}

// Цель бегуна — не дальше 40 тайлов пути от ворот, чтобы точно успеть вернуться
function runnerTarget() {
  const f = runnerField();
  for (let i = 0; i < 300; i++) {
    const cx = rand(CELLS), cy = rand(CELLS);
    if (!validCell(cx, cy)) continue;
    const d = f[(cy * 2 + 1) * SIZE + cx * 2 + 1];
    if (d >= 12 && d <= 40) return { x: cx * 2 + 1, y: cy * 2 + 1 };
  }
  return { x: GATES[0].x, y: GATES[0].y - 1 };
}

// Куда идти и что делать сейчас: зависит от роли и времени суток.
// Особые дела (отряд, раненые, тревога, обед, стройка, пожар) решает npcOverride в squad.js
function npcGoal(n, p, dt) {
  const ov = npcOverride(n, p);
  if (ov) return ov;
  if (n.fresh) return freshGoal(n, p);          // новичок из Ящика: осматривается, работы ещё нет
  const evening = Game.phase === 'night' || Game.timeLeft < 24;
  const pTile = Maze.at(Math.round(p.x), Math.round(p.y));
  if (n.role === 'runner' && Game.phase === 'day' && Game.timeLeft > 24) {
    if (Game.timeLeft > 75 && Game.dayLen - Game.timeLeft > 5) {
      if (!n.target || n.linger > 7) { n.target = runnerTarget(); n.linger = 0; }
      return { x: n.target.x, y: n.target.y, act: 'idle', run: true, pass: runnerPass };
    }
    return { x: STATIONS.mapRoom.x + (n.name === 'Бен' ? 1 : 0), y: STATIONS.mapRoom.y, act: 'talk', face: STATIONS.mapRoom.face, run: true, pass: runnerPass };
  }
  if (evening) {
    const outside = Maze.at(Math.round(n.x), Math.round(n.y)) !== T.GLADE;
    const pass = outside ? runnerPass : undefined;
    // Ночью одни спят в кроватях, стражи дежурят у ворот, остальные сидят у костра
    if (n.night === 'guard' && Game.phase === 'night') {
      const st = stationFor(n.role);
      if (st) return { x: st.x, y: st.y, act: 'guard', face: st.face, run: outside, pass };
    }
    if (n.night === 'sleep' && Game.phase === 'night' && BEDS[n.bed] && isBuilt(BEDS[n.bed].house)) {
      const b = BEDS[n.bed];
      return { x: b.x, y: b.y, act: 'sleep', bed: b, run: outside, pass };
    }
    if (Settle.on && !isBuilt('campfire')) {
      // Костра ещё нет — коротают ночь у Ящика
      const t = nearestPassable(MID + ((n.seat % 3) - 1) * 2, MID + 2 + (n.seat % 2), npcPass) || LAYOUT.box;
      return { x: t.x, y: t.y, act: 'idle', lookAt: LAYOUT.box, run: outside, pass };
    }
    const s = SEATS[n.seat % SEATS.length];
    return { x: s.x, y: s.y, act: 'sit', face: LAYOUT.campfire, hurry: Game.phase === 'day', run: outside, pass };
  }
  if (n.role === 'follower') {
    if (pTile === T.GLADE) {
      if (Math.hypot(n.x - p.x, n.y - p.y) < 2.2 && n.goal && n.goal.follow) return { ...n.goal, act: n.waveT > 0 ? 'wave' : 'idle', lookAt: p };
      const ang = Math.atan2(n.y - p.y, n.x - p.x);
      const t = nearestPassable(Math.round(p.x + Math.cos(ang) * 1.5), Math.round(p.y + Math.sin(ang) * 1.5), npcPass) || LAYOUT.box;
      return { x: t.x, y: t.y, act: 'idle', lookAt: p, follow: true };
    }
    // Ждёт у ворот, ближайших к Томасу
    let best = STATIONS.guards[0], bd = 1e9;
    for (const g of GATES) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d < bd) { bd = d; best = nearestPassable(g.x + Math.sign(MID - g.x), g.y + Math.sign(MID - g.y), npcPass) || best; }
    }
    return { x: best.x, y: best.y, act: 'idle', face: { x: best.x * 2 - MID, y: best.y * 2 - MID } };
  }
  const sw = settlerWorkGoal(n);
  if (sw) return sw;
  const st = stationFor(n.role);
  if (st) return { x: st.x, y: st.y, act: st.act, face: st.face };
  if (n.role === 'farmer') {
    if (!n.target || n.linger > 25) { n.target = STATIONS.farm[rand(STATIONS.farm.length)]; n.linger = 0; }
    return { x: n.target.x, y: n.target.y, act: 'hoe', face: n.target.face };
  }
  if (n.role === 'woodcutter') {
    // Наколол дров — несёт охапку к поленнице, складывает и возвращается к колоде
    const list = [STATIONS.chop, { ...STATIONS.chop, x: STATIONS.chop.x - 1 }];
    if (!n.target || n.linger > (n.target.haul ? 3.5 : 25)) {
      n.target = !n.target || n.target.haul ? list[rand(list.length)] : STATIONS.woodpile;
      n.linger = 0;
    }
    return { x: n.target.x, y: n.target.y, act: n.target.act, face: n.target.face, carry: !!n.target.haul };
  }
  if (n.role === 'leader') {
    if (!n.target || n.linger > 20) { n.target = Math.random() < 0.6 ? STATIONS.leader : randomGladeTile(); n.linger = 0; }
    return { x: n.target.x, y: n.target.y, act: 'talk', face: n.target.face };
  }
  if (!n.target || n.linger > 12 + (n.seat % 5) * 3) { n.target = randomGladeTile(); n.linger = 0; }
  return { x: n.target.x, y: n.target.y, act: 'idle' };
}

function pathChoose(n, x, y) {
  while (n.path && n.path.length && n.path[0].x === x && n.path[0].y === y) n.path.shift();
  if (!n.path || !n.path.length) return null;
  return { x: Math.sign(n.path[0].x - x), y: Math.sign(n.path[0].y - y) };
}

function updateNpc(n, dt, p) {
  n.t += dt;
  n.waveT -= dt;
  const goal = npcGoal(n, p, dt);
  // Раненый опирается на плечо Томаса и идёт рядом с ним
  if (goal.attach) {
    const moved = Math.hypot(goal.x - n.x, goal.y - n.y);
    n.x = goal.x;
    n.y = goal.y;
    n.goal = goal;
    n.act = moved > 0.002 ? 'walk' : 'idle';
    n.walk += moved * S;
    turnToward(n, dt, 8, goal.face);
    return;
  }
  const pass = goal.pass || npcPass;
  if (!n.goal || n.goal.x !== goal.x || n.goal.y !== goal.y || n.stuck > 1.5) {
    n.repath = true;
    n.stuck = 0;
  }
  n.goal = goal;
  if (n.repath && atCenter(n)) {
    n.path = findPath(n.x, n.y, goal.x, goal.y, pass);
    n.repath = false;
  }
  const here = atCenter(n) && n.x === goal.x && n.y === goal.y;
  const bx = n.x, by = n.y;
  if (!here) {
    const speed = (goal.run ? (goal.follow ? 2.6 : 2.2) : goal.hurry ? 0.95 : 0.5) * (goal.slow ? 0.45 : 1);
    stepEntity(n, speed * dt, pathChoose, pass);
    const moved = Math.abs(n.x - bx) + Math.abs(n.y - by);
    n.stuck = moved < 1e-4 ? n.stuck + dt : 0;
    n.act = moved > 1e-4 ? (goal.run || goal.hurry ? 'run' : 'walk') : 'idle';
    n.walk += moved * S;
    turnToward(n, dt, 7);
  } else {
    n.act = goal.act;
    n.linger += dt;
    const look = goal.lookAt || goal.face;
    if (look) turnToward(n, dt, 4, Math.atan2(look.y - n.y, look.x - n.x));
  }
  // Голова поворачивается к Томасу, если он рядом
  const dist = Math.hypot(n.x - p.x, n.y - p.y);
  const toP = Math.atan2(p.y - n.y, p.x - n.x);
  let rel = toP - n.face;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  n.lookYaw += ((dist < 3 && Math.abs(rel) < 1.6 ? -rel : 0) - n.lookYaw) * Math.min(1, dt * 4);

  n.cool -= dt;
  n.sayT -= dt;
  if (dist < 1.1 && n.cool <= 0) {
    const pool = Game.phase === 'night' ? n.lines.concat(NIGHT_LINES) : n.lines;
    n.say = n.greet || pool[rand(pool.length)];
    n.greet = null;
    n.sayT = 4.5;
    n.cool = 12;
  }
}
