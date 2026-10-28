/* 교사 화면: 구글 로그인 → 수업 방 고르기/만들기 → 관제·발표 화면 */
import { configured, fs, authApi, connect } from './fb.js';
import { createRemoteBackend, createRoom, listMyRooms, releaseSeat, deleteRoom } from './remote.js';
import { setupNotice, gateClick, el } from './common.js';

const L = window.TradeLogic, UI = window.TradeUI, esc = UI.esc;
const KEY_ROOM = 'tradeGame.teacherRoom';
const main = el('main');
let ctx = null, user = null, backend = null, code = null, lastEx = {};
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };

function clearHeader() { el('stagechip').hidden = true; el('views').innerHTML = ''; el('hdr-extra').innerHTML = user ? `<span>${esc(user.displayName || user.email || '교사')}</span>` : ''; }

function loginScreen(msg) {
  clearHeader();
  main.innerHTML = `<div class="gate"><section class="panel"><h2>교사 로그인</h2>
    <p style="margin:0">수업 방을 만들고 관제하려면 구글 계정으로 로그인하세요. 학생은 로그인 없이 입장 코드로 들어옵니다.</p>
    ${msg ? `<p class="callout" style="margin:0;color:var(--warn)">${esc(msg)}</p>` : ''}
    <button class="btn accent" data-g="login">구글 계정으로 로그인</button>
    <p class="muted" style="margin:0;font-size:14px">인터넷 없이 흐름만 시험하려면 <a href="demo.html">시연 모드</a>를 여세요.</p></section></div>`;
}

async function roomsScreen(msg) {
  clearHeader();
  if (backend) { backend.stop(); backend = null; }
  main.innerHTML = `<div class="gate"><section class="panel"><p class="muted" style="margin:0">수업 방을 불러오는 중…</p></section></div>`;
  let rooms = [];
  try { rooms = await listMyRooms(fs, ctx.db, user.uid); } catch (e) { console.error(e); msg = msg || '수업 방 목록을 불러오지 못했어요. Firebase 설정(README 2단계)과 인터넷 연결을 확인해 주세요.'; }
  const last = store.get(KEY_ROOM);
  main.innerHTML = `<div class="gate"><section class="panel"><h2>수업 방</h2>
    ${msg ? `<p class="callout" style="margin:0;color:var(--warn)">${esc(msg)}</p>` : ''}
    <button class="btn accent" data-g="create">새 수업 방 만들기</button>
    ${rooms.length ? `<div class="label">내 수업 방</div><div class="roomlist">${rooms.map((r) => `<button data-g="open" data-code="${r.code}"><span><b class="num" style="font-size:20px;letter-spacing:.1em">${r.code}</b>${r.code === last ? ' <span class="tag pend">최근</span>' : ''}</span><span class="muted">${r.stage}단계 · ${r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko-KR') : ''}</span></button>`).join('')}</div>
      <p class="muted" style="margin:0;font-size:14px">수업마다 새 방을 만드는 것을 권합니다. 지난 방은 지워도 됩니다.</p>` : '<p class="muted" style="margin:0">아직 만든 방이 없어요.</p>'}
    <div class="row"><button class="btn ghost small" data-g="logout">로그아웃</button>${rooms.length ? `<button class="btn ghost small" data-g="cleanup">지난 방 모두 지우기</button>` : ''}</div>
  </section></div>`;
}

function roomPanel() {
  const ex = lastEx, cfg = ex.cfg;
  const url = location.origin + location.pathname.replace(/teacher(\.html)?$/, '') + '?room=' + code;
  const seats = cfg ? cfg.countries.map((c) => {
    const s = ex.seats ? ex.seats[c.id] : null;
    const st = s ? (s.online ? '<span class="dot"></span> 접속 중' : '<span class="dot off"></span> 연결 끊김') : '<span class="dot idle"></span> 비어 있음';
    return `<div class="seat">${UI.flag(c, 26)}<span><b>${esc(c.name)}</b> <span class="muted" style="font-size:14px">${st}</span></span>${s ? `<button class="btn ghost small" data-a="release" data-c="${c.id}">자리 비우기</button>` : '<span></span>'}</div>`;
  }).join('') : '';
  return `<section class="panel"><h2>수업 방 · 접속 현황</h2><div class="grid2">
    <div style="display:grid;gap:10px;align-content:start;min-width:0"><div class="label">입장 코드</div><div class="bigcode">${code}</div>
      <div class="copyline"><code id="student-url">${esc(url)}</code><button class="btn ghost small" data-a="copy-url">주소 복사</button></div>
      <p class="muted" style="margin:0;font-size:14px">학생 태블릿에서 이 주소를 열거나, 학생 첫 화면에 입장 코드를 입력합니다. 모둠마다 나라를 하나씩 고르면 그 기기는 그 나라로 고정됩니다.</p></div>
    <div style="display:grid;gap:8px;align-content:start;min-width:0"><div class="label">나라별 기기</div><div class="seats">${seats}</div>
      <p class="muted" style="margin:0;font-size:14px">기기를 바꿔야 할 때는 [자리 비우기]를 누르면 새 기기에서 그 나라를 다시 고를 수 있어요. 기기가 고장 나면 위쪽 나라 탭에서 교사가 대신 조작할 수도 있습니다.</p></div></div>
    <div class="row" style="margin-top:12px"><button class="btn ghost small" data-a="rooms">다른 방 열기</button><button class="btn warn small" data-a="reset">게임 전체 초기화</button><button class="btn ghost small" data-a="logout">로그아웃</button></div></section>`;
}

