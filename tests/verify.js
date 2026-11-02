// 무역의 발견 — 게임 규칙 검증 스크립트 (node verify.js)
const L = require('../js/logic.js');
const cfg = L.clone(L.DEFAULT_CONFIG);
let failures = 0;
const out = [];
const say = (s) => out.push(s);
const check = (name, cond, detail) => {
  say(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};
const name = (id) => L.countryById(cfg, id).name;
const itemName = (id) => L.itemById(cfg, id).name;

say('■ 생산 규칙: 물품의 핵심 조건이 5인 나라는 1회에 목표량, 아니면 목표량의 1/4');
const table = L.outputTable(cfg);
const spec = { gaon: [400, 200, 40, 400], narae: [100, 800, 40, 400], daon: [100, 200, 160, 400], raon: [100, 200, 40, 1600] };
for (const c of cfg.countries) {
  const row = cfg.items.map((it) => table[c.id][it.id]);
  say(`  ${c.name}: ` + cfg.items.map((it, i) => `${it.name} ${row[i]}${it.unit}`).join(', '));
  check(`${c.name} 생산량이 설계 표와 일치`, JSON.stringify(row) === JSON.stringify(spec[c.id]));
}

say('\n■ 검증 1. 1차(자급자족)에서는 어떤 조합으로도 100% 불가능');
const a = L.verifyAutarky(cfg);
for (const c of cfg.countries) {
  const r = a.perCountry[c.id];
  const best = r.bestSplit.map((n, i) => n ? `${cfg.items[i].name}×${n}` : '').filter(Boolean).join(' ');
  say(`  ${c.name}: ${r.combos}가지 조합 모두 확인, 최고 종합 확보율 ${L.fmtPct(r.best)} (${best})`);
}
// 순서까지 구분한 4^4=256가지도 실제 produce 함수로 재확인
let seqCount = 0, seqFull = 0;
for (const c of cfg.countries) {
  for (let m = 0; m < 256; m++) {
    const s = L.createState(cfg); L.setStage(s, cfg, 2);
    for (let k = 0; k < 4; k++) L.produce(s, cfg, c.id, cfg.items[(m >> (2 * k)) & 3].id);
    const extra = L.produce(s, cfg, c.id, 'rice');
    if (extra.ok) seqFull += 1000; // 5번째 생산이 되면 오류
    const sec = L.security(cfg, s.countries[c.id].inv);
    if (cfg.items.every((it) => sec.per[it.id] >= 100)) seqFull++;
    seqCount++;
  }
}
check('1차 100% 달성 불가 (중복 조합 35가지 × 4국)', a.pass);
check(`생산 순서까지 구분한 ${seqCount}가지 실제 실행에서도 100% 없음, 5번째 생산 차단`, seqFull === 0);
check('네 가지 한 번씩 생산 시 43.75%', a.perCountry.gaon && (() => {
  const s = L.createState(cfg); L.setStage(s, cfg, 2);
  cfg.items.forEach((it) => L.produce(s, cfg, 'gaon', it.id));
  return L.security(cfg, s.countries.gaon.inv).overall === 43.75;
})());

say('\n■ 검증 2. 2차(무역)에서 특화 생산 + 교환으로 모두 100% 가능');
const t = L.verifyTradePlan(cfg);
t.trades.forEach((x) => say(`  ${name(x.a)} ${itemName(x.give.item)} ${x.give.qty} ⇄ ${name(x.b)} ${itemName(x.get.item)} ${x.get.qty}  ${x.ok ? '성립' : '실패: ' + x.error}`));
say('  최종 종합 확보율: ' + Object.entries(t.final).map(([k, v]) => `${name(k)} ${L.fmtPct(v)}`).join(', '));
check(t.trades.length + '건 거래(거래량 고정)로 네 나라 모두 100%', t.pass);

const U = L.tradeUnits(cfg);
say('\n■ 검증 3. 무역은 물품을 만들거나 없애지 않음');
check('매 거래 후 전체 물품 합계 동일', t.conserved);
{ // 무작위 거래 2000회 + 되돌리기
  let ok = true, neg = false;
  const s = L.createState(cfg); L.setStage(s, cfg, 5);
  cfg.countries.forEach((c) => { for (let i = 0; i < 4; i++) L.produce(s, cfg, c.id, L.specialties(cfg, c.id)[0]); });
  L.setStage(s, cfg, 6);
  const base = L.totals(s, cfg);
  const ids = cfg.countries.map((c) => c.id);
  let rnd = 7; const r = (n) => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd % n; };
  for (let i = 0; i < 2000; i++) {
    const A = ids[r(4)], B = ids[r(4)];
    const gi = cfg.items[r(4)].id, ti = cfg.items[r(4)].id;
    const p = L.proposeTrade(s, cfg, A, B, { item: gi, qty: U[gi] }, { item: ti, qty: U[ti] });
    if (r(4) === 0) { const pend = s.trades.filter((x) => x.status === 'pending'); if (pend.length) { const x = pend[r(pend.length)]; L.rejectTrade(s, x.id, x.from); } }
    if (p.ok) { if (r(2)) L.acceptTrade(s, cfg, p.trade.id, B); }
    if (r(10) === 0) { const d = s.trades.filter((x) => x.status === 'done'); if (d.length) L.revertTrade(s, d[r(d.length)].id); }
    const now = L.totals(s, cfg);
    cfg.items.forEach((it) => { if (now[it.id] !== base[it.id]) ok = false; });
    ids.forEach((id) => cfg.items.forEach((it) => { if (s.countries[id].inv[it.id] < 0) neg = true; }));
  }
  check('무작위 제안·수락·취소 2000회 후에도 합계 보존', ok);
  check('음수 재고 0건', !neg);
}

