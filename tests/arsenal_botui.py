import asyncio
from playwright.async_api import async_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
FILE_URL = ROOT.as_uri() + '/index.html?sincuentas'
CHROME = {'executable_path': '/usr/bin/google-chrome'} if os.path.exists('/usr/bin/google-chrome') else {}
SHOTS = os.environ.get('SHOTS', '/tmp')
SQ=lambda r,c: f'.sq[data-r="{r}"][data-c="{c}"]'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**CHROME); errs=[]
        pg = await b.new_page(viewport={'width':1250,'height':900})
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
        await pg.goto(FILE_URL); await pg.click('#playArsenal'); await pg.fill('#playerName','Alfred'); await pg.evaluate("document.getElementById('botBtn').click()")
        bot_cards=set()
        for step in range(400):
            s = await pg.evaluate("({phase: ajedrez.state.phase, cur: ajedrez.state.current, lp: ajedrez.state.lastPlayed})")
            if s['lp'] and s['lp']['player']==2: bot_cards.add(s['lp']['card'])
            if s['phase']=='over': break
            if s['cur']!=1: await asyncio.sleep(0.4); continue
            if not await pg.evaluate("document.getElementById('cardReveal').classList.contains('hidden')"):
                await pg.evaluate("document.getElementById('cardReveal').click()"); await asyncio.sleep(0.4)
            if s['phase']=='duplicate': await pg.click('#aDecision button >> nth=0'); continue
            if s['phase']=='discard': await pg.click('#aHand .acard.discardable >> nth=0'); continue
            if s['phase']=='ruleta':
                act = await pg.evaluate("ArsenalEngine.botAction(ajedrez.state,'normal')")
                for q in act['squares']: await pg.click(SQ(*q))
                await pg.click('#aDecision button:has-text("Confirmar")'); continue
            m = await pg.evaluate("(()=>{const ms=ArsenalEngine.legalMoves(ajedrez.state); return ms[Math.floor(Math.random()*ms.length)]})()")
            if not m: await asyncio.sleep(0.3); continue
            await pg.click(SQ(*m['from'])); await pg.click(SQ(*m['to']))
            if await pg.is_visible('#promoModal:not(.hidden)'): await pg.click('#promoChoices button >> nth=0')
            await asyncio.sleep(0.2)
        print('result', await pg.evaluate("JSON.stringify(ajedrez.state.result)"), '| cartas usadas por el bot:', bot_cards)
        await pg.screenshot(path=SHOTS + '/a_bot_end.png')
        m = await b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2)
        await m.goto(FILE_URL); await m.click('#playArsenal'); await m.fill('#playerName','Alfred'); await m.evaluate("document.getElementById('botBtn').click()"); await asyncio.sleep(0.6)
        await m.evaluate("(()=>{const s=ajedrez.state; s.hands[1]=['fantasma','doblepaso','trampa']; ajedrez.render();})()")
        await m.evaluate("window.scrollTo(0, 420)"); await m.screenshot(path=SHOTS + '/a_mobile.png')
        print('errors', errs); await b.close()
asyncio.run(main())
