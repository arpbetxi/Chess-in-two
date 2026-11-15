/*
 * Ajedrez con cartas — motor de reglas
 * --------------------------------------
 * Toda la lógica del juego, sin nada de interfaz.
 * Coordenadas: board[fila][columna]; fila 0 = fila 8 del tablero (lado negro),
 * fila 7 = fila 1 (lado blanco); columna 0 = columna "a".
 */
(function (root) {
  'use strict';

  // ---------- Mazo ----------
  // Composición del reglamento (60 cartas). Cambia los números para equilibrar.
  const DECK_SPEC = [
    { kind: 'num', n: 1, count: 30 },
    { kind: 'num', n: 2, count: 12 },
    { kind: 'num', n: 3, count: 4 },
    { kind: 'bloqueo', count: 4 },
    { kind: 'color', count: 4 },   // Cambio de color: conviertes 1 pieza rival
    { kind: 'mas2', count: 3 },    // +2: revives hasta 2 piezas tuyas
    { kind: 'sentido', count: 2 }, // Cambio de sentido: se intercambian los colores
    { kind: 'mas4', count: 1 },    // +4 Ruleta: 4 piezas rivales al azar pasan a tu bando
  ];

  // ---------- Conjuntos de reglas ----------
  // 'actual':   se pueden encadenar capturas; si amenazas al rey rival, tu turno termina.
  // 'original': (v1, oculta) una captura termina el turno; amenazar al rey no tiene efecto.
  //             Ver reglas/reglamento-v1-captura-termina-turno.md
  const RULESETS = {
    actual: { captureEndsTurn: false, threatEndsTurn: true, name: 'Termina al amenazar al rey' },
    original: { captureEndsTurn: true, threatEndsTurn: false, name: 'Termina al capturar' },
  };
  const DEFAULT_RULESET = 'actual';
  function rulesOf(state) { return RULESETS[(state && state.rules) || DEFAULT_RULESET] || RULESETS[DEFAULT_RULESET]; }

  const PIECE_NAMES = { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey' };
  const COLOR_NAMES = { w: 'blancas', b: 'negras' };

  function cardName(card) {
    switch (card.kind) {
      case 'num': return card.n === 1 ? '1 movimiento' : card.n + ' movimientos';
      case 'bloqueo': return 'Bloqueo';
      case 'color': return 'Cambio de color';
      case 'mas2': return '+2';
      case 'mas4': return '+4 Ruleta';
      case 'sentido': return 'Cambio de sentido';
    }
    return '?';
  }

  function cardDescription(card, state) {
    switch (card.kind) {
      case 'num':
        return 'Haces ' + cardName(card) + ' seguidos. ' +
          (rulesOf(state).captureEndsTurn ? 'Si capturas, el turno termina.' : 'Si amenazas al rey rival, el turno termina.');
      case 'bloqueo': return 'Pierdes el turno.';
      case 'color': return 'Conviertes 1 pieza rival (no el rey).';
      case 'mas2': return 'Revives hasta 2 piezas capturadas de tu color en tu mitad del tablero.';
      case 'mas4': return 'Ruleta: 4 piezas rivales al azar pasan a tu bando (nunca el rey).';
      case 'sentido': return 'Se gira el tablero: los jugadores intercambian colores.';
    }
    return '';
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildDeck(rng) {
    const deck = [];
    for (const spec of DECK_SPEC) {
      for (let i = 0; i < spec.count; i++) {
        deck.push(spec.kind === 'num' ? { kind: 'num', n: spec.n } : { kind: spec.kind });
      }
    }
    return shuffle(deck, rng);
  }

  // ---------- Piezas y tablero ----------
  let uid = 0;
  function makePiece(type, color, moved) {
    return { id: ++uid, type: type, color: color, moved: !!moved };
  }

  function createBoard() {
    const b = [];
    for (let r = 0; r < 8; r++) b.push(new Array(8).fill(null));
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let c = 0; c < 8; c++) {
      b[0][c] = makePiece(back[c], 'b');
      b[1][c] = makePiece('p', 'b');
      b[6][c] = makePiece('p', 'w');
      b[7][c] = makePiece(back[c], 'w');
    }
    return b;
  }

  function inside(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function squareName(r, c) { return 'abcdefgh'[c] + (8 - r); }
  function homeRow(color) { return color === 'w' ? 7 : 0; }
  function promoRow(color) { return color === 'w' ? 0 : 7; }
  function pawnStartRow(color) { return color === 'w' ? 6 : 1; }

  // ---------- Estado de la partida ----------
  function newGame(rng, rules) {
    return {
      rules: RULESETS[rules] ? rules : DEFAULT_RULESET, // conjunto de reglas de esta partida
      board: createBoard(),
      captured: { w: [], b: [] },       // piezas capturadas de cada color (tipos)
      playerColor: { 1: 'w', 2: 'b' },  // qué color lleva cada jugador
      current: 1,                       // jugador al que le toca
      deck: buildDeck(rng),
      discard: [],
      phase: 'draw',                    // draw | moves | convert | revive | over
      card: null,                       // carta en juego este turno
      lastCard: null,                   // { card, player } para mostrarla
      movesLeft: 0,
      movesThisTurn: 0,
      pending: 0,                       // conversiones / revividas que faltan
      ep: null,                         // captura al paso disponible
      lastMove: null,
      lastConverted: [],                // casillas convertidas en el último turno
      result: null,                     // { type: 'win'|'draw', player?, reason }
      log: [],
    };
  }

  function myColor(state) { return state.playerColor[state.current]; }
  function playerLabel(state, player) {
    return 'Jugador ' + player + ' (' + COLOR_NAMES[state.playerColor[player]] + ')';
  }
  function addLog(state, text) { state.log.push(text); }

  // ---------- Generación de movimientos (sin jaque) ----------
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

  function epAvailable(state, color, tr, tc) {
    const ep = state.ep;
    if (!ep) return false;
    if (ep.player === state.current) return false;     // solo el rival
    if (state.movesThisTurn !== 0) return false;       // solo en su primer movimiento
    if (ep.target[0] !== tr || ep.target[1] !== tc) return false;
    const pawn = state.board[ep.pawnPos[0]][ep.pawnPos[1]];
    return !!pawn && pawn.id === ep.pawnId && pawn.color !== color;
  }

  function pieceMoves(state, r, c) {
    const b = state.board;
    const p = b[r][c];
    if (!p) return [];
    const color = p.color;
    const out = [];
    const add = function (tr, tc, extra) {
      out.push(Object.assign({ from: [r, c], to: [tr, tc] }, extra || {}));
    };
    const slide = function (dirs, maxSteps) {
      for (const d of dirs) {
        let tr = r + d[0], tc = c + d[1], steps = 0;
        while (inside(tr, tc) && steps < maxSteps) {
          const t = b[tr][tc];
          if (!t) add(tr, tc);
          else { if (t.color !== color) add(tr, tc, { capture: true }); break; }
          tr += d[0]; tc += d[1]; steps++;
        }
      }
    };

    switch (p.type) {
      case 'p': {
        const d = color === 'w' ? -1 : 1;
        const r1 = r + d;
        if (inside(r1, c) && !b[r1][c]) {
          add(r1, c);
          const r2 = r + 2 * d;
          if (!p.moved && r === pawnStartRow(color) && inside(r2, c) && !b[r2][c]) {
            add(r2, c, { double: true });
          }
        }
        for (const dc of [-1, 1]) {
          const tc = c + dc;
          if (!inside(r1, tc)) continue;
          const t = b[r1][tc];
          if (t && t.color !== color) add(r1, tc, { capture: true });
          else if (!t && epAvailable(state, color, r1, tc)) add(r1, tc, { capture: true, ep: true });
        }
        break;
      }
      case 'n':
        for (const d of KNIGHT) {
          const tr = r + d[0], tc = c + d[1];
          if (!inside(tr, tc)) continue;
          const t = b[tr][tc];
          if (!t) add(tr, tc);
          else if (t.color !== color) add(tr, tc, { capture: true });
        }
        break;
      case 'b': slide(DIAG, 8); break;
      case 'r': slide(ORTH, 8); break;
      case 'q': slide(ORTH.concat(DIAG), 8); break;
      case 'k': {
        slide(ORTH.concat(DIAG), 1);
        // Enroque: sin restricciones de jaque (no existe el jaque)
        if (!p.moved && r === homeRow(color) && c === 4) {
          const sides = [
            { rookCol: 7, between: [5, 6], kingTo: 6 },
            { rookCol: 0, between: [1, 2, 3], kingTo: 2 },
          ];
          for (const s of sides) {
            const rook = b[r][s.rookCol];
            if (rook && rook.type === 'r' && rook.color === color && !rook.moved &&
                s.between.every(function (cc) { return !b[r][cc]; })) {
              add(r, s.kingTo, { castle: s.rookCol });
            }
          }
        }
        break;
      }
    }
    return out;
  }

  function allMoves(state, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (p && p.color === color) moves.push.apply(moves, pieceMoves(state, r, c));
      }
    }
    return moves;
  }

  // Movimientos que el jugador actual puede hacer con la pieza de (r, c)
  function legalMovesFrom(state, r, c) {
    if (state.phase !== 'moves') return [];
    const p = state.board[r][c];
    if (!p || p.color !== myColor(state)) return [];
    return pieceMoves(state, r, c);
  }

  function needsPromotion(state, move) {
    const p = state.board[move.from[0]][move.from[1]];
    return !!p && p.type === 'p' && move.to[0] === promoRow(p.color);
  }

  // ---------- Flujo del turno ----------
  function endTurn(state) {
    if (state.card) state.discard.push(state.card);
    state.card = null;
    // La captura al paso caduca cuando termina el turno del rival
    if (state.ep && state.ep.player !== state.current) state.ep = null;
    state.current = state.current === 1 ? 2 : 1;
    state.phase = 'draw';
    state.movesLeft = 0;
    state.movesThisTurn = 0;
    state.pending = 0;
  }

  function finish(state, result) {
    state.result = result;
    state.phase = 'over';
    if (result.type === 'win') addLog(state, '🏆 ' + result.reason + '. Gana ' + playerLabel(state, result.player) + '.');
    else addLog(state, '🤝 ' + result.reason + '. Tablas.');
  }

  // Si al jugador le quedan movimientos pero no tiene ninguno posible: ahogado
  function checkStalemate(state) {
    if (state.phase === 'moves' && state.movesLeft > 0 && allMoves(state, myColor(state)).length === 0) {
      finish(state, { type: 'draw', reason: 'Ahogado: ' + playerLabel(state, state.current) + ' no puede mover' });
      return true;
    }
    return false;
  }

  function convertibleCount(state) {
    const mine = myColor(state);
    let n = 0;
    for (const row of state.board) for (const p of row) if (p && p.color !== mine && p.type !== 'k') n++;
    return n;
  }

  function drawCard(state) {
    if (state.phase !== 'draw') return null;
    if (state.deck.length === 0) {
      state.deck = shuffle(state.discard);
      state.discard = [];
      addLog(state, '🔀 Se baraja el descarte para formar un mazo nuevo.');
    }
    const card = state.deck.pop();
    state.card = card;
    state.drawCount = (state.drawCount || 0) + 1; // cuántas cartas se han robado en la partida
    state.lastConverted = [];
    state.lastCard = { card: card, player: state.current };
    const who = playerLabel(state, state.current);
    addLog(state, '🃏 ' + who + ' roba: ' + cardName(card) + '.');

    switch (card.kind) {
      case 'num':
        state.phase = 'moves';
        state.movesLeft = card.n;
        state.movesThisTurn = 0;
        checkStalemate(state);
        break;
      case 'bloqueo':
        addLog(state, '⛔ ' + who + ' pierde el turno.');
        endTurn(state);
        break;
      case 'color': {
        if (convertibleCount(state) === 0) { addLog(state, 'No hay piezas rivales que convertir.'); endTurn(state); }
        else { state.phase = 'convert'; state.pending = 1; }
        break;
      }
      case 'mas4': {
        // Ruleta: se eligen al azar hasta 4 piezas rivales (nunca el rey)
        const mine = myColor(state);
        const options = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const p = state.board[r][c];
            if (p && p.color !== mine && p.type !== 'k') options.push([r, c]);
          }
        }
        shuffle(options);
        const chosen = options.slice(0, 4);
        if (chosen.length === 0) addLog(state, 'No hay piezas rivales que convertir.');
        for (const sq of chosen) {
          const p = state.board[sq[0]][sq[1]];
          p.color = mine;
          p.moved = true;
          addLog(state, '🎰 Ruleta: ' + PIECE_NAMES[p.type] + ' en ' + squareName(sq[0], sq[1]) + ' pasa a ' + COLOR_NAMES[mine] + '.');
        }
        state.lastConverted = chosen;
        endTurn(state);
        break;
      }
      case 'mas2': {
        const n = Math.min(2, state.captured[myColor(state)].length);
        if (n === 0) { addLog(state, 'No hay piezas capturadas que revivir.'); endTurn(state); }
        else { state.phase = 'revive'; state.pending = n; }
        break;
      }
      case 'sentido': {
        const c1 = state.playerColor[1];
        state.playerColor[1] = state.playerColor[2];
        state.playerColor[2] = c1;
        addLog(state, '🔄 Se gira el tablero: Jugador 1 lleva ' + COLOR_NAMES[state.playerColor[1]] +
          ' y Jugador 2 lleva ' + COLOR_NAMES[state.playerColor[2]] + '.');
        endTurn(state);
        break;
      }
    }
    return card;
  }

  function makeMove(state, move, promoType) {
    if (state.phase !== 'moves') return false;
    const valid = legalMovesFrom(state, move.from[0], move.from[1]).find(function (m) {
      return m.to[0] === move.to[0] && m.to[1] === move.to[1];
    });
    if (!valid) return false;
    move = valid;

    const b = state.board;
    const fr = move.from[0], fc = move.from[1], tr = move.to[0], tc = move.to[1];
    const p = b[fr][fc];
    let captured = null;

    if (move.ep) {
      const pr = state.ep.pawnPos[0], pc = state.ep.pawnPos[1];
      captured = b[pr][pc];
      b[pr][pc] = null;
    } else if (b[tr][tc]) {
      captured = b[tr][tc];
    }

    b[tr][tc] = p;
    b[fr][fc] = null;
    p.moved = true;

    let text = PIECE_NAMES[p.type] + ' ' + squareName(fr, fc) + '→' + squareName(tr, tc);

    if (move.castle !== undefined) {
      const rook = b[fr][move.castle];
      const rookTo = move.castle === 7 ? 5 : 3;
      b[fr][rookTo] = rook;
      b[fr][move.castle] = null;
      rook.moved = true;
      text = move.castle === 7 ? 'enroque corto' : 'enroque largo';
    }

    // Captura al paso: el rival la pierde en cuanto hace su primer movimiento
    if (state.ep && state.ep.player !== state.current) state.ep = null;
    if (move.double) {
      state.ep = { player: state.current, pawnId: p.id, pawnPos: [tr, tc], target: [(fr + tr) / 2, fc] };
    }

    if (p.type === 'p' && tr === promoRow(p.color)) {
      p.type = ['q', 'r', 'b', 'n'].indexOf(promoType) >= 0 ? promoType : 'q';
      text += ' (corona: ' + PIECE_NAMES[p.type] + ')';
    }

    if (captured) {
      state.captured[captured.color].push(captured.type);
      text += ' — captura ' + PIECE_NAMES[captured.type] + (move.ep ? ' al paso' : '');
    }

    state.movesLeft--;
    state.movesThisTurn++;
    state.lastMove = { from: [fr, fc], to: [tr, tc] };
    addLog(state, '♟ ' + playerLabel(state, state.current) + ': ' + text + '.');

    if (captured && captured.type === 'k') {
      finish(state, { type: 'win', player: state.current, reason: 'Rey capturado' });
      return true;
    }
    const rules = rulesOf(state);
    if (rules.captureEndsTurn && captured && state.movesLeft > 0) {
      // Reglas originales: una captura termina el turno aunque queden movimientos
      addLog(state, '✋ La captura termina el turno.');
      state.movesLeft = 0;
    }
    if (rules.threatEndsTurn && state.movesLeft > 0 && threatensEnemyKing(state, myColor(state))) {
      // Reglas actuales: si dejas al rey rival amenazado, tu turno termina
      addLog(state, '⚠️ ¡Rey amenazado! El turno termina.');
      state.movesLeft = 0;
    }
    if (state.movesLeft === 0) endTurn(state);
    else checkStalemate(state);
    return true;
  }

  // ¿Alguna pieza de `color` podría capturar al rey rival con su próximo movimiento?
  function threatensEnemyKing(state, color) {
    let king = null;
    for (let r = 0; r < 8 && !king; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (p && p.type === 'k' && p.color !== color) { king = [r, c]; break; }
      }
    }
    if (!king) return false;
    return allMoves(state, color).some(function (m) { return m.to[0] === king[0] && m.to[1] === king[1]; });
  }

  function canConvert(state, r, c) {
    if (state.phase !== 'convert') return false;
    const p = state.board[r][c];
    return !!p && p.color !== myColor(state) && p.type !== 'k';
  }

  function convertPiece(state, r, c) {
    if (!canConvert(state, r, c)) return false;
    const p = state.board[r][c];
    p.color = myColor(state);
    p.moved = true; // ya no puede enrocar ni avanzar dos casillas
    state.lastConverted = (state.lastConverted || []).concat([[r, c]]);
    state.pending--;
    addLog(state, '🎨 ' + playerLabel(state, state.current) + ' convierte ' +
      PIECE_NAMES[p.type] + ' en ' + squareName(r, c) + '.');
    if (state.pending === 0) endTurn(state);
    return true;
  }

  function canRevivePlace(state, type, r, c) {
    if (state.phase !== 'revive') return false;
    if (!inside(r, c) || state.board[r][c]) return false;
    if (type === 'p' && (r === 0 || r === 7)) return false;
    // Solo en tu mitad del tablero: filas 1-4 para blancas, 5-8 para negras
    const mine = myColor(state);
    if (mine === 'w' ? r < 4 : r > 3) return false;
    return true;
  }

  function revivePiece(state, capturedIndex, r, c) {
    const list = state.captured[myColor(state)];
    const type = list[capturedIndex];
    if (!type || !canRevivePlace(state, type, r, c)) return false;
    list.splice(capturedIndex, 1);
    state.board[r][c] = makePiece(type, myColor(state), true);
    state.pending--;
    addLog(state, '✨ ' + playerLabel(state, state.current) + ' revive ' +
      PIECE_NAMES[type] + ' en ' + squareName(r, c) + '.');
    if (state.pending === 0) endTurn(state);
    return true;
  }

  // Recupera un estado recibido por la red o guardado (JSON) y lo deja listo para usar
  function restore(obj) {
    const state = JSON.parse(JSON.stringify(obj));
    for (const row of state.board) for (const p of row) if (p && p.id > uid) uid = p.id;
    return state;
  }

  const Engine = {
    restore: restore,
    DECK_SPEC: DECK_SPEC,
    RULESETS: RULESETS,
    DEFAULT_RULESET: DEFAULT_RULESET,
    threatensEnemyKing: threatensEnemyKing,
    PIECE_NAMES: PIECE_NAMES,
    COLOR_NAMES: COLOR_NAMES,
    newGame: newGame,
    myColor: myColor,
    playerLabel: playerLabel,
    cardName: cardName,
    cardDescription: cardDescription,
    squareName: squareName,
    pieceMoves: pieceMoves,
    allMoves: allMoves,
    legalMovesFrom: legalMovesFrom,
    needsPromotion: needsPromotion,
    drawCard: drawCard,
    makeMove: makeMove,
    canConvert: canConvert,
    convertPiece: convertPiece,
    canRevivePlace: canRevivePlace,
    revivePiece: revivePiece,
    endTurn: endTurn,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(this);
