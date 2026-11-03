/**
 * Sessions give the renderer/UI one interface for both match types:
 *   session.view     -> Game (local) or Mirror (online): units, towers, players, phase, timeLeft, events...
 *   session.update(dt), session.cmd({c, id}), session.names, session.side
 * LocalSession runs the shared simulation + AIPlayer inside the browser (works while the server sleeps).
 */
import { Game, DT } from '../../../shared/sim/game.js';
import { AIPlayer } from '../../../shared/sim/ai.js';
import { Mirror } from '../../../shared/snapshot.js';

export class LocalSession {
  constructor(bal, { level = 'normal', seed = (Math.random() * 1e9) | 0 } = {}) {
    this.mode = 'local'; this.side = 0; this.level = level; this.seed = seed; this.paused = false; this.acc = 0;
    this.game = new Game(bal, { seed });
    this.ai = new AIPlayer(this.game, 1, level, seed + 7);
    this.view = this.game;
    this.names = ['', this.ai.name]; this.avatars = ['🛡️', this.ai.avatar];
  }
  update(dt) {
    if (this.paused) return;
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= DT && n < 5) { this.ai.update(DT); this.game.step(); this.acc -= DT; n++; }
    if (n === 5) this.acc = 0;
    this.game.alpha = this.acc / DT;
  }
  cmd(c) { return this.game.command(0, c); }
  dispose() {}
}

export class OnlineSession {
  constructor(bal, net, { side, names }) {
    this.mode = 'online'; this.side = side; this.net = net; this.bal = bal; this.paused = false;
    this.mirror = new Mirror(bal); this.view = this.mirror;
    this.names = names; this.avatars = ['🛡️', '⚔️'];
    this.snapMs = 1000 / bal.net.snapHz;
  }
  onSnap(msg) { this.mirror.apply(msg); }
  update() { this.mirror.alpha = Math.min(1, (performance.now() - this.mirror.snapAt) / this.snapMs); }
  cmd(c) { this.net.send({ t: 'cmd', ...c }); return { ok: true }; }
  dispose() {}
}
