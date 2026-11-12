export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

/** "3h ago", "12d ago" or a date for older timestamps. */
export function ago(iso?: string | null): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 0) return 'in ' + Math.ceil(-s / 86400) + 'd';
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 45) return Math.floor(s / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Seconds as "4m 07s". */
export function dur(sec?: number | null): string {
  if (sec == null) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}

/** Deterministic pseudo-random numbers (mulberry32), used by the demo data. */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)];
export const hash = (s: string): number => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
};
export const slug = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 34).replace(/-$/, '');
export const hex = (r: () => number, n: number) =>
  Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const byDate =
  <T,>(k: keyof T) =>
  (a: T, b: T) =>
    new Date(b[k] as unknown as string).getTime() - new Date(a[k] as unknown as string).getTime();
export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const initials = (n?: string) =>
  String(n || '?')
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
export const today = () => new Date().toISOString().slice(0, 10);
export const countWords = (s: string) =>
  (String(s).replace(/```[\s\S]*?```/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 220));
export const plural = (n: number, word: string, many = word + 's') => `${n} ${n === 1 ? word : many}`;
