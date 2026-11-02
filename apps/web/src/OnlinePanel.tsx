import { useEffect, useRef, useState } from 'react';
import type { Army, GameAction, GameConfig, GameState, PlayerId } from '../../../packages/shared/types';
import { TRAINING_PACK, defaultArmies, validateArmy, armyPoints } from '../../../packages/rules-data';
import { armySchema } from '../../../packages/shared/validation';

interface Props {
  onSession(state: GameState, player: PlayerId, dispatch: (action: GameAction) => void): void;
  onDisconnect?(): void;
}
interface Credentials { endpoint: string; code: string; token: string; player: PlayerId }
interface Snapshot { type: 'snapshot'; code: string; player: PlayerId; ready: [boolean, boolean]; connected: [boolean, boolean]; config: GameConfig; state: GameState | null }
const STORAGE = 'grimdark-online-session-v1';
function savedCredentials(): Credentials | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(STORAGE) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const v = value as Partial<Credentials>;
    return typeof v.endpoint === 'string' && typeof v.code === 'string' && /^[A-F0-9]{12}$/.test(v.code) && typeof v.token === 'string' && /^[a-f0-9]{64}$/.test(v.token) && (v.player === 0 || v.player === 1) ? v as Credentials : null;
  } catch { return null; }
}

export function OnlinePanel({ onSession, onDisconnect }: Props) {
  const initial = useRef(savedCredentials());
  const [endpoint, setEndpoint] = useState(initial.current?.endpoint ?? 'ws://127.0.0.1:8080');
  const [code, setCode] = useState(initial.current?.code ?? '');
  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(initial.current);
  const [connecting, setConnecting] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const latest = useRef<Snapshot | null>(null);
  const callbacks = useRef({ onSession, onDisconnect });
  callbacks.current = { onSession, onDisconnect };
  useEffect(() => () => { socket.current?.close(); }, []);

  function send(value: unknown) {
    if (socket.current?.readyState !== WebSocket.OPEN) { setError('Connection unavailable. Reconnect to restore the authoritative match.'); return; }
    socket.current.send(JSON.stringify(value));
  }
  function dispatch(action: GameAction) {
    const current = latest.current;
    if (!current?.state) return;
    send({ type: 'action', expectedRevision: current.state.revision, action: { ...action, player: current.player } });
  }
  function connect(mode: 'create' | 'join' | 'resume') {
    try {
      const url = new URL(mode === 'resume' && credentials ? credentials.endpoint : endpoint);
      if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Use a ws:// or wss:// server address.');
      if (location.protocol === 'https:' && url.protocol !== 'wss:') throw new Error('A secure website needs a wss:// backend.');
      if (mode === 'join' && !/^[A-F0-9]{12}$/.test(code)) throw new Error('A private room code has 12 hexadecimal characters.');
      if (mode === 'resume' && !credentials) throw new Error('No saved session is available in this tab.');
      setError(''); setConnecting(true); setStatus('Connecting…');
      socket.current?.close();
      const ws = new WebSocket(url); socket.current = ws;
      const timer = window.setTimeout(() => { if (ws.readyState === WebSocket.CONNECTING) { ws.close(); setError('Connection timed out. Check the backend URL and allowed origin.'); } }, 10000);
      ws.onopen = () => {
        window.clearTimeout(timer); setConnecting(false); setStatus('Connected');
        if (mode === 'create') {
          const config: GameConfig = { armies: defaultArmies(), pointsLimit: 1000, rounds: 5, seed: 0, layout: 'foundry', mode: 'training' };
          ws.send(JSON.stringify({ type: 'create', config }));
        } else if (mode === 'join') ws.send(JSON.stringify({ type: 'join', code }));
        else if (credentials) ws.send(JSON.stringify({ type: 'resume', code: credentials.code, token: credentials.token }));
      };
      ws.onmessage = event => {
        if (socket.current !== ws) return;
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'error') { setError(String(message.message)); return; }
          if (message.type === 'session') {
            const session: Credentials = { endpoint: url.toString(), code: message.code, token: message.token, player: message.player };
            setCredentials(session); setCode(session.code);
            try { sessionStorage.setItem(STORAGE, JSON.stringify(session)); } catch { setError('Session storage is unavailable; keep this tab open to retain your seat.'); }
          }
          if (message.type === 'snapshot') {
            const current = message as Snapshot;
            latest.current = current; setSnapshot(current); setStatus(current.state ? 'Match synchronized' : 'Army lobby');
            if (current.state) callbacks.current.onSession(current.state, current.player, dispatch);
          }
        } catch { setError('The backend sent an unreadable response.'); }
      };
      ws.onerror = () => setError('Could not connect. Start the backend and allow this website’s origin.');
      ws.onclose = () => {
        window.clearTimeout(timer);
        if (socket.current !== ws) return;
        setConnecting(false); setStatus('Disconnected — match remains on server');
        // Retain the remote match and its dispatch function: never fall back to local authority.
      };
    } catch (failure) { setConnecting(false); setError(failure instanceof Error ? failure.message : 'Connection failed.'); }
  }
  function leave() {
    socket.current?.close(); socket.current = null; latest.current = null;
    setSnapshot(null); setStatus('Disconnected'); setConnecting(false); callbacks.current.onDisconnect?.();
  }
  async function importArmy(file: File) {
    try {
      if (file.size > 250000) throw new Error('Army file exceeds 250 KB.');
      const army = armySchema.parse(JSON.parse(await file.text()));
      const errors = validateArmy(army, TRAINING_PACK, snapshot?.config.pointsLimit ?? 1000);
      if (errors.length) throw new Error(errors.join(' '));
      send({ type: 'army', army });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid army file.'); }
  }
  const ownArmy = snapshot?.config.armies[snapshot.player];
  const connected = socket.current?.readyState === WebSocket.OPEN;
  const changeArmy = (army: Army) => send({ type: 'army', army });
  return <details className="online-panel panel"><summary>Private online game <span className="muted">· {status}</span></summary>
    <p>Connect to your own running backend. No public multiplayer service is currently deployed. Online rooms use the bundled training pack.</p>
    {!snapshot && <div className="config-fields"><label>Backend endpoint<input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="wss://your-server.example" disabled={connecting || connected}/></label><label>Room code<input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 12))} maxLength={12}/></label></div>}
    {!snapshot && <div className="inline-actions"><button disabled={connecting || connected} onClick={() => connect('create')}>Create private room</button><button disabled={connecting || connected} onClick={() => connect('join')}>Join room</button></div>}
    {credentials && !connected && <button disabled={connecting} onClick={() => connect('resume')}>Reconnect to {credentials.code}</button>}
    {snapshot && <><p><strong>Room {snapshot.code}</strong> · You are Commander {snapshot.player + 1}. Share only the room code and server URL.</p><p>{snapshot.connected.map((online, i) => `Commander ${i + 1}: ${online ? 'connected' : 'offline'}`).join(' · ')}</p>
      {!snapshot.state && ownArmy && <section><p>{ownArmy.name} · {armyPoints(ownArmy)} / {snapshot.config.pointsLimit} training points</p><div className="inline-actions"><button disabled={!connected} onClick={() => changeArmy(defaultArmies()[0])}>Use Azure starter</button><button disabled={!connected} onClick={() => changeArmy(defaultArmies()[1])}>Use Verdant starter</button><label>Import army JSON<input type="file" accept=".json" disabled={!connected} onChange={e => { const file = e.target.files?.[0]; if (file) void importArmy(file); e.target.value = ''; }}/></label></div><p>Build and export a custom army in the local army builder, then import it here.</p><button className="primary" disabled={!connected || snapshot.ready[snapshot.player] || !snapshot.connected.every(Boolean)} onClick={() => send({ type: 'ready' })}>{snapshot.ready[snapshot.player] ? 'Ready — waiting for opponent' : 'Ready army'}</button></section>}
    </>}
    {(connected || snapshot) && <button className="text-button" onClick={leave}>Leave online view</button>}
    {error && <p className="error-notice" role="alert">{error}</p>}
  </details>;
}
