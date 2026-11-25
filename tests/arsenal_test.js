global.Engine = require(require('path').join(__dirname, '..', 'engine.js'));
global.Arsenal = require(require('path').join(__dirname, '..', 'arsenal.js')).Arsenal;
global.Bot = require(require('path').join(__dirname, '..', 'bot.js'));
const A = require(require('path').join(__dirname, '..', 'arsenal-engine.js'));
const assert = require('assert');
const rnd = a => a[Math.floor(Math.random()*a.length)];
function sqs(){ const o=[]; for(let r=0;r<8;r++)for(let c=0;c<8;c++)o.push([r,c]); return o; }
function randomTarget(s, id){
  const b=s.board, mine=s.playerColor[s.current];
  switch(id){
    case 'escudo': return {sq: rnd(A.ownPieces(s))};
    case 'trampa': { const e=sqs().filter(([r,c])=>!b[r][c]); return {sq: rnd(e)}; }
    case 'congelar': return {sq: rnd(sqs())};
    case 'enroque': { const own=A.ownPieces(s); for(let i=0;i<30;i++){ const a=rnd(own), bb=rnd(own); if(a!==bb) return {a, b:bb}; } return {}; }
    case 'posesion': return {sq: rnd(A.possessionPieces(s))};
  }
  return null;
}
function randomAction(s){
  const P=s.current;
  if(s.phase==='duplicate') return {type:'duplicate', choice: Math.random()<0.5?'combine':'discard'};
  if(s.phase==='discard') return {type:'discard', index: Math.floor(Math.random()*s.hands[P].length)};
  if(s.phase==='ruleta'||s.phase==='ruletaElegir'||s.phase==='robo'){ return A.botAction(s,'normal'); }
  if(s.movesThisTurn===0 && s.points[P]>=5 && Math.random()<0.5){
    for(const q of A.ownPieces(s)){ const t=s.board[q[0]][q[1]].type; const to={p:'n',n:'r',b:'r',r:'q'}[t]; if(to) return {type:'ascend', r:q[0], c:q[1], to}; }
  }
  if(A.canUseCards(s)){
    const pc=A.playableCards(s);
    if(pc.length && Math.random()<0.35){ const id=rnd(pc); return {type:'play', card:id, target: randomTarget(s,id)}; }
    if(s.hands[P].length && Math.random()<0.08) return {type:'discardCard', index:0};
  }
  const ms=A.legalMoves(s); if(!ms.length) return null; const m=rnd(ms); return {type:'move', from:m.from, to:m.to, promo:'q'};
}
function count(s){ let n=0; for(const row of s.board) for(const p of row) if(p) n++; return n + s.captured.w.length + s.captured.b.length; }
function play(p1,p2,maxSteps=3000){
  const s=A.newGame(); let steps=0; const used={};
  while(s.phase!=='over' && steps<maxSteps){
    steps++;
    const who = s.current===1?p1:p2;
    const a = who==='random'? randomAction(s) : A.botAction(s, who);
    if(!a){ throw new Error('no action phase '+s.phase+' moves '+A.legalMoves(s).length); }
    if(a.type==='play') used[a.card]=(used[a.card]||0)+1;
    const ok=A.apply(s,a,s.current);
    if(!ok){ if(who==='random' && a.type!=='move' && a.type!=='ruletaPick') continue; throw new Error('rejected '+JSON.stringify(a)+' phase '+s.phase); }
    assert.strictEqual(count(s),32,'piece conservation');
    if(s.phase==='turn') { assert(s.hands[1].length<=3 && s.hands[2].length<=3,'hand limit'); }
  }
  return {s, steps, used};
}
// specific card checks
let s=A.newGame(); assert.strictEqual(s.hands[1].length,2); assert.strictEqual(s.hands[2].length,2); assert(s.escudo[1]&&s.escudo[2]);
assert.strictEqual(s.deck.length,36);
assert(!A.cardAllowed(s,'escudo').ok,'no cards first turn');
// Fantasma: rook through pawns
function empty(){ const s=A.newGame(); s.board=s.board.map(r=>r.map(()=>null)); s.playerColor={1:'w',2:'b'}; s.current=1; s.turnCount={1:2,2:2}; s.hands={1:[],2:[]}; s.phase='turn'; s.cardUsed=false; s.movesLeft=1; s.movesThisTurn=0; s.queue=[]; return s; }
const put=(s,sq,t,c)=>{ s.board[8-+sq[1]]['abcdefgh'.indexOf(sq[0])]={id:Math.floor(Math.random()*1e6),type:t,color:c,moved:true}; };
const rc=sq=>[8-+sq[1],'abcdefgh'.indexOf(sq[0])];
s=empty(); put(s,'a1','r','w'); put(s,'a3','p','w'); put(s,'a5','p','b'); put(s,'e1','k','w'); put(s,'e8','k','b'); s.hands[1]=['fantasma'];
assert(!A.legalMovesFrom(s,...rc('a1')).some(m=>m.to[0]===rc('a6')[0]&&m.to[1]===0));
assert(A.apply(s,{type:'play',card:'fantasma'},1)); assert(A.legalMovesFrom(s,...rc('a1')).some(m=>m.to[0]===rc('a6')[0]&&m.to[1]===0),'fantasma passes pawns');
// Salto de caballo
s=empty(); put(s,'d4','b','w'); put(s,'e1','k','w'); put(s,'e8','k','b'); s.hands[1]=['salto']; A.apply(s,{type:'play',card:'salto'},1);
assert(A.legalMovesFrom(s,...rc('d4')).some(m=>m.to[0]===rc('e6')[0]&&m.to[1]===4),'salto knight move');
// Doble paso: second move cannot capture king
s=empty(); put(s,'a1','r','w'); put(s,'h1','k','w'); put(s,'a8','k','b'); put(s,'b2','p','b'); s.hands[1]=['doblepaso']; A.apply(s,{type:'play',card:'doblepaso'},1);
assert(A.apply(s,{type:'move',from:rc('a1'),to:rc('a2')},1)); assert.strictEqual(s.current,1,'still my turn');
assert(!A.legalMoves(s).some(m=>m.to[0]===0&&m.to[1]===0),'no king capture on 2nd move');
assert(A.apply(s,{type:'move',from:rc('a2'),to:rc('b2')},1),'2nd move capture ok'); assert.strictEqual(s.current,2);
// Sed de sangre
s=empty(); put(s,'a1','r','w'); put(s,'e1','k','w'); put(s,'h8','k','b'); put(s,'a7','r','b'); put(s,'h2','p','w'); s.hands[1]=['sed'];
A.apply(s,{type:'play',card:'sed'},1); assert(A.apply(s,{type:'move',from:rc('h2'),to:rc('h3')},1)); assert.strictEqual(s.current,2);
assert(A.legalMoves(s).every(m=>m.capture),'forced capture'); 
// Escudo
s=empty(); put(s,'a1','r','w'); put(s,'e1','k','w'); put(s,'h8','k','b'); put(s,'a7','r','b'); 
assert(A.apply(s,{type:'play',card:'escudo',target:{sq:rc('a1')}},1)); assert(!s.escudo[1]); assert.strictEqual(s.current,1,'after card, still my move');
assert(A.apply(s,{type:'move',from:rc('a1'),to:rc('a3')},1),'shielded piece can move'); assert.strictEqual(s.current,2);
assert(!A.legalMoves(s).some(m=>m.to[0]===rc('a3')[0]&&m.to[1]===0),'shielded not capturable');
// Congelar
s=empty(); put(s,'d5','n','b'); put(s,'e5','p','b'); put(s,'e8','k','b'); put(s,'e1','k','w'); s.hands[1]=['congelar'];
assert(A.apply(s,{type:'play',card:'congelar',target:{sq:rc('d5')}},1)); assert.strictEqual(s.current,1);
assert(A.apply(s,{type:'move',from:rc('e1'),to:rc('e2')},1)); assert.strictEqual(s.current,2); assert(!A.legalMoves(s).some(m=>m.from[0]===rc('d5')[0]),'frozen');
// Trampa (also owner can fall)
s=empty(); put(s,'a1','r','w'); put(s,'e1','k','w'); put(s,'e8','k','b'); s.hands[1]=['trampa'];
assert(A.apply(s,{type:'play',card:'trampa',target:{sq:rc('a4')}},1)); assert.strictEqual(s.current,1);
assert(A.apply(s,{type:'move',from:rc('a1'),to:rc('a4')},1)); assert.strictEqual(s.board[rc('a4')[0]][0],null,'trapped own rook'); assert.strictEqual(s.traps.length,0);
// Posesión
s=empty(); put(s,'e1','k','w'); put(s,'e8','k','b'); put(s,'d5','r','b'); put(s,'d2','n','b'); s.hands[1]=['posesion'];
assert(!A.apply(s,{type:'play',card:'posesion',target:{sq:rc('e8')}},1),'no se posee al rey');
assert(A.apply(s,{type:'play',card:'posesion',target:{sq:rc('d5')}},1)); assert.strictEqual(s.current,1);
assert(A.legalMoves(s).some(m=>m.possessed && m.to[0]===rc('d2')[0] && m.to[1]===3 && m.capture),'possessed can capture own side');
assert(!A.legalMoves(s).some(m=>m.possessed && m.to[0]===rc('e8')[0] && m.to[1]===4),'possessed cannot capture king');
assert(!A.legalMoves(s).some(m=>m.possessed && m.to[0]===rc('e1')[0] && m.to[1]===4),'possessed cannot capture mine');
assert(A.apply(s,{type:'move',from:rc('d5'),to:rc('d2')},1)); assert.strictEqual(s.board[rc('d2')[0]][3].color,'b'); assert.deepStrictEqual(s.captured.b,['n']); assert.strictEqual(s.current,2); assert.strictEqual(s.possessed,null);
// Posesión de un peón: mantiene su sentido de avance
s=empty(); put(s,'e1','k','w'); put(s,'e8','k','b'); put(s,'c7','p','b'); put(s,'d6','b','b'); s.hands[1]=['posesion'];
assert(A.apply(s,{type:'play',card:'posesion',target:{sq:rc('c7')}},1));
const pm=A.legalMoves(s).filter(m=>m.possessed).map(m=>m.to.join()); console.log('possessed pawn moves', pm);
assert(pm.includes(rc('c6').join()) && pm.includes(rc('c5').join()) && pm.includes(rc('d6').join()),'pawn forward + capture own bishop');
// Posesión y no mover: se puede mover una pieza propia
assert(A.apply(s,{type:'move',from:rc('e1'),to:rc('e2')},1)); assert.strictEqual(s.current,2);
// Enroque: las dos piezas intercambiadas no pueden moverse ese turno (pero sí el resto, y el turno siguiente sí)
s=empty(); put(s,'e1','k','w'); put(s,'a1','r','w'); put(s,'d4','q','w'); put(s,'e8','k','b');
s.hands[1]=['enroque'];
assert(A.apply(s,{type:'play',card:'enroque',target:{a:rc('a1'),b:rc('d4')}},1)); assert.strictEqual(s.current,1,'tras la carta aún mueves');
assert(!A.legalMoves(s).some(m=>(m.from[0]===rc('a1')[0]&&m.from[1]===rc('a1')[1])||(m.from[0]===rc('d4')[0]&&m.from[1]===rc('d4')[1])),'las piezas enrocadas no se mueven');
assert(A.legalMoves(s).some(m=>m.from[0]===rc('e1')[0]&&m.from[1]===rc('e1')[1]),'el resto sí');
assert(A.apply(s,{type:'move',from:rc('e1'),to:rc('e2')},1)); assert.strictEqual(s.locked,null,'se libera al acabar el turno');
// Rarezas tras el reequilibrado
// Ahogado tras usar carta = tablas
s=empty(); put(s,'a1','k','w'); put(s,'a2','p','w'); put(s,'b2','p','w'); put(s,'b1','b','w'); put(s,'c2','p','w'); put(s,'a3','p','b'); put(s,'b3','p','b'); put(s,'c3','p','b'); put(s,'h8','k','b');
for (const q of ['a3','b3','c3']) s.shields.push({id:s.board[rc(q)[0]][rc(q)[1]].id, owner:2});
s.hands[1]=['sed']; assert.strictEqual(A.legalMoves(s).length,0,'no moves');
assert(A.apply(s,{type:'play',card:'sed'},1)); assert.strictEqual(s.phase,'over','stalemate after card'); assert.strictEqual(s.result.type,'draw');
// Robo + overflow
s=empty(); put(s,'e1','k','w'); put(s,'e8','k','b'); s.hands[1]=['robo','salto','enroque']; s.hands[2]=['fantasma'];
assert(A.apply(s,{type:'play',card:'robo'},1)); assert.strictEqual(s.phase,'robo'); assert(!A.apply(s,{type:'roboPick',index:5},1)); assert(A.apply(s,{type:'roboPick',index:0},1)); assert.strictEqual(s.lastRobo.card,'fantasma'); assert.strictEqual(s.current,1,'move after robo'); assert.strictEqual(s.hands[1].indexOf('fantasma')>=0,true); assert(s.hands[2].indexOf('fantasma')<0);
// Duplicate combine
s=empty(); put(s,'e1','k','w'); put(s,'e8','k','b'); s.hands[1]=['salto']; s.queue=['salto']; s.phase='turn';
// emulate via apply apuesta? directly
s.hands[1]=['apuesta','salto']; s.deck.push('salto'); s.deck.push('enroque');
assert(A.apply(s,{type:'play',card:'apuesta'},1)); assert.strictEqual(s.phase,'duplicate');
assert(A.apply(s,{type:'duplicate',choice:'combine'},1)); console.log('after combine hand', s.hands[1], 'phase', s.phase, 'current', s.current);
// Ruleta
s=empty(); put(s,'e1','k','w'); put(s,'e8','k','b'); put(s,'a7','p','b'); put(s,'b7','n','b'); put(s,'a2','p','w'); s.hands[1]=['ruleta'];
A.apply(s,{type:'play',card:'ruleta'},1); assert.strictEqual(s.phase,'ruletaElegir'); assert.strictEqual(s.ruleta,null,'no gira sola');
assert(!A.apply(s,{type:'ruletaSpin',wheel:'constructor'},1)); assert(!A.apply(s,{type:'move',from:rc('a2'),to:rc('a3')},1),'no se puede mover antes de girar');
assert(A.apply(s,{type:'ruletaSpin',wheel:'arriesgada'},1)); assert(['ruleta','turn'].indexOf(s.phase)>=0); assert.strictEqual(s.lastRuleta.wheel,'arriesgada');
assert(A.RULETAS.arriesgada.length===8 && A.RULETAS.arriesgada.filter(function(v){return v>0;}).every(function(v){return v===9;}) && A.RULETAS.arriesgada.filter(function(v){return v===9;}).length===2,'dos casillas +9 de ocho (25 %), el resto negativas');
['equilibrada','arriesgada'].forEach(function(w){ const R=A.RULETAS[w]; assert.strictEqual(R.reduce(function(a,b){return a+b;},0)/R.length,0.5,'media +0,5 en '+w); });
console.log('ruleta value', s.ruleta && s.ruleta.value, 'phase', s.phase);
if(s.phase==='ruleta'){ assert(A.apply(s,A.botAction(s,'normal'),1)); } assert.strictEqual(s.current,1,'move after ruleta'); assert.strictEqual(s.phase,'turn');
// Apuesta sí quita el movimiento
s=empty(); put(s,'e1','k','w'); put(s,'e8','k','b'); s.hands[1]=['apuesta']; assert(A.apply(s,{type:'play',card:'apuesta'},1)); if(s.phase==='turn') assert.strictEqual(s.current,2,'apuesta ends turn');
// random games
const res={}, usedAll={}; let maxSteps=0;
for(let g=0; g<300; g++){ const o=play('random','random'); const k=o.s.result? o.s.result.type:'none'; res[k]=(res[k]||0)+1; for(const c in o.used) usedAll[c]=(usedAll[c]||0)+o.used[c]; maxSteps=Math.max(maxSteps,o.steps); }
console.log('random games', res, 'max steps', maxSteps); console.log('cards used', usedAll);
console.log('ALL OK');
