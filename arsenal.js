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

  // type: 'potenciadora' (se juega antes de mover y no te quita el movimiento)
  //       'accion'       (se juega antes de mover; después mueves igual, salvo Apuesta)
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
      id: 'robo', name: 'Robo', rarity: 'rara', type: 'accion', copies: 4,
      text: 'Eliges una de las cartas del rival, boca abajo, y te la quedas. Él ve sobre cuál pasa tu cursor.',
    },
    {
      id: 'sed', name: 'Sed de sangre', rarity: 'rara', type: 'potenciadora', copies: 4,
      text: 'Durante el próximo turno del rival, si alguna de sus piezas puede capturar, está obligado a capturar (elige con cuál). Tampoco puede usar una carta de acción para evitarlo.',
    },
    {
      id: 'congelar', name: 'Congelar', rarity: 'epica', type: 'accion', copies: 1,
      text: 'Eliges una zona de 3×3: ninguna pieza de esa zona puede moverse durante el próximo turno. El rey es inmune.',
    },
    {
      id: 'doblepaso', name: 'Doble paso', rarity: 'epica', type: 'potenciadora', copies: 2,
      text: 'Haces dos movimientos este turno. El segundo también puede capturar, pero nunca al rey.',
    },
    {
      id: 'posesion', name: 'Posesión demoníaca', rarity: 'epica', type: 'accion', copies: 1,
      text: 'Eliges una pieza rival (no el rey) y durante este turno la controlas tú: en tu movimiento puedes moverla como si fuera tuya, incluso capturando piezas de su propio bando (nunca al rey). Sigue siendo del rival.',
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
