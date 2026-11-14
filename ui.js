/*
 * Ajedrez con cartas — interfaz
 * Dibuja el tablero y el panel, y convierte los clics en "acciones".
 *
 * Modos:
 *  - local: los dos jugadores en el mismo ordenador.
 *  - host:  creas la sala online. Tu navegador guarda la partida y aplica las reglas (Jugador 1).
 *  - guest: te unes con un código. Envías tus acciones al anfitrión y recibes la partida (Jugador 2).
 */
(function () {
  'use strict';

  // Glifos rellenos para los dos colores; el color se da con CSS.
  // ︎ pide la versión de texto (evita que el peón salga como emoji).
  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' };
  const CARD_SYMBOLS = { bloqueo: '⊘', color: '◐', mas2: '+2', mas4: '+4', sentido: '⟲' };
  const SAVE_KEY = 'ajedrezCartas.partidaOnline';

  let state = Engine.newGame();
  let mode = null;          // 'local' | 'host' | 'guest'
  let myPlayer = null;      // 1 o 2 en modo online
  let selected = null;      // [r, c] de la pieza seleccionada
  let selMoves = [];        // movimientos posibles de esa pieza
  let reviveChoice = null;  // índice de la pieza capturada elegida para revivir
  let manualFlip = false;   // el botón "Girar vista"
  let shownOver = false;    // para enseñar el aviso de fin de partida una sola vez

  const $ = function (id) { return document.getElementById(id); };
  const boardEl = $('board');

  // ---------- Utilidades ----------
  function online() { return mode === 'host' || mode === 'guest'; }

  function canAct() {
    if (!mode || state.phase === 'over') return false;
    if (mode === 'local') return true;
    return Net.isConnected() && state.current === myPlayer;
  }

  function isFlipped() {
    // Abajo va tu color (online) o el del Jugador 1 (local). Con "Cambio de sentido" el tablero gira.
    const bottomPlayer = online() ? myPlayer : 1;
    return (state.playerColor[bottomPlayer] === 'b') !== manualFlip;
  }

  function clearSelection() {
    selected = null;
    selMoves = [];
  }

  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ code: Net.code, state: state })); } catch (e) { /* sin guardado */ }
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
    boardEl.classList.toggle('waiting', online() && !canAct());
    const flipped = isFlipped();
    const active = canAct();
    const targets = {};
    for (const m of selMoves) targets[m.to[0] + ',' + m.to[1]] = m;
    const reviveType = active && state.phase === 'revive' && reviveChoice !== null
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
        if (active && Engine.canConvert(state, r, c)) sq.classList.add('convertible');
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
    const active = canAct();

    // Turno
    const turn = $('turn');
    turn.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = 'dot ' + color;
    turn.appendChild(dot);
    let turnText = state.phase === 'over' ? 'Partida terminada' : 'Turno: ' + Engine.playerLabel(state, state.current);
    if (online() && state.phase !== 'over') turnText += state.current === myPlayer ? ' — tú' : ' — rival';
    turn.appendChild(document.createTextNode(turnText));

    // Mazo y carta
    $('deckCount').textContent = state.deck.length;
    $('drawBtn').disabled = !(active && state.phase === 'draw');
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
    if (!mode) {
      text = 'Elige en el menú cómo quieres jugar.';
    } else if (state.phase === 'over') {
      text = state.result.type === 'win'
        ? '¡Gana Jugador ' + state.result.player + '! (' + state.result.reason + ')'
        : 'Tablas. ' + state.result.reason + '.';
    } else if (online() && !Net.isConnected()) {
      text = mode === 'host'
        ? 'Esperando a que tu rival se conecte. Código de la sala: ' + Net.code
        : 'Sin conexión con la sala. Abre el menú para reconectar.';
    } else if (!active) {
      text = 'Turno de tu rival. Espera a que juegue…';
    } else {
      switch (state.phase) {
        case 'draw':
          text = (online() ? 'Te toca' : 'Jugador ' + state.current) + ': roba una carta.';
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
      }
    }
    $('instructions').textContent = text;

    // Capturadas
    for (const col of ['w', 'b']) {
      const list = $('captured-' + col);
      list.innerHTML = '';
      const canPick = active && state.phase === 'revive' && col === color;
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

    // Estado de la conexión
    const ns = $('netStatus');
    ns.classList.toggle('hidden', !online());
    ns.classList.toggle('ok', Net.isConnected());
    ns.textContent = 'Sala ' + (Net.code || '—') + ' · ' + (Net.isConnected() ? 'conectado' : 'sin rival');
  }

  function render() {
    renderBoard();
    renderPanel();
  }

  // Tras cualquier cambio en la partida
  function afterAction() {
    clearSelection();
    if (state.phase !== 'revive') reviveChoice = null;
    else if (reviveChoice === null || reviveChoice >= state.captured[Engine.myColor(state)].length) reviveChoice = 0;
    render();
    if (state.phase === 'over' && !shownOver) {
      shownOver = true;
      $('overText').textContent = $('instructions').textContent;
      $('overModal').classList.remove('hidden');
    }
    if (state.phase !== 'over') {
      shownOver = false;
      $('overModal').classList.add('hidden');
    }
  }

  // ---------- Acciones ----------
  // Aplica una acción a la partida (en local o en el anfitrión). Devuelve true si era válida.
  function applyAction(action, player) {
    if (action.type === 'newGame') {
      state = Engine.newGame();
      return true;
    }
    if (state.phase === 'over' || state.current !== player) return false;
    switch (action.type) {
      case 'draw': return !!Engine.drawCard(state);
      case 'move': return Engine.makeMove(state, { from: action.from, to: action.to }, action.promo);
      case 'convert': return Engine.convertPiece(state, action.r, action.c);
      case 'revive': return Engine.revivePiece(state, action.idx, action.r, action.c);
    }
    return false;
  }

  // El anfitrión guarda la partida y se la manda al invitado
  function shareState() {
    if (mode !== 'host') return;
    writeSave();
    Net.send({ t: 'state', state: state });
  }

  function dispatch(action) {
    if (mode === 'guest') {
      Net.send({ t: 'action', action: action });
      clearSelection();
      render();
      return;
    }
    const player = mode === 'local' ? state.current : myPlayer;
    if (applyAction(action, player)) {
      shareState();
      afterAction();
    }
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

  // ---------- Tablero ----------
  boardEl.addEventListener('click', function (e) {
    const sq = e.target.closest('.sq');
    if (!sq || !canAct()) return;
    const r = Number(sq.dataset.r);
    const c = Number(sq.dataset.c);

    if (state.phase === 'moves') {
      const move = selMoves.find(function (m) { return m.to[0] === r && m.to[1] === c; });
      if (move) {
        const send = function (promo) {
          dispatch({ type: 'move', from: move.from, to: move.to, promo: promo });
        };
        if (Engine.needsPromotion(state, move)) {
          askPromotion(state.board[move.from[0]][move.from[1]].color, send);
        } else {
          send();
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
      if (Engine.canConvert(state, r, c)) dispatch({ type: 'convert', r: r, c: c });
    } else if (state.phase === 'revive') {
      const type = reviveChoice !== null ? state.captured[Engine.myColor(state)][reviveChoice] : null;
      if (type && Engine.canRevivePlace(state, type, r, c)) {
        dispatch({ type: 'revive', idx: reviveChoice, r: r, c: c });
      }
    }
  });

  $('drawBtn').addEventListener('click', function () {
    if (canAct() && state.phase === 'draw') dispatch({ type: 'draw' });
  });

  function requestNewGame() {
    if (state.phase !== 'over' && state.log.length > 0 &&
        !window.confirm('¿Empezar una partida nueva? Se perderá la actual.')) return;
    if (online() && !Net.isConnected() && mode === 'guest') return;
    dispatch({ type: 'newGame' });
  }

  $('newGameBtn').addEventListener('click', requestNewGame);
  $('overNewGame').addEventListener('click', requestNewGame);
  $('overClose').addEventListener('click', function () { $('overModal').classList.add('hidden'); });
  $('flipBtn').addEventListener('click', function () { manualFlip = !manualFlip; render(); });

  // ---------- Menú y conexión ----------
  function lobbyStatus(html, isError) {
    const el = $('lobbyStatus');
    el.innerHTML = html;
    el.classList.toggle('error', !!isError);
  }
  function showLobby() {
    $('lobbyClose').classList.toggle('hidden', !mode);
    $('lobby').classList.remove('hidden');
  }
  function hideLobby() { $('lobby').classList.add('hidden'); }

  Net.handlers = {
    onStatus: function (text) { lobbyStatus(text); render(); },
    onHostReady: function (code) {
      lobbyStatus('Comparte este código con tu rival:<span class="code">' + code + '</span>' +
        'La partida empieza cuando se conecte. No cierres esta pestaña.');
      $('lobbyClose').classList.remove('hidden');
      render();
    },
    onConnected: function () {
      if (mode === 'host') {
        Net.send({ t: 'state', state: state });
      }
      hideLobby();
      render();
    },
    onDisconnected: function () {
      if (mode === 'guest') {
        $('joinCode').value = Net.code || '';
        lobbyStatus('Se ha perdido la conexión. Pulsa "Unirse" para reconectar.', true);
        showLobby();
      }
      render();
    },
    onError: function (text) {
      lobbyStatus(text, true);
      showLobby();
      render();
    },
    onData: function (msg) {
      if (!msg || typeof msg !== 'object') return;
      if (mode === 'host' && msg.t === 'action') {
        if (applyAction(msg.action, 2)) {
          shareState();
          afterAction();
        } else {
          Net.send({ t: 'state', state: state }); // resincroniza al invitado
        }
      } else if (mode === 'guest' && msg.t === 'state') {
        state = Engine.restore(msg.state);
        afterAction();
      }
    },
  };

  $('hostBtn').addEventListener('click', function () {
    const saved = loadSave();
    let code = null;
    state = Engine.newGame();
    if (saved && saved.state && saved.state.phase !== 'over' &&
        window.confirm('Tienes una partida online sin terminar (sala ' + saved.code + '). ¿Quieres continuarla?')) {
      state = Engine.restore(saved.state);
      code = saved.code;
    }
    mode = 'host';
    myPlayer = 1;
    manualFlip = false;
    Net.host(code);
    writeSave();
    afterAction();
  });

  function join() {
    const code = $('joinCode').value.trim().toUpperCase();
    if (code.length !== 6) {
      lobbyStatus('El código tiene 6 caracteres.', true);
      return;
    }
    mode = 'guest';
    myPlayer = 2;
    manualFlip = false;
    Net.join(code);
    render();
  }
  $('joinBtn').addEventListener('click', join);
  $('joinCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });

  $('localBtn').addEventListener('click', function () {
    Net.close();
    mode = 'local';
    myPlayer = null;
    manualFlip = false;
    state = Engine.newGame();
    lobbyStatus('');
    hideLobby();
    afterAction();
  });

  $('menuBtn').addEventListener('click', function () {
    if (!Net.isConnected() && !online()) lobbyStatus('');
    showLobby();
  });
  $('lobbyClose').addEventListener('click', hideLobby);

  // Acceso desde la consola del navegador para pruebas (p. ej. ajedrez.state)
  window.ajedrez = {
    get state() { return state; },
    render: render,
  };

  render();
})();
