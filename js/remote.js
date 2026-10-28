/* =========================================================
 * 실시간 저장소 (Firebase Firestore)
 *
 * 데이터 구조
 *   rooms/{입장코드}                방: 담당 교사, 수업 단계, 잠금, 설정, 1차 기록
 *   rooms/{코드}/countries/{나라}    나라별 창고(inv)·남은 기회(chances)·생산 기록(log)
 *   rooms/{코드}/trades/{거래}       거래 제안과 결과
 *   rooms/{코드}/seats/{나라}        그 나라에 들어온 학생 기기
 *   rooms/{코드}/members/{기기}      기기가 고른 나라 (한 기기 = 한 나라)
 *
 * 생산·거래·단계 변경은 모두 트랜잭션으로 처리합니다. 트랜잭션 안에서 최신
 * 값을 다시 읽고 logic.js의 같은 규칙 함수를 실행한 뒤 한 번에 저장하므로,
 * 두 거래가 같은 재고를 동시에 쓰면 하나만 성립합니다. firestore.rules가
 * 같은 규칙을 서버에서 한 번 더 검사합니다.
 * ========================================================= */
const L = window.TradeLogic;
const fail = (error) => ({ ok: false, error });
const clean = (o) => JSON.parse(JSON.stringify(o));
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ms = (t) => (t && typeof t.toMillis === 'function') ? t.toMillis() : (typeof t === 'number' ? t : 0);

export const ONLINE_WINDOW = 75 * 1000;   // 마지막 신호가 이 시간 안이면 '접속 중'
export const HEARTBEAT = 25 * 1000;

function baseState(room) {
  return { stage: room.stage, locks: Object.assign({ production: false, trade: false }, room.locks),
    allowUndo: room.allowUndo !== false, countries: {}, round1: room.round1 || null,
    trades: [], notes: {}, seq: 0, seenOps: {} };
}
const cdata = (snap) => { const d = snap.data(); return { inv: Object.assign({}, d.inv), chances: d.chances, log: (d.log || []).map((x) => Object.assign({}, x)) }; };
const freshCountry = (cfg) => ({ inv: L.emptyInv(cfg), chances: cfg.chances, log: [], op: { kind: 'reset' } });

export function roomRefs(fs, db, code) {
  return {
    room: fs.doc(db, 'rooms', code),
    country: (cid) => fs.doc(db, 'rooms', code, 'countries', cid),
    trade: (tid) => fs.doc(db, 'rooms', code, 'trades', tid),
    trades: fs.collection(db, 'rooms', code, 'trades'),
    countries: fs.collection(db, 'rooms', code, 'countries'),
    seat: (cid) => fs.doc(db, 'rooms', code, 'seats', cid),
    seats: fs.collection(db, 'rooms', code, 'seats'),
    member: (uid) => fs.doc(db, 'rooms', code, 'members', uid)
  };
}

/* ---------- 방 만들기 · 목록 (교사) ---------- */
export async function createRoom(fs, db, uid, cfg) {
  cfg = clean(cfg || L.DEFAULT_CONFIG);
  let code = null;
  for (let i = 0; i < 8 && !code; i++) {
    let c = ''; for (let k = 0; k < 5; k++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    const s = await fs.getDoc(fs.doc(db, 'rooms', c));
    if (!s.exists()) code = c;
  }
  if (!code) throw new Error('입장 코드를 만들지 못했어요. 다시 시도해 주세요.');
  const R = roomRefs(fs, db, code);
  await fs.setDoc(R.room, { ownerUid: uid, createdAt: fs.serverTimestamp(), stage: 1,
    locks: { production: false, trade: false }, allowUndo: true, cfg, outputs: L.outputTable(cfg), round1: null });
  const b = fs.writeBatch(db);
  cfg.countries.forEach((c) => b.set(R.country(c.id), freshCountry(cfg)));
  await b.commit();
  return code;
}
export async function listMyRooms(fs, db, uid) {
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'rooms'), fs.where('ownerUid', '==', uid)));
  const out = [];
  snap.forEach((d) => { const r = d.data(); out.push({ code: d.id, stage: r.stage, createdAt: ms(r.createdAt) }); });
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteRoom(fs, db, code) {
  const R = roomRefs(fs, db, code);
  const b = fs.writeBatch(db);
  for (const col of ['trades', 'countries', 'seats', 'members']) {
    const s = await fs.getDocs(fs.collection(db, 'rooms', code, col));
    s.forEach((d) => b.delete(d.ref));
  }
  b.delete(R.room);
  await b.commit();
}

