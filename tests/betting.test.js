import test from 'node:test';
import assert from 'node:assert/strict';
import { BET_VALUES, MatchController, MATCH_PHASES, PLAYER_IDS } from '../src/game/MatchController.js';
import { createMatchObservation } from '../src/game/ai/matchObservation.js';
import { createCardAI } from '../src/game/ai/CardAI.js';
import { addModifier, setEnchantment } from '../src/game/cards/cardModifiers.js';
import { ZONES } from '../src/game/deck/Deck.js';

const other = id => PLAYER_IDS.find(player => player !== id);

function dealt(firstPlayerId = 'player') {
  const match = new MatchController({ rng: () => 0, firstPlayerId });
  match.startHand();
  match.deal();
  return match;
}

function snapshot(match) {
  return JSON.stringify({ deck: match.deck, phase: match.phase, handNumber: match.handNumber,
    first: match.firstPlayerId, active: match.activePlayerId, plays: match.plays,
    tricks: match.tricks, wins: match.trickWins, results: match.handResults,
    accepted: match.acceptedBet, pending: match.pendingBet, resume: match.resumePlayerId,
    lastProposer: match.lastProposerId, next: match.nextRaiseValue, bets: match.bettingHistory });
}

function rejected(match, action) {
  const before = snapshot(match);
  assert.equal(action(), false);
  assert.equal(snapshot(match), before);
}

function playOne(match) {
  const playerId = match.activePlayerId;
  assert.equal(match.play(playerId, match.handOf(playerId)[0].instanceId), true);
}

function finish(match) {
  while (match.phase !== MATCH_PHASES.HAND_COMPLETE) {
    if (match.phase === MATCH_PHASES.RESOLVING_TRICK) match.resolveTrick();
    else playOne(match);
  }
}

function counterTo(match, value) {
  assert.equal(match.requestRaise(match.activePlayerId), true);
  while (match.pendingBet.value < value) {
    assert.equal(match.counterRaise(match.pendingBet.responderId), true);
  }
  assert.equal(match.pendingBet.value, value);
}

test('full 1 -> 3 -> 6 -> 9 -> 12 counter-offer chain preserves accepted stake and card turn', () => {
  assert.deepEqual(BET_VALUES, [1, 3, 6, 9, 12]);
  assert.ok(Object.isFrozen(BET_VALUES));
  for (const starter of PLAYER_IDS) {
    const match = dealt(starter);
    const cards = JSON.stringify(match.deck);
    assert.equal(match.acceptedBet, 1);
    assert.equal(match.pendingBet, null);
    assert.equal(match.nextRaiseValue, 3);
    assert.equal(match.requestRaise(starter), true);
    let proposer = starter;
    for (const [index, value] of [3, 6, 9, 12].entries()) {
      assert.equal(match.acceptedBet, BET_VALUES[index]);
      assert.deepEqual(match.pendingBet, { proposerId: proposer, responderId: other(proposer), value });
      assert.equal(match.lastProposerId, proposer);
      assert.equal(match.phase, MATCH_PHASES.AWAITING_BET_RESPONSE);
      assert.equal(match.activePlayerId, null);
      assert.equal(match.resumePlayerId, starter);
      rejected(match, () => match.acceptBet(proposer));
      rejected(match, () => match.counterRaise(proposer));
      rejected(match, () => match.fold(proposer));
      for (const id of PLAYER_IDS) {
        rejected(match, () => match.requestRaise(id));
        rejected(match, () => match.play(id, match.handOf(id)[0].instanceId));
      }
      if (value < 12) {
        assert.equal(match.counterRaise(other(proposer)), true);
        proposer = other(proposer);
      }
    }
    assert.equal(match.nextRaiseValue, null);
    rejected(match, () => match.counterRaise(match.pendingBet.responderId));
    rejected(match, () => match.counterRaise(match.pendingBet.responderId, 15));
    assert.equal(match.acceptBet(match.pendingBet.responderId), true);
    assert.equal(match.acceptedBet, 12);
    assert.equal(match.pendingBet, null);
    assert.equal(match.resumePlayerId, null);
    assert.equal(match.phase, MATCH_PHASES.AWAITING_PLAY);
    assert.equal(match.activePlayerId, starter);
    assert.equal(JSON.stringify(match.deck), cards);
    rejected(match, () => match.requestRaise(starter));
    finish(match);
    assert.equal(match.handResult.points, 12);
    assert.equal(match.handResult.acceptedValue, 12);
    assert.equal(match.handResult.reason, 'tricks');
    assert.equal(match.handResult.foldedBy, null);
    assert.deepEqual(match.bettingHistory.map(event => event.type),
      ['raise', 'counterRaise', 'counterRaise', 'counterRaise', 'accept']);
    assert.deepEqual(match.bettingHistory.map(event => event.acceptedValue), [1, 3, 6, 9, 12]);
  }
});

