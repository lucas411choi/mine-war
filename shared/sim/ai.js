/**
 * AIPlayer: plays by exactly the same rules as a human (same hire() command, no money/info cheats).
 * It only looks at what a human could see: own state, enemy units on the field and, after the
 * prep phase, the revealed enemy tower type.
 * Difficulty changes think interval, mistake chance and counter-picking, not resources.
 */
import { makeRng } from './rng.js';
import { hire, priceOf } from './economy.js';

const LEVELS = {
  easy:   { think: 3.2, mistake: 0.35, counter: false, danger: 4, noise: 1.2, early: 80, eff: 0 },
  normal: { think: 1.6, mistake: 0.15, counter: true,  danger: 3, noise: 0.6, early: 110, eff: 1 },
  hard:   { think: 0.6, mistake: 0.03, counter: true,  danger: 2, noise: 0.15, early: 260, eff: 2 },
};
const MINE = ['jack', 'robinson', 'gary', 'teammine'];
const WAR = ['tim', 'kimmy', 'kelly', 'galion', 'sammy'];
// rough cost-efficiency of each war unit (smarter AIs save up for efficient ones)
const EFF = { tim: 0, kimmy: 0.5, kelly: 0.6, galion: 1.4, sammy: 0 };

export class AIPlayer {
  constructor(game, side, level = 'normal', seed = 99) {
    this.g = game; this.side = side; this.level = level; this.cfg = LEVELS[level] || LEVELS.normal;
    this.rng = makeRng(seed); this.cool = 1; this.prepDone = false; this.readyAt = 4 + this.rng() * 10;
    this.spent = { mine: 0, war: 0, craft: 0 };
    this.name = { easy: 'AI 철수', normal: 'AI 영희', hard: 'AI 장군' }[level] || 'AI';
    this.avatar = { easy: '🤖', normal: '🧙', hard: '👹' }[level] || '🤖';
  }

  update(dt) {
    const g = this.g;
    if (g.phase === 'prep') {
      if (!this.prepDone) this.prep();
      this.readyAt -= dt;
      if (this.readyAt <= 0) g.command(this.side, { c: 'ready' });
      return;
    }
    if (g.phase !== 'battle') return;
    this.cool -= dt;
    if (this.cool > 0) return;
    this.cool = this.cfg.think * (0.8 + this.rng() * 0.4);
    this.decide();
  }

  prep() {
    const g = this.g, s = this.side, p = g.players[s], rng = this.rng;
    this.prepDone = true;
    const pool = this.level === 'hard' ? ['crystal', 'iron', 'flame', 'vein'] : ['crystal', 'iron', 'vein', 'flame', 'crystal'];
    g.command(s, { c: 'tower', id: rng.pick(pool) });
    if (this.level !== 'easy' || rng() < 0.5) {
      const price = priceOf(g.bal, p.bought, 'jack');
      if (p.money >= price && hire(g, s, 'jack').ok) this.spent.mine += price;
    }
  }

  can(id) {
    const g = this.g, p = g.players[this.side], c = g.bal.chars[id];
    if (p.cd[id] > 0) return false;
    if (c.team === 'war') return p.unitCount < g.bal.match.maxUnitsPerSide;
    return p.owned[id] < c.max;
  }

  decide() {
    const g = this.g, s = this.side, p = g.players[s], bal = g.bal, cfg = this.cfg, rng = this.rng;
    const me = g.towers[s], t = g.battleTime;
    let near = 0;
    for (const u of g.units) if (u.side !== s && !u.dead && Math.abs(u.x - me.x) < 16) near++;
    const danger = near >= cfg.danger || (near > 0 && me.hp / me.maxHp < 0.5);
    const stage = t < cfg.early ? 0 : t < 300 ? 1 : 2;
    const want = danger ? { mine: 0.03, war: 0.95, craft: 0.02 }
      : [{ mine: 0.65, war: 0.3, craft: 0.05 }, { mine: 0.35, war: 0.5, craft: 0.15 }, { mine: 0.12, war: 0.68, craft: 0.2 }][stage];
    const tot = this.spent.mine + this.spent.war + this.spent.craft + 1;
    let cat = 'war', best = -9;
    for (const c of ['mine', 'war', 'craft']) { const d = want[c] - this.spent[c] / tot; if (d > best) { best = d; cat = c; } }
    if (rng() < cfg.mistake) cat = rng.pick(['mine', 'war', 'craft']);
    if (cat === 'mine' && g.timeLeft < 140 && !g.overtime) cat = 'war';
    let id = cat === 'mine' ? this.pickMine() : cat === 'war' ? this.pickWar() : this.pickCraft();
    if (!id && cat !== 'war') id = this.pickWar();
    if (!id) return;
    const price = priceOf(bal, p.bought, id);
    if (p.money < price) { this.cool = Math.min(this.cool, 0.8); return; }
    if (hire(g, s, id).ok) this.spent[bal.chars[id].team] += price;
  }

  pickMine() {
    const g = this.g, p = g.players[this.side], horizon = p.money + p.income * 10;
    for (let i = MINE.length - 1; i >= 0; i--) {
      const id = MINE[i];
      if (!this.can(id)) continue;
      const price = priceOf(g.bal, p.bought, id), c = g.bal.chars[id];
      if (price <= horizon && price / c.income < Math.max(40, g.timeLeft * 0.5)) return id;
    }
    return this.can('jack') ? 'jack' : null;
  }

  pickCraft() {
    const g = this.g, p = g.players[this.side];
    if (p.owned.ezra === 0 && g.battleTime > 90 && this.can('ezra')) return 'ezra';
    const a = p.owned.sam <= p.owned.bill ? 'sam' : 'bill', b = a === 'sam' ? 'bill' : 'sam';
    if (this.can(a)) return a;
    if (this.can(b)) return b;
    return this.can('ezra') ? 'ezra' : null;
  }

  pickWar() {
    const g = this.g, s = this.side, p = g.players[s], bal = g.bal, cfg = this.cfg, rng = this.rng;
    const w = { tim: 1, kimmy: 1, kelly: 1.2, galion: 1.3, sammy: 1 };
    if (cfg.counter) {
      let air = 0, melee = 0, arch = 0, tank = 0;
      for (const u of g.units) {
        if (u.side === s || u.dead) continue;
        if (u.air) air++; else if (bal.chars[u.type].melee) melee++;
        if (u.type === 'kelly') arch++; if (u.type === 'galion') tank++;
      }
      if (air >= 1) w.kelly += 1.5;
      if (melee >= 3) { w.kelly += 1; w.galion += 1; }
      if (arch >= 3) { w.kimmy += 1.5; w.sammy -= 1; }
      if (tank >= 1) { w.sammy += 1; w.kelly += 0.5; }
      const ft = g.phase === 'battle' ? g.towers[1 - s].type : null;
      if (ft === 'flame') { w.tim -= 1; w.kimmy -= 1; w.kelly += 0.5; w.sammy += 0.5; }
      if (ft === 'iron') w.galion += 1;
    }
    if (p.money > 800) { w.galion += 1; w.sammy += 1; }
    const horizon = p.money + p.income * 8;
    let pick = null, bs = -1e9;
    for (const id of WAR) {
      if (!this.can(id) || priceOf(bal, p.bought, id) > horizon) continue;
      const sc = w[id] + EFF[id] * cfg.eff + rng() * cfg.noise;
      if (sc > bs) { bs = sc; pick = id; }
    }
    return pick;
  }
}
