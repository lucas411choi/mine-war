/**
 * RoomManager: room codes, sessions (reconnect tokens), lobby ready-up, match lifecycle.
 * Pure logic on top of "socket-like" objects ({send, readyState, close}), so it can be tested without a real server.
 * State lives in memory only (Render free plan: restart = rooms gone; clients are told via `welcome.restarted`).
 */
import crypto from 'node:crypto';
import { MatchRunner } from './matchRunner.js';
import { ROOM_ALPHABET, ROOM_CODE_LEN, C2S, S2C, ERR, validateClientMessage } from '../shared/protocol.js';

const OPEN = 1;

export class RoomManager {
  constructor(bal, cfg) {
    this.bal = bal; this.cfg = cfg;
    this.rooms = new Map();
    this.sessions = new Map(); // token -> session
    this.bootId = crypto.randomBytes(4).toString('hex');
    this.charIds = Object.keys(bal.chars);
    this.towerIds = Object.keys(bal.towers);
    this.tickMs = 1000 / bal.net.simHz;
    this.lastTick = Date.now();
    this.lastSweep = Date.now();
  }

  // ---------- helpers ----------
  send(s, obj) {
    const ws = s && s.ws;
    if (ws && ws.readyState === OPEN) { try { ws.send(JSON.stringify(obj)); } catch { /* ignore */ } }
  }
  err(s, code, extra) { this.send(s, { t: S2C.ERR, code, ...extra }); }

  genCode() {
    for (let k = 0; k < 50; k++) {
      let c = '';
      const b = crypto.randomBytes(ROOM_CODE_LEN);
      for (let i = 0; i < ROOM_CODE_LEN; i++) c += ROOM_ALPHABET[b[i] % ROOM_ALPHABET.length];
      if (!this.rooms.has(c)) return c;
    }
    return null;
  }

  roomView(room) {
    return { t: S2C.ROOM, code: room.code, playing: !!room.match, players: room.players.map((p) => ({ name: p.name, ready: p.lobbyReady, connected: !!p.ws })) };
  }
  broadcastRoom(room) {
    room.players.forEach((p, i) => this.send(p, { ...this.roomView(room), you: i }));
  }

  // ---------- connection lifecycle ----------
  onConnect(ws) { ws.session = null; }

  onClose(ws) {
    const s = ws.session;
    if (!s || s.ws !== ws) return;
    s.ws = null; s.dropAt = Date.now();
    if (s.room) { s.room.lastActive = Date.now(); this.broadcastRoom(s.room); }
  }

  onMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    msg = validateClientMessage(msg, this.charIds, this.towerIds);
    if (!msg) return;
    if (msg.t === C2S.HELLO) return this.hello(ws, msg);
    const s = ws.session;
    if (!s) return;
    switch (msg.t) {
      case C2S.PING: return this.send(s, { t: S2C.PONG, ts: msg.ts });
      case C2S.CREATE: return this.create(s, msg);
      case C2S.JOIN: return this.join(s, msg);
      case C2S.READY: return this.lobbyReady(s, msg);
      case C2S.LEAVE: return this.leave(s);
      case C2S.CMD: return this.cmd(s, msg);
    }
  }

  hello(ws, msg) {
    let s = msg.token ? this.sessions.get(msg.token) : null;
    let restarted = false;
    if (s) { if (s.ws && s.ws !== ws) { s.ws.session = null; try { s.ws.close(); } catch { /* ignore */ } } s.ws = ws; s.dropAt = 0; }
    else {
      restarted = !!(msg.token && msg.code); // client believed it was in a room we do not know -> server restarted
      s = { token: crypto.randomBytes(12).toString('hex'), ws, name: msg.name, room: null, side: -1, dropAt: 0 };
      this.sessions.set(s.token, s);
    }
    s.name = msg.name || s.name;
    ws.session = s;
    this.send(s, { t: S2C.WELCOME, token: s.token, boot: this.bootId, restarted, resumed: !!s.room });
    if (s.room) {
      const room = s.room;
      this.broadcastRoom(room);
      if (room.match) { room.match.requestFull(s.side); this.send(s, { t: S2C.START, side: s.side, seed: room.seed, names: room.players.map((p) => p.name), resume: true }); }
    }
  }

  // ---------- rooms ----------
  create(s, msg) {
    if (s.room) this.leave(s);
    if (this.rooms.size >= this.cfg.maxRooms) return this.err(s, ERR.SERVER_FULL);
    const code = this.genCode();
    if (!code) return this.err(s, ERR.SERVER_FULL);
    s.name = msg.name;
    const room = { code, host: s, players: [s], match: null, seed: 1, createdAt: Date.now(), lastActive: Date.now() };
    s.lobbyReady = false; s.room = room; s.side = 0;
    this.rooms.set(code, room);
    this.broadcastRoom(room);
  }

  join(s, msg) {
    if (s.room) this.leave(s);
    const room = this.rooms.get(msg.code);
    if (!room) return this.err(s, ERR.ROOM_NOT_FOUND);
    if (room.players.length >= 2 || room.match) return this.err(s, ERR.ROOM_FULL);
    s.name = msg.name; s.lobbyReady = false; s.room = room; s.side = 1;
    room.players.push(s); room.lastActive = Date.now();
    this.broadcastRoom(room);
  }

  lobbyReady(s, msg) {
    const room = s.room;
    if (!room || room.match) return;
    s.lobbyReady = msg.v; room.lastActive = Date.now();
    this.broadcastRoom(room);
    if (room.players.length === 2 && room.players.every((p) => p.lobbyReady && p.ws)) this.startMatch(room);
  }

  startMatch(room) {
    room.seed = (Math.random() * 1e9) | 0;
    room.match = new MatchRunner(this.bal, room.seed);
    const names = room.players.map((p) => p.name);
    room.players.forEach((p, i) => this.send(p, { t: S2C.START, side: i, seed: room.seed, names }));
    this.broadcastRoom(room);
  }

  cmd(s, msg) {
    const room = s.room;
    if (!room || !room.match) return this.err(s, ERR.NOT_IN_ROOM);
    room.lastActive = Date.now();
    const r = room.match.command(s.side, msg);
    if (!r.ok) this.err(s, ERR.GAME_ERR, { why: r.err, id: msg.id });
  }

  /** Remove a session from its room. A running match is forfeited by the leaver. */
  leave(s) {
    const room = s.room;
    if (!room) return;
    const idx = room.players.indexOf(s), wasHost = room.host === s, hadMatch = !!room.match;
    s.room = null; s.side = -1; s.lobbyReady = false;
    if (room.match && !room.match.over) room.match.forfeit(idx, 'forfeit');
    if (room.match) this.flushFinal(room);
    room.players = room.players.filter((p) => p !== s);
    room.match = null;
    if (room.players.length === 0) { this.rooms.delete(room.code); return; }
    if (wasHost && !hadMatch) { // host left a waiting room: close it
      for (const p of room.players) { this.send(p, { t: S2C.LEFT, reason: ERR.HOST_LEFT }); p.room = null; p.side = -1; }
      this.rooms.delete(room.code);
      return;
    }
    if (wasHost) room.host = room.players[0];
    room.players.forEach((p, i) => { p.side = i; p.lobbyReady = false; });
    this.send(room.players[0], { t: S2C.LEFT, reason: ERR.OPP_LEFT, stay: true });
    this.broadcastRoom(room);
  }

  flushFinal(room) {
    if (!room.match) return;
    const m = room.match;
    room.players.forEach((p, i) => this.send(p, m.snapshot(i)));
    m.flushEvents();
  }

  // ---------- main loop (called every ~50ms by index.js, catches up if late) ----------
  tick() {
    const now = Date.now();
    let steps = Math.floor((now - this.lastTick) / this.tickMs);
    if (steps > 3) { steps = 3; this.lastTick = now - 3 * this.tickMs; }
    for (let i = 0; i < steps; i++) { this.lastTick += this.tickMs; this.stepAll(); }
    if (now - this.lastSweep > 1000) { this.lastSweep = now; this.sweep(now); }
  }

  stepAll() {
    for (const room of this.rooms.values()) {
      const m = room.match;
      if (!m) continue;
      try {
        const wasOver = m.over;
        if (!m.step() && !(m.over && !wasOver)) continue;
        room.players.forEach((p, i) => {
          if (!p.ws || p.ws.readyState !== OPEN) return;
          if (p.ws.bufferedAmount > this.cfg.snapBackpressureBytes) { m.requestFull(i); return; }
          this.send(p, m.snapshot(i));
        });
        m.flushEvents();
        if (m.over) { room.match = null; room.players.forEach((p) => { p.lobbyReady = false; }); room.lastActive = Date.now(); this.broadcastRoom(room); }
      } catch (e) {
        console.error('[match error]', room.code, e);
        room.match = null;
      }
    }
  }

  /** Once per second: reconnect grace, idle room cleanup, stale sessions. */
  sweep(now) {
    for (const room of [...this.rooms.values()]) {
      for (const p of [...room.players]) {
        if (!p.ws && p.dropAt && now - p.dropAt > this.cfg.reconnectGraceMs) this.leave(p);
      }
      if (!this.rooms.has(room.code)) continue;
      if (!room.match && now - room.lastActive > this.cfg.roomIdleMs) {
        for (const p of room.players) { this.send(p, { t: S2C.LEFT, reason: 'IDLE' }); p.room = null; p.side = -1; }
        this.rooms.delete(room.code);
      }
    }
    for (const [tok, s] of this.sessions) if (!s.room && !s.ws && now - s.dropAt > 5 * 60 * 1000) this.sessions.delete(tok);
  }
}
