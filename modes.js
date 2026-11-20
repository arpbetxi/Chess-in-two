/*
 * In 2 Chess — pantalla inicial de elección de modo y reglamento de Arsenal
 */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  // ---------- Elegir modo ----------
  function showModes() { $('modeSelect').classList.remove('hidden'); }
  function hideModes() { $('modeSelect').classList.add('hidden'); }

  // Abre el menú (online, bot o local) preparado para el modo elegido
  function chooseMode(m) {
    window.ajedrez.setGameMode(m);
    $('lobbyTitle').textContent = 'In 2 Chess · ' + (m === 'arsenal' ? 'Arsenal' : 'Destino');
    $('rulesRow').classList.toggle('hidden', m === 'arsenal'); // la variante de fin de turno es solo de Destino
    hideModes();
    $('lobby').classList.remove('hidden');
  }

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
