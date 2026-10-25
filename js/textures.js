// Процедурные текстуры: цвет + карта нормалей (рельеф). Всё рисуется при запуске,
// бесшовно (повторяется без стыков). Готовые текстуры лежат в TEX.

const TEX = {};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTex(c, { srgb = true, rx = 1, ry = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

// Детерминированный генератор, чтобы текстуры не менялись между запусками
function seeded(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Значимый шум с периодом: повторяется каждые period клеток решётки
function tileNoise(seed, period) {
  const r = seeded(seed * 7919 + 13);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (a, b) => g[((b % period) + period) % period * period + ((a % period) + period) % period];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
}

function fbm(n, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += a * n(x * f, y * f);
    norm += a;
    a *= 0.5;
    f *= 2;
  }
  return s / norm;
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// Карта нормалей из карты высот (с заворотом краёв — тоже бесшовная)
function normalCanvas(h, w, H, strength) {
  const c = makeCanvas(w, H), g = c.getContext('2d'), img = g.createImageData(w, H), d = img.data;
  for (let y = 0; y < H; y++) {
    const up = ((y - 1 + H) % H) * w, dn = ((y + 1) % H) * w, row = y * w;
    for (let x = 0; x < w; x++) {
      let nx = (h[row + (x - 1 + w) % w] - h[row + (x + 1) % w]) * strength;
      let ny = (h[dn + x] - h[up + x]) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (row + x) * 4;
      d[i] = (nx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// fn(x, y, out) заполняет out = [r, g, b, высота]
function bake(w, h, fn, strength) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const height = new Float32Array(w * h), out = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      fn(x, y, out);
      const i = y * w + x;
      d[i * 4] = out[0];
      d[i * 4 + 1] = out[1];
      d[i * 4 + 2] = out[2];
      d[i * 4 + 3] = 255;
      height[i] = out[3];
    }
  }
  g.putImageData(img, 0, 0);
  return { map: canvasTex(c), normal: canvasTex(normalCanvas(height, w, h, strength), { srgb: false }) };
}

/* ---------- камень стен: ряды блоков, швы, сколы, мох в швах ---------- */

function stoneWallMaps(seed) {
  const W = 512, r = seeded(seed), n = tileNoise(seed + 1, 16), n2 = tileNoise(seed + 2, 64);
  const heights = [];
  let total = 0;
  while (total < W - 40) { const h = 42 + r() * 24; heights.push(h); total += h; }
  let y0 = 0;
  const rows = heights.map(h => {
    const hh = h * W / total, start = r() * 160;
    const row = { y0, y1: y0 + hh, start, blocks: [] };
    y0 += hh;
    for (let x = start; x < start + W;) {
      const w = 70 + r() * 110;
      row.blocks.push({ x0: x, x1: Math.min(x + w, start + W), tone: r(), moss: r(), warm: r() });
      x += w;
    }
    return row;
  });
  return bake(W, W, (x, y, o) => {
    const row = rows.find(rw => y < rw.y1) || rows[rows.length - 1];
    const xx = x < row.start ? x + W : x;
    const b = row.blocks.find(bl => xx < bl.x1) || row.blocks[row.blocks.length - 1];
    const e = Math.min(xx - b.x0, b.x1 - xx, y - row.y0, row.y1 - y);
    const mortar = 2 + n(x / 32, y / 32) * 2.5;
    const grain = fbm(n2, x / 8, y / 8, 4);
    if (e < mortar) {
      const m = 0.55 + grain * 0.5;
      const moss = b.moss > 0.55 ? smooth(0.4, 0.7, fbm(n, x / 16, y / 16)) : 0;
      o[0] = (62 * (1 - moss) + 52 * moss) * m;
      o[1] = (57 * (1 - moss) + 74 * moss) * m;
      o[2] = (50 * (1 - moss) + 34 * moss) * m;
      o[3] = 0.08 + grain * 0.06;
      return;
    }
    const bevel = smooth(mortar, mortar + 5, e);
    const chip = smooth(0.74, 0.86, fbm(n2, x / 4 + 9, y / 4, 3));
    const stain = 0.82 + 0.18 * n(x / 20, y / 220);
    const L = (92 + b.tone * 38) * (0.72 + grain * 0.5) * stain * (1 - chip * 0.3);
    o[0] = L * (1.0 + b.warm * 0.05);
    o[1] = L * 0.96;
    o[2] = L * (0.86 - b.warm * 0.05);
    o[3] = 0.45 + 0.3 * bevel + (grain - 0.5) * 0.35 - chip * 0.3;
  }, 2.2);
}

/* ---------- пол Лабиринта: плиты разной формы (диаграмма Вороного) ---------- */

function voronoiStone(seed, { cells = 4, gap = 5, base = 92, spread = 30, tint = [1, 0.97, 0.9], mossy = 0.5 } = {}) {
  const W = 512, r = seeded(seed), n = tileNoise(seed + 3, 32), cell = W / cells;
  const pts = [];
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) pts.push({ x: (gx + 0.15 + r() * 0.7) * cell, y: (gy + 0.15 + r() * 0.7) * cell, tone: r() });
  }
  return bake(W, W, (x, y, o) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let d1 = 1e9, d2 = 1e9, best = null;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j;
        const p = pts[((gy + cells) % cells) * cells + (gx + cells) % cells];
        const px = p.x + Math.floor(gx / cells) * W, py = p.y + Math.floor(gy / cells) * W;
        const d = Math.hypot(x - px, y - py);
        if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
      }
    }
    const edge = (d2 - d1) / 2;
    const grain = fbm(n, x / 16, y / 16, 4);
    const g = gap + n(x / 16 + 5, y / 16) * 3;
    if (edge < g) {
      const moss = smooth(0.45, 0.65, grain) * mossy;
      o[0] = (46 + 10 * moss) * (0.7 + grain * 0.6);
      o[1] = (42 + 30 * moss) * (0.7 + grain * 0.6);
      o[2] = (36 + 2 * moss) * (0.7 + grain * 0.6);
      o[3] = 0.05;
      return;
    }
    const L = (base + best.tone * spread) * (0.7 + grain * 0.55);
    o[0] = L * tint[0];
    o[1] = L * tint[1];
    o[2] = L * tint[2];
    o[3] = 0.5 + 0.35 * smooth(g, g + 14, edge) + (grain - 0.5) * 0.3;
  }, 2.6);
}

