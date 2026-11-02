import { z } from 'zod';
import { actionSchema, armySchema, configSchema } from '../../packages/shared/validation';
export const messageSchema = z.discriminatedUnion('type',[
 z.object({type:z.literal('create'),config:configSchema}).strict(),
 z.object({type:z.literal('join'),code:z.string().regex(/^[A-F0-9]{12}$/)}).strict(),
 z.object({type:z.literal('resume'),code:z.string().regex(/^[A-F0-9]{12}$/),token:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({type:z.literal('army'),army:armySchema}).strict(),
 z.object({type:z.literal('ready')}).strict(),
 z.object({type:z.literal('action'),expectedRevision:z.number().int().nonnegative(),action:actionSchema}).strict(),
]);
export type ClientMessage = z.infer<typeof messageSchema>;
