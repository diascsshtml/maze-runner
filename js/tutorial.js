// Обучение для новичка: подсказки по шагам в углу экрана. Шаг засчитывается, когда игрок это сделал.
// Пройденное обучение запоминается; выключается в настройках («Подсказки и обучение»).

const TUTORIAL_CLASSIC = [
  { text: 'Осмотрись: кликни по экрану и двигай мышью.', done: () => Tutorial.looked > 400 },
  { text: 'Иди: {forward}{left}{back}{right}. Рывок — {sprint}, прыжок — {jump}, следи за полоской сил.', done: () => Tutorial.walked > 8 },
  { text: 'Рядом с Ящиком лежит сумка. Подойди и нажми {action}.', done: () => Items.bag > 0 },
  { text: 'Поговори с Ньютом или Алби: подойди и нажми {action}.', done: () => Tutorial.flags.talk },
  { text: 'Открой журнал ({journal}): там задания, записки и снимки.', done: () => Tutorial.flags.journal },
  { text: 'Совет Глэйда ({glade}): запасы, стройка и улучшение домов.', done: () => Tutorial.flags.board },
  { text: 'Кузница — в северо-западном углу. Открой там мастерскую ({craft}) и сделай что-нибудь, например факел.', done: () => Tutorial.flags['craft-item'] },
  { text: 'Днём ворота открыты. Выйди в Лабиринт: ищи фрагменты кода, но вернись до заката!', done: () => Tutorial.flags.maze },
];

// Новая игра в пустом Глэйде: собрать материалы, сделать топор, заложить и построить костёр, выйти в Лабиринт
const TUTORIAL_SETTLE = [
  { text: 'Осмотрись: кликни по экрану и двигай мышью.', done: () => Tutorial.looked > 400 },
  { text: 'Иди: {forward}{left}{back}{right}. Рывок — {sprint}, прыжок — {jump}, следи за полоской сил.', done: () => Tutorial.walked > 8 },
  { text: 'У Ящика лежит сумка. Подойди и нажми {action}.', done: () => Items.bag > 0 },
  { text: 'Собери хворост: встань лицом к дереву и нажми {action}. Нужно 3 дерева.', done: () => Life.res.wood >= 3 || hasItem('axe') },
  { text: 'У кромки реки собери голыши ({action}). Нужно 2 камня.', done: () => Life.res.stone >= 2 || hasItem('axe') },
  { text: 'Открой ремесло ({craft}) и сделай топор — дрова пойдут вдвое быстрее.', done: () => hasItem('axe') || Tutorial.flags['craft-axe'] },
  { text: 'Открой Совет Глэйда ({glade}) и заложи костёр: дерево 6, камень 8.', done: () => !!Settle.sites.campfire || isBuilt('campfire') },
  { text: 'Работай на участке костра ({action}), пока он не будет готов. Молоток ускоряет стройку.', done: () => isBuilt('campfire') },
  { text: 'Днём ворота открыты. В Лабиринте лежат металлолом и фрагменты кода — но вернись до заката!', done: () => Tutorial.flags.maze },
  { text: 'Каждый пятый день Ящик привозит новичка. Строй спальни и столовую — дома ставь где хочешь: в Совете «Выбрать место», R — повернуть.', done: () => (Tutorial.lastT = (Tutorial.lastT || 0) + 1) > 900 },
];
const TUTORIAL_KEY = () => Settle.on ? 'maze-runner-tutorial-settle' : 'maze-runner-tutorial';
function tutorialSteps() { return Settle.on ? TUTORIAL_SETTLE : TUTORIAL_CLASSIC; }

const Tutorial = { step: 0, looked: 0, walked: 0, flags: {}, lastWalk: 0 };

Object.assign(Tutorial, {
  load() {
    try { Tutorial.step = +(localStorage.getItem(TUTORIAL_KEY()) || 0); } catch (e) { Tutorial.step = 0; }
  },
  save() {
    try { localStorage.setItem(TUTORIAL_KEY(), String(Tutorial.step)); } catch (e) { /* без сохранения */ }
  },
  restart() {
    Object.assign(Tutorial, { step: 0, looked: 0, walked: 0, flags: {} });
    Tutorial.save();
  },
  skip() {
    Tutorial.step = tutorialSteps().length;
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
    const s = tutorialSteps()[Tutorial.step];
    if (s && s.done()) {
      Tutorial.step++;
      Tutorial.save();
      Sound.tone(880, 0.12, { type: 'triangle', vol: 0.06, dest: Sound.master });
    }
    Tutorial.render();
  },
  render() {
    const box = $('tip');
    const s = tutorialSteps()[Tutorial.step];
    const show = !!s && Settings.hints && Game.state === 'play' && Game.intro <= 0 && !Lift.active;
    box.hidden = !show;
    if (!show) return;
    const text = s.text.replace(/\{(\w+)\}/g, (m, k) => keyLabel(Settings.keys[k]));
    if (box.dataset.text !== text) {
      box.dataset.text = text;
      $('tip-step').textContent = `Обучение · ${Tutorial.step + 1} из ${tutorialSteps().length}`;
      $('tip-text').textContent = text;
    }
  },
});
