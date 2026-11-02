import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { createGame, applyAction } from '../../packages/engine/index';
import { loadGame, saveGame } from '../../packages/engine/persistence';
import { TRAINING_PACK, validateArmy } from '../../packages/rules-data/index';
import { configSchema } from '../../packages/shared/validation';
import type { GameConfig, GameState, PlayerId } from '../../packages/shared/types';
import { messageSchema, type ClientMessage } from './protocol';

interface Room { code: string; config: GameConfig; tokenHashes: [string,string | null]; ready: [boolean,boolean]; state?: GameState; updatedAt: number; clients: Map<PlayerId,WebSocket>; queue: Promise<void> }
const rooms = new Map<string,Room>();
const sessions = new WeakMap<WebSocket,{code:string;player:PlayerId}>();
const rate = new WeakMap<WebSocket,{since:number;count:number}>();
const directory = resolve(process.env.MATCH_DIRECTORY ?? 'runtime/matches');
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173').split(','));
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const send = (ws: WebSocket, value: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); };
const error = (ws: WebSocket,message: string) => send(ws,{type:'error',message});
const persistedSchema = z.object({code:z.string().regex(/^[A-F0-9]{12}$/),config:configSchema,tokenHashes:z.tuple([z.string().regex(/^[a-f0-9]{64}$/),z.string().regex(/^[a-f0-9]{64}$/).nullable()]),ready:z.tuple([z.boolean(),z.boolean()]),save:z.string().nullable(),updatedAt:z.number().finite()}).strict();
async function persist(room: Room) {
  const payload = {code:room.code,config:room.config,tokenHashes:room.tokenHashes,ready:room.ready,save:room.state ? saveGame(room.state) : null,updatedAt:room.updatedAt};
  await writeFile(join(directory,`${room.code}.tmp`),JSON.stringify(payload),{mode:0o600});
  await rename(join(directory,`${room.code}.tmp`),join(directory,`${room.code}.json`));
}
function publicState(state: GameState): GameState {
  // Online clients never receive the seed or future RNG state during play.
  return {...state,rng:0,config:{...state.config,seed:0}};
}
function broadcast(room: Room) {
  for (const [player,ws] of room.clients) send(ws,{type:'snapshot',code:room.code,player,ready:room.ready,connected:[room.clients.has(0),room.clients.has(1)],config:{...room.config,seed:0},state:room.state ? publicState(room.state) : null});
}
function bind(ws: WebSocket,room: Room,player: PlayerId) {
  room.clients.get(player)?.close(4001,'Session resumed on another connection');
  room.clients.set(player,ws); sessions.set(ws,{code:room.code,player});
}
function validateConfig(config: GameConfig) {
  const errors = config.armies.flatMap(army=>validateArmy(army,TRAINING_PACK,config.pointsLimit));
  if (errors.length) throw new Error(errors.join(' '));
}
async function handle(ws: WebSocket,msg: ClientMessage) {
  if (msg.type === 'create') {
    if (sessions.has(ws)) throw new Error('Already connected to a room.');
    if (rooms.size >= 100) throw new Error('Server room capacity reached.');
    validateConfig(msg.config);
    const code = randomBytes(6).toString('hex').toUpperCase();
    const token = randomBytes(32).toString('hex');
    const room: Room = {code,config:{...msg.config,seed:randomBytes(4).readUInt32LE()},tokenHashes:[hash(token),null],ready:[false,false],updatedAt:Date.now(),clients:new Map(),queue:Promise.resolve()};
    await persist(room); rooms.set(code,room); bind(ws,room,0); send(ws,{type:'session',code,player:0,token}); broadcast(room); return;
  }
  if (msg.type === 'join' || msg.type === 'resume') {
    if (sessions.has(ws)) throw new Error('Already connected to a room.');
    const room = rooms.get(msg.code);
    if (!room) throw new Error('Room unavailable.');
    if (msg.type === 'join') {
      const joining = room.queue.then(async () => {
        if (ws.readyState !== WebSocket.OPEN) throw new Error('Connection closed before joining.');
        if (room.tokenHashes[1]) throw new Error('Room already has two players. Use your saved reconnection token.');
        const token = randomBytes(32).toString('hex');
        const updatedAt = room.updatedAt;
        room.tokenHashes[1] = hash(token); room.updatedAt = Date.now();
        try { await persist(room); }
        catch (failure) { room.tokenHashes[1] = null; room.updatedAt = updatedAt; throw failure; }
        bind(ws,room,1); send(ws,{type:'session',code:room.code,player:1,token});
      });
      room.queue = joining.catch(() => undefined);
      await joining;
    } else {
      const player = room.tokenHashes.findIndex(value=>value===hash(msg.token));
      if (player < 0) throw new Error('Room unavailable or reconnection credentials invalid.');
      bind(ws,room,player as PlayerId); send(ws,{type:'session',code:room.code,player,token:msg.token});
    }
    broadcast(room); return;
  }
  const session = sessions.get(ws);
  const room = session ? rooms.get(session.code) : undefined;
  if (!session || !room || room.clients.get(session.player) !== ws) throw new Error('Join a room first.');
  const player = session.player;
  room.queue = room.queue.then(async () => {
    const old = {config:structuredClone(room.config),ready:[...room.ready] as [boolean,boolean],state:room.state,updatedAt:room.updatedAt};
    try {
      if (room.clients.get(player) !== ws || ws.readyState !== WebSocket.OPEN) throw new Error('This connection no longer owns the player seat.');
      if (msg.type === 'army') {
        if (room.state) throw new Error('The match has already started.');
        const errors = validateArmy(msg.army,TRAINING_PACK,room.config.pointsLimit);
        if (errors.length) throw new Error(errors.join(' '));
        room.config.armies[player] = msg.army; room.ready[player] = false;
      } else if (msg.type === 'ready') {
        if (room.state) throw new Error('Already in a match.');
        if (!room.tokenHashes[1]) throw new Error('Wait for the second player.');
        room.ready[player] = true;
        if (room.ready.every(Boolean)) room.state = createGame(room.config,TRAINING_PACK);
      } else if (msg.type === 'action') {
        if (!room.state) throw new Error('Both players must ready their armies.');
        if (msg.expectedRevision !== room.state.revision) throw new Error('State changed. Review the synchronized board and try again.');
        if (msg.action.player !== player) throw new Error('You can only act as your assigned player.');
        const result = applyAction(room.state,{...msg.action,player});
        if (!result.ok) throw new Error(result.error ?? 'Illegal action.');
        room.state = result.state;
      }
      room.updatedAt = Date.now(); await persist(room); broadcast(room);
    } catch (reason) { room.config = old.config; room.ready = old.ready; room.state = old.state; room.updatedAt = old.updatedAt; error(ws,reason instanceof Error ? reason.message : 'Action failed.'); broadcast(room); }
  });
  await room.queue;
}

