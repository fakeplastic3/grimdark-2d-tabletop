import { z } from 'zod';
import { replay } from './index';
import { actionSchema, configSchema, parseRulesPack, rulesPackSchema } from '../shared/validation';
import type { GameState, SaveEnvelope } from '../shared/types';

const MAX_SAVE_BYTES = 5 * 1024 * 1024;
const envelopeSchema = z.object({format:z.literal('grimdark-save'),schemaVersion:z.literal(1),initialConfig:configSchema,pack:rulesPackSchema,actions:z.array(actionSchema).max(10000),state:z.unknown()}).strict();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function saveGame(state: GameState): string {
  const envelope: SaveEnvelope = {format:'grimdark-save',schemaVersion:1,initialConfig:state.config,pack:state.pack,actions:state.history,state};
  const json = JSON.stringify(envelope);
  if (json.length > MAX_SAVE_BYTES) throw new Error('Save exceeds the 5 MB limit.');
  return json;
}
export function loadGame(json: string): GameState {
  if (json.length > MAX_SAVE_BYTES) throw new Error('Save exceeds the 5 MB limit.');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('The save is not valid JSON.'); }
  const result = envelopeSchema.safeParse(value);
  if (!result.success) throw new Error('Incompatible or invalid save. This build accepts grimdark-save schema version 1 only.');
  const data = result.data;
  const pack = parseRulesPack(data.pack);
  const rebuilt = replay(data.initialConfig,pack,data.actions);
  if (canonical(rebuilt) !== canonical(data.state)) throw new Error('The saved state does not match its deterministic action history. The file may be damaged or modified.');
  return rebuilt;
}
export const exportReplay = saveGame;
export function undoLastSafeAction(state: GameState): GameState {
  if (!state.history.length || state.phase === 'finished') throw new Error('There is no reversible action.');
  const last = state.history[state.history.length - 1];
  if (last.type !== 'move' && last.type !== 'deploy') throw new Error('Only positioning can be undone, before subsequent information is revealed.');
  const prior = replay(state.config,state.pack,state.history.slice(0,-1));
  if (prior.randomDraws !== state.randomDraws) throw new Error('A random result has been revealed; undo is unavailable.');
  return prior;
}
