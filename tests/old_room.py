"""예전 버전으로 만든 방이 '최근 방'으로 저장된 상태에서 교사·학생 링크를 여는 재현 테스트"""
import asyncio, subprocess, sys, time, os, json
sys.path.insert(0, os.path.dirname(__file__))
from e2e_live import route, ROOT, PORT, BASE
from playwright.async_api import async_playwright
OLD = {
 'rooms/OLD01': {'d': {'ownerUid': 'teacher-1', 'createdAt': {'__ms': 1761600000000}, 'stage': 8, 'locks': {'production': False, 'trade': False}, 'allowUndo': True,
   'cfg': {'chances': 4, 'strongLevel': 5, 'weakShare': 0.25, 'conditions': [{'id':'capital','name':'자본'},{'id':'resource','name':'자원'},{'id':'labor','name':'노동력'},{'id':'tech','name':'기술력'}],
     'items': [{'id':'rice','name':'쌀','unit':'kg','target':20,'key':'labor'},{'id':'oil','name':'석유','unit':'L','target':20,'key':'resource'},{'id':'car','name':'자동차','unit':'대','target':12,'key':'capital'},{'id':'phone','name':'스마트폰','unit':'대','target':16,'key':'tech'}],
     'countries': [{'id':'gaon','name':'가온국','color':'#2f6fdb','flag':'stripes','stats':{'capital':2,'resource':3,'labor':5,'tech':1}},{'id':'narae','name':'나래국','color':'#d9622b','flag':'circle','stats':{'capital':3,'resource':5,'labor':1,'tech':2}},{'id':'daon','name':'다온국','color':'#13917f','flag':'cross','stats':{'capital':5,'resource':1,'labor':4,'tech':3}},{'id':'raon','name':'라온국','color':'#8e44b8','flag':'diagonal','stats':{'capital':4,'resource':1,'labor':2,'tech':5}}]},
   'outputs': {}, 'round1': None}, 'v': 1},
}
for c in ['gaon','narae','daon','raon']:
    OLD[f'rooms/OLD01/countries/{c}'] = {'d': {'inv': {'rice':0,'oil':0,'car':0,'phone':0}, 'chances': 4, 'log': []}, 'v': 1}
results = []
def check(n, c, d=''):
    results.append(c); print(('PASS ' if c else 'FAIL ') + n + (f' — {d}' if d else ''))
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width':1280,'height':900}); await route(ctx)
            T = await ctx.new_page(); errs = []
            T.on('pageerror', lambda e: errs.append(str(e)))
            await T.goto(BASE + '/teacher.html')
            await T.evaluate("([s]) => { localStorage.setItem('FAKEFS', s); localStorage.setItem('tradeGame.teacherRoom','OLD01'); localStorage.setItem('tradeGame.view.teacher','projector'); sessionStorage.setItem('FAKEAUTH:[DEFAULT]', JSON.stringify({uid:'teacher-1',isAnonymous:false,displayName:'테스트 교사'})); }", [json.dumps(OLD)])
            await T.goto(BASE + '/teacher.html'); await asyncio.sleep(1.5)
            txt = await T.inner_text('main')
            check('예전 방이 자동으로 열리지 않고 방 목록이 나옴', '새 수업 방 만들기' in txt and 'ERS' not in txt)
            check('예전 방은 "이전 버전 · 열 수 없음"으로 표시', '이전 버전' in txt)
            await T.screenshot(path=os.path.join(ROOT,'tests/shots/old-list.png'))
            await T.click('[data-g=open][data-code=OLD01]'); await asyncio.sleep(0.5)
            check('예전 방을 누르면 새 방을 만들라는 안내', '열 수 없어요' in await T.inner_text('main'))
            await T.click('[data-g=create]'); await T.wait_for_selector('[data-a=view][data-v=teacher]')
            await T.click('[data-a=view][data-v=projector]'); await asyncio.sleep(0.4)
            await T.click('[data-a=view][data-v=teacher]'); await asyncio.sleep(0.4)
            check('새 방에서 발표 화면 → 교사 관제 탭 전환이 됨', await T.locator('.bigcode').count() == 1)
            await T.click('[data-a=view][data-v=gaon]'); await asyncio.sleep(0.4)
            await T.click('[data-a=view][data-v=teacher]'); await asyncio.sleep(0.4)
            check('나라 탭 → 교사 관제 탭 전환도 됨', await T.locator('.bigcode').count() == 1)
            S = await ctx.new_page(); S.on('pageerror', lambda e: errs.append('student: ' + str(e)))
            await S.goto(BASE + '/?room=OLD01'); await asyncio.sleep(1.2)
            check('학생이 예전 방 링크로 들어오면 새 코드를 입력하라는 안내', '지난번 수업 방' in await S.inner_text('main'))
            check('브라우저 오류 없음', not errs, '; '.join(errs[:3]))
            await b.close()
    finally: srv.terminate()
    print(f'\n결과: {sum(results)}/{len(results)} 통과'); sys.exit(0 if all(results) else 1)
asyncio.run(main())