/* ---------- дерево: доски с волокнами, сучками и гвоздями ---------- */

function plankMaps(seed, { planks = 5, tone = [122, 88, 58] } = {}) {
  const W = 512, r = seeded(seed), n = tileNoise(seed + 4, 32), pw = W / planks;
  const info = Array.from({ length: planks }, () => ({ tone: 0.75 + r() * 0.4, knotY: r() * W, knot: r() < 0.6, off: r() * 100 }));
  return bake(W, W, (x, y, o) => {
    const k = Math.floor(x / pw), p = info[k], lx = x - k * pw;
    const gapD = Math.min(lx, pw - lx);
    let grain = fbm(n, x / 2.5, (y + p.off) / 40, 4);
    const kd = Math.hypot(lx - pw * 0.5, ((y - p.knotY + W * 1.5) % W) - W / 2);
    let knot = 0;
    if (p.knot && kd < 26) { knot = 1 - kd / 26; grain += Math.sin(kd * 0.9) * 0.15 * knot; }
    const rings = 0.5 + 0.5 * Math.sin(grain * 40);
    const L = p.tone * (0.62 + grain * 0.45 + rings * 0.08) * (1 - knot * 0.45);
    const nail = (Math.abs(y - 36) < 3 || Math.abs(y - 476) < 3) && Math.abs(lx - pw * 0.5) < 3;
    if (gapD < 2) {
      o[0] = 22; o[1] = 16; o[2] = 11; o[3] = 0;
    } else if (nail) {
      o[0] = 40; o[1] = 38; o[2] = 36; o[3] = 0.9;
    } else {
      o[0] = tone[0] * L; o[1] = tone[1] * L; o[2] = tone[2] * L;
      o[3] = 0.6 + grain * 0.25 - knot * 0.2 - (gapD < 5 ? (5 - gapD) * 0.08 : 0);
    }
  }, 2.2);
}

