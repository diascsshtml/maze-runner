// Добыча в Глэйде: E перед деревом, валуном, водой или камышом. С подходящим инструментом — быстрее и больше:
// топор рубит дрова (без него — охапка хвороста), кирка колет валуны (без неё — голыши у воды), ведро носит
// воду, камыш даёт волокно на ткань. Работа повторяется сама, пока стоишь на месте и есть что брать.
// Деревья, валуны и камыш понемногу «восстанавливаются» к утру: лес большой, но не бесконечный.

const GATHER_KINDS = {
  chop: { label: 'рубить дерево', tool: 'axe', time: 2.4, out: { wood: 2 }, sound: 'chop', stamina: 5 },
  brush: { label: 'собрать хворост', time: 3.0, out: { wood: 1 }, sound: 'grass', stamina: 2 },
  mine: { label: 'колоть камень', tool: 'pickaxe', time: 2.8, out: { stone: 2 }, sound: 'mine', stamina: 6 },
  pebbles: { label: 'собрать голыши', time: 3.2, out: { stone: 1 }, sound: 'grass', stamina: 2 },
  water: { label: 'набрать воды в ведро', tool: 'bucket', time: 1.6, out: { water: 4 }, sound: 'splash', stamina: 1 },
  reeds: { label: 'срезать камыш', time: 2.6, out: { cloth: 1 }, sound: 'grass', stamina: 2, fast: 'knife' },
};
const Gather = { work: null, nodes: null, swing: 0 };

// Узлы добычи: деревья леса, валуны, камыш (glade.js кладёт их в GLADE3D)
function gatherNodes() {
  if (Gather.nodes) return Gather.nodes;
  const big = k => (k === 'tree_young' ? 3 : k === 'tree_mid' ? 5 : 7);
  Gather.nodes = {
    trees: (GLADE3D.treeList || []).map(t => ({ x: t.x, z: t.z, r: TREE_KINDS[t.kind] * t.s, max: big(t.kind), left: big(t.kind) })),
    rocks: (GLADE3D.boulders || []).map(b => ({ x: b.x, z: b.z, r: b.r, max: Math.round(4 + b.r * 6), left: Math.round(4 + b.r * 6) })),
    reeds: (GLADE3D.reedList || []).map(b => ({ x: b.x, z: b.z, r: 0.4, max: 2, left: 2 })),
  };
  return Gather.nodes;
}

// Что перед Томасом: ближайший узел в пределах досягаемости и в поле зрения
function gatherTarget(p) {
  if (playerTile() !== T.GLADE || p.climb || p.air) return null;
  const N = gatherNodes(), x = tw(p.x), z = tw(p.y), fx = Math.cos(p.yaw), fz = Math.sin(p.yaw), held = heldItem(), tool = held && held.type;
  let best = null, bd = 1e9;
  const look = (list, kind, reach) => {
    for (const n of list) {
      const dx = n.x - x, dz = n.z - z, d = Math.hypot(dx, dz) - n.r;
      if (d > reach || d >= bd) continue;
      if ((dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz)) < 0.35) continue;
      best = { kind: kind(n), node: n };
      bd = d;
    }
  };
  look(N.trees, () => (tool === 'axe' ? 'chop' : 'brush'), 1.2);
  look(N.rocks, () => (tool === 'pickaxe' ? 'mine' : null), 1.1);
  look(N.reeds, () => 'reeds', 1.2);
  if (best && !best.kind) best = null;
  // Вода и голыши: у самой кромки реки (или стоя в ней)
  if (!best) {
    const ax = x + fx * 1.2, az = z + fz * 1.2;
    if (waterLevel(ax, az) !== null && groundMask('bed', ax, az) > 0.3) best = { kind: tool === 'bucket' ? 'water' : 'pebbles', node: null };
  }
  return best;
}

