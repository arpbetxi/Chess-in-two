import asyncio
from playwright.async_api import async_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
FILE_URL = ROOT.as_uri() + '/index.html?sincuentas'
CHROME = {'executable_path': '/usr/bin/google-chrome'} if os.path.exists('/usr/bin/google-chrome') else {}
SHOTS = os.environ.get('SHOTS', '/tmp')
FAKE = """
(function(){
  let cb=null, user=null; const games=[]; const profile={stats:{},byMode:{}};
  window.__fake={games, profile};
  window.CuentasBackend = {
    ready:true,
    onAuth(f){ cb=f; setTimeout(()=>f(user),0); },
    async signInGoogle(){ user={uid:'u1',name:'Alfred G',email:'alfred@gmail.com'}; cb(user); },
    async signInEmail(e,p){ if(p!=='secreto1'){ const err=new Error('x'); err.code='auth/invalid-credential'; throw err;} user={uid:'u2',name:e.split('@')[0],email:e}; cb(user); },
    async signUpEmail(n,e,p){ user={uid:'u3',name:e.split('@')[0],email:e}; cb(user); },
    async resetPassword(){}, async signOut(){ user=null; cb(null); }, async setName(){},
    async saveGame(g){ if(games.find(x=>x.id===g.id)){const e=new Error('denied'); e.code='permission-denied'; throw e;}
      games.unshift(Object.assign({},g,{date:new Date()})); const s=profile.stats; s.played=(s.played||0)+1; s[g.result]=(s[g.result]||0)+1;
      const m=profile.byMode[g.mode]=profile.byMode[g.mode]||{}; m.played=(m.played||0)+1; m[g.result]=(m[g.result]||0)+1; return true; },
    async loadProfile(){ return profile; }, async loadGames(){ return games.slice(); },
  };
})();
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**CHROME); errs=[]
        # sin configuración: nada de cuentas
        pg0 = await b.new_page(); pg0.on('pageerror', lambda e: errs.append('0'+str(e)))
        await pg0.goto(FILE_URL); await pg0.click('#playArsenal')
        print('sin config: botón visible?', await pg0.is_visible('#accountBtn'), '| línea visible?', await pg0.is_visible('#accountLine'))
        ctx = await b.new_context(viewport={'width':1280,'height':820}); await ctx.add_init_script(FAKE)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
        await pg.goto(FILE_URL); await pg.click('#playArsenal'); await asyncio.sleep(0.3)
        print('línea:', await pg.inner_text('#accountLine'))
        await pg.click('#accountLine .link-btn'); await asyncio.sleep(0.3)
        await pg.screenshot(path=SHOTS + '/acc_login.png')
        await pg.fill('#accEmail','alfred@test.com'); await pg.fill('#accPass','mala'); await pg.click('#accSubmit'); await asyncio.sleep(0.3)
        print('error:', await pg.inner_text('#accError'))
        await pg.fill('#accPass','secreto1'); await pg.click('#accSubmit'); await asyncio.sleep(0.4)
        print('tras login, nombre:', await pg.input_value('#playerName'), '| línea:', await pg.inner_text('#accountLine'))
        await pg.click('#accClose')
        await pg.click('.opp-tab[data-opp=bot]'); await pg.click('#lobbyPlay'); await asyncio.sleep(1)
        # terminar partida: el bot captura el rey (forzamos el final)
        await pg.evaluate("(()=>{const s=ajedrez.state; s.phase='over'; s.result={type:'win',player:1,reason:'Rey capturado'}; ajedrez.refresh();})()"); await asyncio.sleep(0.5)
        print('toast:', await pg.inner_text('#toast'), '| guardadas:', await pg.evaluate("__fake.games.length"))
        await pg.evaluate("ajedrez.refresh()"); await asyncio.sleep(0.3)
        print('sin duplicar:', await pg.evaluate("__fake.games.length"))
        await pg.click('#overHistory'); await asyncio.sleep(0.4)
        print('stats:', (await pg.inner_text('#accStats')).replace('\n',' '), '| historial:', (await pg.inner_text('#accHistory')).replace('\n',' | '))
        await pg.screenshot(path=SHOTS + '/acc_history.png')
        m = await ctx.new_page(); await m.set_viewport_size({'width':390,'height':844})
        await m.goto(FILE_URL); await m.click('#playArsenal'); await m.click('#accountLine .link-btn'); await m.click('#accGoogle'); await asyncio.sleep(0.4)
        await m.screenshot(path=SHOTS + '/acc_mobile.png')
        print('errors', errs); await b.close()
asyncio.run(main())
