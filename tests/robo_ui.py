import asyncio
from playwright.async_api import async_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
FILE_URL = ROOT.as_uri() + '/index.html?sincuentas'
CHROME = {'executable_path': '/usr/bin/google-chrome'} if os.path.exists('/usr/bin/google-chrome') else {}
SHOTS = os.environ.get('SHOTS', '/tmp')
URL='http://127.0.0.1:8000/index.html?sincuentas&peerhost=127.0.0.1&peerport=9000'
async def closeReveal(*pgs):
    for pg in pgs: await pg.evaluate("(()=>{const b=document.getElementById('cardReveal'); if(!b.classList.contains('hidden')) b.click();})()")
    await asyncio.sleep(0.5)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**CHROME); errs=[]
        A = await (await b.new_context(viewport={'width':1250,'height':900})).new_page(); B = await (await b.new_context(viewport={'width':1250,'height':900})).new_page()
        for n,pg in (('A',A),('B',B)):
            pg.on('pageerror', lambda e, n=n: errs.append(n+str(e))); pg.on('console', lambda m, n=n: errs.append(n+' console:'+m.text) if m.type=='error' else None)
        await A.goto(URL); await B.goto(URL)
        await A.click('#playArsenal'); await A.fill('#playerName','Alfred'); await A.evaluate("document.getElementById('hostBtn').click()")
        await A.wait_for_selector('.lobby-status .code', timeout=10000); code = await A.inner_text('.lobby-status .code')
        await B.click('#playArsenal'); await B.fill('#playerName','Pablo'); await B.fill('#joinCode', code); await B.evaluate("document.getElementById('joinBtn').click()")
        await A.wait_for_function("ajedrez.state.names[2]==='Pablo'", timeout=15000); await asyncio.sleep(0.5)
        # guest (2) will steal from host (1): set up state on host
        await A.evaluate("""(()=>{const s=ajedrez.state; s.current=2; s.phase='turn'; s.turnCount={1:3,2:3}; s.cardUsed=false; s.hands[2]=['robo']; s.hands[1]=['fantasma','congelar','salto']; ajedrez.render(); Net.send({t:'state',state:s});})()""")
        await asyncio.sleep(0.6)
        await B.click('#aHand .acard >> nth=0'); await B.click('#aSelected button:has-text("Usar")'); await asyncio.sleep(0.8)
        await closeReveal(A,B)
        print('overlay A/B', await A.is_visible('#roboOverlay'), await B.is_visible('#roboOverlay'))
        print('B title:', await B.inner_text('#roboTitle'), '| A title:', await A.inner_text('#roboTitle'))
        print('B backs:', await B.locator('#roboCards .robo-back').count(), '| A faces:', await A.locator('#roboCards img').count())
        await B.hover('#roboCards .robo-card >> nth=1'); await asyncio.sleep(0.5)
        print('A sees hover on', await A.evaluate("[...document.querySelectorAll('#roboCards .robo-card')].findIndex(e=>e.classList.contains('hovered'))"))
        await A.screenshot(path=SHOTS + '/robo_victim.png'); await B.screenshot(path=SHOTS + '/robo_thief.png')
        await B.click('#roboCards .robo-card >> nth=1'); await asyncio.sleep(0.8)
        print('after: B hand', await B.evaluate("JSON.stringify(ajedrez.state.hands[2])"), 'A hand', await A.evaluate("JSON.stringify(ajedrez.state.hands[1])"), 'turn', await A.evaluate("ajedrez.state.current"))
        print('reveal A:', await A.inner_text('#revealWho'), '| B:', await B.inner_text('#revealWho'), '| overlay hidden', not await A.is_visible('#roboOverlay'))
        await A.screenshot(path=SHOTS + '/robo_after_victim.png')
        # bot steals from human
        C = await b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2)
        C.on('pageerror', lambda e: errs.append('C'+str(e)))
        await C.goto(FILE_URL); await C.click('#playArsenal'); await C.fill('#playerName','Alfred'); await C.evaluate("document.getElementById('botBtn').click()"); await asyncio.sleep(0.5)
        bp = await C.evaluate("ajedrez.state.playerColor[1]==='w'?2:2")
        await C.evaluate("""(()=>{const s=ajedrez.state; const bot=2; s.current=bot; s.phase='robo'; s.robo={player:bot}; s.hands[1]=['posesion','sed','trampa']; ajedrez.render();})()""")
        # trigger bot scheduling
        await C.evaluate("ajedrez.refresh()")
        seen=set()
        for i in range(12):
            await asyncio.sleep(0.3)
            h = await C.evaluate("[...document.querySelectorAll('#roboCards .robo-card')].findIndex(e=>e.classList.contains('hovered'))")
            seen.add(h)
            if i==4: await C.screenshot(path=SHOTS + '/robo_bot_mobile.png')
        await asyncio.sleep(2)
        print('bot hover positions seen', seen, '| phase now', await C.evaluate("ajedrez.state.phase"), '| my hand', await C.evaluate("JSON.stringify(ajedrez.state.hands[1])"))
        print('errors', errs); await b.close()
asyncio.run(main())
