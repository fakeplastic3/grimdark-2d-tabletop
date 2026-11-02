import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, eligibleFighters, legalTargets, movementPreview, objectiveControl, replay } from '../../packages/engine/index';
import { TRAINING_PACK } from '../../packages/rules-data/index';
import type { GameAction } from '../../packages/shared/types';
import { accepted, advanceTo, config, deployed, tacticalConfig, tacticalDeployed, tacticalPack, translate } from './fixtures';

describe('setup and atomic state transitions', () => {
  it('requires valid training armies, budgets, finite seeds and configuration', () => {
    const cfg = config();
    assert.throws(() => createGame({ ...cfg, pointsLimit: 100 }), /250/);
    assert.throws(() => createGame({ ...cfg, pointsLimit: 500.5 }), /budget/);
    assert.throws(() => createGame({ ...cfg, seed: NaN }), /Seed/);
    assert.throws(() => createGame({ ...cfg, rounds: 0 }), /round/);
    const illegal = structuredClone(cfg); illegal.armies[0].entries[0].definitionId = 'green-raiders';
    assert.throws(() => createGame(illegal), /other faction/);
    assert.throws(() => createGame({ ...cfg, mode: 'official' } as unknown as typeof cfg), /training/);
  });
  it('prevents skipping setup, opponent actions and bases outside deployment', () => {
    const state = createGame(config());
    assert.equal(applyAction(state, { type: 'ready', player: 0 }).ok, false);
    assert.equal(applyAction(state, { type: 'endPhase', player: 0 }).ok, false);
    const unit = state.units[0];
    const wrongOwner = applyAction(state, { type: 'deploy', player: 1, unitId: unit.id, positions: unit.models });
    assert.equal(wrongOwner.ok, false); assert.equal(wrongOwner.state, state);
    const outside = applyAction(state, { type: 'deploy', player: 0, unitId: unit.id, positions: translate(state, unit.id, 6) });
    assert.equal(outside.ok, false); assert.match(outside.error ?? '', /deployment zone/);
  });
  it('deployment cannot be abused with a movement action', () => {
    const state = createGame(config());
    const result = applyAction(state, { type: 'move', player: 0, unitId: state.units[0].id, positions: state.units[0].models, moveType: 'normal' });
    assert.equal(result.ok, false); assert.match(result.error ?? '', /Movement/);
  });
  it('locks deployments and rolls first player deterministically', () => {
    const state = deployed(25);
    assert.equal(state.phase, 'command'); assert.equal(state.firstPlayer, 0); assert.equal(state.activePlayer, 0);
    assert.deepEqual(state.players.map(player => player.cp), [1, 1]);
    assert.deepEqual(state.events.find(event => event.message.startsWith('Initiative roll'))?.dice, [6, 2]);
    assert.equal(state.units.every(unit => unit.deployed), true);
    assert.equal(applyAction(state, { type: 'ready', player: 0 }).ok, false);
  });
  it('rejected actions preserve positions, revision, event log and RNG by identity', () => {
    const state = deployed();
    const before = JSON.stringify(state);
    const result = applyAction(state, { type: 'chargeRoll', player: state.activePlayer, unitId: 'p0-u0' });
    assert.equal(result.ok, false); assert.equal(result.state, state); assert.equal(JSON.stringify(state), before);
  });
});

