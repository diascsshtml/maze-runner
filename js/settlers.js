// Новички. В поселении Ящик раз в пять дней привозит одного глэйдера — всего не больше 20 человек вместе с Томасом.
// Новичок растерян и ничего не помнит: стоит в Ящике, выходит, подходит к Томасу и говорит с ним, осматривает
// Глэйд — и тогда ему можно дать работу. У каждого свой характер, умения (с ними работа идёт в полтора раза быстрее)
// и первые слова. Ночью часть жителей спит в кроватях, стражи дежурят у ворот, остальные сидят у костра.

const ARRIVAL_ORDER = ['Алби', 'Ньют', 'Фрайпан', 'Уинстон', 'Галли', 'Зарт', 'Чак', 'Минхо', 'Джефф', 'Бен', 'Ник', 'Клинт',
  'Тереза', 'Стэн', 'Джек', 'Адам', 'Ли', 'Эрик', 'Сигги'];
const MAX_PEOPLE = 20;
const ARRIVAL_EVERY = 5;

// Работы: что даёт, какой инструмент в руке, что для неё нужно построить
const JOBS = {
  woodcutter: { name: 'Лесоруб', role: 'woodcutter', tool: 'axe', text: 'рубит лес — дерево, у колоды колет доски' },
  miner: { name: 'Каменотёс', role: 'miner', tool: 'hammer', text: 'колет валуны — камень' },
  carrier: { name: 'Водонос', role: 'carrier', text: 'носит воду из реки к Ящику' },
  builder: { name: 'Строитель', role: 'builder', tool: 'hammer', text: 'работает на стройках и улучшениях' },
  farmer: { name: 'Огородник', role: 'farmer', tool: 'hoe', text: 'еда и лён на ткань', need: 'plantations' },
  cook: { name: 'Повар', role: 'cook', tool: 'ladle', text: 'еды уходит меньше, готовит пайки', need: 'dining' },
  medjack: { name: 'Медак', role: 'medjackA', text: 'собирает травы, раненые встают быстрее', need: 'medhut' },
  smith: { name: 'Кузнец', role: 'smith', tool: 'hammer', text: 'добывает металл из старого лома', need: 'forge' },
  guard: { name: 'Страж', role: 'guard0', tool: 'spear', text: 'днём и ночью стережёт ворота' },
  runner: { name: 'Бегун', role: 'runner', text: 'днём бегает в Лабиринт, к вечеру сверяет карты', need: 'storage' },
};

