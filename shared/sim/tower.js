/** Tower module: creation + attack logic for the four main tower types. */
import { hurtUnit } from './combat.js';

export function makeTower(g, side, type) {
  const t = g.bal.towers[type];
  return { side, type, hp: t.hp, maxHp: t.hp, cd: 1.5, x: side === 0 ? -g.bal.map.towerX : g.bal.map.towerX };
}

export function stepTower(g, side, dt) {
  const tw = g.towers[side];
  if (tw.hp <= 0) return;
  const def = g.bal.towers[tw.type];
  tw.cd -= dt;
  if (tw.cd > 0) return;
  let best = null, bd = 1e9;
  for (const u of g.units) {
    if (u.side === side || u.dead || (u.air && !def.air)) continue;
    const d = Math.hypot(u.x - tw.x, u.z);
    if (d <= def.range && d < bd) { bd = d; best = u; }
  }
  if (!best) return;
  tw.cd = def.cd;
  const melee = g.bal.chars[best.type].melee && !best.air;
  const dmg = def.atk * (melee ? def.meleeBonus : 1);
  g.emit({ e: 'twatk', s: side, k: tw.type, x: tw.x, tx: +best.x.toFixed(1), tz: +best.z.toFixed(1), a: best.air ? 1 : 0 });
  if (def.splash) {
    for (const o of g.units) {
      if (o.dead || o.side === side || o.air || o === best) continue;
      if (Math.hypot(o.x - best.x, o.z - best.z) <= def.splash) hurtUnit(g, side, o, dmg * 0.6, null, false);
    }
  }
  hurtUnit(g, side, best, dmg, null, false);
}
