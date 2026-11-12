import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchController, MATCH_PHASES, PLAYER_IDS } from '../src/game/MatchController.js';
import { createMatchObservation } from '../src/game/ai/matchObservation.js';
import { createTrucoAI, DEFAULT_BETTING_PARAMETERS } from '../src/game/ai/BettingAI.js';
import { getCardDefinition } from '../src/game/cards/cardDefinitions.js';
import { ZONES } from '../src/game/deck/Deck.js';

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (1664525 * value + 1013904223) >>> 0) / 2 ** 32);
}

function face(id) { return { ...getCardDefinition(id), instanceId: `test-${id}` }; }

function view(hand, { pending = null, accepted = 1, score = null, wins = { player: 0, opponent: 0 },
  plays = [], history = [] } = {}) {
  const ownHand = hand.map(face);
  const vira = face('diamonds-8');
  const response = pending !== null;
  return {
    playerId: 'opponent', opponentId: 'player',
    phase: response ? 'awaitingBetResponse' : 'awaitingPlay',
    activePlayerId: response ? null : 'opponent', ownHand, vira, plays,
    opponentCardCount: ownHand.length, revealedCards: [vira, ...plays], trickWins: wins, score,
    betting: { acceptedValue: accepted, pendingProposal: response
      ? { proposerId: 'player', responderId: 'opponent', value: pending } : null,
    nextRaiseValue: [1, 3, 6, 9, 12][[1, 3, 6, 9, 12].indexOf(pending ?? accepted) + 1] ?? null,
    resumePlayerId: response ? 'player' : null, lastProposerId: response ? 'player' : null, history },
    legalActions: response ? [
      { type: 'acceptBet', playerId: 'opponent' }, { type: 'fold', playerId: 'opponent' },
      ...(pending < 12 ? [{ type: 'counterRaise', playerId: 'opponent',
        value: [3, 6, 9, 12][[3, 6, 9, 12].indexOf(pending) + 1] }] : []),
    ] : [
      ...ownHand.map(card => ({ type: 'playCard', playerId: 'opponent', instanceId: card.instanceId })),
      { type: 'requestRaise', playerId: 'opponent', value: accepted === 1 ? 3 : 6 },
    ],
  };
}

const noBluffs = { bluffProbability: 0, decisionNoise: 0 };
const decide = observation => createTrucoAI({ rng: () => 0.5, parameters: noBluffs }).chooseAction(observation);

function dealt(seed = 1, firstPlayerId = 'player') {
  const match = new MatchController({ rng: seeded(seed), firstPlayerId });
  match.startHand(); match.deal();
  return match;
}

function apply(match, action) {
  return action.type === 'playCard' ? match.play(action.playerId, action.instanceId)
    : ['requestRaise', 'counterRaise'].includes(action.type) ? match[action.type](action.playerId, action.value)
      : match[action.type](action.playerId);
}

test('authorized observations expose exactly the betting actions allowed by the engine', () => {
  const match = dealt();
  const leader = createMatchObservation(match, 'player');
  assert.equal(leader.legalActions.filter(action => action.type === 'playCard').length, 3);
  assert.deepEqual(leader.legalActions.at(-1), { type: 'requestRaise', playerId: 'player', value: 3 });
  assert.deepEqual(createMatchObservation(match, 'opponent').legalActions, []);
  match.requestRaise('player');
  assert.deepEqual(createMatchObservation(match, 'player').legalActions, []);
  let responder = createMatchObservation(match, 'opponent');
  assert.deepEqual(responder.legalActions, [
    { type: 'acceptBet', playerId: 'opponent' }, { type: 'fold', playerId: 'opponent' },
    { type: 'counterRaise', playerId: 'opponent', value: 6 },
  ]);
  assert.throws(() => responder.legalActions.pop(), TypeError);
  assert.throws(() => { responder.legalActions[2].value = 12; }, TypeError);
  match.counterRaise('opponent'); match.counterRaise('player'); match.counterRaise('opponent');
  responder = createMatchObservation(match, 'player');
  assert.deepEqual(responder.legalActions.map(action => action.type), ['acceptBet', 'fold']);
  match.acceptBet('player');
  assert.equal(createMatchObservation(match, 'player').legalActions.some(action => action.type === 'requestRaise'), false);
});