export async function startServer(port = Number(process.env.PORT ?? 8080)) {
  rooms.clear();
  await mkdir(directory,{recursive:true,mode:0o700});
  for (const filename of await readdir(directory)) {
    if (!/^[A-F0-9]{12}\.json$/.test(filename)) continue;
    try { const data = persistedSchema.parse(JSON.parse(await readFile(join(directory,filename),'utf8'))); if (Date.now()-data.updatedAt > 7*86400000) continue; rooms.set(data.code,{code:data.code,config:data.config,tokenHashes:data.tokenHashes,ready:data.ready,updatedAt:data.updatedAt,state:data.save ? loadGame(data.save) : undefined,clients:new Map(),queue:Promise.resolve()}); }
    catch { console.warn(`Skipped invalid persisted match: ${filename}`); }
  }
  const server = createServer((req,res)=>{ res.setHeader('Content-Type','application/json'); res.writeHead(req.url==='/health'?200:404); res.end(JSON.stringify(req.url==='/health'?{ok:true,protocol:1}:{error:'Not found'})); });
  const verifyClient: WebSocket.VerifyClientCallbackSync = info => allowedOrigins.has(info.origin);
  const wss = new WebSocketServer({server,maxPayload:64*1024,verifyClient});
  wss.on('connection',ws=>{
    let clientQueue = Promise.resolve();
    ws.on('message',raw=>{
      const now = Date.now(); const window = rate.get(ws) ?? {since:now,count:0};
      if (now-window.since > 10000) { window.since = now; window.count = 0; }
      rate.set(ws,window); if (++window.count > 100) { ws.close(1008,'Rate limit'); return; }
      clientQueue = clientQueue.then(async()=>{ try { await handle(ws,messageSchema.parse(JSON.parse(raw.toString()))); } catch(reason) { error(ws,reason instanceof z.ZodError ? 'Invalid protocol message.' : reason instanceof Error ? reason.message : 'Request failed.'); } });
    });
    ws.on('close',()=>{ const session = sessions.get(ws); if (!session) return; const room = rooms.get(session.code); if (room?.clients.get(session.player)===ws) { room.clients.delete(session.player); broadcast(room); } });
    ws.on('error',()=>{ /* close handler owns room membership */ });
  });
  await new Promise<void>((resolveListen,reject)=>{ server.once('error',reject); server.listen(port,process.env.HOST ?? '127.0.0.1',()=>{ server.off('error',reject); resolveListen(); }); });
  console.info(`Authoritative training server listening on port ${port}.`);
  return {server,wss,close:async()=>{ for (const ws of wss.clients) ws.terminate(); await new Promise<void>(done=>wss.close(()=>server.close(()=>done()))); }};
}
if (process.env.NODE_ENV !== 'test') await startServer();
