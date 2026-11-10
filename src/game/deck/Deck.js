import { CARD_DEFINITIONS } from '../cards/cardDefinitions.js';
import { createCardInstance, setCardLocation } from '../cards/cardFactory.js';

export const ZONES = Object.freeze(['deck', 'playerHand', 'opponentHand', 'vira', 'table', 'discard']);
const HAND_ZONES = new Set(['playerHand', 'opponentHand']);

function destination(zone, ownerId) {
  if (!ZONES.includes(zone) || zone === 'deck') throw new RangeError(`Invalid destination: ${zone}`);
  if (ownerId !== null && (typeof ownerId !== 'string' || !ownerId)) throw new TypeError('Invalid owner ID');
  if (HAND_ZONES.has(zone) && ownerId === null) throw new TypeError('A hand needs an owner ID');
}

function shuffled(cards, rng) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new RangeError('RNG must return a number in [0, 1)');
    const j = Math.floor(random * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class Deck {
  #cards;
  #pile;

  constructor() {
    const cards = CARD_DEFINITIONS.map(definition => createCardInstance(definition.definitionId));
    this.#cards = new Map(cards.map(card => [card.instanceId, card]));
    this.#pile = cards;
  }

  get remaining() { return this.#pile.length; }
  get cards() { return [...this.#cards.values()]; }
  get drawPile() { return [...this.#pile]; }

  getCard(instanceId) {
    const card = this.#cards.get(instanceId);
    if (!card) throw new RangeError(`Unknown card: ${instanceId}`);
    return card;
  }

  cardsIn(zone, ownerId) {
    if (!ZONES.includes(zone)) throw new RangeError(`Unknown zone: ${zone}`);
    return this.cards.filter(card => card.runtime.zone === zone &&
      (ownerId === undefined || card.runtime.ownerId === ownerId));
  }

  shuffle(rng = Math.random) {
    this.#pile = shuffled(this.#pile, rng);
  }

  // Top = last element. Insufficient draws fail atomically, without reshuffling.
  draw(count = 1, { zone = 'discard', ownerId = null } = {}) {
    destination(zone, ownerId);
    if (!Number.isInteger(count) || count < 1) throw new RangeError('Draw count must be a positive integer');
    if (count > this.remaining) throw new RangeError('Not enough cards in draw pile');
    const result = [];
    for (let i = 0; i < count; i++) {
      const card = this.#pile.pop();
      setCardLocation(card, zone, ownerId);
      result.push(card);
    }
    return result;
  }

  // Returns false for stale/duplicate plays. Deck cards must leave through draw().
  move(instanceId, { from, to, ownerId = null, fromOwnerId } = {}) {
    destination(to, ownerId);
    const card = this.getCard(instanceId);
    if (card.runtime.zone !== from || from === 'deck' || from === to ||
      (fromOwnerId !== undefined && card.runtime.ownerId !== fromOwnerId)) return false;
    setCardLocation(card, to, ownerId);
    return true;
  }

  // Future rules opt in explicitly. Never sweeps cards still held by either player.
  collectAndShuffle({ zones = ['discard'], rng = Math.random } = {}) {
    if (!Array.isArray(zones) || zones.some(zone => !['table', 'discard', 'vira'].includes(zone))) {
      throw new RangeError('Only table, discard and vira cards may be collected');
    }
    const eligible = this.cards.filter(card => zones.includes(card.runtime.zone));
    const pile = shuffled([...this.#pile, ...eligible], rng);
    for (const card of eligible) setCardLocation(card, 'deck', null);
    this.#pile = pile;
    return eligible.length;
  }

  toJSON() {
    return { cards: this.cards, drawPile: this.#pile.map(card => card.instanceId) };
  }
}