function openRoom(c) {
  code = c; store.set(KEY_ROOM, c);
  if (backend) backend.stop();
  lastEx = {};
  backend = createRemoteBackend({ fs, db: ctx.db, code, uid: user.uid, watchSeats: true, onChange: (S, cfg, ex) => {
    if (!S) { store.del(KEY_ROOM); roomsScreen('이 방이 없어졌어요. 새 방을 만들어 주세요.'); return; }
    lastEx = Object.assign({ cfg }, ex);
    UI.update(S, cfg, ex);
  } });
  UI.mount({ backend, mode: 'teacher', tabs: ['teacher', 'projector', ...L.DEFAULT_CONFIG.countries.map((x) => x.id)],
    headerExtra: () => `<span class="num" style="letter-spacing:.1em">방 ${code}</span><span class="dot ${lastEx.online === false ? 'off' : ''}"></span>`,
    teacherExtra: roomPanel,
    onAction(a, b) {
      if (a === 'copy-url') {
        const t = el('student-url').textContent;
        const fallback = () => { const r = document.createRange(); r.selectNodeContents(el('student-url')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); UI.toast('주소를 선택했어요. 복사해서 쓰세요.'); };
        try { navigator.clipboard.writeText(t).then(() => UI.toast('학생 주소를 복사했어요.'), fallback); } catch (e) { fallback(); }
        return true;
      }
      if (a === 'release') {
        const cid = b.dataset.c, c = L.countryById(lastEx.cfg, cid);
        UI.ask(`${c.name} 자리를 비울까요?`, '지금 그 나라로 들어와 있는 기기의 연결이 끊기고, 다른 기기에서 그 나라를 다시 고를 수 있게 됩니다. 창고와 진행 상황은 그대로 남습니다.', '자리 비우기',
          () => releaseSeat(fs, ctx.db, code, cid).then(() => UI.toast('자리를 비웠어요.'), (e) => { console.error(e); UI.toast('자리를 비우지 못했어요.', 'warn'); }), true);
        return true;
      }
      if (a === 'rooms') { store.del(KEY_ROOM); roomsScreen(); return true; }
      if (a === 'logout') { logout(); return true; }
      return false;
    } });
  main.innerHTML = `<section class="panel"><p class="muted" style="margin:0">방 ${code}에 연결하는 중…</p></section>`;
}

async function logout() { if (backend) backend.stop(); backend = null; store.del(KEY_ROOM); await authApi.signOut(ctx.auth); }

gateClick(async (g, b) => {
  try {
    if (g === 'login') {
      const p = new authApi.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      await authApi.signInWithPopup(ctx.auth, p);
    } else if (g === 'create') {
      b.disabled = true; b.textContent = '만드는 중…';
      const c = await createRoom(fs, ctx.db, user.uid, L.DEFAULT_CONFIG);
      openRoom(c);
    } else if (g === 'open') openRoom(b.dataset.code);
    else if (g === 'logout') logout();
    else if (g === 'cleanup') {
      UI.ask('지난 방을 모두 지울까요?', '내가 만든 모든 수업 방과 그 안의 기록이 지워집니다. 되돌릴 수 없습니다.', '모두 지우기', async () => {
        const rooms = await listMyRooms(fs, ctx.db, user.uid);
        for (const r of rooms) await deleteRoom(fs, ctx.db, r.code);
        store.del(KEY_ROOM); roomsScreen();
      }, true);
    }
  } catch (e) {
    console.error(e);
    const c = String(e.code || '');
    if (c.includes('popup-closed') || c.includes('cancelled-popup')) return;
    if (c.includes('unauthorized-domain')) return loginScreen('이 주소가 Firebase 로그인 허용 도메인에 없어요. README 2-4단계를 확인해 주세요.');
    if (c.includes('operation-not-allowed')) return loginScreen('Firebase에서 Google 로그인이 꺼져 있어요. README 2-3단계를 확인해 주세요.');
    if (c.includes('permission')) return roomsScreen('권한이 없어요. 보안 규칙(firestore.rules)을 게시했는지 확인해 주세요.');
    UI.toast('처리하지 못했어요. 인터넷 연결을 확인해 주세요.', 'warn');
    if (g === 'create') roomsScreen();
  }
});

if (!configured) setupNotice(main);
else {
  ctx = connect();
  authApi.onAuthStateChanged(ctx.auth, async (u) => {
    if (!u || u.isAnonymous) { user = null; if (backend) { backend.stop(); backend = null; } loginScreen(); return; }
    if (user && user.uid === u.uid && backend) return;
    user = u;
    const last = store.get(KEY_ROOM);
    if (last) {
      try { const s = await fs.getDoc(fs.doc(ctx.db, 'rooms', last)); if (s.exists() && s.data().ownerUid === u.uid) { openRoom(last); return; } } catch (e) { console.error(e); }
      store.del(KEY_ROOM);
    }
    roomsScreen();
  });
}
