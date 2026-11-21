import asyncio, random
from playwright.async_api import async_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
FILE_URL = ROOT.as_uri() + '/index.html?sincuentas'
CHROME = {'executable_path': '/usr/bin/google-chrome'} if os.path.exists('/usr/bin/google-chrome') else {}
SHOTS = os.environ.get('SHOTS', '/tmp')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**CHROME)
        pg = await b.new_page(viewport={'width':1200,'height':820}); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(FILE_URL); await pg.click('#playDestino')
        await pg.evaluate("document.getElementById('botLevel').value='normal'")
        await pg.evaluate("document.getElementById('botBtn').click()")
        shot=False
        for turn in range(300):
            ph = await pg.evaluate("[ajedrez.state.phase, ajedrez.state.current]")
            if ph[0]=='over': break
            if ph[1]==2:
                await asyncio.sleep(0.4); 
                if not shot and turn>6:
                    await pg.screenshot(path=SHOTS + '/b1.png'); shot=True
                continue
            # human random play through UI actions
            if ph[0]=='draw': await pg.click('#drawBtn'); continue
            act = await pg.evaluate("""()=>{const s=ajedrez.state;
              if(s.phase==='moves'){const ms=Engine.allMoves(s,Engine.myColor(s)); const m=ms[Math.floor(Math.random()*ms.length)]; return {k:'m',f:m.from,t:m.to};}
              if(s.phase==='convert'){for(let r=0;r<8;r++)for(let c=0;c<8;c++) if(Engine.canConvert(s,r,c)) return {k:'c',t:[r,c]};}
              if(s.phase==='revive'){const ty=s.captured[Engine.myColor(s)][0]; for(let r=0;r<8;r++)for(let c=0;c<8;c++) if(Engine.canRevivePlace(s,ty,r,c)) return {k:'c',t:[r,c]};}
              return null;}""")
            if not act: continue
            if act['k']=='m':
                await pg.click(f'.sq[data-r="{act["f"][0]}"][data-c="{act["f"][1]}"]')
            await pg.click(f'.sq[data-r="{act["t"][0]}"][data-c="{act["t"][1]}"]')
            if await pg.is_visible('#promoModal:not(.hidden)'):
                await pg.click('#promoChoices button >> nth=0')
        print('final', await pg.evaluate("JSON.stringify(ajedrez.state.result)"), 'errors', errs)
        await pg.screenshot(path=SHOTS + '/b2.png')
        await b.close()
asyncio.run(main())
