import { Deck } from './deck/Deck.js';
import { getManilhaRank } from './rules/CardStrength.js';

export const PLAYER_IDS = Object.freeze(['player', 'opponent']);
export const MATCH_PHASES = Object.freeze({
  READY: 'ready',
  DEALING: 'dealing',
  AWAITING_PLAY: 'awaitingPlay',
  RESOLVING_TRICK: 'resolvingTrick',
  AWAITING_BET_RESPONSE: 'awaitingBetResponse', // Reserved for the betting package.
  HAND_COMPLETE: 'handComplete',
  MATCH_COMPLETE: 'matchComplete', // Reserved for the scoring package.
});
const handZones = Object.freeze({ player: 'playerHand', opponent: 'opponentHand' });

function validatePlayer(playerId) {
  if (!PLAYER_IDS.includes(playerId)) throw new RangeError('Unknown player');
}

// Authoritative logical state only. No rendering, scoring or trick resolution.
export class MatchController {
  #deck;
  #phase = MATCH_PHASES.READY;
  #handNumber = 0;
  #initialFirstPlayerId;
  #firstPlayerId = null;
  #activePlayerId = null;
  #vira = null;
  #plays = [];
  #dealtTo = new Map();

  constructor({ rng = Math.random, firstPlayerId = 'player', deck = new Deck() } = {}) {
    validatePlayer(firstPlayerId);
    if (typeof rng !== 'function') throw new TypeError('RNG must be a function');
    if (!(deck instanceof Deck)) throw new TypeError('Expected a Deck');
    if (deck.cards.some(card => !['deck', 'discard'].includes(card.runtime.zone))) {
      throw new RangeError('Deck already contains an active hand');
    }
    deck.shuffle(rng);
    this.#deck = deck;
    this.#initialFirstPlayerId = firstPlayerId;
  }

  get deck() { return this.#deck; }
  get phase() { return this.#phase; }
  get handNumber() { return this.#handNumber; }
  get firstPlayerId() { return this.#firstPlayerId; }
  get activePlayerId() { return this.#activePlayerId; }
  get vira() { return this.#vira; }
  get manilhaRank() { return this.#vira ? getManilhaRank(this.#vira) : null; }
  get plays() { return [...this.#plays]; }

  handOf(playerId) {
    validatePlayer(playerId);
    return this.#deck.cardsIn(handZones[playerId], playerId);
  }

  #requirePhase(...allowed) {
    if (!allowed.includes(this.#phase)) throw new Error(`Action unavailable in phase ${this.#phase}`);
  }

  #requireCards() {
    if (this.#deck.remaining < 7) throw new RangeError('Not enough cards for a new hand');
  }

  // Preparation boundary remains separate from dealing for future pre-deal rules.
  startHand() {
    this.#requirePhase(MATCH_PHASES.READY, MATCH_PHASES.HAND_COMPLETE);
    this.#requireCards();
    this.#phase = MATCH_PHASES.DEALING;
  }

  deal() {
    this.#requirePhase(MATCH_PHASES.DEALING);
    this.#requireCards(); // Check again before collecting or drawing anything.
    for (const card of this.#deck.cards) {
      if (['playerHand', 'opponentHand', 'table', 'vira'].includes(card.runtime.zone)) {
        this.#deck.move(card.instanceId, { from: card.runtime.zone, to: 'discard' });
      }
    }
    const first = this.#handNumber % 2 === 0
      ? this.#initialFirstPlayerId : PLAYER_IDS.find(id => id !== this.#initialFirstPlayerId);
    const order = [first, PLAYER_IDS.find(id => id !== first)];
    this.#dealtTo = new Map();
    for (let round = 0; round < 3; round++) {
      for (const playerId of order) {
        const [card] = this.#deck.draw(1, { zone: handZones[playerId], ownerId: playerId });
        this.#dealtTo.set(card.instanceId, playerId);
      }
    }
    [this.#vira] = this.#deck.draw(1, { zone: 'vira' });
    this.#plays = [];
    this.#handNumber++;
    this.#firstPlayerId = first;
    this.#activePlayerId = first;
    this.#phase = MATCH_PHASES.AWAITING_PLAY;
  }

  canPlay(playerId, instanceId) {
    if (this.#phase !== MATCH_PHASES.AWAITING_PLAY || playerId !== this.#activePlayerId ||
        typeof instanceId !== 'string' || this.#dealtTo.get(instanceId) !== playerId ||
        this.#plays.some(play => play.instanceId === instanceId)) return false;
    const card = this.#deck.getCard(instanceId);
    return card.runtime.zone === handZones[playerId] && card.runtime.ownerId === playerId;
  }

  // Invalid/stale gameplay actions return false without changing any state.
  play(playerId, instanceId) {
    if (!this.canPlay(playerId, instanceId)) return false;
    if (!this.#deck.move(instanceId, {
      from: handZones[playerId], fromOwnerId: playerId, to: 'table', ownerId: playerId,
    })) return false;
    this.#plays.push(Object.freeze({ playerId, instanceId }));
    if (this.#plays.length === 2) {
      this.#activePlayerId = null;
      this.#phase = MATCH_PHASES.RESOLVING_TRICK;
    } else {
      this.#activePlayerId = PLAYER_IDS.find(id => id !== playerId);
    }
    return true;
  }

  // Lifecycle boundary for the future rules coordinator, not a player action.
  // Caller must determine hand completion; this method awards nothing.
  completeHand() {
    this.#requirePhase(MATCH_PHASES.RESOLVING_TRICK);
    this.#activePlayerId = null;
    this.#phase = MATCH_PHASES.HAND_COMPLETE;
  }
}
