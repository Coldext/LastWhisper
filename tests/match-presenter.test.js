import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchController, MATCH_PHASES } from '../src/game/MatchController.js';
import { createMatchObservation } from '../src/game/ai/matchObservation.js';
import { createTrucoAI } from '../src/game/ai/BettingAI.js';
import { MatchPresenter } from '../src/ui/MatchPresenter.js';

function fixture({ firstPlayerId = 'player', ai } = {}) {
  const match = new MatchController({ rng: () => 0, firstPlayerId });
  match.startHand(); match.deal();
  const scheduled = [], frames = [], animations = [];
  const presenter = new MatchPresenter({ match, ai: ai ?? createTrucoAI({ rng: () => 0.5 }),
    schedule: (duration, callback) => {
      const task = { duration, callback, cancelled: false };
      scheduled.push(task);
      return () => { task.cancelled = true; };
    },
    render: () => frames.push({ phase: match.phase, hand: match.handNumber, score: match.score }),
    animateCard: id => animations.push(id),
  });
  const flush = () => {
    const task = scheduled.shift();
    assert.ok(task);
    if (!task.cancelled) task.callback();
    return task;
  };
  presenter.start();
  return { match, presenter, scheduled, frames, animations, flush };
}

const playFirst = view => view.legalActions.find(action => action.type === 'playCard') ?? view.legalActions.find(action => action.type === 'acceptBet');

test('only one pending action exists, duplicate input is rejected and AI plays once before resolving', () => {
  const f = fixture({ ai: { chooseAction: playFirst } });
  const action = playFirst(createMatchObservation(f.match, 'player'));
  assert.equal(f.presenter.dispatch(action), true);
  assert.equal(f.presenter.busy, true);
  for (let i = 0; i < 20; i++) assert.equal(f.presenter.dispatch(action), false);
  assert.equal(f.scheduled.length, 1);
  const task = f.flush();
  assert.equal(f.match.deck.cardsIn('table').length, 2);
  assert.equal(f.animations.length, 1);
  task.callback(); // A duplicate callback cannot repeat an AI decision.
  assert.equal(f.match.deck.cardsIn('table').length, 2);
  assert.equal(f.scheduled.length, 1);
  f.flush(); // Animation hold.
  assert.equal(f.match.phase, MATCH_PHASES.RESOLVING_TRICK);
  f.flush();
  assert.equal(f.match.tricks.length, 1);
  assert.equal(f.presenter.error, null);
});

test('dispose cancels AI decisions and result transitions, including callbacks forced after cancellation', () => {
  const f = fixture({ firstPlayerId: 'opponent' });
  const task = f.scheduled[0];
  const before = JSON.stringify(f.match.deck);
  f.presenter.dispose();
  assert.equal(task.cancelled, true);
  task.callback();
  assert.equal(JSON.stringify(f.match.deck), before);
  assert.equal(f.presenter.dispatch({ type: 'requestRaise', playerId: 'player', value: 3 }), false);

  const g = fixture({ ai: { chooseAction: view => view.legalActions.find(action => action.type === 'fold') } });
  assert.equal(g.presenter.dispatch({ type: 'requestRaise', playerId: 'player', value: 3 }), true);
  g.flush();
  assert.equal(g.match.phase, MATCH_PHASES.HAND_COMPLETE);
  const resultTask = g.scheduled[0];
  g.presenter.dispose();
  resultTask.callback();
  assert.equal(g.match.handNumber, 1);
  assert.deepEqual(g.match.score, { player: 1, opponent: 0 });
});

test('human betting uses only legal payloads, survives counter-offers and pauses card actions', () => {
  const f = fixture({ ai: { chooseAction: view => view.legalActions.find(action => action.type === 'counterRaise') } });
  assert.equal(f.presenter.dispatch({ type: 'requestRaise', playerId: 'player', value: 6 }), false);
  assert.equal(f.presenter.dispatch({ type: 'requestRaise', playerId: 'player', value: 3 }), true);
  f.flush();
  assert.equal(f.match.pendingBet.value, 6);
  assert.equal(f.presenter.busy, false);
  assert.equal(f.presenter.dispatch({ type: 'playCard', playerId: 'player', instanceId: f.match.handOf('player')[0].instanceId }), false);
  assert.equal(f.presenter.dispatch({ type: 'acceptBet', playerId: 'player' }), true);
  assert.equal(f.match.acceptedBet, 6);
  assert.equal(f.match.activePlayerId, 'player');
  assert.equal(f.presenter.dispatch({ type: 'acceptBet', playerId: 'player' }), false);
});

test('result is displayed before automatic acknowledgement and stale state cannot be advanced twice', () => {
  const f = fixture({ ai: { chooseAction: view => view.legalActions.find(action => action.type === 'fold') } });
  f.presenter.dispatch({ type: 'requestRaise', playerId: 'player', value: 3 });
  f.flush();
  assert.equal(f.match.phase, MATCH_PHASES.HAND_COMPLETE);
  assert.equal(f.frames.at(-1).phase, MATCH_PHASES.HAND_COMPLETE);
  const task = f.scheduled[0];
  f.flush();
  assert.equal(f.match.handNumber, 2);
  task.callback();
  assert.equal(f.match.handNumber, 2);
  assert.equal(f.scheduled.length, 1); // Only the next opponent's turn.
});

test('presentation can run a full match to either final screen without duplicating rule state', () => {
  const f = fixture();
  for (let steps = 0; f.match.phase !== MATCH_PHASES.MATCH_COMPLETE; steps++) {
    assert.ok(steps < 600);
    if (f.scheduled.length) f.flush();
    else {
      const view = createMatchObservation(f.match, 'player');
      const action = view.legalActions.find(action => action.type === 'acceptBet') ?? playFirst(view);
      assert.ok(action);
      assert.equal(f.presenter.dispatch(action), true);
    }
    assert.equal(f.presenter.error, null);
  }
  assert.ok(f.match.score[f.match.matchWinnerId] >= 12);
  assert.equal(f.scheduled.length, 0);
  assert.equal(f.frames.at(-1).phase, MATCH_PHASES.MATCH_COMPLETE);
});

test('state changes invalidate a queued task and a faulty strategy surfaces a recoverable presentation error', () => {
  let decisions = 0;
  const f = fixture({ firstPlayerId: 'opponent', ai: { chooseAction(view) { decisions++; return playFirst(view); } } });
  f.match.requestRaise('opponent');
  f.flush();
  assert.equal(decisions, 0);
  assert.equal(f.presenter.busy, false);
  assert.equal(f.match.pendingBet.responderId, 'player');
  const g = fixture({ firstPlayerId: 'opponent', ai: { chooseAction: () => null } });
  g.flush();
  assert.match(g.presenter.error.message, /ação válida/);
  assert.equal(g.scheduled.length, 0);
});
