// Отряд и распорядок жителей.
// До двух спутников идут с Томасом в Лабиринт. Разведчик видит ловушки издалека и открывает карту шире,
// носильщик добавляет два места и 6 кг груза, боец с копьём один раз за вылазку отгоняет гривера.
// Раненого можно довести до Глэйда: он опирается на плечо, и вы идёте медленнее.
// Здесь же — особые дела жителей: тревога, обед, стройка, пожар, раненые в кроватях, ночной вор.

const ROLES = {
  scout: { name: 'Разведчик', text: 'видит ловушки издалека, карта открывается шире' },
  porter: { name: 'Носильщик', text: '+2 места и +6 кг в сумке' },
  fighter: { name: 'Боец', text: 'с копьём, один раз отгонит гривера (копьё: дерево 2, металл 1)' },
};

const Squad = { members: [], escorting: null, stranded: null, out: false };

Object.assign(Squad, {
  needTrust(n) { return n.role === 'runner' ? 35 : 55; },
  canInvite(n) {
    return !n.companion && !n.injured && !n.stranded && Game.phase === 'day' && Game.timeLeft > 40 && playerTile() === T.GLADE &&
      !['leader', 'cook', 'follower'].includes(n.role) && !n.role.startsWith('medjack');
  },
  hasRole(r) { return Squad.members.some(n => n.squadRole === r && !n.injured); },
  bonus() { return Squad.hasRole('porter') ? { slots: 2, kg: 6 } : { slots: 0, kg: 0 }; },

  invite(n) {
    if (Squad.members.length >= 2 || (Story.trust[n.name] ?? 50) < Squad.needTrust(n)) return;
    n.companion = true;
    Squad.members.push(n);
    const free = ['scout', 'porter'].find(r => !Squad.members.some(m => m.squadRole === r));
    n.squadRole = free || 'porter';
    toast(`${n.name} в отряде: ${ROLES[n.squadRole].name.toLowerCase()}. Роли меняются в окне отряда (${keyLabel(Settings.keys.squad)}).`, 'good');
    updateHotbar();
  },
  dismiss(n) {
    n.companion = false;
    n.squadRole = null;
    Squad.members = Squad.members.filter(m => m !== n);
    if (Squad.escorting === n) Squad.release();
    updateHotbar();
  },
  setRole(n, role) {
    if (Squad.members.some(m => m !== n && m.squadRole === role)) return;
    if (role === 'fighter' && !n.spear) {
      if (!canPay({ wood: 2, metal: 1 })) { toast('На копьё для бойца нужно дерево 2 и металл 1.', 'warn'); return; }
      pay({ wood: 2, metal: 1 });
      n.spear = true;
    }
    n.squadRole = role;
    updateHotbar();
  },
  escort(n) {
    Squad.escorting = n;
    n.escorted = true;
    toast(`${n.name} опирается на твоё плечо. Идите в Глэйд — медленно, но верно.`, 'info');
  },
  release() {
    const n = Squad.escorting;
    if (!n) return;
    n.escorted = false;
    n.x = Math.round(n.x);
    n.y = Math.round(n.y);
    snapToPassable(n, runnerPass);
    n.repath = true;
    Squad.escorting = null;
  },
  // Событие «раненый бегун»: житель застрял в Лабиринте, ждёт помощи
  strand(name) {
    const n = Game.npcs.find(x => x.name === name);
    if (!n || n.companion) return false;
    const f = runnerField();
    for (let i = 0; i < 400; i++) {
      const cx = rand(CELLS), cy = rand(CELLS);
      if (!validCell(cx, cy)) continue;
      const x = cx * 2 + 1, y = cy * 2 + 1, d = f[y * SIZE + x];
      if (d < 14 || d > 26 || Maze.at(x, y) !== T.FLOOR) continue;
      Object.assign(n, { x, y, x0: x, y0: y, dx: 0, dy: 0, path: null, injured: 1, stranded: true });
      Squad.stranded = n;
      Maze.reveal(x, y, 1);
      return true;
    }
    return false;
  },
});

function resetSquad() {
  Object.assign(Squad, { members: [], escorting: null, stranded: null, out: false });
}

