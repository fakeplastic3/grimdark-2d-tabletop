import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameAction, GameConfig, GameState, PlayerId, Point, RulesPack, Unit } from '../../../packages/shared/types';
import { applyAction, createGame, eligibleFighters, movementPreview, objectiveControl, replay } from '../../../packages/engine';
import { exportReplay, loadGame, saveGame, undoLastSafeAction } from '../../../packages/engine/persistence';
import { TRAINING_PACK } from '../../../packages/rules-data';
import { parseRulesPack } from '../../../packages/shared/validation';
import { Setup } from './Setup';
import { Board, type ViewSettings } from './Board';
import { Inspector } from './Inspector';
import { EventLog } from './EventLog';
import { OnlinePanel } from './OnlinePanel';
import { center, download, formation, living, PHASES, title, translate } from './utils';

const STORAGE = 'grimdark-training-match-v1';
const SETTINGS = 'grimdark-settings-v1';
const HISTORY = 'grimdark-match-history-v1';
const DEFAULT_SETTINGS: ViewSettings = { grid: false, labels: true, ranges: true, ruler: false, scale: 1, animations: true, sound: false };
type NetworkSession = { player: PlayerId; dispatch(action: GameAction): void };
type HistoryEntry = { id: string; name: string; date: string; result: string; save: string };

