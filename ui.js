/*
 * In 2 Chess — interfaz
 * Dibuja el tablero y el panel, y convierte los clics en "acciones".
 *
 * Modos:
 *  - local: los dos jugadores en el mismo ordenador.
 *  - host:  creas la sala online. Tu navegador guarda la partida y aplica las reglas (Jugador 1).
 *  - guest: te unes con un código. Envías tus acciones al anfitrión y recibes la partida (Jugador 2).
 *  - bot:   juegas contra el ordenador (tú eres el Jugador 1, el bot el Jugador 2).
 */
(function () {
  'use strict';

  // Glifos rellenos para los dos colores; el color se da con CSS.
  // ︎ pide la versión de texto (evita que el peón salga como emoji).
  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' };
  // Ilustraciones de las cartas especiales (carpeta cards/). Para cambiarlas, sustituye los archivos.
  const CARD_ART = {
    bloqueo: 'cards/bloqueo.svg',
    color: 'cards/color.svg',
    mas2: 'cards/mas2.svg',
    mas4: 'cards/mas4.svg',
    sentido: 'cards/sentido.svg',
  };
  // Explicación más detallada de cada carta para el manual
  const MANUAL_TEXT = {
    num: function (n, rules) {
      return 'Haces ' + (n === 1 ? '1 movimiento' : n + ' movimientos seguidos') + '. ' +
        (Engine.RULESETS[rules] && Engine.RULESETS[rules].captureEndsTurn
          ? 'Si capturas una pieza, tu turno termina aunque te queden movimientos.'
          : 'Puedes capturar varias piezas, pero si dejas al rey rival amenazado, tu turno termina.');
    },
    bloqueo: 'Pierdes el turno: no mueves nada.',
    color: 'Eliges una pieza rival (cualquiera menos el rey) y pasa a ser tuya en la misma casilla.',
    mas2: 'Revives hasta 2 de tus piezas capturadas y las colocas en casillas vacías de tu mitad del tablero (tus cuatro primeras filas). Los peones no pueden ir en la primera fila.',
    mas4: 'Ruleta: se eligen al azar 4 piezas rivales (nunca el rey) y pasan a tu bando. Puede tocar un peón… o la dama.',
    sentido: 'Se gira el tablero: los jugadores intercambian colores. Quien llevaba blancas pasa a llevar negras, con sus piezas y capturas.',
  };
  let lastDrawCount = null; // para animar solo las cartas recién robadas
  let freshSync = false;    // el invitado acaba de conectarse y aún no ha recibido la partida
  const REVEAL_MS = 2200;   // cuánto se ve la carta en grande
  let revealTimer = null;
  let revealUntil = 0;      // el bot espera a que termine la animación
  const SAVE_KEY = 'ajedrezCartas.partidaOnline';

  const BOT_PLAYER = 2;
  const BOT_DELAY = 650;    // pausa entre acciones del bot, para que se vea lo que hace

  let state = Engine.newGame();
  let mode = null;          // 'local' | 'host' | 'guest' | 'bot'
  let botLevel = 'normal';
  let botTimer = null;
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
    if (mode === 'bot') return state.current === myPlayer;
    return Net.isConnected() && state.current === myPlayer;
  }

  function isFlipped() {
    // Abajo va tu color (online) o el del Jugador 1 (local). Con "Cambio de sentido" el tablero gira.
    const bottomPlayer = online() || mode === 'bot' ? myPlayer : 1;
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
    if (card.kind === 'num') {
      const sym = document.createElement('div');
      sym.className = 'sym';
      sym.textContent = String(card.n);
      el.appendChild(sym);
    } else {
      const img = document.createElement('img');
      img.className = 'art';
      img.src = CARD_ART[card.kind];
      img.alt = '';
      el.appendChild(img);
    }
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = Engine.cardName(card);
    el.appendChild(name);
    return el;
  }

  // Casillas de los reyes que el rival podría capturar con su próximo movimiento
  function threatenedKings() {
    const kings = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (p && p.type === 'k') kings.push({ r: r, c: c, color: p.color });
      }
    }
    const out = {};
    for (const k of kings) {
      const enemy = k.color === 'w' ? 'b' : 'w';
      const hit = Engine.allMoves(state, enemy).some(function (m) { return m.to[0] === k.r && m.to[1] === k.c; });
      if (hit) out[k.r + ',' + k.c] = true;
    }
    return out;
  }

  // ---------- Dibujo ----------
  function renderBoard() {
    boardEl.innerHTML = '';
    boardEl.classList.toggle('waiting', online() && !canAct());
    const flipped = isFlipped();
    const active = canAct();
    const threats = threatenedKings();
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
        if (threats[r + ',' + c]) sq.classList.add('king-threat');
        if ((state.lastConverted || []).some(function (x) { return x[0] === r && x[1] === c; })) {
          sq.classList.add('converted');
        }

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
    if (mode === 'bot' && state.phase !== 'over') turnText += state.current === myPlayer ? ' — tú' : ' — bot';
    turn.appendChild(document.createTextNode(turnText));

    // Mazo y carta
    $('deckCount').textContent = state.deck.length;
    $('drawBtn').disabled = !(active && state.phase === 'draw');
    const slot = $('cardView');
    slot.innerHTML = '';
    // La carta recién robada entra con una pequeña animación
    const drawCount = state.drawCount || 0;
    const isNew = lastDrawCount !== null && drawCount > lastDrawCount;
    lastDrawCount = drawCount;
    if (isNew && state.lastCard) showReveal(state.lastCard.card, state.lastCard.player);
    if (state.card) {
      const ce = cardElement(state.card, false);
      if (isNew) ce.classList.add('fresh');
      slot.appendChild(ce);
      const cap = document.createElement('div');
      cap.className = 'card-caption';
      cap.textContent = Engine.cardDescription(state.card, state);
      slot.appendChild(cap);
    } else if (state.lastCard) {
      const ce = cardElement(state.lastCard.card, true);
      if (isNew) ce.classList.add('fresh');
      slot.appendChild(ce);
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
      if (state.result.type !== 'win') {
        text = 'Tablas. ' + state.result.reason + '.';
      } else if (mode === 'local') {
        text = '¡Gana ' + Engine.playerName(state, state.result.player) + '! (' + state.result.reason + ')';
      } else if (state.result.player === myPlayer) {
        text = '¡Has ganado! (' + state.result.reason + ')';
      } else {
        text = (mode === 'bot' ? 'Gana el bot' : 'Gana tu rival') + ' (' + state.result.reason + ')';
      }
    } else if (online() && !Net.isConnected()) {
      if (mode === 'host') {
        text = Net.ready
          ? 'Esperando a que tu rival se conecte. Código de la sala: ' + Net.code
          : 'Creando la sala… Si tarda mucho, abre el menú para ver qué ocurre.';
      } else {
        text = 'Sin conexión con la sala. Abre el menú para reconectar.';
      }
    } else if (!active && mode === 'bot') {
      text = 'El bot está pensando…';
    } else if (!active) {
      text = 'Turno de tu rival. Espera a que juegue…';
    } else {
      switch (state.phase) {
        case 'draw':
          text = (mode === 'local' ? 'Jugador ' + state.current : 'Te toca') + ': roba una carta.';
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
    ns.textContent = Net.ready || Net.isConnected()
      ? 'Sala ' + Net.code + ' · ' + (Net.isConnected() ? 'conectado' : 'sin rival')
      : 'Sin conexión';
  }

  function render() {
    renderBoard();
    renderPanel();
    renderScore();
    const tag = $('variantTag');
    tag.textContent = 'Fin del turno: ' + Engine.RULESETS[state.rules || Engine.DEFAULT_RULESET].name.replace('Termina ', '').toLowerCase();
    tag.classList.toggle('hidden', !mode);
  }

  // Tras cualquier cambio en la partida
  function afterAction() {
    clearSelection();
    if (state.phase !== 'revive') reviveChoice = null;
    else if (reviveChoice === null || reviveChoice >= state.captured[Engine.myColor(state)].length) reviveChoice = 0;
    if (state.phase === 'over') recordResult(); // antes de dibujar, para que el marcador salga ya actualizado
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
    scheduleBot();
    scheduleAutoDraw();
  }

  // ---------- Robar automáticamente (preferencia de cada jugador) ----------
  const AUTO_DRAW_KEY = 'ajedrezCartas.roboAutomatico';
  const AUTO_DRAW_DELAY = 700;
  let autoDrawTimer = null;

  function autoDrawOn() { return $('autoDraw').checked; }

  function scheduleAutoDraw() {
    if (!autoDrawOn() || autoDrawTimer || !canAct() || state.phase !== 'draw') return;
    // Espera a que termine la animación de la carta anterior (por ejemplo, la del rival)
    const wait = Math.max(AUTO_DRAW_DELAY, revealUntil - Date.now() + 300);
    autoDrawTimer = setTimeout(function () {
      autoDrawTimer = null;
      if (!autoDrawOn() || !canAct() || state.phase !== 'draw') return;
      if (Date.now() < revealUntil) { scheduleAutoDraw(); return; }
      dispatch({ type: 'draw' });
    }, wait);
  }

  try { $('autoDraw').checked = localStorage.getItem(AUTO_DRAW_KEY) === '1'; } catch (e) { /* sin guardado */ }
  $('autoDraw').addEventListener('change', function () {
    try { localStorage.setItem(AUTO_DRAW_KEY, this.checked ? '1' : '0'); } catch (e) { /* sin guardado */ }
    if (this.checked) scheduleAutoDraw();
    else { clearTimeout(autoDrawTimer); autoDrawTimer = null; }
  });

  // ---------- Carta robada en grande ----------
  function whoDrew(player) {
    if (mode === 'local' || !mode) return 'Jugador ' + player + ' roba';
    if (player === myPlayer) return 'Has robado';
    return mode === 'bot' ? 'El bot roba' : 'Tu rival roba';
  }

  function showReveal(card, player) {
    const box = $('cardReveal');
    const front = $('revealFront');
    front.innerHTML = '';
    front.appendChild(cardElement(card, false));
    $('revealWho').textContent = whoDrew(player);
    $('revealDesc').textContent = card.kind === 'num' ? MANUAL_TEXT.num(card.n, state.rules) : MANUAL_TEXT[card.kind];
    // Reinicia las animaciones aunque ya se estuviera mostrando otra carta
    box.classList.add('hidden');
    box.classList.remove('leaving');
    void box.offsetWidth;
    box.classList.remove('hidden');
    clearTimeout(revealTimer);
    revealUntil = Date.now() + REVEAL_MS + 350;
    revealTimer = setTimeout(hideReveal, REVEAL_MS);
  }

  function hideReveal() {
    const box = $('cardReveal');
    if (box.classList.contains('hidden') || box.classList.contains('leaving')) return;
    clearTimeout(revealTimer);
    box.classList.add('leaving');
    revealUntil = Date.now() + 350;
    revealTimer = setTimeout(function () {
      box.classList.add('hidden');
      box.classList.remove('leaving');
      revealUntil = 0;
    }, 350);
  }

  $('cardReveal').addEventListener('click', hideReveal);
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') && !$('cardReveal').classList.contains('hidden')) hideReveal();
  });

  // ---------- Bot ----------
  function scheduleBot() {
    if (mode !== 'bot' || state.phase === 'over' || state.current !== BOT_PLAYER || botTimer) return;
    // Si se está mostrando una carta en grande, el bot espera a que termine
    const wait = Math.max(BOT_DELAY, revealUntil - Date.now() + 250);
    botTimer = setTimeout(function () {
      botTimer = null;
      if (mode !== 'bot' || state.phase === 'over' || state.current !== BOT_PLAYER) return;
      if (Date.now() < revealUntil) { scheduleBot(); return; }
      const action = Bot.nextAction(state, botLevel);
      if (action && applyAction(action, BOT_PLAYER)) afterAction();
    }, wait);
  }

  function stopBot() {
    clearTimeout(botTimer);
    botTimer = null;
  }

  // ---------- Acciones ----------
  // Aplica una acción a la partida (en local o en el anfitrión). Devuelve true si era válida.
  function applyAction(action, player) {
    if (action.type === 'newGame') {
      const names = state.names;
      state = Engine.newGame(null, state.rules); // la nueva partida mantiene la variante
      state.names = names;                       // y los nombres
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
    if (action.type === 'newGame') stopBot();
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
      } else {
        Net.send({ t: 'hello', name: myName() }); // el anfitrión apunta nuestro nombre
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
      if (mode === 'host' && msg.t === 'hello') {
        let guestName = cleanName(msg.name, 'Rival');
        if (guestName === Engine.playerName(state, 1)) guestName += ' 2'; // evita dos jugadores con el mismo nombre
        state.names = Object.assign({}, state.names, { 2: guestName });
        shareState();
        afterAction();
      } else if (mode === 'host' && msg.t === 'action') {
        if (applyAction(msg.action, 2)) {
          shareState();
          afterAction();
        } else {
          Net.send({ t: 'state', state: state }); // resincroniza al invitado
        }
      } else if (mode === 'guest' && msg.t === 'state') {
        // Al (re)conectarse, la partida recibida no debe mostrar como "nueva" la última carta
        if (freshSync) { lastDrawCount = null; freshSync = false; }
        state = Engine.restore(msg.state);
        afterAction();
      }
    },
  };

  // ---------- Nombres y marcador ----------
  const NAME_KEY = 'ajedrezCartas.nombre';
  const SCORE_PREFIX = 'ajedrezCartas.marcador.';
  const COUNTED_KEY = 'ajedrezCartas.partidasContadas';

  function cleanName(name, fallback) {
    const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    return n || fallback;
  }
  function myName() {
    const n = cleanName($('playerName').value, 'Jugador');
    try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* sin guardado */ }
    return n;
  }
  try { $('playerName').value = localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* sin guardado */ }

  // Un marcador por pareja de jugadores (da igual quién lleve blancas)
  function scoreKey() {
    const a = Engine.playerName(state, 1), b = Engine.playerName(state, 2);
    return SCORE_PREFIX + [a, b].sort().join(' vs ');
  }
  function loadScore() {
    try { return JSON.parse(localStorage.getItem(scoreKey())) || { wins: {}, ties: 0 }; }
    catch (e) { return { wins: {}, ties: 0 }; }
  }
  function saveScore(score) {
    try { localStorage.setItem(scoreKey(), JSON.stringify(score)); } catch (e) { /* sin guardado */ }
  }

  // Suma el resultado una sola vez por partida (aunque se recargue o se reconecte)
  function recordResult() {
    if (!mode || !state.result || !state.gameId) return;
    let counted = [];
    try { counted = JSON.parse(localStorage.getItem(COUNTED_KEY)) || []; } catch (e) { /* nada */ }
    if (counted.indexOf(state.gameId) >= 0) return;
    const score = loadScore();
    if (state.result.type === 'win') {
      const winner = Engine.playerName(state, state.result.player);
      score.wins[winner] = (score.wins[winner] || 0) + 1;
    } else {
      score.ties = (score.ties || 0) + 1;
    }
    saveScore(score);
    counted.push(state.gameId);
    try { localStorage.setItem(COUNTED_KEY, JSON.stringify(counted.slice(-200))); } catch (e) { /* nada */ }
  }

  function renderScore() {
    const box = $('scoreBox');
    box.classList.toggle('hidden', !mode);
    if (!mode) return;
    const score = loadScore();
    const names = [Engine.playerName(state, 1), Engine.playerName(state, 2)];
    const best = Math.max(score.wins[names[0]] || 0, score.wins[names[1]] || 0);
    const rows = $('scoreRows');
    rows.innerHTML = '';
    names.forEach(function (n) {
      const w = score.wins[n] || 0;
      const row = document.createElement('div');
      row.className = 'score-row' + (w > 0 && w === best && (score.wins[names[0]] || 0) !== (score.wins[names[1]] || 0) ? ' leader' : '');
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = n;
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = w;
      row.appendChild(who);
      row.appendChild(num);
      rows.appendChild(row);
    });
    const ties = document.createElement('div');
    ties.className = 'score-row ties';
    ties.innerHTML = '<span class="who">Tablas</span><span class="num">' + (score.ties || 0) + '</span>';
    rows.appendChild(ties);
  }

  $('scoreReset').addEventListener('click', function () {
    if (!window.confirm('¿Poner a cero el marcador entre ' + Engine.playerName(state, 1) + ' y ' + Engine.playerName(state, 2) + '?')) return;
    saveScore({ wins: {}, ties: 0 });
    renderScore();
  });

  // ---------- Variante de reglas ----------
  const RULES_KEY = 'ajedrezCartas.variante';
  function chosenRules() {
    const v = $('rulesSelect').value;
    try { localStorage.setItem(RULES_KEY, v); } catch (e) { /* sin guardado */ }
    return v;
  }
  try {
    const savedRules = localStorage.getItem(RULES_KEY);
    if (savedRules && Engine.RULESETS[savedRules]) $('rulesSelect').value = savedRules;
  } catch (e) { /* sin guardado */ }

  // Muestra en el manual solo las reglas de la variante de la partida
  function updateRulesTexts() {
    const r = state.rules || Engine.DEFAULT_RULESET;
    document.querySelectorAll('[data-rules]').forEach(function (el) {
      el.classList.toggle('hidden', el.getAttribute('data-rules') !== r);
    });
    $('variantName').textContent = Engine.RULESETS[r].name;
  }

  $('hostBtn').addEventListener('click', function () {
    stopBot();
    const saved = loadSave();
    let code = null;
    state = Engine.newGame(null, chosenRules());
    if (saved && saved.state && saved.state.phase !== 'over' &&
        window.confirm('Tienes una partida online sin terminar (sala ' + saved.code + '). ¿Quieres continuarla?')) {
      state = Engine.restore(saved.state);
      code = saved.code;
    }
    if (!state.names || state.names[1] === 'Jugador 1') state.names = { 1: myName(), 2: 'Rival' };
    else state.names[1] = myName();
    mode = 'host';
    myPlayer = 1;
    lastDrawCount = null; // una partida guardada no debe mostrar su última carta como recién robada
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
    stopBot();
    mode = 'guest';
    myPlayer = 2;
    freshSync = true;
    manualFlip = false;
    Net.join(code);
    render();
  }
  $('joinBtn').addEventListener('click', join);
  $('joinCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });

  $('botBtn').addEventListener('click', function () {
    Net.close();
    stopBot();
    mode = 'bot';
    myPlayer = 1;
    botLevel = $('botLevel').value;
    manualFlip = false;
    state = Engine.newGame(null, chosenRules());
    state.names = { 1: myName(), 2: 'Bot (' + (botLevel === 'facil' ? 'Fácil' : 'Normal') + ')' };
    lobbyStatus('');
    hideLobby();
    afterAction();
  });

  $('localBtn').addEventListener('click', function () {
    Net.close();
    stopBot();
    mode = 'local';
    myPlayer = null;
    manualFlip = false;
    state = Engine.newGame(null, chosenRules());
    let rival = '';
    try { rival = localStorage.getItem('ajedrezCartas.rivalLocal') || ''; } catch (e) { /* nada */ }
    rival = cleanName(window.prompt('Nombre del otro jugador (Jugador 2):', rival || 'Jugador 2'), 'Jugador 2');
    try { localStorage.setItem('ajedrezCartas.rivalLocal', rival); } catch (e) { /* nada */ }
    state.names = { 1: myName(), 2: rival };
    lobbyStatus('');
    hideLobby();
    afterAction();
  });

  $('menuBtn').addEventListener('click', function () {
    if (!Net.isConnected() && !online()) lobbyStatus('');
    showLobby();
  });
  $('lobbyClose').addEventListener('click', hideLobby);

  // ---------- Manual ----------
  function buildManual() {
    const box = $('manualCards');
    box.innerHTML = '';
    let total = 0;
    for (const spec of Engine.DECK_SPEC) {
      total += spec.count;
      const card = spec.kind === 'num' ? { kind: 'num', n: spec.n } : { kind: spec.kind };
      const item = document.createElement('div');
      item.className = 'manual-card';
      item.appendChild(cardElement(card, false));
      const info = document.createElement('div');
      const h = document.createElement('h4');
      h.textContent = Engine.cardName(card);
      const p = document.createElement('p');
      p.textContent = card.kind === 'num' ? MANUAL_TEXT.num(card.n, state.rules) : MANUAL_TEXT[card.kind];
      const copies = document.createElement('div');
      copies.className = 'copies';
      copies.textContent = spec.count + (spec.count === 1 ? ' carta' : ' cartas') + ' en el mazo';
      info.appendChild(h);
      info.appendChild(p);
      info.appendChild(copies);
      item.appendChild(info);
      box.appendChild(item);
    }
    $('manualDeckTotal').textContent = total;
  }
  function openManual() {
    buildManual();
    updateRulesTexts();
    $('manualModal').classList.remove('hidden');
    $('manualClose').focus();
  }
  function closeManual() { $('manualModal').classList.add('hidden'); }

  buildManual();
  ['infoBtn', 'panelManualBtn', 'lobbyManualBtn'].forEach(function (id) {
    $(id).addEventListener('click', openManual);
  });
  $('manualClose').addEventListener('click', closeManual);
  $('manualModal').addEventListener('click', function (e) { if (e.target === this) closeManual(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('manualModal').classList.contains('hidden')) closeManual();
  });

  // ---------- Buzón de sugerencias ----------
  const SUGGEST_URL = (window.AJEDREZ_CONFIG || {}).suggestionsUrl || '';
  let lastSuggestAt = 0;

  function suggestStatus(text, kind) {
    const el = $('suggestStatus');
    el.textContent = text;
    el.className = 'suggest-status' + (kind ? ' ' + kind : '');
  }
  function openSuggest() {
    $('suggestModal').classList.remove('hidden');
    if (!SUGGEST_URL) suggestStatus('El buzón todavía no está activado.', 'error');
    $('suggestText').focus();
  }
  function closeSuggest() { $('suggestModal').classList.add('hidden'); }

  function sendSuggestion() {
    const text = $('suggestText').value.trim();
    if (!SUGGEST_URL) { suggestStatus('El buzón todavía no está activado.', 'error'); return; }
    if (text.length < 3) { suggestStatus('Escribe tu sugerencia antes de enviarla.', 'error'); return; }
    if (Date.now() - lastSuggestAt < 30000) {
      suggestStatus('Espera unos segundos antes de enviar otra sugerencia.', 'error');
      return;
    }
    const btn = $('suggestSend');
    btn.disabled = true;
    suggestStatus('Enviando…');
    const modeNames = { local: 'Mismo ordenador', host: 'Online', guest: 'Online', bot: 'Contra el bot' };
    // text/plain evita la comprobación previa (CORS) que Google Apps Script no admite
    fetch(SUGGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        text: text,
        category: $('suggestCategory').value,
        mode: modeNames[mode] || '',
        website: $('suggestWebsite').value,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || 'error');
        lastSuggestAt = Date.now();
        $('suggestText').value = '';
        $('suggestCount').textContent = '0 / 1500';
        suggestStatus('¡Gracias! Tu sugerencia se ha enviado.', 'ok');
      })
      .catch(function () {
        suggestStatus('No se ha podido enviar. Revisa tu conexión e inténtalo de nuevo.', 'error');
      })
      .then(function () { btn.disabled = false; });
  }

  $('suggestBtn').addEventListener('click', openSuggest);
  $('suggestClose').addEventListener('click', closeSuggest);
  $('suggestModal').addEventListener('click', function (e) { if (e.target === this) closeSuggest(); });
  $('suggestSend').addEventListener('click', sendSuggestion);
  $('suggestText').addEventListener('input', function () {
    $('suggestCount').textContent = this.value.length + ' / 1500';
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('suggestModal').classList.contains('hidden')) closeSuggest();
  });

  // Acceso desde la consola del navegador para pruebas (p. ej. ajedrez.state)
  window.ajedrez = {
    get state() { return state; },
    render: render,
  };

  render();
})();