test('strong hands raise and counter; medium hands accept; weak hands fold or continue with a card', () => {
  assert.equal(decide(view(['clubs-9', 'hearts-9', 'diamonds-4'])).type, 'requestRaise');
  assert.equal(decide(view(['clubs-9', 'hearts-9', 'diamonds-4'], { pending: 3 })).type, 'counterRaise');
  assert.equal(decide(view(['hearts-A', 'clubs-K', 'diamonds-4'], { pending: 3 })).type, 'acceptBet');
  assert.equal(decide(view(['diamonds-4', 'diamonds-5', 'diamonds-6'], { pending: 3 })).type, 'fold');
  assert.equal(decide(view(['diamonds-4', 'diamonds-5', 'diamonds-6'])).type, 'playCard');
  assert.equal(decide(view(['clubs-9', 'hearts-9', 'diamonds-4'], { pending: 12, accepted: 9 })).type, 'acceptBet');
});

test('public trick results and a revealed card change the betting decision', () => {
  const remaining = ['hearts-A', 'clubs-K'];
  assert.equal(decide(view(remaining, { pending: 3, wins: { player: 1, opponent: 0 } })).type, 'acceptBet');
  assert.equal(decide(view(remaining, { pending: 3, wins: { player: 0, opponent: 1 } })).type, 'counterRaise');
  const lastCard = ['hearts-A'];
  const context = { pending: 3, wins: { player: 1, opponent: 1 } };
  assert.equal(decide(view(lastCard, { ...context, plays: [{ playerId: 'player', ...face('diamonds-K') }] })).type,
    'counterRaise');
  assert.equal(decide(view(lastCard, { ...context, plays: [{ playerId: 'player', ...face('clubs-9') }] })).type, 'fold');
});

test('accepted value, proposed value and available public score affect the risk calculation', () => {
  const uncertain = ['diamonds-K', 'spades-K', 'diamonds-4'];
  assert.equal(decide(view(uncertain, { pending: 3 })).type, 'fold');
  assert.equal(decide(view(uncertain, { pending: 6, accepted: 3 })).type, 'acceptBet');
  assert.equal(decide(view(uncertain, { pending: 3, score: { player: 11, opponent: 0 } })).type, 'acceptBet');
  const medium = ['diamonds-A', 'spades-A', 'diamonds-4'];
  assert.equal(decide(view(medium, { pending: 3 })).type, 'acceptBet');
  assert.equal(decide(view(medium, { pending: 3, score: { player: 0, opponent: 11 } })).type, 'fold');
});

test('bluffs respect probability boundaries, maximum value, prior proposals and match risk', () => {
  const medium = ['hearts-A', 'clubs-K', 'diamonds-4'];
  const makeAI = (probability, value = 0.5, extra = {}) => createTrucoAI({ rng: () => value,
    parameters: { bluffProbability: probability, decisionNoise: 0, ...extra } });
  assert.equal(makeAI(0).chooseAction(view(medium)).type, 'playCard');
  assert.equal(makeAI(1).chooseAction(view(medium)).type, 'requestRaise');
  assert.equal(makeAI(0.2, 0.199).chooseAction(view(medium)).type, 'requestRaise');
  assert.equal(makeAI(0.2, 0.2).chooseAction(view(medium)).type, 'playCard');
  assert.equal(makeAI(1).chooseAction(view(medium, { pending: 3 })).type, 'counterRaise');
  assert.equal(makeAI(1).chooseAction(view(medium, { pending: 6, accepted: 3 })).type, 'acceptBet');
  assert.equal(makeAI(1, 0.5, { bluffMaxValue: 3 }).chooseAction(view(medium, { pending: 3 })).type, 'acceptBet');
  assert.equal(makeAI(1).chooseAction(view(medium, {
    history: [{ type: 'raise', playerId: 'opponent', value: 3 }],
  })).type, 'playCard');
  assert.equal(makeAI(1).chooseAction(view(medium, { score: { player: 10, opponent: 0 } })).type, 'playCard');
  assert.equal(makeAI(1).chooseAction(view(['diamonds-4', 'diamonds-5', 'diamonds-6'], { pending: 3 })).type, 'fold');
});

