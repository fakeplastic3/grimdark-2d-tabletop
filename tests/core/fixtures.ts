import assert from 'node:assert/strict';
import type { GameAction, GameConfig, GameState, Point, RulesPack, UnitDefinition } from '../../packages/shared/types';
import { TRAINING_PACK, defaultArmies } from '../../packages/rules-data/index';
import { applyAction, createGame } from '../../packages/engine/index';

export function config(seed = 25, rounds = 2): GameConfig {
  return { armies: defaultArmies(), seed, rounds, pointsLimit: 500, layout: 'foundry', mode: 'training' };
}

export function accepted(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  assert.equal(result.ok, true, `${action.type}: ${result.error}`);
  return result.state;
}

export function deployed(seed = 25, rounds = 2): GameState {
  let state = createGame(config(seed, rounds));
  for (const player of [0, 1] as const) {
    for (const unit of state.units.filter(unit => unit.owner === player)) state = accepted(state, { type: 'deploy', player, unitId: unit.id, positions: unit.models.map(model => ({ x: model.x, y: model.y })) });
    state = accepted(state, { type: 'ready', player });
  }
  return state;
}

export function advanceTo(state: GameState, phase: GameState['phase']): GameState {
  for (let i = 0; state.phase !== phase && i < 20; i++) state = accepted(state, { type: 'endPhase', player: state.phase === 'fight' ? state.fightPlayer : state.activePlayer });
  assert.equal(state.phase, phase);
  return state;
}

export function translate(state: GameState, unitId: string, dx: number, dy = 0): Point[] {
  const unit = state.units.find(unit => unit.id === unitId);
  assert.ok(unit);
  return unit.models.map(model => ({ x: model.x + dx, y: model.y + dy }));
}

/** Deliberately artificial fixtures, never presented as official faction datasheets. */
export function tacticalPack(): RulesPack {
  const pack = structuredClone(TRAINING_PACK);
  const base: Omit<UnitDefinition, 'id' | 'faction'> = { name: 'Test formation', role: 'character', modelCounts: [1, 2], points: [60, 120], baseMm: 25.4, move: 8, toughness: 4, save: 6, wounds: 3, leadership: 6, oc: 1, maxCopies: 3, keywords: ['test'], weapons: [
    { id: 'gun', name: 'Test gun', kind: 'ranged', range: 40, attacks: 1, skill: 2, strength: 20, ap: 6, damage: 3, abilities: [] },
    { id: 'blade', name: 'Test blade', kind: 'melee', range: 2, attacks: 2, skill: 2, strength: 20, ap: 6, damage: 3, abilities: [] },
  ] };
  pack.units = [{ ...structuredClone(base), id: 'blue-test', faction: 'ultramarines' }, { ...structuredClone(base), id: 'green-test', faction: 'orks' }];
  return pack;
}

export function tacticalConfig(): GameConfig {
  const cfg = config();
  cfg.armies[0].entries = [{ definitionId: 'blue-test', count: 1 }, { definitionId: 'blue-test', count: 1 }];
  cfg.armies[1].entries = [{ definitionId: 'green-test', count: 2 }, { definitionId: 'green-test', count: 1 }];
  return cfg;
}

export function tacticalDeployed(): GameState {
  let state = createGame(tacticalConfig(), tacticalPack());
  const positions: Record<string, Point[]> = { 'p0-u0': [{ x: 7, y: 15 }], 'p0-u1': [{ x: 7, y: 7 }], 'p1-u0': [{ x: 37, y: 15 }, { x: 38.1, y: 15 }], 'p1-u1': [{ x: 39, y: 25 }] };
  for (const player of [0, 1] as const) {
    for (const unit of state.units.filter(unit => unit.owner === player)) state = accepted(state, { type: 'deploy', player, unitId: unit.id, positions: positions[unit.id] });
    state = accepted(state, { type: 'ready', player });
  }
  assert.equal(state.activePlayer, 0);
  return state;
}
