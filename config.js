/*
 * Configuración del modo online
 * -----------------------------
 * Servidor TURN de Metered (Open Relay, gratuito: 20 GB/mes; una partida gasta muy poco).
 * Hace de puente cuando la red no permite la conexión directa entre los dos navegadores
 * (pasa a menudo con datos móviles o wifis de universidad).
 *
 * 1. Crea una cuenta gratis en https://dashboard.metered.ca/signup
 * 2. En el apartado de TURN Server, copia el nombre de tu app (lo que va antes de ".metered.live")
 *    y la API key de una credencial.
 * 3. Pégalos aquí abajo entre las comillas.
 *
 * Si los dejas vacíos, el juego usa los servidores por defecto de PeerJS.
 * Nota: este archivo es público en GitHub. En el peor caso, alguien podría gastar tu cuota gratuita.
 */
window.AJEDREZ_CONFIG = {
  meteredApp: '',     // por ejemplo: 'ajedrezcartas'
  meteredApiKey: '',  // por ejemplo: 'a1b2c3d4e5...'
};
