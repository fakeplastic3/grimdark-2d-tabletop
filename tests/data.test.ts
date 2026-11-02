import { describe, expect, it } from 'vitest';
import { armyPoints, defaultArmies, TRAINING_PACK, validateArmy } from '../packages/rules-data';
import { armySchema, parseAction, parseConfig, parseRulesPack } from '../packages/shared/validation';
import type { Army, GameConfig, RulesPack } from '../packages/shared/types';

const packCopy = (): RulesPack => structuredClone(TRAINING_PACK);
const blueArmy = (): Army => structuredClone(defaultArmies()[0]);
const config = (): GameConfig => ({
  armies: defaultArmies(), pointsLimit: 500, rounds: 5, seed: 42,
  layout: 'foundry', mode: 'training',
});

describe('training rules pack schema and trust boundary', () => {
  it('accepts the shipped pack and preserves its explicit training status', () => {
    const parsed = parseRulesPack(TRAINING_PACK);
    expect(parsed.status).toBe('training');
    expect(parsed).toEqual(TRAINING_PACK);
    expect(parsed).not.toBe(TRAINING_PACK);
  });

  it.each(['official', 'verified', '11th-edition', '10th-edition'])('rejects a private pack claiming status %s', status => {
    expect(() => parseRulesPack({ ...packCopy(), status })).toThrow();
  });

  it('rejects extra executable or unsupported rules fields instead of silently ignoring them', () => {
    const pack = packCopy();
    expect(() => parseRulesPack({ ...pack, script: 'arbitrary-code' })).toThrow();
    expect(() => parseRulesPack({ ...pack, units: pack.units.map((u, i) => i ? u : { ...u, effects: [{ trigger: 'start-phase' }] }) })).toThrow();
  });

  it('rejects duplicate unit, formation and per-unit weapon identifiers', () => {
    const units = packCopy();
    units.units[1].id = units.units[0].id;
    expect(() => parseRulesPack(units)).toThrow(/Duplicate data IDs/);
    const formations = packCopy();
    formations.detachments[1].id = formations.detachments[0].id;
    expect(() => parseRulesPack(formations)).toThrow(/Duplicate data IDs/);
    const weapons = packCopy();
    weapons.units[0].weapons[1].id = weapons.units[0].weapons[0].id;
    expect(() => parseRulesPack(weapons)).toThrow(/duplicate weapon IDs/);
  });

  it('requires exactly one price for each distinct allowed squad size', () => {
    const noPrice = packCopy();
    noPrice.units[0].points.pop();
    expect(() => parseRulesPack(noPrice)).toThrow(/one price/);
    const extraPrice = packCopy();
    extraPrice.units[0].points.push(200);
    expect(() => parseRulesPack(extraPrice)).toThrow(/one price/);
    const repeatedCount = packCopy();
    repeatedCount.units[0].modelCounts = [3, 3];
    expect(() => parseRulesPack(repeatedCount)).toThrow(/distinct model count/);
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite numeric content (%s)', value => {
    const pack = packCopy();
    pack.units[0].move = value;
    expect(() => parseRulesPack(pack)).toThrow();
  });

  it('rejects unsupported factions, oversized bases and unknown weapon abilities', () => {
    const pack = packCopy();
    const unit = pack.units[0];
    expect(() => parseRulesPack({ ...pack, units: [{ ...unit, faction: 'unknown' }, ...pack.units.slice(1)] })).toThrow();
    expect(() => parseRulesPack({ ...pack, units: [{ ...unit, baseMm: 1000 }, ...pack.units.slice(1)] })).toThrow();
    expect(() => parseRulesPack({ ...pack, units: [{ ...unit, weapons: [{ ...unit.weapons[0], abilities: ['unsupported-rule'] }] }, ...pack.units.slice(1)] })).toThrow();
  });

  it.each([0, 4, 1.5])('rejects invalid formation cost %s', cost => {
    const pack = packCopy();
    pack.detachments[0].cost = cost;
    expect(() => parseRulesPack(pack)).toThrow();
  });
});

