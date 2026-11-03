/**
 * Mine War server: ONE Express app + ONE http server.
 *  - serves the built client (dist/) statically
 *  - GET /healthz -> 200 (Render health check)
 *  - WebSocket on /ws (same server, same port) for room-code multiplayer
 * Binds to process.env.PORT on 0.0.0.0. No environment variable is required.
 */
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const bal = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'balance.json'), 'utf8'));

process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_req, res) => res.status(200).type('text/plain').send('ok'));
app.use(express.static(distDir, { maxAge: '1h', index: 'index.html' }));
app.use((req, res) => {
  const index = path.join(distDir, 'index.html');
  if (req.method === 'GET' && fs.existsSync(index)) return res.sendFile(index);
  res.status(404).type('text/plain').send('Client not built. Run: npm run build');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: config.maxPayload });
const rooms = new RoomManager(bal, config);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.tokens = config.rateLimitPerSec; ws.lastRefill = Date.now();
  rooms.onConnect(ws);
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data, isBinary) => {
    try {
      if (isBinary) return;
      const now = Date.now();
      ws.tokens = Math.min(config.rateLimitPerSec, ws.tokens + ((now - ws.lastRefill) / 1000) * config.rateLimitPerSec);
      ws.lastRefill = now;
      if (ws.tokens < 1) return; // drop silently when flooding
      ws.tokens -= 1;
      rooms.onMessage(ws, data.toString());
    } catch (e) { console.error('[message error]', e); }
  });
  ws.on('close', () => { try { rooms.onClose(ws); } catch (e) { console.error(e); } });
  ws.on('error', () => { /* handled by close */ });
});

// keep-alive: Render's proxy drops idle connections, so ping every 30s and reap dead sockets
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* ignore */ }
  }
}, config.pingIntervalMs).unref();

// simulation loop: 20 Hz (drift-compensated inside RoomManager.tick)
setInterval(() => { try { rooms.tick(); } catch (e) { console.error('[tick error]', e); } }, 1000 / bal.net.simHz / 2);

server.listen(config.port, config.host, () => console.log(`Mine War listening on http://${config.host}:${config.port}`));