function readSettings(): ViewSettings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS) ?? '{}') as Partial<ViewSettings>;
    return { grid: typeof value.grid === 'boolean' ? value.grid : false, labels: value.labels !== false, ranges: value.ranges !== false, ruler: false, scale: typeof value.scale === 'number' && value.scale >= .85 && value.scale <= 1.25 ? value.scale : 1, animations: value.animations !== false, sound: value.sound === true };
  } catch { return DEFAULT_SETTINGS; }
}

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [pack, setPack] = useState<RulesPack>(TRAINING_PACK);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState<ViewSettings>(readSettings);
  const [network, setNetwork] = useState<NetworkSession | null>(null);
  const [replayStep, setReplayStep] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const audioContext = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE);
      if (cached) { const loaded = loadGame(cached); setGame(loaded); setPack(loaded.pack); setNotice('Recovered the last valid local match.'); }
      const records: unknown = JSON.parse(localStorage.getItem(HISTORY) ?? '[]');
      if (Array.isArray(records)) setHistory(records.filter((entry): entry is HistoryEntry => Boolean(entry) && typeof entry === 'object' && typeof entry.id === 'string' && typeof entry.save === 'string' && typeof entry.name === 'string' && typeof entry.date === 'string' && typeof entry.result === 'string').slice(0, 10));
    } catch (failure) { setError(`Recovery failed: ${failure instanceof Error ? failure.message : 'unknown error'}. The existing browser save has not been deleted.`); }
  }, []);

  useEffect(() => {
    if (!game || network) return;
    try { localStorage.setItem(STORAGE, saveGame(game)); } catch (failure) { setError(`Automatic save failed: ${failure instanceof Error ? failure.message : 'storage unavailable'}. Export a save file to keep this match.`); }
  }, [game, network]);
  useEffect(() => { try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch { /* Settings remain usable for the session. */ } }, [settings]);

  useEffect(() => {
    if (!game || game.phase !== 'finished' || network) return;
    const id = `${game.config.seed}-${game.config.armies.map(army => army.name).join('-')}`;
    setHistory(previous => {
      if (previous.some(entry => entry.id === id)) return previous;
      const entry: HistoryEntry = { id, name: `${game.players[0].name} / ${game.players[1].name}`, date: new Date().toISOString(), result: game.winner === 'draw' ? 'Draw' : `Commander ${Number(game.winner) + 1} wins`, save: saveGame(game) };
      const next = [entry, ...previous].slice(0, 10);
      try { localStorage.setItem(HISTORY, JSON.stringify(next)); } catch { setNotice('Match complete. History storage is full; export this result.'); }
      return next;
    });
  }, [game, network]);

  const notifyAction = () => {
    if (!settings.sound) return;
    try { audioContext.current ??= new AudioContext(); const context = audioContext.current; void context.resume(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = 440; gain.gain.setValueAtTime(.025, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .07); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .08); } catch { /* Sound is optional. */ }
  };
  const dispatch = (action: GameAction) => {
    if (!game || replayStep !== null) return;
    setError(''); setNotice('');
    if (network) { network.dispatch(action); return; }
    const result = applyAction(game, action);
    if (!result.ok) setError(result.error ?? 'This action is not legal.');
    else { setGame(result.state); notifyAction(); }
  };
  const start = (config: GameConfig) => { try { const next = createGame(config, pack); setGame(next); setError(''); setNotice('Deploy every unit inside its colored zone, then lock each commander’s deployment.'); setReplayStep(null); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not create the match.'); } };
  const load = async (file: File) => { try { if (file.size > 5 * 1024 * 1024) throw new Error('Save must be smaller than 5 MB.'); const loaded = loadGame(await file.text()); setGame(loaded); setPack(loaded.pack); setReplayStep(null); setError(''); setNotice('Match loaded and verified against its action history.'); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load the file.'); } };
  const importPack = async (file: File) => { try { if (file.size > 2 * 1024 * 1024) throw new Error('Rules pack must be smaller than 2 MB.'); setPack(parseRulesPack(JSON.parse(await file.text()))); setError(''); setNotice('Private training pack loaded. It stays in this browser until you export a match.'); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid rules pack.'); } };
  const onlineSession = useCallback((state: GameState, player: PlayerId, sendAction: (action: GameAction) => void) => { setGame(state); setNetwork({ player, dispatch: sendAction }); setReplayStep(null); setError(''); }, []);
  const disconnect = useCallback(() => { setNetwork(null); setGame(null); setNotice('Disconnected from the online match. Your last local save remains in browser storage.'); }, []);
  const newMatch = () => { if (game && !window.confirm('Leave this match and return to army setup? Export a save first if you want a separate copy.')) return; setGame(null); setReplayStep(null); setError(''); setNotice(''); try { localStorage.removeItem(STORAGE); } catch { /* May be blocked. */ } };
  const undo = () => { if (!game || network) return; try { setGame(undoLastSafeAction(game)); setError(''); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Undo is unavailable.'); } };
  const downloadSave = (isReplay = false) => { if (!game) return; try { download(isReplay ? 'grimdark-replay.json' : 'grimdark-save.json', isReplay ? exportReplay(game) : saveGame(game)); setNotice('Save exported. Keep private rules packs private when sharing files.'); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Export failed.'); } };

  let displayedGame = game;
  if (game && replayStep !== null) { try { displayedGame = replay(game.config, game.pack, game.history.slice(0, replayStep)); } catch { displayedGame = game; } }
  const actor = displayedGame?.phase === 'fight' ? displayedGame.fightPlayer : displayedGame?.activePlayer;
  const readOnly = replayStep !== null || Boolean(network && network.player !== actor);
  const lastAction = game?.history[game.history.length - 1];

  return <div className={`app-shell ${settings.animations ? '' : 'reduce-motion'}`} style={{ '--ui-scale': settings.scale } as CSSProperties}>
    <div className="utility-bar"><span>GRIMDARK / LOCAL-FIRST TACTICAL TABLETOP</span><div><button onClick={() => setShowCoverage(true)}>Rules coverage</button><button onClick={() => setShowHistory(true)}>Match history</button><button onClick={() => setShowSettings(true)}>Settings</button></div></div>
    <OnlinePanel onSession={onlineSession} onDisconnect={disconnect}/>
    {notice && <div className="notice-bar" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
    {!displayedGame ? <Setup key={pack.id + pack.version} pack={pack} onStart={start} onImportSave={file => void load(file)} onImportPack={file => void importPack(file)} error={error}/> : <>
      <header className="match-header"><div className="match-brand"><div className="brand-mark small">G<span>+</span></div><div><strong>GRIMDARK</strong><small>TRAINING OPERATION</small></div></div><div className="round-indicator"><small>BATTLE ROUND</small><strong>{displayedGame.round}<span> / {displayedGame.config.rounds}</span></strong></div><div className="scoreboard">{displayedGame.players.map(player => <div className={`player-score player-${player.id} ${actor === player.id ? 'active' : ''}`} key={player.id}><div><small>{player.id === network?.player ? 'YOU · ' : ''}COMMANDER {player.id + 1}</small><strong>{player.name}</strong></div><span className="resource"><b>{player.cp}</b> CP</span><span className="resource vp"><b>{player.vp}</b> VP</span></div>)}</div></header>
      <div className="training-strip"><strong>ORIGINAL TRAINING RULES</strong><span>Unofficial profiles and scoring. Full 11th Edition is not implemented.</span><button onClick={() => setShowCoverage(true)}>View limitations ↗</button></div>
      <nav className="phase-track" aria-label="Current game phase">{displayedGame.phase === 'deployment' ? <><span className="phase-step current"><i>00</i>Deployment</span><p>All bases must be wholly within your deployment zone.</p></> : PHASES.map((phase, index) => <span key={phase} className={`phase-step ${displayedGame.phase === phase ? 'current' : ''}`}><i>{String(index + 1).padStart(2, '0')}</i>{title(phase)}</span>)}<div className="phase-actor">{displayedGame.phase === 'finished' ? 'OPERATION COMPLETE' : `P${Number(actor) + 1} ${displayedGame.phase === 'fight' ? 'ACTIVATES' : 'TO ACT'}`}</div></nav>
      {replayStep !== null && game && <div className="replay-bar"><strong>REPLAY · {replayStep} / {game.history.length} orders</strong><input aria-label="Replay position" type="range" min="0" max={game.history.length} value={replayStep} onChange={event => setReplayStep(Number(event.target.value))}/><button disabled={replayStep === 0} onClick={() => setReplayStep(Math.max(0, replayStep - 1))}>←</button><button disabled={replayStep === game.history.length} onClick={() => setReplayStep(Math.min(game.history.length, replayStep + 1))}>→</button><button onClick={() => setReplayStep(null)}>Return to match</button></div>}
      {error && <div className="error-notice match-error" role="alert"><strong>Order rejected.</strong> {error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
      {displayedGame.phase === 'finished' && <section className="result-banner"><div><span className="eyebrow">OPERATION COMPLETE</span><h2>{displayedGame.winner === 'draw' ? 'A hard-fought draw.' : `${displayedGame.players[displayedGame.winner ?? 0].name} wins.`}</h2><p>{displayedGame.resultReason} · Final score {displayedGame.players[0].vp} – {displayedGame.players[1].vp}</p></div><div><button className="primary" disabled={Boolean(network)} onClick={() => downloadSave(true)}>Export result & replay</button><button className="secondary" disabled={Boolean(network)} onClick={newMatch}>New operation</button></div></section>}
      <MatchView game={displayedGame} settings={settings} onSettings={setSettings} onAction={dispatch} readOnly={readOnly} key={`${displayedGame.config.seed}-${Boolean(network)}`}/>
      <footer className="match-footer"><div className="inline-actions"><button disabled={Boolean(network)} onClick={() => downloadSave()}>Export save</button><button disabled={Boolean(network)} onClick={() => fileInput.current?.click()}>Load save</button><button disabled={Boolean(network) || replayStep !== null || !lastAction || !['move', 'deploy'].includes(lastAction.type) || game?.phase === 'finished'} onClick={undo}>Undo positioning</button><button disabled={Boolean(network)} onClick={() => setReplayStep(replayStep === null ? 0 : null)}>{replayStep === null ? 'Replay match' : 'Exit replay'}</button></div><span>{network ? 'SERVER-AUTHORITATIVE SESSION' : 'AUTOSAVE ENABLED · LOCAL HOTSEAT'}</span><button disabled={Boolean(network)} className="text-button" onClick={newMatch}>New operation</button></footer>
    </>}
    <input hidden ref={fileInput} type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) void load(file); event.target.value = ''; }}/>
    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><section className="modal panel" role="dialog" aria-modal="true" aria-label="Settings" onClick={event => event.stopPropagation()}><div className="section-title"><h2>Command station settings</h2><button aria-label="Close settings" onClick={() => setShowSettings(false)}>×</button></div>{([['grid', 'Inch grid'], ['labels', 'Unit labels'], ['ranges', 'Reference range overlay'], ['animations', 'Token shadows and transitions'], ['sound', 'Order confirmation sound']] as const).map(([key, label]) => <label className="check-label" key={key}><input type="checkbox" checked={settings[key]} onChange={event => setSettings({ ...settings, [key]: event.target.checked })}/><span>{label}</span></label>)}<label>Interface scale<select value={settings.scale} onChange={event => setSettings({ ...settings, scale: Number(event.target.value) })}><option value={.85}>Compact · 85%</option><option value={1}>Standard · 100%</option><option value={1.15}>Large · 115%</option></select></label><div className="help-card"><strong>Keyboard & pointer controls</strong><p>R toggles the ruler. G toggles the grid. Escape cancels a draft. Tab and Enter select model tokens. Right-drag or Alt-drag pans; scroll zooms. Colors are paired with commander numbers and distinct token symbols.</p></div></section></div>}
    {showCoverage && <div className="modal-backdrop" onClick={() => setShowCoverage(false)}><section className="modal wide panel" role="dialog" aria-modal="true" aria-label="Rules coverage" onClick={event => event.stopPropagation()}><div className="section-title"><span className="eyebrow">TRANSPARENT IMPLEMENTATION STATUS</span><button aria-label="Close rules coverage" onClick={() => setShowCoverage(false)}>×</button></div><h2>This is a training game.</h2><p>The official 11th Edition simulator acceptance criteria are not met. The current public build offers an integrated original training game and a rules-engine foundation.</p><div className="coverage-grid"><div><h3>Implemented training systems</h3><p>Army validation, circular per-model bases, deployment, movement checks, combat dice and casualties, alternating melee activations, terrain areas, objective scoring, full rounds, concession, save recovery, and deterministic replay.</p></div><div><h3>Official coverage unavailable</h3><p>Current official faction datasheets and points, doctrines and Ork army rules, leader attachments, enhancements, official mission framework, grouped combat allocation, full fight sequencing, stratagem response windows, reserves, and other omitted interactions are not certified or implemented.</p></div></div><p>2D visibility, straight movement paths, training command abilities, and the training mission are explicit limitations. Importing private numerical profiles does not implement missing mechanics.</p><a href="https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/" target="_blank" rel="noreferrer">Read authorized official rules and updates ↗</a></section></div>}
    {showHistory && <div className="modal-backdrop" onClick={() => setShowHistory(false)}><section className="modal wide panel" role="dialog" aria-modal="true" aria-label="Match history" onClick={event => event.stopPropagation()}><div className="section-title"><h2>Completed operations</h2><button aria-label="Close match history" onClick={() => setShowHistory(false)}>×</button></div>{history.length === 0 ? <p>Finished local matches will be retained here, up to ten matches.</p> : history.map(entry => <div className="history-entry" key={entry.id}><div><strong>{entry.name}</strong><small>{entry.result} · {new Date(entry.date).toLocaleDateString()}</small></div><button disabled={Boolean(network)} onClick={() => { try { setGame(loadGame(entry.save)); setReplayStep(0); setShowHistory(false); setError(''); } catch { setError('This historical save is incompatible or damaged.'); } }}>Replay</button><button onClick={() => download('grimdark-result.json', entry.save)}>Export</button></div>)}</section></div>}
  </div>;
}

interface MatchProps { game: GameState; settings: ViewSettings; onSettings(value: ViewSettings): void; onAction(action: GameAction): void; readOnly: boolean }
export function MatchView({ game, settings, onSettings, onAction, readOnly }: MatchProps) {
  const [selectedId, setSelectedId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [weaponId, setWeaponId] = useState('');
  const [draft, setDraft] = useState<Point[] | null>(null);
  const [moveType, setMoveType] = useState<'normal' | 'advance' | 'fallBack' | 'stationary'>('normal');
  const [individual, setIndividual] = useState(false);
  const [focusedModel, setFocusedModel] = useState<string | null>(null);
  const actor = game.phase === 'fight' ? game.fightPlayer : game.activePlayer;
  const selected = game.units.find(unit => unit.id === selectedId);
  const definition = game.pack.units.find(unit => unit.id === selected?.definitionId);
  const weapon = definition?.weapons.filter(item => game.phase === 'fight' ? item.kind === 'melee' : item.kind === 'ranged').find(item => item.id === weaponId) ?? definition?.weapons.find(item => game.phase === 'fight' ? item.kind === 'melee' : item.kind === 'ranged');
  const controls = objectiveControl(game);
  const fighters = game.phase === 'fight' ? eligibleFighters(game) : [];
  const draftErrors = draft && selected && (game.phase === 'movement' || game.phase === 'deployment') ? movementPreview(game, selected.id, draft, moveType) : [];

  useEffect(() => { setDraft(null); setTargetId(''); setMoveType('normal'); setFocusedModel(null); setSelectedId(''); }, [game.phase, game.round, actor]);
  useEffect(() => { setDraft(null); }, [game.revision]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      if (event.key === 'Escape') setDraft(null);
      if (event.key.toLowerCase() === 'r') onSettings({ ...settings, ruler: !settings.ruler });
      if (event.key.toLowerCase() === 'g') onSettings({ ...settings, grid: !settings.grid });
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [settings, onSettings]);

  const select = (unit: Unit, modelId?: string) => {
    if (selected && selected.owner === actor && unit.owner !== actor && ['shooting', 'charge', 'fight'].includes(game.phase)) { setTargetId(unit.id); return; }
    if (selectedId !== unit.id) { setDraft(null); setTargetId(''); setWeaponId(''); }
    setSelectedId(unit.id); setFocusedModel(modelId ?? living(unit)[0]?.id ?? null);
  };
  const place = (point: Point) => {
    if (!selected || selected.owner !== actor || readOnly || !['deployment', 'movement', 'charge'].includes(game.phase)) return;
    if (game.phase === 'charge' && game.chargePending?.unitId !== selected.id) return;
    if (individual && focusedModel) {
      const models = living(selected); const current = draft ?? (selected.deployed ? models.map(model => ({ x: model.x, y: model.y, z: model.z ?? 0 })) : formation(selected, { x: actor === 0 ? 4 : 40, y: 15 }));
      setDraft(current.map((position, index) => models[index]?.id === focusedModel ? point : position));
    } else setDraft(selected.deployed ? translate(selected, point) : formation(selected, point));
  };
  const confirm = () => {
    if (!selected || readOnly) return;
    const positions = draft ?? (moveType === 'stationary' ? living(selected).map(model => ({ x: model.x, y: model.y, z: model.z ?? 0 })) : null);
    if (!positions) return;
    if (game.phase === 'deployment') onAction({ type: 'deploy', player: actor, unitId: selected.id, positions });
    if (game.phase === 'movement') onAction({ type: 'move', player: actor, unitId: selected.id, positions, moveType });
    if (game.phase === 'charge' && targetId) onAction({ type: 'chargeMove', player: actor, unitId: selected.id, targetId, positions });
  };
  const snapCharge = () => {
    if (!selected || !targetId) return;
    const target = game.units.find(unit => unit.id === targetId); if (!target || !target.models.length || !selected.models.length) return;
    const origin = center(living(selected)); const enemy = [...living(target)].sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))[0];
    const mover = [...living(selected)].sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y))[0];
    const length = Math.hypot(mover.x - enemy.x, mover.y - enemy.y) || 1;
    const contact = { x: enemy.x + (mover.x - enemy.x) / length * (mover.radius + enemy.radius), y: enemy.y + (mover.y - enemy.y) / length * (mover.radius + enemy.radius) };
    setDraft(living(selected).map(model => ({ x: model.x + contact.x - mover.x, y: model.y + contact.y - mover.y, z: model.z ?? 0 })));
  };

  return <><div className="tactical-layout"><aside className="force-panel panel"><div className="section-title"><span className="eyebrow">ORDER OF BATTLE</span><span className="muted">{game.units.reduce((sum, unit) => sum + living(unit).length, 0)} MODELS</span></div>{game.players.map(player => <section className={`force-group player-${player.id}`} key={player.id}><div className="force-heading"><strong>{player.name}</strong><span>P{player.id + 1}</span></div>{game.units.filter(unit => unit.owner === player.id).map(unit => { const alive = living(unit); const def = game.pack.units.find(item => item.id === unit.definitionId); return <button key={unit.id} className={`roster-unit ${selectedId === unit.id ? 'selected' : ''} ${alive.length === 0 ? 'destroyed' : ''}`} onClick={() => select(unit)} disabled={alive.length === 0}><span className="roster-symbol">{def?.role === 'character' ? '◆' : unit.owner === 0 ? 'Ⅰ' : 'Ⅱ'}</span><span><strong>{unit.name}</strong><small>{alive.length}/{unit.startingModels} models · {alive.reduce((sum, model) => sum + model.wounds, 0)} W</small><span className="unit-status">{alive.length === 0 ? 'DESTROYED' : game.phase === 'deployment' ? unit.deployed ? 'DEPLOYED' : 'AWAITING DEPLOYMENT' : unit.shocked ? 'SHOCKED' : unit.fought ? 'FOUGHT' : unit.shot ? 'FIRED' : unit.moved ? 'MOVED' : 'READY'}</span></span>{fighters.some(fighter => fighter.id === unit.id) && <span className="activation-dot" title="Eligible to fight"/>}</button>; })}</section>)}<div className="objective-ledger"><span className="eyebrow">SECTOR CONTROL</span>{controls.map(control => <div key={control.terrainId}><span>{game.terrain.find(item => item.id === control.terrainId)?.name}</span><strong className={control.owner === 0 ? 'blue-text' : control.owner === 1 ? 'green-text' : ''}>{control.owner === null ? '—' : control.owner === 'contested' ? 'TIED' : `P${control.owner + 1}`}</strong></div>)}<p>Training scoring occurs at the mission’s end-of-round window. Inspect the event log for awarded VP.</p></div></aside>
      <section className="battle-center"><Board game={game} selected={selected} targetId={targetId} draft={draft} draftErrors={draftErrors} focusedModel={individual ? focusedModel : null} settings={settings} weaponRange={weapon?.range ?? 0} onSelect={(unit, modelId) => select(unit, modelId)} onPlace={place} onSettings={onSettings}/><div className="command-bar"><div><span className="eyebrow">COMMANDER {actor + 1}</span><strong>{game.phase === 'deployment' ? 'Deploy your forces' : game.phase === 'fight' ? 'Select an eligible combatant' : `${title(game.phase)} orders`}</strong>{game.phase === 'fight' && <small>{fighters.length} eligible activation{fighters.length === 1 ? '' : 's'}</small>}</div><div className="command-actions">{game.phase === 'command' && <button disabled={readOnly || game.players[actor].abilityUsed} className="secondary" onClick={() => onAction({ type: 'ability', player: actor })}>{game.players[actor].abilityUsed ? 'Resupply used' : 'Training resupply · +2 CP'}</button>}{game.phase === 'charge' && game.chargePending && <button disabled={readOnly || !targetId || !selected} className="secondary" onClick={snapCharge}>Draft closest base contact</button>}{game.phase === 'deployment' ? <button className="primary" disabled={readOnly || game.players[actor].ready || game.units.some(unit => unit.owner === actor && !unit.deployed)} onClick={() => onAction({ type: 'ready', player: actor })}>Lock P{actor + 1} deployment →</button> : game.phase !== 'finished' && <button className="primary" disabled={readOnly || (game.phase === 'fight' && fighters.length > 0)} onClick={() => onAction({ type: 'endPhase', player: actor })}>{game.phase === 'fight' ? 'End turn' : 'Next phase'} →</button>}</div></div><EventLog events={game.events}/></section>
      <Inspector game={game} selected={selected} targetId={targetId} weaponId={weaponId} draft={draft} draftErrors={draftErrors} moveType={moveType} individual={individual} focusedModel={focusedModel} readOnly={readOnly} onWeapon={setWeaponId} onTarget={setTargetId} onMoveType={value => { setMoveType(value); setDraft(null); }} onIndividual={setIndividual} onAction={onAction} onConfirm={confirm} onCancel={() => setDraft(null)}/>
    </div>{game.phase !== 'finished' && <div className="concede-row"><button className="text-button" disabled={readOnly} onClick={() => { if (window.confirm(`Commander ${actor + 1}: concede this match? This cannot be undone.`)) onAction({ type: 'concede', player: actor }); }}>Concede as commander {actor + 1}</button></div>}</>;
}
