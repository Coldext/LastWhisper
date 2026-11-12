import test from 'node:test';
import assert from 'node:assert/strict';
import { BET_VALUES, MatchController, MATCH_PHASES, MATCH_TARGET, PLAYER_IDS } from '../src/game/MatchController.js';
import { Deck, ZONES } from '../src/game/deck/Deck.js';
import { createMatchObservation } from '../src/game/ai/matchObservation.js';
import { createTrucoAI } from '../src/game/ai/BettingAI.js';
import { addModifier, setEnchantment } from '../src/game/cards/cardModifiers.js';

const other = id => PLAYER_IDS.find(player => player !== id);
const ended = match => [MATCH_PHASES.HAND_COMPLETE, MATCH_PHASES.MATCH_COMPLETE].includes(match.phase);

function dealt(options = {}) {
  const match = new MatchController({ rng: () => 0, ...options });
  match.startHand(); match.deal();
  return match;
}

function playOne(match) {
  const id = match.activePlayerId;
  assert.equal(match.play(id, match.handOf(id)[0].instanceId), true);
}

function finish(match) {
  while (!ended(match)) {
    if (match.phase === MATCH_PHASES.RESOLVING_TRICK) match.resolveTrick();
    else playOne(match);
  }
}

function awardByFold(match, winner, points = 1) {
  const steps = BET_VALUES.indexOf(points) + 1;
  const first = steps % 2 ? winner : other(winner);
  if (match.activePlayerId !== first) playOne(match);
  assert.equal(match.requestRaise(first), true);
  for (let i = 1; i < steps; i++) assert.equal(match.counterRaise(match.pendingBet.responderId), true);
  assert.equal(match.pendingBet.proposerId, winner);
  assert.equal(match.acceptedBet, points);
  assert.equal(match.fold(other(winner)), true);
}

function state(match) {
  return JSON.stringify({ deck: match.deck, phase: match.phase, score: match.score,
    handNumber: match.handNumber, first: match.firstPlayerId, active: match.activePlayerId,
    accepted: match.acceptedBet, pending: match.pendingBet, resume: match.resumePlayerId,
    history: match.bettingHistory, plays: match.plays, tricks: match.tricks,
    results: match.handResults, matchResult: match.matchResult, epoch: match.deckEpoch, events: match.events });
}

function partition(match) {
  const cards = ZONES.flatMap(zone => match.deck.cardsIn(zone));
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map(card => card.instanceId)).size, 52);
  assert.deepEqual(new Set(match.deck.drawPile), new Set(match.deck.cardsIn('deck')));
}

test('trick victories credit the accepted stake once at every level, including an unraised hand', () => {
  assert.equal(MATCH_TARGET, 12);
  for (const value of BET_VALUES) {
    const match = dealt();
    if (value > 1) {
      match.requestRaise(match.activePlayerId);
      while (match.pendingBet.value < value) match.counterRaise(match.pendingBet.responderId);
      match.acceptBet(match.pendingBet.responderId);
    }
    const zero = match.score;
    assert.deepEqual(zero, { player: 0, opponent: 0 });
    finish(match);
    const winner = match.handWinnerId;
    assert.equal(match.score[winner], value);
    assert.equal(match.score[other(winner)], 0);
    assert.deepEqual(zero, { player: 0, opponent: 0 });
    assert.equal(match.handResult.score, match.score);
    assert.equal(match.handResult.points, value);
    assert.equal(match.phase, value === 12 ? MATCH_PHASES.MATCH_COMPLETE : MATCH_PHASES.HAND_COMPLETE);
    const before = state(match);
    assert.throws(() => match.resolveTrick(), /phase/);
    assert.equal(match.fold(winner), false);
    assert.equal(match.acceptBet(winner), false);
    assert.equal(state(match), before);
  }
});

test('folds credit only the previous accepted amount to the proposer, for both players', () => {
  for (const winner of PLAYER_IDS) {
    for (const points of [1, 3, 6, 9]) {
      const match = dealt();
      awardByFold(match, winner, points);
      assert.equal(match.score[winner], points);
      assert.equal(match.score[other(winner)], 0);
      assert.equal(match.handResult.reason, 'fold');
      assert.equal(match.handResult.foldedBy, other(winner));
      assert.equal(match.handResult.points, points);
      partition(match);
    }
  }
});

