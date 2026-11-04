/**
 * Economy module: prices (+8% per re-hire), income, cooldowns and the hire command.
 * Mining team -> money/s, war team -> units, crafting team -> global buffs / mage.
 */
import { spawnUnit } from './units.js';

export function priceOf(bal, bought, id) {
  const c = bal.chars[id];
  const g = c.growth ?? bal.economy.priceGrowth;
  return Math.round(c.cost * Math.pow(g, bought[id] || 0));
}

/** Max copies of a character: stackable buffs use maxStacks, others max. */
export const maxOwned = (c) => c.maxStacks ?? c.max;

/** Common ordering for hire buttons + codex: ascending BASE price (re-hire price growth never reorders). Ties keep balance.json order. */
export function sortedIds(bal, team) {
  return Object.keys(bal.chars).map((id, i) => ({ id, i })).filter((x) => !team || bal.chars[x.id].team === team)
    .sort((a, b) => bal.chars[a.id].cost - bal.chars[b.id].cost || a.i - b.i).map((x) => x.id);
}

export function makePlayer(bal) {
  const owned = {}, bought = {}, cd = {};
  for (const id in bal.chars) { owned[id] = 0; bought[id] = 0; cd[id] = 0; }
  owned[bal.economy.freeMiner] = 1;
  return {
    money: bal.economy.startMoney, owned, bought, cd, ready: false, towerType: 'crystal',
    unitCount: 0, income: 0, incAcc: 0, incT: 0, mageT: 0,
    stats: { mined: 0, kills: 0, towerDmg: 0, mvp: null },
  };
}

export function calcIncome(g, side) {
  const p = g.players[side];
  let s = 0;
  for (const id in g.bal.chars) { const c = g.bal.chars[id]; if (c.team === 'mine') s += p.owned[id] * c.income; }
  const tw = g.towers[side];
  // tower bonus and sudden-death bonus are multiplied together
  return s * (1 + (tw ? g.bal.towers[tw.type].incomeBonus : 0)) * (g.sudden ? 1 + g.bal.suddenDeath.incomeBonus : 1);
}

export function tickEconomy(g, dt) {
  for (const side of [0, 1]) {
    const p = g.players[side];
    const inc = p.income * dt;
    p.money += inc; p.stats.mined += inc; p.incAcc += inc; p.incT += dt;
    if (p.incT >= 1) { g.emit({ e: 'inc', s: side, a: Math.round(p.incAcc) }); p.incAcc = 0; p.incT = 0; }
    for (const id in p.cd) if (p.cd[id] > 0) p.cd[id] = Math.max(0, p.cd[id] - dt);
  }
}

/** Server-side validated hire. Returns {ok} or {ok:false, err}. */
export function hire(g, side, id) {
  const bal = g.bal, c = bal.chars[id], p = g.players[side];
  if (!c) return { ok: false, err: 'bad' };
  if (g.phase === 'prep') { if (c.team !== 'mine') return { ok: false, err: 'phase' }; }
  else if (g.phase !== 'battle') return { ok: false, err: 'phase' };
  if (g.phase === 'battle' && p.cd[id] > 0) return { ok: false, err: 'cd' };
  if (c.team === 'war') { if (p.unitCount >= bal.match.maxUnitsPerSide) return { ok: false, err: 'cap' }; }
  else if (p.owned[id] >= maxOwned(c)) return { ok: false, err: 'max' };
  const cost = priceOf(bal, p.bought, id);
  if (p.money < cost) return { ok: false, err: 'money' };
  p.money -= cost; p.bought[id]++; p.owned[id]++;
  p.cd[id] = g.phase === 'prep' ? 0 : c.cooldown;
  if (c.team === 'war') spawnUnit(g, side, id);
  else {
    p.income = calcIncome(g, side);
    if (id === 'ezra' && p.owned.ezra === 1) p.mageT = bal.match.firstMageDelay;
  }
  g.emit({ e: 'hire', s: side, id });
  return { ok: true };
}
