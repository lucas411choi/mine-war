import { TEXTS } from './texts.js';
import { settings } from './settings.js';

/** t('key') -> text in the current language (falls back to ko, then the key itself). */
export function t(key) { return (TEXTS[settings.lang] && TEXTS[settings.lang][key]) || TEXTS.ko[key] || key; }
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.documentElement.lang = settings.lang;
  document.title = t('title');
}
