/**
 * Message protocol shared by server and client.
 * All messages are JSON objects with a string field `t`.
 */
/** Bump on every release that changes shared rules/protocol. Server and client compare it on connect. */
export const GAME_VERSION = '1.1.0';

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const ROOM_CODE_LEN = 5;

export const C2S = { HELLO: 'hello', CREATE: 'create', JOIN: 'join', READY: 'ready', LEAVE: 'leave', CMD: 'cmd', PING: 'ping' };
export const S2C = { WELCOME: 'welcome', ROOM: 'room', START: 'start', SNAP: 'snap', ERR: 'err', PONG: 'pong', LEFT: 'left' };
export const CMD = { TOWER: 'tower', HIRE: 'hire', READY: 'ready' };

export const ERR = {
  BAD_MESSAGE: 'BAD_MESSAGE', ROOM_NOT_FOUND: 'ROOM_NOT_FOUND', ROOM_FULL: 'ROOM_FULL', SERVER_FULL: 'SERVER_FULL',
  RATE_LIMIT: 'RATE_LIMIT', VERSION: 'VERSION', NOT_IN_ROOM: 'NOT_IN_ROOM', HOST_LEFT: 'HOST_LEFT', OPP_LEFT: 'OPP_LEFT', GAME_ERR: 'GAME_ERR',
};

export function normalizeCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LEN);
}
export function sanitizeName(s, fallback = 'Player') {
  const n = String(s || '').replace(/[\u0000-\u001f<>&"'`]/g, '').trim().slice(0, 12);
  return n || fallback;
}

/** Validate + normalize an incoming client message. Returns null when invalid. */
export function validateClientMessage(m, charIds, towerIds) {
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return null;
  switch (m.t) {
    case C2S.HELLO: return { t: m.t, token: typeof m.token === 'string' ? m.token.slice(0, 64) : '', code: normalizeCode(m.code), name: sanitizeName(m.name), ver: typeof m.ver === 'string' ? m.ver.slice(0, 16) : '' };
    case C2S.CREATE: return { t: m.t, name: sanitizeName(m.name) };
    case C2S.JOIN: { const code = normalizeCode(m.code); return code.length === ROOM_CODE_LEN ? { t: m.t, code, name: sanitizeName(m.name) } : null; }
    case C2S.READY: return { t: m.t, v: !!m.v };
    case C2S.LEAVE: return { t: m.t };
    case C2S.PING: return { t: m.t, ts: Number(m.ts) || 0 };
    case C2S.CMD: {
      if (m.c === CMD.READY) return { t: m.t, c: CMD.READY };
      if (m.c === CMD.HIRE && charIds.includes(m.id)) return { t: m.t, c: CMD.HIRE, id: m.id };
      if (m.c === CMD.TOWER && towerIds.includes(m.id)) return { t: m.t, c: CMD.TOWER, id: m.id };
      return null;
    }
    default: return null;
  }
}
