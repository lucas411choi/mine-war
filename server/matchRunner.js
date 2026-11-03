/**
 * MatchRunner: one authoritative Game per room.
 * Steps the shared simulation at 20 Hz (driven by RoomManager) and builds 10 Hz delta snapshots per player.
 */
import { Game } from '../shared/sim/game.js';
import { packSnapshot, newView } from '../shared/snapshot.js';

export class MatchRunner {
  constructor(bal, seed) {
    this.bal = bal;
    this.game = new Game(bal, { seed });
    this.views = [newView(), newView()];
    this.full = [true, true];
    this.evBuf = [];
    this.n = 0;
    this.snapEvery = Math.max(1, Math.round(bal.net.simHz / bal.net.snapHz));
  }

  command(side, cmd) { return this.game.command(side, cmd); }
  forfeit(side, reason) { this.game.forfeit(side, reason); }
  get over() { return this.game.phase === 'over'; }
  requestFull(side) { this.full[side] = true; this.views[side] = newView(); }

  /** Advance one tick. Returns true when a snapshot should be broadcast now. */
  step() {
    this.game.step();
    const ev = this.game.drainEvents();
    for (const e of ev) if (this.evBuf.length < this.bal.net.maxEventsPerSnap || e.e !== 'hit') this.evBuf.push(e);
    this.n++;
    return this.n % this.snapEvery === 0 || this.over;
  }

  /** Build the snapshot for a side. Call flushEvents() after all sides are packed. */
  snapshot(side) {
    const full = this.full[side];
    this.full[side] = false;
    return packSnapshot(this.game, this.views[side], side, this.evBuf, full);
  }
  flushEvents() { this.evBuf = []; }
}
