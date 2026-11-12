import { CARD_DEFINITIONS } from '../cards/cardDefinitions.js';
import { compareCards } from '../rules/CardStrength.js';
import { createCardAI, chooseIntermediateCard } from './CardAI.js';

export const DEFAULT_BETTING_PARAMETERS = Object.freeze({
  aggression: 0.5,
  riskTolerance: 0.45,
  bluffProbability: 0.08,
  bluffMaxValue: 6,
  decisionNoise: 0.04,
});

function parametersWithDefaults(parameters) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters) ||
      Object.keys(parameters).some(key => !Object.hasOwn(DEFAULT_BETTING_PARAMETERS, key))) {
    throw new TypeError('Expected known betting parameters');
  }
  const result = { ...DEFAULT_BETTING_PARAMETERS, ...parameters };
  for (const key of ['aggression', 'riskTolerance', 'bluffProbability', 'decisionNoise']) {
    if (!Number.isFinite(result[key]) || result[key] < 0 || result[key] > 1) {
      throw new RangeError(`${key} must be a number in [0, 1]`);
    }
  }
  if (![3, 6, 9, 12].includes(result.bluffMaxValue)) throw new RangeError('Invalid bluff maximum');
  return Object.freeze(result);
}

function random(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('RNG must return a number in [0, 1)');
  return value;
}

// Approximate independent trick chances, not knowledge of the actual hidden hand.
function handConfidence(view) {
  const known = new Set([...view.ownHand, ...view.revealedCards].map(card => card.definitionId));
  const unknown = CARD_DEFINITIONS.filter(card => !known.has(card.definitionId));
  const chance = card => unknown.length === 0 ? 0.5
    : unknown.filter(other => compareCards(card, other, view.vira) > 0).length / unknown.length;
  let cards = [...view.ownHand].sort((a, b) => compareCards(a, b, view.vira));
  const probabilities = [];
  const lead = view.plays[0];
  if (lead?.playerId === view.opponentId) {
    const reply = cards.find(card => compareCards(card, lead, view.vira) > 0) ?? cards[0];
    probabilities.push(compareCards(reply, lead, view.vira) > 0 ? 1 : 0);
    cards = cards.filter(card => card.instanceId !== reply.instanceId);
  } else if (lead?.playerId === view.playerId) {
    // The responding player can choose among all their remaining cards.
    probabilities.push(chance(lead) ** view.opponentCardCount);
  }
  probabilities.push(...cards.map(chance));
  let distribution = [1];
  for (const probability of probabilities) {
    const next = Array(distribution.length + 1).fill(0);
    distribution.forEach((value, wins) => {
      next[wins] += value * (1 - probability);
      next[wins + 1] += value * probability;
    });
    distribution = next;
  }
  const needed = 2 - view.trickWins[view.playerId];
  return distribution.slice(needed).reduce((sum, value) => sum + value, 0);
}

function passes(confidence, threshold, parameters, rng) {
  const noise = parameters.decisionNoise;
  // Clear decisions are deterministic. Only close decisions receive uncertainty.
  const adjustment = noise > 0 && Math.abs(confidence - threshold) <= noise
    ? (random(rng) - 0.5) * noise : 0;
  return confidence + adjustment >= threshold;
}

function canBluff(view, action, confidence, parameters, rng) {
  if (!action || parameters.bluffProbability === 0 || action.value > parameters.bluffMaxValue ||
      confidence < 0.18 || confidence >= 0.7 ||
      view.betting.history.some(event => event.playerId === view.playerId &&
        ['raise', 'counterRaise'].includes(event.type)) ||
      (view.score && view.score[view.opponentId] + action.value >= 12)) return false;
  return random(rng) < parameters.bluffProbability;
}

export function chooseIntermediateAction(view, { rng = Math.random, parameters = {} } = {}) {
  if (typeof rng !== 'function') throw new TypeError('RNG must be a function');
  const settings = parametersWithDefaults(parameters);
  if (!view || !Array.isArray(view.legalActions) || !Array.isArray(view.ownHand)) {
    throw new TypeError('Expected an authorized observation');
  }
  const legal = view.legalActions.filter(action => action.playerId === view.playerId);
  if (legal.length === 0) return null;
  const find = type => legal.find(action => action.type === type);
  const pending = view.betting?.pendingProposal;
  const responding = view.phase === 'awaitingBetResponse' && pending?.responderId === view.playerId;
  const playing = view.phase === 'awaitingPlay' && view.activePlayerId === view.playerId;
  if (!responding && !playing) return null;
  if (!view.betting) return chooseIntermediateCard(view, { rng });
  const confidence = handConfidence(view);
  const caution = (1 - settings.riskTolerance) * 0.16;
  const initiative = (settings.aggression - 0.5) * 0.2;
  const ownScore = view.score?.[view.playerId] ?? 0;
  const otherScore = view.score?.[view.opponentId] ?? 0;
  const pressure = view.score ? Math.max(-0.08, Math.min(0.08, (ownScore - otherScore) / 60)) : 0;
  if (responding) {
    const counter = find('counterRaise');
    const threshold = 0.73 + caution - initiative + pressure + (counter?.value ?? 12) / 120;
    if (counter && (passes(confidence, threshold, settings, rng) ||
        canBluff(view, counter, confidence, settings, rng))) return counter;
    // Compare accepting with the loss already incurred by folding. Near the
    // match target, additional stake is worth only the points still needed.
    const winGain = Math.min(pending.value, Math.max(1, 12 - ownScore));
    const loss = Math.min(pending.value, Math.max(1, 12 - otherScore));
    const foldLoss = Math.min(view.betting.acceptedValue, Math.max(1, 12 - otherScore));
    const acceptThreshold = (loss - foldLoss) / (winGain + loss) + caution;
    if (find('acceptBet') && passes(confidence, acceptThreshold, settings, rng)) return find('acceptBet');
    return find('fold') ?? null;
  }
  const raise = find('requestRaise');
  const threshold = 0.65 + caution - initiative + pressure + (raise?.value ?? 12) / 120;
  if (raise && (passes(confidence, threshold, settings, rng) ||
      canBluff(view, raise, confidence, settings, rng))) return raise;
  return chooseIntermediateCard(view, { rng });
}

// One intermediate policy, with parameters ready for future character profiles.
export function createTrucoAI({ rng = Math.random, parameters = {}, strategy = chooseIntermediateAction } = {}) {
  const settings = parametersWithDefaults(parameters);
  if (typeof strategy !== 'function') throw new TypeError('Strategy must be a function');
  return createCardAI({ rng, strategy: (view, options) => strategy(view, { ...options, parameters: settings }) });
}
