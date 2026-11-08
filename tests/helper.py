"""도우미 갈매기 힌트 테스트 (시연 모드로 단계별 확인)"""
import asyncio, subprocess, sys, time, os
sys.path.insert(0, os.path.dirname(__file__))
from e2e_live import route, ROOT, PORT, BASE
from playwright.async_api import async_playwright
SH = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SH, exist_ok=True)
res = []
def check(n, c, d=''):
    res.append(c); print(('PASS ' if c else 'FAIL ') + n + (f' — {d}' if d else ''))
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1180, 'height': 820}); await route(ctx)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(BASE + '/demo.html'); await pg.evaluate('localStorage.clear()'); await pg.goto(BASE + '/demo.html#gaon')
            await pg.wait_for_selector('.helper-btn')
            check('오른쪽 아래에 도우미 동그라미가 보임', await pg.locator('.helper-btn').is_visible())
            box = await pg.locator('.helper-btn').bounding_box()
            check('동그라미가 오른쪽 아래 구석에 있음', box['x'] > 1180 - 100 and box['y'] > 820 - 100, str(box))
            check('처음에는 말풍선이 닫혀 있음', await pg.locator('.helper-bubble').count() == 0)
            async def hint():
                if not await pg.locator('.helper-bubble').count(): await pg.click('.helper-btn')
                return (await pg.inner_text('.helper-bubble p')).strip()
            async def stage(n, confirm=False):
                await pg.click('[data-a=view][data-v=teacher]')
                await pg.click(f'.stepper-stages [data-a=stage][data-n="{n}"]')
                if confirm and await pg.locator('[data-a=modal-yes]').count(): await pg.click('[data-a=modal-yes]')
                await asyncio.sleep(0.3)
            async def to(cid): await pg.click(f'[data-a=view][data-v={cid}]'); await asyncio.sleep(0.2)
            await pg.click('[data-a=view][data-v=gaon]'); await asyncio.sleep(0.2)
            h = await hint(); print('  1단계:', h)
            check('1단계 힌트: 표 비교 안내 (전략 정답은 없음)', '비교' in h and '집중' not in h and '교환' not in h)
            await pg.screenshot(path=f'{SH}/helper-1.png')
            await pg.click('[data-a=helper-close]')
            check('× 버튼으로 말풍선이 닫힘', await pg.locator('.helper-bubble').count() == 0)
            await stage(2); await to('gaon')
            check('단계가 바뀌면 새 힌트 표시(빨간 점)', 'new' in (await pg.get_attribute('.helper-btn', 'class')))
            h = await hint(); print('  2단계 시작:', h); check('2단계 힌트: 생산 버튼 안내', '생산하기' in h)
            for it in ['rice', 'rice']:
                await pg.click(f'[data-a=produce][data-i={it}]'); await asyncio.sleep(0.35)
            h = await hint(); print('  2단계 중간:', h); check('남은 기회와 부족한 물품을 알려 줌', '2번 남았' in h and '석유' in h)
            for it in ['oil', 'car']:
                await pg.click(f'[data-a=produce][data-i={it}]'); await asyncio.sleep(0.35)
            h = await hint(); print('  2단계 끝:', h); check('기회를 다 쓰면 왜 100%가 안 됐는지 생각하게 함', '왜 100%' in h and '교환' not in h)
            await pg.screenshot(path=f'{SH}/helper-2.png')
            for cid in ['narae', 'daon', 'raon']:
                await to(cid)
                for it in ['rice', 'oil', 'car', 'phone']:
                    await pg.click(f'[data-a=produce][data-i={it}]'); await asyncio.sleep(0.3)
            await stage(3); await to('gaon'); h = await hint(); print('  3단계:', h); check('3단계: 학습지 안내', '학습지' in h)
            await stage(5, True); await to('gaon'); h = await hint(); print('  5단계:', h); check('5단계: 가장 잘 만드는 물품(쌀) 안내', '쌀' in h and '4번' in h)
            spec = {'gaon': 'rice', 'narae': 'oil', 'daon': 'car', 'raon': 'phone'}
            for cid, it in spec.items():
                await to(cid)
                for _ in range(4): await pg.click(f'[data-a=produce][data-i={it}]'); await asyncio.sleep(0.3)
            await to('gaon'); h = await hint(); check('5단계 끝: 기다리라는 안내', '마쳤어요' in h)
            await pg.click('[data-a=view][data-v=teacher]'); h = await hint(); print('  교사 5단계:', h); check('교사 화면 힌트: 다음 단계 안내', '다음 단계' in h)
            await stage(6); await to('gaon'); h = await hint(); print('  6단계:', h)
            check('6단계: 부족한 물품과 배 몰기 안내', '방향키' in h and '석유' in h)
            await pg.click('[data-a=sea-jump][data-v=narae]'); await asyncio.sleep(0.3)
            h = await hint(); print('  항구 도착:', h); check('항구에 도착하면 거래 요청 방법 안내', '나래국 항구' in h and '거래 요청 보내기' in h)
            await pg.screenshot(path=f'{SH}/helper-6.png')
            await pg.click('[data-a=sea-propose]'); await asyncio.sleep(0.4)
            h = await hint(); check('요청을 보내면 기다리라는 안내', '기다리' in h)
            await to('narae'); h = await hint(); print('  받은 나라:', h); check('요청을 받은 나라: 수락 안내', '가온국에서 거래 요청' in h and '수락하기' in h)
            await pg.click('[data-a=view][data-v=projector]'); await asyncio.sleep(0.2)
            check('발표 화면에는 도우미가 나오지 않음', await pg.locator('.helper-btn').count() == 0)
            await pg.click('[data-a=view][data-v=teacher]'); await stage(7); await to('gaon'); h = await hint(); check('7단계: 비교 안내', '비교' in h)
            m = await ctx.new_page(); await m.set_viewport_size({'width': 390, 'height': 844})
            await m.goto(BASE + '/demo.html#gaon'); await m.wait_for_selector('.helper-btn'); await m.click('.helper-btn'); await asyncio.sleep(0.3)
            bb = await m.locator('.helper-bubble').bounding_box(); sw = await m.evaluate('document.documentElement.scrollWidth')
            check('휴대폰 너비에서도 말풍선이 화면 안에 있음', bb['x'] >= 0 and bb['x'] + bb['width'] <= 390 and sw <= 390, f'{bb} sw={sw}')
            await m.screenshot(path=f'{SH}/helper-mobile.png')
            d = await ctx.new_page(color_scheme='dark') if False else None
            check('브라우저 오류 없음', not errs, '; '.join(errs[:3]))
            await b.close()
    finally: srv.terminate()
    print(f'\n결과: {sum(res)}/{len(res)} 통과'); sys.exit(0 if all(res) else 1)
asyncio.run(main())
