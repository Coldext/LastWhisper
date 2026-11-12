import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchController, MATCH_PHASES, PLAYER_IDS } from '../src/game/MatchController.js';
import { createMatchObservation } from '../src/game/ai/matchObservation.js';
import { createCardAI, chooseIntermediateCard } from '../src/game/ai/CardAI.js';
import { CARD_DEFINITIONS, getCardDefinition } from '../src/game/cards/cardDefinitions.js';
import { compareCards } from '../src/game/rules/CardStrength.js';
import { setEnchantment } from '../src/game/cards/cardModifiers.js';

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (1664525 * value + 1013904223) >>> 0) / 2 ** 32);
}

function dealt(seed = 1, firstPlayerId = 'player') {
  const match = new MatchController({ rng: seeded(seed), firstPlayerId });
  match.startHand();
  match.deal();
  return match;
}

function face(id) {
  return { ...getCardDefinition(id), instanceId: `test-${id}` };
}

function tactical(hand, lead = null, options = {}) {
  const ownHand = hand.map(face);
  const vira = face('diamonds-8');
  return { playerId: 'opponent', opponentId: 'player', phase: 'awaitingPlay',
    activePlayerId: 'opponent', ownHand, vira,
    opponentCardCount: ownHand.length, plays: lead ? [{ playerId: 'player', ...face(lead) }] : [],
    revealedCards: [vira, ...(lead ? [face(lead)] : [])], trickWins: { player: 0, opponent: 0 },
    legalActions: ownHand.map(card => ({ type: 'playCard', playerId: 'opponent', instanceId: card.instanceId })),
    ...options,
  };
}

function publicOnly(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => key === 'instanceId' ? undefined : item));
}

