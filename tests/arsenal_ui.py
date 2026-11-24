import asyncio, json
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
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept('Pablo') if d.type=='prompt' else d.accept()))
        await pg.goto(FILE_URL)
        await pg.click('#playArsenal'); await pg.fill('#playerName','Alfred'); await pg.evaluate("document.getElementById('localBtn').click()"); await asyncio.sleep(0.4)
        st = lambda: pg.evaluate("ajedrez.state")
        print('game', await pg.evaluate("ajedrez.state.game"), 'hidden destino area', await pg.evaluate("document.getElementById('destinoArea').classList.contains('hidden')"))
        await pg.screenshot(path=SHOTS + '/a1.png')
        async def click_move():
            m = await pg.evaluate("(()=>{const ms=ArsenalEngine.legalMoves(ajedrez.state); const m=ms.find(x=>!x.capture)||ms[0]; return m})()")
            await pg.click(SQ(*m['from'])); await pg.click(SQ(*m['to'])); await asyncio.sleep(0.15)
        for i in range(2): await click_move()
        print('turnCounts', await pg.evaluate("JSON.stringify(ajedrez.state.turnCount)"), 'current', await pg.evaluate("ajedrez.state.current"))
        async def resolve():
            for _ in range(4):
                await pg.evaluate("(()=>{const b=document.getElementById('cardReveal'); if(!b.classList.contains('hidden')) b.click();})()"); await asyncio.sleep(0.4)
                ph = await pg.evaluate("ajedrez.state.phase")
                if ph=='duplicate': await pg.click('#aDecision button >> nth=0')
                elif ph=='discard': await pg.click('#aHand .acard.discardable >> nth=0')
                else: return
        # give current player cards and test Congelar via UI
        await pg.evaluate("(()=>{const s=ajedrez.state; s.hands[s.current]=['congelar','fantasma','ruleta']; ajedrez.render();})()")
        await pg.click('#aHand .acard >> nth=0'); await asyncio.sleep(0.1)
        await pg.screenshot(path=SHOTS + '/a2.png')
        await pg.click('#aSelected button:has-text("Usar")'); await asyncio.sleep(0.1)
        await pg.click(SQ(1,4)); await asyncio.sleep(0.5)
        await pg.evaluate("document.getElementById('cardReveal').click()"); await asyncio.sleep(0.5)
        s = await st(); print('frozen', s['frozen'] and len(s['frozen']['ids']), 'current now', s['current'])
        await pg.screenshot(path=SHOTS + '/a3.png')
        # rival turn: move; then my turn: ruleta
        await click_move()
        await resolve()
        await pg.evaluate("(()=>{const s=ajedrez.state; s.hands[s.current]=['ruleta']; ajedrez.render();})()")
        await pg.click("#aHand .acard >> nth=0"); print("why", await pg.inner_text('#aSelected'), await pg.evaluate("JSON.stringify([ajedrez.state.hands, ajedrez.state.current])")); print('BTN', await pg.inner_html('#aSelected .a-btns'), await pg.evaluate("JSON.stringify([ajedrez.state.phase,ajedrez.state.current,ajedrez.state.cardUsed,ajedrez.state.movesThisTurn])")); await pg.click('#aSelected button:has-text("Usar")', timeout=4000); await asyncio.sleep(1.2)
        await asyncio.sleep(0.5); await pg.screenshot(path=SHOTS + '/a4_elegir_rueda.png'); print('fase tras usar Ruleta', await pg.evaluate("ajedrez.state.phase"), 'ruedas visibles', await pg.evaluate("document.querySelectorAll('#ruletaOptions .ruleta-opt').length"))
        await pg.click('#ruletaOptions .ruleta-opt[data-wheel="arriesgada"]'); await asyncio.sleep(0.9)
        await pg.screenshot(path=SHOTS + '/a4_wheel.png'); await asyncio.sleep(2.4)
        s = await st(); print('after ruleta phase', s['phase'], 'last', s.get('lastRuleta'))
        await pg.evaluate("document.getElementById('cardReveal').click()"); await asyncio.sleep(0.5)
        if s['phase']=='ruleta':
            act = await pg.evaluate("ArsenalEngine.botAction(ajedrez.state,'normal')")
            for sq in act['squares']: await pg.click(SQ(*sq))
            await pg.screenshot(path=SHOTS + '/a5_ruleta_pick.png')
            await pg.click('#aDecision button:has-text("Confirmar")'); await asyncio.sleep(0.3)
            print('ruleta resolved, phase', await pg.evaluate("ajedrez.state.phase"))
        # duplicate decision
        await click_move() if await pg.evaluate("ajedrez.state.phase")=='turn' and await pg.evaluate("ajedrez.state.current")!=None else None
        await resolve()
        await pg.evaluate("(()=>{const s=ajedrez.state; s.hands[s.current]=['apuesta','salto']; s.deck.push('salto'); s.deck.push('enroque'); ajedrez.render();})()")
        await pg.click('#aHand .acard >> nth=0'); print('apuesta why:', await pg.inner_text('#aSelected .why') if await pg.locator('#aSelected .why').count() else 'ok', await pg.evaluate("JSON.stringify([ajedrez.state.turnCount, ajedrez.state.current, ajedrez.state.bloodlust])")); await pg.click('#aSelected button:has-text("Usar")', timeout=4000); await asyncio.sleep(0.3)
        await pg.evaluate("document.getElementById('cardReveal').click()"); await asyncio.sleep(0.5)
        print('phase after apuesta', await pg.evaluate("ajedrez.state.phase"))
        await pg.screenshot(path=SHOTS + '/a6_dup.png')
        if await pg.evaluate("ajedrez.state.phase")=='duplicate':
            await pg.click('#aDecision button:has-text("Combinar")'); await asyncio.sleep(0.3)
        print('hand after', await pg.evaluate("JSON.stringify(ajedrez.state.hands)"), 'phase', await pg.evaluate("ajedrez.state.phase"))
        # ascend: give points to current
        if await pg.evaluate("ajedrez.state.phase")=='turn':
            await pg.evaluate("(()=>{const s=ajedrez.state; s.points[s.current]=5; ajedrez.render();})()")
            await pg.click('#aAscend'); await asyncio.sleep(0.1)
            pawn = await pg.evaluate("(()=>{const s=ajedrez.state; const col=s.playerColor[s.current]; for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=s.board[r][c]; if(p&&p.color===col&&p.type==='p') return [r,c];}})()")
            await pg.click(SQ(*pawn)); await asyncio.sleep(0.2)
            await pg.click('#promoChoices button >> nth=0'); await asyncio.sleep(0.2)
            print('ascended to', await pg.evaluate(f"ajedrez.state.board[{pawn[0]}][{pawn[1]}].type"), 'points', await pg.evaluate("JSON.stringify(ajedrez.state.points)"))
        await pg.screenshot(path=SHOTS + '/a7.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
