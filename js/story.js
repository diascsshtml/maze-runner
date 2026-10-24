// Сюжет: доверие жителей, задания, разговоры с выбором, записки создателей Лабиринта и концовки.
// Доверие растёт от помощи и выполненных заданий и падает от несправедливых решений.
// От него зависит, кто пойдёт с тобой в Лабиринт и чем закончится побег.

const NOTES = [
  'Протокол 1. Группа доставлена. Память удалена у всех. Реакции в норме. Начинаем наблюдение.',
  'Стены движутся по расписанию. У каждого сектора своя последовательность. Пусть бегуны ищут смысл — это и есть испытание.',
  'Если ты это читаешь, ты бегун. Не верь, что карта одна и та же. Сравнивай дни, а не коридоры.',
  'Гриверы — не звери. Внутри у них механизм. Я видел, как одного чинили люди в белых костюмах.',
  'Слова на табличках не случайны. Шесть слов, шесть секторов — вместе они открывают выход.',
  'Нас называют «переменными». Записывают каждый выбор: кого спасли, кого бросили, кому поверили.',
  '«ПОРОК — это хорошо». Так нам повторяли. Я больше в это не верю.',
  'Ящик поднимается раз в месяц: припасы и новый мальчик. Говорят, последней будет девушка.',
  'Небо над Глэйдом слишком ровное. Ночью звёзды стоят на месте. Это купол.',
  'За одной из стен — коридор из металла и камеры. Они смотрят на нас всё время.',
  'Тот, кто соберёт код и выйдет, увидит правду. Но правда — это ещё одно испытание.',
  'Мы оставили записки, чтобы вы знали: вы не первые. Но можете стать последними.',
];

const QUESTS = {
  first: { title: 'Новенький', giver: 'Алби', text: 'Найди сумку у Ящика и поговори с Ньютом — он всё покажет.',
    done: () => Items.bag > 0 && Story.flags.metNewt, reward: { trust: { 'Алби': 5, 'Ньют': 3 } } },
  herbs: { title: 'Травы для медаков', giver: 'Клинт', text: 'В южном лесу растут лечебные травы. Собери 4 пучка (E у куста) и сдай на склад.',
    done: () => (Story.flags.herbsGiven || 0) >= 4, progress: () => `${Story.flags.herbsGiven || 0}/4`, reward: { trust: { 'Клинт': 8, 'Джефф': 4 }, item: 'bandage' } },
  scrap: { title: 'Металл для кузницы', giver: 'Ник', text: 'В тупиках Лабиринта валяется металлолом. Принеси 3 куска и сдай на склад.',
    done: () => (Story.flags.scrapDelivered || 0) >= 3, progress: () => `${Story.flags.scrapDelivered || 0}/3`, reward: { trust: { 'Ник': 10 }, item: 'spear' } },
  wood: { title: 'Дрова к зиме', giver: 'Уинстон', text: 'Зимой дров уходит вдвое больше. Пусть на складе будет 30 дров.', from: 2,
    done: () => Life.res.wood >= 30, progress: () => `${Math.floor(Life.res.wood)}/30`, reward: { trust: { 'Уинстон': 8 }, item: 'knife' } },
  symbols: { title: 'Знаки секторов', giver: 'Минхо', text: 'На стенах секторов вырезаны знаки. Найди и осмотри 3 из них (E у знака или сфотографируй).',
    done: () => Secrets.symbolsFound() >= 3, progress: () => `${Secrets.symbolsFound()}/3`, reward: { trust: { 'Минхо': 12 }, flag: 'forecast' } },
  squad: { title: 'Отряд бегунов', giver: 'Минхо', text: 'Позови кого-нибудь в отряд (T), сходи в Лабиринт и верни всех в Глэйд до заката.', from: 2,
    done: () => Story.flags.squadReturned, reward: { trust: { 'Минхо': 10, 'Бен': 5 } } },
  notes: { title: 'Записки создателей', giver: 'Тереза', text: 'Кто-то оставлял в Лабиринте записки. Найди 5 из них.', from: 2,
    done: () => Story.notes.size >= 5, progress: () => `${Story.notes.size}/5`, reward: { trust: { 'Тереза': 15 } } },
  medicine: { title: 'Лекарство для Бена', giver: 'Джефф', text: 'Бен ранен. Сделай в мастерской бинт и отдай ему (поговори с Беном).', event: true,
    done: () => Story.flags.benBandaged, reward: { trust: { 'Бен': 15, 'Джефф': 6 } } },
  thief: { title: 'Вор в Глэйде', giver: 'Алби', text: 'Со склада пропадает еда. Поговори с Алби и реши, как поступить.', event: true },
  teresa: { title: 'Девушка из Ящика', giver: 'Галли', text: 'Галли требует запереть Терезу в Кутузке. Поговори с ним и реши.', event: true },
  gate: { title: 'Сломанные ворота', giver: 'Галли', text: 'Почини ворота до заката: металл 4 и дерево 4 (Совет Глэйда, B).', event: true },
  fire: { title: 'Пожар!', giver: 'Алби', text: 'Туши горящий дом: набери воды в реке во флягу и плесни у дома (F).', event: true },
  rescue: { title: 'Минхо в беде', giver: 'Ньют', text: 'Минхо ранен в Лабиринте. Найди его (метка на карте), нажми E рядом и доведи до Глэйда до заката.', event: true },
};