test('accepting each offered level sets the stake; refusing each level awards only the last accepted value', () => {
  for (const starter of PLAYER_IDS) {
    for (const [index, value] of [3, 6, 9, 12].entries()) {
      const accept = dealt(starter);
      counterTo(accept, value);
      const receiver = accept.pendingBet.responderId;
      assert.equal(accept.acceptBet(receiver), true);
      assert.equal(accept.acceptedBet, value);
      assert.equal(accept.activePlayerId, starter);
      finish(accept);
      assert.equal(accept.handResult.points, value);

      const refuse = dealt(starter);
      counterTo(refuse, value);
      const { proposerId, responderId } = refuse.pendingBet;
      const deckBefore = JSON.stringify(refuse.deck);
      assert.equal(refuse.fold(responderId), true);
      assert.equal(refuse.phase, MATCH_PHASES.HAND_COMPLETE);
      assert.equal(refuse.handWinnerId, proposerId);
      assert.equal(refuse.handResult.points, BET_VALUES[index]);
      assert.equal(refuse.handResult.reason, 'fold');
      assert.equal(refuse.handResult.foldedBy, responderId);
      assert.equal(refuse.activePlayerId, null);
      assert.equal(refuse.pendingBet, null);
      assert.equal(refuse.resumePlayerId, null);
      assert.deepEqual(refuse.trickWins, { player: 0, opponent: 0 });
      assert.equal(refuse.handResults.length, 1);
      assert.equal(JSON.stringify(refuse.deck), deckBefore);
      for (const id of PLAYER_IDS) {
        rejected(refuse, () => refuse.requestRaise(id));
        rejected(refuse, () => refuse.acceptBet(id));
        rejected(refuse, () => refuse.counterRaise(id));
        rejected(refuse, () => refuse.fold(id));
        rejected(refuse, () => refuse.play(id, refuse.handOf(id)[0].instanceId));
      }
      const before = snapshot(refuse);
      assert.throws(() => refuse.resolveTrick(), /phase/);
      assert.equal(snapshot(refuse), before);
    }
  }
});

test('raise rights alternate across accepted bets, even when the original proposer regains a turn', () => {
  const match = dealt();
  assert.equal(match.requestRaise('player'), true);
  assert.equal(match.acceptBet('opponent'), true);
  rejected(match, () => match.requestRaise('player'));
  rejected(match, () => match.requestRaise('opponent')); // Right holder, wrong card turn.
  playOne(match);
  assert.equal(match.canRequestRaise('opponent'), true);
  assert.equal(match.requestRaise('opponent'), true);
  assert.equal(match.pendingBet.value, 6);
  assert.equal(match.acceptBet('player'), true);
  rejected(match, () => match.requestRaise('opponent'));
  assert.equal(match.activePlayerId, 'opponent');
  playOne(match);
  match.resolveTrick();
  if (match.activePlayerId === 'opponent') {
    rejected(match, () => match.requestRaise('opponent'));
    playOne(match);
  }
  assert.equal(match.activePlayerId, 'player');
  assert.equal(match.requestRaise('player'), true);
  assert.equal(match.pendingBet.value, 9);
});

