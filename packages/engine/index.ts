import type { ActionResult, GameAction, GameConfig, GameEvent, GameState, Model, PlayerId, Point, RulesPack, Unit, Weapon } from '../shared/types';
import { TRAINING_PACK, terrainForLayout, validateArmy } from '../rules-data/index';
import { baseDistance, circlePolygonIntersects, circlesOverlap, coherent, distance3D, EPSILON, inBounds, isFinitePoint, pathHitsCircle, pathIntersectsPolygon, pathsCollide, pointSegmentDistance } from '../geometry/index';
import { definition, modelsInRange, resolveCombat, unitEngaged } from './combat';
import { d6, twoD6 } from './dice';

export { d6, twoD6, woundThreshold, savingThreshold, succeeds } from './dice';
export { definition, hasLineOfSight, modelsInRange, unitEngaged, unitsEngaged } from './combat';

const other = (player: PlayerId): PlayerId => player === 0 ? 1 : 0;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const requireRule = (condition: unknown, error: string): void => { if (!condition) throw new Error(error); };

function event(state: GameState, message: string, extra: Partial<GameEvent> = {}): void {
  state.events.push({ id: state.events.length + 1, round: state.round, phase: state.phase, player: state.activePlayer, message, ...extra });
}

function findUnit(state: GameState, id: string, player?: PlayerId): Unit {
  const unit = state.units.find(candidate => candidate.id === id);
  if (!unit) throw new Error('The selected unit does not exist.');
  requireRule(player === undefined || unit.owner === player, 'You cannot act with the other player’s unit.');
  requireRule(unit.models.length, 'This unit has been destroyed.');
  return unit;
}

export function createGame(config: GameConfig, pack: RulesPack = TRAINING_PACK): GameState {
  requireRule(config.mode === 'training' && pack.status === 'training', 'Only the explicitly labeled training rules are supported.');
  requireRule(Number.isSafeInteger(config.seed) && config.seed >= 0 && config.seed <= 0xffffffff, 'Seed must be an unsigned 32-bit integer.');
  requireRule(Number.isInteger(config.rounds) && config.rounds >= 1 && config.rounds <= 5, 'Choose one to five training rounds.');
  requireRule(Number.isInteger(config.pointsLimit) && config.pointsLimit >= 250 && config.pointsLimit <= 3000, 'Training army budget must be 250–3000 points.');
  requireRule(config.layout === 'foundry' || config.layout === 'crossroads', 'Unknown battlefield layout.');
  requireRule(Array.isArray(config.armies) && config.armies.length === 2, 'Exactly two armies are required.');
  config.armies.forEach((army, i) => { const errors = validateArmy(army, pack, config.pointsLimit); requireRule(!errors.length, `Player ${i + 1}: ${errors.join(' ')}`); });
  const state: GameState = {
    schemaVersion: 1, rulesVersion: `${pack.id}@${pack.version}`, config: clone(config), pack: clone(pack), width: 44, height: 30, round: 1,
    phase: 'deployment', activePlayer: 0, firstPlayer: 0, fightPlayer: 0,
    players: [0, 1].map(id => ({ id: id as PlayerId, name: config.armies[id].name || `Player ${id + 1}`, faction: config.armies[id].faction, cp: 0, vp: 0, ready: false, abilityUsed: false })) as GameState['players'],
    units: [], terrain: terrainForLayout(config.layout), events: [], rng: config.seed || 0x9e3779b9, randomDraws: 0, revision: 0, history: [],
  };
  config.armies.forEach((army, owner) => army.entries.forEach((entry, unitIndex) => {
    const def = pack.units.find(item => item.id === entry.definitionId);
    if (!def) throw new Error('Missing training unit data.');
    const id = `p${owner}-u${unitIndex}`;
    const diameter = def.baseMm / 25.4;
    const spacing = diameter + 0.2;
    const unit: Unit = { id, owner: owner as PlayerId, definitionId: def.id, name: def.name, startingModels: entry.count, deployed: false, moved: false, shot: false, fought: false, charged: false, chargeAttempted: false, shocked: false, models: [] };
    unit.models = Array.from({ length: entry.count }, (_, i) => ({ id: `${id}-m${i}`, unitId: id, x: owner === 0 ? 2 + (i % 3) * spacing : 42 - (i % 3) * spacing, y: 2 + unitIndex * 6 + Math.floor(i / 3) * spacing, z: 0, radius: diameter / 2, wounds: def.wounds, maxWounds: def.wounds }));
    state.units.push(unit);
  }));
  event(state, 'Training match created. Both players must deploy every unit and lock their deployment. This is not a verified official-rules game.');
  return state;
}

