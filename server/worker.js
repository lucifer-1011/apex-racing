// Apex Rider multiplayer relay: one Durable Object per room code.
// Clients connect to wss://<worker>/ws/<CODE>?mode=create|join&name=..&pid=..
const MAX_PLAYERS = 5;
const STAGES = 4;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{3,8})$/);
    if (m) {
      const stub = env.ROOM.get(env.ROOM.idFromName(m[1].toUpperCase()));
      return stub.fetch(req);
    }
    return new Response('Apex Rider relay OK', { headers: { 'content-type': 'text/plain' } });
  },
};

export class Room {
  constructor() {
    this.reset();
  }

  reset() {
    this.players = new Map(); // id -> {id,name,color,ready,ws,connected,fin}
    this.hostId = null;
    this.phase = 'lobby'; // lobby | loading | race
    this.cfg = { stage: 0 };
    this.loaded = new Set();
    this.finCount = 0;
    this.timer = null;
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const url = new URL(req.url);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const mode = url.searchParams.get('mode') === 'create' ? 'create' : 'join';
    const name = (url.searchParams.get('name') || 'Rider').replace(/[<>&"]/g, '').slice(0, 14) || 'Rider';
    const pid = (url.searchParams.get('pid') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || crypto.randomUUID().slice(0, 8);
    this.attach(server, mode, name, pid);
    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* closed */ }
  }

  broadcast(obj, exceptId) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p.connected && p.id !== exceptId) { try { p.ws.send(s); } catch (e) { /* closed */ } }
    }
  }

  connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  roster() {
    return [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, ready: p.ready, on: p.connected, fin: p.fin }));
  }

  pushPlayers() {
    this.broadcast({ t: 'players', host: this.hostId, cfg: this.cfg, phase: this.phase, players: this.roster() });
  }

  refuse(ws, code) {
    this.send(ws, { t: code });
    try { ws.close(1000, code); } catch (e) { /* closed */ }
  }

  attach(ws, mode, name, pid) {
    let p = this.players.get(pid);
    if (p && p.connected) { // same id already connected: replace old socket
      try { p.ws.close(1000, 'replaced'); } catch (e) { /* closed */ }
      p.connected = false;
    }
    if (!p) {
      if (mode === 'join' && this.connectedCount() === 0) return this.refuse(ws, 'noroom');
      if (mode === 'create' && this.connectedCount() > 0) return this.refuse(ws, 'exists');
      if (this.phase !== 'lobby') return this.refuse(ws, 'busy');
      if (this.connectedCount() >= MAX_PLAYERS) return this.refuse(ws, 'full');
      if (this.connectedCount() === 0) this.reset();
      const used = new Set([...this.players.values()].map(q => q.color));
      let color = 0;
      while (used.has(color)) color++;
      p = { id: pid, name, color, ready: false, ws, connected: true, fin: null };
      this.players.set(pid, p);
    } else {
      p.ws = ws; p.connected = true; p.name = name;
    }
    if (!this.hostId || !this.players.get(this.hostId) || !this.players.get(this.hostId).connected) this.hostId = pid;

    this.send(ws, { t: 'welcome', id: pid, host: this.hostId, cfg: this.cfg, phase: this.phase, players: this.roster() });
    this.pushPlayers();

    ws.addEventListener('message', ev => this.onMessage(p, ws, ev.data));
    const gone = () => this.onClose(p, ws);
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
  }

  onMessage(p, ws, raw) {
    if (p.ws !== ws || typeof raw !== 'string' || raw.length > 600) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    switch (m.t) {
      case 'ping':
        this.send(ws, { t: 'pong', c: m.c, s: Date.now() });
        break;
      case 'p':
        if (this.phase === 'race' && Array.isArray(m.d)) this.broadcast({ t: 'p', i: p.id, d: m.d }, p.id);
        break;
      case 'ready':
        if (this.phase === 'lobby') { p.ready = !!m.v; this.pushPlayers(); }
        break;
      case 'cfg':
        if (p.id === this.hostId && this.phase === 'lobby') {
          const st = Math.max(0, Math.min(STAGES - 1, m.stage | 0));
          this.cfg = { stage: st };
          this.pushPlayers();
        }
        break;
      case 'start':
        if (p.id === this.hostId && this.phase === 'lobby') this.startLoading();
        break;
      case 'loaded':
        if (this.phase === 'loading') {
          this.loaded.add(p.id);
          if (this.loaded.size >= this.connectedCount()) this.goRace();
        }
        break;
      case 'fin':
        if (this.phase === 'race' && p.fin == null && typeof m.time === 'number') {
          p.fin = m.time;
          this.finCount++;
          this.broadcast({ t: 'fin', i: p.id, time: m.time, place: this.finCount });
          this.checkEnd();
        }
        break;
      case 'lobby': // a finished or leaving player asks to be back in the lobby: nothing to do
        break;
      default:
    }
  }

  startLoading() {
    this.phase = 'loading';
    this.loaded = new Set();
    this.finCount = 0;
    for (const q of this.players.values()) q.fin = null;
    this.broadcast({ t: 'prep', stage: this.cfg.stage, players: this.roster() });
    this.pushPlayers();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (this.phase === 'loading') this.goRace(); }, 25000);
  }

  goRace() {
    clearTimeout(this.timer);
    this.phase = 'race';
    this.broadcast({ t: 'go', startAt: Date.now() + 4500 });
    this.pushPlayers();
    // safety net: end the race after 25 minutes
    this.timer = setTimeout(() => this.endRace(), 25 * 60 * 1000);
  }

  checkEnd() {
    if (this.phase !== 'race') return;
    for (const q of this.players.values()) if (q.connected && q.fin == null) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.endRace(), 1500);
  }

  endRace() {
    if (this.phase === 'lobby') return;
    clearTimeout(this.timer);
    this.phase = 'lobby';
    for (const [id, q] of [...this.players]) {
      q.ready = false; q.fin = null;
      if (!q.connected) this.players.delete(id);
    }
    this.broadcast({ t: 'end' });
    this.pushPlayers();
  }

  onClose(p, ws) {
    if (p.ws !== ws || !p.connected) return;
    p.connected = false;
    if (this.phase === 'lobby') this.players.delete(p.id);
    if (this.connectedCount() === 0) { clearTimeout(this.timer); this.reset(); return; }
    if (this.hostId === p.id) {
      const next = [...this.players.values()].find(q => q.connected);
      this.hostId = next ? next.id : null;
    }
    this.pushPlayers();
    if (this.phase === 'loading' && this.loaded.size >= this.connectedCount()) this.goRace();
    if (this.phase === 'race') this.checkEnd();
  }
}
