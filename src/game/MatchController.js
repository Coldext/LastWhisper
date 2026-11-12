import { Deck } from './deck/Deck.js';
import { compareCards, getManilhaRank } from './rules/CardStrength.js';

export const PLAYER_IDS = Object.freeze(['player', 'opponent']);
export const BET_VALUES = Object.freeze([1, 3, 6, 9, 12]);
export const MATCH_PHASES = Object.freeze({
  READY: 'ready',
  DEALING: 'dealing',
  AWAITING_PLAY: 'awaitingPlay',
  RESOLVING_TRICK: 'resolvingTrick',
  AWAITING_BET_RESPONSE: 'awaitingBetResponse',
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

function nextBet(value) {
  return BET_VALUES[BET_VALUES.indexOf(value) + 1] ?? null;
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
  #acceptedBet = 1;
  #pendingBet = null;
  #resumePlayerId = null;
  #lastProposerId = null;
  #bettingHistory = [];

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
  get acceptedBet() { return this.#acceptedBet; }
  get pendingBet() { return this.#pendingBet; }
  get resumePlayerId() { return this.#resumePlayerId; }
  get lastProposerId() { return this.#lastProposerId; }
  get nextRaiseValue() { return nextBet(this.#pendingBet?.value ?? this.#acceptedBet); }
  get bettingHistory() { return [...this.#bettingHistory]; }
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
    this.#acceptedBet = 1;
    this.#pendingBet = null;
    this.#resumePlayerId = null;
    this.#lastProposerId = null;
    this.#bettingHistory = [];
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

  // Raises are legal only before the active player's card, including a new
  // trick and the response to its first card. An accepted proposer cannot raise again.
  canRequestRaise(playerId, value = this.nextRaiseValue) {
    return this.#phase === MATCH_PHASES.AWAITING_PLAY && playerId === this.#activePlayerId &&
      playerId !== this.#lastProposerId && value !== null && value === this.nextRaiseValue;
  }

  canRespondToBet(playerId) {
    return this.#phase === MATCH_PHASES.AWAITING_BET_RESPONSE &&
      playerId === this.#pendingBet.responderId;
  }

  canCounterRaise(playerId, value = this.nextRaiseValue) {
    return this.canRespondToBet(playerId) && value !== null && value === this.nextRaiseValue;
  }

  #recordBet(type, playerId, value) {
    this.#bettingHistory.push(Object.freeze({
      type, playerId, value, acceptedValue: this.#acceptedBet,
      trickNumber: this.#tricks.length + 1, playedCards: this.#plays.length,
    }));
  }

  #propose(playerId, value) {
    this.#pendingBet = Object.freeze({
      proposerId: playerId, responderId: PLAYER_IDS.find(id => id !== playerId), value,
    });
    this.#lastProposerId = playerId;
  }

  requestRaise(playerId, value = this.nextRaiseValue) {
    if (!this.canRequestRaise(playerId, value)) return false;
    this.#resumePlayerId = this.#activePlayerId;
    this.#activePlayerId = null;
    this.#propose(playerId, value);
    this.#phase = MATCH_PHASES.AWAITING_BET_RESPONSE;
    this.#recordBet('raise', playerId, value);
    return true;
  }

  acceptBet(playerId) {
    if (!this.canRespondToBet(playerId)) return false;
    this.#acceptedBet = this.#pendingBet.value;
    this.#recordBet('accept', playerId, this.#acceptedBet);
    this.#pendingBet = null;
    this.#activePlayerId = this.#resumePlayerId;
    this.#resumePlayerId = null;
    this.#phase = MATCH_PHASES.AWAITING_PLAY;
    return true;
  }

  counterRaise(playerId, value = this.nextRaiseValue) {
    if (!this.canCounterRaise(playerId, value)) return false;
    // A counter-offer accepts the preceding offer before proposing the next step.
    this.#acceptedBet = this.#pendingBet.value;
    this.#propose(playerId, value);
    this.#recordBet('counterRaise', playerId, value);
    return true;
  }

  fold(playerId) {
    if (!this.canRespondToBet(playerId)) return false;
    const winnerId = this.#pendingBet.proposerId;
    this.#recordBet('fold', playerId, this.#pendingBet.value);
    this.#finishHand(winnerId, 'fold', playerId);
    return true;
  }

  #finishHand(winnerId, reason, foldedBy = null) {
    this.#handResults.push(Object.freeze({
      handNumber: this.#handNumber, winnerId, reason, foldedBy,
      acceptedValue: this.#acceptedBet, points: this.#acceptedBet,
      vira: cardIdentity(this.#vira),
      plays: Object.freeze(this.#plays.map(play => Object.freeze({
        playerId: play.playerId, ...cardIdentity(this.#deck.getCard(play.instanceId)),
      }))),
      trickWins: this.trickWins, tricks: Object.freeze([...this.#tricks]),
      bettingHistory: Object.freeze([...this.#bettingHistory]),
    }));
    this.#pendingBet = null;
    this.#resumePlayerId = null;
    this.#activePlayerId = null;
    this.#phase = MATCH_PHASES.HAND_COMPLETE;
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
      this.#finishHand(winnerId, 'tricks');
    } else {
      this.#activePlayerId = winnerId;
      this.#phase = MATCH_PHASES.AWAITING_PLAY;
    }
    return result;
  }
}
