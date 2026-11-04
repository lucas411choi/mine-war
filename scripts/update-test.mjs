// Verification of the "update" requirements against shared code + balance.json (no browser needed).
// Run: node scripts/update-test.mjs
import fs from 'node:fs';
import { Game } from '../shared/sim/game.js';
import { spawnUnit } from '../shared/sim/units.js';
import { sortedIds, priceOf, calcIncome } from '../shared/sim/economy.js';
import { atkMult, defMult } from '../shared/sim/combat.js';
import { AIPlayer } from '../shared/sim/ai.js';
import { GAME_VERSION } from '../shared/protocol.js';

const bal = JSON.parse(fs.readFileSync(new URL('../shared/balance.json', import.meta.url), 'utf8'));
let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

function battle(seed = 1) { // a started battle with both towers far from the test area
  const g = new Game(bal, { seed });
  g.command(0, { c: 'ready' }); g.command(1, { c: 'ready' }); g.step();
  return g;
}
const place = (g, side, id, x, z = 0) => { const u = spawnUnit(g, side, id); u.x = u.px = x; u.z = u.pz = z; u.cd = 0.05; return u; };

// 2. ordering ------------------------------------------------------------
const names = (team) => sortedIds(bal, team).join(' > ');
ok('2a war order tim>kelly>kimmy>galion>sammy', names('war') === 'tim > kelly > kimmy > galion > sammy', names('war'));
ok('2b mine order jack>robinson>gary>teammine', names('mine') === 'jack > robinson > gary > teammine', names('mine'));
ok('2c craft order sam>bill>ezra (tie keeps balance.json order)', names('craft') === 'sam > bill > ezra', names('craft'));
{ const p = { bought: { kimmy: 10, kelly: 0 } }; // re-hire growth must not reorder
  ok('2d order is by BASE price (price growth does not reorder)', priceOf(bal, p.bought, 'kimmy') > 300 && sortedIds(bal, 'war').indexOf('kelly') < sortedIds(bal, 'war').indexOf('kimmy')); }

// 3. balance numbers --------------------------------------------------------
const gal = bal.chars.galion, kel = bal.chars.kelly;
ok('3a galion hp 720', gal.hp === 720);
ok('3b galion range = 4.5 x 1.6 = 7.2 and < kelly range (cap 90% of kelly)', near(gal.range, 7.2) && gal.range < kel.range && gal.range <= kel.range * 0.9, `${gal.range} vs kelly ${kel.range}`);
ok('3c galion can hit air', gal.canHitAir === true);
ok('4a teammine cost 1300, income 24', bal.chars.teammine.cost === 1300 && bal.chars.teammine.income === 24);
ok('4b teammine re-hire price grows from 1300 (x1.08)', priceOf(bal, { teammine: 1 }, 'teammine') === Math.round(1300 * 1.08));
{
  const g = battle(); g.players[0].owned.sam = 5; g.players[1].owned.bill = 5;
  ok('5a sam 5 stacks = +35% attack', near(atkMult(g, 0), 1.35), String(atkMult(g, 0)));
  ok('5b bill 5 stacks = -35% damage taken', near(defMult(g, 1), 0.65), String(defMult(g, 1)));
  g.players[0].owned.sam = 9; ok('5c sam stack cap holds at maxStacks', near(atkMult(g, 0), 1 + bal.chars.sam.perStack * bal.chars.sam.maxStacks));
  ok('5d perStack/maxStacks live in balance.json', bal.chars.sam.perStack === 0.07 && bal.chars.sam.maxStacks === 5 && bal.chars.bill.perStack === 0.07 && bal.chars.bill.maxStacks === 5);
  // real damage: tim hits tim
  const a = place(g, 0, 'tim', -2), b = place(g, 1, 'tim', -0.6); g.drainEvents(); g.players[0].owned.sam = 5; g.players[1].owned.bill = 5;
  for (let i = 0; i < 40; i++) { g.step(); const h = g.drainEvents().find((e) => e.e === 'hit' && e.id === b.id); if (h) { ok('5e live hit = 12 x1.35 x0.65', h.d === Math.round(12 * 1.35 * 0.65), 'dmg ' + h.d); break; } }
}