function updateSquad(dt) {
  const p = Game.player, inGlade = playerTile() === T.GLADE;
  if (!inGlade && Squad.members.length) Squad.out = true;
  // Вернулись всем отрядом
  if (inGlade && Squad.out && Squad.members.every(n => Maze.at(Math.round(n.x), Math.round(n.y)) === T.GLADE)) {
    Squad.out = false;
    if (!Story.flags.squadReturned) {
      Story.flags.squadReturned = true;
      Story.checkQuests();
      for (const n of Squad.members) Story.addTrust(n.name, 4, true);
      toast('Отряд вернулся в Глэйд в полном составе.', 'good');
    }
  }
  // Спутник рядом с гривером: боец отбивается копьём, иначе ранение
  for (const n of Squad.members) {
    for (const g of Game.grievers) {
      if (g.fade < 0.6 || g.leaving || g.stun > 0 || Math.hypot(g.x - n.x, g.y - n.y) > 0.5) continue;
      g.strikeT = 1.1;
      if (n.spear && n.squadRole === 'fighter') {
        n.spear = false;
        g.stun = 3;
        Sound.clank();
        toast(`${n.name} отбил гривера копьём! Копьё сломано.`, 'warn');
      } else if (!n.injured) {
        n.injured = 1;
        g.stun = 1.5;
        Sound.hit();
        toast(`${n.name} ранен гривером! Помоги ему дойти (подойди и ${keyLabel(Settings.keys.action)}).`, 'danger');
      }
    }
  }
  // Довели раненого до Глэйда
  const e = Squad.escorting;
  if (e && inGlade) {
    Squad.release();
    e.stranded = false;
    Story.addTrust(e.name, 15);
    addMorale(5);
    toast(`${e.name} в Глэйде. Медаки им займутся.`, 'good');
    if (Squad.stranded === e) { Squad.stranded = null; Story.complete('rescue'); }
  }
  if (e && Math.hypot(e.x - p.x, e.y - p.y) > 3) Squad.release();
}

// Закат: кто остался за стенами, проведёт ночь в Лабиринте (и вернётся утром раненым)
function squadOnNight() {
  for (const n of [...Squad.members, ...(Squad.stranded ? [Squad.stranded] : [])]) {
    if (Maze.at(Math.round(n.x), Math.round(n.y)) === T.GLADE) continue;
    if (Squad.escorting === n) Squad.release();
    n.injured = 2;
    n.stranded = false;
    Object.assign(n, { x: STATIONS.mapRoom.x, y: STATIONS.mapRoom.y, dx: 0, dy: 0, path: null, repath: true });
    Story.addTrust(n.name, -15);
    addMorale(-8);
    toast(`${n.name} не успел вернуться до закрытия ворот… Утром его нашли у стены, раненого.`, 'danger');
    if (Squad.stranded === n) { Squad.stranded = null; Story.failQuest('rescue'); }
  }
  for (const n of [...Squad.members]) Squad.dismiss(n);
}

/* ---------- особые дела жителей ---------- */

function bedFor(n) {
  if (n.bed !== undefined) return BEDS[n.bed];
  const taken = new Set(Game.npcs.filter(m => m.bed !== undefined).map(m => m.bed));
  const i = BEDS.findIndex((b, k) => !taken.has(k));
  return BEDS[i >= 0 ? i : 0];
}

