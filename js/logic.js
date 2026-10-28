/* =========================================================
 * 무역의 발견 — 게임 규칙 엔진 (화면과 분리된 순수 로직)
 * 브라우저: window.TradeLogic / Node: require('./logic.js')
 * 3단계(실시간 다중 접속)에서는 이 파일의 produce/acceptTrade 등을
 * 서버 측 트랜잭션 안에서 그대로 호출하는 구조로 옮길 예정입니다.
 * ========================================================= */
(function (root) {
  'use strict';

  /* ---------- 1. 기본 설정 (교사가 바꾸는 데이터) ---------- */
  const DEFAULT_CONFIG = {
    chances: 4,            // 국가별 생산 기회
    strongLevel: 5,        // 이 값 이상이면 '매우 강한' 조건
    weakShare: 0.25,       // 약한 조건일 때 1회 생산량 = 목표량 × 0.25
    conditions: [
      { id: 'capital',  name: '자본',   desc: '공장·기계·생산 시설을 마련하는 힘' },
      { id: 'resource', name: '자원',   desc: '땅속·자연에서 얻는 자원의 풍부함' },
      { id: 'labor',    name: '노동력', desc: '생산에 참여할 수 있는 사람의 힘' },
      { id: 'tech',     name: '기술력', desc: '물건을 효율적으로 만드는 기술 수준' }
    ],
    // key: 이 물품을 만들 때 가장 중요한 생산 조건
    items: [
      { id: 'rice',  name: '쌀',     unit: 'kg', target: 20, key: 'labor'    },
      { id: 'oil',   name: '석유',   unit: 'L',  target: 20, key: 'resource' },
      { id: 'car',   name: '자동차', unit: '대', target: 12, key: 'capital'  },
      { id: 'phone', name: '스마트폰', unit: '대', target: 16, key: 'tech'     }
    ],
    countries: [
      { id: 'gaon', name: '가온국', color: '#2f6fdb', flag: 'stripes',  stats: { capital: 2, resource: 3, labor: 5, tech: 1 } },
      { id: 'narae', name: '나래국', color: '#d9622b', flag: 'circle',   stats: { capital: 3, resource: 5, labor: 1, tech: 2 } },
      { id: 'daon', name: '다온국', color: '#13917f', flag: 'cross',    stats: { capital: 5, resource: 1, labor: 4, tech: 3 } },
      { id: 'raon', name: '라온국', color: '#8e44b8', flag: 'diagonal', stats: { capital: 4, resource: 1, labor: 2, tech: 5 } }
    ]
  };

  const STAGES = [
    { n: 1, title: '대기 · 국가 정보 확인', round: 1 },
    { n: 2, title: '1차 생산 실험 (자급자족)', round: 1 },
    { n: 3, title: '1차 결과 분석', round: 1 },
    { n: 4, title: '2차 전략 수립', round: 2 },
    { n: 5, title: '2차 생산', round: 2 },
    { n: 6, title: '무역 협상 및 거래', round: 2 },
    { n: 7, title: '실험 결과 비교', round: 2 },
    { n: 8, title: '최종 탐구 정리', round: 2 }
  ];

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const itemById = (cfg, id) => cfg.items.find((i) => i.id === id);
  const countryById = (cfg, id) => cfg.countries.find((c) => c.id === id);

  /* ---------- 2. 생산 규칙 ----------
   * "물품마다 가장 중요한 생산 조건이 하나 있다.
   *  그 조건이 매우 강한(5) 나라는 한 번에 목표량만큼,
   *  그렇지 않은 나라는 목표량의 1/4만큼 만든다."           */
  function output(cfg, countryId, itemId) {
    const c = countryById(cfg, countryId);
    const it = itemById(cfg, itemId);
    const level = c.stats[it.key] || 0;
    if (level >= cfg.strongLevel) return it.target;
    return Math.max(1, Math.round(it.target * cfg.weakShare));
  }
  function outputTable(cfg) {
    const t = {};
    cfg.countries.forEach((c) => {
      t[c.id] = {};
      cfg.items.forEach((it) => { t[c.id][it.id] = output(cfg, c.id, it.id); });
    });
    return t;
  }
  // 교사용: 1회 생산량이 목표량에 도달하는 물품(특화 물품)
  function specialties(cfg, countryId) {
    return cfg.items.filter((it) => output(cfg, countryId, it.id) >= it.target).map((it) => it.id);
  }

  /* ---------- 3. 확보율 (보유량과 분리된 파생 값) ---------- */
  function security(cfg, inv) {
    const per = {};
    let sum = 0;
    cfg.items.forEach((it) => {
      const have = inv[it.id] || 0;
      const p = Math.min(have / it.target * 100, 100);
      per[it.id] = Math.round(p * 100) / 100;
      sum += p;
    });
    const overall = Math.round(sum / cfg.items.length * 100) / 100;
    return { per, overall };
  }
  function fmtPct(p) {
    const r = Math.round(p * 100) / 100;
    return (Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '')) + '%';
  }

  /* ---------- 4. 상태 ---------- */
  function emptyInv(cfg) { const o = {}; cfg.items.forEach((it) => { o[it.id] = 0; }); return o; }
  function freshCountry(cfg) { return { inv: emptyInv(cfg), chances: cfg.chances, log: [] }; }

  function createState(cfg) {
    const countries = {};
    cfg.countries.forEach((c) => { countries[c.id] = freshCountry(cfg); });
    return {
      v: 1, stage: 1,
      locks: { production: false, trade: false },
      allowUndo: true,
      countries,
      round1: null,           // 1차 종료 시점 기록 (2차 진입 시 저장)
      trades: [],
      notes: {},              // 국가별 탐구 기록 {countryId: {key: text}}
      seq: 0,
      seenOps: {}             // 중복 요청 방지용 처리된 요청 id
    };
  }
  const roundOf = (stage) => (stage <= 3 ? 1 : 2);
  const fail = (msg) => ({ ok: false, error: msg });
  const okr = (extra) => Object.assign({ ok: true }, extra || {});

  function nextId(s, p) { s.seq += 1; return p + s.seq; }
  function seen(s, opId) {
    if (!opId) return false;
    if (s.seenOps[opId]) return true;
    s.seenOps[opId] = 1;
    return false;
  }

  function canProduce(s) {
    if (s.locks.production) return '선생님이 생산을 잠가 두었어요.';
    if (s.stage === 2 || s.stage === 5 || s.stage === 6) return null;
    return '지금은 생산 단계가 아니에요.';
  }

  function produce(s, cfg, countryId, itemId, opId) {
    if (seen(s, opId)) return fail('이미 처리된 요청이에요.');
    const why = canProduce(s); if (why) return fail(why);
    const c = s.countries[countryId]; if (!c) return fail('나라를 찾을 수 없어요.');
    if (!itemById(cfg, itemId)) return fail('물품을 찾을 수 없어요.');
    if (c.chances <= 0) return fail('생산 기회를 모두 사용했어요.');
    const amount = output(cfg, countryId, itemId);
    c.chances -= 1;
    c.inv[itemId] += amount;
    c.log.push({ id: nextId(s, 'p'), item: itemId, amount, round: roundOf(s.stage) });
    return okr({ amount });
  }

  function undoProduce(s, cfg, countryId) {
    if (!s.allowUndo) return fail('선생님이 되돌리기를 꺼 두었어요.');
    const why = canProduce(s); if (why) return fail(why);
    const c = s.countries[countryId];
    const last = c.log[c.log.length - 1];
    if (!last || last.round !== roundOf(s.stage)) return fail('되돌릴 생산이 없어요.');
    if (c.inv[last.item] < last.amount) return fail('이미 무역에 사용한 물품이라 되돌릴 수 없어요.');
    c.inv[last.item] -= last.amount;
    c.chances += 1;
    c.log.pop();
    return okr({ item: last.item, amount: last.amount });
  }

  /* ---------- 5. 무역 ---------- */
  function canTrade(s) {
    if (s.stage !== 6) return '지금은 무역 단계가 아니에요.';
    if (s.locks.trade) return '선생님이 무역을 잠가 두었어요.';
    return null;
  }
  function validOffer(cfg, o) {
    return o && itemById(cfg, o.item) && Number.isInteger(o.qty) && o.qty > 0;
  }

  function proposeTrade(s, cfg, from, to, give, get, opId) {
    if (seen(s, opId)) return fail('이미 처리된 요청이에요.');
    const why = canTrade(s); if (why) return fail(why);
    if (!s.countries[from] || !s.countries[to] || from === to) return fail('거래할 나라를 다시 골라 주세요.');
    if (!validOffer(cfg, give) || !validOffer(cfg, get)) return fail('보낼 물품과 받을 물품, 수량을 모두 정해 주세요.');
    if (give.item === get.item) return fail('같은 물품끼리는 교환할 수 없어요.');
    if (s.countries[from].inv[give.item] < give.qty) return fail('우리 창고에 그만큼의 물품이 없어요.');
    const t = { id: nextId(s, 't'), from, to, give: clone(give), get: clone(get), status: 'pending' };
    s.trades.push(t);
    return okr({ trade: t });
  }

  // 수락: 양쪽 재고를 '수락하는 순간' 다시 확인하고 한 번에 교환 (원자적 처리)
  function acceptTrade(s, cfg, tradeId, by) {
    const why = canTrade(s); if (why) return fail(why);
    const t = s.trades.find((x) => x.id === tradeId);
    if (!t) return fail('거래를 찾을 수 없어요.');
    if (t.status !== 'pending') return fail('이미 끝난 거래예요.');
    if (t.to !== by) return fail('거래를 받은 나라만 수락할 수 있어요.');
    const A = s.countries[t.from], B = s.countries[t.to];
    if (A.inv[t.give.item] < t.give.qty) return fail('제안한 나라의 창고에 물품이 부족해서 거래할 수 없어요.');
    if (B.inv[t.get.item] < t.get.qty) return fail('우리 창고에 보낼 물품이 부족해요.');
    A.inv[t.give.item] -= t.give.qty; B.inv[t.give.item] += t.give.qty;
    B.inv[t.get.item] -= t.get.qty;   A.inv[t.get.item] += t.get.qty;
    t.status = 'done';
    return okr({ trade: t });
  }
  function rejectTrade(s, tradeId, by) {
    const t = s.trades.find((x) => x.id === tradeId);
    if (!t || t.status !== 'pending') return fail('이미 끝난 거래예요.');
    if (by !== t.to && by !== t.from && by !== 'teacher') return fail('권한이 없어요.');
    t.status = by === t.from ? 'withdrawn' : 'rejected';
    return okr();
  }
  // 교사: 성립된 거래 되돌리기 (되돌릴 물품이 남아 있을 때만)
  function revertTrade(s, tradeId) {
    const t = s.trades.find((x) => x.id === tradeId);
    if (!t || t.status !== 'done') return fail('성립된 거래만 취소할 수 있어요.');
    const A = s.countries[t.from], B = s.countries[t.to];
    if (B.inv[t.give.item] < t.give.qty || A.inv[t.get.item] < t.get.qty) return fail('이미 다른 거래에 쓰인 물품이 있어 되돌릴 수 없어요.');
    B.inv[t.give.item] -= t.give.qty; A.inv[t.give.item] += t.give.qty;
    A.inv[t.get.item] -= t.get.qty;   B.inv[t.get.item] += t.get.qty;
    t.status = 'reverted';
    return okr();
  }

  /* ---------- 6. 단계 전환 ---------- */
  function snapshot(s, cfg) {
    const out = {};
    cfg.countries.forEach((c) => {
      const st = s.countries[c.id];
      out[c.id] = { inv: clone(st.inv), log: clone(st.log), chances: st.chances, sec: security(cfg, st.inv) };
    });
    return out;
  }
  function setStage(s, cfg, n) {
    if (n < 1 || n > STAGES.length) return fail('없는 단계예요.');
    const from = s.stage;
    if (roundOf(from) === 1 && roundOf(n) === 2) {
      // 1차 → 2차: 1차 기록 저장 후 창고·기회 초기화
      s.round1 = snapshot(s, cfg);
      cfg.countries.forEach((c) => { s.countries[c.id] = freshCountry(cfg); });
      s.trades = [];
    } else if (roundOf(from) === 2 && roundOf(n) === 1 && s.round1) {
      // 2차 → 1차로 되돌아가기: 1차 상태 복원 (2차 진행은 지워짐)
      cfg.countries.forEach((c) => {
        const r = s.round1[c.id];
        s.countries[c.id] = { inv: clone(r.inv), chances: r.chances, log: clone(r.log) };
      });
      s.round1 = null; s.trades = [];
    }
    // 진행 중이던 제안은 단계가 바뀌면 무효
    s.trades.forEach((t) => { if (t.status === 'pending' && n !== 6) t.status = 'expired'; });
    s.stage = n;
    return okr();
  }

  /* ---------- 7. 결과 요약 ---------- */
  function tradeSummary(s, cfg, countryId) {
    const ex = emptyInv(cfg), im = emptyInv(cfg);
    s.trades.filter((t) => t.status === 'done').forEach((t) => {
      if (t.from === countryId) { ex[t.give.item] += t.give.qty; im[t.get.item] += t.get.qty; }
      if (t.to === countryId)   { ex[t.get.item] += t.get.qty;   im[t.give.item] += t.give.qty; }
    });
    return { exports: ex, imports: im };
  }
  function productionCounts(cfg, log) {
    const n = {}; cfg.items.forEach((it) => { n[it.id] = 0; });
    log.forEach((l) => { n[l.item] += 1; });
    return n;
  }
  function totals(s, cfg) {
    const t = emptyInv(cfg);
    cfg.countries.forEach((c) => cfg.items.forEach((it) => { t[it.id] += s.countries[c.id].inv[it.id]; }));
    return t;
  }

  /* ---------- 8. 규칙 검증 (교사 설정 화면과 검증 스크립트가 함께 사용) ---------- */
  // 생산 기회 n회를 물품에 나누는 모든 조합
  function allSplits(k, n) {
    if (k === 1) return [[n]];
    const out = [];
    for (let i = 0; i <= n; i++) allSplits(k - 1, n - i).forEach((r) => out.push([i].concat(r)));
    return out;
  }
  function verifyAutarky(cfg) {
    const res = {};
    const splits = allSplits(cfg.items.length, cfg.chances);
    cfg.countries.forEach((c) => {
      let best = -1, bestSplit = null, anyFull = false;
      splits.forEach((sp) => {
        const inv = {};
        cfg.items.forEach((it, i) => { inv[it.id] = sp[i] * output(cfg, c.id, it.id); });
        const sec = security(cfg, inv);
        if (cfg.items.every((it) => sec.per[it.id] >= 100)) anyFull = true;
        if (sec.overall > best) { best = sec.overall; bestSplit = sp; }
      });
      res[c.id] = { combos: splits.length, anyFull, best, bestSplit };
    });
    return { pass: Object.values(res).every((r) => !r.anyFull), combos: splits.length, perCountry: res };
  }
  // 2차: 특화 생산 후 실제 거래 함수로 서로 교환 → 모두 100% 가능한지
  function verifyTradePlan(cfg) {
    const s = createState(cfg);
    const log = [];
    setStage(s, cfg, 5);
    const spec = {};
    for (const c of cfg.countries) {
      const sp = specialties(cfg, c.id);
      if (sp.length !== 1) return { pass: false, reason: c.name + '의 특화 물품이 ' + sp.length + '개입니다. 각 나라마다 정확히 1개가 되도록 맞춰 주세요.' };
      spec[c.id] = sp[0];
      for (let i = 0; i < cfg.chances; i++) produce(s, cfg, c.id, sp[0]);
    }
    const owners = Object.values(spec);
    if (new Set(owners).size !== cfg.items.length) return { pass: false, reason: '어떤 물품은 특화한 나라가 없거나 두 나라 이상입니다.' };
    setStage(s, cfg, 6);
    const before = totals(s, cfg);
    let conserved = true;
    const ids = cfg.countries.map((c) => c.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const give = { item: spec[a], qty: itemById(cfg, spec[a]).target };
      const get = { item: spec[b], qty: itemById(cfg, spec[b]).target };
      const p = proposeTrade(s, cfg, a, b, give, get);
      const r = p.ok ? acceptTrade(s, cfg, p.trade.id, b) : p;
      log.push({ a, b, give, get, ok: r.ok, error: r.error });
      const now = totals(s, cfg);
      cfg.items.forEach((it) => { if (now[it.id] !== before[it.id]) conserved = false; });
    }
    const final = {};
    ids.forEach((id) => { final[id] = security(cfg, s.countries[id].inv).overall; });
    const allFull = Object.values(final).every((v) => v >= 100);
    return { pass: allFull && conserved && log.every((l) => l.ok), conserved, final, trades: log, spec };
  }

  root.TradeLogic = {
    DEFAULT_CONFIG, STAGES, clone, itemById, countryById, roundOf,
    output, outputTable, specialties, security, fmtPct,
    createState, produce, undoProduce, canProduce, canTrade,
    proposeTrade, acceptTrade, rejectTrade, revertTrade, setStage,
    tradeSummary, productionCounts, totals, verifyAutarky, verifyTradePlan, emptyInv
  };
  if (typeof module !== 'undefined') module.exports = root.TradeLogic;
})(typeof window !== 'undefined' ? window : globalThis);
