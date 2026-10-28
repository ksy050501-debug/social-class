/* 학생 화면: 입장 코드 → 나라 고르기(기기당 한 번) → 우리나라 화면 */
import { configured, fs, authApi, connect } from './fb.js';
import { createRemoteBackend, joinSeat, myCountry, heartbeat, roomRefs, HEARTBEAT } from './remote.js';
import { setupNotice, gateClick, el } from './common.js';

const L = window.TradeLogic, UI = window.TradeUI, esc = UI.esc;
const KEY_CODE = 'tradeGame.studentRoom';
const main = el('main');
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
let ctx = null, uid = null, code = null, cid = null, backend = null, cfg = null, online = true;
const stops = [];
let beat = null, wake = null;

function stopAll() { stops.splice(0).forEach((f) => { try { f(); } catch (e) {} }); if (backend) { backend.stop(); backend = null; } clearInterval(beat); }
function header(text) { el('stagechip').hidden = true; el('views').innerHTML = ''; el('hdr-extra').innerHTML = text || ''; }
const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

function codeScreen(msg) {
  stopAll(); header();
  const pre = cleanCode(new URLSearchParams(location.search).get('room') || store.get(KEY_CODE) || '');
  main.innerHTML = `<div class="gate"><form class="panel" id="code-form"><h2>입장 코드를 입력하세요</h2>
    <p style="margin:0">선생님 화면에 보이는 다섯 글자 코드예요.</p>
    <input class="code-input" id="room-code" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(pre)}" aria-label="입장 코드">
    ${msg ? `<p class="callout" style="margin:0;color:var(--warn)">${esc(msg)}</p>` : ''}
    <button class="btn accent" data-g="enter" type="submit">들어가기</button></form></div>`;
  const inp = el('room-code');
  inp.addEventListener('input', () => { const p = inp.selectionStart; inp.value = cleanCode(inp.value); inp.setSelectionRange(p, p); });
  el('code-form').addEventListener('submit', (e) => { e.preventDefault(); enter(inp.value); });
  if (!pre) inp.focus();
}

async function enter(raw) {
  const c = cleanCode(raw);
  if (c.length !== 5) return codeScreen('입장 코드 다섯 글자를 모두 입력해 주세요.');
  main.innerHTML = `<div class="gate"><section class="panel"><p class="muted" style="margin:0">방을 찾는 중…</p></section></div>`;
  try {
    const r = await fs.getDoc(fs.doc(ctx.db, 'rooms', c));
    if (!r.exists()) { store.del(KEY_CODE); return codeScreen('그런 방이 없어요. 입장 코드를 다시 확인해 주세요.'); }
    code = c; cfg = r.data().cfg; store.set(KEY_CODE, c);
    const mine = await myCountry(fs, ctx.db, code, uid);
    if (mine) return play(mine);
    pickScreen();
  } catch (e) { console.error(e); codeScreen('연결하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.'); }
}

function pickScreen(msg) {
  stopAll(); header(`<span class="num" style="letter-spacing:.1em">방 ${code}</span>`);
  let seats = {};
  const draw = () => {
    main.innerHTML = `<div class="gate"><section class="panel"><h2>우리 모둠의 나라를 고르세요</h2>
      <p style="margin:0">한 번 고르면 이 기기는 그 나라로 고정돼요. 잘못 골랐다면 선생님께 말씀해 주세요.</p>
      ${msg ? `<p class="callout" style="margin:0;color:var(--warn)">${esc(msg)}</p>` : ''}
      <div class="pick">${cfg.countries.map((c) => { const taken = !!seats[c.id];
        return `<button data-g="pick" data-c="${c.id}" ${taken ? 'disabled' : ''} style="border-color:${taken ? 'var(--line)' : esc(c.color)}">${UI.flag(c, 48)}<span>${esc(c.name)}<small>${taken ? '다른 기기가 사용 중' : '들어갈 수 있어요'}</small></span></button>`; }).join('')}</div>
      <button class="btn ghost small" data-g="change-code" style="justify-self:start">다른 입장 코드</button></section></div>`;
  };
  draw();
  stops.push(fs.onSnapshot(roomRefs(fs, ctx.db, code).seats, (s) => { seats = {}; s.forEach((d) => { seats[d.id] = d.data(); }); draw(); }, (e) => console.error(e)));
}

