/*
 * Configuración del modo online
 * -----------------------------
 * Servidor TURN de Metered (Open Relay, gratuito: 20 GB/mes; una partida gasta muy poco).
 * Hace de puente cuando la red no permite la conexión directa entre los dos navegadores
 * (pasa a menudo con datos móviles o wifis de universidad).
 *
 * 1. Crea una cuenta gratis en https://dashboard.metered.ca/signup
 * 2. En el apartado de TURN Server, crea una credencial y copia su usuario (Username)
 *    y contraseña (Password).
 * 3. Pégalos aquí abajo entre las comillas.
 *
 * Si los dejas vacíos, el juego usa los servidores por defecto de PeerJS.
 * Nota: este archivo es público en GitHub. En el peor caso, alguien podría gastar tu cuota gratuita.
 */
window.AJEDREZ_CONFIG = {
  // Opción 1 (la que usamos): usuario y contraseña de una credencial TURN de Metered
  turnUsername: '9e823dab2a33b1d20856b230',
  turnCredential: 'nigaNLZAkgtcyKYt',

  // Opción 2 (alternativa): nombre de la app (lo que va antes de ".metered.live") y API key
  meteredApp: '',
  meteredApiKey: '',
};