// Характер, умения и первые слова каждого
const CHARACTERS = {
  'Алби': { trait: 'строгий и справедливый, первым берёт ответственность', skills: ['builder', 'guard'],
    arrive: ['Где я?.. Помню только имя — Алби.', 'Значит, ты тоже очнулся в этой клетке. Тогда держимся вместе — и устанавливаем правила.'] },
  'Ньют': { trait: 'спокойный и рассудительный, умеет мирить людей', skills: ['farmer', 'builder'],
    arrive: ['Тихо, тихо… Я Ньют. Кажется. Что это за стены?', 'Ладно. Паниковать будем потом. Покажи, что вы тут уже успели.'] },
  'Фрайпан': { trait: 'весёлый, без кухни жить не может', skills: ['cook', 'farmer'],
    arrive: ['Эй… а есть тут что-нибудь поесть? Я Фрайпан. Ну, так меня зовут, наверное.', 'Дайте мне котёл — и никто тут голодным не ляжет.'] },
  'Уинстон': { trait: 'неразговорчивый, но работящий', skills: ['woodcutter', 'miner'],
    arrive: ['…Уинстон. Больше ничего не помню.', 'Работу дашь — сделаю. Говорить не обязательно.'] },
  'Галли': { trait: 'упрямый и подозрительный, зато мастер на все руки', skills: ['builder', 'smith'],
    arrive: ['Отойди от меня! Кто ты такой? …Ладно. Я Галли.', 'Если тут надо строить — я построю. Но правила будут.'] },
  'Зарт': { trait: 'тихий, любит землю и всё, что растёт', skills: ['farmer', 'carrier'],
    arrive: ['Тут трава… настоящая. Я Зарт.', 'Если у нас будет огород, я за ним присмотрю.'] },
  'Чак': { trait: 'самый младший, добрый и болтливый', skills: ['carrier', 'cook'],
    arrive: ['Привет! Ой… а где мама? Я не помню… Я Чак!', 'А можно я буду с тобой? Я много чего умею. Ну, научусь.'] },
  'Минхо': { trait: 'быстрый, дерзкий, не любит сидеть на месте', skills: ['runner', 'guard'],
    arrive: ['Минхо. Не спрашивай, откуда я знаю, — просто знаю.', 'Эти стены не просто так стоят. Я хочу знать, что за ними.'] },
  'Джефф': { trait: 'аккуратный и внимательный', skills: ['medjack', 'cook'],
    arrive: ['У тебя кровь на руке… А, это не у тебя. Я Джефф.', 'Мне бы бинты и травы — я буду лечить.'] },
  'Бен': { trait: 'выносливый, но нервный', skills: ['runner', 'woodcutter'],
    arrive: ['Где… где выход? Тут должен быть выход! Я Бен.', 'Я могу бегать долго. Очень долго.'] },
  'Ник': { trait: 'силач, любит железо и огонь', skills: ['smith', 'miner'],
    arrive: ['Ник. Руки помнят молот — больше ничего.', 'Найдётся железо — сделаю что угодно.'] },
  'Клинт': { trait: 'терпеливый, руки никогда не дрожат', skills: ['medjack', 'farmer'],
    arrive: ['Спокойно. Я Клинт. Кто-нибудь ранен?', 'Если что — несите ко мне.'] },
  'Тереза': { trait: 'умная и решительная, будто что-то знает о Лабиринте', skills: ['runner', 'medjack'],
    arrive: ['Томас?.. Я тебя знаю. Не помню откуда — но знаю.', 'Это место… его кто-то сделал. И я, кажется, помогала.'] },
  'Стэн': { trait: 'простой и надёжный', skills: ['farmer', 'woodcutter'],
    arrive: ['Стэн. Где мы?', 'Ладно, где тут работа?'] },
  'Джек': { trait: 'ворчливый, но старательный', skills: ['farmer', 'carrier'],
    arrive: ['Только не толкайся. Джек.', 'Скажи, что делать, и не стой над душой.'] },
  'Адам': { trait: 'молчаливый и бдительный', skills: ['guard', 'miner'],
    arrive: ['…Адам.', 'Я посторожу. Ночью тут что-то кричит.'] },
  'Ли': { trait: 'внимательный, замечает всё', skills: ['guard', 'runner'],
    arrive: ['Ли. Стены двигаются — ты заметил?', 'Дай мне место на стене — я буду смотреть.'] },
  'Эрик': { trait: 'шутник, но в карауле не спит', skills: ['guard', 'builder'],
    arrive: ['О, комитет по встрече! Эрик. Вроде.', 'Шутки шутками, а ворота я покараулю.'] },
  'Сигги': { trait: 'большой и сильный, говорит мало', skills: ['woodcutter', 'miner'],
    arrive: ['Сигги. Есть хочу.', 'Брёвна носить? Могу.'] },
};

function jobBlocker(job) {
  const j = JOBS[job];
  if (j.need && !isBuilt(j.need)) return `сначала постройте: ${SETTLE_DEFS[j.need].name.toLowerCase()}`;
  return null;
}

function jobOf(n) {
  if (n.job) return n.job;
  const r = n.role || '';
  if (r.startsWith('guard')) return 'guard';
  if (r.startsWith('medjack')) return 'medjack';
  return Object.keys(JOBS).find(k => JOBS[k].role === r) || null;
}

function assignJob(n, job) {
  const j = JOBS[job];
  if (!j || jobBlocker(job)) return;
  let role = j.role;
  if (job === 'guard') role = 'guard' + (Game.npcs.filter(m => m !== n && (m.role || '').startsWith('guard')).length % 3);
  if (job === 'medjack') role = Game.npcs.some(m => m !== n && m.role === 'medjackA') ? 'medjackB' : 'medjackA';
  Object.assign(n, { role, job, tool: j.tool || null, fresh: null, target: null, linger: 0, path: null, repath: true });
  const ch = CHARACTERS[n.name];
  n.skill = ch && ch.skills.includes(job) ? 1.5 : 1;
  if (typeof refreshNpcTool === 'function') refreshNpcTool(n);
  toast(`${n.name} теперь ${j.name.toLowerCase()}${n.skill > 1 ? ' — это его дело, работа пойдёт быстрее' : ''}.`, 'good');
  Story.addTrust(n.name, 3, true);
}