describe('army construction and costs', () => {
  it('provides valid starting armies for both team identities', () => {
    for (const army of defaultArmies()) {
      expect(armySchema.safeParse(army).success).toBe(true);
      expect(validateArmy(army)).toEqual([]);
    }
    expect(defaultArmies().map(army => armyPoints(army))).toEqual([210, 180]);
  });

  it('prices the selected model count rather than multiplying a flat unit price', () => {
    const army = blueArmy();
    army.entries[0].count = 5;
    expect(armyPoints(army)).toBe(260);
  });

  it('accepts exactly the budget and rejects a one-point excess', () => {
    const army = blueArmy();
    army.entries[0].count = 5;
    expect(validateArmy(army, TRAINING_PACK, 260)).toEqual([]);
    expect(validateArmy(army, TRAINING_PACK, 259)).toContain('260 points exceeds the 259 budget.');
  });

  it.each([249, 3001, 500.5, NaN])('rejects unsupported training budget %s', budget => {
    expect(validateArmy(blueArmy(), TRAINING_PACK, budget)).toContain('Training budget must be 250–3000 points.');
  });

  it('rejects a unit from the other faction even if its cost and squad size are valid', () => {
    const army = blueArmy();
    army.entries[0] = { definitionId: 'green-raiders', count: 5 };
    expect(validateArmy(army).some(error => error.includes('belongs to the other faction'))).toBe(true);
  });

  it('rejects unknown units and unsupported model counts instead of treating zero displayed cost as legal', () => {
    const unknown = blueArmy();
    unknown.entries[0].definitionId = 'missing-unit';
    expect(validateArmy(unknown)).toContain('Unknown unit: missing-unit');
    const wrongCount = blueArmy();
    wrongCount.entries[0].count = 4;
    expect(validateArmy(wrongCount)).toContain('Azure line squad: choose 3 or 5 models.');
  });

  it('enforces required commanders and per-profile copy limits', () => {
    const commanderless = blueArmy();
    commanderless.entries = commanderless.entries.filter(entry => entry.definitionId !== 'blue-command');
    expect(validateArmy(commanderless)).toContain('Training armies require a commander.');
    const duplicatedCommander = blueArmy();
    duplicatedCommander.entries.push({ definitionId: 'blue-command', count: 1 });
    expect(validateArmy(duplicatedCommander)).toContain('Azure field commander: maximum 1 copies.');
    const tooManyLines = blueArmy();
    tooManyLines.entries.push({ definitionId: 'blue-line', count: 3 }, { definitionId: 'blue-line', count: 3 });
    expect(validateArmy(tooManyLines)).toContain('Azure line squad: maximum 3 copies.');
  });

  it('rejects no formation, duplicate formations, missing formations and opposite-faction formations', () => {
    const army = blueArmy();
    expect(validateArmy({ ...army, detachmentIds: [] })).toContain('Select a training formation.');
    expect(validateArmy({ ...army, detachmentIds: ['ultramarines-line', 'ultramarines-line'] })).toContain('A formation cannot be selected twice.');
    expect(validateArmy({ ...army, detachmentIds: ['missing'] })).toContain('Formation is unavailable for this faction.');
    expect(validateArmy({ ...army, detachmentIds: ['orks-line'] })).toContain('Formation is unavailable for this faction.');
  });

  it('enforces size-dependent formation budgets at their boundary', () => {
    const army = { ...blueArmy(), detachmentIds: ['ultramarines-line', 'ultramarines-spear'] };
    expect(validateArmy(army, TRAINING_PACK, 1000)).toContain('Formation cost 3 exceeds the training allowance of 2.');
    expect(validateArmy(army, TRAINING_PACK, 1001)).toEqual([]);
  });

  it('rejects empty armies and whitespace-only names', () => {
    expect(validateArmy({ ...blueArmy(), entries: [] })).toContain('Choose between 1 and 30 units.');
    expect(validateArmy({ ...blueArmy(), name: '   ' })).toContain('Give your army a name of 1–80 characters.');
  });
});

describe('configuration and action schemas', () => {
  it('accepts a bounded training configuration', () => {
    expect(parseConfig(config())).toEqual(config());
  });

  it('rejects unknown factions and unsupported official game modes', () => {
    const value = config();
    expect(() => parseConfig({ ...value, mode: 'official' })).toThrow();
    expect(() => parseConfig({ ...value, armies: [{ ...value.armies[0], faction: 'unknown' }, value.armies[1]] })).toThrow();
  });

  it('rejects unsupported versions, bad rounds and a seed outside the uint32 range', () => {
    expect(() => parseRulesPack({ ...packCopy(), schemaVersion: 2 })).toThrow();
    expect(() => parseConfig({ ...config(), rounds: 0 })).toThrow();
    expect(() => parseConfig({ ...config(), seed: 4294967296 })).toThrow();
  });

  it('only accepts actions with authorized schema fields', () => {
    const valid = { type: 'chargeRoll', player: 0, unitId: 'p0-u0' };
    expect(parseAction(valid)).toEqual(valid);
    expect(() => parseAction({ ...valid, roll: 12 })).toThrow();
    expect(() => parseAction({ type: 'setHealth', player: 0, wounds: 100 })).toThrow();
    expect(() => parseAction({ ...valid, player: 2 })).toThrow();
  });

  it('rejects non-finite or excessively sized proposed geometry', () => {
    const move = { type: 'move', player: 0, unitId: 'p0-u0', moveType: 'normal' };
    expect(() => parseAction({ ...move, positions: [{ x: NaN, y: 2 }] })).toThrow();
    expect(() => parseAction({ ...move, positions: [{ x: 5, y: 2, z: 21 }] })).toThrow();
    expect(() => parseAction({ ...move, positions: Array.from({ length: 31 }, () => ({ x: 5, y: 2 })) })).toThrow();
  });
});
