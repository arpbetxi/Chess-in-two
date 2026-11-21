/*
 * Cuentas de jugador: inicio de sesión, estadísticas e historial de partidas.
 * Usa window.CuentasBackend (firebase-backend.js). Si no hay configuración de Firebase,
 * todo esto queda oculto y el juego funciona igual que antes.
 */
(function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const PENDING_KEY = 'in2chess.partidasPendientes';
  const MODE_NAMES = { destino: 'Destino', arsenal: 'Arsenal' };
  const VS_NAMES = { online: 'online', bot: 'contra el bot', local: 'en este dispositivo' };
  const RESULT_NAMES = { win: 'Victoria', loss: 'Derrota', draw: 'Tablas', local: 'Partida local' };

  const configured = !!(window.FIREBASE_CONFIG || window.CuentasBackend);
  let backend = null;
  let user = null;
  let failed = false;
  let registering = false;

  if (!configured) {
    window.Cuentas = { gameOver: function () {} };
    return;
  }

  $('accountBtn').classList.remove('hidden');

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.add('hidden'); }, 3200);
  }

  // ---------- Partidas pendientes (si no se pudieron guardar, se reintenta) ----------
  function loadPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch (e) { return []; }
  }
  function savePending(list) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-50))); } catch (e) { /* nada */ }
  }
  function flushPending() {
    if (!backend || !user) return;
    const list = loadPending();
    if (!list.length) return;
    savePending([]);
    list.forEach(function (g) {
      backend.saveGame(g).catch(function (e) {
        // "permission-denied" suele ser que ya estaba guardada: no se reintenta
        if (!(e && /permission/i.test(e.code || e.message || ''))) savePending(loadPending().concat([g]));
      });
    });
  }

  function gameOver(summary) {
    if (!backend || !user) {
      if (user === null && !failed) return;      // sin sesión: no se guarda
      savePending(loadPending().concat([summary]));
      return;
    }
    backend.saveGame(summary).then(function () {
      toast('Partida guardada en tu historial');
    }).catch(function (e) {
      if (!(e && /permission/i.test(e.code || e.message || ''))) savePending(loadPending().concat([summary]));
    });
  }

  // ---------- Pantallas de la ventana de cuenta ----------
  function show(section) {
    ['accLoading', 'accUnavailable', 'accOut', 'accIn'].forEach(function (id) {
      $(id).classList.toggle('hidden', id !== section);
    });
  }

  function refresh() {
    $('accountBtn').classList.toggle('logged', !!user);
    $('accountBtn').title = user ? 'Tu cuenta: ' + user.name : 'Iniciar sesión';
    const line = $('accountLine');
    line.classList.remove('hidden');
    line.innerHTML = '';
    if (user) {
      line.appendChild(document.createTextNode('Conectado como '));
      const b = document.createElement('strong');
      b.textContent = user.name;
      line.appendChild(b);
      line.appendChild(document.createTextNode(' · '));
      const a = document.createElement('button');
      a.className = 'link-btn';
      a.textContent = 'Ver mi historial';
      a.addEventListener('click', openModal);
      line.appendChild(a);
    } else {
      const a = document.createElement('button');
      a.className = 'link-btn';
      a.textContent = 'Inicia sesión';
      a.addEventListener('click', openModal);
      line.appendChild(a);
      line.appendChild(document.createTextNode(' para guardar tu historial y tus estadísticas.'));
    }
    $('overHistory').classList.toggle('hidden', !user);
    if (!$('accountModal').classList.contains('hidden')) renderModal();
  }

  function setRegistering(on) {
    registering = on;
    $('accName').classList.toggle('hidden', !on);
    $('accNameLabel').classList.toggle('hidden', !on);
    $('accSubmit').textContent = on ? 'Crear cuenta' : 'Iniciar sesión';
    $('accToggle').textContent = on ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate';
    $('accPass').autocomplete = on ? 'new-password' : 'current-password';
    $('accReset').classList.toggle('hidden', on);
    error('');
  }

  function error(msg) {
    $('accError').textContent = msg;
    $('accError').classList.toggle('hidden', !msg);
  }

  function friendly(e) {
    const c = (e && (e.code || e.message)) || '';
    if (/invalid-email/.test(c)) return 'Ese correo no es válido.';
    if (/missing-password|weak-password/.test(c)) return 'La contraseña debe tener al menos 6 caracteres.';
    if (/email-already-in-use/.test(c)) return 'Ya hay una cuenta con ese correo. Inicia sesión.';
    if (/invalid-credential|wrong-password|user-not-found/.test(c)) return 'Correo o contraseña incorrectos.';
    if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espera un poco y vuelve a probar.';
    if (/popup-closed|cancelled-popup/.test(c)) return '';
    if (/popup-blocked/.test(c)) return 'El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes y vuelve a probar.';
    if (/unauthorized-domain/.test(c)) return 'Este dominio no está autorizado en Firebase todavía.';
    if (/network/.test(c)) return 'Sin conexión. Inténtalo de nuevo.';
    return 'No se ha podido completar. Inténtalo de nuevo.';
  }

  function statBox(label, value) {
    const d = document.createElement('div');
    d.className = 'acc-stat';
    const n = document.createElement('div');
    n.className = 'n';
    n.textContent = value;
    const l = document.createElement('div');
    l.className = 'l';
    l.textContent = label;
    d.appendChild(n);
    d.appendChild(l);
    return d;
  }

  function renderModal() {
    if (failed) { show('accUnavailable'); return; }
    if (!backend) { show('accLoading'); return; }
    if (!user) { show('accOut'); return; }
    show('accIn');
    $('accUserName').textContent = user.name;
    $('accUserEmail').textContent = user.email || '';
    $('accStats').innerHTML = '';
    $('accModes').textContent = '';
    $('accHistory').innerHTML = '<li class="acc-empty">Cargando…</li>';
    backend.loadProfile().then(function (p) {
      const s = (p && p.stats) || {};
      const box = $('accStats');
      box.innerHTML = '';
      box.appendChild(statBox('Partidas', s.played || 0));
      box.appendChild(statBox('Victorias', s.win || 0));
      box.appendChild(statBox('Derrotas', s.loss || 0));
      box.appendChild(statBox('Tablas', s.draw || 0));
      const bm = (p && p.byMode) || {};
      const parts = Object.keys(MODE_NAMES).filter(function (m) { return bm[m]; }).map(function (m) {
        const x = bm[m];
        return MODE_NAMES[m] + ': ' + (x.played || 0) + ' partidas, ' + (x.win || 0) + ' victorias';
      });
      $('accModes').textContent = parts.join(' · ');
    }).catch(function () { $('accStats').textContent = 'No se han podido cargar las estadísticas.'; });
    backend.loadGames(20).then(function (games) {
      const ol = $('accHistory');
      ol.innerHTML = '';
      if (!games.length) {
        ol.innerHTML = '<li class="acc-empty">Aún no hay partidas guardadas. ¡Juega una!</li>';
        return;
      }
      games.forEach(function (g) {
        const li = document.createElement('li');
        li.className = 'acc-game ' + g.result;
        const res = document.createElement('span');
        res.className = 'res';
        res.textContent = g.result === 'local' && g.winner ? 'Ganó ' + g.winner : (RESULT_NAMES[g.result] || '');
        const info = document.createElement('span');
        info.className = 'info';
        const opp = g.vs === 'local' ? g.opponent : 'vs ' + g.opponent;
        info.textContent = MODE_NAMES[g.mode] + ' · ' + opp + ' (' + (VS_NAMES[g.vs] || g.vs) + ')' + (g.reason ? ' · ' + g.reason : '');
        const date = document.createElement('span');
        date.className = 'date';
        date.textContent = g.date ? g.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
        li.appendChild(res);
        li.appendChild(info);
        li.appendChild(date);
        ol.appendChild(li);
      });
    }).catch(function () { $('accHistory').innerHTML = '<li class="acc-empty">No se ha podido cargar el historial.</li>'; });
  }

  function openModal() {
    $('accountModal').classList.remove('hidden');
    renderModal();
  }
  function closeModal() { $('accountModal').classList.add('hidden'); }

  // ---------- Eventos ----------
  $('accountBtn').addEventListener('click', openModal);
  $('overHistory').addEventListener('click', function () {
    $('overModal').classList.add('hidden');
    openModal();
  });
  $('accClose').addEventListener('click', closeModal);
  $('accountModal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('accountModal').classList.contains('hidden')) closeModal();
  });
  $('accToggle').addEventListener('click', function () { setRegistering(!registering); });

  $('accGoogle').addEventListener('click', function () {
    if (!backend) return;
    error('');
    backend.signInGoogle().catch(function (e) { error(friendly(e)); });
  });

  $('accForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!backend) return;
    const email = $('accEmail').value.trim(), pass = $('accPass').value;
    const name = $('accName').value.trim() || $('playerName').value.trim();
    if (registering && !name) { error('Escribe tu nombre.'); return; }
    $('accSubmit').disabled = true;
    const p = registering ? backend.signUpEmail(name, email, pass) : backend.signInEmail(email, pass);
    p.then(function () {
      $('accPass').value = '';
      if (registering && user) {
        user.name = name;
        $('playerName').value = name;
        $('playerName').dispatchEvent(new Event('change'));
        refresh();
      }
    }).catch(function (err) { error(friendly(err)); })
      .finally(function () { $('accSubmit').disabled = false; });
  });

  $('accReset').addEventListener('click', function () {
    const email = $('accEmail').value.trim();
    if (!email) { error('Escribe tu correo arriba y vuelve a pulsar.'); return; }
    backend.resetPassword(email).then(function () {
      error('');
      toast('Te hemos enviado un correo para cambiar la contraseña.');
    }).catch(function (err) { error(friendly(err)); });
  });

  $('accLogout').addEventListener('click', function () {
    backend.signOut().then(function () { toast('Has cerrado sesión'); });
  });

  // ---------- Conexión con el backend ----------
  function attach() {
    if (backend || !window.CuentasBackend) return;
    backend = window.CuentasBackend;
    backend.onAuth(function (u) {
      const wasOut = !user;
      user = u;
      if (u && wasOut) {
        // El nombre de la cuenta pasa a ser tu nombre en las partidas
        if (u.name) {
          $('playerName').value = u.name;
          $('playerName').dispatchEvent(new Event('change'));
        }
        flushPending();
        if (!$('accountModal').classList.contains('hidden')) toast('Sesión iniciada como ' + u.name);
      }
      refresh();
    });
    refresh();
  }
  window.addEventListener('cuentas-backend', attach);
  window.addEventListener('cuentas-error', function () { failed = true; refresh(); });
  attach();
  refresh();

  window.Cuentas = { gameOver: gameOver };
})();
