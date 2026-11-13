import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HandState } from '../src/logic/HandState.js';
import { MatchController } from '../src/game/MatchController.js';
import { addModifier, setEnchantment } from '../src/game/cards/cardModifiers.js';

// Execute the actual scene handlers with deterministic input/tween adapters.
const source = (await readFile(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '');
const prelude = `const Phaser = { Scene: class {}, Math: { Clamp: (v,a,b)=>Math.max(a,Math.min(b,v)) } };
const { HandState } = await import(${JSON.stringify(new URL('../src/logic/HandState.js', import.meta.url).href)});
const { MatchController } = await import(${JSON.stringify(new URL('../src/game/MatchController.js', import.meta.url).href)});
const { MatchPresenter } = await import(${JSON.stringify(new URL('../src/ui/MatchPresenter.js', import.meta.url).href)});
const { createTrucoAI } = await import(${JSON.stringify(new URL('../src/game/ai/BettingAI.js', import.meta.url).href)});`;
const { default: GameScene } = await import(`data:text/javascript;base64,${Buffer.from(prelude + source).toString('base64')}`);

function fixture() {
  const scene = new GameScene();
  const tweens = [];
  scene.scene = { isActive() { return false; }, launch() {} };
  scene.scale = { on() {}, off() {} };
  scene.events = { once() {} };
  scene.input = { on() {}, off() {}, setDraggable(obj, value) { obj.input.draggable = value; } };
  scene.tweens = { add(config) { tweens.push(config); }, killAll() {} };
  scene.time = { delayedCall() { return { remove() {} }; } };
  scene.matchFactory = () => new MatchController({ rng: () => 0 });
  scene.render = () => {
    scene.prepareHandView();
    scene.interaction.cancelTransient();
    scene.viewVersion++;
    scene.cardObjects = new Map();
  };
  scene.create();
  scene.cardWidth = 60;
  scene.cardHeight = 84;
  scene.dropArea = { x: 100, y: 100, width: 300, height: 200 };
  scene.isOverDropArea = (x, y) => x >= 100 && x <= 400 && y >= 100 && y <= 300;
  const cards = scene.gameState.handOf('player').map((instance, index) => {
    const instanceId = instance.instanceId;
    const data = { handCard: true, instanceId, home: { x: 100 + index * 80, y: 500 } };
    const obj = { active: true, input: { enabled: true, draggable: true },
      getData: key => data[key],
      setDepth(v) { this.depth = v; return this; },
      setScale(v) { this.scale = v; return this; },
      setPosition(x,y) { this.x=x; this.y=y; return this; },
      disableInteractive() { this.input.enabled=false; return this; } };
    scene.cardObjects.set(instanceId, obj);
    return obj;
  });
  return { scene, cards, tweens };
}

test('each hand slot can play once; repeated events and subsequent out-of-turn drags are rejected', () => {
  const pointer = { id: 0, x: 101, y: 101 };
  for (let slot = 0; slot < 3; slot++) {
    const { scene, cards } = fixture();
    const card = cards[slot];
    scene.onDragStart(pointer, card);
    scene.onDragEnd(pointer, card);
    assert.equal(scene.interaction.cards.get(card.getData('instanceId')).state, 'played');
    assert.equal(card.input.draggable, false);
    assert.equal(card.input.enabled, false);
    assert.deepEqual([card.x, card.y], [130, 142]);
    for (let i=0; i<20; i++) {
      scene.onDragStart(pointer, card);
      scene.onDrag(pointer, card, 900, 900);
      scene.onDragEnd(pointer, card);
    }
    assert.deepEqual([card.x, card.y], [130, 142]);
    assert.equal(scene.played.length, 1);
    assert.equal(scene.gameState.handOf('player').length, 2);
    assert.equal(scene.gameState.deck.cardsIn('table').length, 1);
    assert.equal(scene.gameState.activePlayerId, 'opponent');
    assert.equal(scene.presenter.busy, true);
    for (const remaining of cards.filter(item => item !== card)) scene.onDragStart(pointer, remaining);
    assert.equal(scene.interaction.cards.get(cards[(slot + 1) % 3].getData('instanceId')).state, 'inHand');
  }
});

test('invalid returns block input and unlock exactly at completion, repeatedly for mouse and touch IDs', () => {
  for (const id of [0, 1, 2]) {
    const { scene, cards: [card], tweens } = fixture();
    const instance = scene.gameState.deck.getCard(card.getData('instanceId'));
    setEnchantment(instance, { id: 'blood', level: 1 });
    addModifier(instance, { id: 'regression', params: {} });
    const pointer = { id, x: 0, y: 0 };
    for (let i=0; i<20; i++) {
      scene.onDragStart(pointer, card);
      assert.equal(scene.interaction.cards.get(card.getData('instanceId')).state, 'dragging');
      scene.onDragEnd(pointer, card);
      assert.equal(scene.interaction.cards.get(card.getData('instanceId')).state, 'returning');
      assert.equal(card.input.enabled, false);
      scene.onDragStart(pointer, card);
      scene.onDrag(pointer, card, 900, 900);
      assert.equal(scene.interaction.cards.get(card.getData('instanceId')).state, 'returning');
      const tween = tweens.pop();
      card.setPosition(tween.x, tween.y).setScale(tween.scale);
      tween.onComplete();
      assert.equal(scene.interaction.cards.get(card.getData('instanceId')).state, 'inHand');
      assert.equal(card.input.enabled, true);
      assert.equal(card.input.draggable, true);
      assert.equal(instance.runtime.zone, 'playerHand');
      assert.equal(scene.gameState.deck.getCard(instance.instanceId), instance);
      assert.equal(instance.enchantment.id, 'blood');
      assert.equal(instance.modifiers[0].id, 'regression');
    }
    assert.equal(scene.played.length, 0);
  }
});

test('stale view events and callbacks cannot change a replacement hand', () => {
  const { scene, cards: [card], tweens } = fixture();
  const pointer = { id: 0, x: 0, y: 0 };
  scene.onDragStart(pointer, card);
  scene.onDragEnd(pointer, card);
  scene.restartMatch();
  scene.cardObjects = new Map();
  tweens[0].onComplete();
  scene.onDragStart(pointer, card);
  assert.equal(scene.interaction.cards.has(card.getData('instanceId')), false);
  assert.equal(scene.played.length, 0);
});

test('tips block stale card/bet input while a pending card return still finishes normally', () => {
  const { scene, cards: [card], tweens } = fixture();
  const pointer = { id: 0, x: 0, y: 0 };
  scene.onDragStart(pointer, card);
  scene.onDragEnd(pointer, card);
  scene.scene.isActive = () => true;
  tweens[0].onComplete();
  assert.equal(card.input.enabled, true);
  scene.onDragStart(pointer, card);
  scene.onDrag(pointer, card, 200, 200);
  scene.onDragEnd({ ...pointer, x: 200, y: 200 }, card);
  assert.equal(scene.gameState.deck.cardsIn('table').length, 0);
  assert.equal(scene.perform({ type: 'requestRaise', playerId: 'player', value: 3 }), false);
  scene.scene.isActive = () => false;
  scene.onDragStart({ ...pointer, x: 200, y: 200 }, card);
  scene.onDragEnd({ ...pointer, x: 200, y: 200 }, card);
  assert.equal(scene.gameState.deck.cardsIn('table').length, 1);
});

test('opening tips settles a human drag and passes only the public vira and hand number', () => {
  const { scene, cards: [card] } = fixture();
  scene.onDragStart({ id: 0 }, card);
  const before = JSON.stringify(scene.gameState.deck);
  let launch;
  scene.scene.launch = (name, payload) => { launch = { name, payload }; };
  scene.openTips();
  assert.equal(launch.name, 'TipsScene');
  assert.deepEqual(launch.payload, { handNumber: 1,
    vira: { rank: scene.gameState.vira.rank, suit: scene.gameState.vira.suit } });
  assert.equal(JSON.stringify(scene.gameState.deck), before);
  assert.equal(scene.interaction.cards.get(card.getData('instanceId')).state, 'inHand');
  assert.deepEqual([card.x, card.y], [100, 500]);
});

test('resize cancels transient states, preserves played positions and rejects a second pointer', () => {
  const hand = new HandState(['a', 'b', 'c']);
  hand.start('a', 1);
  assert.equal(hand.play('a', 2, {}), false);
  assert.equal(hand.returnCard('a', 2), false);
  hand.play('a', 1, { rx: .2, ry: .7 });
  hand.start('b', 1);
  hand.start('c', 2);
  hand.returnCard('c', 2);
  hand.cancelTransient();
  assert.deepEqual([...hand.cards.values()].map(card => card.state), ['played', 'inHand', 'inHand']);
  assert.deepEqual(hand.played, [{ instanceId: 'a', rx: .2, ry: .7 }]);
  assert.equal(hand.start('a', 1), false);
});
