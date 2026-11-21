import asyncio
from playwright.async_api import async_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
FILE_URL = ROOT.as_uri() + '/index.html?sincuentas'
CHROME = {'executable_path': '/usr/bin/google-chrome'} if os.path.exists('/usr/bin/google-chrome') else {}
SHOTS = os.environ.get('SHOTS', '/tmp')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**CHROME)
        errs=[]
        pg = await b.new_page(viewport={'width':1200,'height':820})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
        await pg.goto(FILE_URL)
        await pg.screenshot(path=SHOTS + '/u_lobby.png')
        await pg.click('#rulesDestino'); await asyncio.sleep(0.3)
        await pg.screenshot(path=SHOTS + '/u_manual1.png')
        await pg.evaluate("document.querySelector('.manual-box').scrollTop=520")
        await pg.screenshot(path=SHOTS + '/u_manual2.png')
        await pg.keyboard.press('Escape')
        await pg.click('#playDestino'); await pg.evaluate("document.getElementById('localBtn').click()")
        await pg.evaluate("ajedrez.state.deck.push({kind:'mas2'})")
        await pg.click('#drawBtn'); await asyncio.sleep(0.5)
        await pg.screenshot(path=SHOTS + '/u_game.png')
        m = await b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2)
        await m.goto(FILE_URL)
        await m.click('#rulesDestino'); await asyncio.sleep(0.3)
        await m.evaluate("document.querySelector('.manual-box').scrollTop=600")
        await m.screenshot(path=SHOTS + '/u_mobile.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
