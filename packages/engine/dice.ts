import type { GameState } from '../shared/types';

export interface RandomState { rng: number; randomDraws: number }

/** xorshift32 returns 1..2^32-1. Reject the top three states before modulo-six. */
export function d6(state: RandomState): number {
  let sample: number;
  do {
    let x = state.rng >>> 0;
    if (x === 0) x = 0x9e3779b9;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    state.rng = x >>> 0;
    state.randomDraws++;
    sample = state.rng - 1;
  } while (sample >= 4294967292);
  return sample % 6 + 1;
}

export function twoD6(state: Pick<GameState, 'rng' | 'randomDraws'>): [number, number] { return [d6(state), d6(state)]; }

/** Original training wound table; this is not a certification of an edition's combat rules. */
export function woundThreshold(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

export function succeeds(raw: number, modifier: number, target: number): boolean { return raw !== 1 && (raw === 6 || raw + modifier >= target); }

export function savingThreshold(armour: number, ap: number, invulnerable?: number): number {
  return Math.min(armour + Math.abs(ap), invulnerable ?? Infinity);
}