function barkMaps() {
  const W = 256, H = 512, n = tileNoise(41, 32);
  return bake(W, H, (x, y, o) => {
    const v = fbm(n, x / 8, y / 32, 4);
    const ridge = Math.abs(Math.sin(x * 0.11 + v * 9));
    const crack = smooth(0.0, 0.25, ridge);
    const L = 0.45 + 0.55 * crack * (0.7 + v * 0.5);
    o[0] = 92 * L; o[1] = 72 * L; o[2] = 54 * L;
    o[3] = crack * 0.8 + v * 0.2;
  }, 4);
}

/* ---------- соломенная крыша ---------- */

function thatchMaps() {
  const W = 512, r = seeded(51), c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#5a4527';
  g.fillRect(0, 0, W, W);
  for (let i = 0; i < 9000; i++) {
    const x = r() * W, y = r() * W, len = 25 + r() * 45, l = 90 + r() * 90;
    g.strokeStyle = `rgb(${l}, ${l * 0.82}, ${l * 0.5})`;
    g.lineWidth = 1 + r() * 1.5;
    for (const ox of [0, -W, W]) {
      for (const oy of [0, -W, W]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + (r() - 0.5) * 5, y + oy + len);
        g.stroke();
      }
    }
  }
  // Полосы рядов соломы
  for (let y = 0; y < W; y += 64) {
    const gr = g.createLinearGradient(0, y, 0, y + 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)');
    gr.addColorStop(0.3, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, y, W, 64);
  }
  const data = g.getImageData(0, 0, W, W).data, h = new Float32Array(W * W);
  for (let i = 0; i < h.length; i++) h[i] = data[i * 4 + 1] / 255;
  return { map: canvasTex(c), normal: canvasTex(normalCanvas(h, W, W, 3), { srgb: false }) };
}

/* ---------- металл ворот: листы, заклёпки, подтёки ржавчины ---------- */

function metalMaps() {
  const W = 512, n = tileNoise(61, 32), n2 = tileNoise(62, 64);
  return bake(W, W, (x, y, o) => {
    const px = x % 256, py = y % 128;
    const seam = Math.min(px, 256 - px, py, 128 - py);
    const rivet = Math.min(...[10, 246].map(cx => Math.hypot(px - cx, ((py + 64) % 128) - 64 + 0)));
    const g = fbm(n2, x / 8, y / 8, 3);
    const rust = smooth(0.55, 0.8, fbm(n, x / 24, y / 96, 4)) * (0.4 + 0.6 * (y / W));
    const L = 0.62 + g * 0.35;
    o[0] = (78 * (1 - rust) + 112 * rust) * L;
    o[1] = (82 * (1 - rust) + 62 * rust) * L;
    o[2] = (88 * (1 - rust) + 34 * rust) * L;
    o[3] = 0.5 + g * 0.08 - (seam < 3 ? 0.4 : 0) + (rivet < 6 ? 0.5 * (1 - rivet / 6) : 0);
  }, 3);
}

function soilMaps() {
  const W = 256, n = tileNoise(71, 32);
  return bake(W, W, (x, y, o) => {
    const v = fbm(n, x / 6, y / 6, 4);
    const clod = smooth(0.55, 0.75, v);
    const L = 0.55 + v * 0.6;
    o[0] = 92 * L; o[1] = 68 * L; o[2] = 44 * L;
    o[3] = v + clod * 0.3;
  }, 4);
}

