import { MATCH_PHASES } from '../game/MatchController.js';
import { createMatchObservation } from '../game/ai/matchObservation.js';

export const PRESENTATION_TIMINGS = Object.freeze({ ai: 420, card: 240, trick: 700, result: 1600 });

// Presentation orchestration only. Clock, drawing and animation are injected;
// all legality, outcomes, points and hand transitions remain in MatchController.
export class MatchPresenter {
  #pending = null;
  #disposed = false;
  #running = false;
  #started = false;

  constructor({ match, ai, schedule, render, animateCard = () => {}, timings = {} }) {
    this.match = match;
    this.ai = ai;
    this.schedule = schedule;
    this.render = render;
    this.animateCard = animateCard;
    this.timings = { ...PRESENTATION_TIMINGS, ...timings };
    this.error = null;
  }

  get busy() { return this.#disposed || this.#running || this.#pending !== null || this.error !== null; }

  start() {
    if (this.#started || this.#disposed) return;
    this.#started = true;
    this.#drive();
  }

  dispose() {
    this.#disposed = true;
    this.#pending?.cancel?.();
    this.#pending = null;
  }

  dispatch(action) {
    if (this.busy || action?.playerId !== 'player') return false;
    if (!this.#apply(action, 'player')) return false;
    this.#drive();
    return true;
  }

  #apply(action, playerId) {
    const legal = createMatchObservation(this.match, playerId).legalActions.find(candidate =>
      candidate.type === action?.type && candidate.playerId === action.playerId &&
      candidate.instanceId === action.instanceId && candidate.value === action.value);
    if (!legal) return false;
    if (action.type === 'playCard') return this.match.play(playerId, action.instanceId);
    if (action.type === 'requestRaise' || action.type === 'counterRaise') return this.match[action.type](playerId, action.value);
    return this.match[action.type](playerId);
  }

  #queue(duration, task) {
    const token = { hand: this.match.handNumber, phase: this.match.phase,
      active: this.match.activePlayerId, proposal: this.match.pendingBet };
    this.#pending = token;
    token.cancel = this.schedule(duration, () => {
      if (this.#disposed || this.#pending !== token) return;
      this.#pending = null;
      if (token.hand !== this.match.handNumber || token.phase !== this.match.phase ||
          token.active !== this.match.activePlayerId || token.proposal !== this.match.pendingBet) {
        this.#drive();
        return;
      }
      this.#running = true;
      try { task(); }
      catch (error) { this.error = error; }
      finally { this.#running = false; }
      this.#drive();
    });
  }

  #drive() {
    if (this.#disposed || this.#pending !== null) return;
    const phase = this.match.phase;
    if (!this.error) {
      if (phase === MATCH_PHASES.RESOLVING_TRICK) {
        this.#queue(this.timings.trick, () => this.match.resolveTrick());
      } else if (phase === MATCH_PHASES.HAND_COMPLETE) {
        const handNumber = this.match.handNumber;
        this.#queue(this.timings.result, () => this.match.acknowledgeHandResult(handNumber));
      } else if (this.match.activePlayerId === 'opponent' || this.match.pendingBet?.responderId === 'opponent') {
        this.#queue(this.timings.ai, () => {
          const action = this.ai.chooseAction(createMatchObservation(this.match, 'opponent'));
          if (!action || !this.#apply(action, 'opponent')) throw new Error('A IA não forneceu uma ação válida');
          if (action.type === 'playCard') {
            this.#queue(this.timings.card, () => {});
            this.render();
            this.animateCard(action.instanceId, this.timings.card);
          }
        });
      }
    }
    this.render();
  }
}
