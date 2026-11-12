import test from 'node:test';
import assert from 'node:assert/strict';
import { BET_VALUES, MatchController, MATCH_PHASES, PLAYER_IDS } from '../src/game/MatchController.js';
import { ZONES } from '../src/game/deck/Deck.js';
import { createMatchObservation } from '../src/game/ai/matchObservation.js';
import { createTrucoAI } from '../src/game/ai/BettingAI.js';
import { addModifier, setEnchantment } from '../src/game/cards/cardModifiers.js';

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (1664525 * value + 1013904223) >>> 0) / 2 ** 32);
}

function assertPartition(match) {
  const cards = ZONES.flatMap(zone => match.deck.cardsIn(zone));
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map(card => card.instanceId)).size, 52);
  assert.deepEqual(new Set(match.deck.drawPile), new Set(match.deck.cardsIn('deck')));
}

function humanAction(view, policy, rng) {
  if (policy === 'random') return view.legalActions[Math.floor(rng() * view.legalActions.length)];
  if (policy === 'pressure') {
    const raise = view.legalActions.find(action => ['counterRaise', 'requestRaise'].includes(action.type));
    if (raise) return raise;
  }
  return view.legalActions.find(action => action.type === 'acceptBet') ??
    view.legalActions.filter(action => action.type === 'playCard').at(-1);
}

test('release matrix: 408 seeded matches against three human policies terminate without stuck bets or duplicate cards', t => {
  const seeds = [...Array.from({ length: 64 }, (_, i) => i), 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff];
  const totals = { matches: 0, hands: 0, actions: 0, folds: 0, shuffles: 0, playerWins: 0, opponentWins: 0 };
  for (const seed of seeds) {
    for (const firstPlayerId of PLAYER_IDS) {
      for (const policy of ['patient', 'random', 'pressure']) {
        const context = `seed=${seed}, first=${firstPlayerId}, policy=${policy}`;
        const match = new MatchController({ rng: seeded(seed), firstPlayerId });
        const ai = createTrucoAI({ rng: seeded(seed ^ 0xa5a5a5a5) });
        const humanRng = seeded(seed ^ 0x5a5a5a5a);
        const identities = match.deck.cards;
        const marked = identities[seed % identities.length];
        setEnchantment(marked, { id: 'release', seed });
        addModifier(marked, { id: 'persist', duration: 'hand', params: { amount: 1 } });
        const metadata = [marked.enchantment, marked.modifiers];
        const expectedScore = { player: 0, opponent: 0 };
        match.startHand(); match.deal();
        let steps = 0;
        let creditedHands = 0;
        while (match.phase !== MATCH_PHASES.MATCH_COMPLETE) {
          assert.ok(++steps <= 700, context);
          if (match.phase === MATCH_PHASES.HAND_COMPLETE) {
            assert.equal(match.acknowledgeHandResult(match.handNumber), true, context);
            assert.equal(match.acceptedBet, 1, context);
          } else if (match.phase === MATCH_PHASES.RESOLVING_TRICK) {
            match.resolveTrick();
          } else {
            const actor = match.pendingBet?.responderId ?? match.activePlayerId;
            const view = createMatchObservation(match, actor);
            assert.ok(view.legalActions.length > 0, `No legal response: ${context}`);
            const action = actor === 'opponent' ? ai.chooseAction(view) : humanAction(view, policy, humanRng);
            assert.ok(view.legalActions.includes(action), context);
            // Invalid IDs and an out-of-turn actor must not modify state.
            const before = JSON.stringify({ deck: match.deck, phase: match.phase, score: match.score,
              pending: match.pendingBet, events: match.events.length });
            assert.equal(match.play(actor, 'not-a-card'), false, context);
            assert.equal(match.requestRaise('not-a-player'), false, context);
            assert.equal(JSON.stringify({ deck: match.deck, phase: match.phase, score: match.score,
              pending: match.pendingBet, events: match.events.length }), before, context);
            const applied = action.type === 'playCard' ? match.play(actor, action.instanceId)
              : match[action.type](actor, action.value);
            assert.equal(applied, true, context);
            totals.actions++;
          }
          assertPartition(match);
          // Each hand result is applied to an independent expected score exactly once.
          while (creditedHands < match.handResults.length) {
            const result = match.handResults[creditedHands];
            assert.ok(BET_VALUES.includes(result.points), context);
            assert.equal(result.points, result.acceptedValue, context);
            expectedScore[result.winnerId] += result.points;
            creditedHands++;
            assert.deepEqual(result.score, { player: expectedScore.player, opponent: expectedScore.opponent }, context);
            totals.hands++;
            if (result.reason === 'fold') totals.folds++;
          }
          assert.deepEqual(match.score, { player: expectedScore.player, opponent: expectedScore.opponent }, context);
        }
        assert.equal(match.pendingBet, null, context);
        assert.equal(match.activePlayerId, null, context);
        assert.ok(match.score[match.matchWinnerId] >= 12, context);
        assert.ok(match.handNumber <= 23, context);
        assert.equal(match.acknowledgeHandResult(match.handNumber), false, context);
        assert.deepEqual(match.deck.cards, identities, context);
        assert.equal(marked.enchantment, metadata[0], context);
        assert.equal(marked.modifiers, metadata[1], context);
        totals.shuffles += match.deckEpoch;
        totals.matches++;
        totals[match.matchWinnerId === 'player' ? 'playerWins' : 'opponentWins']++;
      }
    }
  }
  assert.equal(totals.matches, 408);
  assert.ok(totals.shuffles > 0);
  assert.ok(totals.playerWins > 0 && totals.opponentWins > 0);
  t.diagnostic(JSON.stringify(totals));
});
