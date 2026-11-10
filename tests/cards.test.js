import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_DEFINITIONS, SUITS, RANKS } from '../src/game/cards/cardDefinitions.js';
import { createCardInstance } from '../src/game/cards/cardFactory.js';
import { addModifier, removeModifier, setEnchantment, removeEnchantment } from '../src/game/cards/cardModifiers.js';
import { Deck, ZONES } from '../src/game/deck/Deck.js';
import { DemoGame, PLAYER_ID, OPPONENT_ID } from '../src/game/DemoGame.js';
import { cardPresentation } from '../src/ui/cardPresentation.js';

function assertPartition(deck) {
  const all = ZONES.flatMap(zone => deck.cardsIn(zone));
  assert.equal(all.length, 52);
  assert.equal(new Set(all.map(card => card.instanceId)).size, 52);
  assert.deepEqual(new Set(deck.drawPile), new Set(deck.cardsIn('deck')));
  assert.equal(deck.remaining, deck.cardsIn('deck').length);
}

test('52 immutable definitions, four suits and 13 ranks per suit, no joker', () => {
  assert.equal(CARD_DEFINITIONS.length, 52);
  assert.equal(new Set(CARD_DEFINITIONS.map(card => card.definitionId)).size, 52);
  assert.equal(SUITS.length, 4);
  for (const suit of SUITS) {
    assert.deepEqual(CARD_DEFINITIONS.filter(card => card.suit === suit).map(card => card.rank), RANKS);
  }
  assert.ok(Object.isFrozen(CARD_DEFINITIONS));
  for (const definition of CARD_DEFINITIONS) {
    assert.ok(Object.isFrozen(definition));
    assert.deepEqual(Object.keys(definition).sort(), ['definitionId', 'rank', 'suit']);
  }
});

test('52 unique instances; identities are read-only and remain distinct across fresh decks', () => {
  const deck = new Deck();
  assert.equal(deck.cards.length, 52);
  assert.equal(new Set(deck.cards.map(card => card.instanceId)).size, 52);
  assert.equal(new Set(deck.cards.map(card => card.definitionId)).size, 52);
  assert.equal(new Set([...deck.cards, ...new Deck().cards].map(card => card.instanceId)).size, 104);
  for (const key of ['instanceId', 'definitionId', 'rank', 'suit']) {
    assert.throws(() => { deck.cards[0][key] = 'changed'; }, TypeError);
  }
  assert.throws(() => { deck.cards[0].runtime.zone = 'table'; }, TypeError);
  assert.throws(() => { deck.cards[0].runtime = {}; }, TypeError);
  assertPartition(deck);
});

test('Fisher–Yates is deterministic and shuffles only available cards without losing objects', () => {
  const deck = new Deck();
  const original = deck.drawPile;
  let calls = 0;
  deck.shuffle(() => { calls++; return 0; });
  assert.equal(calls, 51);
  assert.deepEqual(deck.drawPile, [...original.slice(1), original[0]]);
  const drawn = deck.draw(3, { zone: 'playerHand', ownerId: PLAYER_ID });
  const available = new Set(deck.drawPile);
  deck.shuffle(() => .5);
  assert.equal(deck.remaining, 49);
  assert.deepEqual(new Set(deck.drawPile), available);
  assert.ok(drawn.every(card => card.runtime.zone === 'playerHand'));
  assertPartition(deck);
});

test('draws are atomic on exhaustion/invalid input, never replenish implicitly', () => {
  const deck = new Deck();
  const original = deck.drawPile;
  for (const count of [0, -1, 1.5, 53]) assert.throws(() => deck.draw(count), RangeError);
  assert.throws(() => deck.draw(3, { zone: 'playerHand' }), TypeError);
  assert.throws(() => deck.draw(1, { zone: 'deck' }), RangeError);
  assert.deepEqual(deck.drawPile, original);
  const cards = deck.draw(52);
  assert.equal(new Set(cards).size, 52);
  assert.equal(deck.remaining, 0);
  assert.throws(() => deck.draw(), RangeError);
  assertPartition(deck);
});

test('shared deal: two hands and vira consume seven different cards', () => {
  const game = new DemoGame({ rng: () => 0 });
  assert.equal(game.playerHand.length, 3);
  assert.equal(game.opponentHand.length, 3);
  assert.equal(game.vira.runtime.zone, 'vira');
  assert.equal(game.deck.remaining, 45);
  const dealt = [...game.playerHand, ...game.opponentHand, game.vira];
  assert.equal(new Set(dealt).size, 7);
  assert.ok(game.playerHand.every(card => card.runtime.ownerId === PLAYER_ID));
  assert.ok(game.opponentHand.every(card => card.runtime.ownerId === OPPONENT_ID));
  assertPartition(game.deck);
});

test('playing validates ownership, moves the same object once, and retains all metadata', () => {
  const game = new DemoGame();
  const card = game.playerHand[0];
  setEnchantment(card, { id: 'blood', level: 1 });
  addModifier(card, { id: 'm1', source: 'test', duration: 'hand', params: { amount: 2 } });
  const before = { enchantment: card.enchantment, modifiers: card.modifiers };
  assert.equal(game.play(game.opponentHand[0].instanceId), false);
  assert.equal(game.play(game.vira.instanceId), false);
  assert.equal(game.play(card.instanceId), true);
  assert.equal(game.playerHand.length, 2);
  assert.equal(game.table.length, 1);
  assert.equal(game.table[0], card);
  assert.equal(game.deck.getCard(card.instanceId), card);
  assert.equal(game.play(card.instanceId), false);
  assert.equal(card.enchantment, before.enchantment);
  assert.equal(card.modifiers, before.modifiers);
  assertPartition(game.deck);
});