test('bets can interrupt either legal card turn and preserve it through multiple counter-offers', () => {
  for (const starter of PLAYER_IDS) {
    for (const afterFirstCard of [false, true]) {
      const match = dealt(starter);
      if (afterFirstCard) playOne(match);
      const expectedTurn = match.activePlayerId;
      const plays = match.plays;
      const cards = JSON.stringify(match.deck);
      counterTo(match, 9);
      assert.equal(match.resumePlayerId, expectedTurn);
      assert.deepEqual(match.plays, plays);
      assert.equal(match.acceptBet(match.pendingBet.responderId), true);
      assert.equal(match.activePlayerId, expectedTurn);
      assert.deepEqual(match.plays, plays);
      assert.equal(JSON.stringify(match.deck), cards);
      assert.equal(match.bettingHistory[0].playedCards, afterFirstCard ? 1 : 0);
      playOne(match);
      assert.equal(match.phase, afterFirstCard ? MATCH_PHASES.RESOLVING_TRICK : MATCH_PHASES.AWAITING_PLAY);
    }
  }
});

test('new tricks allow only their active leader to raise; unresolved tricks and other phases cannot bet', () => {
  const match = new MatchController({ rng: () => 0 });
  function noBets() {
    for (const id of PLAYER_IDS) {
      rejected(match, () => match.requestRaise(id));
      rejected(match, () => match.acceptBet(id));
      rejected(match, () => match.counterRaise(id));
      rejected(match, () => match.fold(id));
    }
  }
  noBets();
  match.startHand();
  noBets();
  match.deal();
  playOne(match);
  playOne(match);
  noBets();
  const winner = match.resolveTrick().winnerId;
  assert.equal(match.activePlayerId, winner);
  rejected(match, () => match.requestRaise(other(winner)));
  assert.equal(match.requestRaise(winner), true);
  assert.equal(match.bettingHistory[0].trickNumber, 2);
  assert.equal(match.bettingHistory[0].playedCards, 0);
  const before = snapshot(match);
  assert.throws(() => match.resolveTrick(), /phase/);
  assert.throws(() => match.startHand(), /phase/);
  assert.throws(() => match.deal(), /phase/);
  assert.equal(snapshot(match), before);
  match.acceptBet(other(winner));
  finish(match);
  noBets();
});

test('invalid actors, repeated responses, skipped levels, invalid types and amounts never mutate state', () => {
  const match = dealt();
  for (const id of ['unknown', '', undefined, null, 1, {}, []]) {
    rejected(match, () => match.requestRaise(id));
    rejected(match, () => match.acceptBet(id));
    rejected(match, () => match.counterRaise(id));
    rejected(match, () => match.fold(id));
  }
  for (const value of [0, 1, 6, 9, 12, 15, -3, 3.5, '3', NaN, Infinity, null, {}]) {
    rejected(match, () => match.requestRaise('player', value));
  }
  assert.equal(match.requestRaise('player', 3), true);
  for (const id of ['unknown', '', undefined, null, 1, {}, []]) {
    rejected(match, () => match.acceptBet(id));
    rejected(match, () => match.counterRaise(id));
    rejected(match, () => match.fold(id));
  }
  for (const value of [0, 1, 3, 9, 12, 15, -6, 6.5, '6', NaN, Infinity, null, {}]) {
    rejected(match, () => match.counterRaise('opponent', value));
  }
  assert.equal(match.counterRaise('opponent', 6), true);
  rejected(match, () => match.counterRaise('opponent', 9));
  assert.equal(match.acceptBet('player'), true);
  rejected(match, () => match.acceptBet('player'));
  rejected(match, () => match.fold('player'));
  rejected(match, () => match.counterRaise('player'));
});