describe('movement and actions', () => {
  it('moves individual bases within allowance and rejects a second move', () => {
    let state = advanceTo(deployed(), 'movement');
    const unit = state.units[0], oldX = unit.models[0].x;
    state = accepted(state, { type: 'move', player: 0, unitId: unit.id, positions: translate(state, unit.id, 6), moveType: 'normal' });
    assert.equal(state.units[0].models[0].x, oldX + 6);
    assert.equal(state.units[0].moved, true);
    assert.equal(applyAction(state, { type: 'move', player: 0, unitId: unit.id, positions: state.units[0].models, moveType: 'normal' }).ok, false);
  });
  it('rejects overdistance, NaN coordinates, non-ground levels and broken coherency', () => {
    const state = advanceTo(deployed(), 'movement'), unit = state.units[0];
    assert.ok(movementPreview(state, unit.id, translate(state, unit.id, 6.01), 'normal').some(error => error.includes('limit')));
    const broken = translate(state, unit.id, 0); broken[0].y += 6;
    assert.ok(movementPreview(state, unit.id, broken, 'normal').some(error => error.includes('squad')));
    const invalid = translate(state, unit.id, 0); invalid[0].x = NaN;
    assert.ok(movementPreview(state, unit.id, invalid, 'normal').some(error => error.includes('finite')));
    invalid[0] = { x: 2, y: 2, z: 1 };
    assert.ok(movementPreview(state, unit.id, invalid, 'normal').some(error => error.includes('ground')));
  });
  it('requires advance declaration, consumes exactly one die, and locks movement type', () => {
    let state = advanceTo(deployed(), 'movement');
    const unit = state.units[0], before = state.randomDraws;
    assert.equal(applyAction(state, { type: 'move', player: 0, unitId: unit.id, positions: unit.models, moveType: 'advance' }).ok, false);
    state = accepted(state, { type: 'advanceRoll', player: 0, unitId: unit.id });
    assert.equal(state.randomDraws, before + 1);
    assert.equal(applyAction(state, { type: 'advanceRoll', player: 0, unitId: unit.id }).ok, false);
    assert.equal(applyAction(state, { type: 'endPhase', player: 0 }).ok, false);
    assert.equal(applyAction(state, { type: 'move', player: 0, unitId: unit.id, positions: unit.models, moveType: 'normal' }).ok, false);
    state = accepted(state, { type: 'move', player: 0, unitId: unit.id, positions: translate(state, unit.id, 1), moveType: 'advance' });
    state = advanceTo(state, 'shooting');
    assert.equal(legalTargets(state, unit.id, 'carbine').length, 0);
  });
  it('prevents normal paths crossing enemy engagement even when endpoints are legal', () => {
    const state = advanceTo(tacticalDeployed(), 'movement');
    state.terrain = [];
    state.units[0].models[0] = { ...state.units[0].models[0], x: 10, y: 15 };
    state.units[2].models = [{ ...state.units[2].models[0], x: 14, y: 17.5 }];
    const errors = movementPreview(state, 'p0-u0', [{ x: 18, y: 15 }], 'normal');
    assert.ok(errors.some(error => error.includes('crosses enemy engagement')));
  });
  it('allows legal fallback and stationary engagement but prohibits shooting after fallback', () => {
    let state = advanceTo(tacticalDeployed(), 'movement');
    state.terrain = [];
    state.units[0].models[0] = { ...state.units[0].models[0], x: 20, y: 15 };
    state.units[2].models = [{ ...state.units[2].models[0], x: 22, y: 15 }];
    assert.ok(movementPreview(state, 'p0-u0', [{ x: 16, y: 15 }], 'normal').length);
    assert.deepEqual(movementPreview(state, 'p0-u0', [{ x: 20, y: 15 }], 'stationary'), []);
    state = accepted(state, { type: 'move', player: 0, unitId: 'p0-u0', positions: [{ x: 16, y: 15 }], moveType: 'fallBack' });
    state = advanceTo(state, 'shooting');
    assert.deepEqual(legalTargets(state, 'p0-u0', 'gun'), []);
    state = advanceTo(state, 'charge');
    assert.equal(applyAction(state, { type: 'chargeRoll', player: 0, unitId: 'p0-u0' }).ok, false);
  });
  it('supports explicit training ability and paid hit reroll decisions', () => {
    let state = tacticalDeployed();
    state = accepted(state, { type: 'ability', player: 0 });
    assert.equal(state.players[0].cp, 3);
    assert.equal(applyAction(state, { type: 'ability', player: 0 }).ok, false);
    state = advanceTo(state, 'shooting');
    state = accepted(state, { type: 'attack', player: 0, unitId: 'p0-u0', targetId: 'p1-u0', weaponId: 'gun', rerollHits: true });
    assert.equal(state.players[0].cp, 2);
    assert.equal(applyAction(state, { type: 'attack', player: 0, unitId: 'p0-u0', targetId: 'p1-u0', weaponId: 'gun' }).ok, false);
  });
});

