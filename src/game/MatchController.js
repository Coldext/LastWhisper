import { Deck } from './deck/Deck.js';
import { compareCards, getManilhaRank } from './rules/CardStrength.js';

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

function cardIdentity(card) {
  return Object.freeze({
    instanceId: card.instanceId, definitionId: card.definitionId, rank: card.rank, suit: card.suit,
  });
}

// Authoritative logical state only. No rendering or match scoring.
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
  #usedCardIds = new Set();
  #tricks = [];
  #handResults = [];

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
  get tricks() { return [...this.#tricks]; }
  get handResults() { return [...this.#handResults]; }
  get handResult() {
    const last = this.#handResults.at(-1);
    return last?.handNumber === this.#handNumber ? last : null;
  }
  get handWinnerId() { return this.handResult?.winnerId ?? null; }
  get trickWins() {
    const wins = { player: 0, opponent: 0 };
    for (const trick of this.#tricks) wins[trick.winnerId]++;
    return Object.freeze(wins);
  }

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
    this.#usedCardIds = new Set();
    this.#tricks = [];
    this.#handNumber++;
    this.#firstPlayerId = first;
    this.#activePlayerId = first;
    this.#phase = MATCH_PHASES.AWAITING_PLAY;
  }

  canPlay(playerId, instanceId) {
    if (this.#phase !== MATCH_PHASES.AWAITING_PLAY || playerId !== this.#activePlayerId ||
        typeof instanceId !== 'string' || this.#dealtTo.get(instanceId) !== playerId ||
        this.#usedCardIds.has(instanceId)) return false;
    const card = this.#deck.getCard(instanceId);
    return card.runtime.zone === handZones[playerId] && card.runtime.ownerId === playerId;
  }

  // Invalid/stale gameplay actions return false without changing any state.
  play(playerId, instanceId) {
    if (!this.canPlay(playerId, instanceId)) return false;
    if (!this.#deck.move(instanceId, {
      from: handZones[playerId], fromOwnerId: playerId, to: 'table', ownerId: playerId,
    })) return false;
    this.#usedCardIds.add(instanceId);
    this.#plays.push(Object.freeze({ playerId, instanceId }));
    if (this.#plays.length === 2) {
      this.#activePlayerId = null;
      this.#phase = MATCH_PHASES.RESOLVING_TRICK;
    } else {
      this.#activePlayerId = PLAYER_IDS.find(id => id !== playerId);
    }
    return true;
  }

  // Explicit boundary lets a future presenter display both cards before resolving.
  resolveTrick() {
    this.#requirePhase(MATCH_PHASES.RESOLVING_TRICK);
    const cards = this.#plays.map(play => this.#deck.getCard(play.instanceId));
    if (this.#plays.length !== 2 || this.#plays[0].playerId === this.#plays[1].playerId ||
        this.#vira.runtime.zone !== 'vira' || this.#vira.runtime.ownerId !== null ||
        cards.some((card, index) => card.runtime.zone !== 'table' ||
          card.runtime.ownerId !== this.#plays[index].playerId)) {
      throw new Error('Inconsistent trick card locations');
    }
    const comparison = compareCards(cards[0], cards[1], this.#vira);
    if (comparison === 0) throw new Error('Distinct deck cards must not tie');
    const winnerId = this.#plays[comparison > 0 ? 0 : 1].playerId;
    const result = Object.freeze({
      handNumber: this.#handNumber,
      trickNumber: this.#tricks.length + 1,
      vira: cardIdentity(this.#vira),
      plays: Object.freeze(this.#plays.map((play, index) => Object.freeze({
        playerId: play.playerId, ...cardIdentity(cards[index]),
      }))),
      winnerId,
    });
    this.#tricks.push(result);
    this.#plays = [];
    if (this.trickWins[winnerId] === 2) {
      this.#handResults.push(Object.freeze({
        handNumber: this.#handNumber, winnerId,
        trickWins: this.trickWins, tricks: Object.freeze([...this.#tricks]),
      }));
      this.#activePlayerId = null;
      this.#phase = MATCH_PHASES.HAND_COMPLETE;
    } else {
      this.#activePlayerId = winnerId;
      this.#phase = MATCH_PHASES.AWAITING_PLAY;
    }
    return result;
  }
}