test('folding during a trick retains revealed cards and earlier wins without resolving the partial trick', () => {
  const match = dealt();
  playOne(match);
  playOne(match);
  match.resolveTrick();
  playOne(match);
  const lead = match.plays[0];
  const caller = match.activePlayerId;
  const wins = match.trickWins;
  const tricks = match.tricks;
  const deck = JSON.stringify(match.deck);
  assert.equal(match.requestRaise(caller), true);
  assert.equal(match.fold(other(caller)), true);
  assert.equal(match.handWinnerId, caller);
  assert.deepEqual(match.trickWins, wins);
  assert.deepEqual(match.tricks, tricks);
  assert.equal(match.handResult.plays[0].instanceId, lead.instanceId);
  assert.equal(match.handResult.points, 1);
  assert.equal(JSON.stringify(match.deck), deck);
  assert.equal(match.deck.cardsIn('table').length, 3);
  const all = ZONES.flatMap(zone => match.deck.cardsIn(zone));
  assert.equal(new Set(all.map(card => card.instanceId)).size, 52);
});

test('betting results and observations are immutable, public and survive hands folded before any resolved trick', () => {
  const match = dealt();
  const hiddenIds = match.handOf('player').map(card => card.instanceId);
  const marked = match.handOf('player')[0];
  setEnchantment(marked, { id: 'persistent' });
  addModifier(marked, { id: 'm', params: { value: 7 } });
  const enchantment = marked.enchantment;
  const modifiers = marked.modifiers;
  const originalVira = match.vira;
  playOne(match);
  const publicCard = match.plays[0].instanceId;
  counterTo(match, 6);
  const view = createMatchObservation(match, 'opponent');
  assert.deepEqual(view.betting, {
    acceptedValue: match.acceptedBet, pendingProposal: match.pendingBet,
    resumePlayerId: match.resumePlayerId, lastProposerId: match.lastProposerId,
    nextRaiseValue: match.nextRaiseValue, history: match.bettingHistory,
  });
  assert.notEqual(view.betting.pendingProposal, match.pendingBet);
  assert.deepEqual(view.legalActions, []);
  assert.equal(createCardAI().chooseAction(view), null); // Card AI never answers bets.
  for (const id of hiddenIds.filter(id => id !== publicCard)) {
    assert.equal(JSON.stringify(view).includes(id), false);
  }
  assert.throws(() => { match.pendingBet.value = 12; }, TypeError);
  assert.throws(() => { view.betting.pendingProposal.value = 12; }, TypeError);
  assert.throws(() => { view.betting.history[0].acceptedValue = 12; }, TypeError);
  match.bettingHistory.pop();
  assert.equal(match.bettingHistory.length, 2);
  assert.equal(match.fold(match.pendingBet.responderId), true);
  const result = match.handResult;
  assert.equal(result.points, 3);
  assert.equal(result.tricks.length, 0);
  assert.throws(() => result.bettingHistory.pop(), TypeError);
  assert.throws(() => { result.points = 12; }, TypeError);
  const completed = createMatchObservation(match, 'opponent');
  assert.deepEqual(completed.handResults, match.handResults);
  const saved = JSON.stringify(result);
  match.startHand();
  match.deal();
  assert.equal(match.acceptedBet, 1);
  assert.equal(match.pendingBet, null);
  assert.equal(match.resumePlayerId, null);
  assert.equal(match.lastProposerId, null);
  assert.deepEqual(match.bettingHistory, []);
  assert.equal(match.canRequestRaise(match.activePlayerId), true);
  assert.equal(JSON.stringify(match.handResults[0]), saved);
  const next = createMatchObservation(match, 'opponent');
  assert.ok(next.revealedCards.some(card => card.instanceId === publicCard));
  assert.ok(next.revealedCards.some(card => card.instanceId === originalVira.instanceId));
  assert.equal(marked.enchantment, enchantment);
  assert.equal(marked.modifiers, modifiers);
  assert.equal(match.deck.getCard(marked.instanceId), marked);
});

test('an initial refused truco still preserves its vira in later public observations', () => {
  const match = dealt();
  const vira = match.vira;
  match.requestRaise('player');
  match.fold('opponent');
  assert.deepEqual(match.handResult.plays, []);
  match.startHand();
  match.deal();
  const view = createMatchObservation(match, 'opponent');
  assert.ok(view.revealedCards.some(card => card.instanceId === vira.instanceId));
  assert.equal(view.handResults[0].points, 1);
});
