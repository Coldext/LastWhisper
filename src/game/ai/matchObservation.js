import { PLAYER_IDS } from '../MatchController.js';

function face(card) {
  return Object.freeze({ instanceId: card.instanceId, definitionId: card.definitionId,
    rank: card.rank, suit: card.suit });
}

function trick(result) {
  return Object.freeze({ handNumber: result.handNumber, trickNumber: result.trickNumber,
    winnerId: result.winnerId, vira: face(result.vira),
    plays: Object.freeze(result.plays.map(play => Object.freeze({
      playerId: play.playerId, ...face(play),
    }))),
  });
}

function betEvent(event) {
  return Object.freeze({ type: event.type, playerId: event.playerId, value: event.value,
    acceptedValue: event.acceptedValue, trickNumber: event.trickNumber, playedCards: event.playedCards });
}

// Trusted boundary: only this adapter receives the full controller.
// Copy an explicit allowlist; never copy card metadata or the deck registry.
export function createMatchObservation(match, playerId, { score = null } = {}) {
  if (!PLAYER_IDS.includes(playerId)) throw new RangeError('Unknown observer');
  const opponentId = PLAYER_IDS.find(id => id !== playerId);
  if (score !== null && (!score || PLAYER_IDS.some(id =>
    !Number.isInteger(score[id]) || score[id] < 0))) {
    throw new TypeError('Public score must contain non-negative integer points');
  }
  const ownHand = Object.freeze(match.handOf(playerId).map(face));
  const plays = Object.freeze(match.plays.map(play => Object.freeze({
    playerId: play.playerId, ...face(match.deck.getCard(play.instanceId)),
  })));
  const tricks = Object.freeze(match.tricks.map(trick));
  const handResults = Object.freeze(match.handResults.map(result => Object.freeze({
    handNumber: result.handNumber, winnerId: result.winnerId,
    reason: result.reason, foldedBy: result.foldedBy,
    acceptedValue: result.acceptedValue, points: result.points,
    vira: face(result.vira),
    plays: Object.freeze(result.plays.map(play => Object.freeze({ playerId: play.playerId, ...face(play) }))),
    bettingHistory: Object.freeze(result.bettingHistory.map(betEvent)),
    trickWins: Object.freeze({ player: result.trickWins.player, opponent: result.trickWins.opponent }),
    tricks: Object.freeze(result.tricks.map(trick)),
  })));
  const vira = match.vira ? face(match.vira) : null;
  const revealed = new Map();
  // A folded hand may have no resolved tricks, but its vira and played card
  // were still public and must remain known after the next distribution.
  for (const result of handResults) {
    revealed.set(result.vira.definitionId, result.vira);
    for (const card of result.plays) revealed.set(card.definitionId, face(card));
  }
  for (const result of [...handResults.flatMap(hand => hand.tricks), ...tricks]) {
    revealed.set(result.vira.definitionId, result.vira);
    for (const card of result.plays) revealed.set(card.definitionId, face(card));
  }
  if (vira) revealed.set(vira.definitionId, vira);
  for (const card of plays) revealed.set(card.definitionId, face(card));
  const actions = ownHand
    .filter(card => match.canPlay(playerId, card.instanceId))
    .map(card => ({ type: 'playCard', playerId, instanceId: card.instanceId }));
  if (match.canRequestRaise(playerId)) actions.push({ type: 'requestRaise', playerId, value: match.nextRaiseValue });
  if (match.canRespondToBet(playerId)) {
    actions.push({ type: 'acceptBet', playerId }, { type: 'fold', playerId });
    if (match.canCounterRaise(playerId)) actions.push({ type: 'counterRaise', playerId, value: match.nextRaiseValue });
  }
  const legalActions = Object.freeze(actions.map(action => Object.freeze(action)));
  return Object.freeze({
    playerId, opponentId, phase: match.phase, handNumber: match.handNumber,
    firstPlayerId: match.firstPlayerId, activePlayerId: match.activePlayerId,
    ownHand, opponentCardCount: match.handOf(opponentId).length,
    vira, plays, tricks, handResults,
    revealedCards: Object.freeze([...revealed.values()]),
    trickWins: Object.freeze({ player: match.trickWins.player, opponent: match.trickWins.opponent }),
    score: score === null ? null : Object.freeze({ player: score.player, opponent: score.opponent }),
    betting: Object.freeze({
      acceptedValue: match.acceptedBet,
      pendingProposal: match.pendingBet ? Object.freeze({
        proposerId: match.pendingBet.proposerId, responderId: match.pendingBet.responderId,
        value: match.pendingBet.value,
      }) : null,
      resumePlayerId: match.resumePlayerId, lastProposerId: match.lastProposerId,
      nextRaiseValue: match.nextRaiseValue,
      history: Object.freeze(match.bettingHistory.map(betEvent)),
    }),
    legalActions,
  });
}
