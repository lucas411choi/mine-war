/**
 * App entry: screen flow (title -> [room] -> game), AI match (local), online match (Net), input -> commands,
 * game event -> sound/banner mapping, and the main animation loop.
 */
import './style.css';
import balance from '../../shared/balance.json';
import { priceOf } from '../../shared/sim/economy.js';
import { settings, saveSettings, effectiveQuality } from './config/settings.js';
import { t, tf, applyI18n } from './config/i18n.js';
import { GAME_VERSION } from '../../shared/protocol.js';
import { audio } from './audio.js';
import { Net } from './net.js';
import { LocalSession, OnlineSession } from './game/session.js';
import { Hud } from './ui/hud.js';
import * as M from './ui/menus.js';
import { Stage } from './render/stage.js';
import { Codex } from './ui/codex.js';
import { loadModelOverrides } from './render/models.js';

const $ = M.$;
let stage = null, hud = null, session = null, net = null, mode = 'title', diff = 'normal';
let pending = null;                     // online action waiting for the socket: {t:'create'} | {t:'join', code}
const online = { room: null, you: 0 };  // last room info from the server
let lastFail = 0;

// ------------------------------------------------------------------ boot
applyI18n();
M.bindModalClose();
const reloadSettingsUI = M.bindSettings(onSettingChange);
M.setScreen('title');
$('#inp-name').value = settings.name || '';
loadModelOverrides().catch(() => {});
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock());
window.addEventListener('resize', updateLayout);
updateLayout();

function updateLayout() {
  $('#app').classList.toggle('portrait', window.innerHeight > window.innerWidth);
  $('#panels').dataset.ratio = settings.ratio;
}
function setTab(tab) {
  $('#app').dataset.tab = tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
}
function onSettingChange(key) {
  if (key === 'quality' && stage) stage.applyQuality(effectiveQuality(), settings.quality === 'auto');
  if (key === 'ratio') updateLayout();
  if (key === 'lang') { if (hud) hud.rebuildTexts(); if (online.room && mode === 'room') M.renderRoom({ ...online.room, you: online.you }); }
}
function playerName() {
  let n = $('#inp-name').value.trim();
  if (!n) n = 'Player' + (100 + Math.floor(Math.random() * 900));
  settings.name = $('#inp-name').value.trim(); saveSettings();
  return n;
}

// ------------------------------------------------------------------ title screen
$('#seg-diff').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  diff = b.dataset.v; audio.play('click');
  document.querySelectorAll('#seg-diff button').forEach((x) => x.classList.toggle('on', x === b));
});
$('#btn-ai').addEventListener('click', () => { audio.play('click'); withTutorial(() => startLocal()); });
$('#btn-create').addEventListener('click', () => { audio.play('click'); goOnline({ t: 'create' }); });
$('#btn-join').addEventListener('click', joinPressed);
$('#inp-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('#inp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinPressed(); });
// codex: offline, reads balance.json only (no server needed)
const codex = new Codex(balance, { onClose: () => { mode = 'title'; M.setScreen('title'); } });
$('#btn-codex').addEventListener('click', () => { audio.play('click'); mode = 'codex'; codex.open(); });
$('#btn-refresh').addEventListener('click', () => location.reload());
function showVersionNotice() { pending = null; M.connectUI.hide(); M.openModal('modal-version'); if (net) { net.setCode(''); net.close(); } }
$('#btn-settings').addEventListener('click', () => { audio.play('click'); reloadSettingsUI(); M.openModal('modal-settings'); });
$('#btn-help').addEventListener('click', () => { audio.play('click'); M.openModal('modal-help'); });
$('#menu-settings').addEventListener('click', () => { reloadSettingsUI(); M.openModal('modal-settings'); });
function joinPressed() {
  audio.play('click');
  const code = $('#inp-code').value;
  if (code.length !== 5) return M.toast(t('BAD_CODE'));
  goOnline({ t: 'join', code });
}
function withTutorial(next) { if (settings.tutorialDone) next(); else M.startTutorial(next); }

// ------------------------------------------------------------------ in-game UI
document.querySelector('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { audio.play('click'); setTab(b.dataset.tab); } });
for (const id of ['panel-mine', 'panel-craft']) {
  let sx = 0;
  const el = document.getElementById(id);
  el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 70) setTab(dx < 0 ? 'craft' : 'mine'); }, { passive: true });
}
$('#btn-menu').addEventListener('click', () => { if (session && session.mode === 'local') session.paused = true; M.openModal('modal-menu'); });
$('#menu-resume').addEventListener('click', () => { if (session) session.paused = false; M.closeModal('modal-menu'); });
$('#menu-quit').addEventListener('click', () => { M.closeModal('modal-menu'); quitMatch(); });

