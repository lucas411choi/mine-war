/**
 * Snapshot codec (server -> client) and the client-side Mirror.
 * - packSnapshot(): per-viewer delta of unit state (only units whose quantized state changed),
 *   plus events, plus compact per-player data.
 * - Mirror: client-side copy of the match exposing the same fields as Game so the renderer / UI
 *   can treat local and online matches identically.
 */
const PH = { prep: 'p', battle: 'b', over: 'o' };
const PH_REV = { p: 'prep', b: 'battle', o: 'over' };

export function newView() { return { sent: new Map() }; }

export function packSnapshot(g, view, side, events, full) {
  if (full) view.sent.clear();
  const u = [], d = [], seen = new Set();
  for (const un of g.units) {
    seen.add(un.id);
    const x = Math.round(un.x * 10), z = Math.round(un.z * 10), hp = Math.ceil(un.hp);
    const fl = un.st | (un.burn > 0 ? 4 : 0) | (un.slow > 0 ? 8 : 0) | (un.stun > 0 ? 16 : 0);
    const key = x + ',' + z + ',' + hp + ',' + fl;
    const prev = view.sent.get(un.id);
    if (prev === undefined) { u.push([un.id, x, z, hp, fl, un.side, g.warIds.indexOf(un.type)]); view.sent.set(un.id, key); }
    else if (prev !== key) { u.push([un.id, x, z, hp, fl]); view.sent.set(un.id, key); }
  }
  for (const id of view.sent.keys()) if (!seen.has(id)) d.push(id);
  for (const id of d) view.sent.delete(id);

  const hide = g.phase === 'prep';
  const p = g.players.map((pl, s) => [
    +pl.money.toFixed(1), +pl.income.toFixed(2), pl.ready ? 1 : 0,
    hide && s !== side ? null : pl.towerType, Math.max(0, Math.ceil(g.towers[s].hp)),
    g.charIds.map((id) => pl.bought[id]), g.charIds.map((id) => +pl.cd[id].toFixed(1)), pl.unitCount,
  ]);
  const msg = { t: 'snap', n: g.tick, ph: PH[g.phase], tl: +g.timeLeft.toFixed(1), sd: g.sudden ? 1 : 0, ot: g.overtime ? 1 : 0, p, u, d, ev: events };
  if (full) msg.full = 1;
  if (g.phase === 'over') msg.r = g.result;
  return msg;
}

export class Mirror {
  constructor(bal) {
    this.bal = bal;
    this.charIds = Object.keys(bal.chars);
    this.warIds = this.charIds.filter((id) => bal.chars[id].team === 'war');
    this.phase = 'prep'; this.timeLeft = bal.match.prepSeconds; this.sudden = false; this.overtime = false;
    this.units = []; this.map = new Map(); this.events = []; this.result = null; this.alpha = 1; this.snapAt = 0;
    const mk = (s) => ({ side: s, type: 'crystal', hp: 2000, maxHp: 2000, x: s === 0 ? -bal.map.towerX : bal.map.towerX });
    this.towers = [mk(0), mk(1)];
    this.players = [0, 1].map(() => ({ money: 0, income: 0, ready: false, towerType: null, owned: {}, bought: {}, cd: {}, unitCount: 0 }));
    this.battleTime = 0;
  }

  drainEvents() { const e = this.events; this.events = []; return e; }

  apply(s) {
    const bal = this.bal;
    this.phase = PH_REV[s.ph] || 'prep'; this.timeLeft = s.tl; this.sudden = !!s.sd; this.overtime = !!s.ot;
    if (s.full) { this.units = []; this.map.clear(); }
    for (const un of this.units) { un.px = un.x; un.pz = un.z; }
    for (const a of s.u) {
      let un = this.map.get(a[0]);
      if (!un) {
        if (a.length < 7) continue;
        const type = this.warIds[a[6]], def = bal.chars[type];
        if (!def) continue;
        un = { id: a[0], side: a[5], type, maxHp: def.hp, air: !!def.air, x: a[1] / 10, z: a[2] / 10, px: a[1] / 10, pz: a[2] / 10, hp: a[3], st: 0, burn: 0, slow: 0, stun: 0 };
        this.map.set(un.id, un); this.units.push(un);
      } else { un.x = a[1] / 10; un.z = a[2] / 10; }
      un.hp = a[3]; const fl = a[4];
      un.st = fl & 3; un.burn = fl & 4 ? 1 : 0; un.slow = fl & 8 ? 1 : 0; un.stun = fl & 16 ? 1 : 0;
    }
    if (s.d && s.d.length) {
      const dead = new Set(s.d);
      for (const id of s.d) this.map.delete(id);
      this.units = this.units.filter((u) => !dead.has(u.id));
    }
    s.p.forEach((a, i) => {
      const pl = this.players[i], tw = this.towers[i];
      pl.money = a[0]; pl.income = a[1]; pl.ready = !!a[2]; pl.towerType = a[3]; pl.unitCount = a[7];
      this.charIds.forEach((id, k) => {
        pl.bought[id] = a[5][k]; pl.cd[id] = a[6][k];
        pl.owned[id] = a[5][k] + (id === bal.economy.freeMiner ? 1 : 0);
      });
      tw.type = a[3] || 'crystal'; tw.maxHp = bal.towers[tw.type].hp; tw.hp = a[4];
    });
    if (s.r) this.result = s.r;
    if (s.ev && s.ev.length) for (const e of s.ev) this.events.push(e);
    this.snapAt = performance.now();
  }
}
