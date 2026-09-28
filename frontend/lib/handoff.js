// Hands a value from one page to the next within this tab (the family hub
// opens someone's day or gift ideas). Kept in memory only: nothing about
// the family lands in browser storage, and a reload starts fresh.
const pending = new Map();

export function handOff(key, value) {
  pending.set(key, value);
}

// The value handed to [key], once.
export function takeHandOff(key) {
  const value = pending.get(key);
  pending.delete(key);
  return value;
}

// The value handed to [key] without taking it: state initialisers may run
// twice, so pages read here and take the value in an effect.
export function peekHandOff(key) {
  return pending.get(key);
}