const START_TRUST = { 'Галли': 30, 'Чак': 70, 'Ньют': 60, 'Минхо': 45, 'Тереза': 50 };

const NEWCOMER = { name: 'Томми', role: 'farmer', tool: 'hoe', skin: '#e9c6a6', shirt: '#6f7a5a', pants: '#463f35', hair: '#a07040', style: 'messy', height: 0.94,
  lines: ['Я ничего не помню… Это нормально?', 'Спасибо, что нашлось место в доме.'] };

const Story = {
  trust: {}, flags: {}, quests: {}, notes: new Set(), talkedToday: new Set(),
};

function resetStory(keepNotes = false) {
  const notes = keepNotes ? Story.notes : new Set();
  Object.assign(Story, { trust: {}, flags: {}, quests: {}, notes, talkedToday: new Set() });
  for (const d of NPC_DATA) Story.trust[d.name] = START_TRUST[d.name] ?? 50;
  Story.trust['Тереза'] = START_TRUST['Тереза'];
  Story.quests.first = 'active';
}

Object.assign(Story, {
  addTrust(name, v, quiet = false) {
    if (Story.trust[name] === undefined) return;
    Story.trust[name] = Math.max(0, Math.min(100, Story.trust[name] + v));
    if (!quiet && v) toast(`${name}: доверие ${v > 0 ? 'растёт' : 'падает'} (${v > 0 ? '+' : ''}${v}).`, v > 0 ? 'good' : 'warn');
  },
  addTrustAll(v) { for (const k of Object.keys(Story.trust)) Story.addTrust(k, v, true); },
  avg() { const v = Object.values(Story.trust); return v.reduce((a, b) => a + b, 0) / v.length; },

  offer(id) {
    if (Story.quests[id]) return;
    Story.quests[id] = 'offered';
    toast(`${QUESTS[id].giver} хочет поговорить. Подойди и нажми ${keyLabel(Settings.keys.action)}.`, 'info');
  },
  start(id) {
    if (Story.quests[id] === 'active') return;
    Story.quests[id] = 'active';
    toast(`Новое задание: «${QUESTS[id].title}». Подробности — в журнале (${keyLabel(Settings.keys.journal)}).`, 'info');
  },
  complete(id, good = true) {
    if (Story.quests[id] === 'done') return;
    Story.quests[id] = 'done';
    const r = QUESTS[id].reward;
    if (good && r) {
      for (const [n, v] of Object.entries(r.trust || {})) Story.addTrust(n, v, true);
      if (r.item) giveItem(r.item);
      if (r.flag) Story.flags[r.flag] = true;
    }
    addMorale(good ? 4 : 0);
    toast(`Задание выполнено: «${QUESTS[id].title}»${r && r.item ? `. Награда: ${ITEM_DEFS[r.item].name}` : ''}.`, 'good');
    if (id === 'symbols') toast('Минхо: «Теперь я понимаю ритм стен. Утром буду говорить, какие секторы сдвинутся ночью».', 'info');
  },
  failQuest(id) {
    if (Story.quests[id] !== 'active' && Story.quests[id] !== 'offered') return;
    Story.quests[id] = 'failed';
  },
  // Готовые задания отмечаются, награда — у того, кто дал задание
  checkQuests() {
    for (const [id, st] of Object.entries(Story.quests)) {
      const q = QUESTS[id];
      if (st === 'active' && q.done && q.done()) {
        Story.quests[id] = 'ready';
        toast(`«${q.title}» — готово! Вернись к ${q.giver === 'Алби' ? 'Алби' : q.giver}.`, 'good');
      }
    }
  },
  // Задания, которые жители предлагают сами, когда приходит их время
  offerAvailable() {
    for (const [id, q] of Object.entries(QUESTS)) {
      if (q.event || Story.quests[id] || (q.from && Game.day < q.from)) continue;
      if (id === 'notes' && !Game.npcs.some(n => n.name === 'Тереза')) continue;
      if (id !== 'first' && Story.quests.first !== 'done') continue;
      Story.quests[id] = 'offered';
    }
  },

  addNote(i) {
    if (i === undefined) return;
    const fresh = !Story.notes.has(i);
    Story.notes.add(i);
    Meta.lore.add(i);
    saveMeta();
    toast(fresh ? `Записка ${Story.notes.size} из ${NOTES.length}: «${NOTES[i].slice(0, 70)}${NOTES[i].length > 70 ? '…' : ''}» Полностью — в журнале.` : 'Эту записку ты уже читал.', 'good');
    Story.checkQuests();
  },
  onPickup(type) {
    if (type === 'keycard') Story.flags.keycard = true;
    Story.checkQuests();
  },
  onCraft() { Story.checkQuests(); },

  // Новичок из Ящика, когда в домах есть место
  newcomer() {
    if (Story.flags.newcomer) return;
    Story.flags.newcomer = true;
    const d = NEWCOMER;
    const n = makeNpc(d, Game.npcs.length);
    Object.assign(n, { x: MID, y: MID + 1, night: 'fire' });
    Game.npcs.push(n);
    Story.trust[d.name] = 60;
    Sound.boxArrives();
    toast('Ящик поднялся: в Глэйде новичок, Томми. В новом доме для него нашлось место.', 'good');
  },
});