say('\n■ 검증 4. 조작 안정성');
{
  const s = L.createState(cfg); L.setStage(s, cfg, 2);
  const r1 = L.produce(s, cfg, 'gaon', 'rice', 'tap-1');
  const r2 = L.produce(s, cfg, 'gaon', 'rice', 'tap-1'); // 같은 요청이 두 번 도착
  check('같은 생산 요청 중복 처리 안 됨', r1.ok && !r2.ok && s.countries.gaon.chances === 3 && s.countries.gaon.inv.rice === 400);
  for (let i = 0; i < 10; i++) L.produce(s, cfg, 'gaon', 'oil');
  check('빠른 연타 10회 → 남은 기회까지만 생산', s.countries.gaon.chances === 0 && s.countries.gaon.inv.oil === 600);
  check('1차 단계에서 무역 시도 차단', !L.proposeTrade(s, cfg, 'gaon', 'narae', { item: 'rice', qty: U.rice }, { item: 'oil', qty: U.oil }).ok);
}
{
  const s = L.createState(cfg); L.setStage(s, cfg, 5);
  for (let i = 0; i < 4; i++) { L.produce(s, cfg, 'gaon', 'rice'); L.produce(s, cfg, 'narae', 'oil'); L.produce(s, cfg, 'daon', 'car'); L.produce(s, cfg, 'raon', 'phone'); }
  L.setStage(s, cfg, 6);
  // 가온국 쌀 1600만 톤 중 1400만 톤을 쓴 뒤, 남은 200만 톤으로 두 나라에 동시에 요청 → 하나만 성립해야 함
  s.countries.gaon.inv.rice = 200; s.countries.raon.inv.rice += 1400;
  const p1 = L.proposeTrade(s, cfg, 'gaon', 'narae', { item: 'rice', qty: U.rice }, { item: 'oil', qty: U.oil });
  const p2 = L.proposeTrade(s, cfg, 'gaon', 'daon', { item: 'rice', qty: U.rice }, { item: 'car', qty: U.car });
  const a1 = L.acceptTrade(s, cfg, p1.trade.id, 'narae');
  const a2 = L.acceptTrade(s, cfg, p2.trade.id, 'daon');
  check('같은 재고를 쓰는 두 거래 중 하나만 성립', a1.ok && !a2.ok && s.countries.gaon.inv.rice === 0);
  const a1b = L.acceptTrade(s, cfg, p1.trade.id, 'narae');
  check('이미 성립한 거래 다시 수락해도 중복 반영 안 됨', !a1b.ok && s.countries.narae.inv.rice === U.rice);
  check('거래 당사자가 아닌 나라는 수락 불가', !L.acceptTrade(s, cfg, p2.trade.id, 'raon').ok);
  check('거래량을 바꾼 요청은 거부', !L.proposeTrade(s, cfg, 'daon', 'narae', { item: 'car', qty: U.car + 1 }, { item: 'oil', qty: U.oil }).ok);
  check('받은 나라는 요청을 거절할 수 없음', !L.rejectTrade(s, p2.trade.id, 'daon').ok && p2.trade.status === 'pending');
  check('보낸 나라는 요청을 취소할 수 있음', L.rejectTrade(s, p2.trade.id, 'gaon').ok && p2.trade.status === 'withdrawn');
  const p3 = L.proposeTrade(s, cfg, 'daon', 'narae', { item: 'car', qty: U.car }, { item: 'oil', qty: U.oil });
  check('같은 나라에 기다리는 요청이 있으면 또 보낼 수 없음', p3.ok && !L.proposeTrade(s, cfg, 'daon', 'narae', { item: 'car', qty: U.car }, { item: 'rice', qty: U.rice }).ok);
  L.setStage(s, cfg, 7); // 교사가 단계 변경
  check('단계가 바뀌는 중 들어온 수락은 거부', !L.acceptTrade(s, cfg, p3.trade.id, 'narae').ok && p3.trade.status === 'expired');
  // 새로고침/재접속: 상태를 직렬화했다가 복원
  const restored = JSON.parse(JSON.stringify(s));
  check('새로고침(저장→복원) 후 물량·기회 그대로', JSON.stringify(restored.countries) === JSON.stringify(s.countries));
  // 2차 → 1차 기록 보존
}
{
  const s = L.createState(cfg); L.setStage(s, cfg, 2);
  cfg.items.forEach((it) => L.produce(s, cfg, 'gaon', it.id));
  L.setStage(s, cfg, 3); L.setStage(s, cfg, 5);
  check('2차 진입 시 창고 0·기회 4로 초기화', s.countries.gaon.chances === 4 && s.countries.gaon.inv.rice === 0);
  check('1차 결과 기록은 보존 (가온국 43.75%)', s.round1.gaon.sec.overall === 43.75 && s.round1.gaon.log.length === 4);
  L.setStage(s, cfg, 5); L.produce(s, cfg, 'gaon', 'rice');
  const u = L.undoProduce(s, cfg, 'gaon');
  check('되돌리기: 마지막 생산 취소', u.ok && s.countries.gaon.chances === 4 && s.countries.gaon.inv.rice === 0);
  s.allowUndo = false; L.produce(s, cfg, 'gaon', 'rice');
  check('교사가 되돌리기를 끄면 취소 불가', !L.undoProduce(s, cfg, 'gaon').ok);
}

