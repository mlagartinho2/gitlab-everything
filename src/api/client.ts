import { useSyncExternalStore } from 'react';
import { connection, type Connection } from './connection';
import { mockRequest } from './mock/router';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

export interface RawResponse<T = unknown> {
  status: number;
  data: T;
  /** x-next-page header, used for pagination. */
  next: string | null;
  /** x-total header when GitLab sends it. */
  total: string | null;
  ms: number;
}

/** Turns a GitLab error response into a sentence the user can act on. */
export function explain(status: number, data: unknown): string {
  const d = data as { message?: unknown; error?: unknown } | null;
  const m = d && (d.message ?? d.error);
  const msg = typeof m === 'string' ? m : m ? JSON.stringify(m) : '';
  if (status === 401) return 'GitLab rejected the token. Check that it is valid, not expired, and has the read_api scope.';
  if (status === 403) return 'The token does not have permission for this call. Writes such as creating issues need the api scope.' + (msg ? ` (${msg})` : '');
  if (status === 404) return msg || 'Not found. Check the group path and that the token can see it.';
  return msg || `Request failed with status ${status}.`;
}

/* ---- call log, shown in the API explorer ---- */
export interface LoggedCall { method: string; path: string; status: number; ms: number; at: number }
let log: LoggedCall[] = [];
const logListeners = new Set<() => void>();
function record(entry: LoggedCall) {
  log = [entry, ...log].slice(0, 80);
  logListeners.forEach((l) => l());
}
export const callLog = {
  get: () => log,
  clear() { log = []; logListeners.forEach((l) => l()); },
  subscribe(l: () => void) { logListeners.add(l); return () => logListeners.delete(l); },
};
export const useCallLog = () => useSyncExternalStore(callLog.subscribe, callLog.get);

export const apiBase = (c: Connection = connection.get()) => c.base.replace(/\/+$/, '') + '/api/v4';

async function liveRequest(method: string, path: string, body: unknown, c: Connection): Promise<Omit<RawResponse, 'ms'>> {
  let res: Response;
  try {
    res = await fetch(apiBase(c) + path, {
      method,
      headers: { 'PRIVATE-TOKEN': c.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Could not reach ${c.base}. Check the URL, your network, and that the instance allows cross-origin requests (see the README for the development proxy).`);
  }
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : ''; } catch { data = text; }
  return { status: res.status, data, next: res.headers.get('x-next-page') || null, total: res.headers.get('x-total') };
}

/** One request against the current connection (demo or live). Never throws on HTTP errors. */
export async function request<T = unknown>(method: string, path: string, body?: unknown, c: Connection = connection.get()): Promise<RawResponse<T>> {
  const t0 = performance.now();
  const r = c.mode === 'demo' ? await mockRequest(method, path, body) : await liveRequest(method, path, body, c);
  const ms = Math.round(performance.now() - t0);
  record({ method, path, status: r.status, ms, at: Date.now() });
  return { ...(r as Omit<RawResponse<T>, 'ms'>), ms };
}

/** GET that throws ApiError on failure. */
export async function get<T>(path: string): Promise<T> {
  const r = await request<T>('GET', path);
  if (r.status >= 400) throw new ApiError(r.status, explain(r.status, r.data), r.data);
  return r.data;
}

/** GET every page (100 per page) up to maxPages, following x-next-page. */
export async function getAll<T>(path: string, maxPages = 4): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  let out: T[] = [];
  let page = 1;
  while (page && page <= maxPages) {
    const r = await request<T[]>('GET', `${path}${sep}per_page=100&page=${page}`);
    if (r.status >= 400) throw new ApiError(r.status, explain(r.status, r.data), r.data);
    out = out.concat(r.data);
    page = r.next ? Number(r.next) : 0;
  }
  return out;
}

/** POST, PUT or DELETE that throws ApiError on failure. Callers invalidate the query cache. */
export async function write<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const r = await request<T>(method, path, body);
  if (r.status >= 400) throw new ApiError(r.status, explain(r.status, r.data), r.data);
  return r.data;
}

/** Multipart upload (wiki attachments). In demo mode the file stays in this browser tab. */
export async function upload<T>(path: string, file: File): Promise<T> {
  const c = connection.get();
  const t0 = performance.now();
  const fd = new FormData();
  fd.append('file', file, file.name);
  let res: Response;
  try {
    res = await fetch(apiBase(c) + path, { method: 'POST', headers: { 'PRIVATE-TOKEN': c.token }, body: fd });
  } catch {
    throw new ApiError(0, `Could not reach GitLab to upload ${file.name}.`);
  }
  const data = await res.json().catch(() => ({}));
  record({ method: 'POST', path, status: res.status, ms: Math.round(performance.now() - t0), at: Date.now() });
  if (!res.ok) throw new ApiError(res.status, explain(res.status, data), data);
  return data as T;
}

export const enc = encodeURIComponent;
export const groupPath = (id: number | string) => `/groups/${enc(String(id))}`;
