// Музыка вступления: синтез Web Audio, без файлов. Своя тема в ре-миноре, расписана по таймингу Ящика (intro.js):
// в шахте — гул, удары как сердце, тиканье, нарастание к остановке; створки открываются — светлый аккорд;
// облёт Глэйда — тема с мелодией, в конце она затихает, когда управление переходит к Томасу.
// Громкость — «Музыка» в настройках звука. Пропуск вступления гасит её за секунду.

const NOTE = { D1: 36.71, A1: 55, D2: 73.42, F2: 87.31, G2: 98, A2: 110, Bb2: 116.54, C3: 130.81, D3: 146.83, E3: 164.81,
  F3: 174.61, G3: 196, A3: 220, Bb3: 233.08, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440,
  Bb4: 466.16, C5: 523.25, D5: 587.33, E5: 659.26, F5: 698.46, A5: 880 };

Object.assign(Sound, {
  // Шина музыки со своим мягким залом (не коридорное эхо мира)
  musicOut() {
    if (this.musicBus) return this.musicBus;
    const ctx = this.ctx, rate = ctx.sampleRate, n = Math.floor(rate * 3.6), ir = ctx.createBuffer(2, n, rate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.8) * Math.min(1, i / 300);
    }
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = Settings.volMusic;
    this.musicBus.connect(this.master);
    this.musicHall = ctx.createConvolver();
    this.musicHall.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.38;
    this.musicHall.connect(wet).connect(this.musicBus);
    return this.musicBus;
  },

  introMusic() {
    if (!this.ctx) return;
    this.stopIntroMusic(0);
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05, out = ctx.createGain();
    out.connect(this.musicOut());
    out.connect(this.musicHall);
    this.introGain = out;
    const at = s => t0 + s;
    const env = (g, t, a, hold, rel, peak) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + a + Math.max(0, hold));
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0, hold) + rel);
    };
    const osc = (type, f, t, stop, dest, det = 0) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = det;
      o.connect(dest); o.start(t); o.stop(stop);
      return o;
    };
    const pan = (p, dest) => { const s = ctx.createStereoPanner(); s.pan.value = p; s.connect(dest); return s; };
    // Струнная подложка: детюненые пилы через мягкий фильтр
    const pad = (s0, s1, notes, vol, cut = 1500, attack = 1, release = 1.4) => {
      const g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 0.6;
      f.connect(g).connect(out);
      env(g, at(s0), attack, s1 - s0 - attack, release, vol);
      notes.forEach((fr, i) => { for (const d of [-8, 7]) osc('sawtooth', fr, at(s0), at(s1 + release + 0.1), pan((i % 2 ? 0.4 : -0.4) + d / 50, f), d); });
    };
    const drone = (s0, s1, fr, vol) => {
      const g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 240;
      f.connect(g).connect(out);
      env(g, at(s0), 2, s1 - s0 - 2, 1.2, vol);
      osc('sine', fr, at(s0), at(s1 + 1.4), f);
      const sg = ctx.createGain();
      sg.gain.value = 0.4;
      sg.connect(f);
      osc('sawtooth', fr, at(s0), at(s1 + 1.4), sg);
    };
    // Барабан: тон с падением высоты и шлепок
    const drum = (s, k, fr = 60) => {
      const g = ctx.createGain(), o = osc('sine', fr * 2.2, at(s), at(s + 0.8), g);
      o.frequency.exponentialRampToValueAtTime(fr * 0.7, at(s + 0.4));
      env(g, at(s), 0.004, 0.02, 0.55, 0.5 * k);
      g.connect(out);
      this.noise(0.12, { vol: 0.3 * k, freq: 1100, type: 'bandpass', q: 0.8, attack: 0.002, delay: at(s) - ctx.currentTime, dest: out });
    };
    const tick = (s, k) => this.noise(0.03, { vol: 0.1 * k, freq: 3300, type: 'bandpass', q: 7, attack: 0.001, delay: at(s) - ctx.currentTime, dest: out });
    // Удар: суббас с падением и шумовой «бум»
    const boom = (s, k) => {
      const g = ctx.createGain(), o = osc('sine', 80, at(s), at(s + 2.6), g);
      o.frequency.exponentialRampToValueAtTime(28, at(s + 1.6));
      env(g, at(s), 0.006, 0.05, 2, 0.6 * k);
      g.connect(out);
      this.noise(1.1, { vol: 0.3 * k, freq: 700, attack: 0.003, delay: at(s) - ctx.currentTime, dest: out });
    };
    // Мягкая «медь»: низкие пилы, фильтр раскрывается и закрывается
    const brass = (s, len, k) => {
      const g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(150, at(s));
      f.frequency.exponentialRampToValueAtTime(1100, at(s + 0.4));
      f.frequency.exponentialRampToValueAtTime(240, at(s + len));
      env(g, at(s), 0.06, len * 0.4, len * 0.7, 0.2 * k);
      f.connect(g).connect(out);
      for (const [m, v] of [[1, 1], [2, 0.7], [3, 0.4]]) for (const d of [-10, 9]) {
        const vg = ctx.createGain();
        vg.gain.value = v;
        vg.connect(f);
        osc('sawtooth', NOTE.D1 * m, at(s), at(s + len * 1.2 + 0.2), vg, d);
      }
    };
    // Щипок и голос мелодии
    const pluck = (s, fr, k = 1, p = 0) => {
      const g = ctx.createGain();
      env(g, at(s), 0.004, 0.01, 0.55, 0.1 * k);
      g.connect(pan(p, out));
      osc('triangle', fr, at(s), at(s + 0.7), g);
    };
    const voice = (s, fr, len, k = 1) => {
      const g = ctx.createGain(), f = ctx.createBiquadFilter(), vib = ctx.createOscillator(), vg = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 2600;
      env(g, at(s), 0.09, len * 0.6, len * 0.7 + 0.3, 0.13 * k);
      f.connect(g).connect(out);
      vib.frequency.value = 5.2; vg.gain.value = fr * 0.006;
      vib.connect(vg);
      for (const [type, m, v] of [['triangle', 1, 1], ['sine', 2, 0.25]]) {
        const og = ctx.createGain();
        og.gain.value = v;
        og.connect(f);
        const o = osc(type, fr * m, at(s), at(s + len * 1.4 + 0.5), og);
        vg.connect(o.frequency);
      }
      vib.start(at(s)); vib.stop(at(s + len * 1.4 + 0.5));
    };
    // Колокольчик «музыкальной шкатулки»: негармоничные обертоны, долгое затухание
    const bell = (s, fr, k = 1) => {
      for (const [m, v, len] of [[1, 1, 2.6], [2.76, 0.35, 1.2], [5.4, 0.12, 0.6]]) {
        const g = ctx.createGain();
        env(g, at(s), 0.003, 0.01, len, 0.07 * k * v);
        g.connect(out);
        osc('sine', fr * m, at(s), at(s + len + 0.1), g);
      }
    };
    const riser = (s0, s1, k) => {
      const g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(300, at(s0));
      f.frequency.exponentialRampToValueAtTime(6000, at(s1));
      g.gain.setValueAtTime(0.0001, at(s0));
      g.gain.exponentialRampToValueAtTime(0.12 * k, at(s1) - 0.02);
      g.gain.linearRampToValueAtTime(0, at(s1));
      f.connect(g).connect(out);
      this.play(this.white, at(s0), s1 - s0, f);
    };

    // 1. Шахта: гул, удары-«сердце» всё чаще, тиканье, высокий тревожный тон
    drone(0.5, LIFT_STOP, NOTE.D1, 0.16);
    pad(4, LIFT_STOP - 0.2, [NOTE.D3, NOTE.A3], 0.03, 900, 3, 0.4);
    for (let s = 1.2, k = 0; s < LIFT_STOP - 0.6; k++) { drum(s, 0.55 + k * 0.03, 52); s += Math.max(0.55, 2 - k * 0.14); }
    for (let s = 8; s < LIFT_STOP - 0.2; s += 0.5) tick(s, 0.6 + (s - 8) * 0.05);
    voice(6, NOTE.A5, 8, 0.3);
    // Тема в шахте — редкие ноты шкатулки, к остановке всё чаще
    for (const [s, fr] of [[3.5, NOTE.D5], [5.6, NOTE.F5], [7.7, NOTE.E5], [9.6, NOTE.C5], [11.3, NOTE.D5], [12.7, NOTE.A4],
      [13.8, NOTE.F5], [14.7, NOTE.E5], [15.4, NOTE.D5], [15.9, NOTE.A5]]) bell(s, fr, 1);
    riser(LIFT_STOP - 1.6, LIFT_STOP, 1);
    boom(LIFT_STOP, 1);
    // 2. Створки открываются: свет — широкий аккорд ре-минора с ноной
    brass(LIFT_OPEN, 2.6, 1);
    pad(LIFT_OPEN, LIFT_FLY + 0.6, [NOTE.D3, NOTE.A3, NOTE.E4, NOTE.F4, NOTE.A4], 0.035, 1900, 0.9, 1.2);
    pluck(LIFT_OPEN + 0.9, NOTE.D5, 1); pluck(LIFT_OPEN + 1.2, NOTE.A4, 0.8); pluck(LIFT_OPEN + 1.5, NOTE.E5, 0.9);
    // 3. Облёт: Dm – B♭ – F – C – Dm – B♭ → Dm, по 2.4 с; щипки восьмыми, барабаны, тема
    const bars = [
      [NOTE.D2, NOTE.A2, NOTE.D3, NOTE.F3, NOTE.A3], [NOTE.Bb2, NOTE.F3, NOTE.Bb3, NOTE.D4], [NOTE.F2, NOTE.C3, NOTE.F3, NOTE.A3, NOTE.C4],
      [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4], [NOTE.D2, NOTE.A2, NOTE.D3, NOTE.F3, NOTE.A3], [NOTE.Bb2, NOTE.F3, NOTE.Bb3, NOTE.D4],
    ];
    const arps = [[NOTE.D4, NOTE.A3, NOTE.F4, NOTE.A3], [NOTE.D4, NOTE.Bb3, NOTE.F4, NOTE.Bb3], [NOTE.C4, NOTE.A3, NOTE.F4, NOTE.A3],
      [NOTE.C4, NOTE.G3, NOTE.E4, NOTE.G3], [NOTE.D4, NOTE.A3, NOTE.F4, NOTE.A3], [NOTE.D4, NOTE.Bb3, NOTE.F4, NOTE.Bb3]];
    const B0 = LIFT_FLY, BAR = 2.4;
    bars.forEach((ch, i) => {
      const s = B0 + i * BAR;
      pad(s, s + BAR, ch, 0.032 + i * 0.003, 1600 + i * 120, 0.5, 0.9);
      for (let j = 0; j < 8; j++) pluck(s + j * 0.3, arps[i][j % 4] * (j >= 4 ? 2 : 1), 0.8, j % 2 ? 0.35 : -0.35);   // вторая половина такта — октавой выше
      if (i >= 2) { drum(s, 0.75, 62); drum(s + 1.5, 0.45, 70); }
      if (i >= 4) drum(s + 0.9, 0.4, 82);
    });
    const melody = [
      [0, NOTE.D5, 1.2], [0.5, NOTE.A4, 1.2], [1, NOTE.Bb4, 1.2], [1.5, NOTE.A4, 1.2],
      [2, NOTE.A4, 0.6], [2.25, NOTE.C5, 0.6], [2.5, NOTE.F5, 1.2],
      [3, NOTE.E5, 0.6], [3.25, NOTE.D5, 0.6], [3.5, NOTE.C5, 0.6], [3.75, NOTE.G4, 0.6],
      [4, NOTE.A4, 0.6], [4.25, NOTE.D5, 0.6], [4.5, NOTE.F5, 0.6], [4.75, NOTE.E5, 0.6],
      [5, NOTE.D5, 0.6], [5.25, NOTE.F5, 0.6], [5.5, NOTE.D5, 1.4],
    ];
    for (const [bar, fr, len] of melody) voice(B0 + bar * BAR, fr, len, 1);
    // Развязка: Томас стоит у Ящика — аккорд и тихий удар, тема гаснет в звуках Глэйда
    const END = B0 + 6 * BAR;
    boom(END - 0.05, 0.45);
    pad(END, END + 2.5, [NOTE.D2, NOTE.A2, NOTE.D3, NOTE.F3, NOTE.A3, NOTE.D4], 0.04, 1700, 0.3, 3.2);
    voice(END, NOTE.D5, 2.2, 0.9);
    pluck(END + 0.3, NOTE.A4, 0.8); pluck(END + 0.6, NOTE.F4, 0.7); pluck(END + 0.9, NOTE.D4, 0.7);
  },

  // Гасит музыку вступления (пропуск, выход в меню); fade — секунды
  stopIntroMusic(fade = 1) {
    if (!this.introGain) return;
    const g = this.introGain, t = this.ctx.currentTime;
    this.introGain = null;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fade));
    setTimeout(() => g.disconnect(), (fade + 0.2) * 1000);
  },
});
