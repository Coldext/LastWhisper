import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchController, MATCH_PHASES, PLAYER_IDS } from '../src/game/MatchController.js';
import { Deck, ZONES } from '../src/game/deck/Deck.js';
import { addModifier, setEnchantment } from '../src/game/cards/cardModifiers.js';

// Arrange real Deck instances through its injected Fisher-Yates RNG, without
// changing card models or bypassing the controller's alternating distribution.
function fixture(player, opponent, vira = 'clubs-8', firstPlayerId = 'player') {
  const deck = new Deck();
  const hands = { player, opponent };
  const order = [firstPlayerId, PLAYER_IDS.find(id => id !== firstPlayerId)];
  const top = [0, 1, 2].flatMap(index => order.map(id => hands[id][index]));
  top.push(vira);
  assert.equal(new Set(top).size, 7);
  const simulated = deck.drawPile.map(card => card.definitionId);
  const target = [...simulated.filter(id => !top.includes(id)), ...top.toReversed()];
  let index = simulated.length - 1;
  const match = new MatchController({ deck, firstPlayerId, rng: () => {
    const selected = simulated.indexOf(target[index]);
    assert.ok(selected <= index);
    const random = (selected + 0.5) / (index + 1);
    [simulated[index], simulated[selected]] = [simulated[selected], simulated[index]];
    index--;
    return random;
  } });
  match.startHand();
  match.deal();
  return match;
}

function playPair(match, faces) {
  const played = [];
  for (let turn = 0; turn < 2; turn++) {
    const playerId = match.activePlayerId;
    const card = match.handOf(playerId).find(card => card.definitionId === faces[playerId]);
    assert.ok(card);
    assert.equal(match.play(playerId, card.instanceId), true);
    played.push({ playerId, instanceId: card.instanceId, definitionId: card.definitionId,
      rank: card.rank, suit: card.suit });
  }
  assert.equal(match.phase, MATCH_PHASES.RESOLVING_TRICK);
  return played;
}

function state(match) {
  return JSON.stringify({ deck: match.deck, phase: match.phase, active: match.activePlayerId,
    hand: match.handNumber, first: match.firstPlayerId, plays: match.plays,
    tricks: match.tricks, wins: match.trickWins, results: match.handResults,
    winner: match.handWinnerId });
}

function partition(match) {
  const all = ZONES.flatMap(zone => match.deck.cardsIn(zone));
  assert.equal(all.length, 52);
  assert.equal(new Set(all.map(card => card.instanceId)).size, 52);
  assert.deepEqual(new Set(match.deck.drawPile), new Set(match.deck.cardsIn('deck')));
}

test('all two- and three-trick victory sequences work for either initial starter', () => {
  for (const initial of PLAYER_IDS) {
    for (const sequence of ['PP', 'OO', 'POP', 'OPP', 'POO', 'OPO']) {
      const winners = [...sequence].map(letter => letter === 'P' ? 'player' : 'opponent');
      const high = ['3', '2', 'A'];
      const low = ['4', '5', '6'];
      const player = high.map((rank, i) => `diamonds-${winners[i] === 'player' ? rank : low[i]}`);
      const opponent = high.map((rank, i) => `hearts-${winners[i] === 'opponent' ? rank : low[i]}`);
      const match = fixture(player, opponent, 'clubs-8', initial);
      assert.deepEqual(match.tricks, []);
      assert.deepEqual(match.handResults, []);
      assert.deepEqual(match.trickWins, { player: 0, opponent: 0 });
      assert.equal(match.handResult, null);
      assert.equal(match.handWinnerId, null);
      const vira = match.vira;
      const wins = { player: 0, opponent: 0 };
      for (const [i, winnerId] of winners.entries()) {
        assert.equal(match.activePlayerId, i === 0 ? initial : winners[i - 1]);
        const plays = playPair(match, { player: player[i], opponent: opponent[i] });
        const beforeResolution = JSON.stringify(match.deck);
        const result = match.resolveTrick();
        wins[winnerId]++;
        assert.equal(result.winnerId, winnerId);
        assert.equal(result.trickNumber, i + 1);
        assert.equal(result.handNumber, 1);
        assert.deepEqual(result.plays, plays);
        assert.equal(result.vira.instanceId, vira.instanceId);
        assert.deepEqual(match.trickWins, wins);
        assert.equal(match.tricks[i], result);
        assert.deepEqual(match.plays, []);
        assert.equal(JSON.stringify(match.deck), beforeResolution);
        assert.equal(match.deck.cardsIn('table').length, 2 * (i + 1));
        assert.equal(match.handOf('player').length, 2 - i);
        assert.equal(match.handOf('opponent').length, 2 - i);
        assert.equal(match.deck.remaining, 45);
        assert.equal(match.vira, vira);
        partition(match);
        if (i < winners.length - 1) {
          assert.equal(match.phase, MATCH_PHASES.AWAITING_PLAY);
          assert.equal(match.activePlayerId, winnerId);
          assert.equal(match.handWinnerId, null);
        }
      }
      const winnerId = winners.at(-1);
      assert.equal(match.phase, MATCH_PHASES.HAND_COMPLETE);
      assert.equal(match.activePlayerId, null);
      assert.equal(match.handWinnerId, winnerId);
      assert.equal(match.handResult.winnerId, winnerId);
      assert.deepEqual(match.handResult.trickWins, wins);
      assert.deepEqual(match.handResult.tricks, match.tricks);
      assert.equal(match.handResults.length, 1);
      const before = state(match);
      for (const id of PLAYER_IDS) {
        for (const card of match.deck.cards) assert.equal(match.play(id, card.instanceId), false);
      }
      assert.throws(() => match.resolveTrick(), /phase/);
      assert.equal(state(match), before);
      // A sweep leaves the third pair unplayed in the hands.
      assert.equal(match.tricks.length, winners.length);
    }
  }
});

