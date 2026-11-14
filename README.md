# Ajedrez con cartas

Variante de ajedrez en la que cada turno se roba una carta que decide cuántos movimientos haces o qué efecto especial se aplica.

## Archivos

- `index.html`: la página.
- `style.css`: el aspecto.
- `engine.js`: todas las reglas. `DECK_SPEC`, al principio del archivo, define la composición del mazo.
- `ui.js`: el tablero, los clics y el menú.
- `net.js`: la conexión online entre dos navegadores.
- `config.js`: claves opcionales del servidor TURN (ver abajo).
- `lib/peerjs.min.js`: la librería PeerJS (licencia MIT, en `lib/peerjs-LICENSE`).

## Jugar

- **En el mismo ordenador:** abre `index.html` y elige "Jugar en este ordenador".
- **Online:** publica la carpeta (por ejemplo, en GitHub Pages). Uno pulsa "Crear partida online" y comparte el código de 6 letras; el otro lo escribe y pulsa "Unirse".

## Notas sobre el modo online

- El navegador de quien crea la sala guarda la partida y aplica las reglas, así que no debe cerrar la pestaña.
- Si se cierra por error, al volver a pulsar "Crear partida online" se ofrece continuar la partida guardada. Si el código anterior ya no está disponible, se genera uno nuevo.
- El navegador del rival se puede recargar sin problema: vuelve a unirse con el mismo código.
- Si al unirse se queda en "Conectando con la sala…", la red está bloqueando la conexión directa. Configura el servidor TURN gratuito de Metered en `config.js` (las instrucciones están dentro del archivo).