const hudHandlers = {
  hire(id) {
    const v = session.view, me = v.players[session.side], c = balance.chars[id];
    const no = (err) => ({ ok: false, err });
    if (v.phase === 'over' || (v.phase === 'prep' && c.team !== 'mine')) return no('phase');
    if (c.team === 'war' ? me.unitCount >= balance.match.maxUnitsPerSide : me.owned[id] >= c.max) return no(c.team === 'war' ? 'cap' : 'max');
    if (v.phase === 'battle' && me.cd[id] > 0) return no('cd');
    if (me.money < priceOf(balance, me.bought, id)) return no('money');
    audio.play('hire');
    return session.cmd({ c: 'hire', id });
  },
  tower(id) { audio.play('click'); session.cmd({ c: 'tower', id }); },
  ready() { audio.play('click'); session.cmd({ c: 'ready' }); },
  fail(err) { audio.play('error'); const n = performance.now(); if (n - lastFail > 500) { lastFail = n; M.toast(t(err), 1400); } },
  again() { audio.play('click'); if (session.mode === 'local') startLocal(session.level); else backToRoom(); },
  lobby() { audio.play('click'); quitMatch(); },
};

function ensureStage() {
  if (stage) return true;
  try {
    const els = { mine: $('#panel-mine'), war: $('#panel-war'), craft: $('#panel-craft') };
    stage = new Stage($('#gl'), els, { sfx: (n, v) => audio.play(n, v) });
    stage.onDowngrade = (q) => M.toast('Graphics → ' + q, 1800);
    stage.applyQuality(effectiveQuality(), settings.quality === 'auto');
    hud = new Hud(balance, hudHandlers);
    return true;
  } catch (e) { console.error(e); M.toast('WebGL init failed: ' + e.message, 6000); stage = null; return false; }
}

function beginSession(s) {
  if (!ensureStage()) return false;
  session = s; mode = 'game';
  M.closeModal('modal-menu');
  M.setScreen('game'); updateLayout(); setTab('mine');
  stage.newMatch(s.side); hud.resetMatch(); stage.resize();
  return true;
}

function startLocal(level = diff) {
  const s = new LocalSession(balance, { level });
  s.names[0] = t('me');
  beginSession(s);
}

function quitMatch() {
  if (session && session.mode === 'online') { net.send({ t: 'leave' }); net.setCode(''); online.room = null; net.close(); }
  session = null; mode = 'title'; M.setScreen('title');
}

function backToRoom() {
  hud.resetMatch(); session = null;
  if (online.room) { mode = 'room'; M.setScreen('room'); M.renderRoom({ ...online.room, you: online.you }); } else { mode = 'title'; M.setScreen('title'); }
}

// ------------------------------------------------------------------ online
function ensureNet() {
  if (net) return net;
  net = new Net({
    status(state, info) { if (state !== 'open') M.connectUI.show(state, info); },
    dropped() { /* auto retry runs inside Net; overlay appears via status() */ },
    restarted() { net.setCode(''); online.room = null; M.toast(t('RESTARTED'), 4500); if (session && session.mode === 'online') session = null; mode = 'title'; M.setScreen('title'); },
    msg: onNetMsg,
  });
  return net;
}

function goOnline(action) {
  pending = action; ensureNet().connect(playerName());
  if (net.open) { sendPending(); }
}
function sendPending() {
  if (!pending) return;
  net.send({ ...pending, name: playerName() }); pending = null;
}
$('#conn-cancel').addEventListener('click', () => {
  pending = null; M.connectUI.hide();
  if (net) { if (mode === 'game') { session = null; } net.setCode(''); net.close(); }
  mode = 'title'; M.setScreen('title');
});

