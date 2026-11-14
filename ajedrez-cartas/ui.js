/*
 * Ajedrez con cartas — interfaz
 * Dibuja el tablero y el panel, y traduce los clics en llamadas al motor (engine.js).
 */
(function () {
  'use strict';

  // Glifos rellenos para los dos colores; el color se da con CSS.
  // ︎ pide la versión de texto (evita que el peón salga como emoji).
  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' };
  const CARD_SYMBOLS = { bloqueo: '⊘', color: '◐', mas2: '+2', mas4: '+4', sentido: '⟲' };

  let state = Engine.newGame();
  let selected = null;      // [r, c] de la pieza seleccionada
  let selMoves = [];        // movimientos posibles de esa pieza
  let reviveChoice = null;  // índice de la pieza capturada elegida para revivir
  let manualFlip = false;   // el botón "Girar vista"

  const $ = function (id) { return document.getElementById(id); };
  const boardEl = $('board');

  // ---------- Utilidades ----------
  function isFlipped() {
    // Por defecto, abajo está el color del Jugador 1. Con "Cambio de sentido" el tablero gira.
    return (state.playerColor[1] === 'b') !== manualFlip;
  }

  function clearSelection() {
    selected = null;
    selMoves = [];
  }

  function cardElement(card, faded) {
    const el = document.createElement('div');
    el.className = 'card ' + card.kind + (faded ? ' faded' : '');
    const sym = document.createElement('div');
    sym.className = 'sym';
    sym.textContent = card.kind === 'num' ? String(card.n) : CARD_SYMBOLS[card.kind];
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = Engine.cardName(card);
    el.appendChild(sym);
    el.appendChild(name);
    return el;
  }

  // ---------- Dibujo ----------
  function renderBoard() {
    boardEl.innerHTML = '';
    const flipped = isFlipped();
    const targets = {};
    for (const m of selMoves) targets[m.to[0] + ',' + m.to[1]] = m;
    const reviveType = state.phase === 'revive' && reviveChoice !== null
      ? state.captured[Engine.myColor(state)][reviveChoice] : null;

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const r = flipped ? 7 - i : i;
        const c = flipped ? 7 - j : j;
        const sq = document.createElement('div');
        sq.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.r = r;
        sq.dataset.c = c;

        const lm = state.lastMove;
        if (lm && ((lm.from[0] === r && lm.from[1] === c) || (lm.to[0] === r && lm.to[1] === c))) {
          sq.classList.add('last');
        }
        if (selected && selected[0] === r && selected[1] === c) sq.classList.add('selected');

        const t = targets[r + ',' + c];
        if (t) sq.classList.add(t.capture ? 'capture' : 'target');
        if (Engine.canConvert(state, r, c)) sq.classList.add('convertible');
        if (reviveType && Engine.canRevivePlace(state, reviveType, r, c)) sq.classList.add('placeable');

        // Coordenadas en el borde
        if (j === 0) {
          const s = document.createElement('span');
          s.className = 'coord rank';
          s.textContent = 8 - r;
          sq.appendChild(s);
        }
        if (i === 7) {
          const s = document.createElement('span');
          s.className = 'coord file';
          s.textContent = 'abcdefgh'[c];
          sq.appendChild(s);
        }

        const p = state.board[r][c];
        if (p) {
          const pe = document.createElement('span');
          pe.className = 'piece ' + p.color;
          pe.textContent = GLYPHS[p.type];
          sq.appendChild(pe);
        }
        boardEl.appendChild(sq);
      }
    }
  }

  function renderPanel() {
    const color = Engine.myColor(state);

    // Turno
    const turn = $('turn');
    turn.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = 'dot ' + color;
    turn.appendChild(dot);
    turn.appendChild(document.createTextNode(
      state.phase === 'over' ? 'Partida terminada' : 'Turno: ' + Engine.playerLabel(state, state.current)));

    // Mazo y carta
    $('deckCount').textContent = state.deck.length;
    $('drawBtn').disabled = state.phase !== 'draw';
    const slot = $('cardView');
    slot.innerHTML = '';
    if (state.card) {
      slot.appendChild(cardElement(state.card, false));
      const cap = document.createElement('div');
      cap.className = 'card-caption';
      cap.textContent = Engine.cardDescription(state.card);
      slot.appendChild(cap);
    } else if (state.lastCard) {
      slot.appendChild(cardElement(state.lastCard.card, true));
      const cap = document.createElement('div');
      cap.className = 'card-caption';
      cap.textContent = 'Última carta: Jugador ' + state.lastCard.player;
      slot.appendChild(cap);
    }

    // Instrucciones
    let text = '';
    switch (state.phase) {
      case 'draw':
        text = 'Jugador ' + state.current + ', roba una carta.';
        break;
      case 'moves':
        text = 'Te ' + (state.movesLeft === 1 ? 'queda 1 movimiento' : 'quedan ' + state.movesLeft + ' movimientos') +
          '. Pulsa una pieza ' + (color === 'w' ? 'blanca' : 'negra') + ' y luego la casilla de destino.';
        break;
      case 'convert':
        text = 'Pulsa ' + (state.pending === 1 ? '1 pieza rival' : state.pending + ' piezas rivales') +
          ' para pasarla' + (state.pending === 1 ? '' : 's') + ' a tu bando (no el rey).';
        break;
      case 'revive':
        text = 'Elige abajo una de tus piezas capturadas y luego una casilla vacía. ' +
          (state.pending === 1 ? 'Queda 1.' : 'Quedan ' + state.pending + '.');
        break;
      case 'over':
        text = state.result.type === 'win'
          ? '¡Gana Jugador ' + state.result.player + '! (' + state.result.reason + ')'
          : 'Tablas. ' + state.result.reason + '.';
        break;
    }
    $('instructions').textContent = text;

    // Capturadas
    for (const col of ['w', 'b']) {
      const list = $('captured-' + col);
      list.innerHTML = '';
      const canPick = state.phase === 'revive' && col === color;
      state.captured[col].forEach(function (type, idx) {
        const el = document.createElement(canPick ? 'button' : 'span');
        el.className = 'cap-piece ' + col + (canPick && reviveChoice === idx ? ' chosen' : '');
        el.textContent = GLYPHS[type];
        el.title = Engine.PIECE_NAMES[type];
        if (canPick) {
          el.addEventListener('click', function () {
            reviveChoice = idx;
            render();
          });
        }
        list.appendChild(el);
      });
    }

    // Registro (lo más reciente arriba)
    const log = $('log');
    log.innerHTML = '';
    state.log.slice(-60).reverse().forEach(function (line) {
      const li = document.createElement('li');
      li.textContent = line;
      log.appendChild(li);
    });
  }

  function render() {
    renderBoard();
    renderPanel();
  }

  // ---------- Coronación ----------
  function askPromotion(color, done) {
    const modal = $('promoModal');
    const box = $('promoChoices');
    box.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach(function (t) {
      const b = document.createElement('button');
      b.innerHTML = '<span class="piece ' + color + '">' + GLYPHS[t] + '</span>';
      b.title = Engine.PIECE_NAMES[t];
      b.addEventListener('click', function () {
        modal.classList.add('hidden');
        done(t);
      });
      box.appendChild(b);
    });
    modal.classList.remove('hidden');
  }

  // ---------- Acciones ----------
  function afterAction() {
    clearSelection();
    if (state.phase !== 'revive') reviveChoice = null;
    else if (reviveChoice === null || reviveChoice >= state.captured[Engine.myColor(state)].length) reviveChoice = 0;
    render();
    if (state.phase === 'over') {
      $('overText').textContent = $('instructions').textContent;
      $('overModal').classList.remove('hidden');
    }
  }

  function doMove(move, promoType) {
    Engine.makeMove(state, move, promoType);
    afterAction();
  }

  boardEl.addEventListener('click', function (e) {
    const sq = e.target.closest('.sq');
    if (!sq) return;
    const r = Number(sq.dataset.r);
    const c = Number(sq.dataset.c);

    if (state.phase === 'moves') {
      const move = selMoves.find(function (m) { return m.to[0] === r && m.to[1] === c; });
      if (move) {
        if (Engine.needsPromotion(state, move)) {
          const color = state.board[move.from[0]][move.from[1]].color;
          askPromotion(color, function (t) { doMove(move, t); });
        } else {
          doMove(move);
        }
        return;
      }
      const p = state.board[r][c];
      if (p && p.color === Engine.myColor(state) && !(selected && selected[0] === r && selected[1] === c)) {
        selected = [r, c];
        selMoves = Engine.legalMovesFrom(state, r, c);
      } else {
        clearSelection();
      }
      render();
    } else if (state.phase === 'convert') {
      if (Engine.convertPiece(state, r, c)) afterAction();
    } else if (state.phase === 'revive') {
      if (reviveChoice !== null && Engine.revivePiece(state, reviveChoice, r, c)) {
        reviveChoice = null;
        afterAction();
      }
    }
  });

  $('drawBtn').addEventListener('click', function () {
    Engine.drawCard(state);
    afterAction();
  });

  function newGame() {
    if (state.phase !== 'over' && state.log.length > 0 &&
        !window.confirm('¿Empezar una partida nueva? Se perderá la actual.')) return;
    state = Engine.newGame();
    reviveChoice = null;
    manualFlip = false;
    $('overModal').classList.add('hidden');
    afterAction();
  }

  $('newGameBtn').addEventListener('click', newGame);
  $('overNewGame').addEventListener('click', newGame);
  $('overClose').addEventListener('click', function () { $('overModal').classList.add('hidden'); });
  $('flipBtn').addEventListener('click', function () { manualFlip = !manualFlip; render(); });

  // Acceso desde la consola del navegador para pruebas (p. ej. ajedrez.state)
  window.ajedrez = {
    get state() { return state; },
    render: render,
  };

  render();
})();
