import { z } from 'zod';
import type { GameAction, GameConfig, RulesPack } from './types';
const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().min(1).max(160);
const finite = z.number().finite();
const integer = (min: number,max: number) => z.number().int().min(min).max(max);
const faction = z.enum(['ultramarines','orks']);
const player = z.union([z.literal(0),z.literal(1)]);
const point = z.object({x:finite.min(-100).max(200),y:finite.min(-100).max(200),z:finite.min(0).max(20).optional()}).strict();
const positions = z.array(point).min(1).max(30);
const weapon = z.object({id,name:text,kind:z.enum(['ranged','melee']),range:finite.min(0).max(120),attacks:integer(1,20),skill:integer(2,6),strength:integer(1,30),ap:integer(0,6),damage:integer(1,12),abilities:z.array(z.enum(['lethal','sustained','torrent','twinLinked','assault','heavy','rapidFire','devastating'])).max(9)}).strict();
export const rulesPackSchema = z.object({schemaVersion:z.literal(1),id,version:text,name:text,status:z.literal('training'),sourceNote:z.string().min(1).max(2000),units:z.array(z.object({id,faction,name:text,role:z.enum(['infantry','character','vehicle']),modelCounts:z.array(integer(1,30)).min(1).max(10),points:z.array(integer(1,3000)).min(1).max(10),baseMm:finite.min(20).max(180),move:finite.min(1).max(24),toughness:integer(1,20),save:integer(2,7),invulnerable:integer(2,6).optional(),wounds:integer(1,30),leadership:integer(2,12),oc:integer(0,10),weapons:z.array(weapon).min(1).max(8),keywords:z.array(text).max(20),maxCopies:integer(1,6)}).strict()).min(2).max(200),detachments:z.array(z.object({id,faction,name:text,cost:integer(1,3),disposition:z.enum(['balanced','aggressive','defensive']),description:z.string().max(500)}).strict()).min(2).max(50)}).strict();
export const armySchema = z.object({faction,name:text.max(80),entries:z.array(z.object({definitionId:id,count:integer(1,30)}).strict()).min(1).max(30),detachmentIds:z.array(id).min(1).max(3)}).strict();
export const configSchema = z.object({armies:z.tuple([armySchema,armySchema]),pointsLimit:integer(250,3000),rounds:integer(1,5),seed:integer(0,4294967295),layout:z.enum(['foundry','crossroads']),mode:z.literal('training')}).strict();
export const actionSchema = z.discriminatedUnion('type',[
 z.object({type:z.literal('deploy'),player,unitId:id,positions}).strict(),
 z.object({type:z.literal('ready'),player}).strict(),
 z.object({type:z.literal('move'),player,unitId:id,positions,moveType:z.enum(['normal','advance','fallBack','stationary'])}).strict(),
 z.object({type:z.literal('advanceRoll'),player,unitId:id}).strict(),
 z.object({type:z.literal('attack'),player,unitId:id,targetId:id,weaponId:id,rerollHits:z.boolean().optional()}).strict(),
 z.object({type:z.literal('chargeRoll'),player,unitId:id}).strict(),
 z.object({type:z.literal('chargeMove'),player,unitId:id,targetId:id,positions}).strict(),
 z.object({type:z.literal('cancelCharge'),player}).strict(),
 z.object({type:z.literal('ability'),player}).strict(),
 z.object({type:z.literal('endPhase'),player}).strict(),
 z.object({type:z.literal('concede'),player}).strict(),
]);
export function parseRulesPack(value: unknown): RulesPack {
 const pack = rulesPackSchema.parse(value);
 if (new Set(pack.units.map(u=>u.id)).size !== pack.units.length || new Set(pack.detachments.map(d=>d.id)).size !== pack.detachments.length) throw new Error('Duplicate data IDs.');
 for (const unit of pack.units) {
   if (unit.modelCounts.length !== unit.points.length || new Set(unit.modelCounts).size !== unit.modelCounts.length) throw new Error(`${unit.name}: one price is required per distinct model count.`);
   if (new Set(unit.weapons.map(w=>w.id)).size !== unit.weapons.length) throw new Error(`${unit.name}: duplicate weapon IDs.`);
 }
 return pack;
}
export const parseAction = (value: unknown): GameAction => actionSchema.parse(value);
export const parseConfig = (value: unknown): GameConfig => configSchema.parse(value);
