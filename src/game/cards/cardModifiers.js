// Accept only JSON data. Clone so callers cannot later inject effects or mutate stored data.
function copyData(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype)) {
    if (ancestors.has(value)) throw new TypeError('Card metadata cannot contain circular references');
    ancestors.add(value);
    const result = Array.isArray(value)
      ? value.map(item => copyData(item, ancestors))
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyData(item, ancestors)]));
    ancestors.delete(value);
    return Object.freeze(result);
  }
  throw new TypeError('Card metadata must contain only JSON data');
}

function metadata(value) {
  if (!value || Array.isArray(value) || typeof value.id !== 'string' || !value.id.trim()) {
    throw new TypeError('Card metadata needs a nonempty ID');
  }
  return copyData(value);
}

export function setEnchantment(card, value, { replace = false } = {}) {
  if (card.enchantment !== null && !replace) throw new Error('Card already has an enchantment');
  card.enchantment = metadata(value);
  return card.enchantment;
}

export function removeEnchantment(card) {
  const previous = card.enchantment;
  card.enchantment = null;
  return previous;
}

export function addModifier(card, value) {
  const modifier = metadata(value);
  if (card.modifiers.some(item => item.id === modifier.id)) throw new Error('Duplicate modifier ID on card');
  card.modifiers = Object.freeze([...card.modifiers, modifier]);
  return modifier;
}

export function removeModifier(card, id) {
  const previous = card.modifiers.find(item => item.id === id) ?? null;
  card.modifiers = Object.freeze(card.modifiers.filter(item => item.id !== id));
  return previous;
}