/* ---------- 자리(나라) 잡기 (학생) ---------- */
export async function joinSeat(fs, db, code, uid, cid) {
  const R = roomRefs(fs, db, code);
  const s = await fs.getDoc(R.seat(cid));
  if (s.exists() && s.data().uid !== uid) return fail('다른 기기가 이미 이 나라로 들어와 있어요. 선생님께 말씀해 주세요.');
  const b = fs.writeBatch(db);
  b.set(R.seat(cid), { uid, joinedAt: fs.serverTimestamp(), lastSeen: fs.serverTimestamp() });
  b.set(R.member(uid), { cid });
  try { await b.commit(); } catch (e) {
    if (String(e.code || '').includes('permission')) return fail('다른 기기가 먼저 이 나라로 들어왔어요. 다른 나라를 골라 주세요.');
    throw e;
  }
  return { ok: true };
}
export async function myCountry(fs, db, code, uid) {
  const m = await fs.getDoc(roomRefs(fs, db, code).member(uid));
  return m.exists() ? m.data().cid : null;
}
export function heartbeat(fs, db, code, cid) {
  return fs.updateDoc(roomRefs(fs, db, code).seat(cid), { lastSeen: fs.serverTimestamp() });
}
export async function releaseSeat(fs, db, code, cid) {
  const R = roomRefs(fs, db, code);
  const s = await fs.getDoc(R.seat(cid));
  if (!s.exists()) return { ok: true };
  const b = fs.writeBatch(db);
  b.delete(R.seat(cid));
  b.delete(R.member(s.data().uid));
  await b.commit();
  return { ok: true };
}