test('presentation acknowledgement automatically deals once, rejects stale tokens and preserves the result until then', () => {
  const match = dealt();
  awardByFold(match, 'player');
  const result = match.handResult;
  const previousCards = [...match.handOf('player'), ...match.handOf('opponent'), match.vira,
    ...match.deck.cardsIn('table')];
  const before = state(match);
  for (const token of [undefined, null, 0, 2, '1', {}, NaN]) {
    assert.equal(match.acknowledgeHandResult(token), false);
    assert.equal(state(match), before);
  }
  assert.throws(() => match.startHand(), /phase/);
  assert.equal(state(match), before);
  assert.equal(match.handResult, result);
  assert.equal(match.deck.remaining, 45);
  assert.equal(match.acknowledgeHandResult(1), true);
  assert.equal(match.phase, MATCH_PHASES.AWAITING_PLAY);
  assert.equal(match.handNumber, 2);
  assert.equal(match.firstPlayerId, 'opponent');
  assert.equal(match.activePlayerId, 'opponent');
  assert.equal(match.acceptedBet, 1);
  assert.equal(match.pendingBet, null);
  assert.equal(match.deck.remaining, 38);
  assert.ok(previousCards.every(card => card.runtime.zone === 'discard'));
  assert.equal(match.handResults[0], result);
  assert.equal(match.handResult, null);
  const started = state(match);
  assert.equal(match.acknowledgeHandResult(1), false);
  assert.equal(state(match), started);
  awardByFold(match, 'opponent');
  const secondResult = state(match);
  assert.equal(match.acknowledgeHandResult(1), false);
  assert.equal(state(match), secondResult);
});

test('both players can win at exactly 12 or exceed it; 11 has no special rule and terminal state is sealed', () => {
  for (const winner of PLAYER_IDS) {
    for (const finalPoints of [1, 3]) {
      const match = dealt();
      for (let number = 1; number <= 11; number++) {
        awardByFold(match, winner);
        assert.equal(match.score[winner], number);
        assert.equal(match.matchWinnerId, null);
        assert.equal(match.phase, MATCH_PHASES.HAND_COMPLETE);
        assert.equal(match.acknowledgeHandResult(match.handNumber), true);
      }
      assert.equal(match.acceptedBet, 1); // Normal hand at 11, including regular betting.
      assert.equal(match.canRequestRaise(match.activePlayerId), true);
      awardByFold(match, winner, finalPoints);
      assert.equal(match.score[winner], 11 + finalPoints);
      assert.equal(match.phase, MATCH_PHASES.MATCH_COMPLETE);
      assert.equal(match.matchWinnerId, winner);
      assert.deepEqual(match.matchResult, { winnerId: winner, score: match.score, handNumber: 12 });
      assert.equal(match.events.filter(event => event.type === 'matchCompleted').length, 1);
      assert.equal(match.deckEpoch, 1);
      const before = state(match);
      for (const id of PLAYER_IDS) {
        assert.equal(match.requestRaise(id), false);
        assert.equal(match.acceptBet(id), false);
        assert.equal(match.counterRaise(id), false);
        assert.equal(match.fold(id), false);
        assert.equal(match.play(id, match.deck.cards[0].instanceId), false);
      }
      assert.equal(match.acknowledgeHandResult(match.handNumber), false);
      assert.throws(() => match.startHand(), /phase/);
      assert.throws(() => match.deal(), /phase/);
      assert.throws(() => match.resolveTrick(), /phase/);
      assert.equal(state(match), before);
      const observation = createMatchObservation(match, other(winner));
      assert.equal(observation.matchWinnerId, winner);
      assert.deepEqual(observation.matchResult, match.matchResult);
      assert.deepEqual(observation.legalActions, []);
    }
  }
});

test('a 23-hand match reuses all 52 identities and metadata across three discard shuffles', () => {
  const match = dealt();
  const deck = match.deck;
  const original = deck.cards;
  const metadata = original.map(card => {
    setEnchantment(card, { id: 'persistent', value: card.definitionId });
    addModifier(card, { id: 'm', duration: 'hand', params: { amount: 4 } });
    return [card.enchantment, card.modifiers];
  });
  for (let hand = 1; hand <= 23; hand++) {
    assert.equal(match.handNumber, hand);
    assert.equal(match.firstPlayerId, hand % 2 ? 'player' : 'opponent');
    assert.equal(match.acceptedBet, 1);
    awardByFold(match, hand % 2 ? 'player' : 'opponent');
    partition(match);
    if (hand < 23) match.acknowledgeHandResult(hand);
  }
  assert.deepEqual(match.score, { player: 12, opponent: 11 });
  assert.equal(match.matchWinnerId, 'player');
  assert.equal(match.deck, deck);
  assert.deepEqual(deck.cards, original);
  original.forEach((card, index) => {
    assert.equal(deck.getCard(card.instanceId), card);
    assert.equal(card.enchantment, metadata[index][0]);
    assert.equal(card.modifiers, metadata[index][1]);
  });
  assert.equal(match.deckEpoch, 3);
  assert.equal(match.events.filter(event => event.type === 'deckReshuffled').length, 3);
  assert.equal(match.handResults.length, 23);
});

