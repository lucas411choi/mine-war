import { TEXTS } from './texts.js';
import { settings } from './settings.js';

/** t('key') -> text in the current language (falls back to ko, then the key itself). */
export function t(key) { return (TEXTS[settings.lang] && TEXTS[settings.lang][key]) || TEXTS.ko[key] || key; }
/** tf('key', {n: 3}) replaces {n} placeholders (numbers always come from balance.json). */
export function tf(key, params = {}) { return t(key).replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? '')); }
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.documentElement.lang = settings.lang;
  document.title = t('title');
}