// 3d/6 sudden death ---------------------------------------------------------
{
  const g = battle(3); g.setTower?.(0, 'vein'); // vein: +15% income -> multiplicative with +30%
  g.players[0].owned.jack = 4; g.players[1].owned.jack = 4;
  g.players[0].income = calcIncome(g, 0); g.players[1].income = calcIncome(g, 1);
  const before = [g.players[0].income, g.players[1].income];
  const a = place(g, 0, 'tim', -2), b = place(g, 1, 'tim', -0.6); g.drainEvents();
  g.timeLeft = bal.suddenDeath.seconds + 0.2;
  for (let i = 0; i < 6; i++) g.step();
  const ev = g.drainEvents();
  ok('6a sudden death starts (event sd) and flag set', ev.some((e) => e.e === 'sd') && g.sudden === true);
  ok('6b damage bonus +30%', near(g.sdMult, 1 + bal.suddenDeath.damageBonus) && bal.suddenDeath.damageBonus === 0.3);
  const after = [g.players[0].income, g.players[1].income], k = 1 + bal.suddenDeath.incomeBonus;
  ok('6c income x1.3 for BOTH players (vein tower x1.15 multiplies)', near(after[0], before[0] * k, 1e-6) && near(after[1], before[1] * k, 1e-6), `${before.map((x) => x.toFixed(2))} -> ${after.map((x) => x.toFixed(2))}`);
  let h = null; for (let i = 0; i < 60 && !h; i++) { g.step(); h = g.drainEvents().find((e) => e.e === 'hit' && (e.id === a.id || e.id === b.id)); } // first hit AFTER sudden death began
  ok('6d unit attack damage scaled (12 x1.3 = 16)', h && h.d === Math.round(12 * 1.3), h ? 'dmg ' + h.d : 'no hit');
  // snapshot carries the increased income (what the HUD / mine panel shows)
  const { packSnapshot, newView } = await import('../shared/snapshot.js');
  const snap = packSnapshot(g, newView(), 0, [], true);
  ok('6e snapshot income reflects sudden-death bonus', near(snap.p[0][1], +after[0].toFixed(2), 0.011), String(snap.p[0][1]));
  // tower + magic + burn use the same multiplier
  const g2 = battle(4); g2.timeLeft = bal.suddenDeath.seconds - 1; g2.step(); g2.drainEvents();
  const v = place(g2, 1, 'tim', -22); g2.towers[0].cd = 0; let td = 0;
  for (let i = 0; i < 4 && !td; i++) { g2.step(); const e = g2.drainEvents().find((x) => x.e === 'hit' && x.id === v.id); if (e) td = e.d; }
  ok('6f tower attack scaled (crystal 26 x1.3 = 34)', td === Math.round(bal.towers.crystal.atk * 1.3), 'dmg ' + td);
  const g3 = battle(5); g3.timeLeft = bal.suddenDeath.seconds - 1; g3.step();
  const mt = place(g3, 1, 'tim', 0); g3.players[0].owned.ezra = 1; g3.drainEvents();
  g3.spells.push({ side: 0, kind: 'fire', x: 0, z: 0, r: 4, t: 0.01, mult: 1 }); g3.step();
  const sp = g3.drainEvents().find((x) => x.e === 'hit' && x.id === mt.id);
  ok('6g mage spell scaled (fire 80 x1.3 = 104)', sp && sp.d === Math.round(bal.magic.fire.dmg * 1.3), sp ? 'dmg ' + sp.d : 'none');
  const g4 = battle(6); g4.timeLeft = bal.suddenDeath.seconds - 1; g4.step(); const bu = place(g4, 1, 'galion', 0); bu.burn = 4; g4.drainEvents();
  let bd = 0; for (let i = 0; i < 80 && !bd; i++) { g4.step(); const e = g4.drainEvents().find((x) => x.e === 'hit' && x.id === bu.id); if (e) bd = e.d; }
  // burn accumulates dps*dt until >= 14 (one tick may slightly overshoot) -> 14..14.7 raw, x1.3 = 18..19
  ok('6h burn DoT scaled by +30% (14..14.7 raw -> 18..19)', bd >= Math.round(14 * 1.3) && bd <= Math.round(14.7 * 1.3), 'tick ' + bd);
}

// 3c galion: long range, air targeting, splash also hits air ---------------------
{
  const g = battle(7); const gl = place(g, 0, 'galion', -3), sam = place(g, 1, 'sammy', 3.4, 0); g.drainEvents();
  let first = null, hitAir = false;
  for (let i = 0; i < 80 && !first; i++) { g.step(); for (const e of g.drainEvents()) { if (e.e === 'atk' && e.u === gl.id && !first) first = e; if (e.e === 'hit' && e.id === sam.id) hitAir = true; } }
  ok('3d galion fires at an air unit from > old range 4.5', first && first.a === 1 && Math.hypot(first.tx - first.x, first.tz - first.z) > 4.6, first ? `dist ${Math.hypot(first.tx - first.x, first.tz - first.z).toFixed(2)}` : 'no shot');
  ok('3e galion shell damages Sammy', hitAir);
  const g2 = battle(8); const gl2 = place(g2, 0, 'galion', -3), t2 = place(g2, 1, 'tim', 3.5, 0), s2 = place(g2, 1, 'sammy', 3.5, 1.6); g2.drainEvents();
  let splashAir = false, tg = false;
  for (let i = 0; i < 60 && !splashAir; i++) { g2.step(); for (const e of g2.drainEvents()) { if (e.e === 'hit' && e.id === t2.id) tg = true; if (e.e === 'hit' && e.id === s2.id && tg) splashAir = true; } }
  ok('3f splash from a ground target also damages air units nearby', splashAir);
}