function onNetMsg(m) {
  switch (m.t) {
    case 'welcome':
      if (m.version !== GAME_VERSION) { showVersionNotice(); break; } // stale cached client vs new server (or the reverse)
      M.connectUI.hide();
      if (!m.resumed) { net.setCode(''); if (!pending && mode === 'title') { net.close(); break; } }
      sendPending(); break;
    case 'room':
      online.room = m; online.you = m.you; net.setCode(m.code);
      if (mode !== 'game') { mode = 'room'; M.setScreen('room'); M.renderRoom(m); }
      break;
    case 'start':
      if (m.resume && session && session.mode === 'online') break; // snapshots resume the same match
      beginSession(new OnlineSession(balance, net, { side: m.side, names: m.names }));
      break;
    case 'snap': if (session && session.mode === 'online') session.onSnap(m); break;
    case 'err':
      if (m.code === 'VERSION') { showVersionNotice(); break; }
      if (m.code === 'GAME_ERR') hudHandlers.fail(m.why || 'bad'); else M.toast(t(m.code));
      break;
    case 'left':
      if (m.stay) { M.toast(t(m.reason)); break; }
      net.setCode(''); online.room = null; net.close(); session = null; mode = 'title'; M.setScreen('title'); M.toast(t(m.reason), 4000);
      break;
    default: break;
  }
}
$('#btn-ready').addEventListener('click', () => { audio.play('click'); const me = online.room && online.room.players[online.you]; net.send({ t: 'ready', v: !(me && me.ready) }); });
$('#btn-leave').addEventListener('click', () => { audio.play('click'); net.send({ t: 'leave' }); net.setCode(''); online.room = null; net.close(); mode = 'title'; M.setScreen('title'); });
$('#btn-copy').addEventListener('click', async () => {
  const code = $('#room-code').textContent;
  try { await navigator.clipboard.writeText(code); } catch { const r = document.createRange(); r.selectNode($('#room-code')); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand?.('copy'); }
  audio.play('click'); M.toast(t('copied'), 1200);
});

// try to resume an interrupted online session (page reload within 30 s)
if (localStorage.getItem('mw.token') && localStorage.getItem('mw.code')) { ensureNet().connect(settings.name || ''); }

// ------------------------------------------------------------------ events -> sound / banners
function onGameEvents(events) {
  const my = session.side;
  for (const e of events) {
    switch (e.e) {
      case 'start': hud.banner(t('battleStart')); audio.play('horn'); break;
      case 'sd': hud.banner(tf('suddenDeath', { dmg: Math.round(balance.suddenDeath.damageBonus * 100), inc: Math.round(balance.suddenDeath.incomeBonus * 100) }), 'warn'); audio.play('warn'); break;
      case 'ot': hud.banner(t('overtime'), 'warn'); audio.play('warn'); break;
      case 'atk': audio.play(e.k === 'melee' ? 'sword' : e.k === 'arrow' ? 'arrow' : e.k === 'cannon' ? 'cannon' : 'air'); break;
      case 'twatk': audio.play('twatk'); break;
      case 'hit': if (e.tw !== undefined) audio.play('towerHit'); break;
      case 'die': audio.play('die'); break;
      case 'warn': if (e.s !== my) audio.play('warn'); break;
      case 'spell': audio.play(e.k === 'fire' ? 'fire' : e.k === 'water' ? 'water' : 'zap'); break;
      case 'twd': audio.play('towerFall'); break;
      case 'over': { const win = e.w === my; setTimeout(() => audio.play(win ? 'win' : 'lose'), 2200); break; }
      default: break;
    }
  }
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), errOnce = false;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (mode !== 'game' || !session || !stage) return;
  try {
    session.update(dt);
    const events = session.view.drainEvents();
    onGameEvents(events);
    stage.frame(dt, session, events);
    hud.update(session, now);
  } catch (e) { if (!errOnce) { errOnce = true; console.error('frame error', e); } }
}
requestAnimationFrame(loop);
