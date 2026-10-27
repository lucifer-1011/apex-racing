// Apex Rider multiplayer relay: one Durable Object per room code.
// Clients connect to wss://<worker>/ws/<CODE>?mode=create|join&name=..[&tok=..]
//
// Trust model: physics runs on each client, so results are casual. The relay does
// plausibility checks (see validate* below) so a modified client cannot trivially
// teleport, flood, impersonate other players or fake a finish time.
const MAX_PLAYERS = 5;
const STAGES = 4;
// Race distance in metres per stage (laps x track length) and the fastest plausible finish in seconds.
const STAGE_TOTAL = [8925, 6273, 5343, 4739];
const STAGE_MIN_TIME = [85, 100, 100, 63];
const MAX_SPEED = 130;           // m/s: hard ceiling on reported progress growth
const FIN_STRAGGLER_MS = 120000; // after the first finisher, others get 2 minutes
const LOBBY_GRACE_MS = 45000;    // a dropped lobby player keeps their slot (and host role) this long so a phone app switch is harmless
const IDLE_MS = 45000;           // clients ping every 4 s; silence this long means dead

const ORIGIN_OK = /^(https:\/\/apex-racing[a-z0-9-]*\.vercel\.app|http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?)$/;

// Best-effort per-isolate limiter for new connections per IP.
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > 60000) { h.n = 0; h.t = now; }
  h.n++;
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.n > 40;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/ws\/([A-Za-z]{4,6})$/);
    if (m) {
      const origin = req.headers.get('Origin') || '';
      if (!ORIGIN_OK.test(origin)) return new Response('Forbidden', { status: 403 });
      if (tooMany(req.headers.get('CF-Connecting-IP') || 'local')) return new Response('Slow down', { status: 429 });
      const stub = env.ROOM.get(env.ROOM.idFromName(m[1].toUpperCase()));
      return stub.fetch(req);
    }
    return new Response('Apex Rider relay OK', { headers: { 'content-type': 'text/plain' } });
  },
};

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const secret = () => crypto.randomUUID().replace(/-/g, '');
const shortId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);

function cleanName(raw, taken) {
  let n = String(raw || '').normalize('NFKC').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Rider';
  const base = n;
  let i = 2;
  while (taken.has(n.toLowerCase())) n = base.slice(0, 12) + ' ' + i++;
  return n;
}

// pose: [ts, x, y, z, heading, lean, pitch, wheelie, progress, speed]
function validPose(d) {
  if (!Array.isArray(d) || d.length !== 10) return false;
  for (let i = 0; i < 10; i++) if (!isNum(d[i])) return false;
  if (Math.abs(d[1]) > 6000 || Math.abs(d[3]) > 6000 || Math.abs(d[2]) > 2000) return false;
  if (Math.abs(d[4]) > 1000 || Math.abs(d[5]) > 3 || Math.abs(d[6]) > 3 || d[7] < -1 || d[7] > 2) return false;
  if (d[9] < 0 || d[9] > MAX_SPEED || Math.abs(d[8]) > 1e5) return false;
  return true;
}

export class Room {
  constructor() {
    this.reset();
  }