/* ---------- разговоры ---------- */

const WARM_LINES = ['Рад тебя видеть, Томас.', 'Если что — я с тобой.', 'Ты многое сделал для Глэйда.'];
const COLD_LINES = ['Чего тебе, шнурок?', 'Не до тебя сейчас.', 'Посмотрим, чего ты стоишь.'];
const ALARM_LINES = ['Ты слышал? Гривер днём! Такого раньше не было.', 'Держись поближе к стенам Глэйда.', 'Что-то меняется. И мне это не нравится.'];

// Житель перед Томасом, с которым можно поговорить
function npcInFront(p) {
  let best = null, bd = 1.5;
  for (const n of Game.npcs) {
    const v = npcSpot(n), dx = v.x - p.x, dy = v.y - p.y, d = Math.hypot(dx, dy);
    if (d > bd) continue;
    const front = (dx * Math.cos(p.yaw) + dy * Math.sin(p.yaw)) / (d || 1);
    if (d > 0.6 && front < 0.3) continue;
    bd = d;
    best = n;
  }
  return best;
}

// Кто есть кто в Глэйде — подпись под именем в разговоре
const ROLE_TITLES = {
  leader: 'Вожак Глэйда', wander: 'Глэйдер', runner: 'Бегун', follower: 'Самый младший в Глэйде', builder: 'Строитель',
  cook: 'Повар', woodcutter: 'Дровосек', farmer: 'Фермер', medjackA: 'Медак', medjackB: 'Медак', smith: 'Кузнец',
  guard0: 'Страж ворот', guard1: 'Страж ворот', guard2: 'Страж ворот',
};
const NAME_TITLES = { 'Ньют': 'Правая рука Алби', 'Минхо': 'Страж бегунов', 'Тереза': 'Девушка из Ящика', 'Томми': 'Новичок' };
function roleTitle(n) { return NAME_TITLES[n.name] || ROLE_TITLES[n.role] || 'Глэйдер'; }

function talkTo(n) {
  n.cool = 8;
  n.talkLine = npcLine(n);
  n.reply = null;
  openPanel('talk', n.name, body => renderTalk(body, n), { icon: 'i-people', kind: 'talk', sub: roleTitle(n) });
  if (n.name === 'Ньют') Story.flags.metNewt = true;
  Story.checkQuests();
  Tutorial.event('talk');
}

function npcLine(n) {
  const t = Story.trust[n.name] ?? 50;
  if (n.injured) return 'Ох… нога… Сам не дойду.';
  if (Life.alarm > 0) return ALARM_LINES[rand(ALARM_LINES.length)];
  if (t >= 75 && Math.random() < 0.5) return WARM_LINES[rand(WARM_LINES.length)];
  if (t < 25 && Math.random() < 0.6) return COLD_LINES[rand(COLD_LINES.length)];
  return n.lines[rand(n.lines.length)];
}

