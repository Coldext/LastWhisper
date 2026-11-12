import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchController, MATCH_PHASES, PLAYER_IDS } from '../src/game/MatchController.js';
import { Deck, ZONES } from '../src/game/deck/Deck.js';
import { getManilhaRank } from '../src/game/rules/CardStrength.js';
import { addModifier, setEnchantment } from '../src/game/cards/cardModifiers.js';

function createDealt(options) {
  const match = new MatchController({ rng: () => 0, ...options });
  match.startHand();
  match.deal();
  return match;
}

function pendingResolution(match) {
  for (let i = 0; i < 2; i++) {
    const playerId = match.activePlayerId;
    assert.equal(match.play(playerId, match.handOf(playerId)[0].instanceId), true);
  }
  assert.equal(match.phase, MATCH_PHASES.RESOLVING_TRICK);
}

function finishHand(match) {
  while (match.phase !== MATCH_PHASES.HAND_COMPLETE) {
    if (match.phase === MATCH_PHASES.AWAITING_PLAY) pendingResolution(match);
    match.resolveTrick();
  }
}

function snapshot(match) {
  return JSON.stringify({
    phase: match.phase, handNumber: match.handNumber, first: match.firstPlayerId,
    active: match.activePlayerId, vira: match.vira, plays: match.plays, deck: match.deck,
    tricks: match.tricks, handResults: match.handResults, trickWins: match.trickWins,
  });
}

function assertPartition(match) {
  const cards = ZONES.flatMap(zone => match.deck.cardsIn(zone));
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map(card => card.instanceId)).size, 52);
  assert.equal(match.deck.cardsIn('deck').length, match.deck.remaining);
}

test('explicit preparation and alternating single-card deal, then vira, for either starter', () => {
  for (const firstPlayerId of PLAYER_IDS) {
    const match = new MatchController({ rng: () => 0, firstPlayerId });
    const top = match.deck.drawPile.reverse();
    assert.equal(match.phase, MATCH_PHASES.READY);
    assert.equal(match.handNumber, 0);
    assert.equal(match.activePlayerId, null);
    assert.equal(match.firstPlayerId, null);
    assert.equal(match.vira, null);
    assert.equal(match.manilhaRank, null);
    match.startHand();
    assert.equal(match.phase, MATCH_PHASES.DEALING);
    assert.equal(match.deck.remaining, 52);
    assert.equal(match.activePlayerId, null);
    match.deal();
    const other = PLAYER_IDS.find(id => id !== firstPlayerId);
    for (const index of [0, 2, 4]) {
      assert.ok(match.handOf(firstPlayerId).includes(top[index]));
      assert.equal(top[index].runtime.ownerId, firstPlayerId);
      assert.ok(match.handOf(other).includes(top[index + 1]));
    }
    assert.equal(match.handOf(firstPlayerId).length, 3);
    assert.equal(match.handOf(other).length, 3);
    assert.equal(match.vira, top[6]);
    assert.deepEqual(match.vira.runtime, { zone: 'vira', ownerId: null });
    assert.equal(match.manilhaRank, getManilhaRank(top[6]));
    assert.equal(match.deck.remaining, 45);
    assert.equal(match.handNumber, 1);
    assert.equal(match.firstPlayerId, firstPlayerId);
    assert.equal(match.activePlayerId, firstPlayerId);
    assert.equal(match.phase, MATCH_PHASES.AWAITING_PLAY);
    assertPartition(match);
  }
});

test('turn passes once, then two plays enter pending resolution without determining a winner', () => {
  const match = createDealt();
  const first = match.handOf('player')[0];
  assert.equal(match.play('player', first.instanceId), true);
  assert.equal(match.activePlayerId, 'opponent');
  assert.equal(match.phase, MATCH_PHASES.AWAITING_PLAY);
  assert.equal(match.handOf('player').length, 2);
  assert.equal(match.deck.cardsIn('table')[0], first);
  assert.deepEqual(first.runtime, { zone: 'table', ownerId: 'player' });
  const second = match.handOf('opponent')[0];
  assert.equal(match.play('opponent', second.instanceId), true);
  assert.equal(match.activePlayerId, null);
  assert.equal(match.phase, MATCH_PHASES.RESOLVING_TRICK);
  assert.deepEqual(match.plays, [
    { playerId: 'player', instanceId: first.instanceId },
    { playerId: 'opponent', instanceId: second.instanceId },
  ]);
  const before = snapshot(match);
  assert.equal(match.play('player', match.handOf('player')[0].instanceId), false);
  assert.equal(snapshot(match), before);
  assertPartition(match);
});