  reset() {
    this.players = new Map(); // public id -> player
    this.tokens = new Map();  // secret token -> public id
    this.hostId = null;
    this.phase = 'lobby'; // lobby | loading | race
    this.cfg = { stage: 0 };
    this.loaded = new Set();
    this.finCount = 0;
    this.startAt = 0;
    this.timer = null;
    this.endTimer = null;
    this.idle = null;
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const url = new URL(req.url);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const mode = url.searchParams.get('mode') === 'create' ? 'create' : 'join';
    const name = url.searchParams.get('name') || '';
    const tok = (url.searchParams.get('tok') || '').replace(/[^a-f0-9]/g, '').slice(0, 40);
    this.attach(server, mode, name, tok);
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

  attach(ws, mode, name, tok) {
    let p = null;
    const knownId = tok ? this.tokens.get(tok) : null;
    if (knownId) p = this.players.get(knownId) || null;
    if (p) { // reconnect with the player's own secret token
      if (p.connected) { try { p.ws.close(1000, 'replaced'); } catch (e) { /* closed */ } }
      p.ws = ws; p.connected = true;
      clearTimeout(p.graceT);
    } else {
      if (mode === 'join' && this.connectedCount() === 0) return this.refuse(ws, 'noroom');
      if (mode === 'create' && this.connectedCount() > 0) return this.refuse(ws, 'exists');
      if (this.phase !== 'lobby') return this.refuse(ws, 'busy');
      if (this.connectedCount() >= MAX_PLAYERS) return this.refuse(ws, 'full');
      if (this.connectedCount() === 0) { clearTimeout(this.timer); clearTimeout(this.endTimer); this.reset(); }
      const used = new Set([...this.players.values()].map(q => q.color));
      let color = 0;
      while (used.has(color)) color++;
      const taken = new Set([...this.players.values()].map(q => q.name.toLowerCase()));
      const id = shortId();
      const token = secret();
      p = { id, tok: token, name: cleanName(name, taken), color, ready: false, ws, connected: true, fin: null,
            seen: Date.now(), prog: 0, progAt: 0, win: 0, winN: {} };
      this.players.set(id, p);
      this.tokens.set(token, id);
    }
    p.seen = Date.now();
    const hp = this.hostId ? this.players.get(this.hostId) : null;
    if (!hp || (!hp.connected && this.phase !== 'lobby')) this.hostId = p.id;

    // the secret token goes only to this socket, never into rosters
    this.send(ws, { t: 'welcome', id: p.id, tok: p.tok, host: this.hostId, cfg: this.cfg, phase: this.phase, players: this.roster() });
    this.pushPlayers();
    this.ensureIdleCheck();

    ws.addEventListener('message', ev => this.onMessage(p, ws, ev.data));
    const gone = () => this.onClose(p, ws);
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
  }

  ensureIdleCheck() {
    if (this.idle) return;
    this.idle = setInterval(() => {
      const now = Date.now();
      for (const p of this.players.values()) {
        if (p.connected && now - p.seen > IDLE_MS) { try { p.ws.close(1001, 'idle'); } catch (e) { /* closed */ } this.onClose(p, p.ws); }
      }
      if (this.connectedCount() === 0) { clearInterval(this.idle); this.idle = null; }
    }, 15000);
  }

  // allow at most `max` messages of a type per second per player
  limited(p, type, max) {
    const sec = (Date.now() / 1000) | 0;
    if (p.win !== sec) { p.win = sec; p.winN = {}; }
    p.winN[type] = (p.winN[type] || 0) + 1;
    return p.winN[type] > max;
  }

  onMessage(p, ws, raw) {
    if (p.ws !== ws || typeof raw !== 'string' || raw.length > 400) return;
    p.seen = Date.now();
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (this.limited(p, 'all', 60)) { try { ws.close(1008, 'rate'); } catch (e) { /* closed */ } return; }
    switch (m.t) {
      case 'ping':
        if (!this.limited(p, 'ping', 12) && isNum(m.c)) this.send(ws, { t: 'pong', c: m.c, s: Date.now() });
        break;
      case 'p':
        if (this.phase === 'race' && !this.limited(p, 'p', 25) && validPose(m.d)) {
          const now = Date.now();
          const dt = Math.min(2, Math.max(0.01, (now - (p.progAt || now - 66)) / 1000));
          const grow = MAX_SPEED * dt + 20;
          const prog = Math.min(m.d[8], p.prog + grow);
          p.prog = Math.max(p.prog, prog);
          p.progAt = now;
          const d = m.d.slice();
          d[8] = Math.max(0, Math.round(prog * 10) / 10);
          this.broadcast({ t: 'p', i: p.id, d }, p.id);
        }
        break;
      case 'ready':
        if (this.phase === 'lobby' && !this.limited(p, 'ready', 4)) { p.ready = !!m.v; this.pushPlayers(); }
        break;
      case 'cfg':
        if (p.id === this.hostId && this.phase === 'lobby' && !this.limited(p, 'cfg', 4)) {
          this.cfg = { stage: Math.max(0, Math.min(STAGES - 1, m.stage | 0)) };
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
        if (this.phase === 'race' && p.fin == null && isNum(m.time)) this.onFinish(p, m.time);
        break;
      default:
    }
  }

  onFinish(p, time) {
    const stage = this.cfg.stage;
    const elapsed = (Date.now() - this.startAt) / 1000;
    // a finish must come after the race really ran this long, with a plausible time,
    // and the player's relayed progress must have (nearly) covered the race distance
    if (time < STAGE_MIN_TIME[stage] || time > 1800) return;
    if (elapsed < STAGE_MIN_TIME[stage] - 3) return;
    if (time < elapsed - 8 && time < elapsed * 0.8) return;
    if (p.prog < STAGE_TOTAL[stage] * 0.96) return;
    p.fin = Math.round(time * 100) / 100;
    this.finCount++;
    this.broadcast({ t: 'fin', i: p.id, time: p.fin, place: this.finCount });
    if (this.finCount === 1 && !this.endTimer) this.endTimer = setTimeout(() => this.endRace(), FIN_STRAGGLER_MS);
    this.checkEnd();
  }

  startLoading() {
    this.phase = 'loading';
    this.loaded = new Set();
    this.finCount = 0;
    // players still inside their reconnect grace period miss this race
    for (const [id, q] of [...this.players]) {
      if (!q.connected) { clearTimeout(q.graceT); this.players.delete(id); this.tokens.delete(q.tok); }
    }
    for (const q of this.players.values()) { q.fin = null; q.prog = 0; q.progAt = 0; }
    this.broadcast({ t: 'prep', stage: this.cfg.stage, players: this.roster() });
    this.pushPlayers();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (this.phase === 'loading') this.goRace(); }, 25000);
  }