/* ---------- прибытие ---------- */

function nextArrival() {
  const have = new Set(Game.npcs.map(n => n.name));
  return ARRIVAL_ORDER.find(name => !have.has(name));
}

// Утром каждого пятого дня Ящик поднимается с новичком (если в Глэйде есть место)
function settlersOnDay() {
  if (!Settle.on || Game.day % ARRIVAL_EVERY || Game.npcs.length + 1 >= MAX_PEOPLE || !nextArrival()) return;
  Settle.arrival = { name: nextArrival(), t: 9 };
}

function arrive(name) {
  const d = name === TERESA.name ? TERESA : NPC_DATA.find(q => q.name === name);
  if (!d) return;
  const n = makeNpc({ ...d, role: 'wander', tool: null }, Game.npcs.length);
  Object.assign(n, { x: MID, y: MID, night: 'fire', fresh: { stage: 'box', t: 5 } });
  Game.npcs.push(n);
  applyStructs();                         // тропы проступают ярче, на Стене имён — новое имя
  Story.trust[name] = Story.trust[name] ?? 50;
  boxOpen();
  Sound.boxArrives();
  toast(`Ящик поднялся! Внутри — новичок. Он растерян и ничего не помнит. Подойди к нему.`, 'good');
  Journal.addPlace(`Прибыл новичок: ${name}`, 'Глэйд');
}

function updateSettlers(dt) {
  const a = Settle.arrival;
  if (a && Game.phase === 'day') {
    a.t -= dt;
    if (a.t <= 0) { Settle.arrival = null; arrive(a.name); }
  }
  for (const n of Game.npcs) if (n.fresh) updateFresh(n, dt);
}

function updateFresh(n, dt) {
  const f = n.fresh, p = Game.player;
  f.t -= dt;
  if (f.stage === 'box' && f.t <= 0) Object.assign(f, { stage: 'meet', t: 45 });
  else if (f.stage === 'meet') {
    if (Math.hypot(n.x - p.x, n.y - p.y) < 2.4 && !f.said) {
      f.said = true;
      n.say = CHARACTERS[n.name] ? CHARACTERS[n.name].arrive[0] : 'Где я?..';
      n.sayT = 6;
    }
    if (f.t <= 0) Object.assign(f, { stage: 'explore', t: 50, spots: 0 });
  } else if (f.stage === 'explore' && f.t <= 0) {
    Object.assign(f, { stage: 'ready', t: 0 });
    toast(`${n.name} осмотрел Глэйд. Поговори с ним — и дай работу.`, 'info');
  }
}

// Куда идёт новичок: стоит в Ящике, подходит к Томасу, бродит по Глэйду, потом ждёт у костра или Ящика
function freshGoal(n, p) {
  const f = n.fresh;
  if (f.stage === 'box') return { x: MID, y: MID, act: 'idle', lookAt: p };
  if (f.stage === 'meet' && Maze.at(Math.round(p.x), Math.round(p.y)) === T.GLADE) {
    if (Math.hypot(n.x - p.x, n.y - p.y) < 1.8) return { x: Math.round(n.x), y: Math.round(n.y), act: 'idle', lookAt: p };
    const t = nearestPassable(Math.round(p.x), Math.round(p.y), npcPass) || LAYOUT.box;
    return { x: t.x, y: t.y, act: 'idle', lookAt: p };
  }
  if (f.stage === 'explore' || f.stage === 'meet') {
    if (!n.target || n.linger > 6) { n.target = randomGladeTile(); n.linger = 0; }
    return { x: n.target.x, y: n.target.y, act: 'idle' };
  }
  const c = isBuilt('campfire') ? SEATS[n.seat % SEATS.length] : LAYOUT.box;
  const t = nearestPassable(c.x, c.y, npcPass) || LAYOUT.box;
  return { x: t.x, y: t.y, act: 'idle', lookAt: p };
}