// 8. all four towers hit Sammy --------------------------------------------------
for (const type of Object.keys(bal.towers)) {
  const g = battle(9); g.setTower(0, type); g.towers[0].cd = 0;
  const sm = place(g, 1, 'sammy', g.towers[0].x + Math.min(8, bal.towers[type].range - 1)); sm.hp = sm.maxHp = 1e5; g.drainEvents();
  let shots = 0, dmg = false;
  for (let i = 0; i < 90; i++) { g.step(); for (const e of g.drainEvents()) { if (e.e === 'twatk' && e.s === 0 && e.a === 1) shots++; if (e.e === 'hit' && e.id === sm.id) dmg = true; } }
  ok(`8 tower ${type} attacks Sammy (canHitAir=${bal.towers[type].canHitAir})`, shots > 0 && dmg && bal.towers[type].canHitAir === true, `air shots ${shots}`);
}
{ // flame splash reaches a second air unit
  const g = battle(10); g.setTower(0, 'flame'); g.towers[0].cd = 0;
  const s1 = place(g, 1, 'sammy', g.towers[0].x + 6), s2 = place(g, 1, 'sammy', g.towers[0].x + 7, 1); s1.hp = s1.maxHp = s2.hp = s2.maxHp = 1e5; g.drainEvents();
  const hurt = new Set(); for (let i = 0; i < 30; i++) { g.step(); for (const e of g.drainEvents()) if (e.e === 'hit' && (e.id === s1.id || e.id === s2.id)) hurt.add(e.id); }
  ok('8b flame splash damages both air units', hurt.size === 2);
}
{ // Sammy still cannot be hit by melee units
  const g = battle(11); const sm = place(g, 1, 'sammy', 0), tm = place(g, 0, 'tim', -1.5), km = place(g, 0, 'kimmy', -1.8); g.drainEvents();
  sm.atk = 0; let meleeHit = false; for (let i = 0; i < 40; i++) { g.step(); for (const e of g.drainEvents()) if (e.e === 'atk' && (e.u === tm.id || e.u === km.id) && e.a === 1) meleeHit = true; }
  ok('8c melee units still cannot attack Sammy', !meleeHit);
}

// AI sees the new rules ----------------------------------------------------------
{
  const g = new Game(bal, { seed: 21 }), ai = new AIPlayer(g, 0, 'hard', 3), ai2 = new AIPlayer(g, 1, 'normal', 4);
  let n = 0; while (g.phase !== 'over' && n < 16000) { ai.update(0.05); ai2.update(0.05); g.step(); g.drainEvents(); n++; }
  ok('AI plays a full match with new rules (sudden death reached: ' + (g.sudden || g.overtime) + ')', g.phase === 'over', `${(n / 20) | 0}s winner ${g.result.winner} by ${g.result.reason}`);
  const bought = g.players[0].bought.teammine + g.players[1].bought.teammine;
  console.log('INFO teammine bought by AIs this match:', bought, '| sammy bought:', g.players[0].bought.sammy + g.players[1].bought.sammy);
}


// AI picks mining tiers by price/income payback, so Team Mine's lower price is reflected automatically
{
  const pick = (cost, timeLeft) => {
    const b2 = JSON.parse(JSON.stringify(bal)); b2.chars.teammine.cost = cost;
    const g = new Game(b2, { seed: 31 }); g.command(0, { c: 'ready' }); g.command(1, { c: 'ready' }); g.step();
    const ai = new AIPlayer(g, 0, 'hard', 1); const p = g.players[0];
    p.money = 3000; p.income = 24; p.owned.jack = p.owned.robinson = p.owned.gary = 3; g.timeLeft = timeLeft;
    return ai.pickMine();
  };
  ok('AI: with the new price 1300 it buys Team Mine when payback (54s) fits the remaining time (120s)', pick(1300, 120) === 'teammine', String(pick(1300, 120)));
  ok('AI: with the old price 1800 the same situation is rejected (payback 75s)', pick(1800, 120) !== 'teammine', String(pick(1800, 120)));
}

// version constant ---------------------------------------------------------------
ok('GAME_VERSION defined', typeof GAME_VERSION === 'string' && GAME_VERSION.length > 0, GAME_VERSION);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
