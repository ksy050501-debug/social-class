"""수업 전 점검 페이지(check.html)의 흐름을 가짜 Firebase로 실행.
가짜 서버에는 보안 규칙이 없으므로 '막혀야 함' 항목은 실패로 나오는 것이 정상입니다."""
import asyncio, subprocess, sys, time, os
sys.path.insert(0, os.path.dirname(__file__))
from e2e_live import route, ROOT, PORT, BASE
from playwright.async_api import async_playwright
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); ctx = await b.new_context(); await route(ctx)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(BASE + '/check.html'); await pg.click('#run')
            await pg.wait_for_selector('#again', timeout=120000)
            print(await pg.inner_text('#log')); print('ERR', errs)
            await pg.screenshot(path=os.path.join(ROOT, 'tests/shots/check.png'), full_page=True)
    finally: srv.terminate()
asyncio.run(main())
