const E = require(require('path').join(__dirname, '..', 'engine.js'));
const assert = require('assert');
// En los tests, el Jugador 1 lleva blancas salvo que se pruebe el sorteo
const _newGame = E.newGame;
E.newGame = function(rng, rules){ return _newGame(rng || (()=>0), rules); };
// sorteo de colores
{ let w1=0; for(let i=0;i<400;i++){ const g=_newGame(null); assert.strictEqual(g.playerColor[g.current],'w','white starts'); assert.notStrictEqual(g.playerColor[1],g.playerColor[2]); if(g.playerColor[1]==='w') w1++; }
  assert(w1>140 && w1<260, 'random colors '+w1); console.log('J1 blancas en', w1, 'de 400'); }
function emptyState(){ const s=E.newGame(); s.board=s.board.map(r=>r.map(()=>null)); return s; }
function put(s,sq,type,color,moved=false){ const c='abcdefgh'.indexOf(sq[0]), r=8-+sq[1]; s.board[r][c]={id:Math.random(),type,color,moved}; }
function rc(sq){ return [8-+sq[1],'abcdefgh'.indexOf(sq[0])]; }
function mv(s,a,b,p){ return E.makeMove(s,{from:rc(a),to:rc(b)},p); }
// deck size
let s=E.newGame(); assert.strictEqual(s.deck.length,60);
// initial moves = 20
assert.strictEqual(E.allMoves(s,'w').length,20);
// multi-move turn, en passant
s=E.newGame(); s.phase='moves'; s.movesLeft=3;
assert(mv(s,'e2','e4')); assert(mv(s,'e4','e5')); assert(mv(s,'a2','a3'));
assert.strictEqual(s.current,2);
s.phase='moves'; s.movesLeft=2; assert(mv(s,'d7','d5'));
assert.strictEqual(s.movesLeft,1); assert(mv(s,'h7','h6')); 
assert.strictEqual(s.current,1); s.phase='moves'; s.movesLeft=2;
let m=E.legalMovesFrom(s,...rc('e5')); assert(m.some(x=>x.ep), 'ep available');
assert(mv(s,'e5','d6')); assert.strictEqual(s.board[rc('d5')[0]][rc('d5')[1]],null); assert.deepStrictEqual(s.captured.b,['p']);
// ep not available on second move
s=E.newGame(); s.current=2; s.phase='moves'; s.movesLeft=1; 
put(s,'e5','p','w',true); assert(mv(s,'d7','d5')); s.phase='moves'; s.movesLeft=2;
assert(mv(s,'a2','a3')); assert(!E.legalMovesFrom(s,...rc('e5')).some(x=>x.ep),'ep only first move');
// castling w/o check restriction
s=emptyState(); put(s,'e1','k','w'); put(s,'h1','r','w'); put(s,'a1','r','w'); put(s,'e8','k','b'); put(s,'f8','r','b');
s.phase='moves'; s.movesLeft=1;
let km=E.legalMovesFrom(s,...rc('e1')); assert(km.some(x=>x.castle===7)&&km.some(x=>x.castle===0));
assert(mv(s,'e1','g1')); assert.strictEqual(s.board[7][5].type,'r');
// promotion
s=emptyState(); put(s,'a7','p','w',true); put(s,'e1','k','w'); put(s,'e8','k','b'); s.phase='moves'; s.movesLeft=1;
assert(E.needsPromotion(s,{from:rc('a7'),to:rc('a8')})); assert(mv(s,'a7','a8','n')); assert.strictEqual(s.board[0][0].type,'n');
// king capture
s=emptyState(); put(s,'e1','k','w'); put(s,'e8','k','b'); put(s,'e7','q','w'); s.phase='moves'; s.movesLeft=2;
assert(mv(s,'e7','e8')); assert.strictEqual(s.result.type,'win'); assert.strictEqual(s.phase,'over');
// stalemate (code path): white has no movable pieces
s=emptyState(); put(s,'h8','k','b'); put(s,'a2','p','w',true); put(s,'a3','k','b');
s.deck=[{kind:'num',n:1}]; E.drawCard(s);
assert.strictEqual(s.result && s.result.type,'draw');
// convert & revive
s=E.newGame(); s.deck=[{kind:'mas4'}]; E.drawCard(s);
let wc=0; for(const row of s.board) for(const p of row) if(p&&p.color==='w') wc++;
assert.strictEqual(wc,20,'4 converted'); assert.strictEqual(s.board[0][4].color,'b','king never'); assert.strictEqual(s.current,2); assert.strictEqual(s.lastConverted.length,4);
s.current=2;
s.captured.b=['q','p']; s.deck=[{kind:'mas2'}]; E.drawCard(s); assert.strictEqual(s.phase,'revive');
assert(!E.revivePiece(s,0,4,0),'black cannot revive on rank 4 (white half)');
assert(!E.revivePiece(s,1,0,0) ,'occupied');
assert(E.revivePiece(s,0,3,0),'black can revive on rank 5'); assert(E.revivePiece(s,0,2,2)); assert.strictEqual(s.current,1);
// regla actual: se pueden encadenar capturas
s=emptyState(); put(s,'e1','k','w'); put(s,'h8','k','b'); put(s,'a1','r','w'); put(s,'a5','p','b',true); put(s,'b5','p','b',true); s.phase='moves'; s.movesLeft=3;
assert(mv(s,'a1','a5')); assert.strictEqual(s.current,1,'capture does not end turn'); assert.strictEqual(s.movesLeft,2);
assert(mv(s,'a5','b5')); assert.strictEqual(s.current,1); assert.strictEqual(s.captured.b.length,2);
// regla actual: amenazar al rey termina el turno
s=emptyState(); put(s,'e1','k','w'); put(s,'h8','k','b'); put(s,'a1','r','w'); s.phase='moves'; s.movesLeft=3;
assert(mv(s,'a1','a8')); assert.strictEqual(s.current,2,'threat ends turn'); assert(s.log.some(l=>l.includes('Rey amenazado')));
// capturar el rey sigue siendo posible si ya estaba amenazado al empezar el turno
s=emptyState(); put(s,'e1','k','w'); put(s,'h8','k','b'); put(s,'a8','r','w'); s.phase='moves'; s.movesLeft=2;
assert(mv(s,'a8','h8')); assert.strictEqual(s.result.type,'win');
// reglas originales (ocultas): la captura termina el turno y la amenaza no
s=emptyState(); s.rules='original'; put(s,'e1','k','w'); put(s,'h8','k','b'); put(s,'a1','r','w'); put(s,'a5','p','b',true); s.phase='moves'; s.movesLeft=3;
assert(mv(s,'a1','a5')); assert.strictEqual(s.current,2,'original: capture ends turn');
s=emptyState(); s.rules='original'; put(s,'e1','k','w'); put(s,'h8','k','b'); put(s,'a1','r','w'); s.phase='moves'; s.movesLeft=2;
assert(mv(s,'a1','a8')); assert.strictEqual(s.current,1,'original: threat does not end turn');
assert.strictEqual(E.newGame().rules,'actual'); assert.strictEqual(E.newGame(null,'original').rules,'original');
// deck composition
s=E.newGame(); const n=k=>s.deck.filter(c=>c.kind==='num'&&c.n===k).length; assert.deepStrictEqual([n(1),n(2),n(3),s.deck.length],[30,12,4,60]);
// sentido
s=E.newGame(); s.deck=[{kind:'sentido'}]; E.drawCard(s); assert.strictEqual(s.playerColor[1],'b'); assert.strictEqual(s.current,2); assert.strictEqual(E.myColor(s),'w');
// random games
let games=0, results={};
for(let g=0;g<300;g++){ s=E.newGame(); let steps=0;
 while(s.phase!=='over' && steps<5000){ steps++;
  if(s.phase==='draw') E.drawCard(s);
  else if(s.phase==='moves'){ const ms=E.allMoves(s,E.myColor(s)); const x=ms[Math.floor(Math.random()*ms.length)]; assert(E.makeMove(s,x,'q'),'move ok'); }
  else if(s.phase==='convert'){ let done=false; for(let r=0;r<8&&!done;r++)for(let c=0;c<8&&!done;c++) if(E.canConvert(s,r,c)){E.convertPiece(s,r,c);done=true;} assert(done); }
  else if(s.phase==='revive'){ let done=false; const t=s.captured[E.myColor(s)][0]; for(let r=0;r<8&&!done;r++)for(let c=0;c<8&&!done;c++) if(E.canRevivePlace(s,t,r,c)){E.revivePiece(s,0,r,c);done=true;} assert(done); }
  // invariant: 32 pieces + ... total pieces count <=32 and kings
  let cnt=0; for(const row of s.board) for(const p of row) if(p) cnt++; cnt+=s.captured.w.length+s.captured.b.length; assert.strictEqual(cnt,32);
  assert.strictEqual(s.deck.length+s.discard.length+(s.card?1:0)+ (s.phase==='over'&&!s.card?0:0) <= 60, true);
 }
 results[s.result? s.result.type:'none']=(results[s.result? s.result.type:'none']||0)+1; }
console.log('random', results);
console.log('ALL OK');