test('decisions use only supplied legal actions and the strategy wrapper validates the proposed value', () => {
  const strong = view(['clubs-9', 'hearts-9', 'diamonds-4'], { pending: 3 });
  const noCounter = { ...strong, legalActions: strong.legalActions.filter(action => action.type !== 'counterRaise') };
  const ai = createTrucoAI({ parameters: noBluffs });
  assert.equal(ai.chooseAction(noCounter).type, 'acceptBet');
  assert.equal(ai.chooseAction({ ...strong, legalActions: [] }), null);
  assert.equal(ai.chooseAction({ ...strong, phase: 'resolvingTrick' }), null);
  const opening = view(['clubs-9', 'hearts-9', 'diamonds-4']);
  assert.equal(ai.chooseAction({ ...opening, activePlayerId: 'player' }), null);
  const noRaise = { ...opening, legalActions: opening.legalActions.filter(action => action.type !== 'requestRaise') };
  assert.equal(ai.chooseAction(noRaise).type, 'playCard');
  assert.throws(() => createTrucoAI({ strategy: () => ({ type: 'counterRaise', playerId: 'opponent', value: 12 }) })
    .chooseAction(strong), RangeError);
  assert.throws(() => createTrucoAI({ strategy: () => ({ type: 'acceptBet', playerId: 'player' }) })
    .chooseAction(strong), RangeError);
  assert.throws(() => ai.chooseAction(dealt()), TypeError);
});

