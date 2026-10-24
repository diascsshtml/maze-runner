// Обучение для новичка: подсказки по шагам в углу экрана. Шаг засчитывается, когда игрок это сделал.
// Пройденное обучение запоминается; выключается в настройках («Подсказки и обучение»).

const TUTORIAL = [
  { text: 'Осмотрись: кликни по экрану и двигай мышью.', done: () => Tutorial.looked > 400 },
  { text: 'Иди: {forward}{left}{back}{right}. Рывок — {sprint}, прыжок — {jump}, следи за полоской сил.', done: () => Tutorial.walked > 8 },
  { text: 'Рядом с Ящиком лежит сумка. Подойди и нажми {action}.', done: () => Items.bag > 0 },
  { text: 'Поговори с Ньютом или Алби: подойди и нажми {action}.', done: () => Tutorial.flags.talk },
  { text: 'Открой журнал ({journal}): там задания, записки и снимки.', done: () => Tutorial.flags.journal },
  { text: 'Совет Глэйда ({glade}): запасы, стройка и улучшение домов.', done: () => Tutorial.flags.board },
  { text: 'Кузница — в северо-западном углу. Открой там мастерскую ({craft}) и сделай что-нибудь, например факел.', done: () => Tutorial.flags['craft-item'] },
  { text: 'Днём ворота открыты. Выйди в Лабиринт: ищи фрагменты кода, но вернись до заката!', done: () => Tutorial.flags.maze },
];

const Tutorial = { step: 0, looked: 0, walked: 0, flags: {}, lastWalk: 0 };

Object.assign(Tutorial, {
  load() {
    try { Tutorial.step = +(localStorage.getItem('maze-runner-tutorial') || 0); } catch (e) { Tutorial.step = 0; }
  },
  save() {
    try { localStorage.setItem('maze-runner-tutorial', String(Tutorial.step)); } catch (e) { /* без сохранения */ }
  },
  restart() {
    Object.assign(Tutorial, { step: 0, looked: 0, walked: 0, flags: {} });
    Tutorial.save();
  },
  skip() {
    Tutorial.step = TUTORIAL.length;
    Tutorial.save();
    Tutorial.render();
  },
  event(name) { Tutorial.flags[name] = true; },
  update() {
    const p = Game.player;
    if (!p) return;
    Tutorial.walked += Math.max(0, p.walk - Tutorial.lastWalk);
    Tutorial.lastWalk = p.walk;
    if (playerTile() !== T.GLADE) Tutorial.flags.maze = true;
    const s = TUTORIAL[Tutorial.step];
    if (s && s.done()) {
      Tutorial.step++;
      Tutorial.save();
      Sound.tone(880, 0.12, { type: 'triangle', vol: 0.06, dest: Sound.master });
    }
    Tutorial.render();
  },
  render() {
    const box = $('tip');
    const s = TUTORIAL[Tutorial.step];
    const show = !!s && Settings.hints && Game.state === 'play' && Game.intro <= 0;
    box.hidden = !show;
    if (!show) return;
    const text = s.text.replace(/\{(\w+)\}/g, (m, k) => keyLabel(Settings.keys[k]));
    if (box.dataset.text !== text) {
      box.dataset.text = text;
      $('tip-step').textContent = `Обучение · ${Tutorial.step + 1} из ${TUTORIAL.length}`;
      $('tip-text').textContent = text;
    }
  },
});
