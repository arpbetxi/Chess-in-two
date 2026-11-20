/*
 * In 2 Chess — motor del modo Arsenal
 * ------------------------------------
 * Ajedrez de un movimiento por turno; las cartas se acumulan en la mano.
 * Cada turno tiene dos partes: primero, si quieres, una carta; después, el movimiento.
 * Reutiliza la generación de movimientos de engine.js y las cartas de arsenal.js.
 *
 * Acciones que acepta apply(state, action, player):
 *   { type: 'move', from, to, promo }        mover una pieza
 *   { type: 'play', card, target }           usar una carta (target depende de la carta)
 *   { type: 'discardCard', index }           descartar voluntariamente (gasta la carta del turno)
 *   { type: 'ascend', r, c, to }             ascender una pieza con 5 puntos
 *   { type: 'duplicate', choice }            carta repetida: 'discard' | 'combine'
 *   { type: 'discard', index }               mano llena: descartar una carta
 *   { type: 'ruletaPick', squares }          piezas eliminadas por la Ruleta
 *   { type: 'roboPick', index }              Robo: carta del rival elegida (boca abajo)
 */
(function (root) {
  'use strict';

  const Engine = root.Engine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const Def = root.Arsenal || (typeof require !== 'undefined' ? require('./arsenal.js').Arsenal : null);
  const BotLib = function () { return root.Bot || (typeof require !== 'undefined' ? require('./bot.js') : null); };

  const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const PIECE_NAMES = { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey' };
  const COLOR_NAMES = { w: 'blancas', b: 'negras' };
  // Mismo orden que el dibujo de la ruleta (cards/arsenal/ruleta.svg), en el sentido de las agujas del reloj
  const RULETA = [-5, 1, -3, 3, -3, 5, -1, 7];
  const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

  const CARD = {};
  for (const c of Def.CARDS) CARD[c.id] = c;
  const RARITY_ORDER = ['comun', 'rara', 'epica'];
  const HAND_LIMIT = Def.RULES.handLimit;
  const ASC_POINTS = Def.RULES.ascensionPoints;

  // ---------- Utilidades ----------
  function other(p) { return p === 1 ? 2 : 1; }
  function colorOf(state, p) { return state.playerColor[p]; }
  function playerOfColor(state, color) { return state.playerColor[1] === color ? 1 : 2; }
  function inside(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function sq(r, c) { return Engine.squareName(r, c); }
  function name(state, p) { return Engine.playerName(state, p); }
  function log(state, text) { state.log.push(text); }
  function points(cardId) { return Def.RARITIES[CARD[cardId].rarity].points; }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function buildDeck() {
    const deck = [];
    for (const c of Def.CARDS) for (let i = 0; i < c.copies; i++) deck.push(c.id);
    return shuffle(deck);
  }
  let uid = 1000;
  function maxId(board) {
    for (const row of board) for (const p of row) if (p && p.id > uid) uid = p.id;
  }

  // ---------- Partida nueva ----------
  function newGame() {
    const base = Engine.newGame(null, 'actual'); // tablero inicial y sorteo de colores
    const state = {
      game: 'arsenal',
      rules: 'arsenal',
      gameId: base.gameId,
      names: base.names,
      board: base.board,
      captured: { w: [], b: [] },
      playerColor: base.playerColor,
      current: base.current,
      deck: buildDeck(),
      discardPile: [],
      hands: { 1: [], 2: [] },
      escudo: { 1: true, 2: true },     // cada jugador empieza con un Escudo fuera del mazo
      points: { 1: 0, 2: 0 },
      turnCount: { 1: 0, 2: 0 },
      pending: { 1: 0, 2: 0 },          // cartas por piezas perdidas, se roban al empezar el turno
      queue: [],                        // cartas por recibir este turno ('draw' o un id)
      incoming: null,                   // carta repetida pendiente de decisión
      phase: 'turn',                    // turn | duplicate | discard | ruleta | robo | over
      cardUsed: false,
      buff: null,                       // potenciadora activa: salto | fantasma | doblepaso
      movesLeft: 1,
      movesThisTurn: 0,
      endAfter: false,
      shields: [],                      // { id, owner }: piezas protegidas durante el turno rival
      frozen: null,                     // { ids, player, squares }: piezas congeladas en el turno de `player`
      traps: [],                        // { r, c, owner }: ocultas para todos
      bloodlust: null,                  // jugador obligado a capturar en su turno
      ruleta: null,                     // { value, idx, player }
      ruletaCount: 0,
      lastPlayed: null,
      playCount: 0,
      ep: null,
      lastMove: null,
      lastConverted: [],
      result: null,
      log: [],
    };
    maxId(state.board);
    for (const p of [1, 2]) {
      for (let i = 0; i < Def.RULES.startingHand; i++) {
        // reparto inicial sin cartas repetidas
        let card = state.deck.pop();
        let guard = 0;
        while (state.hands[p].indexOf(card) >= 0 && guard++ < 20) { state.deck.unshift(card); card = state.deck.pop(); }
        state.hands[p].push(card);
      }
    }
    log(state, '🃏 Cada jugador empieza con 2 cartas y un Escudo.');
    startTurn(state);
    return state;
  }

  // ---------- Movimientos ----------
  function isFrozen(state, p, piece) {
    return !!(state.frozen && state.frozen.player === p && state.frozen.ids.indexOf(piece.id) >= 0);
  }
  function isShielded(state, piece) {
    return state.shields.some(function (s) { return s.id === piece.id; });
  }

  // Movimientos de una pieza con las potenciadoras activas
  function rawMoves(state, r, c, buff) {
    const b = state.board;
    const p = b[r][c];
    if (!p) return [];
    let moves;
    if (buff === 'fantasma' && (p.type === 'b' || p.type === 'r' || p.type === 'q')) {
      // Fantasma: los peones (de cualquier color) no bloquean
      moves = [];
      const dirs = [];
      if (p.type !== 'b') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
      if (p.type !== 'r') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
      for (const d of dirs) {
        let tr = r + d[0], tc = c + d[1];
        while (inside(tr, tc)) {
          const t = b[tr][tc];
          if (!t) moves.push({ from: [r, c], to: [tr, tc] });
          else if (t.type === 'p') {
            if (t.color !== p.color) moves.push({ from: [r, c], to: [tr, tc], capture: true });
            // se atraviesa el peón y se sigue
          } else {
            if (t.color !== p.color) moves.push({ from: [r, c], to: [tr, tc], capture: true });
            break;
          }
          tr += d[0]; tc += d[1];
        }
      }
    } else {
      moves = Engine.pieceMoves(state, r, c);
      if (buff === 'fantasma' && p.type === 'p' && !p.moved) {
        // el peón puede avanzar dos casillas saltando por encima de otro peón
        const dir = p.color === 'w' ? -1 : 1;
        const start = p.color === 'w' ? 6 : 1;
        const r1 = r + dir, r2 = r + 2 * dir;
        if (r === start && b[r1][c] && b[r1][c].type === 'p' && !b[r2][c]) moves.push({ from: [r, c], to: [r2, c] });
      }
    }
    if (buff === 'salto' && p.type !== 'k') {
      for (const o of KNIGHT) {
        const tr = r + o[0], tc = c + o[1];
        if (!inside(tr, tc)) continue;
        if (moves.some(function (m) { return m.to[0] === tr && m.to[1] === tc; })) continue;
        const t = b[tr][tc];
        if (!t) moves.push({ from: [r, c], to: [tr, tc] });
        else if (t.color !== p.color) moves.push({ from: [r, c], to: [tr, tc], capture: true });
      }
    }
    return moves;
  }

  function targetOf(state, m) {
    if (m.ep && state.ep) return state.board[state.ep.pawnPos[0]][state.ep.pawnPos[1]];
    return state.board[m.to[0]][m.to[1]];
  }

  // Todos los movimientos legales del jugador al que le toca, en fase de mover
  function legalMoves(state, opts) {
    opts = opts || {};
    if (state.phase !== 'turn' && !opts.ignorePhase) return [];
    const P = state.current;
    const color = colorOf(state, P);
    const second = state.buff === 'doblepaso' && state.movesThisTurn > 0;
    const buff = opts.buff !== undefined ? opts.buff : state.buff;
    let list = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (!p || p.color !== color || isFrozen(state, P, p)) continue;
        for (const m of rawMoves(state, r, c, buff)) {
          const t = targetOf(state, m);
          if (t && m.capture) {
            if (isShielded(state, t)) continue;          // Escudo: no se puede capturar
            if (second && t.type === 'k') continue;      // Doble paso: el segundo no captura al rey
          }
          list.push(m);
        }
      }
    }
    if (state.bloodlust === P) {
      const caps = list.filter(function (m) { return m.capture; });
      if (caps.length) list = caps;                       // Sed de sangre: obligado a capturar
    }
    return list;
  }

  function legalMovesFrom(state, r, c) {
    return legalMoves(state).filter(function (m) { return m.from[0] === r && m.from[1] === c; });
  }

  function needsPromotion(state, m) {
    const p = state.board[m.from[0]][m.from[1]];
    return !!p && p.type === 'p' && m.to[0] === (p.color === 'w' ? 0 : 7);
  }

  // Elimina una pieza del tablero y la apunta como capturada
  function removePiece(state, r, c) {
    const p = state.board[r][c];
    if (!p) return null;
    state.board[r][c] = null;
    state.captured[p.color].push(p.type);
    return p;
  }

  // ¿La pieza que acaba de llegar a (r, c) pisa una trampa?
  function checkTrap(state, r, c) {
    const i = state.traps.findIndex(function (t) { return t.r === r && t.c === c; });
    if (i < 0) return;
    const p = state.board[r][c];
    if (!p || p.type === 'k') return; // el rey es inmune (la trampa sigue ahí)
    state.traps.splice(i, 1);
    removePiece(state, r, c);
    log(state, '💥 ¡Trampa en ' + sq(r, c) + '! El ' + PIECE_NAMES[p.type] + ' de ' + COLOR_NAMES[p.color] + ' queda eliminado.');
  }

  // Si se pierde una pieza que no es peón a manos del rival, su dueño robará al empezar su turno
  function lossDraw(state, captured) {
    if (!captured || captured.type === 'p' || captured.type === 'k') return;
    const owner = playerOfColor(state, captured.color);
    if (owner === state.current) return;
    state.pending[owner]++;
  }

  function finish(state, result) {
    state.result = result;
    state.phase = 'over';
    if (result.type === 'win') log(state, '🏆 ' + result.reason + '. Gana ' + name(state, result.player) + '.');
    else log(state, '🤝 ' + result.reason + '. Tablas.');
  }

  function doMove(state, move, promo) {
    const valid = legalMoves(state).find(function (m) {
      return m.from[0] === move.from[0] && m.from[1] === move.from[1] && m.to[0] === move.to[0] && m.to[1] === move.to[1];
    });
    if (!valid) return false;
    const b = state.board;
    const fr = valid.from[0], fc = valid.from[1], tr = valid.to[0], tc = valid.to[1];
    const p = b[fr][fc];
    let captured = null;
    if (valid.ep) {
      captured = removePiece(state, state.ep.pawnPos[0], state.ep.pawnPos[1]);
    } else if (b[tr][tc]) {
      captured = removePiece(state, tr, tc);
    }
    b[tr][tc] = p;
    b[fr][fc] = null;
    p.moved = true;
    let text = PIECE_NAMES[p.type] + ' ' + sq(fr, fc) + '→' + sq(tr, tc);
    if (valid.castle !== undefined) {
      const rook = b[fr][valid.castle];
      const rookTo = valid.castle === 7 ? 5 : 3;
      b[fr][rookTo] = rook;
      b[fr][valid.castle] = null;
      rook.moved = true;
      text = valid.castle === 7 ? 'enroque corto' : 'enroque largo';
    }
    if (state.ep && state.ep.player !== state.current) state.ep = null;
    if (valid.double) state.ep = { player: state.current, pawnId: p.id, pawnPos: [tr, tc], target: [(fr + tr) / 2, fc] };
    if (p.type === 'p' && tr === (p.color === 'w' ? 0 : 7)) {
      p.type = ['q', 'r', 'b', 'n'].indexOf(promo) >= 0 ? promo : 'q';
      text += ' (corona: ' + PIECE_NAMES[p.type] + ')';
    }
    if (captured) text += ' — captura ' + PIECE_NAMES[captured.type];
    log(state, '♟ ' + name(state, state.current) + ': ' + text + '.');
    state.lastMove = { from: [fr, fc], to: [tr, tc] };
    state.lastConverted = [];
    if (captured && captured.type === 'k') {
      finish(state, { type: 'win', player: state.current, reason: 'Rey capturado' });
      return true;
    }
    lossDraw(state, captured);
    checkTrap(state, tr, tc);
    state.movesThisTurn++;
    state.movesLeft--;
    if (state.movesLeft > 0 && legalMoves(state).length > 0) return true;
    endTurn(state);
    return true;
  }

  // ---------- Turnos ----------
  function startTurn(state) {
    const P = state.current;
    state.turnCount[P]++;
    state.cardUsed = false;
    state.buff = null;
    state.movesLeft = 1;
    state.movesThisTurn = 0;
    state.phase = 'turn';
    const draws = state.pending[P] + (state.turnCount[P] % Def.RULES.drawEveryTurns === 0 ? 1 : 0);
    state.pending[P] = 0;
    for (let i = 0; i < draws; i++) state.queue.push('draw');
    if (draws) log(state, '🃏 ' + name(state, P) + ' roba ' + (draws === 1 ? '1 carta.' : draws + ' cartas.'));
    processQueue(state);
  }

  function endTurn(state) {
    if (state.phase === 'over') return;
    const P = state.current;
    if (state.bloodlust === P) state.bloodlust = null;
    if (state.frozen && state.frozen.player === P) state.frozen = null;
    state.shields = state.shields.filter(function (s) { return s.owner === P; });
    if (state.ep && state.ep.player !== P) state.ep = null;
    state.buff = null;
    state.current = other(P);
    startTurn(state);
  }

  function drawFromDeck(state) {
    if (!state.deck.length) {
      if (!state.discardPile.length) return null;
      state.deck = shuffle(state.discardPile);
      state.discardPile = [];
      log(state, '🔀 Se baraja el descarte para formar un mazo nuevo.');
    }
    return state.deck.pop();
  }

  // Mete una carta en la mano; devuelve false si hay que decidir algo antes de seguir
  function acquire(state, card) {
    const hand = state.hands[state.current];
    if (hand.indexOf(card) >= 0) {
      state.phase = 'duplicate';
      state.incoming = card;
      return false;
    }
    hand.push(card);
    if (hand.length > HAND_LIMIT) {
      state.phase = 'discard';
      return false;
    }
    return true;
  }

  function processQueue(state) {
    while (state.phase === 'turn' && state.queue.length) {
      const tok = state.queue.shift();
      const card = tok === 'draw' ? drawFromDeck(state) : tok;
      if (!card) continue;
      if (!acquire(state, card)) return;
    }
    if (state.phase !== 'turn') return;
    if (state.endAfter) {
      state.endAfter = false;
      endTurn(state);
      return;
    }
    checkStuck(state);
  }

  // Si no hay ningún movimiento posible
  function checkStuck(state) {
    if (state.phase !== 'turn') return;
    if (legalMoves(state).length) return;
    if (state.movesThisTurn > 0 || state.cardUsed) { endTurn(state); return; } // ya ha hecho algo este turno
    const canAct = playableCards(state).some(function (id) { return CARD[id].type === 'accion'; });
    if (!canAct) finish(state, { type: 'draw', reason: 'Ahogado: ' + name(state, state.current) + ' no puede mover' });
  }

  function discardToPile(state, card, why) {
    const P = state.current;
    const pts = points(card);
    state.points[P] += pts;
    state.discardPile.push(card);
    log(state, '🗑️ ' + name(state, P) + ' descarta ' + CARD[card].name + why + ' (+' + pts + (pts === 1 ? ' punto' : ' puntos') + ').');
  }

  // ---------- Cartas ----------
  function hasCaptureAvailable(state) {
    return legalMoves(state).some(function (m) { return m.capture; });
  }

  function canUseCards(state) {
    const P = state.current;
    return state.phase === 'turn' && !state.cardUsed && state.movesThisTurn === 0 && state.turnCount[P] > 1;
  }

  // Cartas que el jugador puede usar ahora mismo ('escudo' incluido si lo tiene)
  function playableCards(state) {
    const P = state.current;
    if (!canUseCards(state)) return [];
    const ids = state.hands[P].slice();
    if (state.escudo[P]) ids.push('escudo');
    return ids.filter(function (id) { return cardAllowed(state, id).ok; });
  }

  function cardAllowed(state, id) {
    const P = state.current;
    if (!canUseCards(state)) {
      if (state.turnCount[P] <= 1) return { ok: false, why: 'No se pueden usar cartas en tu primer turno.' };
      if (state.cardUsed) return { ok: false, why: 'Ya has usado una carta este turno.' };
      return { ok: false, why: 'Las cartas se usan antes de mover.' };
    }
    if (id === 'escudo' ? !state.escudo[P] : state.hands[P].indexOf(id) < 0) return { ok: false, why: 'No tienes esa carta.' };
    const card = CARD[id];
    if (card.type === 'accion' && state.bloodlust === P && hasCaptureAvailable(state)) {
      return { ok: false, why: 'Sed de sangre: este turno estás obligado a capturar.' };
    }
    if (id === 'robo' && !state.hands[other(P)].length) return { ok: false, why: 'Tu rival no tiene cartas.' };
    if (id === 'posesion' && !possessionPieces(state).length) return { ok: false, why: 'Ninguna pieza rival puede capturar a las de su bando.' };
    if (id === 'enroque' && ownPieces(state).length < 2) return { ok: false, why: 'Necesitas dos piezas.' };
    return { ok: true };
  }

  function ownPieces(state) {
    const color = colorOf(state, state.current);
    const out = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.color === color) out.push([r, c]);
    }
    return out;
  }

  // Posesión: capturas de una pieza rival contra su propio bando
  function possessionMoves(state, r, c) {
    const p = state.board[r][c];
    const mine = colorOf(state, state.current);
    if (!p || p.color === mine || p.type === 'k') return [];
    const real = p.color;
    p.color = mine; // se mueve "como si fuera tuya"
    const ms = Engine.pieceMoves(state, r, c);
    p.color = real;
    return ms.filter(function (m) {
      if (!m.capture || m.ep || m.castle !== undefined) return false;
      const t = state.board[m.to[0]][m.to[1]];
      return t && t.color === real && t.type !== 'k' && !isShielded(state, t);
    });
  }
  function possessionPieces(state) {
    const out = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (possessionMoves(state, r, c).length) out.push([r, c]);
    return out;
  }

  // Piezas que la Ruleta puede eliminar
  function ruletaEligible(state) {
    const R = state.ruleta;
    if (!R) return [];
    const side = R.value > 0 ? colorOf(state, other(state.current)) : colorOf(state, state.current);
    const out = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.color === side && p.type !== 'k') out.push([r, c]);
    }
    return out;
  }

  // ¿Es válida esta selección? Suma como máximo el número y no cabe ninguna pieza más
  function ruletaCheck(state, squares) {
    const R = state.ruleta;
    const limit = Math.abs(R.value);
    const eligible = ruletaEligible(state);
    const key = function (s) { return s[0] + ',' + s[1]; };
    const elig = {};
    eligible.forEach(function (s) { elig[key(s)] = true; });
    const seen = {};
    let sum = 0;
    for (const s of squares) {
      if (!elig[key(s)] || seen[key(s)]) return { ok: false, sum: sum, why: 'Esa pieza no se puede elegir.' };
      seen[key(s)] = true;
      sum += VALUES[state.board[s[0]][s[1]].type];
    }
    if (sum > limit) return { ok: false, sum: sum, why: 'Te pasas de ' + limit + ' puntos.' };
    const left = limit - sum;
    const fits = eligible.some(function (s) { return !seen[key(s)] && VALUES[state.board[s[0]][s[1]].type] <= left; });
    if (fits) return { ok: false, sum: sum, why: 'Todavía cabe alguna pieza más.' };
    return { ok: true, sum: sum };
  }

  function playCard(state, id, target) {
    const P = state.current;
    const allowed = cardAllowed(state, id);
    if (!allowed.ok) return false;
    const card = CARD[id];
    const t = target || {};
    const b = state.board;
    const mine = colorOf(state, P);

    // Validación del objetivo antes de gastar la carta
    switch (id) {
      case 'escudo':
      case 'trampa':
      case 'congelar':
        if (!t.sq || !inside(t.sq[0], t.sq[1])) return false;
        if (id === 'escudo' && !(b[t.sq[0]][t.sq[1]] && b[t.sq[0]][t.sq[1]].color === mine)) return false;
        if (id === 'trampa' && (b[t.sq[0]][t.sq[1]] || state.traps.some(function (x) { return x.r === t.sq[0] && x.c === t.sq[1]; }))) return false;
        break;
      case 'enroque': {
        if (!t.a || !t.b || (t.a[0] === t.b[0] && t.a[1] === t.b[1])) return false;
        const pa = b[t.a[0]] && b[t.a[0]][t.a[1]], pb = b[t.b[0]] && b[t.b[0]][t.b[1]];
        if (!pa || !pb || pa.color !== mine || pb.color !== mine) return false;
        if ((pa.type === 'p' && (t.b[0] === 0 || t.b[0] === 7)) || (pb.type === 'p' && (t.a[0] === 0 || t.a[0] === 7))) return false;
        break;
      }
      case 'posesion': {
        if (!t.from || !t.to) return false;
        const ok = possessionMoves(state, t.from[0], t.from[1]).some(function (m) { return m.to[0] === t.to[0] && m.to[1] === t.to[1]; });
        if (!ok) return false;
        break;
      }
    }

    // Gastar la carta
    state.cardUsed = true;
    if (id === 'escudo') state.escudo[P] = false;
    else {
      state.hands[P].splice(state.hands[P].indexOf(id), 1);
      state.discardPile.push(id);
    }
    state.lastPlayed = { card: id, player: P };
    state.playCount++;
    log(state, '✨ ' + name(state, P) + ' usa ' + card.name + '.');

    switch (id) {
      case 'salto':
      case 'fantasma':
        state.buff = id;
        checkStuck(state);
        return true;
      case 'doblepaso':
        state.buff = id;
        state.movesLeft = 2;
        checkStuck(state);
        return true;
      case 'sed':
        state.bloodlust = other(P);
        log(state, '🩸 En su próximo turno, ' + name(state, other(P)) + ' estará obligado a capturar si puede.');
        checkStuck(state);
        return true;
      case 'escudo': {
        const p = b[t.sq[0]][t.sq[1]];
        state.shields.push({ id: p.id, owner: P });
        log(state, '🛡️ El ' + PIECE_NAMES[p.type] + ' de ' + sq(t.sq[0], t.sq[1]) + ' queda protegido hasta el final del próximo turno rival.');
        checkStuck(state);              // después de la carta, el jugador mueve
        return true;
      }
      case 'enroque': {
        const pa = b[t.a[0]][t.a[1]], pb = b[t.b[0]][t.b[1]];
        b[t.a[0]][t.a[1]] = pb;
        b[t.b[0]][t.b[1]] = pa;
        pa.moved = true; pb.moved = true;
        state.lastMove = { from: t.a, to: t.b };
        log(state, '🔁 Intercambian su sitio el ' + PIECE_NAMES[pa.type] + ' de ' + sq(t.a[0], t.a[1]) + ' y el ' + PIECE_NAMES[pb.type] + ' de ' + sq(t.b[0], t.b[1]) + '.');
        checkStuck(state);              // después de la carta, el jugador mueve
        return true;
      }
      case 'apuesta':
        state.queue.push('draw', 'draw');
        state.endAfter = true;
        log(state, '🎲 ' + name(state, P) + ' roba 2 cartas y pierde su movimiento.');
        processQueue(state);
        return true;
      case 'robo':
        // El jugador elige una de las cartas del rival, boca abajo
        state.robo = { player: P };
        state.phase = 'robo';
        return true;
      case 'ruleta': {
        const idx = Math.floor(Math.random() * RULETA.length);
        state.ruleta = { value: RULETA[idx], idx: idx, player: P };
        state.lastRuleta = { value: RULETA[idx], idx: idx, player: P };
        state.ruletaCount++;
        const v = RULETA[idx];
        log(state, '🎡 Ruleta: sale ' + (v > 0 ? '+' + v : v) + '. ' +
          (v > 0 ? name(state, P) + ' elimina piezas rivales.' : name(state, P) + ' tiene que eliminar piezas propias.'));
        if (ruletaCheck(state, []).ok) { // no cabe ninguna pieza
          state.ruleta = null;
          log(state, 'No hay ninguna pieza que quepa en ese número.');
          checkStuck(state);
        } else {
          state.phase = 'ruleta';
        }
        return true;
      }
      case 'trampa':
        state.traps.push({ r: t.sq[0], c: t.sq[1], owner: P });
        log(state, '🪤 ' + name(state, P) + ' coloca una trampa oculta en algún lugar del tablero.');
        checkStuck(state);              // después de la carta, el jugador mueve
        return true;
      case 'congelar': {
        const ids = [], squares = [];
        for (let r = t.sq[0] - 1; r <= t.sq[0] + 1; r++) {
          for (let c = t.sq[1] - 1; c <= t.sq[1] + 1; c++) {
            if (!inside(r, c)) continue;
            squares.push([r, c]);
            const p = b[r][c];
            if (p && p.type !== 'k' && !isShielded(state, p)) ids.push(p.id);
          }
        }
        state.frozen = { ids: ids, player: other(P), squares: squares };
        log(state, '❄️ Zona congelada alrededor de ' + sq(t.sq[0], t.sq[1]) + ': ' + ids.length + (ids.length === 1 ? ' pieza no podrá' : ' piezas no podrán') + ' moverse en el próximo turno.');
        checkStuck(state);              // después de la carta, el jugador mueve
        return true;
      }
      case 'posesion': {
        const p = b[t.from[0]][t.from[1]];
        const captured = removePiece(state, t.to[0], t.to[1]);
        b[t.to[0]][t.to[1]] = p;
        b[t.from[0]][t.from[1]] = null;
        p.moved = true;
        state.lastMove = { from: t.from, to: t.to };
        log(state, '😈 Posesión: el ' + PIECE_NAMES[p.type] + ' rival de ' + sq(t.from[0], t.from[1]) + ' captura a su propio ' + PIECE_NAMES[captured.type] + ' en ' + sq(t.to[0], t.to[1]) + '.');
        lossDraw(state, captured);
        checkTrap(state, t.to[0], t.to[1]);
        checkStuck(state);              // después de la carta, el jugador mueve
        return true;
      }
    }
    return false;
  }

  // ---------- Acciones ----------
  function apply(state, action, player) {
    if (!action || state.phase === 'over' || player !== state.current) return false;
    const P = state.current;
    switch (action.type) {
      case 'move':
        if (state.phase !== 'turn') return false;
        return doMove(state, action, action.promo);

      case 'play':
        if (state.phase !== 'turn') return false;
        return playCard(state, action.card, action.target);

      case 'discardCard': {
        if (!canUseCards(state)) return false;
        const hand = state.hands[P];
        if (!(action.index >= 0 && action.index < hand.length)) return false;
        const card = hand.splice(action.index, 1)[0];
        state.cardUsed = true;
        discardToPile(state, card, '');
        return true;
      }

      case 'ascend': {
        if (state.phase !== 'turn' || state.movesThisTurn > 0 || state.points[P] < ASC_POINTS) return false;
        const p = state.board[action.r] && state.board[action.r][action.c];
        if (!p || p.color !== colorOf(state, P)) return false;
        const next = { p: ['n', 'b'], n: ['r'], b: ['r'], r: ['q'] }[p.type];
        if (!next || next.indexOf(action.to) < 0) return false;
        const from = p.type;
        p.type = action.to;
        state.points[P] -= ASC_POINTS;
        state.lastConverted = [[action.r, action.c]];
        log(state, '⬆️ Ascenso: el ' + PIECE_NAMES[from] + ' de ' + sq(action.r, action.c) + ' pasa a ser ' + PIECE_NAMES[action.to] + '.');
        return true;
      }

      case 'duplicate': {
        if (state.phase !== 'duplicate') return false;
        const card = state.incoming;
        state.incoming = null;
        state.phase = 'turn';
        if (action.choice === 'combine' && CARD[card].rarity !== 'epica') {
          const hand = state.hands[P];
          hand.splice(hand.indexOf(card), 1);
          const nextRarity = RARITY_ORDER[RARITY_ORDER.indexOf(CARD[card].rarity) + 1];
          const pool = Def.CARDS.filter(function (c) { return c.rarity === nextRarity; });
          const made = pool[Math.floor(Math.random() * pool.length)].id;
          log(state, '🔀 ' + name(state, P) + ' combina dos cartas iguales en una ' + Def.RARITIES[nextRarity].name.toLowerCase() + '.');
          state.queue.unshift(made);
        } else {
          discardToPile(state, card, ' (repetida)');
        }
        processQueue(state);
        return true;
      }

      case 'discard': {
        if (state.phase !== 'discard') return false;
        const hand = state.hands[P];
        if (!(action.index >= 0 && action.index < hand.length)) return false;
        const card = hand.splice(action.index, 1)[0];
        state.phase = 'turn';
        discardToPile(state, card, ' (mano llena)');
        processQueue(state);
        return true;
      }

      case 'roboPick': {
        if (state.phase !== 'robo') return false;
        const rh = state.hands[other(P)];
        if (!(action.index >= 0 && action.index < rh.length)) return false;
        const stolen = rh.splice(action.index, 1)[0];
        state.roboCount = (state.roboCount || 0) + 1;
        state.lastRobo = { player: P, card: stolen, index: action.index, n: state.roboCount };
        state.robo = null;
        state.phase = 'turn';
        log(state, '🦝 ' + name(state, P) + ' le roba una carta a ' + name(state, other(P)) + '.');
        state.queue.push(stolen);
        processQueue(state);
        return true;
      }

      case 'ruletaPick': {
        if (state.phase !== 'ruleta') return false;
        const squares = action.squares || [];
        if (!ruletaCheck(state, squares).ok) return false;
        const names = [];
        for (const s of squares) {
          const p = removePiece(state, s[0], s[1]);
          names.push(PIECE_NAMES[p.type] + ' (' + sq(s[0], s[1]) + ')');
        }
        log(state, '🎡 Eliminadas por la Ruleta: ' + (names.length ? names.join(', ') : 'ninguna') + '.');
        state.ruleta = null;
        state.phase = 'turn';
        checkStuck(state);
        return true;
      }
    }
    return false;
  }

  // ---------- Bot básico ----------
  function clone(s) {
    const logArr = s.log;
    s.log = [];
    const c = JSON.parse(JSON.stringify(s));
    s.log = logArr;
    return c;
  }

  function score(s, P) {
    const Bot = BotLib();
    return Bot.evaluate(s, P, colorOf(s, P));
  }

  // Mejor movimiento (o pareja de movimientos con Doble paso) desde el estado dado
  function bestMove(state, P, level, depth) {
    let best = null;
    for (const m of legalMoves(state)) {
      const s = clone(state);
      doMove(s, m, 'q');
      let sc;
      if (depth > 1 && s.phase === 'turn' && s.current === P) sc = bestMove(s, P, level, depth - 1).score;
      else sc = score(s, P);
      if (level === 'facil') sc += (Math.random() - 0.5) * 6;
      if (!best || sc > best.score) best = { move: m, score: sc };
    }
    return best || { move: null, score: -Infinity };
  }

  // Lo que sabe el bot: no ve las trampas del rival
  function botView(state, P) {
    const v = clone(state);
    v.traps = v.traps.filter(function (t) { return t.owner === P; });
    return v;
  }

  function materialDiff(state, P) {
    const mine = colorOf(state, P);
    let d = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.type !== 'k') d += p.color === mine ? VALUES[p.type] : -VALUES[p.type];
    }
    return d;
  }

  // Movimientos que tendría el rival si le tocara ahora
  function rivalMoves(state, P) {
    const c = clone(state);
    c.current = other(P);
    c.phase = 'turn';
    c.buff = null;
    c.movesLeft = 1;
    c.movesThisTurn = 0;
    return legalMoves(c);
  }

  // Ruleta: elige la selección válida que deja mejor la posición
  function ruletaChoice(state, P) {
    const elig = ruletaEligible(state);
    const val = function (q) { return VALUES[state.board[q[0]][q[1]].type]; };
    const orders = [
      elig.slice().sort(function (a, b) { return val(b) - val(a); }),
      elig.slice().sort(function (a, b) { return val(a) - val(b); }),
    ];
    for (let i = 0; i < 24; i++) orders.push(shuffle(elig.slice()));
    let best = null;
    for (const order of orders) {
      let left = Math.abs(state.ruleta.value);
      const pick = [];
      for (const q of order) { const v = val(q); if (v <= left) { pick.push(q); left -= v; } }
      if (!ruletaCheck(state, pick).ok) continue;
      const c = clone(state);
      apply(c, { type: 'ruletaPick', squares: pick }, P);
      const sc = score(c, P);
      if (!best || sc > best.score) best = { squares: pick, score: sc };
    }
    return best;
  }

  // Puntuación tras la carta, contando el movimiento que viene después
  function afterCard(c, P, level) {
    if (c.phase === 'turn' && c.current === P) {
      const r = bestMove(c, P, level, 1);
      if (r.move) return r.score;
    }
    return score(c, P);
  }

  // Valor esperado de girar la Ruleta (media de las 8 casillas), con el movimiento posterior
  function ruletaExpected(view, P, level) {
    let total = 0;
    for (let i = 0; i < RULETA.length; i++) {
      const c = clone(view);
      c.cardUsed = true;
      c.ruleta = { value: RULETA[i], idx: i, player: P };
      if (!ruletaCheck(c, []).ok) {
        c.phase = 'ruleta';
        const ch = ruletaChoice(c, P);
        if (ch) apply(c, { type: 'ruletaPick', squares: ch.squares }, P);
      }
      c.ruleta = null;
      c.phase = 'turn';
      total += afterCard(c, P, level);
    }
    return total / RULETA.length;
  }

  // Candidatos con cartas de acción: { action, score } (score comparable con el de mover)
  function actionCandidates(state, view, P, base, level) {
    const out = [];
    const cards = playableCards(state);
    const has = function (id) { return cards.indexOf(id) >= 0; };
    const pass = score(view, P);                 // sin mover: el tablero se queda igual
    // Prueba varios objetivos: primero un filtro rápido y luego, en los mejores, con el movimiento posterior
    const best = function (id, targets, extra) {
      const quick = [];
      for (const t of targets) {
        const c = clone(view);
        if (!playCard(c, id, t)) continue;
        quick.push({ t: t, c: c, s: score(c, P) + (extra ? extra(t) : 0) });
      }
      quick.sort(function (x, y) { return y.s - x.s; });
      quick.slice(0, 6).forEach(function (q) {
        out.push({ action: { type: 'play', card: id, target: q.t }, score: afterCard(q.c, P, level) + (extra ? extra(q.t) : 0) });
      });
    };

    // Posesión: la captura que más gane
    if (has('posesion')) {
      const ts = [];
      for (const f of possessionPieces(view)) for (const m of possessionMoves(view, f[0], f[1])) ts.push({ from: f, to: m.to });
      best('posesion', ts);
    }
    // Escudo: proteger la pieza propia que esté en peligro
    if (has('escudo')) best('escudo', ownPieces(view).map(function (q) { return { sq: q }; }));
    // Congelar: la zona que más amenazas o material rival bloquea
    if (has('congelar')) {
      const rivalColor = colorOf(view, other(P));
      const material = function (t) {
        let m = 0;
        for (let rr = t.sq[0] - 1; rr <= t.sq[0] + 1; rr++) for (let cc = t.sq[1] - 1; cc <= t.sq[1] + 1; cc++) {
          const p = inside(rr, cc) && view.board[rr][cc];
          if (p && p.color === rivalColor && p.type !== 'k') m += VALUES[p.type];
        }
        return m;
      };
      const ts = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (material({ sq: [r, c] })) ts.push({ sq: [r, c] });
      best('congelar', ts, function (t) { return 0.05 * material(t); });
    }
    // Enroque: el intercambio de dos piezas propias que mejor quede
    if (has('enroque')) {
      const own = ownPieces(view), ts = [];
      for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) ts.push({ a: own[i], b: own[j] });
      best('enroque', ts);
    }
    // Trampa: en una casilla vacía a la que puedan llegar piezas rivales valiosas
    if (has('trampa')) {
      const reach = {};
      for (const m of rivalMoves(view, P)) {
        if (m.capture) continue;
        const p = view.board[m.from[0]][m.from[1]];
        if (p.type === 'k') continue;
        const k = m.to[0] + ',' + m.to[1];
        reach[k] = (reach[k] || 0) + VALUES[p.type];
      }
      let bestSq = null, bestW = 0;
      Object.keys(reach).forEach(function (k) {
        const q = k.split(',').map(Number);
        if (state.board[q[0]][q[1]] || state.traps.some(function (t) { return t.r === q[0] && t.c === q[1]; })) return;
        if (reach[k] > bestW) { bestW = reach[k]; bestSq = q; }
      });
      if (bestSq) out.push({ action: { type: 'play', card: 'trampa', target: { sq: bestSq } }, score: base.score + Math.min(bestW, 9) * 0.12 });
    }
    // Ruleta: si va perdiendo, o si en promedio sale a cuenta
    if (has('ruleta')) {
      const ev = ruletaExpected(view, P, level);
      const losing = materialDiff(view, P) <= -3;
      out.push({ action: { type: 'play', card: 'ruleta' }, score: losing ? ev + 1 : ev });
    }
    // Apuesta (te quita el movimiento): con la mano casi vacía y si mover no corre prisa
    if (has('apuesta') && state.hands[P].length <= 2) {
      out.push({ action: { type: 'play', card: 'apuesta' }, score: pass + (state.hands[P].length === 1 ? 0.8 : 0.3) });
    }
    // Robo: si el rival acumula cartas (después mueve igual)
    if (has('robo')) {
      const n = state.hands[other(P)].length;
      out.push({ action: { type: 'play', card: 'robo' }, score: base.score + (n >= 3 ? 0.9 : n === 2 ? 0.5 : 0.1) });
    }
    return out;
  }

  function botAction(state, level) {
    const P = state.current;
    switch (state.phase) {
      case 'duplicate':
        return { type: 'duplicate', choice: CARD[state.incoming].rarity === 'epica' ? 'discard' : 'combine' };
      case 'discard': {
        const hand = state.hands[P];
        let idx = 0;
        hand.forEach(function (id, i) { if (points(id) < points(hand[idx])) idx = i; });
        return { type: 'discard', index: idx };
      }
      case 'robo':
        return { type: 'roboPick', index: Math.floor(Math.random() * state.hands[other(P)].length) };
      case 'ruleta': {
        const ch = ruletaChoice(state, P);
        return { type: 'ruletaPick', squares: ch ? ch.squares : [] };
      }
      case 'turn': {
        const view = botView(state, P);
        // Ascenso si hay puntos
        if (state.movesThisTurn === 0 && state.points[P] >= ASC_POINTS) {
          let best = null;
          for (const s of ownPieces(view)) {
            const p = view.board[s[0]][s[1]];
            const opts = { p: ['n', 'b'], n: ['r'], b: ['r'], r: ['q'] }[p.type] || [];
            for (const to of opts) {
              const c = clone(view);
              apply(c, { type: 'ascend', r: s[0], c: s[1], to: to }, P);
              const sc = score(c, P);
              if (!best || sc > best.score) best = { action: { type: 'ascend', r: s[0], c: s[1], to: to }, score: sc };
            }
          }
          if (best) return best.action;
        }
        const base = bestMove(view, P, level, 1);
        if (canUseCards(state)) {
          let choice = null;
          // Potenciadoras: se usan si mejoran claramente la jugada
          for (const id of ['doblepaso', 'fantasma', 'salto']) {
            if (state.hands[P].indexOf(id) < 0 || !cardAllowed(state, id).ok) continue;
            const c = clone(view);
            playCard(c, id, null);
            const r = bestMove(c, P, level, id === 'doblepaso' ? 2 : 1);
            if (r.move && r.score > base.score + 1 && (!choice || r.score > choice.score)) choice = { action: { type: 'play', card: id }, score: r.score };
          }
          // Cartas de acción (en fácil, solo a veces)
          if (level !== 'facil' || Math.random() < 0.5) {
            for (const cand of actionCandidates(state, view, P, base, level)) {
              const margin = base.move ? 0.4 : -Infinity;
              if (cand.score > base.score + margin && (!choice || cand.score > choice.score)) choice = cand;
            }
          }
          if (choice) return choice.action;
          if (!base.move) {
            const act = playableCards(state).find(function (id) { return id === 'apuesta' || id === 'robo'; });
            if (act) return { type: 'play', card: act };
          }
        }
        if (base.move) return { type: 'move', from: base.move.from, to: base.move.to, promo: 'q' };
        return null;
      }
    }
    return null;
  }

  function restore(obj) {
    const s = JSON.parse(JSON.stringify(obj));
    maxId(s.board);
    return s;
  }

  const ArsenalEngine = {
    VALUES: VALUES,
    RULETA: RULETA,
    CARD: CARD,
    HAND_LIMIT: HAND_LIMIT,
    ASC_POINTS: ASC_POINTS,
    newGame: newGame,
    restore: restore,
    apply: apply,
    legalMoves: legalMoves,
    legalMovesFrom: legalMovesFrom,
    needsPromotion: needsPromotion,
    canUseCards: canUseCards,
    cardAllowed: cardAllowed,
    playableCards: playableCards,
    ownPieces: ownPieces,
    possessionMoves: possessionMoves,
    possessionPieces: possessionPieces,
    ruletaEligible: ruletaEligible,
    ruletaCheck: ruletaCheck,
    isShielded: isShielded,
    isFrozen: isFrozen,
    botAction: botAction,
    points: points,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ArsenalEngine;
  else root.ArsenalEngine = ArsenalEngine;
})(this);
