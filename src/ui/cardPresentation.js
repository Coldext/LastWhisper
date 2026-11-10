// Public presentation data only. A hidden view receives no private card metadata.
const SYMBOLS = Object.freeze({ spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' });

export function cardPresentation(instance, { hidden = false } = {}) {
  if (hidden) return Object.freeze({ hidden: true });
  const symbol = SYMBOLS[instance?.suit];
  if (!symbol) throw new TypeError('A visible card needs a valid instance');
  return { hidden: false, rank: instance.rank, symbol,
    red: instance.suit === 'hearts' || instance.suit === 'diamonds',
    face: `${instance.rank}${symbol}` };
}