function gatherBlocked(t) {
  if (!t) return 'нечего брать';
  if (t.node && t.node.left <= 0) return t.kind === 'chop' || t.kind === 'brush' ? 'с этого дерева пока хватит — найди другое' : t.kind === 'mine' ? 'валун расколот — бери другой' : 'камыш срезан — отрастёт';
  const out = GATHER_KINDS[t.kind].out, k = Object.keys(out)[0];
  if (Life.res[k] >= storageCap()) return `${RES_NAMES[k].toLowerCase()} больше некуда класть — строй склад`;
  if (Game.player.stamina < 8) return 'нет сил — передохни';
  return null;
}

Object.assign(Gather, {
  prompt(p) {
    if (Gather.work) {
      const w = Gather.work, g = GATHER_KINDS[w.kind];
      return `${g.label[0].toUpperCase() + g.label.slice(1)}… ${Math.floor(w.t / g.time * 100)}%`;
    }
    const t = gatherTarget(p);
    if (!t) return '';
    const g = GATHER_KINDS[t.kind], why = gatherBlocked(t), k = keyLabel(Settings.keys.action);
    const hint = t.kind === 'brush' ? ' (топором — вдвое больше)' : t.kind === 'pebbles' ? ' (киркой у валуна — больше)' : '';
    return why ? `${g.label[0].toUpperCase() + g.label.slice(1)}: ${why}` : `${k} — ${g.label}${hint}`;
  },
  action(p) {
    if (Gather.work) { Gather.work = null; return true; }
    const t = gatherTarget(p);
    if (!t) return false;
    const why = gatherBlocked(t);
    if (why) { toast(why[0].toUpperCase() + why.slice(1) + '.', 'info'); return true; }
    Gather.work = { ...t, t: 0, at: { x: p.x, y: p.y } };
    return true;
  },
});

function gatherSound(kind, x, y, z) {
  const s = GATHER_KINDS[kind].sound;
  if (s === 'chop') Sound.work('chop', x, y, z);
  else if (s === 'mine') { Sound.work('hammer', x, y, z); Sound.clank(); }
  else if (s === 'splash') Sound.splash();
  else Sound.step(0.8, 'grass');
}

function updateGather(dt) {
  Gather.swing = Math.max(0, Gather.swing - dt * 3);
  const w = Gather.work;
  if (!w) return;
  const p = Game.player;
  if (Math.hypot(p.x - w.at.x, p.y - w.at.y) > 0.3 || Game.state !== 'play') { Gather.work = null; return; }
  const g = GATHER_KINDS[w.kind], speed = g.fast && heldItem() && heldItem().type === g.fast ? 1.6 : 1;
  w.t += dt * speed;
  w.hit = (w.hit || 0) - dt;
  if (w.hit <= 0) {
    w.hit = g.time / 2;
    Gather.swing = 1;
    const nx = w.node ? w.node.x : tw(p.x) + Math.cos(p.yaw), nz = w.node ? w.node.z : tw(p.y) + Math.sin(p.yaw);
    gatherSound(w.kind, nx, p.h + 1, nz);
    if (w.kind === 'chop' || w.kind === 'mine') emitDebris(nx, p.h + 1, nz, 0.3, 3);
  }
  if (w.t < g.time) return;
  // Готово: в запасы, узел беднеет, силы тратятся
  for (const [k, v] of Object.entries(g.out)) addRes(k, v);
  if (w.node) w.node.left--;
  p.stamina = Math.max(0, p.stamina - g.stamina);
  Tutorial.event('gather-' + Object.keys(g.out)[0]);
  const [k, v] = Object.entries(g.out)[0];
  hudFloat(`+${v} ${RES_NAMES[k].toLowerCase()}`);
  // Повторяем, пока стоим на месте и есть что брать
  const again = gatherTarget(p);
  if (again && again.kind === w.kind && again.node === w.node && !gatherBlocked(again)) { w.t = 0; return; }
  Gather.work = null;
}

// Утром лес и камни понемногу восстанавливаются
function gatherOnDay() {
  const N = gatherNodes();
  for (const n of [...N.trees, ...N.reeds]) n.left = Math.min(n.max, n.left + Math.ceil(n.max / 2));
  for (const n of N.rocks) n.left = Math.min(n.max, n.left + 1);
}

// Короткая надпись над прицелом: «+2 дерево»
function hudFloat(text) {
  let el = document.getElementById('hud-float');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hud-float';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}
