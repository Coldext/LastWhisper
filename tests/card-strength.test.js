import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_DEFINITIONS, RANKS, SUITS } from '../src/game/cards/cardDefinitions.js';
import { createCardInstance } from '../src/game/cards/cardFactory.js';
import { addModifier, setEnchantment } from '../src/game/cards/cardModifiers.js';
import {
  RANK_ORDER, SUIT_ORDER, getManilhaRank, isManilha, getCardStrength, compareCards,
} from '../src/game/rules/CardStrength.js';

const ranks = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '3'];
const suits = ['diamonds', 'spades', 'hearts', 'clubs'];
const card = (rank, suit = 'diamonds') => ({ rank, suit });

test('rule orders are complete, immutable and independent of definition order', () => {
  assert.deepEqual(RANK_ORDER, ranks);
  assert.deepEqual(SUIT_ORDER, suits);
  assert.deepEqual(new Set(RANK_ORDER), new Set(RANKS));
  assert.deepEqual(new Set(SUIT_ORDER), new Set(SUITS));
  assert.ok(Object.isFrozen(RANK_ORDER));
  assert.ok(Object.isFrozen(SUIT_ORDER));
  assert.throws(() => RANK_ORDER.reverse(), TypeError);
  assert.throws(() => SUIT_ORDER.push('joker'), TypeError);
  assert.deepEqual(RANKS, ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
  assert.deepEqual(SUITS, ['spades', 'hearts', 'diamonds', 'clubs']);
});

test('every vira value and suit produces the next rank, including 3 -> 4', () => {
  for (const [index, rank] of ranks.entries()) {
    for (const suit of suits) {
      assert.equal(getManilhaRank(card(rank, suit)), ranks[(index + 1) % ranks.length]);
    }
  }
  let rank = '4';
  for (let i = 0; i < ranks.length; i++) rank = getManilhaRank(card(rank));
  assert.equal(rank, '4');
});

test('all 52 cards compare correctly for every vira, including all suit tie-breaks', () => {
  for (const [index, viraRank] of ranks.entries()) {
    const vira = card(viraRank);
    const manilhaRank = ranks[(index + 1) % ranks.length];
    // Independent oracle: ordinary faces in rank/suit order, followed by manilhas.
    const orderedRanks = [...ranks.filter(rank => rank !== manilhaRank), manilhaRank];
    const faces = orderedRanks.flatMap(rank => suits.map(suit => `${suit}-${rank}`));
    for (const first of CARD_DEFINITIONS) {
      assert.equal(isManilha(first, vira), first.rank === manilhaRank);
      assert.ok(Number.isInteger(getCardStrength(first, vira)));
      for (const second of CARD_DEFINITIONS) {
        const expected = Math.sign(faces.indexOf(first.definitionId) - faces.indexOf(second.definitionId));
        assert.equal(compareCards(first, second, vira), expected,
          `${first.definitionId} vs ${second.definitionId}, vira ${viraRank}`);
        assert.equal(Math.sign(getCardStrength(first, vira) - getCardStrength(second, vira)), expected);
      }
    }
  }
});

test('lowest manilha beats the highest ordinary card even across the circular boundary', () => {
  const vira = card('3');
  assert.equal(compareCards(card('4', 'diamonds'), card('3', 'clubs'), vira), 1);
  assert.equal(compareCards(card('3', 'clubs'), card('4', 'diamonds'), vira), -1);
  assert.equal(compareCards(card('4', 'clubs'), card('4', 'hearts'), vira), 1);
});

test('definitions, plain data and distinct instances with equal faces compare equally', () => {
  const definition = CARD_DEFINITIONS.find(item => item.definitionId === 'hearts-K');
  const first = createCardInstance(definition.definitionId);
  const second = createCardInstance(definition.definitionId);
  const vira = createCardInstance('clubs-Q');
  assert.notEqual(first.instanceId, second.instanceId);
  for (const other of [first, second, definition, card('K', 'hearts')]) {
    assert.equal(compareCards(first, other, vira), 0);
    assert.equal(isManilha(other, vira), true);
    assert.equal(getCardStrength(other, vira), 54);
  }
});

test('strength is contextual and preserves identity, location and metadata', () => {
  const instance = createCardInstance('diamonds-4');
  setEnchantment(instance, { id: 'blood', level: 1 });
  addModifier(instance, { id: 'sample', params: { amount: 99 } });
  const vira = Object.freeze(card('3'));
  const other = Object.freeze(card('3', 'clubs'));
  const references = [instance.runtime, instance.enchantment, instance.modifiers];
  const before = JSON.stringify([instance, vira, other]);
  assert.equal(getCardStrength(instance, vira), 52);
  assert.equal(getCardStrength(instance, card('4')), 0);
  assert.equal(isManilha(instance, vira), true);
  assert.equal(compareCards(instance, other, vira), 1);
  assert.equal(getManilhaRank(vira), '4');
  assert.equal(JSON.stringify([instance, vira, other]), before);
  assert.equal(instance.runtime, references[0]);
  assert.equal(instance.enchantment, references[1]);
  assert.equal(instance.modifiers, references[2]);
  assert.equal(Object.hasOwn(instance, 'strength'), false);
});

test('all entry points reject malformed cards and viras without coercion or mutation', () => {
  const valid = Object.freeze(card('A', 'clubs'));
  const invalidTypes = [undefined, null, false, 4, '4', 'clubs-A', [], {},
    { rank: '4' }, { suit: 'clubs' }, card(4), card('4', 1),
    card(new String('4')), card('4', new String('clubs'))];
  const invalidValues = [card(''), card('a'), card('04'), card(' 4'), card('Joker'),
    card('4', ''), card('4', 'Clubs'), card('4', ' club'), card('4', 'joker')];
  for (const [inputs, error] of [[invalidTypes, TypeError], [invalidValues, RangeError]]) {
    for (const invalid of inputs) {
      assert.throws(() => getManilhaRank(invalid), error);
      assert.throws(() => isManilha(invalid, valid), error);
      assert.throws(() => isManilha(valid, invalid), error);
      assert.throws(() => getCardStrength(invalid, valid), error);
      assert.throws(() => getCardStrength(valid, invalid), error);
      assert.throws(() => compareCards(invalid, valid, valid), error);
      assert.throws(() => compareCards(valid, invalid, valid), error);
      assert.throws(() => compareCards(valid, valid, invalid), error);
      // Invalid input must still be rejected when a manilha could decide early.
      assert.throws(() => compareCards(card('2'), invalid, valid), error);
    }
  }
  assert.throws(() => getManilhaRank(), TypeError);
  assert.throws(() => isManilha(valid), TypeError);
  assert.throws(() => getCardStrength(valid), TypeError);
  assert.throws(() => compareCards(valid, valid), TypeError);
  assert.deepEqual(valid, card('A', 'clubs'));
});