test('one enchantment: add, reject stacking, explicit replace, remove, and retain JSON data', () => {
  const card = createCardInstance('hearts-K');
  assert.equal(card.enchantment, null);
  const data = { id: 'blood', level: 1 };
  setEnchantment(card, data);
  data.level = 99;
  assert.deepEqual(card.enchantment, { id: 'blood', level: 1 });
  assert.throws(() => setEnchantment(card, { id: 'other' }), /already/);
  setEnchantment(card, { id: 'other', level: 2 }, { replace: true });
  assert.deepEqual(removeEnchantment(card), { id: 'other', level: 2 });
  assert.equal(card.enchantment, null);
});

test('modifier IDs are individually managed; data cannot override card identity', () => {
  const card = createCardInstance('diamonds-10');
  const identity = [card.instanceId, card.definitionId, card.suit, card.rank];
  addModifier(card, { id: 'one', instanceId: 'fake', suit: 'clubs', rank: 'A', params: {} });
  addModifier(card, { id: 'two', duration: 'hand' });
  assert.throws(() => addModifier(card, { id: 'one' }), /Duplicate/);
  assert.equal(removeModifier(card, 'one').id, 'one');
  assert.deepEqual(card.modifiers.map(item => item.id), ['two']);
  assert.equal(removeModifier(card, 'absent'), null);
  assert.deepEqual([card.instanceId, card.definitionId, card.suit, card.rank], identity);
  assert.throws(() => addModifier(card, { id: 'fn', effect() {} }), TypeError);
  assert.throws(() => setEnchantment(card, [{ id: 'a' }, { id: 'b' }]), TypeError);
  assert.throws(() => setEnchantment(card, { id: 'bad', value: Infinity }), TypeError);
  const cyclic = { id: 'cyclic' };
  cyclic.params = cyclic;
  assert.throws(() => addModifier(card, cyclic), TypeError);
  assert.equal(card.modifiers.length, 1);
});

test('explicit collection keeps hand cards out and preserves objects and persistent metadata', () => {
  const game = new DemoGame();
  const original = game.deck.cards;
  const card = game.playerHand[0];
  setEnchantment(card, { id: 'blood', level: 1 });
  addModifier(card, { id: 'persist', params: {} });
  game.play(card.instanceId);
  const handCards = [...game.playerHand, ...game.opponentHand];
  assert.throws(() => game.deck.collectAndShuffle({ zones: ['playerHand'] }), RangeError);
  assert.equal(game.deck.collectAndShuffle({ zones: ['table', 'table', 'vira'], rng: () => 0 }), 2);
  assert.equal(game.deck.remaining, 47);
  assert.ok(handCards.every(card => card.runtime.zone.endsWith('Hand')));
  assert.equal(game.deck.getCard(card.instanceId), card);
  assert.equal(card.enchantment.id, 'blood');
  assert.equal(card.modifiers[0].id, 'persist');
  assert.deepEqual(game.deck.cards, original);
  assertPartition(game.deck);
});

test('new hand uses same pile and instances; exhaustion leaves the previous hand intact', () => {
  const game = new DemoGame();
  const deck = game.deck;
  const card = game.playerHand[0];
  setEnchantment(card, { id: 'blood' });
  game.newHand();
  assert.equal(game.deck, deck);
  assert.equal(deck.remaining, 38);
  assert.equal(card.runtime.zone, 'discard');
  assert.equal(card.enchantment.id, 'blood');
  assert.equal(deck.getCard(card.instanceId), card);
  while (deck.remaining >= 7) game.newHand();
  const before = JSON.stringify(deck);
  const number = game.handNumber;
  assert.throws(() => game.newHand(), RangeError);
  assert.equal(JSON.stringify(deck), before);
  assert.equal(game.handNumber, number);
  assertPartition(deck);
});

test('invalid RNG fails without partial shuffle or collection', () => {
  const deck = new Deck();
  deck.draw(2);
  const before = JSON.stringify(deck);
  for (const rng of [() => 1, () => -1, () => NaN]) {
    assert.throws(() => deck.shuffle(rng), RangeError);
    assert.throws(() => deck.collectAndShuffle({ rng }), RangeError);
    assert.equal(JSON.stringify(deck), before);
  }
});

test('logical snapshot contains JSON data only and supports lookup by stable instance ID', () => {
  const game = new DemoGame();
  const card = game.playerHand[0];
  addModifier(card, { id: 'sample', source: 'test', params: { values: [1, true, null] } });
  const snapshot = JSON.parse(JSON.stringify(game.deck));
  assert.equal(snapshot.cards.length, 52);
  assert.equal(snapshot.drawPile.length, 45);
  assert.deepEqual(snapshot.cards.find(item => item.instanceId === card.instanceId), { ...card });
  assert.equal('x' in card, false);
  assert.equal('strength' in card, false);
  assert.throws(() => game.deck.getCard('missing'), RangeError);
});

test('all 52 presentations include full rank (including 10), correct suit and color; hidden cards expose nothing', () => {
  for (const card of new Deck().cards) {
    const view = cardPresentation(card);
    assert.equal(view.rank, card.rank);
    assert.equal(view.face, `${card.rank}${view.symbol}`);
    assert.equal(view.red, ['hearts', 'diamonds'].includes(card.suit));
    assert.deepEqual(cardPresentation(card, { hidden: true }), { hidden: true });
  }
  assert.deepEqual(cardPresentation(null, { hidden: true }), { hidden: true });
});
