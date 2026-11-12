import { useSyncExternalStore } from 'react';

export type Mode = 'demo' | 'live';
export interface Connection {
  /** demo: answered by the built-in sample data; live: sent to your GitLab. */
  mode: Mode;
  /** GitLab base URL such as https://gitlab.example.com, or a same-origin proxy path such as /gitlab. */
  base: string;
  /** Personal access token. Kept in memory, and in sessionStorage only when `remember` is on. */
  token: string;
  /** Path or numeric ID of the top-level group the portal is built around. */
  root: string;
  remember: boolean;
}

const KEY = 'gle-connection';
const env = import.meta.env;
const DEMO_ROOT = 'acme';

function initial(): Connection {
  const base: Connection = {
    mode: 'demo',
    base: env.VITE_GITLAB_URL || 'https://gitlab.com',
    token: '',
    root: DEMO_ROOT,
    remember: false,
  };
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && saved.mode === 'live' && saved.token) return { ...base, ...saved };
  } catch {
    /* storage unavailable */
  }
  return base;
}

let state = initial();
const listeners = new Set<() => void>();

function persist() {
  try {
    if (state.mode === 'live' && state.remember) sessionStorage.setItem(KEY, JSON.stringify(state));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

export const connection = {
  get: () => state,
  set(next: Partial<Connection>) {
    state = { ...state, ...next };
    persist();
    listeners.forEach((l) => l());
  },
  useDemo() {
    connection.set({ mode: 'demo', root: DEMO_ROOT, token: state.remember ? state.token : '' });
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Distinguishes cached data between demo and different live instances. */
  key: () => (state.mode === 'demo' ? 'demo' : `${state.base}|${state.root}`),
  defaultRoot: () => env.VITE_GITLAB_ROOT_GROUP || '',
};

export const useConnection = () => useSyncExternalStore(connection.subscribe, connection.get);