  goRace() {
    clearTimeout(this.timer);
    this.phase = 'race';
    this.startAt = Date.now() + 4500;
    this.broadcast({ t: 'go', startAt: this.startAt });
    this.pushPlayers();
    this.timer = setTimeout(() => this.endRace(), 25 * 60 * 1000); // safety net
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
    clearTimeout(this.endTimer);
    this.endTimer = null;
    this.phase = 'lobby';
    for (const [id, q] of [...this.players]) {
      q.ready = false; q.fin = null; q.prog = 0; q.progAt = 0;
      if (!q.connected) { this.players.delete(id); this.tokens.delete(q.tok); }
    }
    this.broadcast({ t: 'end' });
    this.pushPlayers();
  }

  // lobby only: the grace period ran out without the player coming back
  dropFromLobby(p) {
    if (this.players.get(p.id) !== p || p.connected || this.phase !== 'lobby') return;
    this.players.delete(p.id); this.tokens.delete(p.tok);
    if (this.connectedCount() === 0) {
      clearTimeout(this.timer); clearTimeout(this.endTimer); clearInterval(this.idle); this.idle = null;
      this.reset();
      return;
    }
    if (this.hostId === p.id) {
      const next = [...this.players.values()].find(q => q.connected);
      this.hostId = next ? next.id : null;
    }
    this.pushPlayers();
  }

  onClose(p, ws) {
    if (p.ws !== ws || !p.connected) return;
    p.connected = false;
    if (this.phase === 'lobby') {
      clearTimeout(p.graceT);
      p.graceT = setTimeout(() => this.dropFromLobby(p), LOBBY_GRACE_MS);
      this.pushPlayers();
      return;
    }
    if (this.connectedCount() === 0) {
      clearTimeout(this.timer); clearTimeout(this.endTimer); clearInterval(this.idle);
      this.reset();
      return;
    }
    if (this.hostId === p.id) {
      const next = [...this.players.values()].find(q => q.connected);
      this.hostId = next ? next.id : null;
    }
    this.pushPlayers();
    if (this.phase === 'loading' && this.loaded.size >= this.connectedCount()) this.goRace();
    if (this.phase === 'race') this.checkEnd();
  }
}
