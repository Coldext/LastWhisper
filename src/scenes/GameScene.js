import Phaser from 'phaser';
import { MatchController } from '../game/MatchController.js';
import { createTrucoAI } from '../game/ai/BettingAI.js';
import { HandState } from '../logic/HandState.js';
import { MatchPresenter } from '../ui/MatchPresenter.js';
import { renderGameTable } from '../ui/gameTableView.js';

const clamp = Phaser.Math.Clamp;

export default class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    this.viewVersion = 0;
    this.message = '';
    this.input.dragDistanceThreshold = 9;
    this.installDragHandlers();
    this.onResize = () => this.render();
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => {
      this.presenter?.dispose();
      this.tweens.killAll();
      this.viewVersion++;
      this.scale.off('resize', this.onResize);
      this.input.off('dragstart', this.onDragStart);
      this.input.off('drag', this.onDrag);
      this.input.off('dragend', this.onDragEnd);
    });
    this.restartMatch();
  }

  restartMatch() {
    this.presenter?.dispose();
    this.tweens.killAll();
    this.gameState = this.matchFactory?.() ?? new MatchController();
    this.gameState.startHand();
    this.gameState.deal();
    this.viewHandNumber = null;
    this.message = '';
    this.presenter = new MatchPresenter({
      match: this.gameState, ai: this.aiFactory?.() ?? createTrucoAI(),
      timings: this.presentationTimings,
      schedule: (duration, callback) => {
        const event = this.time.delayedCall(duration, callback);
        return () => event.remove(false);
      },
      render: () => this.render(),
      animateCard: (instanceId, duration) => this.animateAI(instanceId, duration),
    });
    this.presenter.start();
  }

  returnToMenu() {
    this.presenter.dispose();
    this.viewVersion++;
    this.scene.start('MenuScene');
  }

  prepareHandView() {
    if (this.viewHandNumber === this.gameState.handNumber) return;
    this.viewHandNumber = this.gameState.handNumber;
    this.handSlots = this.gameState.handOf('player').map(card => card.instanceId);
    this.interaction = new HandState(this.handSlots);
    this.played = this.interaction.played;
    this.message = '';
  }

  canDrag(instanceId) {
    return !this.presenter.busy && this.gameState.canPlay('player', instanceId);
  }

  isCurrentCard(obj) {
    return obj.active && obj.getData('handCard') && this.cardObjects.get(obj.getData('instanceId')) === obj;
  }

  isOverDropArea(x, y) {
    return !!this.dropArea && Phaser.Geom.Rectangle.Contains(this.dropArea, x, y);
  }

  installDragHandlers() {
    this.onDragStart = (pointer, obj) => {
      const id = obj.getData('instanceId');
      if (!this.isCurrentCard(obj) || !this.canDrag(id) || !this.interaction.start(id, pointer.id)) return;
      obj.setDepth(50).setScale(1.06);
    };
    this.onDrag = (pointer, obj, x, y) => {
      const id = obj.getData('instanceId');
      if (!this.isCurrentCard(obj) || !this.canDrag(id) || !this.interaction.isDragging(id, pointer.id)) return;
      obj.setPosition(x, y);
      this.dropHighlight?.setVisible(this.isOverDropArea(pointer.x, pointer.y));
    };
    this.onDragEnd = (pointer, obj) => {
      const id = obj.getData('instanceId');
      if (!this.isCurrentCard(obj) || !this.canDrag(id) || !this.interaction.isDragging(id, pointer.id)) return;
      this.dropHighlight?.setVisible(false);
      if (this.isOverDropArea(pointer.x, pointer.y)) {
        const area = this.dropArea;
        const px = clamp(pointer.x, area.x + this.cardWidth / 2, area.x + area.width - this.cardWidth / 2);
        const py = clamp(pointer.y, area.y + this.cardHeight / 2, area.y + area.height - this.cardHeight / 2);
        this.interaction.play(id, pointer.id, { rx: (px - area.x) / area.width, ry: (py - area.y) / area.height });
        this.input.setDraggable(obj, false);
        obj.disableInteractive();
        obj.setPosition(px, py).setScale(1).setDepth(0);
        this.message = '';
        if (!this.presenter.dispatch({ type: 'playCard', playerId: 'player', instanceId: id })) {
          this.viewHandNumber = null;
          this.render();
        }
      } else {
        this.interaction.returnCard(id, pointer.id);
        this.input.setDraggable(obj, false);
        obj.disableInteractive();
        const home = obj.getData('home');
        this.tweens.add({ targets: obj, x: home.x, y: home.y, scale: 1, duration: 170, ease: 'Sine.easeOut',
          onComplete: () => {
            if (!this.isCurrentCard(obj) || !this.interaction.finishReturn(id)) return;
            obj.setDepth(0);
            if (this.canDrag(id)) {
              obj.input.enabled = true;
              this.input.setDraggable(obj, true);
            }
          } });
        this.message = 'Solte a carta na área indicada';
        this.statusText?.setText(this.message);
      }
    };
    this.input.on('dragstart', this.onDragStart);
    this.input.on('drag', this.onDrag);
    this.input.on('dragend', this.onDragEnd);
  }

  perform(action, version = this.viewVersion) {
    if (version !== this.viewVersion) return false;
    this.message = '';
    return this.presenter.dispatch(action);
  }

  animateAI(instanceId, duration) {
    const view = this.tableObjects.get(instanceId);
    if (!view) return;
    const target = { x: view.x, y: view.y };
    if (this.presentationHooks?.animateCard) {
      this.presentationHooks.animateCard(this, view, { target, duration });
      return;
    }
    view.setPosition(this.scale.width / 2, this.enemyY).setAlpha(0.35).setDepth(40);
    this.tweens.add({ targets: view, ...target, alpha: 1, duration, ease: 'Sine.easeOut' });
  }

  render() {
    this.prepareHandView();
    this.interaction.cancelTransient();
    this.tweens.killAll();
    this.viewVersion++;
    this.cardObjects = new Map();
    this.tableObjects = new Map();
    this.controls = new Map();
    this.children.removeAll(true);
    renderGameTable(this);
  }
}
