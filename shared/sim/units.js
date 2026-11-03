/**
 * Unit module: spawning, targeting, movement and attacking.
 * Units advance along the lane, attack enemy units first, then the enemy tower.
 */
import { hurtUnit, hurtTower } from './combat.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function spawnUnit(g, side, id) {
  const m = g.bal.map, def = g.bal.chars[id], dir = side === 0 ? 1 : -1;
  const x = -dir * (m.towerX - m.spawnOffset);
  const z = (g.rng() * 2 - 1) * m.laneHalfWidth * 0.8;
  const u = {
    id: g.nextId++, side, type: id, x, z, px: x, pz: z, hp: def.hp, maxHp: def.hp, air: !!def.air,
    st: 0, burn: 0, slow: 0, stun: 0, burnAcc: 0, cd: 0.3 + g.rng() * 0.3, tgt: 0,
    chargeReady: !!def.charge, chargeT: 0, dealt: 0, dead: false,
  };
  g.units.push(u);
  g.players[side].unitCount++;
  g.emit({ e: 'spw', id: u.id, ty: id, s: side, x: r1(x), z: r1(z) });
  return u;
}

function strikeUnit(g, u, def, tgt) {
  let base = def.atk;
  if (def.charge && u.chargeReady) { base *= def.charge; u.chargeReady = false; u.chargeT = 0; }
  g.emit({ e: 'atk', u: u.id, k: def.fx, x: r1(u.x), z: r1(u.z), tx: r1(tgt.x), tz: r1(tgt.z), a: tgt.air ? 1 : 0 });
  if (def.splash) {
    for (const o of g.units) {
      if (o.dead || o.side === u.side || o === tgt || o.air) continue;
      if (Math.hypot(o.x - tgt.x, o.z - tgt.z) <= def.splash) hurtUnit(g, u.side, o, base * 0.6, u, false);
    }
  }
  hurtUnit(g, u.side, tgt, base, u, false);
}

function strikeTower(g, u, def) {
  const tw = g.towers[1 - u.side];
  g.emit({ e: 'atk', u: u.id, k: def.fx, x: r1(u.x), z: r1(u.z), tx: tw.x, tz: 0, a: 0, tw: 1 });
  hurtTower(g, u.side, def.atk * (def.towerMult || 1), u, false);
}

export function stepUnits(g, dt) {
  const bal = g.bal, lane = bal.map.laneHalfWidth, R = bal.map.towerRadius;
  const byId = new Map();
  for (const u of g.units) { u.px = u.x; u.pz = u.z; byId.set(u.id, u); }

  for (const u of g.units) {
    if (u.dead) continue;
    const def = bal.chars[u.type];
    if (u.burn > 0) {
      u.burn -= dt; u.burnAcc += bal.status.burn.dps * dt;
      if (u.burnAcc >= 14) { const a = u.burnAcc; u.burnAcc = 0; hurtUnit(g, 1 - u.side, u, a, null, true); if (u.dead) continue; }
    }
    if (u.slow > 0) u.slow -= dt;
    if (u.stun > 0) { u.stun -= dt; u.st = 0; continue; }
    if (u.cd > 0) u.cd -= dt;

    // --- targeting: keep current target while valid, else nearest enemy in sight
    const sight = Math.max(def.range + 3, 7);
    let tgt = u.tgt ? byId.get(u.tgt) : null;
    if (tgt && (tgt.dead || Math.hypot(tgt.x - u.x, tgt.z - u.z) > sight * 1.4)) tgt = null;
    if (!tgt) {
      let bd = sight;
      for (const e of g.units) {
        if (e.side === u.side || e.dead || (e.air && !def.canHitAir)) continue;
        const d = Math.hypot(e.x - u.x, e.z - u.z);
        if (d < bd) { bd = d; tgt = e; }
      }
    }
    u.tgt = tgt ? tgt.id : 0;

    const tw = g.towers[1 - u.side];
    let tx, tz, d, inRange;
    if (tgt) { tx = tgt.x; tz = tgt.z; d = Math.hypot(tx - u.x, tz - u.z); inRange = d <= def.range; }
    else { tx = tw.x; tz = 0; d = Math.hypot(tx - u.x, tz - u.z); inRange = d - R <= def.range; }

    if (inRange) {
      u.st = 2;
      if (u.cd <= 0) {
        u.cd = def.atkCd;
        if (tgt) strikeUnit(g, u, def, tgt); else if (tw.hp > 0) strikeTower(g, u, def);
      }
    } else {
      u.st = 1;
      u.chargeT += dt;
      if (def.charge && u.chargeT > 2.5) u.chargeReady = true;
      const sp = def.speed * (u.slow > 0 ? bal.status.slow.mult : 1) * dt;
      const k = sp / Math.max(d, 0.001);
      u.x += (tx - u.x) * k;
      u.z += (tz - u.z) * k * 0.7;
    }
    if (u.z > lane) u.z = lane; else if (u.z < -lane) u.z = -lane;
  }

  // --- soft separation between same-layer allies
  const a = g.units;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]; if (p.dead) continue;
    for (let j = i + 1; j < a.length; j++) {
      const q = a[j];
      if (q.dead || q.air !== p.air || Math.abs(q.x - p.x) > 0.9) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d2 = dx * dx + dz * dz;
      if (d2 >= 0.64) continue;
      if (d2 < 1e-6) { p.z -= 0.2; q.z += 0.2; continue; }
      const d = Math.sqrt(d2), push = (0.8 - d) * 0.5 / d;
      p.x -= dx * push * 0.5; q.x += dx * push * 0.5; p.z -= dz * push; q.z += dz * push;
    }
  }
  for (const u of a) { if (u.z > lane) u.z = lane; else if (u.z < -lane) u.z = -lane; }
}
