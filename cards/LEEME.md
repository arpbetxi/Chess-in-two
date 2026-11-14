# Ilustraciones de las cartas

Los dibujos de esta carpeta son provisionales. Para cambiar uno, basta con sustituir el archivo por otro con **el mismo nombre**.

| Archivo | Carta | Qué hace |
| --- | --- | --- |
| `bloqueo.svg` | Bloqueo | Pierdes el turno. |
| `color.svg` | Cambio de color | Eliges 1 pieza rival (no el rey) y pasa a tu bando. |
| `mas2.svg` | +2 | Revives hasta 2 piezas capturadas en tu mitad del tablero. |
| `mas4.svg` | +4 Ruleta | 4 piezas rivales al azar (nunca el rey) pasan a tu bando. |
| `sentido.svg` | Cambio de sentido | Se gira el tablero: los jugadores intercambian colores. |

## Formato recomendado

- **Formato:** SVG (vectorial, se ve nítido a cualquier tamaño) o PNG.
- **Tamaño:** cuadrado. Si es PNG, al menos 512 × 512 px.
- **Fondo:** transparente. El color de fondo lo pone la propia carta:
  - Bloqueo: rojo.
  - Cambio de color: morado.
  - +2: verde.
  - +4 Ruleta: gris oscuro.
  - Cambio de sentido: naranja.
- **Margen:** deja un pequeño margen alrededor del dibujo.
- **Tamaño en pantalla:** se ve a unos 64 px dentro de la carta y algo más grande en el manual, así que conviene que se entienda también en pequeño.

## Si usas PNG

Si el archivo es PNG (por ejemplo, `bloqueo.png`), cambia la extensión en `CARD_ART`, al principio de `ui.js`.
