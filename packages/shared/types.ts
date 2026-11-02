export type PlayerId = 0 | 1;
export type FactionId = 'ultramarines' | 'orks';
export type Phase = 'deployment' | 'command' | 'movement' | 'shooting' | 'charge' | 'fight' | 'finished';
export interface Point { x: number; y: number; z?: number }
export interface Circle extends Point { radius: number }
export interface Terrain { id: string; name: string; kind: 'ruins' | 'woods' | 'wall' | 'impassable'; polygon: Point[]; height: number; blocksMovement: boolean; blocksSight: boolean; cover: boolean; objective: boolean }
export type WeaponAbility = 'lethal' | 'sustained' | 'torrent' | 'twinLinked' | 'assault' | 'heavy' | 'rapidFire' | 'devastating';
export interface Weapon { id: string; name: string; kind: 'ranged' | 'melee'; range: number; attacks: number; skill: number; strength: number; ap: number; damage: number; abilities: WeaponAbility[] }
export interface UnitDefinition { id: string; faction: FactionId; name: string; role: 'infantry' | 'character' | 'vehicle'; modelCounts: number[]; points: number[]; baseMm: number; move: number; toughness: number; save: number; invulnerable?: number; wounds: number; leadership: number; oc: number; weapons: Weapon[]; keywords: string[]; maxCopies: number }
export interface Detachment { id: string; faction: FactionId; name: string; cost: number; disposition: 'balanced' | 'aggressive' | 'defensive'; description: string }
export interface RulesPack { schemaVersion: 1; id: string; version: string; name: string; status: 'training'; sourceNote: string; units: UnitDefinition[]; detachments: Detachment[] }
export interface ArmyEntry { definitionId: string; count: number }
export interface Army { faction: FactionId; name: string; entries: ArmyEntry[]; detachmentIds: string[] }
export interface Model extends Circle { id: string; unitId: string; wounds: number; maxWounds: number }
export interface Unit { id: string; owner: PlayerId; definitionId: string; name: string; models: Model[]; startingModels: number; deployed: boolean; moved: boolean; moveType?: 'normal' | 'advance' | 'fallBack' | 'stationary'; shot: boolean; fought: boolean; charged: boolean; chargeAttempted: boolean; shocked: boolean; advanceRoll?: number }
export interface Player { id: PlayerId; name: string; faction: FactionId; cp: number; vp: number; ready: boolean; abilityUsed: boolean }
export interface DieRecord { stage: string; raw: number; modifier: number; target: number; success: boolean; reroll?: number; note?: string }
export interface CombatResult { attackerId: string; targetId: string; weapon: string; attacks: number; hits: number; wounds: number; failedSaves: number; damage: number; destroyed: number; dice: DieRecord[] }
export interface GameEvent { id: number; round: number; phase: Phase; player: PlayerId; message: string; combat?: CombatResult; dice?: number[] }
export interface ChargePending { unitId: string; roll: number; dice: number[] }
export interface GameConfig { armies: [Army, Army]; pointsLimit: number; rounds: number; seed: number; layout: 'foundry' | 'crossroads'; mode: 'training' }
export interface GameState { schemaVersion: 1; rulesVersion: string; config: GameConfig; pack: RulesPack; width: number; height: number; round: number; phase: Phase; activePlayer: PlayerId; firstPlayer: PlayerId; fightPlayer: PlayerId; players: [Player, Player]; units: Unit[]; terrain: Terrain[]; events: GameEvent[]; rng: number; randomDraws: number; revision: number; chargePending?: ChargePending; winner?: PlayerId | 'draw'; resultReason?: string; history: GameAction[] }
export type GameAction =
 | { type: 'deploy'; player: PlayerId; unitId: string; positions: Point[] }
 | { type: 'ready'; player: PlayerId }
 | { type: 'move'; player: PlayerId; unitId: string; positions: Point[]; moveType: 'normal' | 'advance' | 'fallBack' | 'stationary' }
 | { type: 'advanceRoll'; player: PlayerId; unitId: string }
 | { type: 'attack'; player: PlayerId; unitId: string; targetId: string; weaponId: string; rerollHits?: boolean }
 | { type: 'chargeRoll'; player: PlayerId; unitId: string }
 | { type: 'chargeMove'; player: PlayerId; unitId: string; targetId: string; positions: Point[] }
 | { type: 'cancelCharge'; player: PlayerId }
 | { type: 'ability'; player: PlayerId }
 | { type: 'endPhase'; player: PlayerId }
 | { type: 'concede'; player: PlayerId };
export interface ActionResult { ok: boolean; state: GameState; error?: string }
export interface SaveEnvelope { format: 'grimdark-save'; schemaVersion: 1; initialConfig: GameConfig; pack: RulesPack; actions: GameAction[]; state: GameState }
