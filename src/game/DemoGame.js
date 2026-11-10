import { Deck } from './deck/Deck.js';

export const PLAYER_ID = 'player';
export const OPPONENT_ID = 'opponent';

// Prototype orchestration only: no turn rules, strength, scoring or effect resolution.
export class DemoGame {
  constructor({ rng = Math.random } = {}) {
    this.deck = new Deck();
    this.deck.shuffle(rng);
    this.handNumber = 0;
    this.newHand();
  }

  get playerHand() { return this.deck.cardsIn('playerHand', PLAYER_ID); }
  get opponentHand() { return this.deck.cardsIn('opponentHand', OPPONENT_ID); }
  get vira() { return this.deck.cardsIn('vira')[0] ?? null; }
  get table() { return this.deck.cardsIn('table'); }

  canPlay(instanceId) {
    const card = this.deck.getCard(instanceId);
    return card.runtime.zone === 'playerHand' && card.runtime.ownerId === PLAYER_ID;
  }

  play(instanceId) {
    return this.deck.move(instanceId, { from: 'playerHand', fromOwnerId: PLAYER_ID, to: 'table', ownerId: PLAYER_ID });
  }

  newHand() {
    // Check before discarding the previous hand, so an exhausted pile changes nothing.
    if (this.deck.remaining < 7) throw new RangeError('Not enough cards for a new hand');
    for (const card of this.deck.cards) {
      if (['playerHand', 'opponentHand', 'table', 'vira'].includes(card.runtime.zone)) {
        this.deck.move(card.instanceId, { from: card.runtime.zone, to: 'discard' });
      }
    }
    this.deck.draw(3, { zone: 'playerHand', ownerId: PLAYER_ID });
    this.deck.draw(3, { zone: 'opponentHand', ownerId: OPPONENT_ID });
    this.deck.draw(1, { zone: 'vira' });
    this.handNumber++;
  }
}
