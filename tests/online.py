import asyncio
from playwright.async_api import async_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
FILE_URL = ROOT.as_uri() + '/index.html?sincuentas'
CHROME = {'executable_path': '/usr/bin/google-chrome'} if os.path.exists('/usr/bin/google-chrome') else {}
SHOTS = os.environ.get('SHOTS', '/tmp')
URL='http://127.0.0.1:8000/index.html?sincuentas&peerhost=127.0.0.1&peerport=9000'
sq=lambda r,c: f'.sq[data-r="{r}"][data-c="{c}"]'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**CHROME)
        errs=[]
        A = await (await b.new_context(viewport={'width':1200,'height':820})).new_page()
        B = await (await b.new_context(viewport={'width':1200,'height':820})).new_page()
        for name,pg in (('A',A),('B',B)):
            pg.on('pageerror', lambda e, n=name: errs.append(n+':'+str(e)))
            pg.on('console', lambda m, n=name: errs.append(n+' console:'+m.text) if m.type=='error' else None)
        await A.goto(URL); await B.goto(URL); await A.click('#playDestino'); await B.click('#playDestino')
        await A.evaluate("document.getElementById('hostBtn').click()")
        await A.wait_for_selector('.lobby-status .code', timeout=10000)
        code = await A.inner_text('.lobby-status .code'); print('code', code)
        await A.screenshot(path=SHOTS + '/o0.png')
        await B.fill('#joinCode', code); await B.evaluate("document.getElementById('joinBtn').click()")
        await B.wait_for_function("document.getElementById('lobby').classList.contains('hidden')", timeout=15000)
        await A.wait_for_function("document.getElementById('lobby').classList.contains('hidden')", timeout=5000)
        print('connected')
        # Host turn: draw 2-move card
        await A.evaluate("ajedrez.state.deck.push({kind:'num',n:2})")
        print('B draw disabled', await B.is_disabled('#drawBtn'))
        await A.click('#drawBtn')
        await A.click(sq(6,4)); await A.click(sq(4,4)); await A.click(sq(6,3)); await A.click(sq(4,3))
        await B.wait_for_function("ajedrez.state.current===2", timeout=5000)
        print('B sees board e4', await B.evaluate("JSON.stringify(ajedrez.state.board[4][4])"))
        # guest turn: rigged card on host
        await A.evaluate("ajedrez.state.deck.push({kind:'num',n:1})")
        await B.click('#drawBtn')
        await B.wait_for_function("ajedrez.state.phase==='moves'", timeout=5000)
        # guest board flipped: black at bottom. click black pawn d7 (r1,c3) -> d5 (r3,c3)
        await B.click(sq(1,3)); await B.click(sq(3,3))
        await A.wait_for_function("ajedrez.state.current===1", timeout=5000)
        print('A sees d5', await A.evaluate("JSON.stringify(ajedrez.state.board[3][3])"))
        # guest tries to act out of turn via direct send — should be ignored
        await B.evaluate("Net.send({t:'action',action:{type:'draw'}})")
        await asyncio.sleep(0.5)
        print('A phase still draw & current 1', await A.evaluate("[ajedrez.state.phase, ajedrez.state.current]"))
        # reconnect: B reloads and rejoins
        await B.reload(); await B.click('#playDestino'); await B.fill('#joinCode', code); await B.evaluate("document.getElementById('joinBtn').click()")
        await B.wait_for_function("ajedrez.state.log.length>3", timeout=15000)
        print('B resynced log len', await B.evaluate("ajedrez.state.log.length"))
        await A.screenshot(path=SHOTS + '/o1.png'); await B.screenshot(path=SHOTS + '/o2.png')
        # host reload: continue saved game
        A.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await A.reload(); await A.click('#playDestino'); await A.evaluate("document.getElementById('hostBtn').click()")
        await A.wait_for_selector('.lobby-status .code', timeout=10000)
        print('host reuse code', await A.inner_text('.lobby-status .code'), 'log', await A.evaluate("ajedrez.state.log.length"))
        print('errors', errs)
        await b.close()
asyncio.run(main())