test('invalid players, IDs, ownership, zones and out-of-turn plays preserve the full state', () => {
  const match = createDealt();
  const own = match.handOf('player')[0];
  const opponent = match.handOf('opponent')[0];
  const pile = match.deck.drawPile[0];
  const foreign = new Deck().cards[0];
  const invalid = [
    ['opponent', opponent.instanceId], ['player', opponent.instanceId],
    ['opponent', own.instanceId], ['missing', own.instanceId], [null, own.instanceId],
    ['player', match.vira.instanceId], ['player', pile.instanceId],
    ['player', foreign.instanceId], ['player', 'missing'], ['player', undefined],
    ['player', own], ['player', null], ['player', 1],
  ];
  for (const action of invalid) {
    const before = snapshot(match);
    assert.equal(match.canPlay(...action), false);
    assert.equal(match.play(...action), false);
    assert.equal(snapshot(match), before);
  }
  // Even a known dealt card must still have its expected zone AND owner.
  for (const destination of [
    { to: 'discard' }, { to: 'table', ownerId: 'player' },
    { to: 'opponentHand', ownerId: 'player' }, { to: 'playerHand', ownerId: 'opponent' },
  ]) {
    const game = createDealt();
    const selected = game.handOf('player')[0];
    if (destination.to === 'playerHand') {
      game.deck.move(selected.instanceId, { from: 'playerHand', to: 'discard' });
      game.deck.move(selected.instanceId, { from: 'discard', ...destination });
    } else {
      game.deck.move(selected.instanceId, { from: 'playerHand', ...destination });
    }
    const before = snapshot(game);
    assert.equal(game.play('player', selected.instanceId), false);
    assert.equal(snapshot(game), before);
  }
});

test('repeated plays cannot change the table or turn, even if a used card is moved back', () => {
  const match = createDealt();
  const selected = match.handOf('player')[0];
  assert.equal(match.play('player', selected.instanceId), true);
  for (let i = 0; i < 20; i++) {
    const before = snapshot(match);
    assert.equal(match.play('player', selected.instanceId), false);
    assert.equal(match.play('opponent', selected.instanceId), false);
    assert.equal(snapshot(match), before);
  }
  match.deck.move(selected.instanceId, { from: 'table', to: 'opponentHand', ownerId: 'opponent' });
  const before = snapshot(match);
  assert.equal(match.play('opponent', selected.instanceId), false);
  assert.equal(snapshot(match), before);
});

test('lifecycle guards reject invalid transitions and protect read-only state and queries', () => {
  const match = new MatchController({ rng: () => 0 });
  const reject = action => {
    const before = snapshot(match);
    assert.throws(action, /phase/);
    assert.equal(snapshot(match), before);
  };
  reject(() => match.deal());
  reject(() => match.resolveTrick());
  assert.equal(match.play('player', match.deck.cards[0].instanceId), false);
  match.startHand();
  reject(() => match.startHand());
  reject(() => match.resolveTrick());
  assert.equal(match.play('player', match.deck.cards[0].instanceId), false);
  match.deal();
  reject(() => match.deal());
  reject(() => match.startHand());
  reject(() => match.resolveTrick());
  assert.throws(() => match.handOf('missing'), RangeError);
  for (const key of ['phase', 'activePlayerId', 'firstPlayerId', 'handNumber', 'vira', 'deck']) {
    assert.throws(() => { match[key] = 'changed'; }, TypeError);
  }
  match.handOf('player').pop();
  assert.equal(match.handOf('player').length, 3);
  pendingResolution(match);
  reject(() => match.startHand());
  const plays = match.plays;
  assert.throws(() => { plays[0].playerId = 'changed'; }, TypeError);
  plays.pop();
  assert.equal(match.plays.length, 2);
  finishHand(match);
  assert.equal(match.phase, MATCH_PHASES.HAND_COMPLETE);
  reject(() => match.resolveTrick());
  assert.equal(match.play('player', match.deck.cards[0].instanceId), false);
  assert.ok(Object.isFrozen(MATCH_PHASES));
});

