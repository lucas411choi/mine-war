/**
 * Combat module: damage pipeline, buffs/debuffs, kills.
 * Pipeline: base * (1+suddenDeath.damageBonus) * defender buff (Bill) * [attacker buff (Sam) if physical] * [tower DR].
 */
const r1 = (v) => Math.round(v * 10) / 10;

export const atkMult = (g, side) => 1 + g.bal.chars.sam.perStack * Math.min(g.players[side].owned.sam, g.bal.chars.sam.maxStacks);
export const defMult = (g, side) => 1 - g.bal.chars.bill.perStack * Math.min(g.players[side].owned.bill, g.bal.chars.bill.maxStacks);

function credit(g, atkSide, src, d) {
  if (!src) return;
  src.dealt += d;
  const st = g.players[atkSide].stats;
  if (!st.mvp || src.dealt > st.mvp.dmg) st.mvp = { type: src.type, dmg: Math.round(src.dealt) };
}

export function killUnit(g, u, killerSide) {
  if (u.dead) return;
  u.dead = true;
  g.players[u.side].unitCount--;
  if (killerSide != null) g.players[killerSide].stats.kills++;
  g.emit({ e: 'die', id: u.id, ty: u.type, s: u.side, x: r1(u.x), z: r1(u.z) });
}

/** Damage a unit. magic=true skips the attacker's Sam buff. */
export function hurtUnit(g, atkSide, u, base, src, magic) {
  if (u.dead || g.phase !== 'battle') return 0;
  let d = base * g.sdMult * defMult(g, u.side);
  if (!magic) d *= atkMult(g, atkSide);
  d = Math.max(1, d);
  u.hp -= d;
  g.emit({ e: 'hit', id: u.id, x: r1(u.x), z: r1(u.z), d: Math.round(d) });
  credit(g, atkSide, src, d);
  if (u.hp <= 0) killUnit(g, u, atkSide);
  return d;
}

/** Damage the tower of the opposite side of atkSide. */
export function hurtTower(g, atkSide, base, src, magic) {
  const tw = g.towers[1 - atkSide];
  if (g.phase !== 'battle' || tw.hp <= 0) return 0;
  let d = base * g.sdMult * defMult(g, tw.side) * (1 - g.bal.towers[tw.type].dr);
  if (!magic) d *= atkMult(g, atkSide);
  tw.hp -= d;
  g.players[atkSide].stats.towerDmg += d;
  credit(g, atkSide, src, d);
  g.emit({ e: 'hit', id: -1, tw: tw.side, x: tw.x, z: 0, d: Math.round(d) });
  return d;
}

export function applyStatus(g, u, kind) {
  const s = g.bal.status;
  if (kind === 'burn') u.burn = s.burn.dur;
  else if (kind === 'slow') u.slow = s.slow.dur;
  else if (kind === 'stun') u.stun = Math.max(u.stun, s.stun.dur);
}