test('manilha uses the current vira, including 3 -> 4, and suits decide between manilhas', () => {
  for (const [vira, expected] of [['spades-3', 'player'], ['spades-4', 'opponent']]) {
    const match = fixture(['diamonds-4', 'hearts-4', 'diamonds-A'],
      ['clubs-3', 'clubs-4', 'spades-2'], vira);
    playPair(match, { player: 'diamonds-4', opponent: 'clubs-3' });
    assert.equal(match.resolveTrick().winnerId, expected);
    playPair(match, { player: 'hearts-4', opponent: 'clubs-4' });
    assert.equal(match.resolveTrick().winnerId, 'opponent');
    if (expected === 'player') {
      playPair(match, { player: 'diamonds-A', opponent: 'spades-2' });
      assert.equal(match.resolveTrick().winnerId, 'opponent');
    }
    assert.equal(match.handWinnerId, 'opponent');
  }
});

test('suits break ordinary equal ranks, including every adjacent suit', () => {
  for (const [weaker, stronger] of [['diamonds', 'spades'], ['spades', 'hearts'], ['hearts', 'clubs']]) {
    const match = fixture([`${weaker}-Q`, 'diamonds-4', 'diamonds-5'],
      [`${stronger}-Q`, 'spades-4', 'spades-5']);
    playPair(match, { player: `${weaker}-Q`, opponent: `${stronger}-Q` });
    assert.equal(match.resolveTrick().winnerId, 'opponent');
    assert.equal(match.activePlayerId, 'opponent');
  }
});

test('resolution requires a complete pair and cannot repeat or interrupt a live turn', () => {
  const match = fixture(['diamonds-3', 'diamonds-2', 'diamonds-A'],
    ['hearts-4', 'hearts-5', 'hearts-6']);
  const reject = () => {
    const before = state(match);
    assert.throws(() => match.resolveTrick(), /phase/);
    assert.equal(state(match), before);
  };
  reject();
  const first = match.handOf('player').find(card => card.rank === '3');
  assert.equal(match.play('player', first.instanceId), true);
  reject();
  assert.equal(match.play('opponent', match.handOf('opponent')[0].instanceId), true);
  const pending = state(match);
  assert.equal(match.play('player', match.handOf('player')[0].instanceId), false);
  assert.equal(state(match), pending);
  match.resolveTrick();
  reject();
  const before = state(match);
  assert.equal(match.play('opponent', match.handOf('opponent')[0].instanceId), false);
  assert.equal(match.play('player', 'missing'), false);
  assert.throws(() => match.startHand(), /phase/);
  assert.equal(state(match), before);
  assert.equal(typeof match.completeHand, 'undefined'); // No premature-completion bypass.
});