test('successive hands alternate starter and deal order, retaining objects and metadata', () => {
  for (const initial of PLAYER_IDS) {
    const match = createDealt({ firstPlayerId: initial });
    const original = match.deck.cards;
    const marked = match.handOf(initial)[0];
    setEnchantment(marked, { id: 'blood', level: 1 });
    addModifier(marked, { id: 'persistent', duration: 'hand', params: { amount: 2 } });
    const enchantment = marked.enchantment;
    const modifiers = marked.modifiers;
    pendingResolution(match);
    assert.equal(match.deck.getCard(marked.instanceId), marked);
    for (let number = 2; number <= 4; number++) {
      finishHand(match);
      const oldCards = [...match.handOf('player'), ...match.handOf('opponent'),
        ...match.deck.cardsIn('table'), match.vira];
      const top = match.deck.drawPile.reverse();
      match.startHand();
      match.deal();
      const first = number % 2 ? initial : PLAYER_IDS.find(id => id !== initial);
      assert.equal(match.handNumber, number);
      assert.equal(match.firstPlayerId, first);
      assert.equal(match.activePlayerId, first);
      assert.ok(match.handOf(first).includes(top[0]));
      assert.equal(match.vira, top[6]);
      assert.equal(match.deck.remaining, 52 - 7 * number);
      assert.deepEqual(match.plays, []);
      assert.ok(oldCards.every(card => card.runtime.zone === 'discard'));
      assert.deepEqual(match.deck.cards, original);
      assert.equal(match.deck.getCard(marked.instanceId), marked);
      assert.equal(marked.enchantment, enchantment);
      assert.equal(marked.modifiers, modifiers);
      assertPartition(match);
      pendingResolution(match);
    }
  }
});

test('RNG is injected, deterministic, validated and used only for the initial shuffle', () => {
  let calls = 0;
  const first = createDealt({ rng: () => { calls++; return 0.5; } });
  const second = createDealt({ rng: () => 0.5 });
  assert.equal(calls, 51);
  assert.deepEqual(first.deck.cardsIn('deck').map(card => card.definitionId),
    second.deck.cardsIn('deck').map(card => card.definitionId));
  assert.deepEqual(first.deck.drawPile.map(card => card.definitionId),
    second.deck.drawPile.map(card => card.definitionId));
  for (const id of PLAYER_IDS) {
    assert.deepEqual(first.handOf(id).map(card => card.definitionId),
      second.handOf(id).map(card => card.definitionId));
  }
  pendingResolution(first);
  finishHand(first);
  first.startHand();
  first.deal();
  assert.equal(calls, 51);
  for (const rng of [null, 1, 'random']) {
    assert.throws(() => new MatchController({ rng }), TypeError);
  }
  for (const rng of [() => 1, () => -1, () => NaN, () => Infinity, () => '0.5']) {
    const deck = new Deck();
    const before = JSON.stringify(deck);
    assert.throws(() => new MatchController({ deck, rng }), RangeError);
    assert.equal(JSON.stringify(deck), before);
  }
  assert.throws(() => new MatchController({ firstPlayerId: 'missing' }), RangeError);
  assert.throws(() => new MatchController({ deck: {} }), TypeError);
  const activeDeck = new Deck();
  activeDeck.draw(1, { zone: 'vira' });
  const before = JSON.stringify(activeDeck);
  assert.throws(() => new MatchController({ deck: activeDeck }), RangeError);
  assert.equal(JSON.stringify(activeDeck), before);
});

test('exhaustion never replenishes or changes the previous hand, starter or metadata', () => {
  const match = createDealt();
  for (let number = 1; number <= 7; number++) {
    pendingResolution(match);
    finishHand(match);
    if (number < 7) {
      match.startHand();
      match.deal();
    }
  }
  assert.equal(match.deck.remaining, 3);
  const before = snapshot(match);
  assert.throws(() => match.startHand(), RangeError);
  assert.equal(snapshot(match), before);
  assertPartition(match);
  // Exhaustion after preparation must also fail before discarding the old hand.
  const prepared = createDealt();
  pendingResolution(prepared);
  finishHand(prepared);
  prepared.startHand();
  prepared.deck.draw(39);
  const beforeDeal = snapshot(prepared);
  assert.throws(() => prepared.deal(), RangeError);
  assert.equal(snapshot(prepared), beforeDeal);
});
