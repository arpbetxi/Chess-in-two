# Próximos pasos

Ideas anotadas en noviembre de 2026 para retomarlas más adelante, sin fecha. Están ordenadas por prioridad: primero lo que se apoya directamente en el juego actual y es más pequeño, y al final lo que necesita más infraestructura. El orden se puede cambiar cuando se quiera.

| Prioridad | Idea | Esfuerzo | Depende de |
| --- | --- | --- | --- |
| 1 · Alta | Separar el modo actual en Clásica y Caótica | Bajo | — |
| 2 · Alta | Nuevo modo: cartas en la mano | Medio | — |
| 3 · Media | Web con varios juegos | Medio | — |
| 4 · Baja | Casino social con ranking | Alto | 3 |

## 1. Separar el modo actual en dos categorías (prioridad alta)
- **Clásica:** las cartas inspiradas en el UNO, como ahora.
- **Caótica:** nuevas cartas y variantes que se vayan ocurriendo o que lleguen por el buzón de sugerencias. Por ejemplo: **ascender una pieza propia a un nivel superior**.
- Es lo más rápido: se apoya en el mazo y el selector de variantes que ya existen.

## 2. Nuevo modo: cartas en la mano (prioridad alta)
- En lugar de robar una carta cada turno, se roban cartas **de vez en cuando**. La mecánica exacta está por definir.
- Las cartas se guardan **en la mano** y el jugador decide cuándo usarlas.
- Serían cartas distintas, con efectos especiales que potencian el juego. Por ejemplo: **atravesar peones**.

## 3. Web con varios juegos (prioridad media)
- Una web donde se pueda entrar a jugar distintos juegos que se vayan ocurriendo. "Ajedrez con cartas" sería el primero.
- Conviene montarla antes del casino, porque el casino viviría dentro de ella y compartiría las cuentas de usuario.

## 4. Casino social con ranking (prioridad baja)
- Juegos típicos de casino **sin dinero real**, con fichas ficticias y un **ranking permanente** de las fichas de cada jugador.
- **Arquitectura prevista:**
  - **Web estática:** GitHub Pages o Cloudflare Pages.
  - **Supabase:** base de datos, inicio de sesión con Google o enlace al correo, y funciones de servidor.
  - **Toda la lógica de los juegos en el servidor:** tiradas aleatorias y cambios de saldo. El navegador solo muestra.
  - **Reglas de acceso:** cada jugador lee su saldo y el ranking, pero no puede modificarlos.
  - **Antitrampas:** límite de jugadas por minuto y verificación del correo.
- **Fichas si te quedas a cero:** empezar con un **bono diario** gratuito. Más adelante, opcionalmente, **anuncios** (pasivos y con recompensa), que requieren un aviso de cookies y revisar las políticas de las redes de anuncios sobre casino simulado.
- **Límites legales:** las fichas no pueden tener valor fuera de la web.
  - No se venden fichas.
  - No hay transferencias entre jugadores.
  - No hay premios reales por el ranking.
  - Recomendado: solo para mayores de 18 años.
- **Coste:** 0 € para empezar (plan gratuito de Supabase, que se pausa tras 7 días sin actividad). Opcionalmente, un dominio por unos 10-15 € al año. Si crece, el plan Pro de Supabase cuesta 25 $ al mes.
