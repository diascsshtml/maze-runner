// Задания бегунов: разведка сектора, тайник у ориентира, безопасный путь. Цели видны на карте и на компасе.
// (Спасение пропавшего жителя — задание «Минхо в беде» в story.js.)

const ROMAN_S = s => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][s - 1];
function questSector(key) {
  if (!Story.flags[key]) Story.flags[key] = 1 + rand(8);
  return Story.flags[key];
}
function sectorLabel(s) { return `сектор ${ROMAN_S(s)} (${SECTOR_THEMES[s].name})`; }

// Доля открытых на карте коридоров сектора
function sectorExplored(s) {
  let all = 0, seen = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (Maze.at(x, y) !== T.FLOOR || sectorOfTile(x, y) !== s) continue;
      all++;
      if (Maze.isExplored(x, y)) seen++;
    }
  }
  return all ? seen / all : 0;
}

function plazaOf(s) { return Maze.plazas().find(p => p.sector === s) || null; }

Object.assign(QUESTS, {
  explore: { title: 'Разведка сектора', giver: 'Минхо', from: 2,
    get text() { const s = questSector('exploreSector'); return `Пробегись по ${sectorLabel(s)} и открой на карте хотя бы треть его коридоров.`; },
    done: () => sectorExplored(questSector('exploreSector')) >= 0.33,
    progress: () => `${Math.round(sectorExplored(questSector('exploreSector')) * 100)}% из 33%`,
    reward: { trust: { 'Минхо': 10, 'Бен': 3 } } },
  cache: { title: 'Тайник для бегунов', giver: 'Бен', from: 3,
    get text() { const s = questSector('cacheSector'); return `Отнеси факел и верёвку к ориентиру «${SECTOR_THEMES[s].lm}» (${sectorLabel(s)}) и оставь там тайник (E у ориентира).`; },
    done: () => !!Story.flags.cacheLeft,
    reward: { trust: { 'Бен': 10, 'Минхо': 4 } } },
  safepath: { title: 'Безопасный путь', giver: 'Алби', from: 4,
    get text() { const s = questSector('pathSector'); return `Дойди от ворот до ориентира «${SECTOR_THEMES[s].lm}» (${sectorLabel(s)}) и вернись в Глэйд до заката — дорогу отметят на карте для всех бегунов.`; },
    done: () => !!Story.flags.safePathDone,
    progress: () => Story.flags.pathReached ? 'ориентир найден — назад в Глэйд' : 'иди к ориентиру',
    reward: { trust: { 'Алби': 8, 'Ньют': 4 } } },
});

// Цель задания для карты и компаса
function runnerQuestTarget() {
  if (Story.quests.cache === 'active' && !Story.flags.cacheLeft) { const pl = plazaOf(questSector('cacheSector')); if (pl) return { ...pl, label: 'Тайник' }; }
  if (Story.quests.safepath === 'active' && !Story.flags.pathReached) { const pl = plazaOf(questSector('pathSector')); if (pl) return { ...pl, label: 'Ориентир' }; }
  return null;
}

const Runners = {
  prompt(p) {
    if (Story.quests.cache !== 'active' || Story.flags.cacheLeft) return '';
    const pl = plazaOf(questSector('cacheSector'));
    if (!pl || Math.hypot(pl.x - p.x, pl.y - p.y) > 2.6) return '';
    return hasItem('torch') && hasItem('rope') ? `${keyLabel(Settings.keys.action)} — оставить тайник бегунов` : 'Для тайника нужны факел и верёвка';
  },
  action(p) {
    const pr = Runners.prompt(p);
    if (!pr || !hasItem('torch') || !hasItem('rope')) return false;
    takeItem('torch');
    takeItem('rope');
    Story.flags.cacheLeft = true;
    Sound.pickup();
    toast('Тайник оставлен: бегуны найдут тут факел и верёвку. Вернись к Бену.', 'good');
    Story.checkQuests();
    return true;
  },
};

// Безопасный путь: пока идёт задание, за Томасом остаются отметки; дошёл до ориентира и вернулся — путь сохранён
function updateRunners(dt) {
  const p = Game.player;
  if (Story.quests.safepath !== 'active' || Story.flags.safePathDone) return;
  const inGlade = playerTile() === T.GLADE, f = Story.flags;
  f.trail = f.trail || [];
  if (!inGlade) {
    const last = f.trail[f.trail.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 3) f.trail.push({ x: Math.round(p.x), y: Math.round(p.y) });
    const pl = plazaOf(questSector('pathSector'));
    if (pl && !f.pathReached && Math.hypot(pl.x - p.x, pl.y - p.y) < 3) {
      f.pathReached = true;
      toast('Ориентир найден! Теперь назад в Глэйд — отметки ведут обратно.', 'good');
    }
  } else if (f.pathReached && Game.phase === 'day') {
    f.safePathDone = true;
    f.safePaths = [...(f.safePaths || []), f.trail.slice(0, 200)];
    f.trail = [];
    toast('Безопасный путь отмечен на карте. Вернись к Алби.', 'good');
    Story.checkQuests();
  } else if (!f.pathReached) f.trail = [];
}

// Ночь застала в Лабиринте — отметки пути сбиваются (стены двигаются)
function runnersOnNight() {
  if (Story.quests.safepath === 'active' && !Story.flags.safePathDone) Object.assign(Story.flags, { trail: [], pathReached: false });
}
