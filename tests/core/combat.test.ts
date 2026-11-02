import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { d6, savingThreshold, succeeds, woundThreshold } from '../../packages/engine/dice';
import { hasLineOfSight, modelsInRange, resolveCombat } from '../../packages/engine/combat';
import { tacticalDeployed } from './fixtures';

describe('deterministic training dice', () => {
  it('produces a fixed seeded sequence and tracks random draws', () => {
    const random = { rng: 42, randomDraws: 0 };
    assert.deepEqual(Array.from({ length: 12 }, () => d6(random)), [6, 4, 3, 2, 6, 6, 6, 4, 1, 5, 4, 1]);
    assert.equal(random.randomDraws, 12);
  });
  it('rejects the top three nonzero xorshift states before modulo sampling', () => {
    // Inverse xorshift computed for next state 0xffffffff; this candidate must be rejected.
    function unleft(v: number, shift: number): number { let result = v; for (let i = 0; i < 32; i++) result = v ^ (result << shift); return result >>> 0; }
    function unright(v: number, shift: number): number { let result = v; for (let i = 0; i < 32; i++) result = v ^ (result >>> shift); return result >>> 0; }
    const seed = unleft(unright(unleft(0xffffffff, 5), 17), 13);
    const state = { rng: seed, randomDraws: 0 };
    const result = d6(state);
    assert.ok(result >= 1 && result <= 6);
    assert.equal(state.randomDraws, 2);
  });
  it('has a repeatable broad distribution smoke check over 120000 rolls', () => {
    const random = { rng: 1234567, randomDraws: 0 }, buckets = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 120000; i++) buckets[d6(random) - 1]++;
    for (const count of buckets) assert.ok(count > 19300 && count < 20700, `Unexpected distribution: ${buckets}`);
  });
  it('defines threshold and save selection for the original training rules', () => {
    assert.deepEqual([woundThreshold(8, 4), woundThreshold(5, 4), woundThreshold(4, 4), woundThreshold(3, 4), woundThreshold(2, 4)], [2, 3, 4, 5, 6]);
    assert.equal(savingThreshold(3, 2), 5);
    assert.equal(savingThreshold(3, 3, 4), 4);
    assert.equal(savingThreshold(3, -2), 5);
    assert.equal(succeeds(1, 10, 2), false);
    assert.equal(succeeds(6, -10, 2), true);
  });
});