function destinations(unit: Unit, positions: Point[]): Model[] {
  requireRule(Array.isArray(positions) && positions.length === unit.models.length, 'Provide one destination for each surviving model.');
  requireRule(positions.every(position => isFinitePoint(position) && (position.z ?? 0) === 0), 'Positions must be finite, ground-level world coordinates.');
  return unit.models.map((model, i) => ({ ...model, ...positions[i], z: 0 }));
}

function positionErrors(state: GameState, unit: Unit, positions: Point[], limit?: number, chargeTarget?: Unit, allowLeavingEngagement = false): string[] {
  const errors: string[] = [];
  let moved: Model[];
  try { moved = destinations(unit, positions); } catch (error) { return [error instanceof Error ? error.message : 'Invalid model destinations.']; }
  const deploying = state.phase === 'deployment';
  if (!coherent(moved)) errors.push('Keep every model near a squadmate (2″) and the entire squad within a 9″ span.');
  const obstacles = state.units.filter(otherUnit => otherUnit.id !== unit.id && otherUnit.deployed);
  moved.forEach((model, i) => {
    const from = unit.models[i];
    if (!inBounds(model, state.width, state.height)) errors.push(`Model ${i + 1} leaves the battlefield.`);
    if (deploying && (unit.owner === 0 ? model.x + model.radius > 8 + EPSILON : model.x - model.radius < 36 - EPSILON)) errors.push(`Model ${i + 1} leaves your deployment zone.`);
    if (limit !== undefined && distance3D(from, model) > limit + EPSILON) errors.push(`Model ${i + 1} moves ${distance3D(from, model).toFixed(2)}″; limit ${limit}″.`);
    for (const terrain of state.terrain.filter(area => area.blocksMovement)) {
      if (circlePolygonIntersects(model, terrain.polygon) || (!deploying && pathIntersectsPolygon(from, model, model.radius, terrain.polygon))) errors.push(`Model ${i + 1} intersects ${terrain.name}.`);
    }
    for (const obstacle of obstacles) {
      for (const stationary of obstacle.models) {
        if (circlesOverlap(model, stationary) || (!deploying && pathHitsCircle(from, model, model.radius, stationary))) errors.push(`Model ${i + 1} crosses or overlaps ${obstacle.name}.`);
        if (!deploying && obstacle.owner !== unit.owner && obstacle.id !== chargeTarget?.id && baseDistance(model, stationary) <= 2 + EPSILON) errors.push(`Model ${i + 1} ends within enemy engagement distance.`);
        if (!deploying && !allowLeavingEngagement && obstacle.owner !== unit.owner && obstacle.id !== chargeTarget?.id && pointSegmentDistance(stationary, from, model) <= model.radius + stationary.radius + 2 + EPSILON) errors.push(`Model ${i + 1} crosses enemy engagement distance.`);
      }
    }
    for (let j = 0; j < i; j++) {
      if (circlesOverlap(model, moved[j]) || (!deploying && pathsCollide(from, model, unit.models[j], moved[j]))) errors.push(`Models ${i + 1} and ${j + 1} overlap along their movement.`);
    }
  });
  return [...new Set(errors)];
}

