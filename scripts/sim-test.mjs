// Headless smoke test of the shared simulation: AI vs AI must finish a match.
// Run: npm run test:sim
import fs from 'node:fs';
import { Game } from '../shared/sim/game.js';
import { AIPlayer } from '../shared/sim/ai.js';

const bal = JSON.parse(fs.readFileSync(new URL('../shared/balance.json', import.meta.url), 'utf8'));
for (const [a, b] of [['easy', 'normal'], ['normal', 'hard'], ['hard', 'hard']]) {
  const g = new Game(bal, { seed: 42 }), p0 = new AIPlayer(g, 0, a, 1), p1 = new AIPlayer(g, 1, b, 2);
  let n = 0;
  while (g.phase !== 'over' && n < 20 * 800) { p0.update(0.05); p1.update(0.05); g.step(); g.drainEvents(); n++; }
  console.log(`${a} vs ${b}: winner side ${g.result.winner} by ${g.result.reason} after ${(n / 20).toFixed(0)}s`);
  if (g.phase !== 'over') { console.error('match did not finish'); process.exit(1); }
}
