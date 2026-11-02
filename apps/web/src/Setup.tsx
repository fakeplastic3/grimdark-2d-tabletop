import { useRef, useState } from 'react';
import type { Army, GameConfig, RulesPack } from '../../../packages/shared/types';
import { armyPoints, defaultArmies, validateArmy } from '../../../packages/rules-data';
import { download } from './utils';

interface Props { pack: RulesPack; onStart(config: GameConfig): void; onImportSave(file: File): void; onImportPack(file: File): void; error: string; }

export function Setup({ pack, onStart, onImportSave, onImportPack, error }: Props) {
  const [armies, setArmies] = useState<[Army, Army]>(() => defaultArmies(pack));
  const [points, setPoints] = useState(1000);
  const [rounds, setRounds] = useState(5);
  const [layout, setLayout] = useState<'foundry' | 'crossroads'>('foundry');
  const [localError, setLocalError] = useState('');
  const saveInput = useRef<HTMLInputElement>(null);
  const packInput = useRef<HTMLInputElement>(null);
  const armyInput = useRef<HTMLInputElement>(null);
  const [importPlayer, setImportPlayer] = useState<0 | 1>(0);
  const validation = armies.map(army => validateArmy(army, pack, points));
  const updateArmy = (player: 0 | 1, army: Army) => setArmies(previous => player === 0 ? [army, previous[1]] : [previous[0], army]);

  async function importArmy(file: File) {
    try {
      if (file.size > 250_000) throw new Error('Army file is too large.');
      const candidate: unknown = JSON.parse(await file.text());
      if (!candidate || typeof candidate !== 'object' || !('faction' in candidate) || !('name' in candidate) || !('entries' in candidate) || !('detachmentIds' in candidate)) throw new Error('This file does not contain an army.');
      const army = candidate as Army;
      if (typeof army.name !== 'string' || army.name.length > 80 || !['ultramarines', 'orks'].includes(army.faction) || !Array.isArray(army.entries) || !Array.isArray(army.detachmentIds) || army.entries.length > 60 || army.entries.some(entry => !entry || typeof entry.definitionId !== 'string' || !Number.isInteger(entry.count)) || army.detachmentIds.some(id => typeof id !== 'string')) throw new Error('Invalid army data.');
      const problems = validateArmy(army, pack, points);
      if (problems.length) throw new Error(problems.join(' '));
      updateArmy(importPlayer, army); setLocalError('');
    } catch (failure) { setLocalError(failure instanceof Error ? failure.message : 'Army import failed.'); }
  }

  return <main className="setup">
    <header className="brand-header"><div className="brand-mark">G<span>+</span></div><div><span className="eyebrow">TACTICAL COMMAND SYSTEM / 01</span><h1>GRIMDARK<span className="thin"> / TABLETOP</span></h1></div><span className="version-tag">TRAINING BUILD</span></header>
    <div className="setup-heading"><div><span className="eyebrow">TWO COMMANDERS. ONE BATTLEFIELD.</span><h2>Assemble your forces.</h2><p>A measured battlefield. Every model accounted for.<br/>A complete local training match, with the dice and bookkeeping handled.</p></div><div className="setup-sigil" aria-hidden="true"><span>44 × 30</span><small>INCHES OF CONTESTED GROUND</small><i>⌖</i></div></div>
    <div className="coverage-notice"><span className="notice-symbol">!</span><div><strong>Original training rules — official 11th Edition mode is unavailable.</strong><p>These themed units, points, detachments, and mission are original test content. They are not official Ultramarines or Orks datasheets. Importing private data does not certify the rules engine.</p></div></div>
    <section className="mission-config panel"><div className="section-title"><span className="eyebrow">01 / OPERATION PARAMETERS</span><strong>Sector control · training mission</strong></div><div className="config-fields"><label>Army budget<select value={points} onChange={event => setPoints(Number(event.target.value))}><option value={500}>500 points · skirmish</option><option value={1000}>1,000 points · incursion budget</option><option value={2000}>2,000 points · strike force budget</option></select></label><label>Battlefield<select value={layout} onChange={event => setLayout(event.target.value as typeof layout)}><option value="foundry">The abandoned foundry</option><option value="crossroads">Ashen crossroads</option></select></label><label>Duration<select value={rounds} onChange={event => setRounds(Number(event.target.value))}><option value={3}>3 battle rounds</option><option value={5}>5 battle rounds</option></select></label><label>Game mode<select value="training" disabled><option value="training">Local hotseat · training</option></select></label></div></section>
    <section className="army-builders">{armies.map((army, index) => {
      const player = index as 0 | 1;
      const definitions = pack.units.filter(unit => unit.faction === army.faction);
      const total = armyPoints(army, pack);
      return <article className={`army-builder panel player-${player}`} key={player}><div className="army-heading"><div className="army-insignia">{army.faction === 'ultramarines' ? 'U' : 'O'}</div><div><span className="eyebrow">COMMANDER {player + 1}</span><h3>{army.faction === 'ultramarines' ? 'Ultramarines' : 'Orks'}</h3><span className="muted">Faction theme · original training profiles</span></div><div className="army-cost"><strong>{total}</strong><small>/ {points} PTS</small></div></div>
        <label className="army-name">Army name<input value={army.name} maxLength={60} onChange={event => updateArmy(player, { ...army, name: event.target.value })}/></label>
        <label>Faction<select value={army.faction} onChange={event => { const faction = event.target.value as Army['faction']; updateArmy(player, { ...army, faction, entries: [], detachmentIds: pack.detachments.filter(item => item.faction === faction).slice(0, 1).map(item => item.id) }); }}><option value="ultramarines">Ultramarines theme</option><option value="orks">Orks theme</option></select></label>
        <fieldset className="detachments"><legend>Training detachments</legend>{pack.detachments.filter(item => item.faction === army.faction).map(item => <label className="check-label" key={item.id}><input type="checkbox" checked={army.detachmentIds.includes(item.id)} onChange={event => updateArmy(player, { ...army, detachmentIds: event.target.checked ? [...army.detachmentIds, item.id] : army.detachmentIds.filter(id => id !== item.id) })}/><span>{item.name}<small>{item.cost} DP · {item.disposition} · {item.description}</small></span></label>)}</fieldset>
        <div className="roster-build">{army.entries.map((entry, entryIndex) => { const definition = pack.units.find(item => item.id === entry.definitionId); if (!definition) return null; return <div className="build-entry" key={`${entry.definitionId}-${entryIndex}`}><span className="role-icon">{definition.role === 'character' ? '◆' : definition.role === 'vehicle' ? '▣' : '◉'}</span><div><strong>{definition.name}</strong><small>{definition.role} · {definition.baseMm} mm base · M {definition.move} / T {definition.toughness} / Sv {definition.save}+</small></div><select aria-label={`Model count for ${definition.name} ${entryIndex + 1}`} value={entry.count} onChange={event => updateArmy(player, { ...army, entries: army.entries.map((item, i) => i === entryIndex ? { ...item, count: Number(event.target.value) } : item) })}>{definition.modelCounts.map((count, i) => <option key={count} value={count}>{count} models · {definition.points[i]} pts</option>)}</select><button className="icon-button" aria-label={`Remove ${definition.name} ${entryIndex + 1}`} onClick={() => updateArmy(player, { ...army, entries: army.entries.filter((_, i) => i !== entryIndex) })}>×</button></div>; })}</div>
        <label>Add a unit<select value="" aria-label={`Add unit player ${player + 1}`} onChange={event => { const definition = pack.units.find(item => item.id === event.target.value); if (definition) updateArmy(player, { ...army, entries: [...army.entries, { definitionId: definition.id, count: definition.modelCounts[0] }] }); }}><option value="">Select a training profile…</option>{definitions.map(unit => <option key={unit.id} value={unit.id}>{unit.name} · from {unit.points[0]} pts</option>)}</select></label>
        <div className="army-validation">{validation[player].length ? validation[player].map((message, i) => <p className="error-text" key={i}>! {message}</p>) : <p className="valid-text">✓ Training army valid · {army.entries.length} units</p>}</div><div className="inline-actions"><button className="text-button" onClick={() => download(`army-${player + 1}.json`, JSON.stringify(army, null, 2))}>Export army ↗</button><button className="text-button" onClick={() => { setImportPlayer(player); armyInput.current?.click(); }}>Import army</button></div>
      </article>;
    })}</section>
    {(error || localError) && <div role="alert" className="error-notice">{error || localError}</div>}
    <div className="setup-footer"><div><span className="eyebrow">RULES PACK</span><p>{pack.name} <span className="muted">v{pack.version}</span></p><div className="inline-actions"><button className="text-button" onClick={() => packInput.current?.click()}>Import private training pack</button><button className="text-button" onClick={() => saveInput.current?.click()}>Resume from save</button></div></div><button className="primary large" disabled={validation.some(problems => problems.length > 0)} onClick={() => { const seed = crypto.getRandomValues(new Uint32Array(1))[0]; onStart({ armies, pointsLimit: points, rounds, seed, layout, mode: 'training' }); }}>Deploy forces <span>→</span></button></div>
    <footer className="legal-footer">Unofficial fan project. Not affiliated with Games Workshop. All graphics are original geometric artwork. <a href="https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/" target="_blank" rel="noreferrer">Official rules downloads ↗</a></footer>
    <input ref={saveInput} hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) onImportSave(file); event.target.value = ''; }}/><input ref={packInput} hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) onImportPack(file); event.target.value = ''; }}/><input ref={armyInput} hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) void importArmy(file); event.target.value = ''; }}/>
  </main>;
}