export function movementPreview(state: GameState, unitId: string, positions: Point[], moveType: 'normal' | 'advance' | 'fallBack' | 'stationary' = 'normal'): string[] {
  try {
    const unit = findUnit(state, unitId);
    if (state.phase === 'deployment') return positionErrors(state, unit, positions);
    const errors: string[] = [];
    if (state.phase !== 'movement') errors.push('Movement is available only during the Movement phase.');
    if (unit.owner !== state.activePlayer) errors.push('It is the other player’s turn.');
    if (!unit.deployed) errors.push('This unit has not deployed.');
    if (unit.moved) errors.push('This unit already completed its move.');
    if (moveType === 'advance' && unit.advanceRoll === undefined) errors.push('Roll the advance die before placing models.');
    if (unit.advanceRoll !== undefined && moveType !== 'advance') errors.push('An advance has been declared; commit an advance move.');
    const inCombat = unitEngaged(state, unit);
    if (inCombat && moveType !== 'fallBack' && moveType !== 'stationary') errors.push('An engaged unit must Fall Back or Remain Stationary.');
    if (!inCombat && moveType === 'fallBack') errors.push('Only an engaged unit can Fall Back.');
    const limit = moveType === 'stationary' ? 0 : definition(state, unit).move + (moveType === 'advance' ? unit.advanceRoll ?? 0 : 0);
    const geometry = positionErrors(state, unit, positions, limit, undefined, moveType === 'fallBack' || moveType === 'stationary');
    // Stationary units may remain engaged. All collision and coherency checks still apply.
    errors.push(...geometry.filter(error => !(moveType === 'stationary' && error.includes('engagement distance'))));
    return errors;
  } catch (error) { return [error instanceof Error ? error.message : 'Invalid movement.']; }
}

function weaponFor(state: GameState, unit: Unit, id: string): Weapon {
  const weapon = definition(state, unit).weapons.find(profile => profile.id === id);
  if (!weapon) throw new Error('This unit does not have that weapon.');
  return weapon;
}

export function eligibleFighters(state: GameState): Unit[] {
  if (state.phase !== 'fight') return [];
  const eligible = state.units.filter(unit => unit.deployed && unit.models.length && !unit.fought && definition(state, unit).weapons.some(weapon => weapon.kind === 'melee') && unitEngaged(state, unit));
  const first = eligible.filter(unit => unit.charged);
  return first.length ? first : eligible;
}

export function legalTargets(state: GameState, unitId: string, weaponId: string): Unit[] {
  try {
    const unit = findUnit(state, unitId);
    if (!unit.deployed) return [];
    const weapon = weaponFor(state, unit, weaponId);
    if (weapon.kind === 'ranged') {
      if (state.phase !== 'shooting' || state.activePlayer !== unit.owner || unit.shot || unit.moveType === 'fallBack' || unitEngaged(state, unit)) return [];
      if (unit.moveType === 'advance' && !weapon.abilities.includes('assault')) return [];
    } else if (state.phase !== 'fight' || state.fightPlayer !== unit.owner || !eligibleFighters(state).some(candidate => candidate.id === unit.id)) return [];
    return state.units.filter(target => target.owner !== unit.owner && target.deployed && target.models.length &&
      modelsInRange(state, unit, target, weapon).length > 0 && (weapon.kind === 'melee' || !unitEngaged(state, target)));
  } catch { return []; }
}

export function objectiveControl(state: GameState): { terrainId: string; owner: PlayerId | 'contested' | null; scores: [number, number] }[] {
  return state.terrain.filter(terrain => terrain.objective).map(terrain => {
    const scores: [number, number] = [0, 0];
    for (const unit of state.units) {
      if (!unit.deployed || unit.shocked) continue;
      const oc = definition(state, unit).oc;
      scores[unit.owner] += unit.models.filter(model => circlePolygonIntersects(model, terrain.polygon)).length * oc;
    }
    return { terrainId: terrain.id, scores, owner: scores[0] === scores[1] ? (scores[0] ? 'contested' : null) : (scores[0] > scores[1] ? 0 : 1) };
  });
}

