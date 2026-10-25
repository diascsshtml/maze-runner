// Склейка неподвижного: детали каждой постройки (дом с мебелью, кладбище, частокол…) сливаются по материалам
// в несколько мешей. Вместо сотен вызовов отрисовки — единицы, и для теней тоже; пересчёт матриц не нужен.
// Постройка остаётся в своей группе — «не построено» прячет её целиком, как раньше.
// Не трогаем то, что двигается или прячется само: двери домов, свечение фонарей, украшения уровней построек.

function batchStatic() {
  const keep = new Set();
  const protect = o => o && o.traverse(q => keep.add(q));
  for (const D of HOUSE_DOORS) protect(D.node);
  for (const l of GLADE3D.lanterns) protect(l.glow);
  for (const d of (typeof Life !== 'undefined' && Life.decor) || []) protect(d);
  let before = 0, after = 0;
  for (const rec of Object.values(STRUCTS)) {
    const r = batchGroup(rec.group, keep);
    before += r.before;
    after += r.after;
  }
  return { before, after };
}

// Подпись материала по содержимому: у каждой модели из Blender свои копии «досок», «коры», «верёвки» —
// одинаковые по текстурам и цвету, но разные объекты. По подписи они считаются одним материалом
const MAT_SIG = new WeakMap(), MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'];
function materialSig(m) {
  let s = MAT_SIG.get(m);
  if (s) return s;
  const tex = t => {
    if (!t) return '-';
    const img = t.image || (t.source && t.source.data);
    const src = img && (img.currentSrc || img.src);
    return (src || (t.source ? t.source.uuid : t.uuid)) + '@' + t.repeat.x.toFixed(3) + ',' + t.repeat.y.toFixed(3) + ',' + t.offset.x.toFixed(3) + ',' + t.offset.y.toFixed(3) + ',' + t.wrapS + t.wrapT;
  };
  const c = x => (x && x.getHexString ? x.getHexString() : '');
  s = [m.type, m.name, c(m.color), c(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, m.vertexColors, m.transparent, m.opacity,
    m.alphaTest, m.side, m.flatShading, m.envMapIntensity, m.depthWrite, m.fog, m.onBeforeCompile && m.onBeforeCompile.toString().length,
    m.customProgramCacheKey && m.customProgramCacheKey(), m.userData && m.userData.season, ...MAP_SLOTS.map(k => tex(m[k])), m.normalScale ? m.normalScale.x : ''].join('|');
  MAT_SIG.set(m, s);
  return s;
}

function batchGroup(root, keep) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const shown = o => { for (let q = o; q && q !== root; q = q.parent) if (!q.visible) return false; return true; };
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || keep.has(o) || !shown(o)) return;
    const g = o.geometry, m = o.material;
    if (Array.isArray(m) || !g.attributes.position || (g.morphAttributes && g.morphAttributes.position) || g.groups.length > 1) return;
    const attrs = Object.keys(g.attributes).sort();
    const key = [materialSig(m), o.customDepthMaterial ? o.customDepthMaterial.uuid : '', o.castShadow, o.receiveShadow, attrs.map(a => a + g.attributes[a].itemSize).join(',')].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  let before = 0, after = 0;
  for (const list of groups.values()) {
    before += list.length;
    if (list.length < 2) { after++; continue; }
    const mesh = new THREE.Mesh(mergeWorld(list, rootInv), list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    if (list[0].customDepthMaterial) mesh.customDepthMaterial = list[0].customDepthMaterial;   // тени листвы с прозрачностью
    mesh.matrixAutoUpdate = false;
    mesh.name = 'batch';
    root.add(mesh);
    for (const o of list) o.parent.remove(o);
    after++;
  }
  // Пустые узлы после склейки убираем; всё оставшееся неподвижно — матрицы считаем один раз
  const empty = [];
  root.traverse(o => { if (o !== root && !o.isMesh && !o.isLight && !o.children.length && !keep.has(o)) empty.push(o); });
  for (const o of empty) o.parent.remove(o);
  root.traverse(o => {
    if (keep.has(o) || o === root) return;
    let moving = false;
    o.traverse(q => { if (keep.has(q)) moving = true; });
    if (moving) return;                        // предки двери: дверь поворачивается сама, их матрицы тоже не меняются,
    o.updateMatrix();                          // но оставляем их как есть, чтобы не мешать её обновлению
    o.matrixAutoUpdate = false;
  });
  return { before, after };
}

// Значение компоненты атрибута как число с плавающей точкой (цвета из glTF бывают нормированными целыми)
const NORM_MAX = { Uint8Array: 255, Uint16Array: 65535, Int8Array: 127, Int16Array: 32767, Uint8ClampedArray: 255 };
function component(a, i, c) {
  const v = c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i);
  const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array, max = NORM_MAX[arr.constructor.name];
  return a.normalized && max && Math.abs(v) > 1.0001 ? Math.max(-1, v / max) : v;
}

// Общая геометрия из нескольких мешей в координатах root: позиции и нормали переносим, индексы сдвигаем
function mergeWorld(list, rootInv) {
  const m4 = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  const names = Object.keys(list[0].geometry.attributes);
  let verts = 0, idx = 0;
  for (const o of list) {
    const g = o.geometry;
    verts += g.attributes.position.count;
    idx += g.index ? g.index.count : g.attributes.position.count;
  }
  const out = {};
  for (const n of names) {
    const a = list[0].geometry.attributes[n];
    out[n] = { size: a.itemSize, norm: a.normalized, data: new Float32Array(verts * a.itemSize) };
  }
  const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  let vo = 0, io = 0;
  for (const o of list) {
    const g = o.geometry, n = g.attributes.position.count;
    m4.multiplyMatrices(rootInv, o.matrixWorld);
    nm.getNormalMatrix(m4);
    const flip = m4.determinant() < 0;               // зеркальный масштаб — переворачиваем обход треугольников
    for (const name of names) {
      const a = g.attributes[name], dst = out[name];
      for (let i = 0; i < n; i++) {
        if (name === 'position') {
          v.fromBufferAttribute(a, i).applyMatrix4(m4);
          dst.data.set([v.x, v.y, v.z], (vo + i) * 3);
        } else if (name === 'normal') {
          v.fromBufferAttribute(a, i).applyMatrix3(nm).normalize();
          dst.data.set([v.x, v.y, v.z], (vo + i) * 3);
        } else if (name === 'tangent') {
          v.set(a.getX(i), a.getY(i), a.getZ(i)).transformDirection(m4);
          dst.data.set([v.x, v.y, v.z, a.getW(i)], (vo + i) * 4);
        } else {
          for (let c = 0; c < a.itemSize; c++) dst.data[(vo + i) * a.itemSize + c] = component(a, i, c);
        }
      }
    }
    const src = g.index ? g.index.array : null, cnt = src ? src.length : n;
    for (let k = 0; k < cnt; k += 3) {
      const a = src ? src[k] : k, b = src ? src[k + 1] : k + 1, c = src ? src[k + 2] : k + 2;
      index[io++] = vo + a;
      index[io++] = vo + (flip ? c : b);
      index[io++] = vo + (flip ? b : c);
    }
    vo += n;
  }
  const geo = new THREE.BufferGeometry();
  for (const n of names) geo.setAttribute(n, new THREE.BufferAttribute(out[n].data, out[n].size, false));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
