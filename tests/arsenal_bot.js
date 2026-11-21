global.Engine = require(require('path').join(__dirname, '..', 'engine.js')); global.Arsenal = require(require('path').join(__dirname, '..', 'arsenal.js')).Arsenal; global.Bot=require(require('path').join(__dirname, '..', 'bot.js'));
const A = require(require('path').join(__dirname, '..', 'arsenal-engine.js'));
eval(require('fs').readFileSync(require('path').join(__dirname,'arsenal_test.js'),'utf8').split('// specific card checks')[0].split("const assert = require('assert');")[1]);
const assert=require('assert');
let w={bot:0,rnd:0,d:0}, maxMs=0;
for(let g=0;g<12;g++){ const botP = g%2?1:2; const s=A.newGame(); let n=0;
  while(s.phase!=='over' && n<2500){ n++; const t0=Date.now(); const a = s.current===botP ? A.botAction(s,'normal') : randomAction(s); maxMs=Math.max(maxMs,Date.now()-t0);
    if(!a) throw new Error('no action '+s.phase); const ok=A.apply(s,a,s.current); if(!ok && s.current===botP) throw new Error('bot rejected '+JSON.stringify(a)); }
  if(!s.result) w.d++; else if(s.result.type==='draw') w.d++; else if(s.result.player===botP) w.bot++; else w.rnd++; }
console.log('bot normal vs aleatorio', w, 'max ms por acción', maxMs);
let cards={}; const s=A.newGame(); let n=0; while(s.phase!=='over'&&n<2500){n++; const a=A.botAction(s, s.current===1?'normal':'facil'); if(a.type==='play')cards[a.card]=(cards[a.card]||0)+1; assert(A.apply(s,a,s.current),'bot vs bot rejected '+JSON.stringify(a)); }
console.log('bot vs bot result', s.result, 'steps', n, 'cartas usadas', cards);
