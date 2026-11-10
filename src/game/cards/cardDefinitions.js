export const SUITS = Object.freeze(['spades', 'hearts', 'diamonds', 'clubs']);
export const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);

export const CARD_DEFINITIONS = Object.freeze(SUITS.flatMap(suit =>
  RANKS.map(rank => Object.freeze({ definitionId: `${suit}-${rank}`, suit, rank }))
));

const definitionsById = new Map(CARD_DEFINITIONS.map(definition => [definition.definitionId, definition]));

export function getCardDefinition(definitionId) {
  const definition = definitionsById.get(definitionId);
  if (!definition) throw new RangeError(`Unknown card definition: ${definitionId}`);
  return definition;
}
