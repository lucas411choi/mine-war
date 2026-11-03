/** Persistent user settings (localStorage) + automatic quality detection. */
const KEY = 'minewar.settings.v1';
export const DEFAULTS = { sound: 0.7, music: true, quality: 'auto', ratio: '1-2-1', lang: 'ko', tutorialDone: false, name: '' };

function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
export const settings = { ...DEFAULTS, ...load() };
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ } }

export function isMobile() {
  return (window.matchMedia && matchMedia('(pointer:coarse)').matches) || /Android|iPhone|iPad/i.test(navigator.userAgent);
}
/** Default quality by device class; the stage can still downgrade at runtime if FPS is low. */
export function autoQuality() {
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  if (isMobile()) return cores >= 8 && mem >= 6 ? 'med' : 'low';
  return cores >= 8 ? 'high' : 'med';
}
export function effectiveQuality() { return settings.quality === 'auto' ? autoQuality() : settings.quality; }
