import type { Army, Detachment, FactionId, RulesPack, Terrain, UnitDefinition, Weapon } from '../shared/types';

const gun = (id: string, name: string, range: number, attacks: number, skill: number, strength: number, ap: number, damage: number, abilities: Weapon['abilities'] = []): Weapon => ({ id, name, kind: 'ranged', range, attacks, skill, strength, ap, damage, abilities });
const blade = (id: string, attacks: number, skill: number, strength: number, ap: number, damage: number): Weapon => ({ id, name: 'Training melee profile', kind: 'melee', range: 2, attacks, skill, strength, ap, damage, abilities: [] });
const units: UnitDefinition[] = [
  { id:'blue-line', faction:'ultramarines', name:'Azure line squad', role:'infantry', modelCounts:[3,5], points:[75,125], baseMm:32, move:6, toughness:4, save:3, wounds:2, leadership:6, oc:2, maxCopies:3, keywords:['infantry'], weapons:[gun('carbine','Training carbine',24,2,3,4,0,1,['rapidFire']),blade('blade',2,3,4,0,1)] },
  { id:'blue-breach', faction:'ultramarines', name:'Azure breach team', role:'infantry', modelCounts:[3,5], points:[90,150], baseMm:32, move:6, toughness:4, save:3, wounds:2, leadership:6, oc:2, maxCopies:3, keywords:['infantry'], weapons:[gun('pistol','Training sidearm',12,1,3,4,0,1),blade('blade',4,3,5,1,1)] },
  { id:'blue-command', faction:'ultramarines', name:'Azure field commander', role:'character', modelCounts:[1], points:[60], baseMm:40, move:6, toughness:4, save:3, invulnerable:4, wounds:5, leadership:5, oc:1, maxCopies:1, keywords:['infantry','character'], weapons:[gun('rifle','Training precision rifle',24,2,2,5,1,2,['lethal']),blade('blade',4,2,5,1,2)] },
  { id:'green-raiders', faction:'orks', name:'Verdant raiders', role:'infantry', modelCounts:[5,10], points:[60,120], baseMm:32, move:6, toughness:5, save:5, wounds:1, leadership:7, oc:2, maxCopies:3, keywords:['infantry'], weapons:[gun('blaster','Training scrap blaster',18,2,5,4,0,1),blade('blade',3,3,5,1,1)] },
  { id:'green-brutes', faction:'orks', name:'Verdant heavy mob', role:'infantry', modelCounts:[3,5], points:[90,150], baseMm:40, move:5, toughness:5, save:4, wounds:3, leadership:6, oc:1, maxCopies:3, keywords:['infantry'], weapons:[gun('sprayer','Training flame sprayer',12,3,4,4,0,1,['torrent']),blade('blade',3,3,7,2,2)] },
  { id:'green-command', faction:'orks', name:'Verdant war leader', role:'character', modelCounts:[1], points:[60], baseMm:40, move:6, toughness:5, save:4, invulnerable:5, wounds:6, leadership:6, oc:1, maxCopies:1, keywords:['infantry','character'], weapons:[gun('blaster','Training scrap blaster',18,2,4,5,0,1),blade('blade',5,2,7,2,2)] },
];
const detachments: Detachment[] = (['ultramarines','orks'] as FactionId[]).flatMap(faction => [
  { id:`${faction}-line`, faction, name:'Training line formation', cost:1, disposition:'balanced' as const, description:'Original training formation. One detachment slot. No additional combat effect.' },
  { id:`${faction}-spear`, faction, name:'Training spearhead', cost:2, disposition:'aggressive' as const, description:'Original training formation. Two detachment slots. No additional combat effect.' },
]);
export const TRAINING_PACK: RulesPack = { schemaVersion:1, id:'original-training', version:'0.1.0', name:'Foundry training rules', status:'training', sourceNote:'Original test profiles and mission, not official Warhammer datasheets, points, detachments, doctrines or army rules. Faction labels indicate token colour only. See docs/RULES_COVERAGE.md.', units, detachments };
export function armyPoints(army: Army, pack: RulesPack = TRAINING_PACK): number {
  return army.entries.reduce((sum, entry) => { const definition = pack.units.find(u => u.id === entry.definitionId); return sum + (definition?.points[definition.modelCounts.indexOf(entry.count)] ?? 0); },0);
}
export function validateArmy(army: Army, pack: RulesPack = TRAINING_PACK, pointsLimit = 500): string[] {
  const errors: string[] = [];
  if (!['ultramarines','orks'].includes(army.faction)) errors.push('Unsupported faction.');
  if (!Number.isInteger(pointsLimit) || pointsLimit < 250 || pointsLimit > 3000) errors.push('Training budget must be 250–3000 points.');
  if (!army.entries.length || army.entries.length > 30) errors.push('Choose between 1 and 30 units.');
  if (!army.name.trim() || army.name.length > 80) errors.push('Give your army a name of 1–80 characters.');
  const copies = new Map<string,number>();
  let commanders = 0;
  for (const entry of army.entries) {
    const def = pack.units.find(u => u.id === entry.definitionId);
    if (!def) { errors.push(`Unknown unit: ${entry.definitionId}`); continue; }
    if (def.faction !== army.faction) errors.push(`${def.name} belongs to the other faction.`);
    if (!def.modelCounts.includes(entry.count)) errors.push(`${def.name}: choose ${def.modelCounts.join(' or ')} models.`);
    copies.set(def.id,(copies.get(def.id) ?? 0)+1);
    if ((copies.get(def.id) ?? 0) > def.maxCopies) errors.push(`${def.name}: maximum ${def.maxCopies} copies.`);
    if (def.role === 'character') commanders++;
  }
  if (!commanders) errors.push('Training armies require a commander.');
  const points = armyPoints(army,pack);
  if (points > pointsLimit) errors.push(`${points} points exceeds the ${pointsLimit} budget.`);
  if (!army.detachmentIds.length) errors.push('Select a training formation.');
  if (new Set(army.detachmentIds).size !== army.detachmentIds.length) errors.push('A formation cannot be selected twice.');
  let dp = 0;
  for (const id of army.detachmentIds) { const det = pack.detachments.find(d => d.id === id); if (!det || det.faction !== army.faction) errors.push('Formation is unavailable for this faction.'); else dp += det.cost; }
  const limit = pointsLimit <= 1000 ? 2 : 3;
  if (dp > limit) errors.push(`Formation cost ${dp} exceeds the training allowance of ${limit}.`);
  return errors;
}
export function defaultArmies(pack: RulesPack = TRAINING_PACK): [Army,Army] {
  return (['ultramarines','orks'] as FactionId[]).map(faction => {
    const available = pack.units.filter(u => u.faction === faction);
    const line = available.find(u => u.role === 'infantry');
    const leader = available.find(u => u.role === 'character');
    return { faction, name:faction === 'ultramarines' ? 'Azure expedition' : 'Verdant warband', entries:[...(line ? [{definitionId:line.id,count:line.modelCounts[0]},{definitionId:line.id,count:line.modelCounts[0]}] : []),...(leader ? [{definitionId:leader.id,count:leader.modelCounts[0]}] : [])], detachmentIds:pack.detachments.filter(d => d.faction === faction).slice(0,1).map(d => d.id) };
  }) as [Army,Army];
}
const rect = (id: string,name: string,x: number,y: number,w: number,h: number,kind: Terrain['kind'],objective=false): Terrain => ({id,name,kind,polygon:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],height:kind==='woods'?3:4,blocksMovement:kind==='wall'||kind==='impassable',blocksSight:kind==='wall'||kind==='impassable',cover:kind==='ruins'||kind==='woods',objective});
export function terrainForLayout(layout: 'foundry' | 'crossroads'): Terrain[] {
  return layout === 'foundry' ? [rect('alpha','Relay alpha',10,4,6,6,'ruins',true),rect('beta','Central foundry',19,11,6,8,'ruins',true),rect('gamma','Relay gamma',28,20,6,6,'ruins',true),rect('wall-n','Blast wall',25,3,1,5,'wall'),rect('wall-s','Blast wall',18,22,1,5,'wall'),rect('wood','Ash grove',28,10,5,5,'woods')] : [rect('alpha','West relay',10,12,6,6,'ruins',true),rect('beta','Supply depot',19,12,6,6,'ruins',true),rect('gamma','East relay',28,12,6,6,'ruins',true),rect('north','Collapsed silo',20,4,4,4,'impassable'),rect('south','Collapsed silo',20,23,4,4,'impassable')];
}
