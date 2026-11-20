# In 2 Chess

Variante de ajedrez en la que cada turno se roba una carta que decide cuántos movimientos haces o qué efecto especial se aplica.

## Archivos

- `PROXIMOS-PASOS.md`: ideas pendientes para las próximas versiones.

- `index.html`: la página.
- `style.css`: el aspecto.
- `engine.js`: todas las reglas. `DECK_SPEC`, al principio del archivo, define la composición del mazo.
- `ui.js`: el tablero, los clics y el menú.
- `modes.js`: la pantalla inicial para elegir el modo (Destino o Arsenal) y el reglamento de Arsenal.
- `arsenal.js`: las cartas y reglas del modo Arsenal.
- `arsenal-engine.js`: el motor del modo Arsenal (manos, efectos de las cartas, ruleta, Ascenso y bot).
- `net.js`: la conexión online entre dos navegadores.
- `bot.js`: el bot para jugar en solitario (dificultad Fácil o Normal).
- `config.js`: claves opcionales del servidor TURN (ver abajo).
- `reglas/`: versiones anteriores del reglamento (la v1, "la captura termina el turno", se puede elegir en el menú como variante).
- `cards/arsenal/`: ilustraciones provisionales de las cartas del modo Arsenal.
- `cards/`: ilustraciones de las cartas especiales (provisionales; ver `cards/LEEME.md` para sustituirlas).
- `lib/peerjs.min.js`: la librería PeerJS (licencia MIT, en `lib/peerjs-LICENSE`).

## Jugar

- **Contra el bot:** elige "Jugar contra el bot" y la dificultad.
- **En el mismo ordenador:** abre `index.html` y elige "Jugar en este ordenador".
- **Online:** publica la carpeta (por ejemplo, en GitHub Pages). Uno pulsa "Crear partida online" y comparte el código de 6 letras; el otro lo escribe y pulsa "Unirse".

## Notas sobre el modo online

- El navegador de quien crea la sala guarda la partida y aplica las reglas, así que no debe cerrar la pestaña.
- Si se cierra por error, al volver a pulsar "Crear partida online" se ofrece continuar la partida guardada. Si el código anterior ya no está disponible, se genera uno nuevo.
- El navegador del rival se puede recargar sin problema: vuelve a unirse con el mismo código.
- Si al unirse se queda en "Conectando con la sala…", la red está bloqueando la conexión directa. Configura el servidor TURN gratuito de Metered en `config.js` (las instrucciones están dentro del archivo).