function renderTalk(body, n) {
  const t = Story.trust[n.name] ?? 50;
  const say = (text, cls = 'talk-line') => body.append(el('p', cls, text));
  const opts = el('div', 'talk-opts');
  // Ответы пронумерованы: выбрать можно мышью или цифрой на клавиатуре
  const opt = (text, fn, disabled = false, cls = '') => {
    const b = el('button', 'talk-opt' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.disabled = disabled;
    b.append(el('kbd', '', String(opts.children.length + 1)), el('span', '', text));
    b.addEventListener('click', e => { e.stopPropagation(); fn(); });
    opts.append(b);
  };
  const bye = () => opt('Пока', closePanel, false, 'bye');
  // Доверие: десять делений, мало — красные
  const trust = el('div', 'talk-trust' + (t < 30 ? ' low' : '')), segs = el('div', 'segs');
  for (let i = 0; i < 10; i++) segs.appendChild(el('i', i < Math.round(t / 10) ? 'on' : ''));
  trust.append(el('span', '', `Доверие ${Math.round(t)} из 100`), segs);
  $('panel-sub').replaceChildren(roleTitle(n), trust);

  // Особые разговоры: выбор с последствиями
  if (n.name === 'Галли' && Story.quests.teresa === 'offered') {
    say('Девчонка из Ящика — не к добру. Сначала ты, теперь она. Запрём её в Кутузку, пока не разберёмся.');
    opt('Тереза ни в чём не виновата. Она остаётся с нами.', () => {
      Story.flags.teresaFree = true;
      Story.addTrust('Тереза', 20); Story.addTrust('Ньют', 5); Story.addTrust('Галли', -12);
      Story.complete('teresa'); closePanel();
    });
    opt('Ладно. Одну ночь в Кутузке — и хватит.', () => {
      Story.flags.teresaJailed = Game.day;
      Story.addTrust('Галли', 10); Story.addTrust('Алби', 3); Story.addTrust('Тереза', -20);
      Story.complete('teresa'); closePanel();
    });
    body.append(opts);
    return;
  }
  if (n.name === 'Алби' && Story.quests.thief === 'offered') {
    say('Кто-то таскает еду со склада. Если так пойдёт дальше, зимой будем голодать. Что предлагаешь?');
    opt('Поставим дежурство у склада.', () => {
      Story.flags.storeGuard = true; Story.addTrust('Алби', 5); Story.complete('thief'); closePanel();
    });
    opt('Это наверняка Галли.', () => {
      Story.addTrust('Галли', -20); Story.addTrust('Ньют', -5); Story.addTrust('Алби', -3);
      toast('Галли: «Я? Да как ты смеешь!» Ньют качает головой — доказательств нет.', 'warn');
      Story.complete('thief', false); closePanel();
    });
    opt('Я сам покараулю ночью у склада.', () => {
      Story.flags.thiefHunt = true; Story.quests.thief = 'active';
      toast('Ночью подойди к Картохранилищу и посмотри, кто туда крадётся.', 'info'); closePanel();
    });
    body.append(opts);
    return;
  }
  if (n.name === 'Чак' && Story.flags.thiefHunt && Story.quests.thief === 'active' && Game.phase === 'night' && n.goal && n.goal.thief) {
    say('Ой! Томас… Это я. Бену плохо, он всё время голодный, а Фрайпан не даёт добавки. Я брал понемногу…');
    opt('Ладно. Никому не скажу. Но больше без спроса не бери.', () => {
      Story.addTrust('Чак', 15); addMorale(3); Story.flags.storeGuard = true; Story.complete('thief'); closePanel();
    });
    opt('Прости, Чак, придётся рассказать Алби.', () => {
      Story.addTrust('Алби', 8); Story.addTrust('Чак', -20); Story.flags.storeGuard = true; Story.complete('thief'); closePanel();
    });
    body.append(opts);
    return;
  }

  say(n.reply || n.talkLine || npcLine(n));
  // Раненый: перевязать или помочь дойти
  if (n.injured) {
    opt(`Перевязать (бинт${hasItem('bandage') ? '' : ' — нет в сумке'})`, () => {
      takeItem('bandage');
      n.injured = 0;
      if (n.name === 'Бен') Story.flags.benBandaged = true;
      Story.addTrust(n.name, 12);
      Story.checkQuests();
      refreshPanel();
    }, !hasItem('bandage'));
    if (playerTile() !== T.GLADE) opt('Обопрись на меня — идём в Глэйд.', () => { Squad.escort(n); closePanel(); });
  }
  // Задания этого жителя
  for (const [id, st] of Object.entries(Story.quests)) {
    const q = QUESTS[id];
    if (q.giver !== n.name) continue;
    if (st === 'offered' && !['teresa', 'thief'].includes(id)) {
      opt(`Есть дело? — «${q.title}»`, () => { Story.start(id); refreshPanel(); });
    } else if (st === 'ready') {
      opt(`Готово: «${q.title}»`, () => { Story.complete(id); refreshPanel(); });
    } else if (st === 'active') {
      body.append(el('p', 'panel-note', `«${q.title}»: ${q.text}${q.progress ? ` (${q.progress()})` : ''}`));
    }
  }
  // Услуги по ролям
  if (n.role.startsWith('medjack') && !n.injured) {
    const p = Game.player, need = p.hearts < 3 || p.bleed > 0;
    opt(`Подлатай меня (травы 1)${Story.flags.healedDay === Game.day ? ' — уже сегодня' : ''}`, () => {
      Life.res.herbs -= 1;
      Story.flags.healedDay = Game.day;
      p.hearts = Math.min(3, p.hearts + 1);
      p.bleed = 0;
      Story.addTrust(n.name, 2, true);
      toast(`${n.name} перевязал тебя: +1 жизнь.`, 'good');
      refreshPanel();
    }, !need || Life.res.herbs < 1 || Story.flags.healedDay === Game.day);
  }
  if (n.role === 'cook' && !n.injured) {
    opt(`Можно поесть? (еда 1)${Story.flags.ateDay === Game.day ? ' — уже ел сегодня' : ''}`, () => {
      Life.res.food -= 1;
      Story.flags.ateDay = Game.day;
      const p = Game.player;
      p.stamina = 100;
      p.exhausted = false;
      if (Life.lvl.kitchen >= 3) p.hearts = Math.min(3, p.hearts + 1);
      toast(Life.lvl.kitchen >= 3 ? 'Сытный ужин: силы полные и +1 жизнь.' : 'Похлёбка Фрайпана: силы полные.', 'good');
      refreshPanel();
    }, Life.res.food < 1 || Story.flags.ateDay === Game.day);
  }
  // Позвать в отряд
  if (Squad.canInvite(n)) {
    opt(`Пойдёшь со мной в Лабиринт? (доверие ${Squad.needTrust(n)}+)`, () => { Squad.invite(n); refreshPanel(); }, t < Squad.needTrust(n) || Squad.members.length >= 2);
  } else if (n.companion) {
    opt('Возвращайся в Глэйд — дальше я сам.', () => { Squad.dismiss(n); refreshPanel(); });
  }
  if (!Story.talkedToday.has(n.name)) {
    opt('Как дела?', () => {
      Story.talkedToday.add(n.name);
      Story.addTrust(n.name, 1, true);
      n.reply = n.lines[rand(n.lines.length)];
      refreshPanel();
    });
  }
  bye();
  body.append(opts);
}

/* ---------- концовки ---------- */

function endingText() {
  const names = Squad.members.map(n => n.name);
  const truth = Story.notes.size >= 8 && Story.flags.keycard;
  const together = Story.avg() >= 60 && Story.flags.teresaFree && names.length >= 1;
  if (truth) {
    return { title: 'Ты узнал правду', text: 'Карта-ключ открыла дверь за выходом. Коридор из металла, мониторы со всеми твоими днями в Лабиринте и надпись на стене: «ПОРОК — это хорошо». Записки не врали: это эксперимент, и он ещё не закончен.' };
  }
  if (together) return { title: 'Мы выбрались вместе', text: `Ты вышел не один: ${names.join(' и ')}${Story.flags.teresaFree ? ' и Тереза' : ''} шли следом, а за ними — весь Глэйд. Тебе поверили, и Лабиринт остался позади.` };
  if (Story.avg() < 30) return { title: 'Ты выбрался один', text: 'Выход открыт, но никто не пошёл следом. В Глэйде тебе так и не поверили.' };
  return { title: 'Ты выбрался из Лабиринта', text: names.length ? `${names.join(' и ')} вышли вместе с тобой. Остальные пока не решились.` : 'Что ждёт снаружи — пока неизвестно.' };
}
