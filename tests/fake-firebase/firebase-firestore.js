const KEY = 'FAKEFS';
const TS = { __ts: true };
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const write = (st) => { localStorage.setItem(KEY, JSON.stringify(st)); notify(); };
const err = (code) => Object.assign(new Error(code), { code });
const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 10);

export function getFirestore(app) { return { app }; }
export function doc(base, ...seg) {
  if (base && base.type === 'col') { const id = seg[0] || rid(); return mkDoc(base.db, base.path + '/' + id); }
  return mkDoc(base, seg.join('/'));
}
function mkDoc(db, path) { const p = path.split('/'); return { type: 'doc', db, path, id: p[p.length - 1] }; }
export function collection(db, ...seg) { return { type: 'col', db, path: seg.join('/') }; }
export function where(f, op, v) { return { f, op, v }; }
export function query(col, ...w) { return { type: 'query', db: col.db, path: col.path, filters: w }; }
export function serverTimestamp() { return TS; }

function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    if ('__ms' in v && Object.keys(v).length === 1) { const ms = v.__ms; return { toMillis: () => ms, seconds: Math.floor(ms / 1000) }; }
    const o = {}; for (const k in v) o[k] = revive(v[k]); return o;
  }
  return v;
}
function prep(v) {
  if (v === TS) return { __ms: Date.now() };
  if (Array.isArray(v)) return v.map(prep);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) { if (v[k] !== undefined) o[k] = prep(v[k]); } return o; }
  return v;
}
function snap(ref, entry) {
  return { id: ref.id, ref, exists: () => !!entry, data: () => (entry ? revive(entry.d) : undefined), metadata: { fromCache: false } };
}
function docsIn(st, path) {
  const depth = path.split('/').length + 1;
  return Object.keys(st).filter((p) => p.startsWith(path + '/') && p.split('/').length === depth).sort();
}
function runQuery(st, q) {
  let ps = docsIn(st, q.path);
  (q.filters || []).forEach((w) => { ps = ps.filter((p) => w.op === '==' && st[p].d[w.f] === w.v); });
  const docs = ps.map((p) => snap(mkDoc(q.db, p), st[p]));
  return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f), metadata: { fromCache: false } };
}
function applyWrite(st, op) {
  const cur = st[op.ref.path];
  if (op.kind === 'delete') { delete st[op.ref.path]; return; }
  if (op.kind === 'set') { st[op.ref.path] = { d: prep(op.data), v: (cur ? cur.v : 0) + 1 }; return; }
  if (!cur) throw err('not-found');
  const d = JSON.parse(JSON.stringify(cur.d));
  for (const k in op.data) {
    const parts = k.split('.'); let o = d;
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] && typeof o[parts[i]] === 'object' ? o[parts[i]] : {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = prep(op.data[k]);
  }
  st[op.ref.path] = { d, v: cur.v + 1 };
}
const delay = () => new Promise((r) => setTimeout(r, 15 + Math.random() * 25));

export async function getDoc(ref) { await delay(); return snap(ref, read()[ref.path]); }
export async function getDocs(q) { await delay(); return runQuery(read(), q); }
export async function setDoc(ref, data) { await delay(); const st = read(); applyWrite(st, { kind: 'set', ref, data }); write(st); }
export async function updateDoc(ref, data) { await delay(); const st = read(); applyWrite(st, { kind: 'update', ref, data }); write(st); }
export async function deleteDoc(ref) { await delay(); const st = read(); applyWrite(st, { kind: 'delete', ref }); write(st); }
export function writeBatch() {
  const ops = [];
  return { set(ref, data) { ops.push({ kind: 'set', ref, data }); }, update(ref, data) { ops.push({ kind: 'update', ref, data }); }, delete(ref) { ops.push({ kind: 'delete', ref }); },
    async commit() { await delay(); const st = read(); ops.forEach((o) => applyWrite(st, o)); write(st); } };
}
export async function runTransaction(db, fn) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const reads = {}; const ops = [];
    const tx = {
      async get(ref) { await delay(); const e = read()[ref.path]; reads[ref.path] = e ? e.v : 0; return snap(ref, e); },
      set(ref, data) { ops.push({ kind: 'set', ref, data }); return tx; },
      update(ref, data) { ops.push({ kind: 'update', ref, data }); return tx; },
      delete(ref) { ops.push({ kind: 'delete', ref }); return tx; }
    };
    const result = await fn(tx);
    await delay();
    const st = read();
    const changed = Object.keys(reads).some((p) => (st[p] ? st[p].v : 0) !== reads[p]);
    if (changed) continue;
    if (ops.length) { ops.forEach((o) => applyWrite(st, o)); write(st); }
    return result;
  }
  throw err('aborted');
}

const listeners = new Set();
export function onSnapshot(target, a, b, c) {
  const cb = typeof a === 'function' ? a : b;
  const l = { target, cb, last: null };
  listeners.add(l);
  setTimeout(() => fire(l, read()), 20);
  return () => listeners.delete(l);
}
function fire(l, st) {
  if (!listeners.has(l)) return;
  const t = l.target;
  let val, sig;
  if (t.type === 'doc') { const e = st[t.path]; sig = JSON.stringify(e || null); val = snap(t, e); }
  else { const r = runQuery(st, t); sig = JSON.stringify(r.docs.map((d) => [d.id, st[d.ref.path]])); val = r; }
  if (sig === l.last) return;
  l.last = sig; l.cb(val);
}
function notify() { const st = read(); setTimeout(() => listeners.forEach((l) => fire(l, st)), 0); }
window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });
