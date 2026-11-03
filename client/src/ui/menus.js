/** Menu helpers: screen switching, toast, modals, settings panel, tutorial, room list, connecting overlay. */
import { t, applyI18n } from '../config/i18n.js';
import { settings, saveSettings } from '../config/settings.js';
import { audio } from '../audio.js';

export const $ = (s, r = document) => r.querySelector(s);

export function setScreen(name) {
  $('#app').dataset.screen = name;
  for (const s of ['title', 'room', 'game']) $('#screen-' + s).classList.toggle('hidden', s !== name);
  $('#gl').style.display = name === 'game' ? 'block' : 'none';
}

let toastTimer = 0;
export function toast(msg, ms = 2400) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export const openModal = (id) => $('#' + id).classList.remove('hidden');
export const closeModal = (id) => $('#' + id).classList.add('hidden');
export function bindModalClose() {
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { audio.play('click'); closeModal(b.dataset.close); }));
}

/** Settings modal. onChange(key) lets main apply quality / ratio / language changes. */
export function bindSettings(onChange) {
  const snd = $('#set-sound'), mus = $('#set-music'), q = $('#set-quality'), ra = $('#set-ratio'), lg = $('#set-lang');
  const load = () => { snd.value = Math.round(settings.sound * 100); mus.checked = settings.music; q.value = settings.quality; ra.value = settings.ratio; lg.value = settings.lang; };
  load();
  snd.addEventListener('input', () => { audio.setVolume(snd.value / 100); saveSettings(); });
  snd.addEventListener('change', () => audio.play('click'));
  mus.addEventListener('change', () => { audio.setMusic(mus.checked); saveSettings(); });
  q.addEventListener('change', () => { settings.quality = q.value; saveSettings(); onChange('quality'); });
  ra.addEventListener('change', () => { settings.ratio = ra.value; saveSettings(); onChange('ratio'); });
  lg.addEventListener('change', () => { settings.lang = lg.value; saveSettings(); applyI18n(); onChange('lang'); });
  return load;
}

/** 30-second tutorial: three steps explaining the three panels. */
export function startTutorial(onDone) {
  const pages = [['⛏️', 'tut1t', 'tut1'], ['⚔️', 'tut2t', 'tut2'], ['🔨', 'tut3t', 'tut3']];
  let i = 0;
  const render = () => {
    const [ic, tt, tb] = pages[i];
    $('#tut-icon').textContent = ic; $('#tut-title').textContent = t(tt); $('#tut-body').textContent = t(tb);
    $('#tut-dots').innerHTML = pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    $('#tut-next').textContent = i === pages.length - 1 ? t('tutStart') : t('tutNext');
  };
  const done = () => { closeModal('modal-tutorial'); settings.tutorialDone = true; saveSettings(); onDone && onDone(); };
  $('#tut-next').onclick = () => { audio.play('click'); if (i >= pages.length - 1) done(); else { i++; render(); } };
  $('#tut-skip').onclick = done;
  render(); openModal('modal-tutorial');
}

/** Room (waiting) screen contents. msg = {code, players:[{name, ready, connected}], you} */
export function renderRoom(msg) {
  $('#room-code').textContent = msg.code;
  $('#room-players').innerHTML = [0, 1].map((i) => {
    const p = msg.players[i];
    if (!p) return `<li class="empty">${t('waitingOpp')}</li>`;
    const tag = !p.connected ? t('disconnected') : p.ready ? t('readyTag') : t('notReady');
    return `<li class="${p.ready ? 'ok' : ''} ${p.connected ? '' : 'off'}"><b>${i === msg.you ? '★ ' : ''}${escapeHtml(p.name)}${i === msg.you ? ' (' + t('you') + ')' : ''}</b><span>${tag}</span></li>`;
  }).join('');
  const me = msg.players[msg.you];
  $('#btn-ready').textContent = me && me.ready ? t('unready') : t('ready');
  $('#btn-ready').disabled = msg.players.length < 2;
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "Waking up server..." / reconnecting overlay with elapsed timer. */
export const connectUI = {
  show(kind, info = {}) {
    $('#conn-title').textContent = t(kind === 'reconnecting' ? 'reconnecting' : 'connecting');
    $('#conn-hint').textContent = t('connectingHint');
    $('#conn-time').textContent = info.elapsed ? `${t('elapsed')} ${info.elapsed}${t('sec')}` : '';
    openModal('overlay-connect');
  },
  hide() { closeModal('overlay-connect'); },
};