describe('charge, fight, scoring and complete matches', () => {
  it('does not allow charge placement before rolling or add engagement range to the roll', () => {
    let state = advanceTo(tacticalDeployed(), 'charge');
    assert.equal(applyAction(state, { type: 'chargeMove', player: 0, unitId: 'p0-u0', targetId: 'p1-u0', positions: [{ x: 36, y: 15 }] }).ok, false);
    state = accepted(state, { type: 'chargeRoll', player: 0, unitId: 'p0-u0' });
    assert.equal(state.chargePending?.roll, 11);
    state.units[2].models = [{ ...state.units[2].models[0], x: 20, y: 15 }];
    const result = applyAction(state, { type: 'chargeMove', player: 0, unitId: 'p0-u0', targetId: 'p1-u0', positions: [{ x: 17.5, y: 15 }] });
    assert.equal(result.ok, false); assert.match(result.error ?? '', /Engagement distance is not added/);
    assert.equal(result.state.chargePending?.roll, 11);
    state = accepted(state, { type: 'cancelCharge', player: 0 });
    assert.equal(applyAction(state, { type: 'chargeRoll', player: 0, unitId: 'p0-u0' }).ok, false);
  });
  it('requires base contact and alternates eligible fights', () => {
    let state = advanceTo(tacticalDeployed(), 'charge');
    state.terrain = [];
    state.units[0].models[0].x = 20;
    state.units[2].models = [{ ...state.units[2].models[0], x: 25, y: 15, wounds: 30, maxWounds: 30 }];
    state.units[0].models[0].wounds = state.units[0].models[0].maxWounds = 30;
    state = accepted(state, { type: 'chargeRoll', player: 0, unitId: 'p0-u0' });
    assert.equal(applyAction(state, { type: 'chargeMove', player: 0, unitId: 'p0-u0', targetId: 'p1-u0', positions: [{ x: 23, y: 15 }] }).ok, false);
    state = accepted(state, { type: 'chargeMove', player: 0, unitId: 'p0-u0', targetId: 'p1-u0', positions: [{ x: 24, y: 15 }] });
    state = accepted(state, { type: 'endPhase', player: 0 });
    assert.equal(state.phase, 'fight'); assert.equal(state.fightPlayer, 0);
    assert.deepEqual(eligibleFighters(state).map(unit => unit.id), ['p0-u0']);
    assert.equal(applyAction(state, { type: 'endPhase', player: 0 }).ok, false);
    state = accepted(state, { type: 'attack', player: 0, unitId: 'p0-u0', targetId: 'p1-u0', weaponId: 'blade' });
    assert.equal(state.fightPlayer, 1);
    state = accepted(state, { type: 'attack', player: 1, unitId: 'p1-u0', targetId: 'p0-u0', weaponId: 'blade' });
    assert.equal(eligibleFighters(state).length, 0);
    state = accepted(state, { type: 'endPhase', player: state.fightPlayer });
    assert.equal(state.activePlayer, 1); assert.equal(state.phase, 'command');
  });
  it('uses terrain-area base overlap for control and shock removes OC', () => {
    const state = tacticalDeployed();
    const unit = state.units[0]; unit.models[0].x = 9.6; unit.models[0].y = 7;
    assert.equal(objectiveControl(state).find(objective => objective.terrainId === 'alpha')?.owner, 0);
    unit.shocked = true;
    assert.equal(objectiveControl(state).find(objective => objective.terrainId === 'alpha')?.owner, null);
    unit.shocked = false;
    const enemy = state.units[2]; enemy.models = [{ ...enemy.models[0], x: 12, y: 7 }];
    assert.equal(objectiveControl(state).find(objective => objective.terrainId === 'alpha')?.owner, 'contested');
  });
  it('completes deployment, movement, shooting, casualties, charge, melee, scoring and deterministic replay', () => {
    let state = tacticalDeployed();
    state = advanceTo(state, 'movement');
    state = accepted(state, { type: 'move', player: 0, unitId: 'p0-u0', positions: [{ x: 15, y: 15 }], moveType: 'normal' });
    state = accepted(state, { type: 'move', player: 0, unitId: 'p0-u1', positions: [{ x: 15, y: 7 }], moveType: 'normal' });
    state = advanceTo(state, 'shooting');
    state = accepted(state, { type: 'attack', player: 0, unitId: 'p0-u0', targetId: 'p1-u0', weaponId: 'gun' });
    assert.equal(state.units[2].models.length, 1);
    state = advanceTo(state, 'command');
    assert.equal(state.activePlayer, 1);
    state = advanceTo(state, 'movement');
    state = accepted(state, { type: 'move', player: 1, unitId: 'p1-u0', positions: [{ x: 30.1, y: 15 }], moveType: 'normal' });
    state = accepted(state, { type: 'move', player: 1, unitId: 'p1-u1', positions: [{ x: 31, y: 25 }], moveType: 'normal' });
    state = advanceTo(state, 'command');
    assert.equal(state.round, 2); assert.equal(state.activePlayer, 0);
    assert.deepEqual(state.players.map(player => player.vp), [5, 5]);
    state = advanceTo(state, 'movement');
    state = accepted(state, { type: 'move', player: 0, unitId: 'p0-u0', positions: [{ x: 23, y: 15 }], moveType: 'normal' });
    state = advanceTo(state, 'charge');
    state = accepted(state, { type: 'chargeRoll', player: 0, unitId: 'p0-u0' });
    assert.ok((state.chargePending?.roll ?? 0) >= 6.1);
    state = accepted(state, { type: 'chargeMove', player: 0, unitId: 'p0-u0', targetId: 'p1-u0', positions: [{ x: 29.1, y: 15 }] });
    state = accepted(state, { type: 'endPhase', player: 0 });
    state = accepted(state, { type: 'attack', player: 0, unitId: 'p0-u0', targetId: 'p1-u0', weaponId: 'blade' });
    assert.equal(state.events.at(-1)?.combat?.weapon, 'Test blade');
    for (let i = 0; i < 50 && state.phase !== 'finished'; i++) {
      const fighter = eligibleFighters(state).find(unit => unit.owner === state.fightPlayer);
      if (fighter) {
        const target = legalTargets(state, fighter.id, 'blade')[0];
        assert.ok(target);
        state = accepted(state, { type: 'attack', player: state.fightPlayer, unitId: fighter.id, targetId: target.id, weaponId: 'blade' });
      } else state = accepted(state, { type: 'endPhase', player: state.phase === 'fight' ? state.fightPlayer : state.activePlayer });
    }
    assert.equal(state.phase, 'finished');
    assert.equal(state.winner, 'draw'); assert.deepEqual(state.players.map(player => player.vp), [10, 10]);
    assert.ok(state.events.some(event => event.combat?.destroyed));
    assert.ok(state.events.some(event => event.message.includes('+5 VP')));
    assert.deepEqual(replay(tacticalConfig(), tacticalPack(), state.history), state);
    assert.equal(state.revision, state.history.length);
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
    assert.equal(applyAction(state, { type: 'endPhase', player: 0 }).ok, false);
  });
  it('completes an untouched default-roster match without special fixtures', () => {
    let state = deployed(42, 1);
    for (let i = 0; i < 10 && state.phase !== 'finished'; i++) state = accepted(state, { type: 'endPhase', player: state.phase === 'fight' ? state.fightPlayer : state.activePlayer });
    assert.equal(state.phase, 'finished'); assert.equal(state.winner, 'draw');
    assert.deepEqual(replay(state.config, TRAINING_PACK, state.history), state);
  });
  it('concession identifies winner and cannot be replayed as a different action', () => {
    const before = deployed();
    const state = accepted(before, { type: 'concede', player: 1 });
    assert.equal(state.phase, 'finished'); assert.equal(state.winner, 0);
    assert.throws(() => replay(before.config, before.pack, [{ type: 'attack', player: 0, unitId: 'missing', targetId: 'missing', weaponId: 'missing' }]), /Replay action 1/);
  });
  it('rejects replay sequences exceeding the documented action bound', () => {
    const action: GameAction = { type: 'endPhase', player: 0 };
    assert.throws(() => replay(config(), TRAINING_PACK, Array(100001).fill(action)), /action count/);
  });
});

// Helpers above use reducer actions except explicitly named isolated spatial/combat
// fixtures. The complete match test never mutates engine state.
