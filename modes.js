/*
 * In 2 Chess — pantalla inicial de elección de modo y reglamento de Arsenal
 */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  // ---------- Elegir modo ----------
  function showModes() { $('modeSelect').classList.remove('hidden'); }
  function hideModes() { $('modeSelect').classList.add('hidden'); }

  // Ficha de cada modo en la pantalla de inicio
  const MODE_INFO = {
    destino: {
      title: 'Destino',
      tagline: 'Cada turno robas una carta y ella decide por ti.',
      summary: [
        'Cada turno: roba una carta y haz lo que diga.',
        'Las cartas de número te dan 1, 2 o 3 movimientos; las especiales convierten, reviven o bloquean.',
        'Gana quien captura el rey rival.',
      ],
    },
    arsenal: {
      title: 'Arsenal',
      tagline: 'Ajedrez con una mano de cartas que tú decides cuándo usar.',
      summary: [
        'Cada turno: si quieres, una carta; después, tu movimiento.',
        'Mano de hasta 3 cartas. Descartar da puntos para ascender piezas.',
        'Gana quien captura el rey rival.',
      ],
    },
  };

  // Prepara la pantalla de inicio para el modo elegido
  function refreshLobby(m) {
    const info = MODE_INFO[m] || MODE_INFO.destino;
    $('lobby').classList.toggle('arsenal', m === 'arsenal');
    $('lobbyTitle').textContent = info.title;
    $('lobbyTagline').textContent = info.tagline;
    const ol = $('lobbySummary');
    ol.innerHTML = '';
    info.summary.forEach(function (t) {
      const li = document.createElement('li');
      li.textContent = t;
      ol.appendChild(li);
    });
    const art = document.querySelector(m === 'arsenal' ? '.mode-arsenal .mode-art' : '.mode-destino .mode-art');
    $('lobbyArt').innerHTML = '';
    if (art) $('lobbyArt').appendChild(art.cloneNode(true));
    $('rulesRow').classList.toggle('hidden', m === 'arsenal'); // la variante de fin de turno es solo de Destino
    updatePlayLabel();
  }
  window.refreshLobby = refreshLobby;

  // Abre la pantalla de inicio preparada para el modo elegido
  function chooseMode(m) {
    window.ajedrez.setGameMode(m);
    refreshLobby(m);
    hideModes();
    $('lobby').classList.remove('hidden');
  }

  // ---------- Contra quién: pestañas y botón Jugar ----------
  let opp = 'online';
  function setOpp(o) {
    opp = o;
    document.querySelectorAll('.opp-tab').forEach(function (b) {
      const on = b.dataset.opp === o;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.opp-body').forEach(function (d) { d.classList.toggle('hidden', d.dataset.opp !== o); });
    updatePlayLabel();
  }
  function updatePlayLabel() {
    const code = $('joinCode').value.trim();
    $('lobbyPlay').textContent = opp === 'online' ? (code ? 'Unirse a la sala' : 'Crear sala')
      : opp === 'bot' ? 'Jugar contra el bot' : 'Empezar partida';
  }
  document.querySelectorAll('.opp-tab').forEach(function (b) {
    b.addEventListener('click', function () { setOpp(b.dataset.opp); });
  });
  document.querySelectorAll('.seg-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.seg-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      $('botLevel').value = b.dataset.level;
    });
  });
  $('joinCode').addEventListener('input', updatePlayLabel);
  $('joinCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('lobbyPlay').click(); });
  $('lobbyPlay').addEventListener('click', function () {
    if (opp === 'online') $($('joinCode').value.trim() ? 'joinBtn' : 'hostBtn').click();
    else if (opp === 'bot') $('botBtn').click();
    else $('localBtn').click();
  });
  setOpp('online');

  $('playDestino').addEventListener('click', function () { chooseMode('destino'); });
  $('playArsenal').addEventListener('click', function () { chooseMode('arsenal'); });
  $('rulesDestino').addEventListener('click', function () { window.ajedrez.openManual(); });
  $('backToModes').addEventListener('click', showModes);

  // ---------- Reglamento de Arsenal ----------
  const A = window.Arsenal;
  const TYPE_NAMES = { potenciadora: 'Potenciadora', accion: 'De acción' };

  function arsenalCard(card) {
    const el = document.createElement('div');
    el.className = 'acard a-' + card.rarity;
    const img = document.createElement('img');
    img.src = 'cards/arsenal/' + card.id + '.svg';
    img.alt = '';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = card.name;
    el.appendChild(img);
    el.appendChild(name);
    return el;
  }

  function buildArsenalRules() {
    const box = $('arsenalCards');
    box.innerHTML = '';
    const byRarity = { comun: 0, rara: 0, epica: 0 };
    let total = 0;
    for (const card of A.CARDS) {
      if (byRarity[card.rarity] !== undefined) byRarity[card.rarity] += card.copies;
      total += card.copies;

      const item = document.createElement('div');
      item.className = 'manual-card';
      item.appendChild(arsenalCard(card));
      const info = document.createElement('div');
      const h = document.createElement('h4');
      h.textContent = card.name;
      const pill = document.createElement('span');
      pill.className = 'rarity-pill a-' + card.rarity;
      pill.textContent = A.RARITIES[card.rarity].name;
      h.appendChild(pill);
      const p = document.createElement('p');
      p.textContent = card.text;
      const meta = document.createElement('div');
      meta.className = 'copies';
      const pts = A.RARITIES[card.rarity].points;
      meta.textContent = TYPE_NAMES[card.type] +
        (card.copies ? ' · ' + card.copies + ' en el mazo' : ' · fuera del mazo') +
        (pts ? ' · descartarla da ' + pts + (pts === 1 ? ' punto' : ' puntos') : '');
      info.appendChild(h);
      info.appendChild(p);
      info.appendChild(meta);
      item.appendChild(info);
      box.appendChild(item);
    }
    $('arsenalDeckTotal').textContent = total;
    $('arsenalDeckSplit').textContent = byRarity.comun + ' comunes, ' + byRarity.rara + ' raras y ' + byRarity.epica + ' épicas';
    $('arsenalAscPts').textContent = A.RULES.ascensionPoints;
    $('arsenalAscPath').textContent = A.RULES.ascensionPath.toLowerCase();
  }

  function openArsenal() {
    buildArsenalRules();
    $('arsenalModal').classList.remove('hidden');
    $('arsenalClose').focus();
  }
  function closeArsenal() { $('arsenalModal').classList.add('hidden'); }

  $('rulesArsenal').addEventListener('click', openArsenal);
  window.openArsenalRules = openArsenal;
  $('arsenalClose').addEventListener('click', closeArsenal);
  $('arsenalModal').addEventListener('click', function (e) { if (e.target === this) closeArsenal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('arsenalModal').classList.contains('hidden')) closeArsenal();
  });
})();
