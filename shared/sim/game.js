/**
 * Game: authoritative simulation core (no rendering, no networking).
 * Phases: prep (tower pick + early miners) -> battle -> over.
 * Used by the Node server, the in-browser AI match and (via snapshots) mirrored by online clients.
 */
import { makeRng } from './rng.js';
import { makePlayer, calcIncome, tickEconomy, hire } from './economy.js';
import { stepUnits } from './units.js';
import { stepTower, makeTower } from './tower.js';
import { stepMagic } from './magic.js';

export const DT = 1 / 20;

export class Game {
  constructor(bal, { seed = 1 } = {}) {
    this.bal = bal;
    this.rng = makeRng(seed);
    this.charIds = Object.keys(bal.chars);
    this.warIds = this.charIds.filter((id) => bal.chars[id].team === 'war');
    this.phase = 'prep';
    this.timeLeft = bal.match.prepSeconds;
    this.battleTime = 0;
    this.tick = 0;
    this.nextId = 1;
    this.units = [];
    this.spells = [];
    this.events = [];
    this.sudden = false; this.overtime = false; this.sdMult = 1;
    this.result = null;
    this.players = [makePlayer(bal), makePlayer(bal)];
    this.towers = [null, null];
    this.setTower(0, 'crystal'); this.setTower(1, 'crystal');
    this.alpha = 1; // render interpolation factor, set by the host loop
  }

  emit(ev) { if (ev.e !== 'hit' || this.events.length < 400) this.events.push(ev); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  setTower(side, type) {
    this.players[side].towerType = type;
    this.towers[side] = makeTower(this, side, type);
    this.players[side].income = calcIncome(this, side);
  }

  /** Apply a player command. Returns {ok} or {ok:false, err}. */
  command(side, cmd) {
    if (this.phase === 'over') return { ok: false, err: 'over' };
    const p = this.players[side];
    switch (cmd.c) {
      case 'tower':
        if (this.phase !== 'prep' || p.ready || !this.bal.towers[cmd.id]) return { ok: false, err: 'phase' };
        this.setTower(side, cmd.id); return { ok: true };
      case 'ready':
        if (this.phase !== 'prep') return { ok: false, err: 'phase' };
        p.ready = true; return { ok: true };
      case 'hire': return hire(this, side, cmd.id);
      default: return { ok: false, err: 'bad' };
    }
  }

  startBattle() {
    this.phase = 'battle';
    this.timeLeft = this.bal.match.battleSeconds;
    for (const s of [0, 1]) {
      const p = this.players[s];
      p.ready = true; p.income = calcIncome(this, s);
      p.mageT = this.bal.match.firstMageDelay;
    }
    this.emit({ e: 'start' });
  }

  ratio(s) { const t = this.towers[s]; return Math.max(0, t.hp) / t.maxHp; }

  finish(winner, reason) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.result = { winner, reason, stats: this.players.map((p) => ({ mined: Math.round(p.stats.mined), kills: p.stats.kills, towerDmg: Math.round(p.stats.towerDmg), mvp: p.stats.mvp })) };
    this.emit({ e: 'over', w: winner });
  }

  forfeit(side, reason = 'forfeit') { this.finish(1 - side, reason); }

  step() {
    if (this.phase === 'over') return;
    const dt = DT, M = this.bal.match;
    this.tick++;
    if (this.phase === 'prep') {
      this.timeLeft -= dt;
      if ((this.players[0].ready && this.players[1].ready) || this.timeLeft <= 0) this.startBattle();
      return;
    }
    this.battleTime += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      if (!this.overtime) {
        const a = this.ratio(0), b = this.ratio(1);
        if (Math.abs(a - b) > 1e-6) return this.finish(a > b ? 0 : 1, 'time');
        this.overtime = true; this.timeLeft = M.overtimeSeconds; this.emit({ e: 'ot' });
      } else {
        const a = this.ratio(0), b = this.ratio(1);
        const w = Math.abs(a - b) > 1e-6 ? (a > b ? 0 : 1) : (this.players[0].stats.towerDmg >= this.players[1].stats.towerDmg ? 0 : 1);
        return this.finish(w, 'overtime');
      }
    }
    const SD = this.bal.suddenDeath;
    const sd = this.overtime || this.timeLeft <= SD.seconds;
    if (sd !== this.sudden) {
      this.sudden = sd; this.sdMult = sd ? 1 + SD.damageBonus : 1;
      for (const s of [0, 1]) this.players[s].income = calcIncome(this, s); // +income bonus applies to both players
      if (sd) this.emit({ e: 'sd' });
    }

    tickEconomy(this, dt);
    stepUnits(this, dt);
    stepTower(this, 0, dt); stepTower(this, 1, dt);
    stepMagic(this, dt);
    if (this.units.some((u) => u.dead)) this.units = this.units.filter((u) => !u.dead);

    const d0 = this.towers[0].hp <= 0, d1 = this.towers[1].hp <= 0;
    if (d0 || d1) {
      this.emit({ e: 'twd', s: d0 && !d1 ? 0 : d1 && !d0 ? 1 : (this.towers[0].hp < this.towers[1].hp ? 0 : 1) });
      this.finish(d0 && d1 ? (this.towers[0].hp > this.towers[1].hp ? 0 : 1) : d0 ? 1 : 0, 'tower');
    }
  }
}
