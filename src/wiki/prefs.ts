import { useSyncExternalStore } from 'react';

/** Per-browser display preferences for the wiki workspace. Kept in localStorage when available. */
export interface WikiPrefs {
  view: 'write' | 'split' | 'preview' | 'changes';
  side: '' | 'outline' | 'checks' | 'keys';
  navOpen: boolean;
  wide: boolean;
  wrap: boolean;
  lineNumbers: boolean;
  syncScroll: boolean;
  renderer: 'portal' | 'gitlab';
}
const KEY = 'gle-wiki-prefs';
const defaults: WikiPrefs = { view: 'split', side: '', navOpen: true, wide: true, wrap: true, lineNumbers: true, syncScroll: true, renderer: 'portal' };
let prefs: WikiPrefs = (() => {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return defaults; }
})();
const listeners = new Set<() => void>();

export const wikiPrefs = {
  get: () => prefs,
  set(p: Partial<WikiPrefs>) {
    prefs = { ...prefs, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
};
export const useWikiPrefs = () => useSyncExternalStore(wikiPrefs.subscribe, wikiPrefs.get);

/** Files uploaded in demo mode live only in this tab, as object URLs keyed by their uploads/ path. */
export const demoUploads = new Map<string, string>();
