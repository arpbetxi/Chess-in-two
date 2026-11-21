import asyncio
from playwright.async_api import async_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
FILE_URL = ROOT.as_uri() + '/index.html?sincuentas'
CHROME = {'executable_path': '/usr/bin/google-chrome'} if os.path.exists('/usr/bin/google-chrome') else {}
SHOTS = os.environ.get('SHOTS', '/tmp')
URL='http://127.0.0.1:8000/index.html?sincuentas&peerhost=127.0.0.1&peerport=9000'
SQ=lambda r,c: f'.sq[data-r="{r}"][data-c="{c}"]'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**CHROME); errs=[]
        A = await (await b.new_context(viewport={'width':1250,'height':900})).new_page(); B = await (await b.new_context(viewport={'width':1250,'height':900})).new_page()
        for n,pg in (('A',A),('B',B)):
            pg.on('pageerror', lambda e, n=n: errs.append(n+str(e))); pg.on('console', lambda m, n=n: errs.append(n+' console:'+m.text) if m.type=='error' else None)
        await A.goto(URL); await B.goto(URL)
        await A.click('#playArsenal'); await A.fill('#playerName','Alfred'); await A.evaluate("document.getElementById('hostBtn').click()")
        await A.wait_for_selector('.lobby-status .code', timeout=10000); code = await A.inner_text('.lobby-status .code')
        await B.click('#playDestino')  # el invitado puede venir de cualquier modo
        await B.fill('#playerName','Pablo'); await B.fill('#joinCode', code); await B.evaluate("document.getElementById('joinBtn').click()")
        await A.wait_for_function("ajedrez.state.names[2]==='Pablo'", timeout=15000); await asyncio.sleep(0.5)
        print('guest sees game:', await B.evaluate("ajedrez.state.game"), '| arsenal panel visible:', await B.is_visible('#arsenalPanel'))
        print('guest hand shown = own hand:', await B.evaluate("JSON.stringify(ajedrez.state.hands[2])"), (await B.inner_text('#aHandTitle')))
        # play some turns: whoever can act moves
        async def act_once():
            for pg in (A,B):
                if await pg.evaluate("document.getElementById('cardReveal').classList.contains('hidden')")==False:
                    await pg.evaluate("document.getElementById('cardReveal').click()")
            for pg in (A,B):
                me = 1 if pg is A else 2
                if await pg.evaluate(f"ajedrez.state.current==={me} && ajedrez.state.phase==='turn'"):
                    m = await pg.evaluate("(()=>{const ms=ArsenalEngine.legalMoves(ajedrez.state); return ms.find(x=>!x.capture)||ms[0]})()")
                    await pg.click(SQ(*m['from'])); await pg.click(SQ(*m['to'])); await asyncio.sleep(0.6); return pg
        for i in range(4): await act_once()
        tc = await A.evaluate("JSON.stringify(ajedrez.state.turnCount)"); print('turnCounts', tc)
        # guest uses a card: give guest a Fantasma via host state (host authoritative) when guest's turn
        for i in range(3):
            if await A.evaluate("ajedrez.state.current===2 && ajedrez.state.phase==='turn'"): break
            await act_once()
        await A.evaluate("(()=>{const s=ajedrez.state; s.hands[2]=['sed','fantasma']; s.current=2; s.phase='turn'; s.cardUsed=false; s.movesThisTurn=0; s.incoming=null; ajedrez.render();})()")
        # force host to resend state
        await A.evaluate("Net.send({t:'state', state: ajedrez.state})"); await asyncio.sleep(0.4)
        await B.click('#aHand .acard >> nth=0'); await B.click('#aSelected button:has-text("Usar")'); await asyncio.sleep(0.8)
        print('host saw bloodlust on player', await A.evaluate("ajedrez.state.bloodlust"), '| reveal on host:', await A.inner_text('#revealWho'))
        print('errors', errs); await b.close()
asyncio.run(main())