function finish(state: GameState, reason: string, winner?: PlayerId | 'draw'): void {
  state.phase = 'finished'; delete state.chargePending;
  state.winner = winner ?? (state.players[0].vp === state.players[1].vp ? 'draw' : state.players[0].vp > state.players[1].vp ? 0 : 1);
  state.resultReason = reason;
  event(state, `${reason} ${state.winner === 'draw' ? 'Draw.' : `${state.players[state.winner].name} wins.`}`);
}

function checkElimination(state: GameState): void {
  const alive = [0, 1].map(player => state.units.some(unit => unit.owner === player && unit.models.length));
  if (!alive[0] || !alive[1]) finish(state, 'Training elimination victory.', !alive[0] && !alive[1] ? 'draw' : alive[0] ? 0 : 1);
}

function commandStart(state: GameState): void {
  state.phase = 'command';
  delete state.chargePending;
  state.players.forEach(player => player.cp++);
  for (const unit of state.units) {
    unit.charged = false;
    if (unit.owner !== state.activePlayer || !unit.models.length) continue;
    unit.moved = false; unit.shot = false; unit.fought = false; unit.chargeAttempted = false; delete unit.moveType; delete unit.advanceRoll;
    const def = definition(state, unit);
    const lowStrength = unit.startingModels === 1 ? unit.models[0].wounds <= def.wounds / 2 : unit.models.length <= unit.startingModels / 2;
    if (unit.shocked || lowStrength) {
      const dice = twoD6(state);
      unit.shocked = dice[0] + dice[1] < def.leadership;
      event(state, `${unit.name}: morale ${dice.join(' + ')} vs ${def.leadership}; ${unit.shocked ? 'shocked (OC 0)' : 'steady'}.`, { dice });
    }
  }
  event(state, `${state.players[state.activePlayer].name}: Command phase. Both players gain 1 CP.`);
}

function selectFightPlayer(state: GameState, preferred: PlayerId): void {
  const eligible = eligibleFighters(state);
  state.fightPlayer = eligible.some(unit => unit.owner === preferred) ? preferred : eligible.some(unit => unit.owner === other(preferred)) ? other(preferred) : state.activePlayer;
}

function endPhase(state: GameState): void {
  switch (state.phase) {
    case 'command': state.phase = 'movement'; break;
    case 'movement':
      requireRule(!state.units.some(unit => unit.owner === state.activePlayer && !unit.moved && unit.advanceRoll !== undefined), 'Complete the declared advance before ending this phase.');
      for (const unit of state.units.filter(unit => unit.owner === state.activePlayer && !unit.moved)) { unit.moved = true; unit.moveType = 'stationary'; }
      state.phase = 'shooting'; break;
    case 'shooting': state.phase = 'charge'; break;
    case 'charge':
      requireRule(!state.chargePending, 'Complete or cancel the pending charge before ending the phase.');
      state.phase = 'fight'; state.units.forEach(unit => { unit.fought = false; }); selectFightPlayer(state, state.activePlayer); break;
    case 'fight': {
      requireRule(!eligibleFighters(state).length, 'Resolve each eligible fight before ending this phase.');
      const previous = state.activePlayer;
      if (previous !== state.firstPlayer) {
        for (const objective of objectiveControl(state)) {
          if (objective.owner === 0 || objective.owner === 1) {
            state.players[objective.owner].vp += 5;
            const name = state.terrain.find(area => area.id === objective.terrainId)?.name ?? objective.terrainId;
            event(state, `${state.players[objective.owner].name} controls ${name}: +5 VP.`, { player: objective.owner });
          }
        }
        if (state.round >= state.config.rounds) { finish(state, 'All training rounds completed.'); return; }
        state.round++;
      }
      state.activePlayer = other(previous); commandStart(state); return;
    }
    default: throw new Error('This phase cannot be advanced.');
  }
  event(state, `${state.phase[0].toUpperCase()}${state.phase.slice(1)} phase.`);
}

