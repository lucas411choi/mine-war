/**
 * HUD: top bar (money, income, time, tower HP), hire buttons for the 3 panels, prep overlay (tower pick),
 * result screen and banners. Reads a session view each frame (throttled), never touches the simulation directly.
 */
import { priceOf } from '../../../shared/sim/economy.js';
import { mageInterval } from '../../../shared/sim/magic.js';
import { t } from '../config/i18n.js';
import { portrait } from './portraits.js';

const $ = (s, r = document) => r.querySelector(s);
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export class Hud {
  /** h = { hire(id)->{ok,err}, tower(id), ready(), fail(err), again(), lobby() } */
  constructor(bal, h) {
    this.bal = bal; this.h = h; this.btns = {}; this.last = 0; this.cache = {}; this.resultShown = false;
    this.el = { money: $('#hud-money'), income: $('#hud-income'), time: $('#hud-time'), phase: $('#hud-phase'), ping: $('#hud-ping'), hud: $('#hud'),
      meName: $('#hud-me-name'), foeName: $('#hud-foe-name'), hpMe: $('#hp-me'), hpFoe: $('#hp-foe'), hpMeT: $('#hp-me-txt'), hpFoeT: $('#hp-foe-txt'),
      prep: $('#prep'), confirm: $('#btn-confirm'), prepOpp: $('#prep-opp'), result: $('#result'), banner: $('#banner') };
    this.buildBars(); this.buildPrep();
    $('#btn-confirm').addEventListener('click', () => this.h.ready());
  }

  rebuildTexts() { this.buildBars(); this.buildPrep(); this.cache = {}; }

  buildBars() {
    this.btns = {};
    for (const team of ['mine', 'war', 'craft']) {
      const bar = $('#bar-' + team); bar.innerHTML = '';
      for (const id of Object.keys(this.bal.chars).filter((k) => this.bal.chars[k].team === team)) {
        const b = document.createElement('button');
        b.className = 'hire'; b.dataset.id = id; b.title = t('c_' + id + '_d');
        b.innerHTML = `<img class="portrait" src="${portrait(id)}" alt=""><span class="nm">${t('c_' + id)}</span><span class="pr"></span><span class="cnt"></span><i class="cd"></i>`;
        b.addEventListener('click', () => this.press(id, b));
        bar.appendChild(b);
        this.btns[id] = { el: b, pr: b.querySelector('.pr'), cnt: b.querySelector('.cnt'), c: this.bal.chars[id] };
      }
    }
  }

  buildPrep() {
    const box = $('#tcards'); box.innerHTML = '';
    for (const id of Object.keys(this.bal.towers)) {
      const b = document.createElement('button');
      b.className = 'tcard'; b.dataset.id = id;
      b.innerHTML = `<b>${t('t_' + id)}</b><small>${t('t_' + id + '_d')}</small>`;
      b.addEventListener('click', () => this.h.tower(id));
      box.appendChild(b);
    }
  }

  press(id, el) {
    const r = this.h.hire(id);
    el.classList.remove('shake', 'flash'); void el.offsetWidth;
    if (!r.ok) { el.classList.add('shake'); this.h.fail(r.err); } else el.classList.add('flash');
  }

  set(key, el, v) { if (this.cache[key] !== v) { this.cache[key] = v; el.textContent = v; } }
  cls(key, el, name, on) { const k = key + name; if (this.cache[k] !== on) { this.cache[k] = on; el.classList.toggle(name, on); } }

  banner(text, kind = '') {
    const b = this.el.banner; b.className = 'banner'; void b.offsetWidth;
    b.textContent = text; b.className = 'banner show ' + kind;
  }

  update(session, now) {
    if (now - this.last < 33) return;
    this.last = now;
    const v = session.view, my = session.side, me = v.players[my], foe = v.players[1 - my], bal = this.bal, E = this.el;
    this.set('money', E.money, Math.floor(me.money).toLocaleString('en-US'));
    this.set('income', E.income, '+' + me.income.toFixed(1) + t('per'));
    this.set('time', E.time, mmss(v.timeLeft));
    const sd = v.phase === 'battle' && (v.sudden || v.overtime);
    this.set('phase', E.phase, v.phase === 'prep' ? t('phaseprep') : v.overtime ? t('phaseot') : v.sudden ? t('phasesd') : t('phasebattle'));
    this.cls('hud', E.hud, 'sd', sd);
    this.set('meName', E.meName, session.names[my] || t('me'));
    this.set('foeName', E.foeName, (session.avatars ? session.avatars[1 - my] + ' ' : '') + (session.names[1 - my] || t('foe')));
    this.set('ping', E.ping, session.mode === 'online' ? t('ping') + ' ' + session.net.ping + 'ms' : '');

    const tm = v.towers[my], tf = v.towers[1 - my], prep = v.phase === 'prep';
    E.hpMe.style.width = (Math.max(0, tm.hp) / tm.maxHp) * 100 + '%';
    E.hpFoe.style.width = prep ? '100%' : (Math.max(0, tf.hp) / tf.maxHp) * 100 + '%';
    this.set('hpMeT', E.hpMeT, Math.ceil(Math.max(0, tm.hp)) + ' / ' + tm.maxHp);
    this.set('hpFoeT', E.hpFoeT, prep ? '???' : Math.ceil(Math.max(0, tf.hp)) + ' / ' + tf.maxHp);

    for (const id in this.btns) {
      const b = this.btns[id], c = b.c, owned = me.owned[id] || 0, price = priceOf(bal, me.bought, id), cd = me.cd[id] || 0;
      const maxed = c.team !== 'war' && owned >= c.max;
      const capped = c.team === 'war' && me.unitCount >= bal.match.maxUnitsPerSide;
      const locked = (prep && c.team !== 'mine') || v.phase === 'over';
      this.set('pr' + id, b.pr, maxed ? t('maxTag') : String(price));
      this.set('cnt' + id, b.cnt, owned > 0 ? '×' + owned : '');
      this.cls(id, b.el, 'poor', !maxed && me.money < price);
      this.cls(id, b.el, 'maxed', maxed || capped);
      this.cls(id, b.el, 'locked', locked);
      b.el.style.setProperty('--p', cd > 0 && !prep ? Math.min(1, cd / c.cooldown).toFixed(2) : '0');
    }
    this.set('sumMine', $('#sum-mine'), t('income') + ' ' + me.income.toFixed(1) + t('per') + (v.towers[my].type === 'vein' && !prep ? ' (+15%)' : ''));
    this.set('sumWar', $('#sum-war'), t('army') + ' ' + me.unitCount + '/' + bal.match.maxUnitsPerSide + '  ·  ' + t('foeArmy') + ' ' + foe.unitCount);
    const mg = me.owned.ezra ? mageInterval(bal, me.owned.ezra).toFixed(1) + t('sec') : '-';
    this.set('sumCraft', $('#sum-craft'), `${t('atk')} +${Math.round(bal.chars.sam.atk * 100 * me.owned.sam)}% · ${t('def')} -${Math.round(bal.chars.bill.def * 100 * me.owned.bill)}% · ${t('mage')} ${mg}`);

    // prep overlay
    E.prep.classList.toggle('hidden', !prep);
    if (prep) {
      for (const el of E.prep.querySelectorAll('.tcard')) { el.classList.toggle('on', el.dataset.id === me.towerType); el.disabled = me.ready; }
      E.confirm.disabled = me.ready;
      this.set('confirm', E.confirm, me.ready ? t('confirmed') : t('confirm'));
      this.set('prepOpp', E.prepOpp, foe.ready ? t('oppReady') : t('oppThinking'));
    }
    if (v.phase === 'over' && v.result && !this.resultShown) { this.resultShown = true; this.resultAt = now + 2600; }
    if (this.resultShown && !this.resultDone && now >= this.resultAt) { this.resultDone = true; this.showResult(session); }
  }

  resetMatch() { this.resultShown = false; this.resultDone = false; this.el.result.classList.add('hidden'); this.cache = {}; this.el.banner.className = 'banner'; }

  showResult(session) {
    const v = session.view, r = v.result, my = session.side, win = r.winner === my;
    const s = r.stats, a = s[my], b = s[1 - my];
    const mvp = (x) => (x.mvp ? `${t('c_' + x.mvp.type)} (${x.mvp.dmg})` : '-');
    const rows = [[t('stMined'), a.mined, b.mined], [t('stKills'), a.kills, b.kills], [t('stTower'), a.towerDmg, b.towerDmg], [t('stMvp'), mvp(a), mvp(b)]];
    this.el.result.innerHTML = `<div class="result-card ${win ? 'win' : 'lose'}"><h1>${win ? t('win') : t('lose')}</h1><p>${t('reason_' + r.reason)}</p>
      <table><tr><th></th><th class="me">${t('me')}</th><th class="foe">${t('foe')}</th></tr>${rows.map((x) => `<tr><td>${x[0]}</td><td class="me">${x[1]}</td><td class="foe">${x[2]}</td></tr>`).join('')}</table>
      <div class="row"><button class="btn big" id="res-again">${t('again')}</button><button class="btn" id="res-lobby">${t('lobby')}</button></div></div>`;
    this.el.result.classList.remove('hidden');
    $('#res-again').addEventListener('click', () => this.h.again());
    $('#res-lobby').addEventListener('click', () => this.h.lobby());
  }
}