describe('individual training combat', () => {
  it('uses actual deterministic hit, wound and save dice, without damage spill', () => {
    const state = tacticalDeployed();
    const shooter = state.units[0], target = state.units[2];
    shooter.models[0].x = 25;
    state.rng = 25; state.randomDraws = 0;
    target.models[0].wounds = 1;
    const weapon = { ...state.pack.units[0].weapons[0], attacks: 1, damage: 12 };
    const result = resolveCombat(state, shooter, target, weapon);
    assert.equal(result.attacks, 1); assert.equal(result.hits, 1); assert.equal(result.wounds, 1);
    assert.equal(result.destroyed, 1); assert.equal(result.damage, 1);
    assert.equal(target.models.length, 1); assert.equal(target.models[0].wounds, 3);
    assert.deepEqual(result.dice.map(die => die.raw), [6, 2, 6]);
  });
  it('applies defender invulnerable saves despite AP', () => {
    const state = tacticalDeployed();
    state.units[0].models[0].x = 25;
    state.pack.units[1].invulnerable = 2;
    state.rng = 25;
    const result = resolveCombat(state, state.units[0], state.units[2], state.pack.units[0].weapons[0]);
    assert.equal(result.damage, 0);
    assert.equal(result.dice.at(-1)?.note, 'Invulnerable save');
  });
  it('logs hit rerolls once and charges no extra random roll when unnecessary', () => {
    const state = tacticalDeployed(); state.rng = 1;
    state.units[0].models[0].x = 25;
    const weapon = { ...state.pack.units[0].weapons[0], skill: 6 };
    const result = resolveCombat(state, state.units[0], state.units[2], weapon, true);
    assert.equal(result.hits, 0); assert.equal(result.dice[0].raw, 3); assert.equal(result.dice[0].reroll, 1);
  });
  it('torrent is automatic and cannot create critical hit effects', () => {
    const state = tacticalDeployed(); state.rng = 25; state.units[0].models[0].x = 25;
    const weapon = { ...state.pack.units[0].weapons[0], abilities: ['torrent', 'sustained', 'lethal'] as const };
    const result = resolveCombat(state, state.units[0], state.units[2], { ...weapon, abilities: [...weapon.abilities] });
    assert.equal(result.hits, 1);
    assert.equal(result.dice[0].raw, 0);
    assert.ok(result.dice.some(die => die.stage === 'wound' && die.raw > 0));
  });
  it('critical lethal plus sustained separates automatic and rolled wounds', () => {
    const state = tacticalDeployed(); state.rng = 25; state.units[0].models[0].x = 25;
    const weapon = { ...state.pack.units[0].weapons[0], damage: 1, abilities: ['lethal', 'sustained'] as const };
    const result = resolveCombat(state, state.units[0], state.units[2], { ...weapon, abilities: [...weapon.abilities] });
    assert.equal(result.hits, 2);
    assert.ok(result.dice.some(die => die.stage === 'wound' && die.raw === 0));
    assert.ok(result.dice.some(die => die.stage === 'wound' && die.raw > 0));
  });
  it('a lethal automatic wound cannot trigger devastating wounds', () => {
    const state = tacticalDeployed(); state.rng = 25; state.units[0].models[0].x = 25;
    const weapon = { ...state.pack.units[0].weapons[0], abilities: ['lethal', 'devastating'] as const };
    const result = resolveCombat(state, state.units[0], state.units[2], { ...weapon, abilities: [...weapon.abilities] });
    assert.ok(result.dice.some(die => die.stage === 'save' && die.raw > 0));
  });
  it('a critical wound can bypass the training save', () => {
    const state = tacticalDeployed(); state.rng = 25; state.units[0].models[0].x = 25;
    const weapon = { ...state.pack.units[0].weapons[0], abilities: ['torrent', 'devastating'] as const };
    const result = resolveCombat(state, state.units[0], state.units[2], { ...weapon, abilities: [...weapon.abilities] });
    assert.ok(result.dice.some(die => die.stage === 'save' && die.raw === 0 && die.success === false));
  });
  it('training cover worsens hits and heavy rewards declared stationary', () => {
    const state = tacticalDeployed(); state.rng = 25;
    state.units[0].models[0].x = 18; state.units[0].moveType = 'stationary';
    state.units[2].models.forEach((model, i) => { model.x = 22 + i * 1.1; model.y = 15; });
    const weapon = { ...state.pack.units[0].weapons[0], abilities: ['heavy'] as const };
    const result = resolveCombat(state, state.units[0], state.units[2], { ...weapon, abilities: [...weapon.abilities] });
    assert.equal(result.dice[0].modifier, 0);
    assert.match(result.dice[0].note ?? '', /cover/);
  });
  it('range and centre ray visibility exclude ineligible firing models', () => {
    const state = tacticalDeployed();
    const shooter = state.units[0], target = state.units[2], weapon = state.pack.units[0].weapons[0];
    shooter.models[0].x = 20; shooter.models[0].y = 5;
    target.models.forEach(model => { model.x = 30; model.y = 5; });
    assert.equal(hasLineOfSight(state, shooter.models[0], target.models[0]), false);
    assert.equal(modelsInRange(state, shooter, target, weapon).length, 0);
    shooter.models[0].y = 15; target.models.forEach(model => { model.y = 15; });
    assert.equal(modelsInRange(state, shooter, target, { ...weapon, range: 5 }).length, 0);
    assert.equal(modelsInRange(state, shooter, target, weapon).length, 1);
  });
});