test('hidden card fields and pile data cannot influence an identical observation or betting decision', () => {
  const match = dealt(7);
  match.requestRaise('player');
  const actual = createMatchObservation(match, 'opponent');
  const hidden = match.handOf('player');
  const adapter = new Proxy(match, { get(target, key) {
    if (key === 'handOf') return id => id === 'player' ? hidden.map(() => new Proxy({}, {
      get() { throw new Error('Hidden face accessed'); },
    })) : target.handOf(id);
    if (key === 'deck') throw new Error('No revealed plays: no deck access needed');
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const restricted = createMatchObservation(adapter, 'opponent');
  assert.deepEqual(restricted, actual);
  for (const card of hidden) assert.equal(JSON.stringify(restricted).includes(card.instanceId), false);
  const poisoned = new Proxy(restricted, { get(target, key) {
    if (['deck', 'opponentHand', 'controller', 'drawPile'].includes(key)) throw new Error('Private access');
    return Reflect.get(target, key);
  } });
  const before = JSON.stringify(restricted);
  assert.deepEqual(createTrucoAI({ rng: seeded(42) }).chooseAction(poisoned),
    createTrucoAI({ rng: seeded(42) }).chooseAction(actual));
  assert.equal(JSON.stringify(restricted), before);
  assert.deepEqual(JSON.parse(before), restricted);
});

test('parameters and RNG are validated, detached from callers and reproducible', () => {
  assert.ok(Object.isFrozen(DEFAULT_BETTING_PARAMETERS));
  for (const key of ['aggression', 'riskTolerance', 'bluffProbability', 'decisionNoise']) {
    for (const value of [-1, 2, NaN, Infinity, '0.5', null]) {
      assert.throws(() => createTrucoAI({ parameters: { [key]: value } }), RangeError);
    }
  }
  for (const parameters of [null, [], 'easy', { difficulty: 'hard' }]) {
    assert.throws(() => createTrucoAI({ parameters }), TypeError);
  }
  assert.throws(() => createTrucoAI({ parameters: { bluffMaxValue: 15 } }), RangeError);
  assert.throws(() => createTrucoAI({ rng: null }), TypeError);
  assert.throws(() => createTrucoAI({ strategy: null }), TypeError);
  const parameters = { bluffProbability: 0, decisionNoise: 0 };
  const ai = createTrucoAI({ rng: () => 0.5, parameters });
  parameters.bluffProbability = 1;
  const medium = view(['hearts-A', 'clubs-K', 'diamonds-4']);
  assert.equal(ai.chooseAction(medium).type, 'playCard');
  for (const value of [-1, 1, NaN, Infinity, '0.5']) {
    assert.throws(() => createTrucoAI({ rng: () => value, parameters: { bluffProbability: 1, decisionNoise: 0 } })
      .chooseAction(medium), RangeError);
  }
  const first = createTrucoAI({ rng: seeded(55) });
  const second = createTrucoAI({ rng: seeded(55) });
  for (let i = 0; i < 10; i++) assert.deepEqual(first.chooseAction(medium), second.chooseAction(medium));
});

test('seeded matches to 12 finish with legal betting, consistent zones and repeatable results', () => {
  function simulate(seed, firstPlayerId) {
    const score = { player: 0, opponent: 0 };
    const bots = {
      player: createTrucoAI({ rng: seeded(seed + 1000) }),
      opponent: createTrucoAI({ rng: seeded(seed + 2000) }),
    };
    const trace = [];
    let match = dealt(seed, firstPlayerId);
    let hands = 0;
    while (Math.max(...Object.values(score)) < 12) {
      let actions = 0;
      const identities = match.deck.cards;
      while (match.phase !== MATCH_PHASES.HAND_COMPLETE) {
        if (match.phase === MATCH_PHASES.RESOLVING_TRICK) match.resolveTrick();
        else {
          const playerId = match.pendingBet?.responderId ?? match.activePlayerId;
          const observation = createMatchObservation(match, playerId, { score });
          const before = JSON.stringify({ deck: match.deck, bets: match.bettingHistory });
          const action = bots[playerId].chooseAction(observation);
          assert.ok(observation.legalActions.includes(action));
          assert.equal(JSON.stringify({ deck: match.deck, bets: match.bettingHistory }), before);
          trace.push({ ...action, instanceId: action.type === 'playCard'
            ? match.deck.getCard(action.instanceId).definitionId : null });
          assert.equal(apply(match, action), true);
          assert.ok(++actions <= 24); // Six cards plus a bounded four-step negotiation.
        }
      }
      assert.equal(bots.player.chooseAction(createMatchObservation(match, 'player', { score })), null);
      score[match.handWinnerId] += match.handResult.points;
      trace.push({ winner: match.handWinnerId, points: match.handResult.points, reason: match.handResult.reason });
      assert.deepEqual(match.deck.cards, identities);
      const all = ZONES.flatMap(zone => match.deck.cardsIn(zone));
      assert.equal(all.length, 52);
      assert.equal(new Set(all.map(card => card.instanceId)).size, 52);
      assert.deepEqual(new Set(match.deck.drawPile), new Set(match.deck.cardsIn('deck')));
      assert.ok(++hands <= 23);
      if (Math.max(...Object.values(score)) < 12) {
        if (match.deck.remaining >= 7) { match.startHand(); match.deal(); }
        else {
          // Test harness supplies a fresh fixture at exhaustion. Production
          // reshuffling/match lifecycle remains outside this package.
          const starter = match.firstPlayerId === 'player' ? 'opponent' : 'player';
          match = dealt(seed + hands * 100, starter);
        }
      }
    }
    return { score, trace };
  }
  const actionTypes = new Set();
  for (const starter of PLAYER_IDS) {
    for (let seed = 1; seed <= 20; seed++) {
      const first = simulate(seed, starter);
      assert.deepEqual(first, simulate(seed, starter));
      for (const action of first.trace) if (action.type) actionTypes.add(action.type);
    }
  }
  assert.deepEqual(actionTypes, new Set(['playCard', 'requestRaise', 'acceptBet', 'fold', 'counterRaise']));
});