function performAction(state: GameState, action: GameAction): void {
  requireRule(action && (action.player === 0 || action.player === 1), 'Invalid player.');
  requireRule(state.phase !== 'finished', 'This match has finished.');
  if (action.type === 'concede') { finish(state, `${state.players[action.player].name} conceded.`, other(action.player)); return; }
  requireRule(action.player === (state.phase === 'fight' ? state.fightPlayer : state.activePlayer), 'It is not your action window.');
  switch (action.type) {
    case 'deploy': {
      requireRule(state.phase === 'deployment', 'Deploy only during setup.');
      requireRule(!state.players[action.player].ready, 'Your deployment is already locked.');
      const unit = findUnit(state, action.unitId, action.player);
      const errors = positionErrors(state, unit, action.positions);
      requireRule(!errors.length, errors.join(' '));
      unit.models = destinations(unit, action.positions); unit.deployed = true;
      event(state, `${unit.name} deployed.`, { player: action.player }); break;
    }
    case 'ready': {
      requireRule(state.phase === 'deployment', 'Deployment can only be locked during setup.');
      requireRule(!state.players[action.player].ready, 'This player is already ready.');
      requireRule(state.units.filter(unit => unit.owner === action.player).every(unit => unit.deployed), 'Deploy every unit before locking deployment.');
      state.players[action.player].ready = true;
      event(state, `${state.players[action.player].name} locked deployment.`);
      if (state.players.every(player => player.ready)) {
        let rolls = twoD6(state);
        event(state, `Initiative roll: ${rolls[0]} vs ${rolls[1]}.`, { dice: rolls });
        while (rolls[0] === rolls[1]) { rolls = twoD6(state); event(state, `Initiative tie reroll: ${rolls[0]} vs ${rolls[1]}.`, { dice: rolls }); }
        state.firstPlayer = rolls[0] > rolls[1] ? 0 : 1;
        state.activePlayer = state.firstPlayer; state.fightPlayer = state.firstPlayer;
        commandStart(state);
      } else state.activePlayer = other(action.player);
      break;
    }
    case 'advanceRoll': {
      requireRule(state.phase === 'movement', 'Declare advances during Movement.');
      const unit = findUnit(state, action.unitId, action.player);
      requireRule(unit.deployed && !unit.moved && unit.advanceRoll === undefined && !unitEngaged(state, unit), 'This unit cannot declare an advance.');
      unit.advanceRoll = d6(state); event(state, `${unit.name} advances: +${unit.advanceRoll}″. This declaration cannot be undone.`, { dice: [unit.advanceRoll] }); break;
    }
    case 'move': {
      requireRule(state.phase === 'movement', 'Move only during Movement phase.');
      const unit = findUnit(state, action.unitId, action.player);
      requireRule(['normal', 'advance', 'fallBack', 'stationary'].includes(action.moveType), 'Unknown movement type.');
      const errors = movementPreview(state, unit.id, action.positions, action.moveType);
      requireRule(!errors.length, errors.join(' '));
      unit.models = destinations(unit, action.positions); unit.moved = true; unit.moveType = action.moveType;
      event(state, `${unit.name}: ${action.moveType} move completed.`); break;
    }
    case 'attack': {
      requireRule(action.rerollHits === undefined || typeof action.rerollHits === 'boolean', 'Hit reroll choice must be a boolean.');
      const unit = findUnit(state, action.unitId, action.player);
      const target = findUnit(state, action.targetId);
      requireRule(legalTargets(state, unit.id, action.weaponId).some(candidate => candidate.id === target.id), 'Target is not eligible: check phase, range, visibility, engagement and previous actions.');
      const weapon = weaponFor(state, unit, action.weaponId);
      if (action.rerollHits) { requireRule(!unit.shocked && state.players[action.player].cp >= 1, 'Training hit rerolls require 1 CP and a steady unit.'); state.players[action.player].cp--; }
      const result = resolveCombat(state, unit, target, weapon, action.rerollHits);
      if (weapon.kind === 'ranged') unit.shot = true; else unit.fought = true;
      event(state, `${unit.name} → ${target.name}: ${result.attacks} attacks, ${result.hits} hits, ${result.wounds} wounds, ${result.damage} damage, ${result.destroyed} destroyed.`, { player: action.player, combat: result });
      checkElimination(state);
      if (state.phase === 'fight') selectFightPlayer(state, other(action.player));
      break;
    }
    case 'chargeRoll': {
      requireRule(state.phase === 'charge' && !state.chargePending, 'Begin a charge only in Charge phase with no pending charge.');
      const unit = findUnit(state, action.unitId, action.player);
      requireRule(unit.deployed && !unit.chargeAttempted && unit.moveType !== 'advance' && unit.moveType !== 'fallBack' && !unitEngaged(state, unit), 'This unit cannot declare a charge.');
      unit.chargeAttempted = true;
      const dice = twoD6(state);
      state.chargePending = { unitId: unit.id, roll: dice[0] + dice[1], dice };
      event(state, `${unit.name} charge roll: ${dice.join(' + ')} = ${dice[0] + dice[1]}″. Now select a target.`, { dice }); break;
    }
    case 'chargeMove': {
      requireRule(state.phase === 'charge' && state.chargePending?.unitId === action.unitId, 'Roll this unit’s charge before selecting a target.');
      const pending = state.chargePending;
      if (!pending) throw new Error('No pending charge.');
      const unit = findUnit(state, action.unitId, action.player), target = findUnit(state, action.targetId);
      requireRule(target.owner !== unit.owner && target.deployed, 'Choose a deployed enemy unit.');
      requireRule(unit.models.some(model => target.models.some(otherModel => baseDistance(model, otherModel) <= pending.roll + EPSILON)), 'Target is beyond the charge roll. Engagement distance is not added to the charge roll.');
      const errors = positionErrors(state, unit, action.positions, pending.roll, target);
      requireRule(!errors.length, errors.join(' '));
      const placed = destinations(unit, action.positions);
      requireRule(placed.some(model => target.models.some(enemy => baseDistance(model, enemy) <= EPSILON)), 'At least one charging model must reach base contact with the target.');
      unit.models = placed; unit.charged = true; delete state.chargePending;
      event(state, `${unit.name} charged ${target.name}.`); break;
    }
    case 'cancelCharge':
      requireRule(state.phase === 'charge' && state.chargePending, 'There is no pending charge.');
      event(state, 'Charge cancelled; the attempt remains spent.'); delete state.chargePending; break;
    case 'ability':
      requireRule(state.phase === 'command', 'The training reserve ability is used during your Command phase.');
      requireRule(!state.players[action.player].abilityUsed, 'The training reserve ability was already used.');
      state.players[action.player].abilityUsed = true; state.players[action.player].cp += 2;
      event(state, `${state.players[action.player].name} uses Training reserves: +2 CP (once per battle).`); break;
    case 'endPhase': endPhase(state); break;
    default: throw new Error('Unknown action.');
  }
}

/** Atomic, deterministic transition: rejected actions return the identical input state. */
export function applyAction(state: GameState, action: GameAction): ActionResult {
  try {
    const next = clone(state);
    performAction(next, action);
    next.revision++; next.history.push(clone(action));
    return { ok: true, state: next };
  } catch (error) { return { ok: false, state, error: error instanceof Error ? error.message : 'The action could not be resolved.' }; }
}

export function replay(config: GameConfig, pack: RulesPack, actions: GameAction[]): GameState {
  requireRule(Array.isArray(actions) && actions.length <= 100000, 'Invalid replay action count.');
  let state = createGame(config, pack);
  for (const [index, action] of actions.entries()) {
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`Replay action ${index + 1}: ${result.error}`);
    state = result.state;
  }
  return state;
}
