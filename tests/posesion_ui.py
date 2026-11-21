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
        await pg.goto(FILE_URL); await pg.click('#playArsenal'); await pg.evaluate("document.getElementById('localBtn').click()"); await asyncio.sleep(0.4)
        # set up: current player's turn 3, rival knight in the center
        await pg.evaluate("""(()=>{const s=ajedrez.state; s.turnCount={1:3,2:3}; s.cardUsed=false; s.phase='turn'; s.hands[s.current]=['posesion'];
          const rc=s.playerColor[s.current]==='w'?'b':'w'; const row = rc==='b'?0:7; const kn=s.board[row][1]; s.board[row][1]=null; s.board[3][3]=kn; ajedrez.render();})()""")
        await pg.click('#aHand .acard >> nth=0'); await pg.click('#aSelected button:has-text("Usar")'); await asyncio.sleep(0.2)
        print('instr:', await pg.inner_text('#instructions'))
        await pg.click(SQ(3,3)); await asyncio.sleep(0.6)
        await pg.evaluate("document.getElementById('cardReveal').click()"); await asyncio.sleep(0.5)
        print('possessed', await pg.evaluate("JSON.stringify(ajedrez.state.possessed)"), 'class', await pg.get_attribute(SQ(3,3),'class'))
        print('instr:', await pg.inner_text('#instructions'))
        await pg.screenshot(path=SHOTS + '/pos1.png')
        await pg.click(SQ(3,3)); await asyncio.sleep(0.2)
        moves = await pg.evaluate("ArsenalEngine.legalMovesFrom(ajedrez.state,3,3)")
        cap = [m for m in moves if m.get('capture')]
        print('possessed moves', len(moves), 'captures', len(cap))
        await pg.screenshot(path=SHOTS + '/pos2.png')
        m = (cap or moves)[0]
        await pg.click(SQ(*m['to'])); await asyncio.sleep(0.4)
        print('after move: current', await pg.evaluate("ajedrez.state.current"), 'possessed', await pg.evaluate("JSON.stringify(ajedrez.state.possessed)"), 'log', await pg.evaluate("ajedrez.state.log.slice(-2)"))
        print('errors', errs); await b.close()
asyncio.run(main())