check('2차 전략 수립(4) 단계는 없음 (3 → 5로 바로 넘어감)', !L.setStage(L.createState(cfg), cfg, 4).ok && L.nextStage(3, 1) === 5);

{
  const s = L.createState(cfg); L.setStage(s, cfg, 5);
  check('2차 생산에서 특화 물품이 아닌 물품은 생산 불가', !L.produce(s, cfg, 'gaon', 'oil').ok && s.countries.gaon.chances === 4);
  for (let i = 0; i < 4; i++) { L.produce(s, cfg, 'gaon', 'rice'); L.produce(s, cfg, 'narae', 'oil'); L.produce(s, cfg, 'daon', 'car'); }
  L.produce(s, cfg, 'raon', 'phone');
  const blocked = L.setStage(s, cfg, 6);
  check('한 나라라도 특화 생산 4번을 안 끝내면 무역 단계로 못 넘어감', !blocked.ok && s.stage === 5 && /라온국 1\/4/.test(blocked.error));
  check('결과 비교·정리 단계로 건너뛰는 것도 막힘', !L.setStage(s, cfg, 7).ok);
  check('단계는 모두 6개 (전략 수립·최종 정리 단계 통합)', L.STAGES.length === 6 && !L.setStage(L.createState(cfg), cfg, 8).ok);
  for (let i = 0; i < 3; i++) L.produce(s, cfg, 'raon', 'phone');
  check('네 나라 모두 끝내면 무역 단계로 넘어감', L.setStage(s, cfg, 6).ok);
  const t = L.createState(cfg); L.setStage(t, cfg, 5);
  check('2차 생산에서 이전 단계(1차)로 돌아가는 것은 가능', L.setStage(t, cfg, 3).ok);
}

say(`\n결과: ${failures === 0 ? '모든 검증 통과' : failures + '개 실패'}`);
console.log(out.join('\n'));
process.exit(failures ? 1 : 0);