test('used cards remain unavailable across tricks, including if moved back externally', () => {
  const match = fixture(['diamonds-3', 'diamonds-2', 'diamonds-A'],
    ['hearts-4', 'hearts-5', 'hearts-6']);
  const played = playPair(match, { player: 'diamonds-3', opponent: 'hearts-4' });
  match.resolveTrick();
  const selected = played[0];
  assert.equal(match.activePlayerId, 'player');
  const before = state(match);
  assert.equal(match.play('player', selected.instanceId), false);
  assert.equal(state(match), before);
  match.deck.move(selected.instanceId, { from: 'table', to: 'playerHand', ownerId: 'player' });
  const moved = state(match);
  assert.equal(match.canPlay('player', selected.instanceId), false);
  assert.equal(match.play('player', selected.instanceId), false);
  assert.equal(state(match), moved);
});

test('inconsistent pending card or vira locations fail before recording any result', () => {
  for (const target of ['card-zone', 'card-owner', 'vira']) {
    const match = fixture(['diamonds-3', 'diamonds-2', 'diamonds-A'],
      ['hearts-4', 'hearts-5', 'hearts-6']);
    const plays = playPair(match, { player: 'diamonds-3', opponent: 'hearts-4' });
    const id = target === 'vira' ? match.vira.instanceId : plays[0].instanceId;
    match.deck.move(id, { from: target === 'vira' ? 'vira' : 'table', to: 'discard' });
    if (target === 'card-owner') {
      match.deck.move(id, { from: 'discard', to: 'table', ownerId: 'opponent' });
    }
    const before = state(match);
    assert.throws(() => match.resolveTrick(), /locations/);
    assert.equal(state(match), before);
    assert.equal(match.tricks.length, 0);
    assert.equal(match.handResults.length, 0);
    partition(match);
  }
});

test('history is immutable, serializable and survives next-hand discard with metadata intact', () => {
  const match = fixture(['diamonds-3', 'diamonds-2', 'diamonds-A'],
    ['hearts-4', 'hearts-5', 'hearts-6']);
  const identities = match.deck.cards;
  const marked = match.handOf('player').find(card => card.rank === '3');
  setEnchantment(marked, { id: 'blood' });
  addModifier(marked, { id: 'persistent', params: { amount: 7 } });
  const enchantment = marked.enchantment;
  const modifiers = marked.modifiers;
  for (const [player, opponent] of [['diamonds-3', 'hearts-4'], ['diamonds-2', 'hearts-5']]) {
    playPair(match, { player, opponent });
    match.resolveTrick();
  }
  const result = match.handResult;
  const before = JSON.stringify(result);
  assert.deepEqual(JSON.parse(before), result);
  assert.throws(() => { result.winnerId = 'opponent'; }, TypeError);
  assert.throws(() => { result.trickWins.player = 0; }, TypeError);
  assert.throws(() => result.tricks.pop(), TypeError);
  assert.throws(() => { result.tricks[0].winnerId = 'opponent'; }, TypeError);
  assert.throws(() => result.tricks[0].plays.pop(), TypeError);
  assert.throws(() => { result.tricks[0].plays[0].rank = '4'; }, TypeError);
  assert.throws(() => { result.tricks[0].vira.rank = '3'; }, TypeError);
  match.tricks.pop();
  match.handResults.pop();
  assert.equal(match.tricks.length, 2);
  assert.equal(match.handResults.length, 1);
  const oldCards = [...match.handOf('player'), ...match.handOf('opponent'),
    ...match.deck.cardsIn('table'), match.vira];
  match.startHand();
  match.deal();
  assert.equal(match.firstPlayerId, 'opponent');
  assert.equal(match.activePlayerId, 'opponent');
  assert.deepEqual(match.tricks, []);
  assert.deepEqual(match.trickWins, { player: 0, opponent: 0 });
  assert.equal(match.handResult, null);
  assert.equal(match.handWinnerId, null);
  assert.equal(match.handResults[0], result);
  assert.equal(JSON.stringify(result), before);
  assert.ok(oldCards.every(card => card.runtime.zone === 'discard'));
  assert.deepEqual(match.deck.cards, identities);
  assert.equal(match.deck.getCard(marked.instanceId), marked);
  assert.equal(marked.enchantment, enchantment);
  assert.equal(marked.modifiers, modifiers);
  partition(match);
  while (match.phase !== MATCH_PHASES.HAND_COMPLETE) {
    for (let turn = 0; turn < 2; turn++) {
      const id = match.activePlayerId;
      assert.equal(match.play(id, match.handOf(id)[0].instanceId), true);
    }
    match.resolveTrick();
  }
  assert.equal(match.handResults.length, 2);
  assert.equal(match.handResults[1].handNumber, 2);
  assert.equal(JSON.stringify(match.handResults[0]), before);
});
