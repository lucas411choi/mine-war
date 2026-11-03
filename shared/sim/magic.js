/**
 * Magic module (Ezra the mage).
 * Every N seconds picks the densest enemy cluster, shows a warning telegraph, then casts fire / water / lightning.
 */
import { hurtUnit, applyStatus } from './combat.js';

const KINDS = ['fire', 'water', 'zap'];
const r1 = (v) => Math.round(v * 10) / 10;

export function mageInterval(bal, n) {
  const M = bal.magic;
  return Math.max(M.minInterval, M.baseInterval * Math.pow(M.intervalDecay, Math.max(0, n - 1)));
}

export function stepMagic(g, dt) {
  const M = g.bal.magic;
  for (const side of [0, 1]) {
    const p = g.players[side], n = p.owned.ezra;
    if (!n) continue;
    p.mageT -= dt;
    if (p.mageT > 0) continue;
    let best = null, bc = 0;
    for (const u of g.units) {
      if (u.side === side || u.dead) continue;
      let c = 0;
      for (const o of g.units) if (o.side === u.side && !o.dead && Math.hypot(o.x - u.x, o.z - u.z) <= M.radius) c++;
      if (c > bc) { bc = c; best = u; }
    }
    if (!best) { p.mageT = 1; continue; }
    const kind = g.rng.pick(KINDS);
    p.mageT = mageInterval(g.bal, n);
    const r = kind === 'water' ? M.water.radius : M.radius;
    g.spells.push({ side, kind, x: best.x, z: best.z, r, t: M.warnTime, mult: 1 + M.dmgPerExtra * (n - 1) });
    g.emit({ e: 'warn', s: side, k: kind, x: r1(best.x), z: r1(best.z), r, dur: M.warnTime });
  }
  for (const sp of g.spells) {
    sp.t -= dt;
    if (sp.t > 0) continue;
    sp.done = true;
    const foes = g.units.filter((u) => u.side !== sp.side && !u.dead);
    const inside = foes.filter((u) => Math.hypot(u.x - sp.x, u.z - sp.z) <= sp.r);
    const ev = { e: 'spell', k: sp.kind, s: sp.side, x: r1(sp.x), z: r1(sp.z), r: sp.r };
    if (sp.kind === 'fire') {
      for (const u of inside) { hurtUnit(g, sp.side, u, M.fire.dmg * sp.mult, null, true); applyStatus(g, u, 'burn'); }
    } else if (sp.kind === 'water') {
      for (const u of inside) { hurtUnit(g, sp.side, u, M.water.dmg * sp.mult, null, true); applyStatus(g, u, 'slow'); }
    } else {
      const pts = []; const hit = new Set();
      let cx = sp.x, cz = sp.z;
      for (let i = 0; i < M.zap.chain; i++) {
        let nb = null, bd = i === 0 ? sp.r : M.zap.chainRange;
        for (const u of foes) {
          if (hit.has(u.id) || u.dead) continue;
          const d = Math.hypot(u.x - cx, u.z - cz);
          if (d < bd) { bd = d; nb = u; }
        }
        if (!nb) break;
        hit.add(nb.id); pts.push([r1(nb.x), r1(nb.z)]);
        cx = nb.x; cz = nb.z;
        hurtUnit(g, sp.side, nb, M.zap.dmg * sp.mult, null, true);
        applyStatus(g, nb, 'stun');
      }
      ev.pts = pts.length ? pts : [[r1(sp.x), r1(sp.z)]];
    }
    g.emit(ev);
  }
  if (g.spells.some((s) => s.done)) g.spells = g.spells.filter((s) => !s.done);
}
