import { describe, expect, it } from 'vitest';
import { createGame, applyAction } from '../packages/engine';
import { loadGame, saveGame, undoLastSafeAction } from '../packages/engine/persistence';
import { defaultArmies } from '../packages/rules-data';

const initial = () => createGame({armies:defaultArmies(),pointsLimit:1000,rounds:3,seed:42,layout:'foundry',mode:'training'});
describe('versioned saves and safe undo', () => {
  it('round trips the initial state and a real accepted deployment through replay', () => {
    const before = initial();
    expect(loadGame(saveGame(before))).toEqual(before);
    const unit = before.units[0];
    const result = applyAction(before,{type:'deploy',player:0,unitId:unit.id,positions:unit.models.map(m=>({x:m.x,y:m.y,z:0}))});
    expect(result.ok).toBe(true);
    const loaded = loadGame(saveGame(result.state));
    expect(loaded).toEqual(result.state);
    expect(undoLastSafeAction(loaded)).toEqual(before);
  });
  it('rejects manipulated health or random state rather than trusting snapshots', () => {
    const data = JSON.parse(saveGame(initial()));
    data.state.units[0].models[0].wounds = 100;
    expect(() => loadGame(JSON.stringify(data))).toThrow(/does not match/);
    const random = JSON.parse(saveGame(initial())); random.state.rng++;
    expect(() => loadGame(JSON.stringify(random))).toThrow(/does not match/);
  });
  it('rejects malformed, oversized, future-version and illegal-action saves', () => {
    expect(()=>loadGame('not json')).toThrow(/valid JSON/);
    expect(()=>loadGame('x'.repeat(5*1024*1024+1))).toThrow(/5 MB/);
    const version = JSON.parse(saveGame(initial())); version.schemaVersion = 2;
    expect(()=>loadGame(JSON.stringify(version))).toThrow(/Incompatible/);
    const actions = JSON.parse(saveGame(initial())); actions.actions = [{type:'ready',player:0}];
    expect(()=>loadGame(JSON.stringify(actions))).toThrow(/Deploy every unit/);
  });
  it('does not allow undoing a terminal result', () => {
    const finished = applyAction(initial(),{type:'concede',player:0});
    expect(finished.ok).toBe(true);
    expect(()=>undoLastSafeAction(finished.state)).toThrow(/reversible/);
    expect(loadGame(saveGame(finished.state))).toEqual(finished.state);
  });
});
