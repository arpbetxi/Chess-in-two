// Servidor PeerJS local para las pruebas online (no hace falta internet).
// Uso: npm install (una vez, en esta carpeta) y luego: node peer-server.js
const { PeerServer } = require('peer');
PeerServer({ port: 9000, path: '/', host: '127.0.0.1' });
console.log('Servidor PeerJS de pruebas en 127.0.0.1:9000');
