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
  // Las piezas se dibujan como imágenes (SVG) y no como texto: así el modo oscuro
  // de algunos navegadores (Samsung Internet) no cambia sus colores.
  const PIECE_SRC = {};
  function pieceSrc(type, color) {
    if (type === 'x') return 'cards/arsenal/piedra.svg';   // pedrolo (Arsenal)
    const key = type + color;
    if (!PIECE_SRC[key]) {
      const fill = color === 'w' ? '#ffffff' : '#1b1b1b';
      const stroke = color === 'w' ? '#000000' : '#ffffff88';
      const sw = color === 'w' ? 5 : 2;
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<text x="50" y="84" text-anchor="middle" font-size="90" ' +
        'font-family="Segoe UI Symbol, DejaVu Sans, Noto Sans Symbols 2, Noto Sans Symbols, sans-serif" ' +
        'fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '" paint-order="stroke" stroke-linejoin="round">' +
        GLYPHS[type] + '</text></svg>';
      PIECE_SRC[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    return PIECE_SRC[key];
  }
  function pieceImg(type, color) {
    const img = document.createElement('img');
    img.className = 'piece-img';
    img.src = pieceSrc(type, color);
    img.alt = Engine.PIECE_NAMES[type] || '';
    img.draggable = false;
    return img;
  }
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
  const REVEAL_MS = 5000;   // tiempo máximo que se ve la carta en grande (igual para todas)
  function revealTime() { return REVEAL_MS; }
  let revealDraw = null;    // nº de robo de la carta que se está mostrando (Destino), para sincronizar el cierre
  let revealTimer = null;
  let revealUntil = 0;      // el bot espera a que termine la animación
  const SAVE_KEY = 'ajedrezCartas.partidaOnline';

  const BOT_PLAYER = 2;
  const BOT_DELAY = 650;    // pausa entre acciones del bot, para que se vea lo que hace

  let state = Engine.newGame();
  let gameMode = 'destino'; // modo elegido en la pantalla inicial: 'destino' | 'arsenal'
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
  function isArsenal() { return state.game === 'arsenal'; }

  // Partida nueva del modo elegido
  function createGame() {
    return gameMode === 'arsenal' ? ArsenalEngine.newGame() : Engine.newGame(null, chosenRules());
  }
  function restoreGame(obj) {
    return obj && obj.game === 'arsenal' ? ArsenalEngine.restore(obj) : Engine.restore(obj);
  }

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
    el.title = Engine.cardName(card);
    // Las cartas de número solo llevan el número (el texto se salía en algunos móviles)
    if (card.kind !== 'num') {
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = Engine.cardName(card);
      el.appendChild(name);
    }
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
  // ---------- Trampas: animación de la trampa de oso y destape al final ----------
  const TRAP_FX_MS = 2600;
  let lastTrapCount = null;
  let trapFx = null;   // { r, c, type, color, start }

  // Dibujo de la trampa de oso (vista lateral): placa, dos mandíbulas con dientes que se cierran
  const TRAP_SVG = (function () {
    function pt(rad, deg) {
      const a = deg * Math.PI / 180;
      return (50 + rad * Math.cos(a)).toFixed(1) + ' ' + (74 - rad * Math.sin(a)).toFixed(1);
    }
    function jaw(side, teethAngles) {
      // side 'l': de 180° a 90°; side 'r': de 0° a 90°
      const a0 = side === 'l' ? 180 : 0;
      const sweepOut = side === 'l' ? 1 : 0;
      let band = 'M' + pt(36, a0) + ' A36 36 0 0 ' + sweepOut + ' ' + pt(36, 90) + ' L' + pt(28, 90) + ' A28 28 0 0 ' + (1 - sweepOut) + ' ' + pt(28, a0) + ' Z';
      let teeth = '';
      teethAngles.forEach(function (a) {
        teeth += 'M' + pt(28.5, a - 5) + ' L' + pt(19, a) + ' L' + pt(28.5, a + 5) + ' Z ';
      });
      return '<g class="tj tj-' + side + '"><path d="' + band + '" fill="#b9bec6" stroke="#1b1b1b" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="' + teeth + '" fill="#e8ebf0" stroke="#1b1b1b" stroke-width="1.6" stroke-linejoin="round"/></g>';
    }
    const plate = '<rect x="10" y="73" width="80" height="10" rx="3" fill="#4a4f58" stroke="#1b1b1b" stroke-width="2.6"/>' +
      '<circle cx="18" cy="74" r="3.2" fill="#9aa0aa" stroke="#1b1b1b" stroke-width="1.6"/><circle cx="82" cy="74" r="3.2" fill="#9aa0aa" stroke="#1b1b1b" stroke-width="1.6"/>';
    return function (cls) {
      return '<svg class="trap-svg ' + (cls || '') + '" viewBox="0 0 100 100" aria-hidden="true">' + plate +
        jaw('l', [168, 150, 132, 114, 96]) + jaw('r', [21, 39, 57, 75]) + '</svg>';
    };
  })();

  function startTrapFx(info) {
    trapFx = { r: info.r, c: info.c, type: info.type, color: info.color, start: Date.now() };
    setTimeout(function () { boardEl.classList.add('trap-shake'); }, 1000);
    setTimeout(function () { boardEl.classList.remove('trap-shake'); }, 1400);
    setTimeout(function () { trapFx = null; boardEl.querySelectorAll('.trap-fx').forEach(function (n) { n.remove(); }); }, TRAP_FX_MS + 50);
  }

  function trapFxEl() {
    const wrap = document.createElement('div');
    wrap.className = 'trap-fx';
    wrap.style.setProperty('--el', '-' + (Date.now() - trapFx.start) + 'ms');   // si se redibuja, la animación sigue donde iba
    const victim = document.createElement('div');
    victim.className = 'trap-victim';
    victim.appendChild(pieceImg(trapFx.type, trapFx.color));
    wrap.appendChild(victim);
    wrap.insertAdjacentHTML('beforeend', TRAP_SVG('') + '<div class="trap-ring"></div><div class="trap-clac">¡CLAC!</div>');
    return wrap;
  }

  // Al acabar la partida: dónde estaban las trampas (abiertas = sin saltar; cerradas = ya saltaron)
  function trapMarks(r, c) {
    if (!isArsenal() || state.phase !== 'over') return null;
    const out = [];
    (state.traps || []).forEach(function (t) { if (t.r === r && t.c === c) out.push({ t: t, sprung: false }); });
    (state.sprung || []).forEach(function (t) { if (t.r === r && t.c === c) out.push({ t: t, sprung: true }); });
    if (!out.length) return null;
    const m = out[out.length - 1];
    const el = document.createElement('span');
    el.className = 'trap-mark ' + (m.sprung ? 'sprung' : 'armed') + (state.board[r][c] ? ' corner' : '');
    el.title = (m.sprung ? 'Trampa que saltó' : 'Trampa sin saltar') + ' (de ' + Engine.playerName(state, m.t.owner) + ')';
    el.insertAdjacentHTML('beforeend', TRAP_SVG(m.sprung ? 'closed' : 'open'));
    const dot = document.createElement('i');
    dot.className = 'trap-owner ' + (state.playerColor[m.t.owner] === 'w' ? 'w' : 'b');
    el.appendChild(dot);
    return el;
  }

  function renderBoard() {
    const tc = state.trapCount || 0;
    if (lastTrapCount !== null && tc > lastTrapCount && state.lastTrap) startTrapFx(state.lastTrap);
    lastTrapCount = tc;
    boardEl.innerHTML = '';
    boardEl.classList.toggle('waiting', online() && !canAct());
    const flipped = isFlipped();
    const active = canAct();
    const threats = threatenedKings();
    const aCand = isArsenal() ? arsenalCandidates(active) : null;
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
        if (t) sq.classList.add(t.capture ? 'capture' : t.sacrifice ? 'sacrifice' : 'target');
        if (isArsenal()) arsenalDecorate(sq, r, c, aCand);
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

        const tm = trapMarks(r, c);
        if (tm) sq.appendChild(tm);
        const p = state.board[r][c];
        if (p) {
          const pe = document.createElement('span');
          pe.className = 'piece ' + p.color;
          pe.appendChild(pieceImg(p.type, p.color));
          sq.appendChild(pe);
        }
        if (trapFx && trapFx.r === r && trapFx.c === c && Date.now() - trapFx.start < TRAP_FX_MS) sq.appendChild(trapFxEl());
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

    $('destinoArea').classList.toggle('hidden', isArsenal());
    $('arsenalPanel').classList.toggle('hidden', !isArsenal());
    if (isArsenal()) renderArsenalPanel(active);
    renderRobo();
    renderRuletaElegir();

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
    } else if (isArsenal()) {
      text = arsenalInstructions();
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
        el.appendChild(pieceImg(type, col));
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

  // ---------- Nueva interfaz: etiqueta del modo, barras de jugador y fases del turno ----------
  const ICON_SHIELD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f0d68a" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/></svg>';

  function playerSub(p) {
    const col = Engine.COLOR_NAMES[state.playerColor[p]];
    if (mode === 'local' || !mode) return col;
    if (p === myPlayer) return col + ' · tú';
    return col + (mode === 'bot' ? ' · bot' : ' · rival');
  }

  function renderBar(el, p) {
    el.innerHTML = '';
    el.classList.toggle('active', !!mode && state.phase !== 'over' && state.current === p);
    const color = state.playerColor[p];
    const dot = document.createElement('div');
    dot.className = 'pb-dot ' + color;
    const txt = document.createElement('div');
    txt.className = 'pb-text';
    const nm = document.createElement('div');
    nm.className = 'pb-name';
    nm.textContent = Engine.playerName(state, p);
    const sub = document.createElement('div');
    sub.className = 'pb-sub';
    sub.textContent = playerSub(p);
    txt.appendChild(nm);
    txt.appendChild(sub);
    el.appendChild(dot);
    el.appendChild(txt);
    const right = document.createElement('div');
    right.className = 'pb-right';
    // Piezas que este jugador ha capturado
    const caps = state.captured[color === 'w' ? 'b' : 'w'] || [];
    if (caps.length) {
      const c = document.createElement('span');
      c.className = 'pb-caps ' + (color === 'w' ? 'b' : 'w');
      caps.forEach(function (t) { c.appendChild(pieceImg(t, color === 'w' ? 'b' : 'w')); });
      right.appendChild(c);
    }
    if (isArsenal() && p !== handOwner()) {
      const n = state.hands[p].length;
      const backs = document.createElement('span');
      backs.className = 'pb-backs';
      backs.title = n + (n === 1 ? ' carta' : ' cartas');
      for (let i = 0; i < n; i++) {
        const b = document.createElement('span');
        b.className = 'pb-back';
        backs.appendChild(b);
      }
      right.appendChild(backs);
      if (state.escudo[p]) right.insertAdjacentHTML('beforeend', ICON_SHIELD);
      const pts = document.createElement('span');
      pts.textContent = state.points[p] + '/' + ArsenalEngine.ASC_POINTS;
      right.appendChild(pts);
    }
    el.appendChild(right);
  }

  function step(n, title, sub, cls) {
    return '<div class="phase-step ' + cls + '"><span class="num">' + (cls === 'done' ? '✓' : n) + '</span>' +
      '<div style="min-width:0"><div class="t">' + title + '</div><div class="s">' + sub + '</div></div></div>';
  }

  function renderSteps() {
    const box = $('phaseSteps');
    if (!mode || state.phase === 'over') { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    let html = '';
    if (isArsenal()) {
      const P = state.current;
      const choosing = ['robo', 'ruletaElegir', 'ruleta', 'duplicate', 'discard'].indexOf(state.phase) >= 0;
      const cardStep = choosing || ArsenalEngine.canUseCards(state);
      let cardSub;
      if (state.phase === 'robo') cardSub = 'Robo: eligiendo carta';
      else if (state.phase === 'ruletaElegir') cardSub = 'Ruleta: eligiendo rueda';
      else if (state.phase === 'ruleta') cardSub = 'Ruleta: eligiendo piezas';
      else if (state.phase === 'duplicate' || state.phase === 'discard') cardSub = 'Decidiendo carta';
      else if (cardStep) cardSub = 'Opcional';
      else if (state.cardUsed && state.lastPlayed && state.lastPlayed.player === P) cardSub = ArsenalEngine.CARD[state.lastPlayed.card].name;
      else if (state.turnCount[P] <= 1) cardSub = 'No en el primer turno';
      else cardSub = 'Sin carta';
      const moveSub = state.movesLeft > 1 ? 'Doble paso: quedan ' + state.movesLeft
        : state.movesThisTurn > 0 ? 'Segundo movimiento' : 'Mueve una pieza';
      html = step(1, 'Carta', cardSub, cardStep ? 'on' : 'done') + step(2, 'Movimiento', moveSub, cardStep ? '' : 'on');
    } else {
      const drawing = state.phase === 'draw';
      let moveSub = 'Según la carta';
      if (state.phase === 'moves' && state.card && state.card.n) moveSub = (state.card.n - state.movesLeft + 1) + 'º de ' + state.card.n;
      else if (state.phase === 'moves') moveSub = state.movesLeft + (state.movesLeft === 1 ? ' movimiento' : ' movimientos');
      else if (state.phase === 'convert') moveSub = 'Convertir piezas';
      else if (state.phase === 'revive') moveSub = 'Revivir piezas';
      const drawSub = drawing ? 'Roba una carta' : (state.card ? Engine.cardName(state.card) : 'Hecho');
      html = step(1, 'Robar', drawSub, drawing ? 'on' : 'done') + step(2, 'Mover', moveSub, drawing ? '' : 'on');
    }
    box.innerHTML = html;
  }

  function renderLayout() {
    document.body.classList.toggle('arsenal-on', isArsenal());
    const chip = $('modeChip');
    chip.classList.toggle('hidden', !mode);
    chip.classList.toggle('arsenal', isArsenal());
    chip.textContent = isArsenal() ? 'Arsenal' : 'Destino';
    // Abajo, el jugador cuyo color está abajo en el tablero
    const bottomColor = isFlipped() ? 'b' : 'w';
    const bottom = state.playerColor[1] === bottomColor ? 1 : 2;
    const showBars = !!mode;
    $('rivalBar').classList.toggle('hidden', !showBars);
    $('meBar').classList.toggle('hidden', !showBars);
    if (showBars) {
      renderBar($('rivalBar'), bottom === 1 ? 2 : 1);
      renderBar($('meBar'), bottom);
    }
    renderSteps();
  }

  // Pestañas del panel (registro, capturadas, marcador)
  function showTab(name) {
    document.querySelectorAll('.tabs .tab').forEach(function (t) {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-body').forEach(function (b) { b.classList.toggle('hidden', b.dataset.tab !== name); });
  }
  document.querySelectorAll('.tabs .tab').forEach(function (t) {
    t.addEventListener('click', function () { showTab(t.dataset.tab); });
  });
  // Móvil: hoja inferior y barra de navegación
  function openSheet(tab) {
    showTab(tab);
    $('sheetTitle').textContent = 'Partida';
    document.body.classList.add('sheet-open');
    $('sheetBackdrop').classList.remove('hidden');
  }
  function closeSheet() {
    document.body.classList.remove('sheet-open');
    $('sheetBackdrop').classList.add('hidden');
  }
  document.querySelectorAll('.mobile-nav [data-sheet]').forEach(function (b) {
    b.addEventListener('click', function () { openSheet(b.dataset.sheet); });
  });
  $('sheetClose').addEventListener('click', closeSheet);
  $('sheetBackdrop').addEventListener('click', closeSheet);
  $('navRules').addEventListener('click', function () { $('infoBtn').click(); });
  $('navMenu').addEventListener('click', function () { $('menuBtn').click(); });

  function render() {
    renderBoard();
    renderPanel();
    renderScore();
    renderLayout();
    const tag = $('variantTag');
    tag.textContent = isArsenal() ? 'Modo Arsenal'
      : 'Fin del turno: ' + Engine.RULESETS[state.rules || Engine.DEFAULT_RULESET].name.replace('Termina ', '').toLowerCase();
    tag.classList.toggle('hidden', !mode || isArsenal()); // en Arsenal ya lo dice la etiqueta de la cabecera
  }

  // Tras cualquier cambio en la partida
  function afterAction() {
    clearSelection();
    resetArsenalUi();
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
    if (isArsenal() || !autoDrawOn() || autoDrawTimer || !canAct() || state.phase !== 'draw') return;
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
    revealDraw = state.drawCount || 0;
    showRevealEl(cardElement(card, false), whoDrew(player),
      card.kind === 'num' ? MANUAL_TEXT.num(card.n, state.rules) : MANUAL_TEXT[card.kind]);
  }

  // Muestra en grande cualquier elemento (una carta, la ruleta...)
  function showRevealEl(element, who, desc, ms, cls) {
    ms = ms || revealTime(desc);
    const box = $('cardReveal');
    box.classList.toggle('wheel-mode', cls === 'wheel-mode');
    const front = $('revealFront');
    front.innerHTML = '';
    front.appendChild(element);
    $('revealWho').textContent = who;
    $('revealDesc').textContent = desc;
    // Reinicia las animaciones aunque ya se estuviera mostrando otra carta
    box.classList.add('hidden');
    box.classList.remove('leaving');
    void box.offsetWidth;
    box.classList.remove('hidden');
    clearTimeout(revealTimer);
    revealUntil = Date.now() + ms + 350;
    revealTimer = setTimeout(function () { hideReveal(true); }, ms); // al acabar el tiempo no hace falta avisar al rival
  }

  // fromRemote: el cierre lo ha pedido el rival (no hay que devolvérselo)
  function hideReveal(fromRemote) {
    const box = $('cardReveal');
    if (box.classList.contains('hidden') || box.classList.contains('leaving')) return;
    if (fromRemote !== true && online() && !isArsenal() && revealDraw !== null) {
      Net.send({ t: 'revealClose', draw: revealDraw }); // si lo cierras antes de tiempo, se cierra también al rival
    }
    revealDraw = null;
    clearTimeout(revealTimer);
    box.classList.add('leaving');
    revealUntil = Date.now() + 350;
    revealTimer = setTimeout(function () {
      box.classList.add('hidden');
      box.classList.remove('leaving');
      revealUntil = 0;
    }, 350);
  }

  $('cardReveal').addEventListener('click', function () { hideReveal(); });
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
      const action = isArsenal() ? ArsenalEngine.botAction(state, botLevel) : Bot.nextAction(state, botLevel);
      if (action && action.type === 'roboPick') { botRoboHover(action); return; }
      if (action && applyAction(action, BOT_PLAYER)) afterAction();
    }, wait);
  }

  function stopBot() {
    clearTimeout(botTimer);
    botTimer = null;
  }

  // Robo del bot: mueve el "cursor" por tus cartas antes de elegir
  function botRoboHover(action) {
    const n = state.hands[BOT_PLAYER === 1 ? 2 : 1].length;
    const steps = [];
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) steps.push(Math.floor(Math.random() * n));
    steps.push(action.index);
    let k = 0;
    const next = function () {
      if (mode !== 'bot' || state.phase !== 'robo' || state.current !== BOT_PLAYER) { botTimer = null; return; }
      if (k < steps.length) {
        roboHover = steps[k++];
        updateRoboHover();
        botTimer = setTimeout(next, 380 + Math.random() * 420);
        return;
      }
      botTimer = null;
      if (applyAction(action, BOT_PLAYER)) afterAction();
    };
    botTimer = setTimeout(next, 300);
  }

  // ---------- Acciones ----------
  // Aplica una acción a la partida (en local o en el anfitrión). Devuelve true si era válida.
  function applyAction(action, player) {
    if (action.type === 'newGame') {
      const names = state.names;
      state = isArsenal() ? ArsenalEngine.newGame() : Engine.newGame(null, state.rules); // mismo modo y variante
      state.names = names;                       // y los nombres
      announceColors();
      return true;
    }
    if (state.phase === 'over' || state.current !== player) return false;
    if (isArsenal()) return ArsenalEngine.apply(state, action, player);
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
    } else if (isArsenal()) {
      resetArsenalUi();
      aMsg = 'Esa acción no está permitida ahora.';
      render();
    }
  }

  // ---------- Coronación ----------
  function askPromotion(color, done, options, title) {
    const modal = $('promoModal');
    const box = $('promoChoices');
    box.innerHTML = '';
    modal.querySelector('p').textContent = title || '¿En qué pieza corona el peón?';
    (options || ['q', 'r', 'b', 'n']).forEach(function (t) {
      const b = document.createElement('button');
      const ps = document.createElement('span');
      ps.className = 'piece ' + color;
      ps.appendChild(pieceImg(t, color));
      b.appendChild(ps);
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
    if (isArsenal()) { arsenalBoardClick(r, c); return; }

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
    if (window.refreshLobby) window.refreshLobby(mode ? (isArsenal() ? 'arsenal' : 'destino') : gameMode);
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
      if (msg.t === 'hover') {
        roboHover = typeof msg.i === 'number' ? msg.i : null;
        updateRoboHover();
        return;
      }
      if (msg.t === 'revealClose') {
        // Solo se cierra si es la misma carta que se está mostrando aquí
        if (!isArsenal() && revealDraw !== null && msg.draw === revealDraw) hideReveal(true);
        return;
      }
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
        state = restoreGame(msg.state);
        afterAction();
      }
    },
  };

  // Apunta en el registro el resultado del sorteo de colores
  function announceColors() {
    state.log.push('🎲 Sorteo de colores: ' + Engine.playerName(state, 1) + ' lleva ' +
      Engine.COLOR_NAMES[state.playerColor[1]] + ' y ' + Engine.playerName(state, 2) + ' lleva ' +
      Engine.COLOR_NAMES[state.playerColor[2]] + '. Empiezan blancas.');
  }

  // ---------- Modo Arsenal ----------
  const A = window.ArsenalEngine;
  const NEEDS = { escudo: 1, trampa: 1, congelar: 1, enroque: 2, posesion: 1, pedrolo: 1, resurreccion: 1 };
  const ASC_NEXT = { p: ['n', 'b'], n: ['r'], b: ['r'], r: ['q'] };
  let aPick = null;        // carta de la mano seleccionada: { id, index } (index -1 = Escudo)
  let aTarget = null;      // eligiendo objetivo en el tablero: { card, picks }
  let aAscend = false;     // eligiendo la pieza que asciende
  let aRuleta = [];        // piezas elegidas para la Ruleta
  let aMsg = '';           // aviso puntual
  let lastPlayCount = null;
  let lastRuletaCount = null;
  let lastRoboCount = null;
  let roboHover = null;    // carta del rival sobre la que está el cursor del que roba
  let roboKey = '';        // para no reconstruir las cartas en cada render
  let roboTouch = false;   // en pantallas táctiles: primer toque señala, segundo elige

  function resetArsenalUi() {
    aPick = null;
    aTarget = null;
    aAscend = false;
    aMsg = '';
    if (!isArsenal() || state.phase !== 'ruleta') aRuleta = [];
  }

  // Mano que se ve en este dispositivo
  function handOwner() { return mode === 'local' ? state.current : myPlayer; }
  function key(r, c) { return r + ',' + c; }

  function arsenalCardEl(id) {
    const card = A.CARD[id];
    const el = document.createElement('div');
    el.className = 'acard a-' + card.rarity;
    const img = document.createElement('img');
    img.src = 'cards/arsenal/' + id + '.svg';
    img.alt = '';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = card.name;
    el.appendChild(img);
    el.appendChild(name);
    return el;
  }

  // Casillas válidas para lo que se está eligiendo ahora
  function arsenalCandidates(active) {
    const out = {};
    if (!active) return out;
    const b = state.board;
    const mine = Engine.myColor(state);
    const add = function (s) { out[key(s[0], s[1])] = true; };
    if (state.phase === 'ruleta') { A.ruletaEligible(state).forEach(add); return out; }
    if (state.phase !== 'turn') return out;
    if (aAscend) {
      A.ownPieces(state).forEach(function (s) { if (ASC_NEXT[b[s[0]][s[1]].type]) add(s); });
      return out;
    }
    if (!aTarget) return out;
    const picks = aTarget.picks;
    switch (aTarget.card) {
      case 'escudo': A.ownPieces(state).forEach(add); break;
      case 'trampa':
      case 'pedrolo':
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!b[r][c]) add([r, c]);
        break;
      case 'resurreccion':
        if (aTarget.revType) A.freeBackSquares(state).forEach(add);
        break;
      case 'congelar':
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) add([r, c]);
        break;
      case 'enroque':
        A.ownPieces(state).forEach(function (s) {
          if (!picks.length || s[0] !== picks[0][0] || s[1] !== picks[0][1]) add(s);
        });
        break;
      case 'posesion':
        A.possessionPieces(state).forEach(add);
        break;
    }
    return out;
  }

  function arsenalDecorate(sq, r, c, cand) {
    const p = state.board[r][c];
    if (state.frozen && state.frozen.squares.some(function (s) { return s[0] === r && s[1] === c; })) sq.classList.add('a-frozen-zone');
    if (p && state.frozen && state.frozen.ids.indexOf(p.id) >= 0) sq.classList.add('a-frozen');
    if (p && state.locked && state.locked.ids.indexOf(p.id) >= 0) sq.classList.add('a-locked');
    if (p && A.isShielded(state, p)) sq.classList.add('a-shielded');
    const pp = A.possessedPos(state);
    if (pp && pp[0] === r && pp[1] === c) sq.classList.add('a-possessed');
    if (cand && cand[key(r, c)]) sq.classList.add('a-targetable');
    if (aTarget && aTarget.picks.some(function (s) { return s[0] === r && s[1] === c; })) sq.classList.add('a-picked');
    if (aRuleta.some(function (s) { return s[0] === r && s[1] === c; })) sq.classList.add('a-ruleta-pick');
  }

  function arsenalInstructions() {
    const P = state.current;
    if (state.phase === 'robo') return 'Robo: elige una de las cartas del rival.';
    if (state.phase === 'ruletaElegir') return 'Ruleta: elige qué rueda girar tocándola.';
    if (state.phase === 'duplicate') return 'Has robado una carta repetida: decide en el panel qué hacer con ella.';
    if (state.phase === 'discard') return 'Tienes la mano llena: pulsa en el panel la carta que quieres descartar.';
    if (state.phase === 'ruleta') return 'Ruleta: elige en el tablero las piezas que se eliminan y confirma en el panel.';
    if (aAscend) return 'Elige la pieza que quieres ascender.';
    if (aTarget) {
      const n = aTarget.picks.length;
      switch (aTarget.card) {
        case 'escudo': return 'Elige la pieza tuya que quieres proteger.';
        case 'trampa': return 'Elige una casilla vacía para la trampa. Después nadie sabrá dónde está, ni siquiera tú.';
        case 'congelar': return 'Elige el centro de la zona de 3×3 que quieres congelar.';
        case 'enroque': return n ? 'Elige la segunda pieza del intercambio.' : 'Elige la primera pieza del intercambio.';
        case 'posesion': return 'Elige la pieza rival que vas a poseer este turno.';
        case 'pedrolo': return 'Elige la casilla vacía donde colocar el pedrolo. Nadie podrá atravesarlo.';
        case 'resurreccion': return aTarget.revType ? 'Elige la casilla libre de tu primera fila donde reaparece.' : 'Elige qué pieza capturada quieres resucitar.';
      }
    }
    let t;
    if (state.movesLeft > 1) t = 'Doble paso: te quedan 2 movimientos.';
    else if (state.movesThisTurn > 0) t = 'Haz tu segundo movimiento.';
    else if (A.possessedPos(state)) t = 'Posesión: mueve la pieza poseída (marcada en morado) o cualquiera de las tuyas.';
    else if (state.cardUsed) t = 'Carta usada. Ahora haz tu movimiento.';
    else t = 'Mueve una pieza' + (A.canUseCards(state) ? ', o usa antes una carta de tu mano.' : '.');
    if (state.turnCount[P] <= 1) t += ' En tu primer turno no se pueden usar cartas.';
    if (state.bloodlust === P) t += ' 🩸 Sed de sangre: si puedes capturar, estás obligado.';
    if (state.buff === 'fantasma') t += ' 👻 Fantasma: tus piezas atraviesan peones este turno.';
    if (state.buff === 'salto') t += ' 🐴 Salto de caballo: tus piezas también pueden moverse como un caballo.';
    return t;
  }

  function button(text, onClick, cls, disabled) {
    const b = document.createElement('button');
    b.textContent = text;
    if (cls) b.className = cls;
    b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  function startCard(id) {
    aPick = null;
    aMsg = '';
    if (!NEEDS[id]) { dispatch({ type: 'play', card: id }); return; }
    aTarget = { card: id, picks: [] };
    render();
  }

  function cancelArsenalChoice() {
    aPick = null;
    aTarget = null;
    aAscend = false;
    aMsg = '';
    render();
  }

  function renderArsenalPanel(active) {
    const P = handOwner() || state.current;
    const R = P === 1 ? 2 : 1;
    const myDecision = active && state.current === P;

    // Animaciones: carta usada o ruleta
    const pc = state.playCount || 0, rc = state.ruletaCount || 0, bc = state.roboCount || 0;
    if (lastRuletaCount !== null && rc > lastRuletaCount && state.lastRuleta) showWheel(state.lastRuleta);
    else if (lastRoboCount !== null && bc > lastRoboCount && state.lastRobo) showStolen(state.lastRobo);
    else if (lastPlayCount !== null && pc > lastPlayCount && state.lastPlayed && state.lastPlayed.card !== 'ruleta') showArsenalPlay(state.lastPlayed);
    lastPlayCount = pc;
    lastRuletaCount = rc;
    lastRoboCount = bc;

    // Rival
    $('aRival').innerHTML = '';
    const rv = document.createElement('span');
    rv.innerHTML = '<strong></strong>';
    rv.firstChild.textContent = Engine.playerName(state, R);
    rv.appendChild(document.createTextNode(': ' + state.hands[R].length + (state.hands[R].length === 1 ? ' carta' : ' cartas') +
      ' · Escudo ' + (state.escudo[R] ? 'disponible' : 'usado') + ' · ' + state.points[R] + '/' + A.ASC_POINTS + ' puntos'));
    $('aRival').appendChild(rv);

    // Efectos activos
    const fx = [];
    if (state.frozen && state.frozen.ids.length) fx.push('❄️ ' + state.frozen.ids.length + (state.frozen.ids.length === 1 ? ' pieza congelada' : ' piezas congeladas') + ' en el turno de ' + Engine.playerName(state, state.frozen.player) + '.');
    if (state.locked && state.locked.ids.length) fx.push('🔁 Enroque: las dos piezas intercambiadas no pueden moverse este turno.');
    if (state.shields.length) fx.push('🛡️ Hay ' + (state.shields.length === 1 ? 'una pieza protegida' : state.shields.length + ' piezas protegidas') + ' por un Escudo (marco dorado).');
    if (A.possessedPos(state)) fx.push('😈 Posesión: ' + Engine.playerName(state, state.current) + ' controla este turno la pieza marcada en morado.');
    if (state.bloodlust) fx.push('🩸 Sed de sangre: ' + Engine.playerName(state, state.bloodlust) + ' está obligado a capturar en su turno.');
    if (state.traps.length) fx.push('🪤 Trampas ocultas en el tablero: ' + state.traps.length + '.');
    if (state.buff) fx.push('✨ Potenciadora activa: ' + A.CARD[state.buff].name + '.');
    $('aEffects').innerHTML = '';
    fx.forEach(function (f) {
      const d = document.createElement('div');
      d.className = 'a-effect';
      d.textContent = f;
      $('aEffects').appendChild(d);
    });

    // Mano
    const hand = state.hands[P] || [];
    $('aHandTitle').textContent = mode === 'local' ? 'Mano de ' + Engine.playerName(state, P) : 'Tu mano';
    $('aHandCount').textContent = hand.length + '/' + A.HAND_LIMIT;
    const box = $('aHand');
    box.innerHTML = '';
    const items = hand.map(function (id, i) { return { id: id, index: i }; });
    if (state.escudo[P]) items.push({ id: 'escudo', index: -1 });
    items.forEach(function (it) {
      const el = arsenalCardEl(it.id);
      const discarding = myDecision && state.phase === 'discard';
      if (discarding && it.index >= 0) el.classList.add('discardable');
      else if (!(myDecision && state.phase === 'turn' && A.cardAllowed(state, it.id).ok)) el.classList.add('unusable');
      if (aPick && aPick.index === it.index) el.classList.add('picked');
      el.title = A.CARD[it.id].text;
      el.addEventListener('click', function () {
        if (discarding) {
          if (it.index >= 0) dispatch({ type: 'discard', index: it.index });
          return;
        }
        aPick = { id: it.id, index: it.index };
        aTarget = null;
        aAscend = false;
        aMsg = '';
        render();
      });
      box.appendChild(el);
    });
    if (!items.length) {
      const e = document.createElement('span');
      e.className = 'a-hand-empty';
      e.textContent = 'Sin cartas';
      box.appendChild(e);
    }

    // Carta seleccionada
    const sel = $('aSelected');
    sel.innerHTML = '';
    sel.classList.toggle('hidden', !aPick);
    if (aPick) {
      const card = A.CARD[aPick.id];
      const p = document.createElement('p');
      p.innerHTML = '<strong></strong> · ';
      p.firstChild.textContent = card.name;
      p.appendChild(document.createTextNode((card.type === 'accion' ? (aPick.id === 'apuesta' ? 'de acción (te quita el movimiento)' : 'de acción (después mueves igual)') : 'potenciadora (cambia tu movimiento de este turno)') + '. ' + card.text));
      sel.appendChild(p);
      const allowed = myDecision && state.phase === 'turn' ? A.cardAllowed(state, aPick.id) : { ok: false, why: 'No es tu turno.' };
      if (!allowed.ok) {
        const w = document.createElement('p');
        w.className = 'why';
        w.textContent = allowed.why;
        sel.appendChild(w);
      }
      const btns = document.createElement('div');
      btns.className = 'a-btns';
      const pick = aPick;
      btns.appendChild(button('Usar', function () { startCard(pick.id); }, '', !allowed.ok));
      if (pick.index >= 0) {
        const pts = A.points(pick.id);
        btns.appendChild(button('Descartar (+' + pts + ')', function () { dispatch({ type: 'discardCard', index: pick.index }); },
          'secondary', !(myDecision && A.canUseCards(state))));
      }
      btns.appendChild(button('Cancelar', cancelArsenalChoice, 'secondary'));
      sel.appendChild(btns);
    }

    // Decisiones y avisos
    const dec = $('aDecision');
    dec.innerHTML = '';
    let showDec = false;
    const addP = function (text) { const p = document.createElement('p'); p.textContent = text; dec.appendChild(p); };
    if (myDecision && state.phase === 'duplicate') {
      showDec = true;
      const card = A.CARD[state.incoming];
      addP('Has robado ' + card.name + ', que ya tienes en la mano.');
      const btns = document.createElement('div');
      btns.className = 'a-btns';
      btns.appendChild(button('Descartar la nueva (+' + A.points(state.incoming) + ')', function () { dispatch({ type: 'duplicate', choice: 'discard' }); }, 'secondary'));
      if (card.rarity !== 'epica') {
        const up = card.rarity === 'comun' ? 'rara' : 'épica';
        btns.appendChild(button('Combinar en una ' + up, function () { dispatch({ type: 'duplicate', choice: 'combine' }); }));
      }
      dec.appendChild(btns);
    } else if (myDecision && state.phase === 'discard') {
      showDec = true;
      addP('Tienes ' + hand.length + ' cartas y el máximo es ' + A.HAND_LIMIT + ': pulsa la carta que quieres descartar (te dará puntos de Ascenso).');
    } else if (myDecision && state.phase === 'ruleta') {
      showDec = true;
      const v = state.ruleta.value;
      const check = A.ruletaCheck(state, aRuleta);
      addP('Ha salido ' + (v > 0 ? '+' + v : v) + ': elige ' + (v > 0 ? 'piezas rivales' : 'piezas tuyas') + ' que sumen como máximo ' + Math.abs(v) +
        ' (peón 1, caballo y alfil 3, torre 5, dama 9). Llevas ' + check.sum + '.');
      if (!check.ok && check.why) {
        const w = document.createElement('p');
        w.className = 'why';
        w.textContent = check.why;
        dec.appendChild(w);
      }
      const btns = document.createElement('div');
      btns.className = 'a-btns';
      btns.appendChild(button('Confirmar', function () { dispatch({ type: 'ruletaPick', squares: aRuleta.slice() }); }, '', !check.ok));
      dec.appendChild(btns);
    } else if (aTarget || aAscend) {
      showDec = true;
      addP(arsenalInstructions());
      const btns = document.createElement('div');
      btns.className = 'a-btns';
      if (aTarget && aTarget.card === 'resurreccion' && !aTarget.revType) {
        A.revivableTypes(state).forEach(function (ty) {
          const b = button(Engine.PIECE_NAMES[ty].charAt(0).toUpperCase() + Engine.PIECE_NAMES[ty].slice(1), function () {
            aTarget.revType = ty;
            aMsg = '';
            render();
          });
          b.insertBefore(pieceImg(ty, Engine.myColor(state)), b.firstChild);
          btns.appendChild(b);
        });
      }
      btns.appendChild(button('Cancelar', cancelArsenalChoice, 'secondary'));
      dec.appendChild(btns);
    }
    if (aMsg) {
      showDec = true;
      const w = document.createElement('p');
      w.className = 'why';
      w.textContent = aMsg;
      dec.appendChild(w);
    }
    dec.classList.toggle('hidden', !showDec);

    // Puntos de Ascenso
    const pts = state.points[P];
    $('aPtsFill').style.width = Math.min(100, pts / A.ASC_POINTS * 100) + '%';
    $('aPts').textContent = pts + '/' + A.ASC_POINTS;
    $('aAscend').disabled = !(myDecision && state.phase === 'turn' && state.movesThisTurn === 0 && pts >= A.ASC_POINTS);
  }

  $('aAscend').addEventListener('click', function () {
    aAscend = true;
    aPick = null;
    aTarget = null;
    aMsg = '';
    render();
  });

  function arsenalBoardClick(r, c) {
    const b = state.board;
    if (state.phase === 'ruleta') {
      if (!A.ruletaEligible(state).some(function (s) { return s[0] === r && s[1] === c; })) return;
      const i = aRuleta.findIndex(function (s) { return s[0] === r && s[1] === c; });
      if (i >= 0) aRuleta.splice(i, 1); else aRuleta.push([r, c]);
      render();
      return;
    }
    if (state.phase !== 'turn') return;
    if (aTarget || aAscend) {
      const cand = arsenalCandidates(true);
      if (!cand[key(r, c)]) { aMsg = 'Esa casilla no vale para lo que estás eligiendo.'; render(); return; }
      if (aAscend) {
        const p = b[r][c];
        const opts = ASC_NEXT[p.type];
        const send = function (to) { dispatch({ type: 'ascend', r: r, c: c, to: to }); };
        if (opts.length > 1) askPromotion(p.color, send, opts, '¿En qué pieza asciende el peón?');
        else send(opts[0]);
        return;
      }
      aTarget.picks.push([r, c]);
      const id = aTarget.card;
      if (aTarget.picks.length >= NEEDS[id]) {
        const pk = aTarget.picks;
        let target;
        if (id === 'enroque') target = { a: pk[0], b: pk[1] };
        else if (id === 'resurreccion') target = { sq: pk[0], type: aTarget.revType };
        else target = { sq: pk[0] };
        dispatch({ type: 'play', card: id, target: target });
      } else {
        aMsg = '';
        render();
      }
      return;
    }
    // Movimiento normal
    const move = selMoves.find(function (m) { return m.to[0] === r && m.to[1] === c; });
    if (move) {
      const send = function (promo) { dispatch({ type: 'move', from: move.from, to: move.to, promo: promo }); };
      if (A.needsPromotion(state, move)) askPromotion(b[move.from[0]][move.from[1]].color, send);
      else send();
      return;
    }
    const p = b[r][c];
    const pp = A.possessedPos(state);
    const possessedHere = pp && pp[0] === r && pp[1] === c;
    if (p && (p.color === Engine.myColor(state) || possessedHere) && !(selected && selected[0] === r && selected[1] === c)) {
      selected = [r, c];
      selMoves = A.legalMovesFrom(state, r, c);
      aPick = null;
    } else {
      clearSelection();
    }
    render();
  }

  function playVerb(player) {
    if (mode === 'local' || !mode) return Engine.playerName(state, player) + ' usa';
    if (player === myPlayer) return 'Has usado';
    return mode === 'bot' ? 'El bot usa' : 'Tu rival usa';
  }

  function showArsenalPlay(lp) {
    showRevealEl(arsenalCardEl(lp.card), playVerb(lp.player), A.CARD[lp.card].text);
  }

  function showStolen(lr) {
    const victim = lr.player === 1 ? 2 : 1;
    let who;
    if (mode === 'local' || !mode) who = Engine.playerName(state, lr.player) + ' roba';
    else if (lr.player === myPlayer) who = 'Has robado';
    else who = (mode === 'bot' ? 'El bot' : 'Tu rival') + ' te roba';
    if (victim === myPlayer || lr.player === myPlayer || mode === 'local') {
      showRevealEl(arsenalCardEl(lr.card), '🦝 ' + who, A.CARD[lr.card].text);
    }
  }

  // ¿Quién está mirando el Robo desde este dispositivo?
  function roboThiefHere() {
    if (mode === 'local' || !mode) return true;
    return state.robo && state.robo.player === myPlayer;
  }

  function setRoboHover(i) {
    if (roboHover === i) return;
    roboHover = i;
    updateRoboHover();
    if (online()) Net.send({ t: 'hover', i: i });
  }

  function updateRoboHover() {
    const cards = $('roboCards').children;
    for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('hovered', roboHover === i);
  }

  function renderRobo() {
    const box = $('roboOverlay');
    if (!isArsenal() || state.phase !== 'robo' || !state.robo) {
      box.classList.add('hidden');
      roboHover = null;
      roboKey = '';
      return;
    }
    const thief = state.robo.player, victim = thief === 1 ? 2 : 1;
    const hand = state.hands[victim];
    const thiefHere = roboThiefHere();
    const canPick = thiefHere && canAct();
    const key = (state.roboCount || 0) + '|' + hand.join(',') + '|' + thiefHere + '|' + canPick;
    box.classList.remove('hidden');
    if (key === roboKey) { updateRoboHover(); return; }
    roboKey = key;
    const thiefName = mode === 'bot' && thief !== myPlayer ? 'El bot' : Engine.playerName(state, thief);
    $('roboTitle').textContent = thiefHere
      ? '🦝 Elige una carta de ' + Engine.playerName(state, victim)
      : '🦝 ' + thiefName + ' está eligiendo una de tus cartas…';
    $('roboHint').textContent = thiefHere ? 'Te quedas con la que elijas.' : 'Ves en directo sobre cuál pasa el cursor.';
    const row = $('roboCards');
    row.innerHTML = '';
    hand.forEach(function (id, i) {
      let el;
      if (thiefHere) {
        el = document.createElement('div');
        el.className = 'acard robo-back';
      } else {
        el = arsenalCardEl(id);
      }
      el.classList.add('robo-card');
      const cur = document.createElement('div');
      cur.className = 'robo-cursor';
      cur.textContent = '👇';
      el.appendChild(cur);
      if (canPick) {
        el.addEventListener('pointerdown', function (e) { roboTouch = e.pointerType !== 'mouse'; });
        el.addEventListener('mouseenter', function () { if (!roboTouch) setRoboHover(i); });
        el.addEventListener('mouseleave', function () { if (!roboTouch) setRoboHover(null); });
        el.addEventListener('click', function () {
          if (roboTouch && roboHover !== i) { setRoboHover(i); return; }
          dispatch({ type: 'roboPick', index: i });
        });
      }
      row.appendChild(el);
    });
    if (canPick && window.matchMedia && !window.matchMedia('(hover: hover)').matches) $('roboHint').textContent = 'Toca una carta para señalarla y vuelve a tocarla para robarla.';
    updateRoboHover();
  }

  const WHEEL_IMG = {
    equilibrada: 'cards/arsenal/ruleta-rueda.svg',
    arriesgada: 'cards/arsenal/ruleta-rueda-arriesgada.svg',
  };

  // Rueda con su flecha (en pequeño para elegir, en grande para girar)
  function wheelEl(wheel) {
    const wrap = document.createElement('div');
    wrap.className = 'wheel-wrap';
    const img = document.createElement('img');
    img.src = WHEEL_IMG[wheel] || WHEEL_IMG.equilibrada;
    img.alt = wheel === 'arriesgada' ? 'Ruleta arriesgada' : 'Ruleta equilibrada';
    wrap.appendChild(img);
    return wrap;
  }

  function showWheel(info) {
    const wheel = info.wheel || 'equilibrada';
    const wrap = wheelEl(wheel);
    const img = wrap.firstChild;
    showRevealEl(wrap, '🎡 ' + playVerb(info.player) + ' la Ruleta ' + (wheel === 'arriesgada' ? 'arriesgada' : 'equilibrada'), 'Girando…', 8000, 'wheel-mode');
    const seg = 360 / ((A.RULETAS[wheel] || A.RULETA).length);
    const turns = 360 * 5 - (info.idx * seg + seg / 2);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { img.style.transform = 'rotate(' + turns + 'deg)'; });
    });
    const v = info.value;
    setTimeout(function () {
      $('revealDesc').textContent = 'Ha salido ' + (v > 0 ? '+' + v : v) + ': se eliminan piezas ' +
        (v > 0 ? 'rivales' : 'propias') + ' por valor de hasta ' + Math.abs(v) + '.';
    }, 3500);
  }

  // ---------- Ruleta: elegir rueda ----------
  let ruletaKey = '';
  let ruletaChosen = null;   // rueda tocada (mientras se despide la otra)

  const WHEEL_INFO = [
    { id: 'equilibrada', name: 'Equilibrada', info: 'De −5 a +7 · media +0,5' },
    { id: 'arriesgada', name: 'Arriesgada', info: 'Casi todo negativo, con dos +9 · media +0,5' },
  ];

  function chooseWheel(id) {
    if (ruletaChosen || !isArsenal() || state.phase !== 'ruletaElegir') return;
    ruletaChosen = id;
    const opts = $('ruletaOptions');
    opts.classList.add('picked');
    Array.prototype.forEach.call(opts.children, function (el) {
      el.classList.toggle('chosen', el.dataset.wheel === id);
      el.classList.toggle('gone', el.dataset.wheel !== id);
      el.disabled = true;
    });
    // La otra rueda desaparece, la elegida queda en el centro y empieza a girar
    setTimeout(function () {
      dispatch({ type: 'ruletaSpin', wheel: id });
      setTimeout(function () {
        if (state.phase === 'ruletaElegir') { ruletaChosen = null; ruletaKey = ''; render(); }
      }, 2500);
    }, 300);
  }

  function renderRuletaElegir() {
    const box = $('ruletaOverlay');
    if (!isArsenal() || state.phase !== 'ruletaElegir' || !state.ruletaElegir) {
      box.classList.add('hidden');
      ruletaKey = '';
      ruletaChosen = null;
      return;
    }
    const who = state.ruletaElegir.player;
    const here = mode === 'local' || !mode || who === myPlayer;
    const canPick = here && canAct() && !ruletaChosen;
    const key = (state.playCount || 0) + '|' + here + '|' + canPick + '|' + ruletaChosen;
    box.classList.remove('hidden');
    if (key === ruletaKey) return;
    ruletaKey = key;
    const whoName = mode === 'bot' && who !== myPlayer ? 'El bot' : Engine.playerName(state, who);
    $('ruletaTitle').textContent = here ? '🎡 Elige la ruleta que quieres girar' : '🎡 ' + whoName + ' está eligiendo ruleta…';
    $('ruletaHint').textContent = here
      ? 'Toca una: la otra desaparece y la elegida empieza a girar. Las dos valen +0,5 de media.'
      : 'Las dos ruedas valen +0,5 de media; la arriesgada tiene más varianza.';
    const row = $('ruletaOptions');
    row.innerHTML = '';
    row.classList.toggle('picked', !!ruletaChosen);
    WHEEL_INFO.forEach(function (w) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ruleta-opt' + (ruletaChosen ? (ruletaChosen === w.id ? ' chosen' : ' gone') : '');
      b.dataset.wheel = w.id;
      b.disabled = !canPick;
      b.appendChild(wheelEl(w.id));
      const n = document.createElement('div');
      n.className = 'ruleta-name';
      n.textContent = w.name;
      const i = document.createElement('div');
      i.className = 'ruleta-info';
      i.textContent = w.info;
      b.appendChild(n);
      b.appendChild(i);
      b.addEventListener('click', function () { chooseWheel(w.id); });
      row.appendChild(b);
    });
  }

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

  // Resumen de la partida para el historial de la cuenta
  function gameSummary() {
    const local = mode === 'local';
    const me = local ? null : myPlayer;
    const other = me === 1 ? 2 : 1;
    const r = state.result;
    let result;
    if (local) result = 'local';
    else if (r.type === 'win') result = r.player === me ? 'win' : 'loss';
    else result = 'draw';
    return {
      id: String(state.gameId),
      mode: isArsenal() ? 'arsenal' : 'destino',
      vs: mode,
      opponent: local ? Engine.playerName(state, 1) + ' vs ' + Engine.playerName(state, 2) : Engine.playerName(state, other),
      color: local ? null : state.playerColor[me],
      result: result,
      winner: r.type === 'win' ? Engine.playerName(state, r.player) : null,
      reason: r.reason || '',
    };
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
    if (window.Cuentas) window.Cuentas.gameOver(gameSummary());
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
    state = createGame();
    const savedMode = saved && saved.state && saved.state.game === 'arsenal' ? 'arsenal' : 'destino';
    if (saved && saved.state && saved.state.phase !== 'over' && savedMode === gameMode &&
        window.confirm('Tienes una partida online sin terminar (sala ' + saved.code + '). ¿Quieres continuarla?')) {
      state = restoreGame(saved.state);
      code = saved.code;
    }
    if (!state.names || state.names[1] === 'Jugador 1') {
      state.names = { 1: myName(), 2: 'Rival' };
      state.log.push('🎲 Sorteo de colores: ' + state.names[1] + ' lleva ' + Engine.COLOR_NAMES[state.playerColor[1]] +
        ' y su rival lleva ' + Engine.COLOR_NAMES[state.playerColor[2]] + '. Empiezan blancas.');
    } else {
      state.names[1] = myName();
    }
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
    state = createGame();
    state.names = { 1: myName(), 2: 'Bot (' + (botLevel === 'facil' ? 'Fácil' : 'Normal') + ')' };
    announceColors();
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
    state = createGame();
    let rival = '';
    try { rival = localStorage.getItem('ajedrezCartas.rivalLocal') || ''; } catch (e) { /* nada */ }
    rival = cleanName(window.prompt('Nombre del otro jugador (Jugador 2):', rival || 'Jugador 2'), 'Jugador 2');
    try { localStorage.setItem('ajedrezCartas.rivalLocal', rival); } catch (e) { /* nada */ }
    state.names = { 1: myName(), 2: rival };
    announceColors();
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
    $(id).addEventListener('click', function () {
      const arsenal = mode ? isArsenal() : gameMode === 'arsenal';
      if (arsenal && window.openArsenalRules) window.openArsenalRules();
      else openManual();
    });
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
    openManual: openManual,
    setGameMode: function (m) { gameMode = m; },
    render: render,
    refresh: afterAction,
  };

  render();
})();
