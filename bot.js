/*
 * Ajedrez con cartas — bot
 * -------------------------
 * Usa el mismo motor de reglas (engine.js). En su turno prueba las combinaciones
 * de movimientos que permite su carta, puntúa la posición resultante y elige la mejor.
 *
 * La puntuación tiene en cuenta:
 *  - material (peón 1, caballo y alfil 3, torre 5, dama 9)
 *  - si su rey queda a tiro del rival (perder el rey = perder la partida)
 *  - piezas propias amenazadas y sin defensa
 *  - pequeños detalles posicionales (avance de peones, piezas en el centro)
 *
 * Dificultad:
 *  - 'facil':  añade azar a la puntuación, así que comete errores.
 *  - 'normal': siempre elige lo que considera mejor.
 */
(function (root) {
  'use strict';

  const Engine = root.Engine || (typeof require !== 'undefined' ? require('./engine.js') : null);

  const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const WIN = 100000;
  const BEAM = 60; // combinaciones que se siguen explorando en cada paso

  // Probabilidad aproximada de que el rival pueda mover en su próximo turno (cartas de número)
  function moveCardShare() {
    let num = 0, total = 0;
    for (const spec of Engine.DECK_SPEC) {
      total += spec.count;
      if (spec.kind === 'num') num += spec.count;
    }
    return total ? num / total : 0.75;
  }
  const P_MOVE = moveCardShare();

  // Copia ligera del estado para simular sin tocar la partida real
  function clone(s) {
    return {
      board: s.board.map(function (row) {
        return row.map(function (p) { return p ? { id: p.id, type: p.type, color: p.color, moved: p.moved } : null; });
      }),
      captured: { w: s.captured.w.slice(), b: s.captured.b.slice() },
      playerColor: { 1: s.playerColor[1], 2: s.playerColor[2] },
      current: s.current,
      deck: [], discard: [],
      phase: s.phase,
      card: null, lastCard: null,
      movesLeft: s.movesLeft,
      movesThisTurn: s.movesThisTurn,
      pending: s.pending,
      ep: s.ep ? { player: s.ep.player, pawnId: s.ep.pawnId, pawnPos: s.ep.pawnPos.slice(), target: s.ep.target.slice() } : null,
      lastMove: null, lastConverted: [],
      result: null,
      log: { push: function () {} },
    };
  }

  // Casillas que ataca cada bando (incluidas las ocupadas por piezas propias = defensa)
  // Devuelve, por casilla, el valor de la pieza atacante más barata (o undefined).
  function attackMap(board, color) {
    const map = new Array(64);
    const mark = function (r, c, v) {
      if (r < 0 || r > 7 || c < 0 || c > 7) return false;
      const i = r * 8 + c;
      if (map[i] === undefined || v < map[i]) map[i] = v;
      return true;
    };
    const ray = function (r, c, dr, dc, v, max) {
      let tr = r + dr, tc = c + dc, n = 0;
      while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && n < max) {
        mark(tr, tc, v);
        if (board[tr][tc]) break;
        tr += dr; tc += dc; n++;
      }
    };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || p.color !== color) continue;
        const v = p.type === 'k' ? 50 : VALUES[p.type];
        switch (p.type) {
          case 'p': {
            const d = color === 'w' ? -1 : 1;
            mark(r + d, c - 1, v); mark(r + d, c + 1, v);
            break;
          }
          case 'n':
            [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(function (o) { mark(r + o[0], c + o[1], v); });
            break;
          case 'k':
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) mark(r + dr, c + dc, v);
            break;
          default: {
            const dirs = [];
            if (p.type !== 'b') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
            if (p.type !== 'r') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
            for (const d of dirs) ray(r, c, d[0], d[1], v, 8);
          }
        }
      }
    }
    return map;
  }

  // Puntuación de la posición desde el punto de vista del jugador `botPlayer` con color `me`
  function evaluate(s, botPlayer, me) {
    if (s.result) {
      if (s.result.type === 'win') return s.result.player === botPlayer ? WIN : -WIN;
      return 0;
    }
    const opp = me === 'w' ? 'b' : 'w';
    const board = s.board;
    const oppAtt = attackMap(board, opp);
    const myAtt = attackMap(board, me);
    let score = 0;
    let myKing = null, oppKing = null;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        const v = VALUES[p.type];
        const i = r * 8 + c;
        const sign = p.color === me ? 1 : -1;
        score += sign * v;
        if (p.type === 'k') {
          if (p.color === me) myKing = [r, c]; else oppKing = [r, c];
          continue;
        }
        // Avance de peones y piezas menores en el centro
        if (p.type === 'p') {
          const adv = p.color === 'w' ? 6 - r : r - 1;
          score += sign * 0.06 * adv;
        } else if ((p.type === 'n' || p.type === 'b') && r >= 2 && r <= 5 && c >= 2 && c <= 5) {
          score += sign * 0.15;
        }
        // Piezas propias amenazadas
        if (p.color === me && oppAtt[i] !== undefined) {
          if (myAtt[i] === undefined) score -= 0.8 * v;               // sin defensa
          else if (oppAtt[i] < v) score -= 0.6 * (v - oppAtt[i]);     // atacada por algo más barato
        }
        // Piezas rivales que podemos atacar (el rival mueve antes, así que vale poco)
        if (p.color === opp && myAtt[i] !== undefined && oppAtt[i] === undefined) score += 0.1 * v;
      }
    }

    // Seguridad del rey: si el rival puede capturarlo en su próximo turno, es casi perder
    if (myKing) {
      const ki = myKing[0] * 8 + myKing[1];
      if (oppAtt[ki] !== undefined) score -= P_MOVE * 1000;
      // Casillas alrededor del rey controladas por el rival (peligro con 2 o 3 movimientos)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = myKing[0] + dr, c = myKing[1] + dc;
          if ((dr || dc) && r >= 0 && r < 8 && c >= 0 && c < 8 && oppAtt[r * 8 + c] !== undefined) score -= 0.35;
        }
      }
    }
    if (oppKing && myAtt[oppKing[0] * 8 + oppKing[1]] !== undefined) score += 1.5;
    return score;
  }

  function noise(level) { return level === 'facil' ? (Math.random() - 0.5) * 6 : 0; }

  // Nivel normal: mira la mejor respuesta del rival con 1 movimiento (lo más probable con el mazo actual)
  const TOP = 14;
  function withReply(s, botPlayer, me, staticScore) {
    if (s.result || s.phase !== 'draw') return staticScore;
    const opp = me === 'w' ? 'b' : 'w';
    const sim = clone(s);
    sim.phase = 'moves';
    sim.movesLeft = 1;
    sim.movesThisTurn = 0;
    let worst = Infinity;
    for (const m of Engine.allMoves(sim, opp)) {
      const c = clone(sim);
      if (!Engine.makeMove(c, m, 'q')) continue;
      const sc = evaluate(c, botPlayer, me);
      if (sc < worst) worst = sc;
    }
    if (worst === Infinity) return staticScore;
    return P_MOVE * worst + (1 - P_MOVE) * staticScore;
  }

  // Mejor combinación de movimientos para la carta actual
  function bestSequence(state, level) {
    const botPlayer = state.current;
    const me = Engine.myColor(state);
    let frontier = [{ s: state, seq: [] }];
    const finals = [];
    const steps = state.movesLeft;

    for (let depth = 0; depth < steps && frontier.length; depth++) {
      let next = [];
      for (const node of frontier) {
        const moves = Engine.allMoves(node.s, me);
        if (!moves.length) { finals.push(node); continue; }
        for (const m of moves) {
          const c = clone(node.s);
          if (!Engine.makeMove(c, m, 'q')) continue;
          const entry = { s: c, seq: node.seq.concat([m]) };
          if (c.phase !== 'moves') finals.push(entry); // turno terminado (captura, fin de carta o fin de partida)
          else next.push(entry);
        }
      }
      if (next.length > BEAM) {
        for (const e of next) e.score = evaluate(e.s, botPlayer, me);
        next.sort(function (a, b) { return b.score - a.score; });
        next = next.slice(0, BEAM);
      }
      frontier = next;
    }
    for (const node of frontier) finals.push(node);

    for (const e of finals) e.score = evaluate(e.s, botPlayer, me) + (e.s.result ? 0 : noise(level));
    finals.sort(function (a, b) { return b.score - a.score; });
    if (level === 'normal') {
      const top = finals.slice(0, TOP);
      for (const e of top) e.score = withReply(e.s, botPlayer, me, e.score);
      top.sort(function (a, b) { return b.score - a.score; });
      return top.length ? top[0].seq : [];
    }
    return finals.length ? finals[0].seq : [];
  }

  function bestConvert(state, level) {
    const botPlayer = state.current;
    const me = Engine.myColor(state);
    let best = null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (!Engine.canConvert(state, r, c)) continue;
        const s = clone(state);
        Engine.convertPiece(s, r, c);
        const sc = evaluate(s, botPlayer, me) + noise(level);
        if (!best || sc > best.score) best = { r: r, c: c, score: sc };
      }
    }
    return best;
  }

  function bestRevive(state, level) {
    const botPlayer = state.current;
    const me = Engine.myColor(state);
    const list = state.captured[me];
    const tried = {};
    let best = null;
    list.forEach(function (type, idx) {
      if (tried[type]) return;
      tried[type] = true;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (!Engine.canRevivePlace(state, type, r, c)) continue;
          const s = clone(state);
          Engine.revivePiece(s, idx, r, c);
          const sc = evaluate(s, botPlayer, me) + noise(level);
          if (!best || sc > best.score) best = { idx: idx, r: r, c: c, score: sc };
        }
      }
    });
    return best;
  }

  // Siguiente acción del bot (una cada vez, para que se vea jugar)
  function nextAction(state, level) {
    switch (state.phase) {
      case 'draw':
        return { type: 'draw' };
      case 'moves': {
        const seq = bestSequence(state, level);
        if (!seq.length) return null;
        return { type: 'move', from: seq[0].from, to: seq[0].to, promo: 'q' };
      }
      case 'convert': {
        const b = bestConvert(state, level);
        return b ? { type: 'convert', r: b.r, c: b.c } : null;
      }
      case 'revive': {
        const b = bestRevive(state, level);
        return b ? { type: 'revive', idx: b.idx, r: b.r, c: b.c } : null;
      }
    }
    return null;
  }

  const Bot = { nextAction: nextAction, evaluate: evaluate, bestSequence: bestSequence };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bot;
  else root.Bot = Bot;
})(this);
