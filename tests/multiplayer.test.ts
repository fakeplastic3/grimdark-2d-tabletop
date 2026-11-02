import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { defaultArmies } from '../packages/rules-data';
import type { GameState } from '../packages/shared/types';

type Message = { type: string; message?: string; code?: string; token?: string; player?: number; state?: GameState; ready?: boolean[] };
class Peer {
  readonly ws: WebSocket;
  private inbox: Message[] = [];
  private waiting: { predicate: (message: Message) => boolean; resolve: (message: Message) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  constructor(url: string) {
    this.ws = new WebSocket(url, { origin: 'http://127.0.0.1:5173' });
    this.ws.on('message', raw => {
      const message = JSON.parse(raw.toString()) as Message;
      const index = this.waiting.findIndex(waiter => waiter.predicate(message));
      if (index < 0) this.inbox.push(message);
      else { const [waiter] = this.waiting.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    });
  }
  async open() { await new Promise<void>((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); }); }
  send(message: unknown) { this.ws.send(JSON.stringify(message)); }
  next(predicate: (message: Message) => boolean): Promise<Message> {
    const index = this.inbox.findIndex(predicate);
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => { this.waiting = this.waiting.filter(item => item !== waiter); reject(new Error('Timed out waiting for server message')); }, 5000) };
      this.waiting.push(waiter);
    });
  }
  close() { this.ws.terminate(); for (const waiter of this.waiting) clearTimeout(waiter.timer); }
}
afterEach(() => vi.unstubAllEnvs());

it('synchronizes two seats, rejects forged/stale actions, and restores an authoritative match after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'grimdark-multiplayer-'));
  vi.stubEnv('MATCH_DIRECTORY', directory);
  vi.stubEnv('ALLOWED_ORIGINS', 'http://127.0.0.1:5173');
  vi.stubEnv('NODE_ENV', 'test');
  const { startServer } = await import('../apps/server/index');
  let service = await startServer(0);
  const endpoint = () => { const address = service.server.address(); if (!address || typeof address === 'string') throw new Error('No TCP address'); return `ws://127.0.0.1:${address.port}`; };
  const peers: Peer[] = [];
  const connect = async () => { const peer = new Peer(endpoint()); peers.push(peer); await peer.open(); return peer; };
  try {
    const host = await connect();
    host.send({type:'create',config:{armies:defaultArmies(),pointsLimit:1000,rounds:3,layout:'foundry',mode:'training',seed:123}});
    const hostSession = await host.next(m => m.type === 'session');
    expect(hostSession.player).toBe(0);
    const guest = await connect(); guest.send({type:'join',code:hostSession.code});
    const guestSession = await guest.next(m => m.type === 'session'); expect(guestSession.player).toBe(1);
    host.send({type:'ready'}); guest.send({type:'ready'});
    const hostStart = await host.next(m => m.type === 'snapshot' && !!m.state);
    const guestStart = await guest.next(m => m.type === 'snapshot' && !!m.state);
    expect(guestStart.state).toEqual(hostStart.state);
    expect(hostStart.state?.rng).toBe(0); expect(hostStart.state?.config.seed).toBe(0);
    guest.send({type:'action',expectedRevision:0,action:{type:'concede',player:0}});
    expect((await guest.next(m => m.type === 'error')).message).toMatch(/assigned player/);
    const unit = hostStart.state!.units.find(u => u.owner === 0)!;
    host.send({type:'action',expectedRevision:0,action:{type:'deploy',player:0,unitId:unit.id,positions:unit.models.map(m=>({x:m.x,y:m.y,z:0}))}});
    const updated = await guest.next(m => m.type === 'snapshot' && m.state?.revision === 1);
    expect(updated.state!.units.find(u=>u.id===unit.id)?.deployed).toBe(true);
    host.send({type:'action',expectedRevision:0,action:{type:'concede',player:0}});
    expect((await host.next(m=>m.type==='error')).message).toMatch(/State changed/);
    await service.close();
    service = await startServer(0);
    const resumed = await connect();
    resumed.send({type:'resume',code:guestSession.code,token:guestSession.token});
    await resumed.next(m=>m.type==='session');
    const restored = await resumed.next(m=>m.type==='snapshot' && m.state?.revision===1);
    expect(restored.state).toEqual(updated.state);
    resumed.send({type:'action',expectedRevision:1,action:{type:'concede',player:1}});
    const result = await resumed.next(m=>m.type==='snapshot' && m.state?.phase==='finished');
    expect(result.state?.winner).toBe(0);
  } finally {
    for (const peer of peers) peer.close();
    await service.close(); await rm(directory,{recursive:true,force:true});
  }
}, 20000);
