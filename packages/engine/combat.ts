import type { CombatResult, GameState, Model, Unit, UnitDefinition, Weapon } from '../shared/types';
import { baseDistance, circlePolygonIntersects, engaged, segmentIntersectsPolygon } from '../geometry/index';
import { d6, savingThreshold, succeeds, woundThreshold } from './dice';

export function definition(state: GameState, unit: Unit): UnitDefinition {
  const found = state.pack.units.find(item => item.id === unit.definitionId);
  if (!found) throw new Error(`Missing unit definition: ${unit.definitionId}`);
  return found;
}

/** Explicit abstraction: a centre-to-centre ray blocked by opaque terrain footprints. */
export function hasLineOfSight(state: GameState, from: Model, to: Model): boolean {
  return !state.terrain.some(terrain => terrain.blocksSight && segmentIntersectsPolygon(from, to, terrain.polygon));
}

export function modelsInRange(state: GameState, attacker: Unit, target: Unit, weapon: Weapon): Model[] {
  return attacker.models.filter(model => target.models.some(other => weapon.kind === 'melee'
    ? engaged(model, other)
    : baseDistance(model, other) <= weapon.range + 1e-7 && hasLineOfSight(state, model, other)));
}

export function unitsEngaged(a: Unit, b: Unit): boolean {
  return a.deployed && b.deployed && a.models.some(model => b.models.some(other => engaged(model, other)));
}

export function unitEngaged(state: GameState, unit: Unit): boolean {
  return state.units.some(other => other.owner !== unit.owner && unitsEngaged(unit, other));
}

/** Individual training attacks. Exact 11th Edition grouping/allocation is unsupported. */
export function resolveCombat(state: GameState, attacker: Unit, target: Unit, weapon: Weapon, rerollHits = false): CombatResult {
  const targetDef = definition(state, target);
  const result: CombatResult = { attackerId: attacker.id, targetId: target.id, weapon: weapon.name, attacks: 0, hits: 0, wounds: 0, failedSaves: 0, damage: 0, destroyed: 0, dice: [] };
  const participants = modelsInRange(state, attacker, target, weapon);
  const cover = weapon.kind === 'ranged' && state.terrain.some(terrain => terrain.cover && target.models.some(model => circlePolygonIntersects(model, terrain.polygon)));
  const hitModifier = (weapon.abilities.includes('heavy') && attacker.moveType === 'stationary' ? 1 : 0) - (cover ? 1 : 0);
  const targetWound = woundThreshold(weapon.strength, targetDef.toughness);
  const save = savingThreshold(targetDef.save, weapon.ap, targetDef.invulnerable);
  const attacks = participants.reduce((sum, model) => sum + weapon.attacks + (weapon.abilities.includes('rapidFire') && target.models.some(other => baseDistance(model, other) <= weapon.range / 2) ? 1 : 0), 0);

  for (let a = 0; a < attacks; a++) {
    if (!target.models.length) break;
    result.attacks++;
    let hitRaw = 6;
    if (!weapon.abilities.includes('torrent')) {
      hitRaw = d6(state);
      const first = hitRaw;
      if (!succeeds(hitRaw, hitModifier, weapon.skill) && rerollHits) hitRaw = d6(state);
      result.dice.push({ stage: 'hit', raw: first, modifier: hitModifier, target: weapon.skill, success: succeeds(hitRaw, hitModifier, weapon.skill), ...(first !== hitRaw || (!succeeds(first, hitModifier, weapon.skill) && rerollHits) ? { reroll: hitRaw } : {}), ...(cover ? { note: 'Training cover: -1 to hit' } : {}) });
      if (!succeeds(hitRaw, hitModifier, weapon.skill)) continue;
    } else {
      result.dice.push({ stage: 'hit', raw: 0, modifier: 0, target: 0, success: true, note: 'Training torrent: automatic hit, no critical hit' });
    }
    const criticalHit = !weapon.abilities.includes('torrent') && hitRaw === 6;
    const hits = 1 + (criticalHit && weapon.abilities.includes('sustained') ? 1 : 0);
    result.hits += hits;
    for (let h = 0; h < hits && target.models.length; h++) {
      const automaticWound = h === 0 && criticalHit && weapon.abilities.includes('lethal');
      let woundRaw = 0;
      if (!automaticWound) {
        woundRaw = d6(state);
        const first = woundRaw;
        const rerolled = !succeeds(woundRaw, 0, targetWound) && weapon.abilities.includes('twinLinked');
        if (rerolled) woundRaw = d6(state);
        result.dice.push({ stage: 'wound', raw: first, modifier: 0, target: targetWound, success: succeeds(woundRaw, 0, targetWound), ...(rerolled ? { reroll: woundRaw } : {}) });
        if (!succeeds(woundRaw, 0, targetWound)) continue;
      } else {
        result.dice.push({ stage: 'wound', raw: 0, modifier: 0, target: 0, success: true, note: 'Training lethal: automatic wound' });
      }
      result.wounds++;
      const devastating = !automaticWound && woundRaw === 6 && weapon.abilities.includes('devastating');
      if (!devastating) {
        const raw = d6(state);
        // Training saves never auto-succeed on a six if AP makes the threshold impossible.
        const saved = raw !== 1 && raw >= save;
        result.dice.push({ stage: 'save', raw, modifier: 0, target: save, success: saved, note: targetDef.invulnerable && targetDef.invulnerable < targetDef.save + Math.abs(weapon.ap) ? 'Invulnerable save' : 'Armour save' });
        if (saved) continue;
      } else {
        result.dice.push({ stage: 'save', raw: 0, modifier: 0, target: 0, success: false, note: 'Training devastating: save bypassed' });
      }
      result.failedSaves++;
      const victim = target.models.find(model => model.wounds < model.maxWounds) ?? target.models[0];
      const dealt = Math.min(victim.wounds, weapon.damage);
      victim.wounds -= dealt;
      result.damage += dealt;
      if (victim.wounds === 0) { target.models = target.models.filter(model => model.id !== victim.id); result.destroyed++; }
    }
  }
  return result;
}