function dirtMaps() {
  const W = 256, r = seeded(81), n = tileNoise(82, 32);
  const pebbles = Array.from({ length: 40 }, () => ({ x: r() * W, y: r() * W, s: 2 + r() * 4, l: 0.8 + r() * 0.4 }));
  return bake(W, W, (x, y, o) => {
    const v = fbm(n, x / 8, y / 8, 4);
    let peb = 0, pl = 1;
    for (const p of pebbles) {
      const d = Math.hypot(((x - p.x + W * 1.5) % W) - W / 2, ((y - p.y + W * 1.5) % W) - W / 2);
      if (d < p.s) { peb = 1 - d / p.s; pl = p.l; break; }
    }
    const L = 0.6 + v * 0.5;
    o[0] = peb ? 120 * pl : 112 * L; o[1] = peb ? 112 * pl : 90 * L; o[2] = peb ? 100 * pl : 62 * L;
    o[3] = v * 0.4 + Math.sqrt(peb) * 0.6;
  }, 3);
}

function groundGrassMap() {
  const W = 256, n = tileNoise(91, 32);
  return bake(W, W, (x, y, o) => {
    const v = fbm(n, x / 6, y / 6, 4), d = smooth(0.6, 0.75, v);
    o[0] = (52 + d * 40) * (0.7 + v * 0.5);
    o[1] = (74 + d * 10) * (0.7 + v * 0.5);
    o[2] = (32 + d * 12) * (0.7 + v * 0.5);
    o[3] = v;
  }, 2);
}

// Ткань одежды: светлая, чтобы цвет материала её окрашивал
function fabricMaps() {
  const W = 128, n = tileNoise(101, 16);
  return bake(W, W, (x, y, o) => {
    const weave = ((x >> 1) + (y >> 1)) % 2 ? 1 : 0.86;
    const v = 0.85 + fbm(n, x / 4, y / 4, 3) * 0.2;
    const L = 228 * weave * v;
    o[0] = L; o[1] = L; o[2] = L;
    o[3] = weave * 0.5 + v * 0.3;
  }, 1.5);
}

// Морщинистая кожа гривера (только рельеф)
function fleshNormal() {
  const W = 256, n = tileNoise(111, 32), h = new Float32Array(W * W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const v = fbm(n, x / 8, y / 8, 5);
      const vein = 1 - Math.abs(fbm(n, x / 16 + 3, y / 16, 3) - 0.5) * 2;
      h[y * W + x] = v * 0.6 + Math.pow(vein, 6) * 0.5;
    }
  }
  return canvasTex(normalCanvas(h, W, W, 6), { srgb: false });
}

/* ---------- листья (с прозрачностью) ---------- */

