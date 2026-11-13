import { RANK_ORDER, SUIT_ORDER, getManilhaRank } from '../game/rules/CardStrength.js';
import { cardPresentation } from './cardPresentation.js';

const SUIT_NAMES = { clubs: 'Paus', hearts: 'Copas', spades: 'Espadas', diamonds: 'Ouros' };

// This reference accepts only the public vira, never a controller or a hand.
export function tableTips(vira) {
  const manilhaRank = vira ? getManilhaRank(vira) : null;
  return {
    ranks: [...RANK_ORDER].reverse().join(' > '),
    suits: [...SUIT_ORDER].reverse().map(suit => ({
      suit, name: SUIT_NAMES[suit], ...cardPresentation({ rank: manilhaRank ?? '4', suit }),
    })),
    vira: vira ? { rank: vira.rank, suit: vira.suit } : null,
    manilhaRank,
  };
}
