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
QTY = {'rice': 20, 'oil': 20, 'car': 12, 'phone': 16}
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
            check('생산 버튼 연타 6번 → 남은 기회 이하로만 생산, 수량 일치', g['chances'] >= 0 and g['inv']['rice'] == 20 * (4 - g['chances']), f"기회 {g['chances']}, 쌀 {g['inv']['rice']}kg")
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
            check('학생 새로고침 → 같은 나라, 같은 확보율로 이어짐', nm.strip() == '나래국' and chips.replace('\n', '').startswith('43.75'), f'{nm.strip()} {chips!r}')
            await S['daon'].screenshot(path=f'{SHOTS}/s2-round1.png', full_page=True)

            await stage(3)
            await stage(4, confirm=True)
            await stage(5)
            for cid in IDS: await produce(cid, SPEC[cid], 4)
            await asyncio.sleep(0.5)
            await stage(6)

            # ---------- 무역 ----------
            async def propose(a, bb, gi, gq, ti, tq):
                pg = S[a]
                await pg.click(f'[data-a=d-to][data-v={bb}]')
                await pg.click(f'[data-a=d-item][data-k=give][data-i={gi}]')
                await pg.click(f'[data-a=d-item][data-k=get][data-i={ti}]')
                await pg.fill(f'#qty-{a}-give', str(gq)); await pg.press(f'#qty-{a}-give', 'Tab')
                await pg.fill(f'#qty-{a}-get', str(tq)); await pg.press(f'#qty-{a}-get', 'Tab')
                await pg.click('[data-a=propose]')
                await asyncio.sleep(0.4)
            await propose('gaon', 'narae', 'rice', 20, 'oil', 20)
            await S['narae'].wait_for_selector('.deal.incoming [data-a=accept]')
            await S['narae'].screenshot(path=f'{SHOTS}/s3-incoming.png', full_page=True)
            await S['narae'].click('.deal.incoming [data-a=accept]')
            await asyncio.sleep(0.6)

            # 동시 수락 경쟁: 가온국 쌀 60kg으로 40kg씩 두 제안
            await propose('gaon', 'daon', 'rice', 40, 'car', 12)
            await propose('gaon', 'raon', 'rice', 40, 'phone', 16)
            await S['daon'].wait_for_selector('.deal.incoming [data-a=accept]')
            await S['raon'].wait_for_selector('.deal.incoming [data-a=accept]')
            await asyncio.gather(S['daon'].click('.deal.incoming [data-a=accept]'), S['raon'].click('.deal.incoming [data-a=accept]'))
            await asyncio.sleep(1.5)
            st = json.loads(await T.evaluate("localStorage.getItem('FAKEFS')"))
            trades = [v['d'] for k, v in st.items() if k.startswith(f'rooms/{code}/trades/')]
            done40 = [t for t in trades if t['give']['qty'] == 40 and t['status'] == 'done']
            rice = st[f'rooms/{code}/countries/gaon']['d']['inv']['rice']
            check('같은 재고로 두 나라가 동시에 수락 → 하나만 성립, 음수 없음', len(done40) == 1 and rice == 20, f'성립 {len(done40)}건, 가온 쌀 {rice}kg')
            # 교사가 성립한 거래 취소, 남은 제안 무효 처리
            await T.bring_to_front()
            await T.click('[data-a=revert]'); await T.click('[data-a=modal-yes]'); await asyncio.sleep(0.6)
            while await T.locator('[data-a=t-cancel]').count():
                await T.click('[data-a=t-cancel] >> nth=0'); await asyncio.sleep(0.5)
            st = json.loads(await T.evaluate("localStorage.getItem('FAKEFS')"))
            check('교사가 거래를 취소하면 창고가 되돌아감', st[f'rooms/{code}/countries/gaon']['d']['inv']['rice'] == 60)

            # 남은 정상 거래 5건
            for a, bb in [('gaon', 'daon'), ('gaon', 'raon'), ('narae', 'daon'), ('narae', 'raon'), ('daon', 'raon')]:
                await propose(a, bb, SPEC[a], QTY[SPEC[a]], SPEC[bb], QTY[SPEC[bb]])
                await S[bb].wait_for_selector('.deal.incoming [data-a=accept]')
                await S[bb].click('.deal.incoming [data-a=accept]'); await asyncio.sleep(0.5)
            st = json.loads(await T.evaluate("localStorage.getItem('FAKEFS')"))
            invs = {cid: st[f'rooms/{code}/countries/{cid}']['d']['inv'] for cid in IDS}
            full = all(invs[c][i] >= QTY[i] for c in IDS for i in QTY)
            tot = {i: sum(invs[c][i] for c in IDS) for i in QTY}
            check('네 나라 모두 100% 달성', full, json.dumps(invs, ensure_ascii=False))
            check('전체 물품 합계 보존 (쌀80·석유80·자동차48·스마트폰64)', tot == {'rice': 80, 'oil': 80, 'car': 48, 'phone': 64}, str(tot))
            await T.screenshot(path=f'{SHOTS}/t2-trade.png', full_page=True)

            # 단계 변경 중 거래 시도: 제안을 띄워 두고 교사가 7단계로 → 수락 버튼 사라지고 거래 무효
            await propose('gaon', 'narae', 'rice', 1, 'oil', 1)
            await stage(7)
            await asyncio.sleep(0.6)
            n_acc = await S['narae'].locator('[data-a=accept]').count()
            st = json.loads(await T.evaluate("localStorage.getItem('FAKEFS')"))
            exp = [v['d']['status'] for k, v in st.items() if k.startswith(f'rooms/{code}/trades/') and v['d']['give']['qty'] == 1]
            check('단계가 바뀌면 남은 제안은 무효, 학생 화면에서 수락 불가', n_acc == 0 and exp == ['expired'], str(exp))
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
