# Reglamento v1: "La captura termina el turno"

Versión guardada el 15 de noviembre de 2026, antes de cambiar la regla de capturas. Sigue programada en el juego como el conjunto de reglas **`original`** (`engine.js`, `RULESETS`), aunque ahora mismo no se puede elegir desde el menú.

**Diferencia con la versión actual:** en esta versión, una captura termina el turno aunque queden movimientos, y amenazar al rey rival no tiene ningún efecto especial.

## Resumen y objetivo

Se juega con las piezas y movimientos del ajedrez normal, pero cada turno empieza robando una carta que decide cuántos movimientos haces o qué efecto especial aplicas.

- **Jugadores:** 2, uno con blancas y otro con negras. Los colores pueden intercambiarse durante la partida (carta Cambio de sentido).
- **Cómo se gana:** capturando el rey rival. No existe el jaque mate.
- **Empieza:** blancas, como en el ajedrez normal.

## Desarrollo del turno

1. El jugador roba la carta superior del mazo.
2. Si es una carta de número, hace exactamente ese número de movimientos seguidos. Puede mover la misma pieza varias veces. **Si un movimiento captura una pieza, el turno termina aunque queden movimientos.**
3. Si es una carta especial, aplica su efecto y su turno termina. No hace ningún movimiento.
4. La carta va al descarte. Cuando el mazo se acaba, se baraja el descarte y se forma un mazo nuevo.
5. Si en cualquier momento del turno se captura un rey, la partida termina al instante.

Es obligatorio hacer todos los movimientos de la carta, salvo que una captura termine el turno antes. Si en algún momento del turno ninguna pieza puede moverse, la partida termina en tablas por ahogado.

## Cartas y efectos

| Carta | Tipo | Efecto |
| --- | --- | --- |
| 1, 2, 3 | Número | Haces ese número de movimientos seguidos. Una captura termina el turno. |
| Bloqueo | Especial | Pierdes el turno. |
| Cambio de color | Especial | Eliges 1 pieza rival (no el rey) y pasa a tu bando. |
| +2 | Especial | Revives hasta 2 piezas capturadas de tu color actual y las colocas en casillas vacías de tu mitad del tablero (tus cuatro primeras filas). |
| +4 Ruleta | Especial | 4 piezas rivales elegidas al azar (nunca el rey) pasan a tu bando. Si el rival tiene menos, se convierten las que tenga. |
| Cambio de sentido | Especial | Se gira el tablero: cada jugador pasa a llevar el otro color, con sus piezas y piezas capturadas. |

- Los peones revividos no pueden colocarse en la primera ni en la última fila.
- Una pieza convertida conserva su posición. Un peón convertido pasa a avanzar en la dirección de su nuevo bando.

## Reglas de ajedrez modificadas

Se mantienen todos los movimientos normales y las reglas especiales; solo desaparece el jaque.

- **Sin jaque:** puedes mover el rey a una casilla atacada o dejarlo expuesto. Si el rival lo captura, pierdes.
- **Enroque:** se mantiene con las condiciones normales (rey y torre sin mover, casillas intermedias vacías). Como no hay jaque, se puede enrocar estando atacado o pasando por casillas atacadas. Las piezas convertidas o revividas cuentan como ya movidas.
- **Coronación:** un peón que llega a la última fila corona al instante, aunque queden movimientos en el turno.
- **Captura al paso:** solo vale en el primer movimiento del rival justo después del avance doble del peón. Si ese peón avanza dos casillas en mitad de un turno y luego el mismo jugador sigue moviendo, el derecho se mantiene hasta el primer movimiento del rival.
- **Ahogado:** si a un jugador le queda algún movimiento por hacer y ninguna de sus piezas puede moverse, la partida termina en tablas.

## Composición del mazo (60 cartas)

| Carta | Copias | % del mazo |
| --- | --- | --- |
| 1 | 30 | 50 % |
| 2 | 12 | 20 % |
| 3 | 4 | 7 % |
| Bloqueo | 4 | 7 % |
| Cambio de color | 4 | 7 % |
| +2 | 3 | 5 % |
| Cambio de sentido | 2 | 3 % |
| +4 Ruleta | 1 | 2 % |
| **Total** | **60** | **100 %** |

Las cartas no tienen color: a diferencia del UNO, el color no afecta al juego.