function leafCanvas(seed, { count, shape, greens }) {
  const W = 256, r = seeded(seed), c = makeCanvas(W, W), g = c.getContext('2d');
  // Если есть фото настоящей листвы — заливаем силуэты листьев им
  const photo = ASSETS.leaves && ASSETS.leaves.image;
  const pattern = photo ? g.createPattern(photo, 'repeat') : null;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, dist = r() * 70;
    const x = W / 2 + Math.cos(a) * dist, y = W / 2 + Math.sin(a) * dist, s = 26 + r() * 22, rot = r() * Math.PI * 2;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    const col = greens[Math.floor(r() * greens.length)];
    const grad = g.createLinearGradient(0, -s, 0, s);
    grad.addColorStop(0, col[0]);
    grad.addColorStop(1, col[1]);
    if (pattern) pattern.setTransform(new DOMMatrix([0.35, 0, 0, 0.35, r() * 256, r() * 256]));
    g.fillStyle = pattern || grad;
    g.beginPath();
    if (shape === 'ivy') {
      // Трёхлопастной лист плюща
      g.moveTo(0, s * 0.6);
      g.bezierCurveTo(-s * 0.9, s * 0.4, -s, -s * 0.2, -s * 0.45, -s * 0.35);
      g.bezierCurveTo(-s * 0.4, -s * 0.9, s * 0.4, -s * 0.9, s * 0.45, -s * 0.35);
      g.bezierCurveTo(s, -s * 0.2, s * 0.9, s * 0.4, 0, s * 0.6);
    } else {
      g.moveTo(0, -s);
      g.quadraticCurveTo(s * 0.45, 0, 0, s);
      g.quadraticCurveTo(-s * 0.45, 0, 0, -s);
    }
    g.fill();
    g.strokeStyle = 'rgba(200, 220, 150, 0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, s * 0.6);
    g.lineTo(0, -s * 0.7);
    g.stroke();
    g.restore();
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* ---------- частицы, свечение, надписи ---------- */

function softDot() {
  const S = 64, c = makeCanvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

function smokePuff() {
  const S = 128, n = tileNoise(121, 16), c = makeCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
      const a = clamp01(1 - d) * (0.45 + fbm(n, x / 8, y / 8, 4) * 0.9);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = clamp01(a * a * 1.6) * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// Металлическая табличка со словом кода
function wordTexture(word) {
  const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#8d9196');
  grad.addColorStop(0.5, '#b5b9bd');
  grad.addColorStop(1, '#7c8085');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const r = seeded(word.length * 31);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '40,40,40' : '255,255,255'}, 0.06)`;
    g.fillRect(0, r() * H, W, 1);
  }
  g.strokeStyle = '#4b4f54';
  g.lineWidth = 10;
  g.strokeRect(14, 14, W - 28, H - 28);
  g.fillStyle = '#3b3f44';
  for (const [x, y] of [[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]]) {
    g.beginPath();
    g.arc(x, y, 8, 0, Math.PI * 2);
    g.fill();
  }
  g.font = '700 92px Tektur, Rubik, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillText(word, W / 2 + 2, H / 2 + 4, W - 80);
  g.fillStyle = '#26292d';
  g.fillText(word, W / 2, H / 2 + 2, W - 80);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  return t;
}

// Имя над жителем — бирка из бумаги, имя написано от руки (как в интерфейсе)
function labelTexture(text) {
  const W = 256, H = 64, c = makeCanvas(W, H), g = c.getContext('2d');
  g.font = '700 40px Caveat, Rubik, system-ui, sans-serif';
  const w = Math.min(W - 8, g.measureText(text).width + 30), x0 = (W - w) / 2;
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  g.fillRect(x0 + 2, 12, w, H - 20);
  const paper = g.createLinearGradient(0, 8, 0, H - 10);
  paper.addColorStop(0, '#ece2c7');
  paper.addColorStop(1, '#d5c49c');
  g.fillStyle = paper;
  g.fillRect(x0, 9, w, H - 20);
  g.strokeStyle = 'rgba(94, 64, 24, 0.55)';
  g.lineWidth = 2;
  g.strokeRect(x0 + 1, 10, w - 2, H - 22);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#2a2318';
  g.fillText(text, W / 2, H / 2 - 1);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function initTextures() {
  TEX.walls = [stoneWallMaps(3), stoneWallMaps(17), stoneWallMaps(29)];
  TEX.floor = voronoiStone(5);
  TEX.wood = plankMaps(7);
  TEX.woodDark = plankMaps(9, { planks: 4, tone: [92, 66, 44] });
  TEX.bark = barkMaps();
  TEX.thatch = thatchMaps();
  TEX.metal = metalMaps();
  TEX.soil = soilMaps();
  TEX.dirt = dirtMaps();
  TEX.ground = groundGrassMap();
  TEX.fabric = fabricMaps();
  TEX.flesh = fleshNormal();
  TEX.rock = voronoiStone(13, { cells: 3, gap: 2, base: 88, spread: 40, mossy: 0.3 });
  TEX.ivy = leafCanvas(131, { count: 11, shape: 'ivy', greens: [['#2e4a1f', '#1d3313'], ['#3b5a26', '#243d17'], ['#46682c', '#2b4519'], ['#2a4019', '#18280e']] });
  TEX.leaves = leafCanvas(137, { count: 16, shape: 'leaf', greens: [['#5c7f33', '#3a5520'], ['#6b8c3a', '#45612a'], ['#4d6f2c', '#2f4a1b'], ['#7a9442', '#4f6a2a']] });
  TEX.dot = softDot();
  TEX.smoke = smokePuff();
}