/* ---------- 실시간 백엔드 ---------- */
export function createRemoteBackend({ fs, db, code, uid, onChange, watchSeats }) {
  const R = roomRefs(fs, db, code);
  let room = null, countries = {}, trades = [], seats = {}, loaded = { room: false, countries: false, trades: false };
  let online = typeof navigator === 'undefined' ? true : navigator.onLine, cacheTimer = null, stale = false;
  const unsubs = [];

  function emit() {
    if (!loaded.room) return;
    if (!room) { onChange(null, null, { missing: true }); return; }
    const cfg = room.cfg;
    const S = baseState(room);
    cfg.countries.forEach((c) => { S.countries[c.id] = countries[c.id] || { inv: L.emptyInv(cfg), chances: cfg.chances, log: [] }; });
    S.trades = trades;
    const ex = { online: online && !stale, ready: loaded.countries && loaded.trades };
    if (watchSeats) {
      const now = Date.now(); ex.seats = {};
      cfg.countries.forEach((c) => { const s = seats[c.id]; ex.seats[c.id] = s ? { uid: s.uid, online: now - ms(s.lastSeen) < ONLINE_WINDOW } : null; });
    }
    onChange(S, cfg, ex);
  }
  function onErr(e) { console.error(e); stale = true; emit(); }

  unsubs.push(fs.onSnapshot(R.room, { includeMetadataChanges: true }, (s) => {
    room = s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null; loaded.room = true;
    clearTimeout(cacheTimer);
    if (s.metadata && s.metadata.fromCache) cacheTimer = setTimeout(() => { stale = true; emit(); }, 6000);
    else stale = false;
    emit();
  }, onErr));
  unsubs.push(fs.onSnapshot(R.countries, (s) => {
    countries = {}; s.forEach((d) => { countries[d.id] = cdata(d); }); loaded.countries = true; emit();
  }, onErr));
  unsubs.push(fs.onSnapshot(R.trades, (s) => {
    const a = []; s.forEach((d) => { const t = d.data({ serverTimestamps: 'estimate' }); a.push({ id: d.id, from: t.from, to: t.to, give: t.give, get: t.get, status: t.status, at: ms(t.createdAt) || Date.now() }); });
    trades = a.sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1)); loaded.trades = true; emit();
  }, onErr));
  if (watchSeats) {
    unsubs.push(fs.onSnapshot(R.seats, (s) => { seats = {}; s.forEach((d) => { seats[d.id] = d.data({ serverTimestamps: 'estimate' }); }); emit(); }, onErr));
    const t = setInterval(emit, 15000); unsubs.push(() => clearInterval(t));
  }
  if (typeof window !== 'undefined') {
    const on = () => { online = true; emit(); }, off = () => { online = false; emit(); };
    window.addEventListener('online', on); window.addEventListener('offline', off);
    unsubs.push(() => { window.removeEventListener('online', on); window.removeEventListener('offline', off); });
  }

  const tx = (fn) => fs.runTransaction(db, fn);
  async function readRoom(t) {
    const rs = await t.get(R.room);
    if (!rs.exists()) throw Object.assign(new Error('no room'), { code: 'not-found' });
    return rs.data();
  }

  const api = {
    code,
    stop() { unsubs.forEach((u) => u()); },

    produce(cid, item) {
      return tx(async (t) => {
        const r0 = await readRoom(t); const cs = await t.get(R.country(cid));
        const s = baseState(r0); s.countries[cid] = cdata(cs);
        const r = L.produce(s, r0.cfg, cid, item);
        if (!r.ok) return r;
        const c = s.countries[cid]; c.log[c.log.length - 1].id = rid();
        t.update(R.country(cid), { inv: c.inv, chances: c.chances, log: c.log, op: { kind: 'produce', item } });
        return r;
      });
    },
    undo(cid) {
      return tx(async (t) => {
        const r0 = await readRoom(t); const cs = await t.get(R.country(cid));
        const s = baseState(r0); s.countries[cid] = cdata(cs);
        const r = L.undoProduce(s, r0.cfg, cid);
        if (!r.ok) return r;
        const c = s.countries[cid];
        t.update(R.country(cid), { inv: c.inv, chances: c.chances, log: c.log, op: { kind: 'undo' } });
        return r;
      });
    },
    propose(cid, to, give, get) {
      return tx(async (t) => {
        const r0 = await readRoom(t);
        const a = await t.get(R.country(cid)), b = await t.get(R.country(to));
        if (!a.exists() || !b.exists()) return fail('거래할 나라를 찾을 수 없어요.');
        const s = baseState(r0); s.countries[cid] = cdata(a); s.countries[to] = cdata(b);
        const r = L.proposeTrade(s, r0.cfg, cid, to, give, get);
        if (!r.ok) return r;
        const ref = fs.doc(R.trades);
        t.set(ref, { from: cid, to, give: { item: give.item, qty: give.qty }, get: { item: get.item, qty: get.qty },
          status: 'pending', createdAt: fs.serverTimestamp(), by: uid });
        return { ok: true, id: ref.id };
      });
    },
    accept(cid, tid) {
      return tx(async (t) => {
        const r0 = await readRoom(t);
        const ts = await t.get(R.trade(tid));
        if (!ts.exists()) return fail('거래를 찾을 수 없어요.');
        const td = ts.data();
        const a = await t.get(R.country(td.from)), b = await t.get(R.country(td.to));
        const s = baseState(r0); s.countries[td.from] = cdata(a); s.countries[td.to] = cdata(b);
        s.trades = [Object.assign({ id: tid }, td)];
        const r = L.acceptTrade(s, r0.cfg, tid, cid);
        if (!r.ok) return r;
        t.update(R.trade(tid), { status: 'done', doneAt: fs.serverTimestamp() });
        t.update(R.country(td.from), { inv: s.countries[td.from].inv, op: { kind: 'trade', tid } });
        t.update(R.country(td.to), { inv: s.countries[td.to].inv, op: { kind: 'trade', tid } });
        return r;
      });
    },
    reject(cid, tid) {
      return tx(async (t) => {
        const ts = await t.get(R.trade(tid));
        if (!ts.exists()) return fail('거래를 찾을 수 없어요.');
        const s = { trades: [Object.assign({ id: tid }, ts.data())] };
        const r = L.rejectTrade(s, tid, cid);
        if (!r.ok) return r;
        t.update(R.trade(tid), { status: s.trades[0].status });
        return r;
      });
    },

    /* ----- 교사 전용 ----- */
    cancelTrade(tid) { return api.reject('teacher', tid); },
    revert(tid) {
      return tx(async (t) => {
        await readRoom(t);
        const ts = await t.get(R.trade(tid)); if (!ts.exists()) return fail('거래를 찾을 수 없어요.');
        const td = ts.data();
        const a = await t.get(R.country(td.from)), b = await t.get(R.country(td.to));
        const s = { countries: { [td.from]: cdata(a), [td.to]: cdata(b) }, trades: [Object.assign({ id: tid }, td)] };
        const r = L.revertTrade(s, tid);
        if (!r.ok) return r;
        t.update(R.trade(tid), { status: 'reverted' });
        t.update(R.country(td.from), { inv: s.countries[td.from].inv, op: { kind: 'revert', tid } });
        t.update(R.country(td.to), { inv: s.countries[td.to].inv, op: { kind: 'revert', tid } });
        return r;
      });
    },
    async setStage(n) {
      const known = (await fs.getDocs(R.trades)).docs.map((d) => d.id);
      return tx(async (t) => {
        const r0 = await readRoom(t); const cfg = r0.cfg;
        const s = baseState(r0);
        const cs = {};
        for (const c of cfg.countries) { cs[c.id] = await t.get(R.country(c.id)); }
        const tsnaps = [];
        for (const id of known) { const x = await t.get(R.trade(id)); if (x.exists()) tsnaps.push(x); }
        cfg.countries.forEach((c) => { s.countries[c.id] = cs[c.id].exists() ? cdata(cs[c.id]) : { inv: L.emptyInv(cfg), chances: cfg.chances, log: [] }; });
        s.trades = tsnaps.map((x) => Object.assign({ id: x.id }, x.data()));
        const before = {}; s.trades.forEach((x) => { before[x.id] = x.status; });
        const r = L.setStage(s, cfg, n);
        if (!r.ok) return r;
        t.update(R.room, { stage: s.stage, round1: s.round1 ? clean(s.round1) : null });
        cfg.countries.forEach((c) => { const x = s.countries[c.id]; t.set(R.country(c.id), { inv: x.inv, chances: x.chances, log: x.log, op: { kind: 'stage' } }); });
        if (s.trades.length === 0) tsnaps.forEach((x) => t.delete(x.ref));
        else s.trades.forEach((x) => { if (before[x.id] !== x.status) t.update(R.trade(x.id), { status: x.status }); });
        return r;
      });
    },
    async setFlag(path, v) { await fs.updateDoc(R.room, { [path]: v }); return { ok: true }; },
    async reset() {
      const s = await fs.getDoc(R.room); if (!s.exists()) return fail('방을 찾을 수 없어요.');
      const cfg = s.data().cfg;
      const ts = await fs.getDocs(R.trades);
      const b = fs.writeBatch(db);
      ts.forEach((d) => b.delete(d.ref));
      cfg.countries.forEach((c) => b.set(R.country(c.id), freshCountry(cfg)));
      b.update(R.room, { stage: 1, round1: null, locks: { production: false, trade: false } });
      await b.commit();
      return { ok: true };
    },
    async setConfig(nc) {
      nc = clean(nc);
      await fs.updateDoc(R.room, { cfg: nc, outputs: L.outputTable(nc) });
      return { ok: true };
    }
  };
  return api;
}
