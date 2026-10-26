// Звуки синтезируются Web Audio — без файлов.
// Браузер разрешает звук только после клика, поэтому init() вызывается с кнопки «Старт».
// Слушатель стоит в камере: у источников с координатами слышно направление (HRTF) и расстояние.
// В коридорах Лабиринта на всё ложатся длинный хвост и эхо от бетонных стен.

const Sound = {
  ctx: null,
  master: null,
  muted: false,
  amb: null,
  voices: new Map(),       // гривер → его голос
  lx: 0, lz: 0,            // где сейчас слушатель (для далёких звуков вокруг)
  level: 1,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 14;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      this.master.connect(comp).connect(ctx.destination);
      // Шина звуков мира: сухой сигнал плюс отправки в реверберацию и эхо
      this.out = ctx.createGain();
      this.out.connect(this.master);
      this.verb = ctx.createConvolver();
      this.verb.buffer = this.impulse(3.2, 2.6);
      this.verbSend = ctx.createGain();
      this.verbSend.gain.value = 0.1;
      this.out.connect(this.verbSend).connect(this.verb).connect(this.master);
      // Эхо от дальних стен: задержка, каждый повтор глуше предыдущего
      this.echo = ctx.createDelay(1.5);
      this.echo.delayTime.value = 0.29;
      const fb = ctx.createGain(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter();
      fb.gain.value = 0.36;
      lp.type = 'lowpass';
      lp.frequency.value = 2300;
      hp.type = 'highpass';
      hp.frequency.value = 180;
      this.echoSend = ctx.createGain();
      this.echoSend.gain.value = 0;
      this.out.connect(this.echoSend).connect(this.echo).connect(lp).connect(hp);
      hp.connect(fb).connect(this.echo);
      hp.connect(this.master);
      // Фон и существа идут отдельно: их приглушаем на паузе и во сне
      this.world = ctx.createGain();
      this.world.connect(this.out);
      this.worldDry = ctx.createGain();
      this.worldDry.connect(this.master);
      // Щелчки интерфейса — своя громкость, не зависят от паузы и сна
      this.uiBus = ctx.createGain();
      this.uiBus.connect(this.master);
      this.white = this.makeNoise(2.5, false);
      this.brown = this.makeNoise(5, true);
      this.lx = this.lz = tw(MID);
      this.startAmbient();
      this.applyVolume();
    } catch (e) {
      this.ctx = null;
    }
  },

  setMuted(m) {
    this.muted = m;
    this.applyVolume();
  },

  // Громкость из настроек: общая и отдельно природа/существа
  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 0.6 * Settings.volMaster;
    const t = this.ctx.currentTime;
    this.world.gain.setTargetAtTime(this.level * Settings.volWorld, t, 0.1);
    this.worldDry.gain.setTargetAtTime(this.level * Settings.volWorld, t, 0.1);
    this.uiBus.gain.setTargetAtTime(Settings.volUI, t, 0.05);
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(Settings.volMusic, t, 0.1);
  },

  // Отклик интерфейса: тихий щелчок наведения, механический клик, шорох окна, вкладка, звон сохранения
  ui(kind) {
    if (!this.ctx || !this.uiBus) return;
    const d = this.uiBus, now = this.ctx.currentTime;
    if (kind === 'hover') {
      if (now - (this.hoverT || 0) < 0.06) return;
      this.hoverT = now;
      this.tone(1500, 0.025, { type: 'triangle', vol: 0.02, dest: d });
    } else if (kind === 'click') {
      this.noise(0.03, { vol: 0.1, freq: 2600, type: 'bandpass', q: 3, dest: d });
      this.tone(640, 0.06, { type: 'square', vol: 0.025, to: 430, dest: d });
    } else if (kind === 'open') {
      this.noise(0.22, { vol: 0.07, freq: 720, type: 'bandpass', q: 1.2, attack: 0.07, dest: d });
      this.tone(220, 0.15, { type: 'triangle', vol: 0.035, to: 330, dest: d });
    } else if (kind === 'close') {
      this.noise(0.16, { vol: 0.05, freq: 520, type: 'bandpass', q: 1.2, attack: 0.02, dest: d });
      this.tone(310, 0.12, { type: 'triangle', vol: 0.03, to: 190, dest: d });
    } else if (kind === 'tab') {
      this.tone(980, 0.04, { type: 'triangle', vol: 0.035, dest: d });
    } else if (kind === 'save') {
      this.tone(660, 0.12, { type: 'triangle', vol: 0.05, dest: d });
      this.tone(990, 0.22, { type: 'triangle', vol: 0.05, delay: 0.1, dest: d });
    } else if (kind === 'error') {
      this.tone(140, 0.14, { type: 'sawtooth', vol: 0.035, dest: d });
    } else if (kind === 'start') {
      // Новая игра: глухой удар — как Ящик, дёрнувшийся вверх
      this.noise(0.7, { vol: 0.14, freq: 240, brown: true, attack: 0.04, dest: d });
      this.tone(96, 0.8, { type: 'sine', vol: 0.09, to: 62, dest: d });
    }
  },

  // Громкость фона: 0 — пауза и меню, меньше 1 — сон
  idle(level) {
    if (!this.ctx || this.level === level) return;
    this.level = level;
    const t = this.ctx.currentTime;
    this.world.gain.setTargetAtTime(level * Settings.volWorld, t, 0.3);
    this.worldDry.gain.setTargetAtTime(level * Settings.volWorld, t, 0.3);
  },

  // Гром: сухой треск, если близко, и долгий раскатистый гул
  thunder(delay, k) {
    if (!this.ctx) return;
    if (k > 0.7) this.noise(0.25, { vol: 0.5 * k, freq: 1800, type: 'highpass', attack: 0.003, delay, dest: this.worldDry });
    this.noise(4 + k * 2, { vol: 0.75 * k, freq: 110 + k * 90, brown: true, attack: 0.05 + (1 - k) * 0.4, delay: delay + 0.05, dest: this.world });
    this.tone(38, 3, { type: 'sawtooth', vol: 0.08 * k, to: 28, attack: 0.2, delay, dest: this.worldDry });
  },

  // Карканье вороны с её места
  caw(at) {
    if (!this.ctx) return;
    const dest = this.spot(at, { ref: 8, roll: 1, life: 3, bus: this.world });
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const d = i * 0.32;
      this.tone(620 + Math.random() * 80, 0.22, { type: 'sawtooth', vol: 0.09, to: 430, delay: d, attack: 0.02, dest });
      this.noise(0.2, { vol: 0.08, freq: 1400, type: 'bandpass', q: 2.5, delay: d, attack: 0.02, dest });
    }
    // Хлопанье крыльев
    for (let i = 0; i < 6; i++) this.noise(0.05, { vol: 0.07, freq: 700, type: 'bandpass', delay: 0.1 + i * 0.09, attack: 0.005, dest });
  },

  /* ---------- заготовки ---------- */

  makeNoise(dur, brown) {
    const rate = this.ctx.sampleRate, n = Math.floor(rate * dur);
    const buf = this.ctx.createBuffer(1, n, rate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  },

  // Отклик коридора: ранние отражения порхают между параллельными стенами (≈3.5 м → 20 мс),
  // потом хвост, в котором высокие частоты гаснут быстрее низких
  impulse(len, decay) {
    const rate = this.ctx.sampleRate, n = Math.floor(rate * len);
    const buf = this.ctx.createBuffer(2, n, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        const env = Math.pow(10, -3 * t / decay);
        lp += ((Math.random() * 2 - 1) - lp) * (0.12 + 0.8 * Math.exp(-t * 2.5));
        const flutter = t < 0.5 ? 1 + 1.6 * Math.pow(Math.max(0, Math.cos(t * Math.PI * 2 / 0.0205)), 8) * Math.exp(-t * 6) : 1;
        d[i] = lp * env * flutter * Math.min(1, t / 0.012);
      }
    }
    return buf;
  },

  // Шум из готового буфера с случайного места (буфер закольцован)
  play(buffer, t, dur, dest) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.connect(dest);
    s.start(t, Math.random() * buffer.duration);
    s.stop(t + dur + 0.05);
    return s;
  },

  place(p, x, y, z) {
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else p.setPosition(x, y, z);
  },

  panner(at, ref = 4, roll = 1.1, bus = this.out) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 1000;
    p.rolloffFactor = roll;
    if (at) this.place(p, at.x, at.y, at.z);
    p.connect(bus);
    return p;
  },

  // Временный источник в точке мира: отключается сам, когда звук отзвучал
  spot(at, { ref = 4, roll = 1.1, life = 4, bus = this.out } = {}) {
    const p = this.panner(at, ref, roll, bus);
    setTimeout(() => p.disconnect(), life * 1000);
    return p;
  },

  // Слушатель = камера: положение, взгляд и «верх»
  listen(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener, e = cam.matrixWorld.elements;
    const [x, y, z, fx, fy, fz, ux, uy, uz] = [e[12], e[13], e[14], -e[8], -e[9], -e[10], e[4], e[5], e[6]];
    this.lx = x;
    this.lz = z;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
    } else {
      L.setPosition(x, y, z);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  },

  tone(freq, dur, { type = 'sine', vol = 0.2, to = null, delay = 0, attack = 0.01, dest = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + Math.min(attack, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  noise(dur, { vol = 0.3, freq = 400, delay = 0, type = 'lowpass', q = 1, attack = null, brown = false, dest = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    const a = attack === null ? Math.min(0.3, dur * 0.2) : attack;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.play(brown ? this.brown : this.white, t, dur, f);
    f.connect(g).connect(dest || this.out);
  },

  /* ---------- шаги, предметы, интерфейс ---------- */

  // surface: 'grass' — трава, 'wood' — доски (дома, Башня, мостик), 'stone' — плиты Лабиринта
  step(vol = 1, surface = 'stone') {
    if (!this.ctx) return;
    if (surface === 'grass') {
      this.noise(0.09, { vol: 0.08 * vol, freq: 260 + Math.random() * 120, attack: 0.005 });
      this.noise(0.07, { vol: 0.016 * vol, freq: 3200 + Math.random() * 1500, type: 'bandpass', q: 0.8, attack: 0.01 });
    } else if (surface === 'wood') {
      this.tone(150 + Math.random() * 40, 0.07, { vol: 0.05 * vol, to: 110, attack: 0.003 });
      this.noise(0.06, { vol: 0.06 * vol, freq: 800 + Math.random() * 300, type: 'bandpass', q: 1.2, attack: 0.003 });
    } else {
      this.noise(0.07, { vol: 0.08 * vol, freq: 1300 + Math.random() * 500, type: 'bandpass', q: 1.1, attack: 0.003 });
      this.tone(95 + Math.random() * 30, 0.05, { vol: 0.035 * vol, attack: 0.003 });
    }
  },
  splash() {
    this.noise(0.18, { vol: 0.13, freq: 1700 + Math.random() * 600, type: 'bandpass', q: 0.8 });
    this.noise(0.12, { vol: 0.06, freq: 400 });
  },
  pickup() {
    [660, 880, 1320].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.18, delay: i * 0.08, dest: this.master }));
  },
  hit() {
    this.noise(0.35, { vol: 0.5, freq: 1800 });
    this.tone(180, 0.4, { type: 'sawtooth', vol: 0.25, to: 60 });
  },
  rumble(dur = 3) {
    this.noise(dur, { vol: 0.7, freq: 120, brown: true });
    this.noise(dur, { vol: 0.15, freq: 900, type: 'bandpass', q: 3 });
    this.tone(42, dur, { type: 'sawtooth', vol: 0.1, to: 33 });
  },
  clank() {
    this.tone(220, 0.15, { type: 'square', vol: 0.08, to: 110 });
    this.noise(0.12, { vol: 0.25, freq: 2500 });
  },
  heartbeat(vol) {
    this.tone(62, 0.18, { vol: vol * 0.5, to: 40, dest: this.master });
    this.tone(56, 0.16, { vol: vol * 0.4, to: 38, delay: 0.22, dest: this.master });
  },
  exitOpen() {
    this.tone(330, 0.7, { type: 'triangle', vol: 0.2, dest: this.master });
    this.tone(495, 0.9, { type: 'triangle', vol: 0.16, delay: 0.2, dest: this.master });
    this.tone(660, 1.2, { type: 'triangle', vol: 0.12, delay: 0.4, dest: this.master });
  },
  // Подъём Ящика: глухой гул шахты, вой мотора лебёдки, дребезг цепи, скрип блоков; stopLift обрывает его при пропуске.
  // Слышно и в динамиках ноутбука: кроме гула, всё лежит в полосе 300 Гц – 4 кГц
  liftRise(dur) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime, g = ctx.createGain();
    g.connect(this.out);
    this.liftGain = g;
    this.noise(dur, { vol: 0.24, freq: 130, brown: true, dest: g, attack: 1.2 });
    this.noise(dur, { vol: 0.09, freq: 1100, type: 'bandpass', q: 5, dest: g, attack: 1.5 });
    this.tone(46, dur, { type: 'sawtooth', vol: 0.05, to: 58, dest: g, attack: 2 });
    // Мотор: обороты растут к середине подъёма и падают к остановке, гудит с лёгким биением
    const motor = ctx.createOscillator(), wob = ctx.createOscillator(), wobG = ctx.createGain(), bp = ctx.createBiquadFilter(), mg = ctx.createGain();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(62, t0);
    motor.frequency.linearRampToValueAtTime(112, t0 + dur * 0.5);
    motor.frequency.linearRampToValueAtTime(70, t0 + dur);
    wob.frequency.value = 6.5;
    wobG.gain.value = 2.5;
    wob.connect(wobG).connect(motor.frequency);
    bp.type = 'bandpass';
    bp.frequency.value = 560;
    bp.Q.value = 1.3;
    mg.gain.setValueAtTime(0.0001, t0);
    mg.gain.exponentialRampToValueAtTime(0.3, t0 + 1.8);
    mg.gain.setValueAtTime(0.3, t0 + dur - 1.2);
    mg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    motor.connect(bp).connect(mg).connect(g);
    motor.start(t0); motor.stop(t0 + dur + 0.1);
    wob.start(t0); wob.stop(t0 + dur + 0.1);
    // Цепь: частые металлические щелчки, то гуще, то реже
    for (let k = 0.6; k < dur - 0.4; k += 0.06 + Math.random() * 0.07) {
      const swell = 0.45 + 0.55 * Math.sin(k * 1.3) ** 2, edge = Math.min(1, k / 2, (dur - k) / 1.5);
      this.noise(0.025, { vol: 0.1 * swell * edge * (Math.random() < 0.12 ? 2.2 : 1), freq: 2200 + Math.random() * 2200, type: 'bandpass', q: 5, attack: 0.002, delay: k, dest: g });
    }
    // Блоки и тросы: редкий протяжный металлический скрип
    for (let k = 1.5 + Math.random() * 2; k < dur - 1; k += 2.2 + Math.random() * 3) {
      const f = 1300 + Math.random() * 900;
      this.tone(f, 0.5 + Math.random() * 0.5, { type: 'triangle', vol: 0.06, to: f * (0.82 + Math.random() * 0.1), attack: 0.08, delay: k, dest: g });
    }
  },
  stopLift() {
    if (!this.liftGain) return;
    this.liftGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    this.liftGain = null;
  },
  // Стык направляющих: клетка переваливает через него — двойной лязг
  liftJoint() {
    if (!this.ctx) return;
    for (const [d, k] of [[0, 1], [0.13, 0.7]]) {
      this.noise(0.06, { vol: 0.38 * k, freq: 1500, type: 'bandpass', q: 2.5, attack: 0.002, delay: d });
      this.tone(300, 0.12, { type: 'square', vol: 0.08 * k, to: 150, delay: d });
    }
  },
  // Остановка: визг тормоза, удар, клетка оседает на упоры
  liftStop() {
    if (!this.ctx) return;
    this.noise(0.9, { vol: 0.22, freq: 2900, type: 'bandpass', q: 9, attack: 0.03 });
    this.tone(2350, 0.8, { type: 'triangle', vol: 0.07, to: 1900, attack: 0.03 });
    this.thud(this.out, 1, 0.55);
    this.clank();
    this.noise(0.15, { vol: 0.2, freq: 1800, type: 'bandpass', q: 2, attack: 0.002, delay: 0.95 });
  },
  // Дверь дома: открывается — щёлкает щеколда и скрипят петли; закрывается — глухой хлопок досок
  door(open, at) {
    if (!this.ctx) return;
    const p = this.spot(at, { ref: 3, roll: 1.4, life: 3 });
    this.noise(0.03, { vol: 0.16, freq: 2600, type: 'bandpass', q: 3, attack: 0.002, dest: p });
    if (open) {
      const f = 380 + Math.random() * 120;
      this.tone(f, 0.55, { type: 'sawtooth', vol: 0.025, to: f * 1.6, attack: 0.06, delay: 0.05, dest: p });
      this.tone(f * 2.1, 0.4, { type: 'triangle', vol: 0.02, to: f * 2.9, attack: 0.05, delay: 0.12, dest: p });
    } else {
      this.tone(95, 0.25, { vol: 0.22, to: 55, attack: 0.004, dest: p });
      this.noise(0.18, { vol: 0.2, freq: 700, attack: 0.003, dest: p });
      this.noise(0.03, { vol: 0.12, freq: 3000, type: 'bandpass', q: 3, attack: 0.002, delay: 0.09, dest: p });
    }
  },
  boxArrives() {
    if (!this.ctx) return;
    const p = this.spot({ x: tw(MID), y: -2, z: tw(MID) }, { ref: 6, roll: 1, life: 7 });
    this.grind(p, this.ctx.currentTime, 3.4, 0.6);
    this.noise(4, { vol: 0.3, freq: 220, brown: true, dest: p });
    [0, 0.6, 1.2, 1.8, 2.4, 3.0].forEach(d => this.tone(140, 0.2, { type: 'square', vol: 0.05, delay: d, dest: p }));
    [0, 0.45, 0.9].forEach(d => this.tone(880, 0.3, { type: 'triangle', vol: 0.09, delay: 3.4 + d, dest: p }));
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.2, delay: i * 0.15, dest: this.master }));
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.6, { type: 'sawtooth', vol: 0.1, delay: i * 0.2, dest: this.master }));
  },

  /* ---------- ворота и стены ---------- */

  // Камень по камню: шум в узкой полосе, громкость дёргается (створка то цепляет, то проскальзывает),
  // под ним низкий скрежет, сверху скрип металла и щелчки храповика
  grind(dest, t0, dur, vol = 1) {
    const ctx = this.ctx, n = Math.max(8, Math.ceil(dur * 16)), curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = vol * 0.55 * Math.min(1, i / 5, (n - 1 - i) / 6) * (0.3 + 0.7 * Math.random() ** 2);
    const bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(360, t0);
    bp.frequency.linearRampToValueAtTime(520, t0 + dur);
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(curve, t0, dur);
    this.play(this.white, t0, dur, bp);
    bp.connect(g).connect(dest);
    const lp = ctx.createBiquadFilter(), g2 = ctx.createGain();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    g2.gain.value = 0;
    g2.gain.setValueCurveAtTime(curve.map(v => Math.min(1, v * 2.2)), t0, dur);
    this.play(this.brown, t0, dur, lp);
    lp.connect(g2).connect(dest);
    const o = ctx.createOscillator(), rf = ctx.createBiquadFilter(), g3 = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(130, t0);
    for (let k = 1; k <= Math.floor(dur * 2); k++) o.frequency.linearRampToValueAtTime(110 + Math.random() * 100, t0 + k * 0.5);
    rf.type = 'bandpass';
    rf.frequency.value = 1250;
    rf.Q.value = 14;
    g3.gain.value = 0;
    g3.gain.setValueCurveAtTime(curve.map(v => v * 0.09), t0, dur);
    o.connect(rf).connect(g3).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    const lag = t0 - ctx.currentTime;
    for (let k = 0.3; k < dur - 0.2; k += 0.3 + Math.random() * 0.3) {
      this.noise(0.035, { vol: 0.1 * vol, freq: 2600, type: 'bandpass', q: 2, attack: 0.002, delay: lag + k, dest });
    }
  },

  // Тяжёлый удар камня о камень
  thud(dest, k = 1, delay = 0) {
    this.tone(58, 1.2, { vol: 0.45 * k, to: 30, delay, attack: 0.005, dest });
    this.noise(0.45, { vol: 0.5 * k, freq: 650, attack: 0.004, delay, dest });
    this.noise(0.16, { vol: 0.2 * k, freq: 2200, type: 'bandpass', q: 1.5, attack: 0.003, delay: delay + 0.04, dest });
  },

  // Створки всех ворот ползут: у каждых свой скрежет со своей стороны, под ногами общий гул
  gates(closing, dur = 5) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    this.noise(dur + 1.2, { vol: 0.5, freq: 85, brown: true, attack: 0.8 });
    this.tone(36, dur + 0.8, { type: 'sawtooth', vol: 0.05, to: 30, attack: 0.6 });
    for (const g of GATES) {
      const p = this.spot({ x: tw(g.x), y: 9, z: tw(g.y) }, { ref: 18, roll: 0.9, life: dur + 5 });
      if (!closing) this.thud(p, 0.6);          // утром сначала отходят засовы
      this.grind(p, t0 + (closing ? 0 : 0.4), dur);
    }
  },

  gateSlam() {
    if (!this.ctx) return;
    for (const g of GATES) this.thud(this.spot({ x: tw(g.x), y: 6, z: tw(g.y) }, { ref: 20, roll: 0.9, life: 6 }));
    this.tone(32, 2.2, { vol: 0.3, to: 24, attack: 0.01 });
  },

  // Ночью где-то в Лабиринте переезжают целые секции стен
  wallShift(points) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    this.noise(5.5, { vol: 0.6, freq: 75, brown: true, attack: 1 });
    this.tone(30, 5, { type: 'sawtooth', vol: 0.06, to: 26, attack: 0.8 });
    for (const at of points) {
      const p = this.spot(at, { ref: 30, roll: 0.8, life: 9, bus: this.world });
      this.grind(p, t0 + 0.2, 4.5, 1.2);
      this.thud(p, 0.8, 4.6);
    }
  },

  /* ---------- гриверы ---------- */

  // Голос гривера: низкий пилообразный гул мотора с дрожью и сиплое дыхание
  makeVoice() {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(null, 3, 1.25, this.world);
    // Всё, что издаёт гривер, идёт через фильтр: из-за закрытых ворот его слышно глухо
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 18000;
    lp.connect(p);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(lp);
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.value = 44;
    lfo.frequency.value = 4 + Math.random() * 3;
    lg.gain.value = 5;
    lfo.connect(lg).connect(o.frequency);
    f.type = 'bandpass';
    f.frequency.value = 260;
    f.Q.value = 2.5;
    o.connect(f).connect(gain);
    const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain(), br = ctx.createOscillator(), bg = ctx.createGain();
    n.buffer = this.white;
    n.loop = true;
    nf.type = 'bandpass';
    nf.frequency.value = 850;
    nf.Q.value = 1.4;
    ng.gain.value = 0.5;
    br.frequency.value = 0.35 + Math.random() * 0.2;
    bg.gain.value = 0.45;
    br.connect(bg).connect(ng.gain);
    n.connect(nf).connect(ng).connect(gain);
    o.start(t);
    lfo.start(t);
    br.start(t);
    n.start(t, Math.random() * 2);
    return { p, lp, gain, o, f, srcs: [o, lfo, br, n], moanT: 1 + Math.random() * 4, clickT: 0, scrapeT: 2 };
  },

  dropVoice(v) {
    const t = this.ctx.currentTime;
    v.gain.gain.setTargetAtTime(0, t, 0.15);
    for (const s of v.srcs) s.stop(t + 0.8);
    setTimeout(() => v.p.disconnect(), 1200);
  },

  clearVoices() {
    if (!this.ctx) return;
    for (const v of this.voices.values()) this.dropVoice(v);
    this.voices.clear();
  },

  // Стон: пилообразный тон через две «гласные» полосы, высота сползает вниз
  moan(dest, angry) {
    const ctx = this.ctx, t = ctx.currentTime, d = 1.2 + Math.random() * 1.2, f0 = angry ? 105 + Math.random() * 20 : 70 + Math.random() * 20;
    const o = ctx.createOscillator(), vib = ctx.createOscillator(), vg = ctx.createGain(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + d);
    vib.frequency.value = 7 + Math.random() * 4;
    vg.gain.value = f0 * 0.06;
    vib.connect(vg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(angry ? 0.5 : 0.32, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    for (const [fr, q] of [[520, 4], [1150, 6]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fr;
      bp.Q.value = q;
      o.connect(bp).connect(g);
    }
    g.connect(dest);
    o.start(t);
    vib.start(t);
    o.stop(t + d + 0.1);
    vib.stop(t + d + 0.1);
  },

  clickAt(dest) {
    this.tone(2400, 0.03, { type: 'square', vol: 0.12, attack: 0.002, dest });
    this.tone(1700, 0.03, { type: 'square', vol: 0.1, delay: 0.06, attack: 0.002, dest });
  },

  // Металл скребёт по камню
  scrape(dest) {
    const ctx = this.ctx, t = ctx.currentTime, d = 0.35 + Math.random() * 0.4;
    const bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(3400, t);
    bp.frequency.exponentialRampToValueAtTime(1700, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    this.play(this.white, t, d, bp);
    bp.connect(g).connect(dest);
  },

  // Визг, когда гривер заметил Томаса (at — где он; без него — просто громкость vol)
  screech(vol, at = null) {
    if (!this.ctx) return;
    const dest = at ? this.spot(at, { ref: 6, roll: 1, life: 4, bus: this.world }) : this.out, v = at ? 1 : vol;
    this.tone(1100, 0.9, { type: 'sawtooth', vol: v * 0.08, to: 380, dest });
    this.tone(1170, 0.85, { type: 'sawtooth', vol: v * 0.05, to: 330, delay: 0.03, dest });
    this.tone(1650, 0.7, { type: 'square', vol: v * 0.035, to: 520, delay: 0.05, dest });
    this.noise(0.8, { vol: v * 0.2, freq: 2400, type: 'bandpass', q: 2, dest });
    this.moan(dest, true);
  },

  // list: [{ g, x, y, z, moving, hunting, fade, muffled }] — голоса получают четыре ближних гривера
  updateGrievers(list, dt) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const near = list.filter(e => e.fade > 0.05).map(e => ({ ...e, d: Math.hypot(e.x - this.lx, e.z - this.lz) }))
      .filter(e => e.d < 75).sort((a, b) => a.d - b.d).slice(0, 4);
    const keep = new Set(near.map(e => e.g));
    for (const [g, v] of this.voices) {
      if (!keep.has(g)) {
        this.dropVoice(v);
        this.voices.delete(g);
      }
    }
    for (const e of near) {
      let v = this.voices.get(e.g);
      if (!v) {
        v = this.makeVoice();
        this.voices.set(e.g, v);
      }
      this.place(v.p, e.x, e.y, e.z);
      const loud = e.fade * (e.moving ? 1 : 0.5) * (e.hunting ? 1.5 : 1);
      v.gain.gain.setTargetAtTime(0.35 * loud, now, 0.25);
      v.o.frequency.setTargetAtTime(e.hunting ? 64 : 44, now, 0.4);
      v.f.frequency.setTargetAtTime(e.hunting ? 480 : 260, now, 0.4);
      v.lp.frequency.setTargetAtTime(e.muffled ? 550 : 18000, now, 0.3);
      v.moanT -= dt;
      v.clickT -= dt;
      v.scrapeT -= dt;
      if (v.moanT <= 0) {
        v.moanT = (e.hunting ? 2.5 : 5) + Math.random() * 6;
        this.moan(v.lp, e.hunting);
      }
      if (e.d < 40 && v.clickT <= 0) {
        v.clickT = 0.18 + e.d * 0.012 + Math.random() * 0.1;
        this.clickAt(v.lp);
      }
      if (e.moving && v.scrapeT <= 0) {
        v.scrapeT = 1.5 + Math.random() * 3;
        this.scrape(v.lp);
      }
    }
  },

  // Далёкий вой гривера где-то в Лабиринте
  howl() {
    const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 60;
    const p = this.spot({ x: this.lx + Math.cos(a) * r, y: 6, z: this.lz + Math.sin(a) * r }, { ref: 25, roll: 1, life: 7, bus: this.world });
    const ctx = this.ctx, t = ctx.currentTime, d = 2.4 + Math.random() * 1.5, f = 240 + Math.random() * 120;
    for (const det of [1, 1.013, 1.5]) {
      const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * det * 0.8, t);
      o.frequency.linearRampToValueAtTime(f * det * 1.3, t + d * 0.35);
      o.frequency.linearRampToValueAtTime(f * det * 0.7, t + d);
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 5;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(det === 1.5 ? 0.04 : 0.12, t + d * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(bp).connect(g).connect(p);
      o.start(t);
      o.stop(t + d + 0.1);
    }
    for (let i = 0; i < 10; i++) this.tone(1800 + Math.random() * 600, 0.025, { type: 'square', vol: 0.05, delay: d * 0.8 + i * 0.07, attack: 0.002, dest: p });
  },

  // Лабиринт живёт: вдалеке скрежещет камень или лязгает металл
  mazeCreak() {
    const a = Math.random() * Math.PI * 2, r = 35 + Math.random() * 50;
    const p = this.spot({ x: this.lx + Math.cos(a) * r, y: 10, z: this.lz + Math.sin(a) * r }, { ref: 15, roll: 1, life: 5, bus: this.world });
    if (Math.random() < 0.6) this.grind(p, this.ctx.currentTime, 1.2 + Math.random() * 1.5, 0.5);
    else {
      [430, 610, 1170].forEach(f => this.tone(f * (0.95 + Math.random() * 0.1), 1.6, { type: 'triangle', vol: 0.05, attack: 0.004, dest: p }));
      this.noise(0.12, { vol: 0.2, freq: 1500, type: 'bandpass', attack: 0.004, dest: p });
    }
  },

  /* ---------- жители и живность ---------- */

  // Звук работы в такт анимации: молот по наковальне, топор по полену, мотыга, шаги рядом
  work(kind, x, y, z) {
    if (!this.ctx) return;
    const dest = this.spot({ x, y: y + 1, z }, { ref: 3, roll: 1.2, life: 2, bus: this.world });
    if (kind === 'hammer') {
      for (const [f, v, d] of [[1250, 0.07, 0.5], [2830, 0.05, 0.35], [4370, 0.03, 0.22]]) this.tone(f * (0.98 + Math.random() * 0.04), d, { vol: v, attack: 0.002, dest });
      this.noise(0.03, { vol: 0.16, freq: 3500, type: 'bandpass', attack: 0.002, dest });
    } else if (kind === 'chop') {
      this.tone(150 + Math.random() * 30, 0.12, { vol: 0.14, to: 85, attack: 0.003, dest });
      this.noise(0.09, { vol: 0.2, freq: 900, attack: 0.003, dest });
      this.noise(0.05, { vol: 0.08, freq: 2400, type: 'highpass', attack: 0.002, delay: 0.01, dest });
    } else if (kind === 'hoe') {
      this.noise(0.14, { vol: 0.12, freq: 550, attack: 0.005, dest });
      this.noise(0.08, { vol: 0.04, freq: 1600, type: 'bandpass', delay: 0.03, dest });
    } else {
      this.noise(0.07, { vol: 0.035, freq: 320, attack: 0.004, dest });
    }
  },

  bird(at) {
    const dest = this.spot(at, { ref: 6, roll: 1, life: 3, bus: this.world }), kind = Math.random();
    if (kind < 0.4) {                    // щебет: несколько быстрых взлётов тона
      const f = 2300 + Math.random() * 1600;
      for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) this.tone(f + Math.random() * 300, 0.07, { vol: 0.06, to: f * (1.25 + Math.random() * 0.3), delay: i * 0.1, dest });
    } else if (kind < 0.7) {             // свист в две ноты
      const f = 1900 + Math.random() * 900;
      this.tone(f, 0.22, { vol: 0.05, to: f * 1.18, attack: 0.03, dest });
      this.tone(f * 0.84, 0.3, { vol: 0.045, to: f * 0.8, delay: 0.26, attack: 0.03, dest });
    } else {                             // трель
      const f = 3200 + Math.random() * 1200;
      for (let i = 0, n = 8 + Math.floor(Math.random() * 8); i < n; i++) this.tone(f * (1 + (i % 2) * 0.06), 0.035, { type: 'triangle', vol: 0.035, delay: i * 0.055, attack: 0.004, dest });
    }
  },

  cricket(at) {
    const dest = this.spot(at, { ref: 2, roll: 1.3, life: 2, bus: this.world }), f = 4300 + Math.random() * 400;
    for (let i = 0, n = 3 + Math.floor(Math.random() * 4); i < n; i++) this.tone(f, 0.025, { type: 'triangle', vol: 0.03, delay: i * 0.045, attack: 0.003, dest });
  },

  owl(at) {
    const dest = this.spot(at, { ref: 8, roll: 0.9, life: 4, bus: this.world }), f = 360 + Math.random() * 60;
    for (const [d, len] of [[0, 0.5], [0.75, 0.28], [1.1, 0.42]]) {
      this.tone(f, len, { vol: 0.09, to: f * 0.9, delay: d, attack: 0.08, dest });
      this.tone(f * 2, len, { vol: 0.012, to: f * 1.8, delay: d, attack: 0.08, dest });
    }
  },

  // Свиньи в загоне у Живодерни похрюкивают
  grunt(at) {
    const ctx = this.ctx, p = this.spot(at, { ref: 4, roll: 1.2, life: 2, bus: this.world }), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.connect(p);
    setTimeout(() => lp.disconnect(), 2000);
    for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
      const d = i * 0.22;
      this.tone(95 + Math.random() * 30, 0.16, { type: 'sawtooth', vol: 0.06, to: 70, delay: d, attack: 0.02, dest: lp });
      this.noise(0.15, { vol: 0.08, freq: 500, type: 'bandpass', q: 2, delay: d, attack: 0.02, dest: lp });
    }
  },

  // Пузырёк ручья: короткий тон, который быстро взлетает вверх и гаснет (так звенит вода между камнями);
  // big — бульканье: ниже и громче
  riverBubble(dest, delay = 0, big = 1) {
    const ctx = this.ctx, t = ctx.currentTime + 0.03 + delay, r = Math.random();
    const f = (big > 1 ? 260 + r * 500 : 420 + r * r * 1500), len = (big > 1 ? 0.06 : 0.025) + Math.random() * 0.05;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * (1.4 + Math.random() * 0.8), t + len);
    const vol = (0.024 + Math.random() * Math.random() * 0.12) * big;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + len + 0.02);
  },

  /* ---------- фон: ветер, гул Лабиринта, костёр, река, птицы, сверчки, дыхание ---------- */

  startAmbient() {
    if (!this.ctx || this.amb) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const loop = (buf, type, freq, q, dest) => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = buf;
      s.loop = true;
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      g.gain.value = 0;
      s.connect(f).connect(g).connect(dest);
      s.start(t, Math.random() * buf.duration);
      return { f, g };
    };
    const fx = tw(LAYOUT.campfire.x), fz = tw(LAYOUT.campfire.y);
    const fireP = this.panner({ x: fx, y: groundH(fx, fz) + 0.6, z: fz }, 2.5, 1.3, this.world);
    const riverP = this.panner(null, 4, 1.1, this.world);
    // Ночной гул Лабиринта: два почти одинаковых низких тона «бьются» друг о друга
    const drone = ctx.createGain();
    drone.gain.value = 0;
    drone.connect(this.world);
    for (const [type, f, v] of [['sine', 55, 0.5], ['sine', 55.4, 0.5], ['triangle', 82.5, 0.25], ['sine', 116.6, 0.12]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.value = v;
      o.connect(g).connect(drone);
      o.start(t);
    }
    loop(this.brown, 'lowpass', 140, 0.7, drone).g.gain.value = 0.6;
    this.amb = {
      wind: loop(this.brown, 'lowpass', 380, 0.5, this.worldDry),
      whistle: loop(this.white, 'bandpass', 900, 9, this.worldDry),
      whistle2: loop(this.white, 'bandpass', 1350, 12, this.worldDry),
      leaves: loop(this.white, 'bandpass', 4200, 0.7, this.worldDry),
      fire: loop(this.brown, 'bandpass', 420, 0.8, fireP),
      // Гул костра: низкое «дыхание» пламени, порывами
      roar: loop(this.brown, 'lowpass', 230, 0.6, fireP),
      // Факел в руке — тихий трепет пламени у самого уха
      torch: loop(this.brown, 'bandpass', 520, 1.2, this.worldDry),
      // Река — неглубокий ручей, не море: тихий светлый шелест и мягкое течение, а поверх — журчание (riverBubble)
      river: loop(this.white, 'bandpass', 2400, 0.6, riverP),
      river2: loop(this.brown, 'lowpass', 520, 0.7, riverP),
      riverBus: (() => { const g = ctx.createGain(); g.gain.value = 0; g.connect(riverP); return g; })(),
      bubble: 0, gurgle: 2,
      rain: loop(this.white, 'highpass', 900, 0.5, this.worldDry),
      rain2: loop(this.white, 'bandpass', 3800, 0.8, this.worldDry),
      fireP, riverP, drone, t: 0, space: 0.2,
      bird: 2, cricket: 0.5, crackle: 0, pop: 3, hiss: 9, flare: 0.5, torchTick: 0.5, breath: 0, owl: 18, howl: 20, creak: 9, grunt: 8,
    };
  },

  // s: { glade, indoor, night, height (м над землёй), gust 0..1, trees 0..1, fire (м до костра),
  //      stamina, river { x, y, z, d } | null, pen { x, y, z, d } }
  updateAmbient(dt, s) {
    const a = this.amb;
    if (!a || !this.ctx) return;
    a.t += dt;
    const now = this.ctx.currentTime, set = (param, v, k = 0.35) => param.setTargetAtTime(v, now, k);
    const open = s.glade && !s.indoor, g = s.gust, high = Math.min(1, Math.max(0, s.height - 2) / 10);
    // Пространство: в коридорах длинный хвост и эхо стен, в Глэйде — слабое отражение, в доме — сухо
    const space = s.glade ? (s.indoor ? 0.04 : 0.14) : 1;
    a.space += (space - a.space) * Math.min(1, dt * 1.2);
    set(this.verbSend.gain, 0.05 + a.space * 0.42, 0.4);
    set(this.echoSend.gain, a.space * 0.3 + (open ? 0.04 : 0), 0.4);
    // Ветер: те же порывы, что качают траву и листву; на Башне дует сильнее
    const shelter = s.indoor ? 0.2 : s.glade ? 1 : 0.6;
    set(a.wind.g.gain, (0.05 + 0.16 * g) * shelter * (1 + high * 1.6));
    set(a.wind.f.frequency, 240 + 300 * g + high * 260, 0.6);
    // В узких проходах ветер воет на порывах (узкая полоса шума тихая сама по себе, отсюда большой множитель)
    const howlK = s.indoor ? 0 : s.glade ? 0.12 + high * 0.7 : 1;
    set(a.whistle.g.gain, howlK * 0.7 * g * g, 0.5);
    set(a.whistle.f.frequency, 650 + 520 * g + 140 * Math.sin(a.t * 0.37), 0.9);
    set(a.whistle2.g.gain, howlK * 0.45 * Math.max(0, g - 0.35), 0.6);
    set(a.whistle2.f.frequency, 1100 + 420 * g + 100 * Math.sin(a.t * 0.23 + 1), 0.9);
    set(a.leaves.g.gain, open ? (0.016 + 0.08 * g) * (0.4 + 0.6 * s.trees) : 0, 0.3);
    set(a.drone.gain, s.night ? (s.glade ? 0.018 : 0.07) : (s.glade ? 0 : 0.015), 2);
    // Огонь дышит неровно: случайные вспышки (flare) поднимают гул и треск, потом спадают
    a.flare = Math.random() < dt * 0.6 ? Math.max(a.flare, 0.5 + Math.random() * 0.5) : a.flare * Math.exp(-dt * 1.3);
    const fl = 0.75 + 0.25 * Math.sin(a.t * 1.7) * Math.sin(a.t * 0.53 + 1) + a.flare * 0.5;
    set(a.fire.g.gain, s.fire < 60 ? 0.24 * fl : 0, 0.2);
    set(a.fire.f.frequency, 380 + a.flare * 160, 0.3);
    set(a.roar.g.gain, s.fire < 60 ? 0.32 * fl : 0, 0.25);
    const tk = 0.8 + 0.2 * Math.sin(a.t * 9.3) * Math.sin(a.t * 4.1);
    set(a.torch.g.gain, s.torch ? 0.045 * tk : 0, 0.15);
    // Дождь: шелест вокруг, в доме — глухой стук по крыше
    const rain = s.rain || 0;
    set(a.rain.g.gain, rain * (s.indoor ? 0.18 : 0.22), 0.6);
    set(a.rain.f.frequency, s.indoor ? 300 : 900, 0.3);
    set(a.rain2.g.gain, rain * (s.indoor ? 0.02 : 0.08), 0.6);
    if (s.river && s.river.d < 80) {
      this.place(a.riverP, s.river.x, s.river.y, s.river.z);
      // Шелест дышит неровно — течение то быстрее, то тише
      const flow = 0.75 + 0.15 * Math.sin(a.t * 0.9) + 0.1 * Math.sin(a.t * 2.3 + 1);
      set(a.river.g.gain, 0.16 * flow, 0.3);
      set(a.river2.g.gain, 0.1 * flow, 0.5);
      set(a.riverBus.gain, 1, 0.3);
      // Журчание: вода перекатывается через камни — частые короткие «пузырьки», иногда бульканье пачкой
      if (s.river.d < 45) {
        a.bubble -= dt;
        while (a.bubble <= 0) {
          a.bubble += 0.025 + Math.random() * 0.05;
          this.riverBubble(a.riverBus, Math.random() * 0.05);
        }
        a.gurgle -= dt;
        if (a.gurgle <= 0) {
          a.gurgle = 1.2 + Math.random() * 2.8;
          for (let k = 0, n = 3 + Math.floor(Math.random() * 5); k < n; k++) this.riverBubble(a.riverBus, k * (0.03 + Math.random() * 0.04), 1.6);
        }
      }
    } else {
      set(a.river.g.gain, 0, 0.5);
      set(a.river2.g.gain, 0, 0.5);
      set(a.riverBus.gain, 0, 0.5);
    }

    const around = (r0, r1, y0, y1) => {
      const ang = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
      return { x: this.lx + Math.cos(ang) * r, y: y0 + Math.random() * (y1 - y0), z: this.lz + Math.sin(ang) * r };
    };
    a.bird -= dt;
    if (a.bird <= 0) {
      a.bird = (s.glade ? 1.2 : 4) + Math.random() * 3.5;
      // В Глэйде птицы в кронах, из Лабиринта их слышно высоко над стенами
      if (!s.night && !s.indoor) this.bird(s.glade ? around(8, 35, 4, 10) : around(15, 40, 28, 34));
    }
    a.cricket -= dt;
    if (a.cricket <= 0) {
      a.cricket = 0.25 + Math.random() * 0.7;
      if (s.night && s.glade) this.cricket(around(3, 18, 0, 0.3));
    }
    a.owl -= dt;
    if (a.owl <= 0) {
      a.owl = 18 + Math.random() * 25;
      if (s.night && s.glade) this.owl(around(25, 55, 6, 12));
    }
    a.howl -= dt;
    if (a.howl <= 0) {
      a.howl = (s.glade ? 22 : 12) + Math.random() * 20;
      if (s.night) this.howl();
    }
    a.creak -= dt;
    if (a.creak <= 0) {
      a.creak = 9 + Math.random() * 16;
      if (!s.glade) this.mazeCreak();
    }
    if (s.pen && s.pen.d < 40 && !s.night) {
      a.grunt -= dt;
      if (a.grunt <= 0) {
        a.grunt = 5 + Math.random() * 9;
        this.grunt(s.pen);
      }
    }
    if (s.fire < 25) {
      // Треск: мелкие щелчки пачками (то громче, то тише), изредка — хлопок смолы с осыпью щелчков и шипение сырого полена
      a.crackle -= dt * (1 + a.flare * 2);
      if (a.crackle <= 0) {
        a.crackle = Math.random() < 0.3 ? 0.015 + Math.random() * 0.04 : 0.06 + Math.random() * 0.3;
        const v = 0.05 + Math.pow(Math.random(), 3) * 0.3;
        this.noise(0.006 + Math.random() * 0.018, { vol: v, freq: 2200 + Math.random() * 4500, type: 'highpass', attack: 0.001, dest: a.fireP });
      }
      a.pop -= dt;
      if (a.pop <= 0) {
        a.pop = 1.5 + Math.random() * 5;
        this.noise(0.06, { vol: 0.32, freq: 800 + Math.random() * 900, type: 'bandpass', q: 1.6, attack: 0.001, dest: a.fireP });
        this.noise(0.02, { vol: 0.25, freq: 3500, type: 'highpass', attack: 0.001, dest: a.fireP });
        for (let i = 0; i < 3; i++) this.noise(0.01, { vol: 0.1, freq: 4000 + Math.random() * 3000, type: 'highpass', attack: 0.001, delay: 0.04 + Math.random() * 0.25, dest: a.fireP });
      }
      a.hiss -= dt;
      if (a.hiss <= 0) {
        a.hiss = 7 + Math.random() * 12;
        this.noise(0.6 + Math.random() * 1.2, { vol: 0.035, freq: 5500, type: 'highpass', attack: 0.25, dest: a.fireP });
      }
    }
    if (s.torch) {
      a.torchTick -= dt;
      if (a.torchTick <= 0) {
        a.torchTick = 0.15 + Math.random() * 0.9;
        this.noise(0.008, { vol: 0.03 + Math.random() * 0.05, freq: 3000 + Math.random() * 3000, type: 'highpass', attack: 0.001, dest: this.worldDry });
      }
    }
    if (s.stamina < 40) {
      a.breath -= dt;
      if (a.breath <= 0) {
        a.breath = 0.55 + s.stamina / 80;
        this.noise(0.35, { vol: 0.07 * (1 - s.stamina / 40), freq: 1100, type: 'bandpass', q: 1.5, dest: this.master });
      }
    }
  },
};
