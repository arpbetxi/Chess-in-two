# In 2 Chess: guía para Claude

Juego web de ajedrez con cartas para jugar con amigos (online, contra el bot o en el mismo dispositivo).
Web estática en GitHub Pages: https://arpbetxi.github.io/Chess-in-two/ (repo `arpbetxi/Chess-in-two`, rama `main`).
El dueño es Alfred: escríbele en **español**, con respuestas cortas. No es programador profesional: explica los pasos que tenga que hacer él.

## Cómo trabajar (para gastar pocos tokens)
- Lee solo los archivos que vayas a tocar; `ui.js` es grande: busca con grep antes de leerlo entero.
- Pruebas: ejecuta solo las que afectan al cambio (ver tabla abajo). La batería completa (`tests/run_all.sh`) solo para cambios grandes o antes de cambios de reglas.
- No hagas capturas de pantalla salvo cambios visuales.
- Antes de diseñar interfaces nuevas, pregunta si quiere maquetas o que lo programes directamente.

## Archivos
| Archivo | Qué hace |
|---|---|
| `index.html` | Toda la estructura: selector de modo, pantalla de inicio (lobby), partida, ventanas (manual, reglas, cuenta, sugerencias). Orden de scripts importante. |
| `style.css` | Estilos. Al final hay bloques más nuevos que sobrescriben a los antiguos (nueva interfaz, cuentas). Móvil: `@media (max-width: 760px)`. |
| `engine.js` | Motor del modo **Destino** (`window.Engine`): tablero, movimientos, mazo de cartas, fases `draw/moves/convert/revive/over`. También utilidades comunes (`pieceMoves`, `newGame`, `playerName`, `squareName`). |
| `arsenal.js` | Definición de cartas y reglas del modo **Arsenal** (`window.Arsenal`). |
| `arsenal-engine.js` | Motor de Arsenal (`window.ArsenalEngine`): manos, efectos, Ruleta, Robo, Posesión, Ascenso y bot (`botAction`). Acciones vía `apply(state, action, player)`. |
| `bot.js` | Evaluación de posiciones y bot de Destino (`window.Bot`). |
| `net.js` | Online P2P con PeerJS. El anfitrión es la fuente de verdad: el invitado manda acciones y el anfitrión difunde `{t:'state'}`. |
| `config.js` | TURN de Metered y URL del buzón de sugerencias (Google Apps Script, ver `sugerencias/`). |
| `ui.js` | Toda la interfaz de partida (render, clics, animaciones de cartas, bot, online, marcador local). |
| `modes.js` | Selector de modo y pantalla de inicio (ficha del modo, pestañas Online/Bot/Local, botón Jugar). |
| `firebase-config.js`, `firebase-backend.js`, `cuentas.js` | Cuentas con Firebase (Auth + Firestore): inicio de sesión, estadísticas e historial. Si Firebase falla, el juego sigue sin cuentas. |
| `cards/` | SVG de las cartas (Destino en la raíz, Arsenal en `cards/arsenal/`). |
| `reglas/`, `PROXIMOS-PASOS.md` | Reglamento y lista de ideas pendientes (con prioridad). |
| `tests/` | Pruebas (ver abajo). |

## Modos (resumen de reglas)
- **Destino**: cada turno robas una carta y haces lo que dice (cartas de 1-3 movimientos, convertir, revivir, bloqueo...). Variante de fin de turno elegible (al amenazar al rey / al capturar).
- **Arsenal**: mano de hasta 3 cartas + Escudo inicial. Cada turno: primero, si quieres, **una carta**; después, **tu movimiento** (Apuesta es la única que quita el movimiento). Robas carta cada 3 turnos y al perder piezas (que no sean peones). Descartar da puntos; con 5 se asciende una pieza (peón → caballo/alfil → torre → dama). Se gana capturando el rey. Sin movimientos posibles = tablas.
- Cartas de Arsenal: comunes (Enroque, Apuesta, Ruleta, Trampa, Pedrolo), raras (Salto de caballo, Robo, Sed de sangre, Doble paso, Posesión), épicas (Congelar, Fantasma, Resurrección). Enroque deja inmóviles ese turno a las dos piezas intercambiadas; el Pedrolo es una pieza especial `type:'x'` en el tablero (nadie la cruza; solo se rompe inmolando una pieza que no sea peón ni rey). Dos repetidas se pueden combinar en una de rareza superior.

## Convenciones
- **Mesas de jugador**: cada jugador tiene una mesa fija (`#tblTop` / `#tblBottom`, `renderTable` en `ui.js`) a un lado del tablero en ordenador (arriba y abajo en móvil) con sus cartas (Arsenal) y sus piezas caídas. La mano propia (`#aOwn`, con `#aHand`) se coloca en la mesa de quien la ve; en local, la de quien juega; la otra mesa muestra solo dorsos.
- Todo el texto de la interfaz y los comentarios en español.
- **Caché**: al cambiar un `.js` o `.css`, sube el `?v=AAAAMMDDx` en `index.html` (todas las apariciones; p. ej. `sed -i 's/20261121b/20261121c/g' index.html`).
- No romper el online: todo cambio de estado de partida pasa por acciones que el anfitrión aplica (`applyAction`), nunca modificando `state` solo en un cliente.
- La información oculta (manos del rival) viaja en el estado; está oculta solo en la interfaz.
- Commits en español. Subir con `git -c push.negotiate=true push origin HEAD`. Commit/push solo cuando Alfred lo pida o al terminar una tarea que él ha pedido programar.

## Pruebas
Requisitos: node, python3 + playwright, Chrome. La primera vez: `cd tests && npm install` (servidor PeerJS local para pruebas online).
- `node tests/test.js` → motor de Destino. `node tests/arsenal_test.js` → motor de Arsenal (incluye cientos de partidas aleatorias). `node tests/arsenal_bot.js` → bot de Arsenal contra jugadas al azar.
- Navegador (añaden `?sincuentas` para no conectar con Firebase): `arsenal_ui.py` (cartas en la interfaz), `robo_ui.py` (Robo online), `posesion_ui.py`, `cuentas_ui.py` (cuentas con un Firebase simulado), `arsenal_botui.py`, `botui.py`, `manual.py`, `arsenal_online.py`, `online.py`.
- Las pruebas online necesitan `node tests/peer-server.js` y `python3 -m http.server 8000` en la raíz; `tests/run_all.sh` lo hace todo.
- Capturas en `/tmp` (o la carpeta de la variable `SHOTS`).

## Servicios externos (todos gratuitos)
- GitHub Pages (web), PeerJS + TURN de Metered (online), Google Apps Script (buzón de sugerencias → correos con etiqueta "In-2-Chess"), Firebase proyecto `in-2-chess` (cuentas; plan Spark gratuito; reglas: cada usuario solo lee/escribe `users/{uid}` y crea en `users/{uid}/games`).
