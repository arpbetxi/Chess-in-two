# Buzón de sugerencias

Las sugerencias del juego se guardan en una hoja de cálculo de Google y además llegan por correo con el asunto **"[Ajedrez con cartas] Nueva sugerencia"**. Son anónimas: no se guarda el nombre, el correo ni la IP de quien las envía.

## Instalación (una sola vez, unos 5 minutos)

1. Crea una hoja de cálculo nueva en [sheets.new](https://sheets.new) y ponle un nombre, por ejemplo "Sugerencias Ajedrez con cartas".
2. En el menú, ve a **Extensiones → Apps Script**.
3. Borra lo que haya en el editor y pega todo el contenido de [`Codigo.gs`](Codigo.gs). Guarda con el icono del disquete.
4. Arriba a la derecha, pulsa **Implementar → Nueva implementación**.
5. Pulsa el engranaje junto a "Seleccionar tipo" y elige **Aplicación web**. Configura:
   - **Ejecutar como:** Yo.
   - **Quién tiene acceso:** Cualquier usuario.
6. Pulsa **Implementar** y autoriza el acceso. Google avisará de que la aplicación no está verificada; es normal, porque el script es tuyo. Pulsa **Configuración avanzada → Ir a … (no seguro) → Permitir**.
7. De vuelta en el editor, elige la función **autorizar** en el desplegable de arriba y pulsa **▶ Ejecutar**. Si pide permisos, marca **todas** las casillas ("Seleccionar todo") y pulsa **Continuar**. En el registro debe salir "Permisos correctos".
8. Copia la **URL de la aplicación web**, que termina en `/exec`.
9. Pega esa URL en `config.js`, en `suggestionsUrl`.

## Revisar las sugerencias

- Abre la hoja de cálculo: cada sugerencia es una fila. La columna "Revisada" sirve para marcar las que ya has leído.
- Si cambias el código del script, vuelve a publicarlo en **Implementar → Gestionar implementaciones → editar → Nueva versión**, para que la URL siga siendo la misma.
