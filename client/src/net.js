import { GAME_VERSION } from '../../shared/protocol.js';

/**
 * Net: WebSocket client for online matches.
 * - URL is derived from `location` (wss on https, ws on http) -> same code works locally and on Render.
 * - "Waking server" loop: polls /healthz and retries automatically until the sleeping free server answers.
 * - Heartbeat ping every 10 s (keeps proxies from dropping idle sockets, also gives the HUD a ping value).
 * - Session token + room code are kept in localStorage so a dropped player can rejoin within 30 s.
 */
export class Net {
  constructor(h) {
    this.h = h; this.ws = null; this.want = false; this.ping = 0; this.startedAt = 0; this.attempts = 0;
    this.token = localStorage.getItem('mw.token') || '';
    this.code = localStorage.getItem('mw.code') || '';
    this.boot = localStorage.getItem('mw.boot') || '';
    this.name = '';
    this.timer = null; this.pingTimer = null; this.open = false;
  }

  url() { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`; }
  setCode(c) { this.code = c || ''; try { c ? localStorage.setItem('mw.code', c) : localStorage.removeItem('mw.code'); } catch { /* ignore */ } }

  /** Start (or keep) the connection. Resolves through the callbacks. */
  connect(name) {
    this.name = name || this.name;
    if (this.open) { this.h.status('open', {}); return; }
    if (this.want) return;
    this.want = true; this.startedAt = Date.now(); this.attempts = 0;
    this.attempt();
  }

  async attempt() {
    if (!this.want || this.ws) return;
    this.attempts++;
    this.h.status(this.code && this.token ? 'reconnecting' : 'waking', { attempts: this.attempts, elapsed: Math.round((Date.now() - this.startedAt) / 1000) });
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch('/healthz', { cache: 'no-store', signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) throw new Error('health ' + r.status);
    } catch { return this.retry(); }
    if (!this.want) return;
    let ws;
    try { ws = new WebSocket(this.url()); } catch { return this.retry(); }
    this.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true; this.open = true; this.startedAt = Date.now();
      this.send({ t: 'hello', token: this.token, code: this.code, name: this.name, ver: GAME_VERSION });
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: Date.now() }), 10000);
      this.h.status('open', {});
    };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } this.onMsg(m); };
    ws.onclose = () => {
      clearInterval(this.pingTimer); this.ws = null; this.open = false;
      if (opened) this.h.dropped();
      if (this.want) this.retry(opened ? 800 : undefined);
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  retry(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.attempt(), ms ?? 2500);
  }

  onMsg(m) {
    if (m.t === 'pong') { this.ping = Date.now() - m.ts; return; }
    if (m.t === 'welcome') {
      this.token = m.token; try { localStorage.setItem('mw.token', m.token); localStorage.setItem('mw.boot', m.boot); } catch { /* ignore */ }
      this.boot = m.boot;
      if (m.restarted) { this.setCode(''); this.h.restarted(); }
      return this.h.msg(m);
    }
    this.h.msg(m);
  }

  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }

  /** Close for good (user left online mode). */
  close() {
    this.want = false; this.open = false; clearTimeout(this.timer); clearInterval(this.pingTimer);
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } this.ws = null; }
  }
}
