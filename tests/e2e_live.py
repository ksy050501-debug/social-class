"""교사 1대 + 학생 4대 동시 접속 테스트 (가짜 Firebase 사용)
실행: python3 tests/e2e_live.py   (저장소 최상위에서)
"""
import asyncio, os, subprocess, sys, time, json, re
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAKE = os.path.join(ROOT, 'tests', 'fake-firebase')
SHOTS = os.path.join(ROOT, 'tests', 'shots')
os.makedirs(SHOTS, exist_ok=True)
PORT = 8123
BASE = f'http://127.0.0.1:{PORT}'
IDS = ['gaon', 'narae', 'daon', 'raon']
SPEC = {'gaon': 'rice', 'narae': 'oil', 'daon': 'car', 'raon': 'phone'}
QTY = {'rice': 400, 'oil': 800, 'car': 160, 'phone': 1600}   # 1년 목표량
UNIT = {'rice': 200, 'oil': 400, 'car': 80, 'phone': 800}   # 고정 거래량 (목표량의 절반)
results = []

def check(name, cond, detail=''):
    results.append((cond, name, detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail else ''))

async def route(context):
    async def fake(route_):
        name = route_.request.url.rsplit('/', 1)[-1]
        await route_.fulfill(path=os.path.join(FAKE, name), content_type='application/javascript')
    await context.route('https://www.gstatic.com/firebasejs/**', fake)
    async def cfg(route_):
        await route_.fulfill(body='export const firebaseConfig = { apiKey: "test", projectId: "test" };', content_type='application/javascript')
    await context.route('**/js/firebase-config.js', cfg)
    await context.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))