test('observation contains only authorized detached data and never inspects hidden card fields', () => {
  const match = dealt();
  const hidden = match.handOf('player');
  setEnchantment(hidden[0], { id: 'private-secret', params: { password: 'hidden' } });
  const own = match.handOf('opponent')[0];
  setEnchantment(own, { id: 'metadata', params: { secret: hidden[0].definitionId } });
  const adapter = new Proxy(match, { get(target, key) {
    if (key === 'handOf') return id => id === 'player'
      ? hidden.map(card => new Proxy(card, { get() { throw new Error('Hidden card inspected'); } }))
      : target.handOf(id);
    if (key === 'deck') return { getCard() { throw new Error('No revealed play yet'); } };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const observation = createMatchObservation(adapter, 'opponent');
  assert.deepEqual(observation.ownHand.map(card => card.definitionId), match.handOf('opponent').map(card => card.definitionId));
  assert.equal(observation.opponentCardCount, 3);
  assert.equal(observation.score, null);
  const json = JSON.stringify(observation);
  for (const card of hidden) {
    assert.equal(json.includes(card.instanceId), false);
    assert.equal(json.includes(card.definitionId), false);
  }
  for (const key of ['deck', 'drawPile', 'opponentHand', 'enchantment', 'modifiers', 'runtime', 'private-secret']) {
    assert.equal(json.includes(`"${key}"`), false);
  }
  assert.notEqual(observation.ownHand[0], own);
  assert.notEqual(observation.vira, match.vira);
  assert.throws(() => observation.ownHand.pop(), TypeError);
  assert.throws(() => { observation.ownHand[0].rank = '4'; }, TypeError);
  assert.deepEqual(JSON.parse(json), observation);
  assert.deepEqual(observation.legalActions, []); // Not this observer's turn.
});

test('observation reveals only played faces, public history and explicitly supplied public score', () => {
  const match = dealt();
  const lead = match.handOf('player')[0];
  match.play('player', lead.instanceId);
  const points = { player: 5, opponent: 3, secret: match.handOf('player')[0] };
  const observation = createMatchObservation(match, 'opponent', { score: points });
  assert.equal(observation.plays[0].instanceId, lead.instanceId);
  assert.ok(observation.revealedCards.some(card => card.instanceId === lead.instanceId));
  assert.equal(observation.opponentCardCount, 2);
  assert.equal(observation.legalActions.filter(action => action.type === 'playCard').length, 3);
  assert.ok(observation.legalActions.some(action => action.type === 'requestRaise'));
  assert.deepEqual(observation.score, { player: 5, opponent: 3 });
  assert.notEqual(observation.score, points);
  assert.throws(() => { observation.score.player = 10; }, TypeError);
  while (match.phase !== MATCH_PHASES.HAND_COMPLETE) {
    if (match.phase === MATCH_PHASES.RESOLVING_TRICK) match.resolveTrick();
    else {
      const id = match.activePlayerId;
      match.play(id, match.handOf(id)[0].instanceId);
    }
  }
  const completed = createMatchObservation(match, 'opponent');
  assert.deepEqual(completed.tricks, match.tricks);
  assert.deepEqual(completed.handResults, match.handResults);
  const publicIds = new Set([match.vira.instanceId, ...match.tricks.flatMap(trick => trick.plays.map(card => card.instanceId))]);
  assert.deepEqual(new Set(completed.revealedCards.map(card => card.instanceId)), publicIds);
  match.startHand();
  match.deal();
  const next = createMatchObservation(match, 'opponent');
  for (const id of publicIds) assert.ok(next.revealedCards.some(card => card.instanceId === id));
  assert.equal(JSON.stringify(observation.plays[0]).includes(lead.instanceId), true);
  assert.throws(() => createMatchObservation(match, 'unknown'), RangeError);
  for (const score of [{}, { player: -1, opponent: 0 }, { player: 1.5, opponent: 0 }, false]) {
    assert.throws(() => createMatchObservation(match, 'opponent', { score }), TypeError);
  }
});

test('reply selects the cheapest winner, preserves manilhas, and throws away the weakest when beaten', () => {
  const ai = createCardAI();
  const pick = (hand, lead, options) => ai.chooseAction(tactical(hand, lead, options)).instanceId;
  assert.equal(pick(['clubs-9', 'hearts-K', 'diamonds-4'], 'spades-Q'), 'test-hearts-K');
  assert.equal(pick(['clubs-9', 'hearts-9', 'diamonds-4'], 'spades-9'), 'test-hearts-9');
  assert.equal(pick(['hearts-3', 'diamonds-4', 'clubs-A'], 'clubs-9'), 'test-diamonds-4');
  assert.equal(pick(['diamonds-4', 'clubs-4', 'hearts-2'], 'spades-4'), 'test-clubs-4');
  assert.equal(pick(['clubs-9', 'hearts-K', 'diamonds-4'], 'spades-Q',
    { trickWins: { player: 1, opponent: 1 } }), 'test-hearts-K');
});

test('reply handles every vira rank and revealed opponent face using only legal cards', () => {
  const ai = createCardAI();
  for (const rank of ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3']) {
    const vira = face(`diamonds-${rank}`);
    for (const lead of CARD_DEFINITIONS.filter(card => card.definitionId !== vira.definitionId)) {
      const hand = CARD_DEFINITIONS.filter(card => ![vira.definitionId, lead.definitionId].includes(card.definitionId))
        .filter((_, index) => index % 17 === 0).slice(0, 3).map(card => card.definitionId);
      const observation = tactical(hand, lead.definitionId, { vira });
      const ordered = observation.ownHand.toSorted((a, b) => compareCards(a, b, vira));
      const expected = ordered.find(card => compareCards(card, lead, vira) > 0) ?? ordered[0];
      assert.equal(ai.chooseAction(observation).instanceId, expected.instanceId);
    }
  }
});

test('leading evaluates hand context, preserves strength when reasonable and survives a threatened hand', () => {
  const ai = createCardAI({ rng: seeded(13) });
  const safe = tactical(['diamonds-4', 'hearts-9', 'clubs-9']);
  assert.equal(ai.chooseAction(safe).instanceId, 'test-diamonds-4'); // Two unbeatable remaining manilhas.
  const threatened = tactical(['diamonds-4', 'hearts-A'], null, {
    opponentCardCount: 2, trickWins: { player: 1, opponent: 0 },
  });
  assert.equal(ai.chooseAction(threatened).instanceId, 'test-hearts-A');
  const one = tactical(['diamonds-4'], null, { opponentCardCount: 1, trickWins: { player: 1, opponent: 1 } });
  assert.equal(ai.chooseAction(one).instanceId, 'test-diamonds-4');
});

test('identical authorized observations produce identical decisions regardless of hidden cards', () => {
  const match = dealt(8, 'opponent');
  const first = createMatchObservation(match, 'opponent');
  // Substitute only private state behind an adapter. The builder can observe
  // the hand count, but cannot learn faces, IDs, metadata or pile order.
  const fakeHidden = Array.from({ length: 3 }, () => new Proxy({}, {
    get() { throw new Error('Hidden state accessed'); },
  }));
  const adapter = new Proxy(match, { get(target, key) {
    if (key === 'handOf') return id => id === 'player' ? fakeHidden : target.handOf(id);
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const second = createMatchObservation(adapter, 'opponent');
  assert.deepEqual(second, first);
  const before = JSON.stringify(first);
  assert.deepEqual(createCardAI({ rng: seeded(99) }).chooseAction(first),
    createCardAI({ rng: seeded(99) }).chooseAction(second));
  assert.equal(JSON.stringify(first), before);
  assert.throws(() => chooseIntermediateCard(match), TypeError);
});

test('RNG controls sampling and equivalent choices reproducibly, and rejects invalid values', () => {
  const observation = tactical(['diamonds-4', 'hearts-K', 'clubs-9']);
  let calls = 0;
  const rng = seeded(9);
  const first = createCardAI({ rng: () => { calls++; return rng(); } }).chooseAction(observation);
  const second = createCardAI({ rng: seeded(9) }).chooseAction(JSON.parse(JSON.stringify(observation)));
  assert.deepEqual(first, second);
  assert.ok(calls >= 48 * 3);
  for (const rng of [null, 0, 'random']) assert.throws(() => createCardAI({ rng }), TypeError);
  for (const value of [-1, 1, NaN, Infinity, '0.5']) {
    assert.throws(() => createCardAI({ rng: () => value }).chooseAction(observation), RangeError);
  }
  const chosen = new Set();
  const tied = tactical(['diamonds-4', 'spades-4', 'clubs-9']);
  // All continuations lose against three stronger sampled cards; the two low
  // adjacent suits are equivalent within the strength-conservation tolerance.
  for (const value of [0, 0.99999]) {
    chosen.add(createCardAI({ rng: () => value }).chooseAction(tied).instanceId);
  }
  assert.deepEqual(chosen, new Set(['test-diamonds-4', 'test-spades-4']));
  for (const id of chosen) assert.ok(tied.legalActions.some(action => action.instanceId === id));
});

test('strategy extension accepts observation only and rejects illegal output', () => {
  const observation = tactical(['diamonds-4']);
  let received;
  const ai = createCardAI({ strategy: (view, options) => {
    received = view;
    assert.equal(typeof options.rng, 'function');
    return view.legalActions[0];
  } });
  assert.equal(ai.chooseAction(observation), observation.legalActions[0]);
  assert.equal(received, observation);
  assert.throws(() => createCardAI({ strategy: null }), TypeError);
  assert.throws(() => createCardAI({ strategy: () => ({ type: 'playCard', playerId: 'player', instanceId: 'secret' }) })
    .chooseAction(observation), RangeError);
  assert.equal(createCardAI().chooseAction({ ...observation, legalActions: [] }), null);
  assert.equal(createCardAI().chooseAction({ ...observation, activePlayerId: 'player' }), null);
});

test('seeded simulations finish complete hands with legal actions, private views and stable card identities', () => {
  function simulate(seed, firstPlayerId) {
    const match = dealt(seed, firstPlayerId);
    const ai = createCardAI({ rng: seeded(seed + 1000) });
    const playerRng = seeded(seed + 2000);
    const identities = match.deck.cards;
    const trace = [];
    for (let hand = 1; hand <= 7; hand++) {
      let actions = 0;
      while (match.phase !== MATCH_PHASES.HAND_COMPLETE) {
        if (match.phase === MATCH_PHASES.RESOLVING_TRICK) match.resolveTrick();
        else {
          const id = match.activePlayerId;
          const view = createMatchObservation(match, id);
          const before = JSON.stringify(match.deck);
          const cardActions = view.legalActions.filter(action => action.type === 'playCard');
          const action = id === 'opponent' ? ai.chooseAction(view)
            : cardActions[Math.floor(playerRng() * cardActions.length)];
          assert.equal(JSON.stringify(match.deck), before);
          assert.ok(view.legalActions.includes(action));
          assert.equal(match.canPlay(id, action.instanceId), true);
          trace.push(match.deck.getCard(action.instanceId).definitionId);
          assert.equal(match.play(id, action.instanceId), true);
          assert.ok(++actions <= 6);
        }
      }
      assert.equal(ai.chooseAction(createMatchObservation(match, 'opponent')), null);
      assert.ok(match.tricks.length >= 2 && match.tricks.length <= 3);
      assert.equal(match.trickWins[match.handWinnerId], 2);
      assert.deepEqual(match.deck.cards, identities);
      assert.equal(new Set(match.deck.cards.map(card => card.instanceId)).size, 52);
      trace.push(publicOnly(match.handResult));
      if (hand < 7) { match.startHand(); match.deal(); }
    }
    assert.equal(match.deck.remaining, 3);
    return trace;
  }
  for (const firstPlayerId of PLAYER_IDS) {
    for (let seed = 1; seed <= 12; seed++) {
      assert.deepEqual(simulate(seed, firstPlayerId), simulate(seed, firstPlayerId));
    }
  }
});
