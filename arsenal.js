/*
 * In 2 Chess — modo Arsenal (en desarrollo)
 * ------------------------------------------
 * Definición de las cartas y de las reglas del modo Arsenal.
 * Por ahora se usa para mostrar el reglamento; la lógica del juego se añadirá más adelante.
 */
(function (root) {
  'use strict';

  const RARITIES = {
    inicial: { name: 'Inicial', points: 0 },
    comun: { name: 'Común', points: 1 },
    rara: { name: 'Rara', points: 2 },
    epica: { name: 'Épica', points: 3 },
  };

  // type: 'potenciadora' (se juega antes de mover y cambia tu movimiento)
  //       'accion'       (sustituye a tu movimiento)
  const CARDS = [
    {
      id: 'escudo', name: 'Escudo', rarity: 'inicial', type: 'accion', copies: 0,
      text: 'Una pieza tuya no puede ser capturada ni congelada durante el próximo turno rival. Cada jugador empieza con una; no está en el mazo.',
    },
    {
      id: 'salto', name: 'Salto de caballo', rarity: 'comun', type: 'potenciadora', copies: 5,
      text: 'Este turno, una de tus piezas (no el rey) puede moverse además como un caballo.',
    },
    {
      id: 'enroque', name: 'Enroque', rarity: 'comun', type: 'accion', copies: 5,
      text: 'Dos piezas tuyas intercambian sus casillas.',
    },
    {
      id: 'apuesta', name: 'Apuesta', rarity: 'comun', type: 'accion', copies: 4,
      text: 'Robas 2 cartas, pero pierdes tu movimiento.',
    },
    {
      id: 'ruleta', name: 'Ruleta', rarity: 'comun', type: 'accion', copies: 5,
      text: 'Gira la ruleta (−5, −3, −3, −1, +1, +3, +5, +7). Si sale positivo, eliminas piezas rivales cuyo valor sume como máximo ese número; si sale negativo, piezas tuyas. Eliges tú cuáles y el rey nunca cuenta.',
    },
    {
      id: 'trampa', name: 'Trampa', rarity: 'comun', type: 'accion', copies: 5,
      text: 'Colocas una trampa en una casilla vacía. Nadie la ve, ni siquiera tú: la primera pieza que la pise, sea de quien sea, queda eliminada. El rey es inmune.',
    },
    {
      id: 'fantasma', name: 'Fantasma', rarity: 'rara', type: 'potenciadora', copies: 4,
      text: 'Este turno, tus piezas pueden atravesar peones de cualquier color (pero no terminar encima de uno salvo para capturarlo).',
    },
    {
      id: 'congelar', name: 'Congelar', rarity: 'rara', type: 'accion', copies: 4,
      text: 'Eliges una zona de 3×3: ninguna pieza de esa zona puede moverse durante el próximo turno. El rey es inmune.',
    },
    {
      id: 'robo', name: 'Robo', rarity: 'rara', type: 'accion', copies: 4,
      text: 'Le quitas al rival una carta al azar de su mano.',
    },
    {
      id: 'doblepaso', name: 'Doble paso', rarity: 'epica', type: 'potenciadora', copies: 4,
      text: 'Haces dos movimientos este turno; el segundo no puede ser una captura.',
    },
  ];

  const RULES = {
    handLimit: 3,
    drawEveryTurns: 3,
    startingHand: 2,
    ascensionPoints: 5,
    ruleta: [-5, -3, -3, -1, 1, 3, 5, 7],
    ascensionPath: 'Peón → caballo o alfil → torre → dama',
  };

  root.Arsenal = { RARITIES: RARITIES, CARDS: CARDS, RULES: RULES };
})(this);
