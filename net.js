/*
 * In 2 Chess — conexión online entre dos navegadores (PeerJS)
 * El anfitrión crea una sala con un código; el invitado se une con ese código.
 * Los navegadores se conectan directamente; el servidor gratuito de PeerJS
 * solo se usa para que se encuentren.
 */
(function (root) {
  'use strict';

  const PREFIX = 'ajedrez-cartas-v1-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function randomCode() {
    let s = '';
    for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }

  // Para pruebas con un servidor PeerJS propio: ?peerhost=localhost&peerport=9000
  function peerOptions() {
    const q = new URLSearchParams(location.search);
    if (!q.get('peerhost')) return {};
    return {
      host: q.get('peerhost'),
      port: Number(q.get('peerport') || 9000),
      path: q.get('peerpath') || '/',
      secure: q.get('peersecure') === '1',
    };
  }

  // Servidores TURN de Metered si están configurados en config.js (si no, null)
  function fetchIceServers() {
    const cfg = root.AJEDREZ_CONFIG || {};
    if (cfg.turnUsername && cfg.turnCredential) {
      const auth = { username: cfg.turnUsername, credential: cfg.turnCredential };
      return Promise.resolve([
        { urls: 'stun:stun.relay.metered.ca:80' },
        Object.assign({ urls: 'turn:global.relay.metered.ca:80' }, auth),
        Object.assign({ urls: 'turn:global.relay.metered.ca:80?transport=tcp' }, auth),
        Object.assign({ urls: 'turn:global.relay.metered.ca:443' }, auth),
        Object.assign({ urls: 'turns:global.relay.metered.ca:443?transport=tcp' }, auth),
      ]);
    }
    if (!cfg.meteredApp || !cfg.meteredApiKey) return Promise.resolve(null);
    const url = 'https://' + cfg.meteredApp + '.metered.live/api/v1/turn/credentials?apiKey=' +
      encodeURIComponent(cfg.meteredApiKey);
    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (list) { return Array.isArray(list) && list.length ? list : null; })
      .catch(function (e) {
        console.warn('No se pudieron obtener los servidores TURN de Metered:', e);
        return null;
      });
  }

  const Net = {
    peer: null,
    conn: null,
    role: null,   // 'host' | 'guest'
    code: null,
    ready: false, // true cuando la sala está registrada en el servidor
    _timer: null,
    _connTimer: null,
    _gen: 0,       // evita que respuestas antiguas afecten a una conexión nueva
    usingTurn: false,
    handlers: {}, // onStatus(text, ok), onData(msg), onConnected(), onDisconnected(), onError(text)

    _emit: function (name) {
      const fn = this.handlers[name];
      if (fn) fn.apply(null, Array.prototype.slice.call(arguments, 1));
    },

    _watchConn: function (conn) {
      const self = this;
      conn.on('open', function () {
        clearTimeout(self._connTimer);
        self.conn = conn;
        self._emit('onConnected');
      });
      conn.on('data', function (msg) { self._emit('onData', msg); });
      conn.on('close', function () {
        if (self.conn === conn) self.conn = null;
        self._emit('onDisconnected');
      });
      conn.on('error', function (err) { self._emit('onError', self._friendlyError(err)); });
    },

    // Comprueba que la librería está cargada y avisa si el servidor no responde
    _start: function (waitingText) {
      if (typeof Peer === 'undefined') {
        this._emit('onError', 'No se ha podido cargar la librería de conexión (PeerJS). ' +
          'Comprueba que la carpeta "lib" con el archivo "peerjs.min.js" está subida junto al resto de archivos.');
        return false;
      }
      const self = this;
      this._emit('onStatus', waitingText, false);
      this._timer = setTimeout(function () {
        if (!self.ready) {
          self._emit('onError', 'El servidor de conexión no responde. Prueba a desactivar el bloqueador de anuncios ' +
            'o cambiar de red (por ejemplo, datos móviles) y vuelve a intentarlo.');
        }
      }, 12000);
      return true;
    },

    _friendlyError: function (err) {
      const msgs = {
        'network': 'No hay conexión con el servidor de PeerJS. Revisa tu conexión a internet.',
        'server-error': 'El servidor de PeerJS no está disponible ahora mismo. Inténtalo en unos minutos.',
        'socket-error': 'Se ha cortado la conexión con el servidor de PeerJS.',
        'socket-closed': 'Se ha cortado la conexión con el servidor de PeerJS.',
        'browser-incompatible': 'Este navegador no permite conexiones directas. Prueba con Chrome, Firefox o Safari actualizados.',
        'webrtc': 'No se ha podido establecer la conexión directa entre los dos navegadores (puede que la red la bloquee).',
        'negotiation-failed': 'No se ha podido establecer la conexión entre los dos navegadores (puede que la red la bloquee).',
      };
      return msgs[err.type] || ('Error de conexión: ' + err.type);
    },

    _keepAlive: function () {
      const self = this;
      // Si se cae la conexión con el servidor de PeerJS, se reintenta
      this.peer.on('disconnected', function () {
        setTimeout(function () { if (self.peer && !self.peer.destroyed) self.peer.reconnect(); }, 1500);
      });
    },

    // Crear sala. Si se pasa un código (partida guardada), intenta reutilizarlo.
    host: function (code) {
      const self = this;
      this.close();
      this.role = 'host';
      this.code = code || randomCode();
      if (!this._start('Creando sala…')) return;
      const gen = this._gen;
      fetchIceServers().then(function (ice) {
        if (gen !== self._gen) return;
        self._createPeer(PREFIX + self.code, ice);
        self._setupHost();
      });
    },

    _createPeer: function (id, ice) {
      const opts = peerOptions();
      this.usingTurn = !!ice;
      if (ice) opts.config = { iceServers: ice };
      this.peer = id ? new Peer(id, opts) : new Peer(opts);
      this._keepAlive();
    },

    _setupHost: function () {
      const self = this;
      this.peer.on('open', function () {
        self.ready = true;
        self._emit('onStatus', 'Sala ' + self.code + ': esperando a tu rival…', false);
        self._emit('onHostReady', self.code);
      });
      this.peer.on('connection', function (conn) {
        // Si el rival se reconecta, la conexión nueva sustituye a la antigua
        if (self.conn && self.conn !== conn) self.conn.close();
        self._watchConn(conn);
      });
      this.peer.on('error', function (err) {
        if (err.type === 'unavailable-id') {
          // El código ya está en uso: se prueba con otro
          self.host(null);
        } else {
          self._emit('onError', self._friendlyError(err));
        }
      });
    },

    join: function (code) {
      const self = this;
      this.close();
      this.role = 'guest';
      this.code = code.trim().toUpperCase();
      if (!this._start('Conectando con la sala ' + this.code + '…')) return;
      const gen = this._gen;
      fetchIceServers().then(function (ice) {
        if (gen !== self._gen) return;
        self._createPeer(null, ice);
        self._setupGuest();
      });
    },

    _setupGuest: function () {
      const self = this;
      this.peer.on('open', function () {
        self.ready = true;
        const conn = self.peer.connect(PREFIX + self.code, { reliable: true });
        self._watchConn(conn);
        // Si la conexión directa no se abre, avisamos en vez de quedarnos colgados
        self._connTimer = setTimeout(function () {
          if (!self.isConnected()) {
            self._emit('onError', 'La sala existe, pero no se ha podido conectar con el navegador del anfitrión. ' +
              'Suele pasar cuando la red bloquea la conexión directa (datos móviles, wifis de universidad). ' +
              (self.usingTurn
                ? 'Prueba con otra red.'
                : 'Configura el servidor TURN gratuito en config.js para solucionarlo.'));
          }
        }, 20000);
      });
      this.peer.on('error', function (err) {
        if (err.type === 'peer-unavailable') {
          self._emit('onError', 'No existe ninguna sala con el código ' + self.code + ' (o el anfitrión no está conectado).');
        } else {
          self._emit('onError', self._friendlyError(err));
        }
      });
    },

    send: function (msg) {
      if (this.conn && this.conn.open) this.conn.send(msg);
    },

    isConnected: function () { return !!(this.conn && this.conn.open); },

    close: function () {
      this._gen++;
      clearTimeout(this._timer);
      clearTimeout(this._connTimer);
      this.ready = false;
      if (this.conn) { try { this.conn.close(); } catch (e) { /* nada */ } }
      if (this.peer) { try { this.peer.destroy(); } catch (e) { /* nada */ } }
      this.conn = null;
      this.peer = null;
    },
  };

  root.Net = Net;
})(this);
