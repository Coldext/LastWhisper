import { getCardDefinition } from './cardDefinitions.js';

const locations = new WeakMap();
let nextInstanceId = 1;

export function createCardInstance(definitionId) {
  const definition = getCardDefinition(definitionId);
  const instanceId = `card-${nextInstanceId++}-${definitionId}`;
  const card = { enchantment: null, modifiers: Object.freeze([]) };
  for (const [key, value] of Object.entries({ instanceId, ...definition })) {
    Object.defineProperty(card, key, { value, enumerable: true });
  }
  locations.set(card, Object.freeze({ zone: 'deck', ownerId: null }));
  Object.defineProperty(card, 'runtime', { enumerable: true, get: () => locations.get(card) });
  return Object.seal(card);
}

// Internal location writer for Deck. UI and callers must use Deck's transition API.
export function setCardLocation(card, zone, ownerId) {
  if (!locations.has(card)) throw new TypeError('Unknown card instance');
  locations.set(card, Object.freeze({ zone, ownerId }));
}
