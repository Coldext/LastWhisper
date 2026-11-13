import test from 'node:test';
import assert from 'node:assert/strict';
import { tableTips } from '../src/ui/tableTips.js';
import { RANK_ORDER, SUIT_ORDER, isManilha, compareCards } from '../src/game/rules/CardStrength.js';

test('table reference agrees with actual comparisons and manilhas for every vira face', () => {
  for (const rank of RANK_ORDER) for (const suit of SUIT_ORDER) {
    const vira = Object.freeze({ rank, suit });
    const tips = tableTips(vira);
    assert.deepEqual(tips.vira, vira);
    assert.notEqual(tips.vira, vira);
    assert.equal(tips.suits.length, 4);
    for (const face of tips.suits) assert.ok(isManilha(face, vira));
    for (let index = 1; index < tips.suits.length; index++) {
      assert.equal(compareCards(tips.suits[index - 1], tips.suits[index], vira), 1);
    }
    const ordinary = tips.ranks.split(' > ').filter(value => value !== tips.manilhaRank);
    for (let index = 1; index < ordinary.length; index++) {
      assert.equal(compareCards({ rank: ordinary[index - 1], suit: 'diamonds' },
        { rank: ordinary[index], suit: 'diamonds' }, vira), 1);
    }
  }
  assert.equal(tableTips({ rank: '3', suit: 'diamonds' }).manilhaRank, '4');
});

test('reference only copies public rank/suit, without reading IDs, ownership or metadata', () => {
  const vira = { rank: 'Q', suit: 'hearts' };
  for (const key of ['instanceId', 'definitionId', 'runtime', 'enchantment', 'modifiers', 'opponentHand', 'deck']) {
    Object.defineProperty(vira, key, { enumerable: true, get() { throw new Error(`Private read: ${key}`); } });
  }
  const tips = tableTips(vira);
  assert.deepEqual(Object.keys(tips.vira), ['rank', 'suit']);
  assert.equal(tips.manilhaRank, 'K');
  assert.equal(JSON.stringify(tips).includes('instanceId'), false);
  assert.equal(tableTips(null).manilhaRank, null);
});
