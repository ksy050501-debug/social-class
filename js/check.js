/* 수업 전 점검: 실제 Firebase에서 교사 1명 + 가상 학생 4명으로 수업 전체를 자동 진행하며
   권한(보안 규칙), 동시 거래, 물품 보존, 100% 달성을 확인합니다. 점검용 방은 끝나면 지웁니다. */
import { configured, fs, authApi, connect } from './fb.js';
import { createRemoteBackend, createRoom, joinSeat, deleteRoom, roomRefs } from './remote.js';
import { setupNotice, el } from './common.js';

const L = window.TradeLogic, esc = window.TradeUI.esc;
const main = el('main');
const cfg = L.clone(L.DEFAULT_CONFIG);
const IDS = cfg.countries.map((c) => c.id);
const SPEC = { gaon: 'rice', narae: 'oil', daon: 'car', raon: 'phone' };
const QTY = { rice: 20, oil: 20, car: 12, phone: 16 };
let teacher = null;

function page(body) { main.innerHTML = `<div class="gate" style="max-width:760px"><section class="panel"><h2>수업 전 점검</h2>${body}</section></div>`; }
function intro(msg) {
  page(`<p style="margin:0">교사 계정 1개와 가상 학생 기기 4대로 점검용 방을 만들어 수업 전체를 자동으로 진행합니다. 약 30초 걸리고, 끝나면 점검용 방은 지워집니다.</p>
    <ul style="margin:0;padding-left:1.2em;display:grid;gap:4px"><li>학생이 다른 나라 창고나 수업 단계를 바꿀 수 없는지</li><li>생산량을 속여 저장할 수 없는지</li><li>같은 재고로 두 거래가 동시에 성립하지 않는지</li><li>네 나라 모두 100%에 도달할 수 있는지</li></ul>
    ${msg ? `<p class="callout" style="margin:0;color:var(--warn)">${esc(msg)}</p>` : ''}
    <button class="btn accent" id="run">${teacher ? '점검 시작' : '구글 계정으로 로그인하고 점검 시작'}</button>`);
  el('run').onclick = start;
}

let lines = [], fails = 0;
function log(ok, text, detail) {
  if (ok === false) fails++;
  lines.push(`<div class="${ok === null ? 'muted' : ok ? 'ok' : 'no'}">${ok === null ? '·' : ok ? '통과' : '실패'} ${esc(text)}${detail ? ` <span class="muted">(${esc(detail)})</span>` : ''}</div>`);
  el('log').innerHTML = lines.join('');
}
async function expectOk(text, p) {
  try { const r = await p; const ok = !r || r.ok !== false; log(ok, text, ok ? '' : r.error); return r; } catch (e) { log(false, text, e.code || e.message); return null; }
}
async function expectDenied(text, p) {
  try { await p; log(false, text, '막혀야 하는데 저장됨'); } catch (e) { const ok = String(e.code || '').includes('permission'); log(ok, text, ok ? '거부됨' : (e.code || e.message)); }
}
async function expectFail(text, p) {
  try { const r = await p; log(!!r && r.ok === false, text, r && r.error); } catch (e) { log(String(e.code || '').includes('permission'), text, e.code); }
}