function npcOverride(n, p) {
  const day = Game.phase === 'day', since = Game.dayLen - Game.timeLeft;
  if (n.stranded && !n.escorted) return { x: n.x0, y: n.y0, act: 'sit', pass: runnerPass };
  if (n.escorted) {
    const k = 0.45;
    return { attach: true, x: p.x - Math.cos(p.yaw) * k + Math.sin(p.yaw) * 0.25, y: p.y - Math.sin(p.yaw) * k - Math.cos(p.yaw) * 0.25, face: p.yaw };
  }
  if (n.companion) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < 1.8 && n.goal && n.goal.follow) return { ...n.goal, act: 'idle', lookAt: p };
    const ang = Math.atan2(n.y - p.y, n.x - p.x);
    const t = nearestPassable(Math.round(p.x + Math.cos(ang) * 1.2), Math.round(p.y + Math.sin(ang) * 1.2), runnerPass) || { x: Math.round(p.x), y: Math.round(p.y) };
    return { x: t.x, y: t.y, act: 'idle', lookAt: p, follow: true, run: d > 3, hurry: true, pass: runnerPass, slow: n.injured > 0 };
  }
  const inGlade = Maze.at(Math.round(n.x), Math.round(n.y)) === T.GLADE;
  if (n.injured > 0 && inGlade) {
    const b = bedFor(n);
    return { x: b.x, y: b.y, act: 'sleep', bed: b, slow: true };
  }
  if (n.name === 'Тереза' && Story.flags.teresaJailed === Game.day && !day) return { x: LAYOUT.slammer.x + 1, y: LAYOUT.slammer.y, act: 'sit', face: LAYOUT.slammer };
  if (n.name === 'Чак' && Story.flags.thiefHunt && Story.quests.thief === 'active' && !day) {
    const h = houseOf('storage');
    return { x: h.doorOut.x, y: h.doorOut.y, act: 'idle', face: h.doorTile, thief: true };
  }
  if (!day || !inGlade) return null;
  if (Life.fire && !n.role.startsWith('guard') && n.role !== 'leader') {
    const helpers = Game.npcs.filter(m => !m.injured && !m.companion && !m.role.startsWith('guard') && m.role !== 'leader').slice(0, 5);
    const i = helpers.indexOf(n);
    if (i >= 0) {
      const h = houseOf(Life.fire.house), [ox, oy] = DOOR_DIR[h.door];
      const t = nearestPassable(h.doorOut.x + ox * (i % 2) - oy * (i - 2), h.doorOut.y + oy * (i % 2) + ox * (i - 2), npcPass) || h.doorOut;
      return { x: t.x, y: t.y, act: 'cook', face: h.doorTile, fire: true, hurry: true };
    }
  }
  if (n.role === 'builder' && Life.build) {
    const h = houseOf(BUILDINGS[Life.build.id].house);
    return { x: h.doorOut.x, y: h.doorOut.y, act: 'hammer', face: h.doorTile, build: true };
  }
  if (Life.alarm > 0 && !n.role.startsWith('guard')) {
    const L = STATIONS.leader, i = n.seat % 8, a = i / 8 * Math.PI * 2;
    const t = nearestPassable(Math.round(L.x + Math.cos(a) * 2), Math.round(L.y + Math.sin(a) * 2), npcPass) || L;
    return { x: t.x, y: t.y, act: n.role === 'leader' ? 'talk' : 'idle', lookAt: L, hurry: true };
  }
  // Обед: работники собираются у столовой
  if (since > 80 && since < 98 && ['farmer', 'woodcutter', 'smith', 'builder', 'wander'].includes(n.role)) {
    const h = houseOf('dining'), i = n.seat % 6;
    const t = nearestPassable(h.doorOut.x + 1 + (i % 3), h.doorOut.y - 1 + Math.floor(i / 3) * 2, npcPass) || h.doorOut;
    return { x: t.x, y: t.y, act: 'talk', face: h.doorOut };
  }
  return null;
}

/* ---------- окно отряда (T) ---------- */

function openSquad() {
  togglePanel('squad', 'Отряд бегунов', renderSquad, { icon: 'i-people' });
}

function renderSquad(body) {
  body.append(el('p', 'panel-lead', 'До двух спутников. Позвать можно днём в Глэйде — бегунов с доверием от 35, остальных от 55. Вернитесь до закрытия ворот: кто останется снаружи, будет ранен.'));
  for (const [id, r] of Object.entries(ROLES)) body.append(el('p', 'panel-note', `${r.name}: ${r.text}.`));
  body.append(el('h3', 'panel-sub', Squad.members.length ? 'В отряде' : 'Отряд пока пуст'));
  for (const n of Squad.members) {
    const card = el('div', 'bcard'), head = el('div', 'bhead');
    head.append(el('b', '', n.name), el('span', 'lvl', n.injured ? 'ранен' : ROLES[n.squadRole].name));
    card.append(head);
    const row = el('div', 'panel-actions');
    for (const [id, r] of Object.entries(ROLES)) {
      row.append(button(r.name, () => { Squad.setRole(n, id); refreshPanel(); }, { cls: 'chip' + (n.squadRole === id ? ' on' : ''), disabled: Squad.members.some(m => m !== n && m.squadRole === id) }));
    }
    row.append(button('Отпустить', () => { Squad.dismiss(n); refreshPanel(); }));
    card.append(row);
    body.append(card);
  }
  const cands = Game.npcs.filter(n => Squad.canInvite(n));
  if (cands.length && Squad.members.length < 2) {
    body.append(el('h3', 'panel-sub', 'Кого позвать'));
    for (const n of cands.sort((a, b) => (Story.trust[b.name] ?? 50) - (Story.trust[a.name] ?? 50))) {
      const t = Math.round(Story.trust[n.name] ?? 50), need = Squad.needTrust(n), card = el('div', 'bcard'), head = el('div', 'bhead');
      head.append(el('b', '', n.name), el('span', 'lvl', `доверие ${t}/${need}`));
      card.append(head, button('Позвать', () => { Squad.invite(n); refreshPanel(); }, { cls: 'btn small', disabled: t < need }));
      body.append(card);
    }
  } else if (!cands.length && !Squad.members.length) {
    body.append(el('p', 'panel-note', 'Сейчас позвать некого: отряд собирают днём в Глэйде, пока до заката больше 40 секунд.'));
  }
}