// Работы, которых нет в старом распорядке: каменотёс у валуна, водонос между рекой и Ящиком, лесоруб у дерева
function settlerWorkGoal(n) {
  if (n.role === 'miner') {
    if (!n.target || n.linger > 30) {
      const rocks = gatherNodes().rocks, b = rocks[(n.seat * 7 + Math.floor(Game.time / 30)) % Math.max(1, rocks.length)];
      const t = b ? nearestPassable(Math.round(b.x / S), Math.round(b.z / S), npcPass) : null;
      n.target = t ? { ...t, face: { x: b.x / S, y: b.z / S } } : randomGladeTile();
      n.linger = 0;
    }
    return { x: n.target.x, y: n.target.y, act: 'hammer', face: n.target.face };
  }
  if (n.role === 'carrier') {
    const river = nearestPassable(LAYOUT.ford.x, LAYOUT.ford.y - 1, npcPass) || LAYOUT.ford, box = nearestPassable(MID + 1, MID + 1, npcPass) || LAYOUT.box;
    if (!n.target || n.linger > 6) { n.target = !n.target || n.target.unload ? { ...river, fill: true } : { ...box, unload: true }; n.linger = 0; }
    return { x: n.target.x, y: n.target.y, act: 'pickup', carry: !!n.target.unload };
  }
  if (n.role === 'woodcutter' && Settle.on && !isBuilt('woodpile')) {
    if (!n.target || n.linger > 25) {
      const trees = gatherNodes().trees, tr = trees[(n.seat * 5) % Math.max(1, trees.length)];
      const t = tr ? nearestPassable(Math.round(tr.x / S), Math.round(tr.z / S), npcPass) : null;
      n.target = t ? { ...t, face: { x: tr.x / S, y: tr.z / S } } : randomGladeTile();
      n.linger = 0;
    }
    return { x: n.target.x, y: n.target.y, act: 'chop', face: n.target.face };
  }
  return null;
}

// Ночь: в кроватях построенных спален спят те, кому хватило места; стражи у ворот; остальные у костра
function assignNightDuties() {
  if (!Settle.on) return;
  const beds = BEDS.map((b, i) => i).filter(i => isBuilt(BEDS[i].house));
  let k = 0;
  for (const n of Game.npcs) {
    if (n.fresh) { n.night = 'fire'; continue; }
    if ((n.role || '').startsWith('guard')) { n.night = 'guard'; continue; }
    if (k < beds.length) { n.night = 'sleep'; n.bed = beds[k++]; } else n.night = 'fire';
  }
  const outside = Game.npcs.filter(n => n.night === 'fire').length;
  if (outside && Game.npcs.length > 1 && !isBuilt('bunk1')) toast(`Кроватей пока нет: ${outside === 1 ? 'житель ночует' : 'жители ночуют'} у ${isBuilt('campfire') ? 'костра' : 'Ящика'}. Строй спальню.`, 'info');
}

/* ---------- разговор: знакомство и работа ---------- */

// Возвращает true, если разговор с новичком нарисован целиком (обычный разговор не нужен)
function renderSettlerTalk(body, n, opt, say) {
  if (!Settle.on) return false;
  const ch = CHARACTERS[n.name];
  if (n.fresh) {
    const f = n.fresh;
    say(ch ? ch.arrive[f.talked ? 1 : 0] : 'Где я?..');
    if (!f.talked) {
      f.talked = true;
      opt('Ты в Глэйде. Я тоже ничего не помню — только имя. Я Томас.', () => {
        if (f.stage === 'box' || f.stage === 'meet') Object.assign(f, { stage: 'explore', t: 40 });
        Story.addTrust(n.name, 4, true);
        refreshPanel();
      });
    }
    if (f.stage !== 'ready') say(`${n.name} озирается по сторонам. Дай ему осмотреться — потом можно будет поручить работу.`, 'talk-note');
    if (ch) say(`Характер: ${ch.trait}. Лучше всего умеет: ${ch.skills.map(s => JOBS[s].name.toLowerCase()).join(', ')}.`, 'talk-note');
    if (f.stage === 'ready') renderJobChoice(body, n, opt, say);
    return true;
  }
  const job = jobOf(n);
  say(`Работа: ${job ? JOBS[job].name.toLowerCase() : 'пока без дела'}${ch ? ` · ${ch.trait}` : ''}.`, 'talk-note');
  return false;
}

function renderJobChoice(body, n, opt, say) {
  say('Какую работу ему дать?', 'talk-note');
  const ch = CHARACTERS[n.name];
  for (const [id, j] of Object.entries(JOBS)) {
    const why = jobBlocker(id), best = ch && ch.skills.includes(id);
    opt(`${j.name}${best ? ' ★' : ''} — ${j.text}${why ? ` (${why})` : ''}`, () => { assignJob(n, id); closePanel(); }, !!why);
  }
}
