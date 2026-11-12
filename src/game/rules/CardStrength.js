// Rule order is independent of the deck's definition/distribution order.
export const RANK_ORDER = Object.freeze(['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3']);
export const SUIT_ORDER = Object.freeze(['diamonds', 'spades', 'hearts', 'clubs']);

function validateCard(card, name) {
  if (card === null || typeof card !== 'object' || Array.isArray(card)) {
    throw new TypeError(`${name} must be a card object`);
  }
  if (typeof card.rank !== 'string' || typeof card.suit !== 'string') {
    throw new TypeError(`${name} must have string rank and suit`);
  }
  if (!RANK_ORDER.includes(card.rank)) throw new RangeError(`${name} has an unknown rank`);
  if (!SUIT_ORDER.includes(card.suit)) throw new RangeError(`${name} has an unknown suit`);
}

// Accepts definitions, instances or plain { rank, suit } data; never mutates them.
export function getManilhaRank(vira) {
  validateCard(vira, 'vira');
  return RANK_ORDER[(RANK_ORDER.indexOf(vira.rank) + 1) % RANK_ORDER.length];
}

export function isManilha(card, vira) {
  validateCard(card, 'card');
  return card.rank === getManilhaRank(vira);
}

function strength(card, manilhaRank) {
  const rank = card.rank === manilhaRank ? RANK_ORDER.length : RANK_ORDER.indexOf(card.rank);
  return rank * SUIT_ORDER.length + SUIT_ORDER.indexOf(card.suit);
}

// Contextual score: every manilha exceeds every ordinary card; suits break ties.
export function getCardStrength(card, vira) {
  validateCard(card, 'card');
  return strength(card, getManilhaRank(vira));
}

// Positive means first wins, negative means second wins, zero means equal faces.
export function compareCards(first, second, vira) {
  validateCard(first, 'first card');
  validateCard(second, 'second card');
  const manilhaRank = getManilhaRank(vira);
  const difference = strength(first, manilhaRank) - strength(second, manilhaRank);
  return difference === 0 ? 0 : difference > 0 ? 1 : -1;
}