function confirmPick(id) {
  const c = L.countryById(cfg, id);
  UI.ask(`${c.name}(으)로 들어갈까요?`, `<p style="margin:0">이 기기는 수업이 끝날 때까지 <b>${esc(c.name)}</b> 화면으로 고정돼요.</p>`, `${c.name}으로 들어가기`, async () => {
    try {
      const r = await joinSeat(fs, ctx.db, code, uid, id);
      if (!r.ok) return pickScreen(r.error);
      play(id);
    } catch (e) { console.error(e); pickScreen('들어가지 못했어요. 인터넷 연결을 확인하고 다시 골라 주세요.'); }
  });
}

function play(id) {
  stopAll(); cid = id;
  const R = roomRefs(fs, ctx.db, code);
  const c = L.countryById(cfg, id);
  main.innerHTML = `<section class="panel"><p class="muted" style="margin:0">${esc(c.name)} 화면을 불러오는 중…</p></section>`;
  backend = createRemoteBackend({ fs, db: ctx.db, code, uid, onChange: (S, conf, ex) => {
    if (!S) { store.del(KEY_CODE); codeScreen('선생님이 수업 방을 닫았어요.'); return; }
    cfg = conf; online = ex.online !== false; UI.update(S, conf, ex);
  } });
  UI.mount({ backend, mode: 'student', fixedView: id, tabs: [],
    headerExtra: () => { const cc = L.countryById(cfg, id); return `${UI.flag(cc, 22)}<b>${esc(cc.name)}</b><span class="num muted" style="color:inherit;opacity:.7">방 ${code}</span><span class="dot ${online ? '' : 'off'}" title="${online ? '연결됨' : '연결 끊김'}"></span>`; } });
  // 선생님이 자리를 비우면 나라 고르기로 돌아감
  let seen = false;
  stops.push(fs.onSnapshot(R.member(uid), (s) => {
    if (s.exists()) { seen = true; return; }
    if (seen || !s.metadata.fromCache) { pickScreen('선생님이 이 기기의 자리를 비웠어요. 나라를 다시 골라 주세요.'); }
  }, (e) => console.error(e)));
  const ping = () => heartbeat(fs, ctx.db, code, id).catch(() => {});
  ping(); beat = setInterval(ping, HEARTBEAT);
  keepAwake();
}

async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); } } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cid && backend) { heartbeat(fs, ctx.db, code, cid).catch(() => {}); keepAwake(); }
});

gateClick((g, b) => {
  if (g === 'enter') return; // form submit이 처리
  if (g === 'pick') confirmPick(b.dataset.c);
  if (g === 'change-code') { store.del(KEY_CODE); history.replaceState(null, '', location.pathname); codeScreen(); }
});
// gateClick이 submit 버튼의 기본 동작을 막으므로 직접 제출
document.addEventListener('click', (e) => { const b = e.target.closest('[data-g="enter"]'); if (b) enter(el('room-code').value); });

if (!configured) setupNotice(main);
else {
  ctx = connect();
  authApi.onAuthStateChanged(ctx.auth, (u) => {
    if (!u) { authApi.signInAnonymously(ctx.auth).catch((e) => { console.error(e); main.innerHTML = `<div class="gate"><section class="panel"><h2>접속하지 못했어요</h2><p style="margin:0">인터넷 연결을 확인한 뒤 새로고침해 주세요. 계속 안 되면 선생님께 말씀해 주세요.</p><p class="muted" style="margin:0;font-size:13px">(Firebase 익명 로그인이 켜져 있는지 확인: README 2-3단계)</p></section></div>`; }); return; }
    if (uid === u.uid) return;
    uid = u.uid;
    const pre = new URLSearchParams(location.search).get('room') || store.get(KEY_CODE);
    if (pre && cleanCode(pre).length === 5) enter(pre); else codeScreen();
  });
}