test('replenishment calls Deck with discard only, protecting unrelated hand, table and vira cards', () => {
  class AuditedDeck extends Deck {
    collections = [];
    collectAndShuffle(options) {
      this.collections.push([...options.zones]);
      return super.collectAndShuffle(options);
    }
  }
  const deck = new AuditedDeck();
  const match = new MatchController({ deck, rng: () => 0 });
  deck.draw(44);
  const protectedCards = [
    ...deck.draw(1, { zone: 'playerHand', ownerId: 'guest' }),
    ...deck.draw(1, { zone: 'opponentHand', ownerId: 'guest' }),
    ...deck.draw(1, { zone: 'table', ownerId: 'guest' }),
    ...deck.draw(1, { zone: 'vira' }),
  ];
  const locations = protectedCards.map(card => card.runtime);
  match.startHand(); match.deal();
  assert.deepEqual(deck.collections, [['discard']]);
  assert.equal(match.deckEpoch, 1);
  protectedCards.forEach((card, i) => {
    assert.equal(card.runtime, locations[i]);
    assert.equal(deck.drawPile.includes(card), false);
    assert.equal(match.handOf('player').includes(card), false);
    assert.equal(match.handOf('opponent').includes(card), false);
    assert.notEqual(match.vira, card);
  });
  partition(match);
});

test('a mid-shuffle RNG failure leaves zones, scores, results, events and starter intact and permits retry', () => {
  let fail = false;
  let calls = 0;
  const match = dealt({ rng: () => { calls++; return fail && calls % 10 === 0 ? NaN : 0.5; } });
  for (let hand = 1; hand <= 7; hand++) {
    awardByFold(match, hand % 2 ? 'player' : 'opponent');
    if (hand < 7) match.acknowledgeHandResult(hand);
  }
  assert.equal(match.deck.remaining, 3);
  fail = true;
  const before = state(match);
  assert.throws(() => match.acknowledgeHandResult(7), RangeError);
  assert.equal(state(match), before);
  partition(match);
  fail = false;
  assert.equal(match.acknowledgeHandResult(7), true);
  assert.equal(match.handNumber, 8);
  assert.equal(match.deck.remaining, 45);
  assert.equal(match.deckEpoch, 1);
});

test('transition events are ordered immutable data, can be read incrementally and credit results once', () => {
  const match = dealt();
  assert.deepEqual(match.events.map(event => event.type), ['distributionStarted', 'handStarted']);
  const cursor = match.events.at(-1).sequence;
  awardByFold(match, 'player');
  const completed = match.eventsSince(cursor);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].type, 'handCompleted');
  assert.equal(completed[0].result, match.handResult);
  assert.deepEqual(completed[0].score, { player: 1, opponent: 0 });
  assert.throws(() => { completed[0].type = 'changed'; }, TypeError);
  assert.throws(() => { completed[0].score.player = 5; }, TypeError);
  assert.throws(() => { match.matchWinnerId = 'opponent'; }, TypeError);
  assert.throws(() => { match.score = {}; }, TypeError);
  match.events.pop();
  assert.equal(match.events.length, 3);
  match.acknowledgeHandResult(1);
  assert.deepEqual(match.eventsSince(completed[0].sequence).map(event => event.type),
    ['distributionStarted', 'discardCollected', 'handStarted']);
  assert.deepEqual(match.events.map(event => event.sequence), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(match.eventsSince(6), []);
  for (const cursor of [-1, '1', 0.5, NaN]) assert.throws(() => match.eventsSince(cursor), RangeError);
});

test('observation uses authoritative scores and resets unavailable-card memory after recycling, retaining public history', () => {
  const match = dealt();
  for (let hand = 1; hand <= 7; hand++) {
    awardByFold(match, hand % 2 ? 'player' : 'opponent');
    if (hand < 7) match.acknowledgeHandResult(hand);
  }
  const oldView = createMatchObservation(match, 'opponent');
  assert.ok(oldView.revealedCards.length >= 7);
  assert.deepEqual(oldView.score, { player: 4, opponent: 3 });
  assert.throws(() => createMatchObservation(match, 'opponent', { score: { player: 0, opponent: 0 } }), RangeError);
  assert.throws(() => createMatchObservation(match, 'opponent', { score: null }), RangeError);
  match.acknowledgeHandResult(7);
  const view = createMatchObservation(match, 'opponent');
  assert.equal(view.deckEpoch, 1);
  assert.equal(view.handResults.length, 7);
  assert.deepEqual(view.revealedCards.map(card => card.instanceId), [match.vira.instanceId]);
  assert.deepEqual(view.score, match.score);
  assert.equal(createTrucoAI({ rng: () => 0.5 }).chooseAction(view)?.playerId, 'opponent');
});
