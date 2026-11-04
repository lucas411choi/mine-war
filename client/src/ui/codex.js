/**
 * Codex (도감): lists every character / tower with a rotating 3D preview and detailed stats.
 * All numbers are read from shared/balance.json at render time (nothing is typed in here), so balance edits show up
 * automatically. Works fully offline: no network access, no server.
 */
import { sortedIds } from '../../../shared/sim/economy.js';
import { t, tf } from '../config/i18n.js';
import { portrait } from './portraits.js';
import { CodexPreview } from '../render/preview.js';
import { setScreen } from './menus.js';

const $ = (s) => document.querySelector(s);
const pct = (x) => Math.round(x * 100);
const TOWER_ICON = { crystal: ['💎', '#5ad7ff'], iron: ['🛡️', '#9aa3b0'], flame: ['🔥', '#ff7a2a'], vein: ['⛏️', '#ffc933'] };

export class Codex {
  constructor(bal, { onClose }) {
    this.bal = bal; this.onClose = onClose; this.tab = 'mine'; this.sel = null; this.preview = null; this.opened = false;
    $('#codex-back').addEventListener('click', () => this.close());
    $('#codex-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) this.setTab(b.dataset.tab); });
    $('#codex-list').addEventListener('click', (e) => { const li = e.target.closest('li[data-id]'); if (li) this.select(li.dataset.id); });
    window.addEventListener('keydown', (e) => { if (this.opened && e.key === 'Escape') this.close(); });
  }

  open() {
    this.opened = true;
    // a fresh canvas each time: a canvas whose GL context was force-lost on close cannot be reused
    const old = $('#codex-canvas'), c = document.createElement('canvas'); c.id = 'codex-canvas'; old.replaceWith(c);
    setScreen('codex');
    this.setTab(this.tab, true);
    try { this.preview = new CodexPreview(c); } catch (e) { console.warn('codex preview unavailable', e); this.preview = null; }
    this.showModel();
  }

  close() {
    if (!this.opened) return;
    this.opened = false;
    if (this.preview) { this.preview.dispose(); this.preview = null; }
    this.onClose();
  }

  ids(tab = this.tab) { return tab === 'tower' ? Object.keys(this.bal.towers) : sortedIds(this.bal, tab); } // price ascending

  setTab(tab, keep) {
    this.tab = tab;
    document.querySelectorAll('#codex-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const ids = this.ids();
    $('#codex-list').innerHTML = ids.map((id) => tab === 'tower'
      ? `<li data-id="${id}"><span class="ticon" style="--c:${TOWER_ICON[id][1]}">${TOWER_ICON[id][0]}</span><div><b>${t('t_' + id)}</b><small>${t('lHp')} ${this.bal.towers[id].hp}</small></div></li>`
      : `<li data-id="${id}"><img src="${portrait(id)}" alt=""><div><b>${t('c_' + id)}</b><small>● ${this.bal.chars[id].cost}</small></div></li>`).join('');
    this.select(keep && ids.includes(this.sel) ? this.sel : ids[0]);
  }

  select(id) {
    this.sel = id;
    document.querySelectorAll('#codex-list li').forEach((li) => li.classList.toggle('on', li.dataset.id === id));
    $('#codex-info').innerHTML = this.tab === 'tower' ? this.towerInfo(id) : this.charInfo(id);
    $('#codex-detail').scrollTop = 0;
    this.showModel();
  }

  showModel() {
    if (!this.preview || !this.sel) return;
    if (this.tab === 'tower') this.preview.show('tower', this.sel);
    else this.preview.show('char', this.sel, this.bal.chars[this.sel].team);
  }

  // ------------------------------------------------------------------ content (all numbers from balance.json)
  row(label, value) { return `<div class="r"><b>${label}</b><span>${value}</span></div>`; }
  box(cls, label, body) { return `<div class="codex-box ${cls}"><b>${label}</b>${body}</div>`; }
  head(name, role, intro) { return `<h3>${name}<small>${role}</small></h3><p class="intro">${intro}</p>`; }

  charInfo(id) {
    const bal = this.bal, c = bal.chars[id], P = { ...c }, k = 'x_' + id + '_';
    const rows = [this.row(t('lPrice'), '● ' + c.cost), this.row(t('lCooldown'), c.cooldown + t('sec'))];
    let extra = '';
    if (c.team === 'mine') {
      rows.push(this.row(t('lIncome'), c.income + t('per')), this.row(t('lEff'), (c.cost / c.income).toFixed(1) + ' ' + t('effUnit')), this.row(t('lLimit'), c.max));
      extra += this.box('', t('lSpecial'), tf(k + 'special', P));
    } else if (c.team === 'war') {
      rows.push(this.row(t('lHp'), c.hp), this.row(t('lAtk'), c.atk),
        this.row(t('lAtkSpd'), (1 / c.atkCd).toFixed(2) + t('perSec') + ' (' + tf('everyN', c) + ')'),
        this.row(t('lRange'), c.range + t('m')), this.row(t('lSpeed'), c.speed + t('mps')),
        this.row(t('lTargets'), c.canHitAir ? t('groundAir') : t('groundOnly')),
        this.row(t('lSplash'), c.splash ? tf('splashYes', c) : t('no')));
      const sp = [];
      if (c.charge) sp.push(tf('spCharge', c));
      if (c.air) {
        const names = Object.keys(bal.chars).filter((x) => bal.chars[x].team === 'war' && bal.chars[x].melee && !bal.chars[x].canHitAir).map((x) => t('c_' + x)).join(', ');
        sp.push(t('spFlying'), tf('spImmune', { names }));
      }
      if (c.towerMult) sp.push(tf('spTowerMult', c));
      extra += this.box('', t('lSpecial'), sp.length ? '<ul>' + sp.map((x) => `<li>${x}</li>`).join('') + '</ul>' : t('none'));
    } else if (id === 'ezra') {
      const M = bal.magic, S = bal.status;
      rows.push(this.row(t('lLimit'), c.max), this.row(t('lCast'), M.baseInterval + t('sec')));
      const sp = [tf('spFire', { r: M.radius, d: M.fire.dmg, sec: S.burn.dur, dps: S.burn.dps }), tf('spWater', { r: M.water.radius, d: M.water.dmg, sec: S.slow.dur, slow: pct(1 - S.slow.mult) }), tf('spZap', { n: M.zap.chain, d: M.zap.dmg, sec: S.stun.dur })];
      extra += this.box('', t('lSpells'), '<ul>' + sp.map((x) => `<li>${x}</li>`).join('') + '</ul>');
      extra += this.box('', t('lCast'), tf('castRule', { base: M.baseInterval, decay: M.intervalDecay, min: M.minInterval, dmg: pct(M.dmgPerExtra) }));
    } else { // sam / bill: stackable team buffs
      const atk = id === 'sam';
      rows.push(this.row(t('lLimit'), c.maxStacks));
      extra += this.box('', t('lStack'), tf(atk ? 'stackRuleAtk' : 'stackRuleDef', { p: pct(c.perStack), m: c.maxStacks, tot: pct(c.perStack * c.maxStacks) }));
    }
    let html = this.head(t('c_' + id), t(k + 'role'), tf(k + 'intro', P)) + `<div class="codex-grid">${rows.join('')}</div>` + extra;
    html += this.box('pro', t('lPro'), t(k + 'pro')) + this.box('con', t('lCon'), t(k + 'con'));
    if (c.team === 'war') html += this.box('pro', t('lStrong'), t(k + 'strong')) + this.box('con', t('lWeak'), t(k + 'weak'));
    return html + this.box('tip', t('lTip'), t(k + 'tip'));
  }

  towerInfo(id) {
    const T = this.bal.towers[id], k = 'x_' + id + '_';
    const rows = [this.row(t('lHp'), T.hp), this.row(t('lAtk'), T.atk), this.row(t('lRange'), T.range + t('m')), this.row(t('lTCd'), T.cd + t('sec')),
      this.row(t('lAir'), T.canHitAir ? t('yes') : t('no')), this.row(t('lDr'), T.dr > 0 ? '-' + pct(T.dr) + '%' : t('none')),
      this.row(t('lIncB'), T.incomeBonus > 0 ? '+' + pct(T.incomeBonus) + '%' : t('none')),
      this.row(t('lSplash'), T.splash > 0 ? tf('splashYes', T) : t('no')),
      this.row(t('lMelee'), T.meleeBonus > 1 ? '×' + T.meleeBonus : t('none'))];
    return this.head(t('t_' + id), t(k + 'role'), t(k + 'intro')) + `<div class="codex-grid">${rows.join('')}</div>`
      + this.box('pro', t('lPro'), t(k + 'pro')) + this.box('con', t('lCon'), t(k + 'con')) + this.box('tip', t('lTip'), t(k + 'tip'));
  }
}
