/**
 * WebAudio synthesized sound effects + tiny procedural background music (no audio files).
 * Browsers block audio until a user gesture, so call audio.unlock() from the first touch/click.
 */
import { settings } from './config/settings.js';

let ctx = null, master = null, musicGain = null, musicTimer = null, noiseBuf = null;
const last = {};

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = settings.sound; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.18; musicGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function tone(o) {
  const t0 = ctx.currentTime + (o.delay || 0);
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime((o.vol || 0.3), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g); g.connect(o.dest || master);
  osc.start(t0); osc.stop(t0 + o.dur + 0.05);
}
function noise(o) {
  const t0 = ctx.currentTime + (o.delay || 0);
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = o.ft || 'lowpass';
  f.frequency.setValueAtTime(o.f || 1200, t0);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.vol || 0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + o.dur + 0.05);
}

const SFX = {
  click: () => tone({ f: 600, f2: 400, dur: 0.06, type: 'square', vol: 0.12 }),
  hire: () => { tone({ f: 520, dur: 0.09, type: 'triangle', vol: 0.25 }); tone({ f: 780, dur: 0.14, type: 'triangle', vol: 0.25, delay: 0.07 }); },
  coin: () => { tone({ f: 1320, dur: 0.07, type: 'square', vol: 0.08 }); tone({ f: 1760, dur: 0.12, type: 'square', vol: 0.08, delay: 0.05 }); },
  error: () => tone({ f: 160, f2: 110, dur: 0.18, type: 'sawtooth', vol: 0.2 }),
  pick: () => { noise({ dur: 0.07, f: 3000, ft: 'highpass', vol: 0.18 }); tone({ f: 900, f2: 500, dur: 0.05, type: 'square', vol: 0.08 }); },
  drill: () => { noise({ dur: 0.25, f: 700, vol: 0.18 }); tone({ f: 90, f2: 70, dur: 0.25, type: 'sawtooth', vol: 0.1 }); },
  boom: () => { noise({ dur: 0.6, f: 900, f2: 80, vol: 0.5 }); tone({ f: 90, f2: 30, dur: 0.5, type: 'sine', vol: 0.5 }); },
  sword: () => { noise({ dur: 0.1, f: 2500, f2: 6000, ft: 'bandpass', vol: 0.15 }); tone({ f: 1400, f2: 700, dur: 0.08, type: 'triangle', vol: 0.06 }); },
  arrow: () => { noise({ dur: 0.12, f: 1800, f2: 5000, ft: 'bandpass', vol: 0.1 }); },
  cannon: () => { noise({ dur: 0.35, f: 700, f2: 120, vol: 0.4 }); tone({ f: 120, f2: 50, dur: 0.3, vol: 0.35 }); },
  air: () => { noise({ dur: 0.09, f: 3500, ft: 'highpass', vol: 0.12 }); tone({ f: 700, f2: 300, dur: 0.07, type: 'square', vol: 0.07 }); },
  twatk: () => { tone({ f: 900, f2: 1500, dur: 0.15, type: 'sine', vol: 0.12 }); },
  fire: () => { noise({ dur: 0.7, f: 600, f2: 3000, vol: 0.35 }); tone({ f: 200, f2: 80, dur: 0.6, type: 'sawtooth', vol: 0.12 }); },
  water: () => { noise({ dur: 0.6, f: 800, f2: 2500, ft: 'bandpass', vol: 0.3 }); tone({ f: 500, f2: 900, dur: 0.4, vol: 0.1 }); },
  zap: () => { noise({ dur: 0.35, f: 4000, f2: 400, ft: 'highpass', vol: 0.4 }); tone({ f: 1800, f2: 200, dur: 0.3, type: 'sawtooth', vol: 0.15 }); },
  warn: () => { tone({ f: 330, dur: 0.25, type: 'triangle', vol: 0.15 }); tone({ f: 440, dur: 0.25, type: 'triangle', vol: 0.15, delay: 0.25 }); },
  die: () => { noise({ dur: 0.18, f: 500, f2: 100, vol: 0.2 }); },
  towerHit: () => { noise({ dur: 0.12, f: 400, f2: 150, vol: 0.2 }); },
  towerFall: () => { noise({ dur: 2.2, f: 700, f2: 40, vol: 0.7 }); tone({ f: 70, f2: 20, dur: 2, vol: 0.6 }); },
  horn: () => { tone({ f: 196, dur: 0.7, type: 'sawtooth', vol: 0.2 }); tone({ f: 294, dur: 0.7, type: 'sawtooth', vol: 0.15, delay: 0.1 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.25, type: 'triangle', vol: 0.25, delay: i * 0.15 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone({ f, dur: 0.3, type: 'triangle', vol: 0.22, delay: i * 0.18 })),
};

const MIN_GAP = { pick: 60, sword: 50, arrow: 50, air: 60, die: 60, towerHit: 120, coin: 80, twatk: 100, cannon: 100 };

export const audio = {
  /** Call from a user gesture (touchstart/click). Safe to call repeatedly. */
  unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (settings.music) this.startMusic();
  },
  setVolume(v) { settings.sound = v; if (master) master.gain.value = v; },
  setMusic(on) { settings.music = on; if (on) this.startMusic(); else this.stopMusic(); },
  play(name, vol = 1) {
    if (!ctx || ctx.state !== 'running' || settings.sound <= 0 || !SFX[name]) return;
    const now = performance.now();
    if (last[name] && now - last[name] < (MIN_GAP[name] || 0)) return;
    last[name] = now;
    try { SFX[name](vol); } catch { /* ignore audio errors */ }
  },
  startMusic() {
    if (!ctx || musicTimer) return;
    const scale = [110, 130.8, 146.8, 164.8, 196, 220, 261.6];
    let step = 0;
    musicTimer = setInterval(() => {
      if (ctx.state !== 'running' || !settings.music) return;
      const root = scale[[0, 0, 3, 2][(step >> 2) % 4]];
      if (step % 4 === 0) tone({ f: root, dur: 1.8, type: 'triangle', vol: 0.5, dest: musicGain });
      const n = scale[(step * 3 + (step >> 3)) % scale.length] * 2;
      if (step % 2 === 0) tone({ f: n, dur: 0.5, type: 'sine', vol: 0.25, dest: musicGain });
      step++;
    }, 450);
  },
  stopMusic() { clearInterval(musicTimer); musicTimer = null; },
};