async function start() {
  try {
    if (!teacher) {
      const ctx = connect();
      const p = new authApi.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      const r = await authApi.signInWithPopup(ctx.auth, p);
      teacher = { ctx, uid: r.user.uid };
    }
  } catch (e) { console.error(e); return intro('로그인하지 못했어요: ' + (e.code || e.message)); }
  lines = []; fails = 0;
  page(`<div class="checklist" id="log"></div><div id="end"></div>`);
  let code = null;
  const T = teacher;
  try {
    // 가상 학생 4명 (각자 다른 익명 계정)
    const st = {};
    for (const id of IDS) {
      const c = connect('check-' + id);
      if (!c.auth.currentUser) await authApi.signInAnonymously(c.auth);
      st[id] = { ctx: c, uid: c.auth.currentUser.uid };
    }
    log(null, '가상 학생 기기 4대 접속');

    await expectDenied('익명 학생은 수업 방을 만들 수 없음', fs.setDoc(fs.doc(st.gaon.ctx.db, 'rooms', 'ZZZZZ'), { ownerUid: st.gaon.uid, stage: 1 }));
    code = await createRoom(fs, T.ctx.db, T.uid, cfg);
    log(true, `교사가 점검용 방 만들기 (${code})`);

    const TB = createRemoteBackend({ fs, db: T.ctx.db, code, uid: T.uid, onChange: () => {} });
    const B = {}; IDS.forEach((id) => { B[id] = createRemoteBackend({ fs, db: st[id].ctx.db, code, uid: st[id].uid, onChange: () => {} }); });
    const R = (id) => roomRefs(fs, st[id].ctx.db, code);
    const inv = async (id) => (await fs.getDoc(roomRefs(fs, T.ctx.db, code).country(id))).data();

    for (const id of IDS) await expectOk(`학생 기기가 ${L.countryById(cfg, id).name} 자리 잡기`, joinSeat(fs, st[id].ctx.db, code, st[id].uid, id));
    await expectFail('이미 자리가 있는 나라는 다른 기기가 고를 수 없음', joinSeat(fs, st.narae.ctx.db, code, st.narae.uid, 'gaon'));
    await expectDenied('학생은 수업 단계를 바꿀 수 없음', fs.updateDoc(R('gaon').room, { stage: 6 }));

    await expectOk('교사: 2단계(1차 생산) 시작', TB.setStage(2));
    await expectOk('가온국 학생: 쌀 생산', B.gaon.produce('gaon', 'rice'));
    await expectDenied('학생이 창고 수량을 직접 고쳐 저장할 수 없음', fs.updateDoc(R('gaon').country('gaon'), { 'inv.rice': 999, op: { kind: 'produce', item: 'rice' } }));
    await expectDenied('학생이 생산량을 부풀려 저장할 수 없음', (async () => { const d = await inv('gaon'); await fs.updateDoc(R('gaon').country('gaon'), { inv: Object.assign({}, d.inv, { oil: d.inv.oil + 20 }), chances: d.chances - 1, log: d.log.concat([{ item: 'oil', amount: 20, round: 1 }]), op: { kind: 'produce', item: 'oil' } }); })());
    await expectDenied('다른 나라의 생산 버튼을 대신 누를 수 없음', (async () => { const d = await inv('daon'); await fs.updateDoc(R('narae').country('daon'), { inv: Object.assign({}, d.inv, { car: d.inv.car + 12 }), chances: d.chances - 1, log: d.log.concat([{ item: 'car', amount: 12, round: 1 }]), op: { kind: 'produce', item: 'car' } }); })());
    await expectDenied('1차 실험 중에는 거래를 만들 수 없음', fs.setDoc(fs.doc(R('gaon').trades), { from: 'gaon', to: 'narae', give: { item: 'rice', qty: 5 }, get: { item: 'oil', qty: 5 }, status: 'pending', by: st.gaon.uid }));

    const burst = await Promise.all([1, 2, 3, 4, 5].map(() => B.gaon.produce('gaon', 'oil').catch((e) => ({ ok: false, error: e.code }))));
    const g1 = await inv('gaon');
    log(g1.chances === 0 && g1.log.length === 4 && g1.inv.oil === 5 * burst.filter((r) => r.ok).length && burst.filter((r) => r.ok).length === 3,
      '생산 버튼을 동시에 5번 눌러도 남은 기회(3번)만큼만 생산', `성공 ${burst.filter((r) => r.ok).length}회, 남은 기회 ${g1.chances}`);
    for (const id of ['narae', 'daon', 'raon']) for (const it of ['rice', 'oil', 'car', 'phone']) await B[id].produce(id, it);
    const r1 = {}; for (const id of IDS) r1[id] = L.security(cfg, (await inv(id)).inv).overall;
    log(Object.values(r1).every((v) => v < 100), '1차 자급자족: 어느 나라도 100%가 아님', IDS.map((id) => `${L.countryById(cfg, id).name} ${L.fmtPct(r1[id])}`).join(', '));

    await expectOk('교사: 3단계(1차 결과 분석)', TB.setStage(3));
    await expectOk('교사: 4단계(2차 계획) — 1차 기록 저장 후 초기화', TB.setStage(4));
    const rd = (await fs.getDoc(roomRefs(fs, T.ctx.db, code).room)).data();
    const g2 = await inv('gaon');
    log(!!rd.round1 && rd.round1.gaon.log.length === 4 && g2.chances === 4 && g2.inv.rice === 0, '1차 기록은 남고 창고·기회는 초기화');
    await expectOk('교사: 5단계(2차 생산)', TB.setStage(5));
    for (const id of IDS) for (let i = 0; i < 4; i++) await B[id].produce(id, SPEC[id]);
    log(true, '네 나라가 각자 잘 만드는 물품을 4번씩 생산');
    await expectOk('교사: 6단계(무역)', TB.setStage(6));

    const total0 = L.totals({ countries: Object.fromEntries(await Promise.all(IDS.map(async (id) => [id, await inv(id)]))) }, cfg);
    const p1 = await B.gaon.propose('gaon', 'narae', { item: 'rice', qty: 20 }, { item: 'oil', qty: 20 });
    log(!!(p1 && p1.ok), '가온국: 나래국에 쌀 20kg ↔ 석유 20L 제안');
    await expectDenied('제안을 받지 않은 나라(다온국)는 대신 수락할 수 없음', fs.runTransaction(st.daon.ctx.db, async (t) => {
      const a = await t.get(R('daon').country('gaon')), b = await t.get(R('daon').country('narae'));
      t.update(R('daon').trade(p1.id), { status: 'done' });
      t.update(R('daon').country('gaon'), { inv: Object.assign({}, a.data().inv, { rice: 60, oil: 20 }), op: { kind: 'trade', tid: p1.id } });
      t.update(R('daon').country('narae'), { inv: Object.assign({}, b.data().inv, { rice: 20, oil: 60 }), op: { kind: 'trade', tid: p1.id } });
    }));
    await expectDenied('수량을 바꿔서 수락할 수 없음', fs.runTransaction(st.narae.ctx.db, async (t) => {
      const a = await t.get(R('narae').country('gaon')), b = await t.get(R('narae').country('narae'));
      t.update(R('narae').trade(p1.id), { status: 'done' });
      t.update(R('narae').country('gaon'), { inv: Object.assign({}, a.data().inv, { rice: 60, oil: 5 }), op: { kind: 'trade', tid: p1.id } });
      t.update(R('narae').country('narae'), { inv: Object.assign({}, b.data().inv, { rice: 20, oil: 75 }), op: { kind: 'trade', tid: p1.id } });
    }));
    await expectOk('나래국: 제안 수락', B.narae.accept('narae', p1.id));
    await expectFail('이미 성립한 거래를 다시 수락해도 반영되지 않음', B.narae.accept('narae', p1.id));

    const pa = await B.gaon.propose('gaon', 'daon', { item: 'rice', qty: 40 }, { item: 'car', qty: 12 });
    const pb = await B.gaon.propose('gaon', 'raon', { item: 'rice', qty: 40 }, { item: 'phone', qty: 16 });
    const both = await Promise.all([B.daon.accept('daon', pa.id).catch((e) => ({ ok: false, error: e.code })), B.raon.accept('raon', pb.id).catch((e) => ({ ok: false, error: e.code }))]);
    const g3 = await inv('gaon');
    log(both.filter((r) => r.ok).length === 1 && g3.inv.rice === 20, '같은 쌀로 만든 두 제안을 동시에 수락하면 하나만 성립', `가온국 쌀 ${g3.inv.rice}kg`);
    const doneId = both[0].ok ? pa.id : pb.id;
    await expectOk('교사: 성립한 거래 취소(되돌리기)', TB.revert(doneId));
    const g4 = await inv('gaon');
    log(g4.inv.rice === 60, '거래 취소 후 가온국 쌀이 60kg으로 돌아옴');
    const pend = [pa.id, pb.id].filter((x) => x !== doneId);
    for (const x of pend) await TB.cancelTrade(x).catch(() => {});

    const pairs = [['gaon', 'daon'], ['gaon', 'raon'], ['narae', 'daon'], ['narae', 'raon'], ['daon', 'raon']];
    for (const [a, b] of pairs) {
      const p = await B[a].propose(a, b, { item: SPEC[a], qty: QTY[SPEC[a]] }, { item: SPEC[b], qty: QTY[SPEC[b]] });
      if (!p || !p.ok) { log(false, `${a}→${b} 제안`, p && p.error); continue; }
      const r = await B[b].accept(b, p.id);
      if (!r || !r.ok) log(false, `${a}↔${b} 거래`, r && r.error);
    }
    const fin = {}; for (const id of IDS) fin[id] = await inv(id);
    const total1 = L.totals({ countries: fin }, cfg);
    log(cfg.items.every((it) => total0[it.id] === total1[it.id]), '거래 전후 전체 물품 합계가 같음', cfg.items.map((it) => `${it.name} ${total1[it.id]}`).join(', '));
    const pc = IDS.map((id) => L.security(cfg, fin[id].inv).overall);
    log(pc.every((v) => v === 100), '네 나라 모두 국민 생활 물품 확보율 100%', IDS.map((id, i) => `${L.countryById(cfg, id).name} ${L.fmtPct(pc[i])}`).join(', '));

    await expectOk('교사: 7단계(결과 비교)', TB.setStage(7));
    const late = await B.gaon.propose('gaon', 'narae', { item: 'rice', qty: 1 }, { item: 'oil', qty: 1 });
    log(!!late && late.ok === false, '무역 단계가 끝나면 거래 제안이 막힘');

    TB.stop(); IDS.forEach((id) => B[id].stop());
  } catch (e) {
    console.error(e); log(false, '점검이 중간에 멈춤', e.code || e.message);
  }
  if (code) { try { await deleteRoom(fs, T.ctx.db, code); log(null, '점검용 방을 지웠습니다'); } catch (e) { log(null, '점검용 방을 지우지 못했어요. 교사 화면의 [지난 방 모두 지우기]로 지울 수 있어요.'); } }
  el('end').innerHTML = `<p class="callout" style="margin:12px 0 0;font-size:17px"><b>${fails === 0 ? '모든 점검을 통과했어요. 수업에 사용할 수 있습니다.' : `${fails}개 항목이 실패했어요.`}</b>${fails ? '<br><span class="muted">firestore.rules를 다시 게시했는지, 익명·Google 로그인이 켜져 있는지 확인한 뒤 다시 점검해 주세요.</span>' : ''}</p><button class="btn ghost small" id="again" style="margin-top:10px">다시 점검</button>`;
  el('again').onclick = start;
}

if (!configured) setupNotice(main);
else {
  const ctx = connect();
  authApi.onAuthStateChanged(ctx.auth, (u) => { teacher = u && !u.isAnonymous ? { ctx, uid: u.uid } : null; if (!lines.length) intro(); });
}
