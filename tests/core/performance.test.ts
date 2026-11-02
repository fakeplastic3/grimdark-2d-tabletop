import { it } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { SpatialIndex } from '../../packages/geometry/index';
import { d6 } from '../../packages/engine/dice';

it('repeatable spatial-index and dice benchmark (reports timing, no machine-specific threshold)', context => {
  const started = performance.now(), index = new SpatialIndex();
  for (let i = 0; i < 2000; i++) index.insert({ x: i % 50 * 1.5, y: Math.floor(i / 50) * 1.5, radius: 0.6 });
  let candidates = 0;
  for (let i = 0; i < 1000; i++) candidates += index.query({ x: i % 50 * 1.5, y: Math.floor(i / 50) * 1.5, radius: 3 }).length;
  const spatialMs = performance.now() - started;
  const random = { rng: 73, randomDraws: 0 }, diceStarted = performance.now();
  let checksum = 0;
  for (let i = 0; i < 100000; i++) checksum += d6(random);
  const diceMs = performance.now() - diceStarted;
  assert.ok(candidates > 1000 && candidates < 2000000);
  assert.ok(checksum >= 100000 && checksum <= 600000);
  context.diagnostic(`2000 tokens / 1000 queries: ${spatialMs.toFixed(2)} ms, ${candidates} candidates. 100000 d6: ${diceMs.toFixed(2)} ms.`);
});