async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    errors = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
            await route(ctx)
            def watch(pg, label):
                pg.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
                pg.on('console', lambda m: errors.append(f'{label}: {m.text}') if m.type == 'error' else None)

            # ---------- 교사: 로그인, 방 만들기 ----------
            T = await ctx.new_page(); watch(T, 'teacher')
            await T.goto(BASE + '/teacher.html')
            await T.click('[data-g=login]')
            await T.click('[data-g=create]')
            await T.wait_for_selector('.bigcode')
            code = (await T.inner_text('.bigcode')).strip()
            check('교사가 방을 만들고 입장 코드를 받음', bool(re.fullmatch(r'[A-Z0-9]{5}', code)), code)
            await T.screenshot(path=f'{SHOTS}/t1-room.png', full_page=True)

            # ---------- 학생 4대 입장 ----------
            S = {}
            for i, cid in enumerate(IDS):
                pg = await ctx.new_page(); await pg.set_viewport_size({'width': 820, 'height': 1180}); watch(pg, cid)
                if i == 0:
                    await pg.goto(BASE + '/')
                    await pg.fill('#room-code', code.lower())
                    await pg.click('[data-g=enter]')
                else:
                    await pg.goto(BASE + '/?room=' + code)
                await pg.wait_for_selector(f'[data-g=pick][data-c={cid}]')
                if i == 1:
                    dis = await pg.is_disabled('[data-g=pick][data-c=gaon]')
                    check('이미 고른 나라는 다른 기기에서 고를 수 없게 표시', dis)
                    await pg.screenshot(path=f'{SHOTS}/s-pick.png', full_page=True)
                await pg.click(f'[data-g=pick][data-c={cid}]')
                await pg.click('[data-a=modal-yes]')
                await pg.wait_for_selector('.nation h2')
                S[cid] = pg
            await asyncio.sleep(0.5)
            await T.bring_to_front()
            online = await T.locator('.seat .dot:not(.off):not(.idle)').count()
            check('교사 화면에 네 기기 모두 접속 중으로 표시', online == 4, f'{online}대')
            await S['gaon'].screenshot(path=f'{SHOTS}/s1-info.png', full_page=True)

            async def stage(n, confirm=False):
                await T.click(f'.stepper-stages [data-a=stage][data-n="{n}"]')
                if confirm: await T.click('[data-a=modal-yes]')
                await asyncio.sleep(0.4)
            async def produce(cid, item, n=1):
                for _ in range(n):
                    btn = S[cid].locator(f'[data-a=produce][data-i={item}]')
                    await btn.wait_for(); await S[cid].wait_for_function(f'!document.querySelector("[data-a=produce][data-i={item}]").disabled')
                    await btn.click(); await asyncio.sleep(0.15)

            # ---------- 1차 ----------
            await stage(2)
            await S['gaon'].wait_for_selector('[data-a=produce]:not([disabled])')
            check('교사가 단계를 바꾸면 학생 화면이 바로 생산 화면으로 바뀜', True)
            # 빠른 연타: 같은 버튼 6번 빠르게
            for _ in range(6):
                await S['gaon'].click('[data-a=produce][data-i=rice]', no_wait_after=True, force=True)
            await asyncio.sleep(1.2)
            st = json.loads(await T.evaluate("localStorage.getItem('FAKEFS')"))
            g = st[f'rooms/{code}/countries/gaon']['d']
            check('생산 버튼 연타 6번 → 남은 기회 이하로만 생산, 수량 일치', g['chances'] >= 0 and g['inv']['rice'] == 400 * (4 - g['chances']), f"기회 {g['chances']}, 쌀 {g['inv']['rice']}만 톤")
            # 나머지 기회 소진(가온), 다른 나라는 네 가지 한 번씩
            left = g['chances']
            for it in ['oil', 'car', 'phone'][:left]: await produce('gaon', it)
            for cid in ['narae', 'daon', 'raon']:
                for it in ['rice', 'oil', 'car', 'phone']: await produce(cid, it)
            await asyncio.sleep(0.6)
            # 새로고침 후에도 같은 나라·같은 진행
            await S['narae'].reload(); await S['narae'].wait_for_selector('.nation h2')
            nm = await S['narae'].inner_text('.nation h2')
            chips = await S['narae'].locator('.big.num').inner_text()
            check('학생 새로고침 → 같은 나라, 같은 확보율로 이어짐', nm.strip() == '나온국' and chips.replace('\n', '').startswith('43.75'), f'{nm.strip()} {chips!r}')
            await S['daon'].screenshot(path=f'{SHOTS}/s2-round1.png', full_page=True)

            await stage(3)
            await stage(5, confirm=True)
            await S['gaon'].click('[data-a=produce][data-i=oil]')
            await S['gaon'].wait_for_selector('.modal')
            warn = await S['gaon'].inner_text('.modal')
            n_cancel = await S['gaon'].locator('.modal [data-a=modal-no]').count()
            await S['gaon'].click('[data-a=modal-yes]')
            st = json.loads(await T.evaluate("localStorage.getItem('FAKEFS')"))
            check('2차에서 특화 물품이 아닌 것을 누르면 경고창, 생산 안 됨', '가장 잘 만드는 물품' in warn and n_cancel == 0 and st[f'rooms/{code}/countries/gaon']['d']['chances'] == 4)
            await T.bring_to_front()
            nxt_disabled = await T.is_disabled('[data-a=stage]:has-text("다음 단계")')
            check('특화 생산을 다 안 끝내면 교사 [다음 단계] 버튼이 잠김', nxt_disabled)
            for cid in IDS: await produce(cid, SPEC[cid], 4)
            await asyncio.sleep(0.5)
            await stage(6)

            # ---------- 무역: 배를 몰아 항구에 도착 → 정해진 양으로 요청 → 상대는 수락만 ----------
            def fsget():
                return T.evaluate("localStorage.getItem('FAKEFS')")
            async def sail(a, bb):
                await S[a].evaluate(f"window.TradeUI.sailTo('{a}', '{bb}')"); await asyncio.sleep(0.2)
            async def request(a, bb, gi, ti):
                pg = S[a]
                await pg.click(f'[data-a=pg][data-k=give][data-i={gi}]')
                await pg.click(f'[data-a=pg][data-k=get][data-i={ti}]')
                await pg.click('[data-a=sea-propose]')
                await asyncio.sleep(0.4)
            async def accept(bb):
                await S[bb].wait_for_selector('.letter.incoming [data-a=accept]:not([disabled])')
                await S[bb].click('.letter.incoming [data-a=accept]'); await asyncio.sleep(0.5)

            # 실제 방향키 항해: 가온국 항구에서 오른쪽으로 쭉 가면 나온국 항구
            await S['gaon'].bring_to_front()
            await S['gaon'].wait_for_selector('#sea')
            await S['gaon'].keyboard.down('ArrowRight'); await asyncio.sleep(2.4); await S['gaon'].keyboard.up('ArrowRight')
            await asyncio.sleep(0.3)
            arrived = await S['gaon'].locator('.sea-banner.arrive').count()
            check('방향키로 배를 몰아 다른 나라 항구에 도착', arrived == 1 and await S['gaon'].locator('[data-a=sea-propose]').count() == 1)
            await S['gaon'].screenshot(path=f'{SHOTS}/s3-port.png', full_page=True)
            await request('gaon', 'narae', 'rice', 'oil')
            st = json.loads(await fsget())
            tr = [v['d'] for k, v in st.items() if k.startswith(f'rooms/{code}/trades/')]
            check('요청 수량은 정해진 양(쌀 200만 톤 ↔ 석유 400만 톤)', len(tr) == 1 and tr[0]['give']['qty'] == UNIT['rice'] and tr[0]['get']['qty'] == UNIT['oil'], str(tr))
            await S['narae'].wait_for_selector('.letter.incoming [data-a=accept]')
            n_rej = await S['narae'].locator('.letter.incoming [data-a=reject]').count()
            check('받은 요청에는 수락 버튼만 있음(거절 없음)', n_rej == 0)
            await S['narae'].screenshot(path=f'{SHOTS}/s3-incoming.png', full_page=True)
            await accept('narae')

            # 교사: 성립한 거래 취소, 기다리는 요청 무효 처리
            await sail('gaon', 'daon'); await request('gaon', 'daon', 'rice', 'car'); await accept('daon')
            await T.bring_to_front()
            await T.click('[data-a=revert]'); await T.click('[data-a=modal-yes]'); await asyncio.sleep(0.6)
            st = json.loads(await fsget())
            check('교사가 거래를 취소하면 창고가 되돌아감', st[f'rooms/{code}/countries/gaon']['d']['inv']['rice'] == 1400)
            await sail('gaon', 'raon'); await request('gaon', 'raon', 'rice', 'phone')
            await asyncio.sleep(0.4)
            while await T.locator('[data-a=t-cancel]').count():
                await T.click('[data-a=t-cancel] >> nth=0'); await asyncio.sleep(0.5)

            # 나라 쌍마다 두 번씩 (가온-나온는 한 번 남음) → 네 나라 모두 100%
            for a, bb, n in [('gaon', 'narae', 1), ('gaon', 'daon', 2), ('gaon', 'raon', 2), ('narae', 'daon', 2), ('narae', 'raon', 2), ('daon', 'raon', 2)]:
                for _ in range(n):
                    await sail(a, bb); await request(a, bb, SPEC[a], SPEC[bb]); await accept(bb)
            st = json.loads(await fsget())
            invs = {cid: st[f'rooms/{code}/countries/{cid}']['d']['inv'] for cid in IDS}
            full = all(invs[c][i] >= QTY[i] for c in IDS for i in QTY)
            tot = {i: sum(invs[c][i] for c in IDS) for i in QTY}
            check('네 나라 모두 100% 달성', full, json.dumps(invs, ensure_ascii=False))
            check('전체 물품 합계 보존', tot == {i: QTY[i] * 4 for i in QTY}, str(tot))
            await T.screenshot(path=f'{SHOTS}/t2-trade.png', full_page=True)

            # 단계 변경 중 요청: 요청을 띄워 두고 교사가 7단계로 → 수락 버튼 사라지고 요청 무효
            await sail('gaon', 'narae'); await request('gaon', 'narae', 'rice', 'oil')
            await stage(7)
            await asyncio.sleep(0.6)
            n_acc = await S['narae'].locator('[data-a=accept]').count()
            st = json.loads(await fsget())
            exp = [v['d']['status'] for k, v in st.items() if k.startswith(f'rooms/{code}/trades/') and v['d']['status'] not in ('done', 'reverted', 'rejected', 'withdrawn')]
            check('단계가 바뀌면 남은 요청은 무효, 학생 화면에서 수락 불가', n_acc == 0 and exp == ['expired'], str(exp))
            await S['gaon'].screenshot(path=f'{SHOTS}/s4-compare.png', full_page=True)
            await T.click('[data-a=view][data-v=projector]'); await asyncio.sleep(0.5)
            await T.screenshot(path=f'{SHOTS}/t3-projector.png', full_page=True)
            pj = await T.inner_text('.together .v')
            check('발표 화면: 네 나라가 함께 확보한 비율 100%', pj.strip() == '100%', pj)

            # 자리 비우기 → 학생 기기는 나라 고르기로, 새 기기가 그 나라로 들어올 수 있음
            await T.click('[data-a=view][data-v=teacher]'); await asyncio.sleep(0.3)
            await T.click('[data-a=release][data-c=raon]'); await T.click('[data-a=modal-yes]'); await asyncio.sleep(1.0)
            back = await S['raon'].locator('[data-g=pick][data-c=raon]').count()
            check('교사가 자리를 비우면 그 기기는 나라 고르기로 돌아감', back == 1)
            await S['raon'].click('[data-g=pick][data-c=raon]'); await S['raon'].click('[data-a=modal-yes]')
            await S['raon'].wait_for_selector('.nation h2')
            v = await S['raon'].inner_text('.big-cmp')
            check('다시 들어가도 라온국 진행 상황이 그대로', '100%' in v)

            # 시연 모드도 정상
            D = await ctx.new_page(); watch(D, 'demo')
            await D.goto(BASE + '/demo.html'); await D.wait_for_selector('#views button')
            check('시연 모드 열림', await D.locator('#views button').count() == 6)

            # 휴대폰 너비에서 가로 스크롤 없음
            M = await ctx.new_page(); await M.set_viewport_size({'width': 390, 'height': 844}); watch(M, 'mobile')
            await M.goto(BASE + '/?room=' + code); await asyncio.sleep(0.8)
            sw = await M.evaluate('document.documentElement.scrollWidth')
            check('휴대폰 너비(390px)에서 가로 넘침 없음', sw <= 390, str(sw))
            await b.close()
    finally:
        srv.terminate()
    bad = [e for e in errors if 'favicon' not in e and 'Failed to load resource' not in e]
    check('브라우저 오류 없음', not bad, '; '.join(bad[:5]))
    fails = [r for r in results if not r[0]]
    print(f'\n결과: {len(results) - len(fails)}/{len(results)} 통과')
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    asyncio.run(main())
