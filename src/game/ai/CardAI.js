import { CARD_DEFINITIONS } from '../cards/cardDefinitions.js';
import { compareCards, getCardStrength } from '../rules/CardStrength.js';

function randomIndex(rng, length) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('RNG must return a number in [0, 1)');
  }
  return Math.floor(value * length);
}

// Evaluate a hypothetical hand with optimal continuations for both players.
// Cards here are sampled definitions, never the actual hidden opponent cards.
function outcome(own, other, turn, lead, ownWins, otherWins, vira) {
  if (ownWins === 2) return 1;
  if (otherWins === 2) return 0;
  const hand = turn === 'self' ? own : other;
  const values = hand.map((card, index) => {
    const remaining = hand.filter((_, i) => i !== index);
    const nextOwn = turn === 'self' ? remaining : own;
    const nextOther = turn === 'other' ? remaining : other;
    if (lead === null) {
      return outcome(nextOwn, nextOther, turn === 'self' ? 'other' : 'self',
        { card, player: turn }, ownWins, otherWins, vira);
    }
    const winner = compareCards(lead.card, card, vira) > 0 ? lead.player : turn;
    return outcome(nextOwn, nextOther, winner, null,
      ownWins + (winner === 'self' ? 1 : 0), otherWins + (winner === 'other' ? 1 : 0), vira);
  });
  return turn === 'self' ? Math.max(...values) : Math.min(...values);
}

export function chooseIntermediateCard(observation, { rng = Math.random } = {}) {
  if (typeof rng !== 'function') throw new TypeError('RNG must be a function');
  if (!observation || !Array.isArray(observation.ownHand) ||
      !Array.isArray(observation.legalActions)) throw new TypeError('Expected an authorized observation');
  const { legalActions, ownHand, vira } = observation;
  if (legalActions.length === 0) return null;
  if (observation.phase !== 'awaitingPlay' || observation.activePlayerId !== observation.playerId) return null;
  if (!legalActions.some(action => action.type === 'playCard')) return null;
  const cards = ownHand.filter(card => legalActions.some(action => action.type === 'playCard' &&
    action.playerId === observation.playerId && action.instanceId === card.instanceId))
    .sort((a, b) => compareCards(a, b, vira));
  if (cards.length === 0) throw new RangeError('Legal actions must reference own cards');
  const actionFor = card => legalActions.find(action => action.instanceId === card.instanceId);
  if (cards.length === 1) return actionFor(cards[0]);
  const lead = observation.plays[0];
  if (lead) {
    // Secure this trick as cheaply as possible; never burn a losing strong card.
    return actionFor(cards.find(card => compareCards(card, lead, vira) > 0) ?? cards[0]);
  }

  const known = new Set([...ownHand, ...observation.revealedCards].map(card => card.definitionId));
  const unknown = CARD_DEFINITIONS.filter(card => !known.has(card.definitionId));
  const count = observation.opponentCardCount;
  if (!Number.isInteger(count) || count < 1 || count > 3 || count > unknown.length) {
    throw new RangeError('Invalid opponent card count');
  }
  const wins = observation.trickWins;
  const evaluations = cards.map(card => ({ card, wins: 0 }));
  const samples = 48;
  for (let sample = 0; sample < samples; sample++) {
    const pool = [...unknown];
    const other = [];
    for (let i = 0; i < count; i++) other.push(pool.splice(randomIndex(rng, pool.length), 1)[0]);
    // Use the same sample for every candidate so comparisons share uncertainty.
    for (const evaluation of evaluations) {
      evaluation.wins += outcome(ownHand.filter(card => card.instanceId !== evaluation.card.instanceId),
        other, 'other', { card: evaluation.card, player: 'self' },
        wins[observation.playerId], wins[observation.opponentId], vira);
    }
  }
  const best = Math.max(...evaluations.map(item => item.wins));
  // If every sample predicts a loss and the opponent already has one trick,
  // still maximize the chance to survive the current trick.
  if (best === 0 && wins[observation.opponentId] === 1) return actionFor(cards.at(-1));
  // Within sampling noise (two samples), prefer conserving a stronger card.
  const reasonable = evaluations.filter(item => item.wins >= best - 2);
  const cheapest = getCardStrength(reasonable[0].card, vira);
  const equivalents = reasonable.filter(item => getCardStrength(item.card, vira) <= cheapest + 1);
  const choice = equivalents.length === 1 ? equivalents[0]
    : equivalents[randomIndex(rng, equivalents.length)];
  return actionFor(choice.card);
}

// Strategy injection is the extension point for future character/difficulty profiles.
// A strategy only ever receives the observation and RNG, with no controller closure.
export function createCardAI({ rng = Math.random, strategy = chooseIntermediateCard } = {}) {
  if (typeof rng !== 'function' || typeof strategy !== 'function') {
    throw new TypeError('RNG and strategy must be functions');
  }
  return Object.freeze({
    chooseAction(observation) {
      const action = strategy(observation, { rng });
      if (action === null) return null;
      const legal = observation.legalActions.find(candidate =>
        candidate.playerId === observation.playerId &&
        candidate.type === action?.type && candidate.playerId === action.playerId &&
        candidate.instanceId === action.instanceId && candidate.value === action.value);
      if (!legal) throw new RangeError('Strategy returned an illegal action');
      return legal;
    },
  });
}
