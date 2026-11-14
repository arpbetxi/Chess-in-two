/*
 * Ajedrez con cartas — conexión online entre dos navegadores (PeerJS)
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

  const Net = {
    peer: null,
    conn: null,
    role: null,   // 'host' | 'guest'
    code: null,
    ready: false, // true cuando la sala está registrada en el servidor
    _timer: null,
    handlers: {}, // onStatus(text, ok), onData(msg), onConnected(), onDisconnected(), onError(text)

    _emit: function (name) {
      const fn = this.handlers[name];
      if (fn) fn.apply(null, Array.prototype.slice.call(arguments, 1));
    },

    _watchConn: function (conn) {
      const self = this;
      conn.on('open', function () {
        self.conn = conn;
        self._emit('onConnected');
      });
      conn.on('data', function (msg) { self._emit('onData', msg); });
      conn.on('close', function () {
        if (self.conn === conn) self.conn = null;
        self._emit('onDisconnected');
      });
      conn.on('error', function (err) { self._emit('onError', 'Error de conexión: ' + err.type); });
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
      this.peer = new Peer(PREFIX + this.code, peerOptions());
      this._keepAlive();
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
      this.peer = new Peer(undefined, peerOptions());
      this._keepAlive();
      this.peer.on('open', function () {
        self.ready = true;
        const conn = self.peer.connect(PREFIX + self.code, { reliable: true });
        self._watchConn(conn);
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
      clearTimeout(this._timer);
      this.ready = false;
      if (this.conn) { try { this.conn.close(); } catch (e) { /* nada */ } }
      if (this.peer) { try { this.peer.destroy(); } catch (e) { /* nada */ } }
      this.conn = null;
      this.peer = null;
    },
  };

  root.Net = Net;
})(this);
