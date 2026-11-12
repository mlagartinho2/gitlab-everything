/* Markdown pipe tables as a model: find the table around a line, edit it, write it back aligned. */
import { splitRow } from '../markdown/render';

export type Align = '' | 'left' | 'center' | 'right';
export interface TableModel {
  /** First and last line (0-based) of the table in the document. */
  s: number;
  e: number;
  /** rows[0] is the header. */
  rows: string[][];
  align: Align[];
  ncol: number;
}
export type TableOp = 'rowAbove' | 'rowBelow' | 'colLeft' | 'colRight' | 'delRow' | 'delCol' | 'align' | 'format';

const parseAlign = (c: string): Align => {
  c = c.trim();
  return c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : '';
};
const strLen = (s: string) => [...s].length;

/** The table that contains line n, when the table rows start with a pipe. */
export function tableAt(line: (n: number) => string | undefined, lastLine: number, n: number): TableModel | null {
  const isRow = (l: number) => { const t = line(l); return t != null && /^\s*\|/.test(t); };
  if (!isRow(n)) return null;
  let s = n, e = n;
  while (s > 0 && isRow(s - 1)) s--;
  while (e < lastLine && isRow(e + 1)) e++;
  if (e - s < 1) return null;
  const sep = splitRow(line(s + 1)!);
  if (!sep.every((c) => /^\s*:?-+:?\s*$/.test(c))) return null;
  const rows: string[][] = [];
  for (let l = s; l <= e; l++) if (l !== s + 1) rows.push(splitRow(line(l)!).map((c) => c.trim().replace(/\|/g, '\\|')));
  const align = sep.map(parseAlign);
  const ncol = Math.max(align.length, ...rows.map((r) => r.length));
  rows.forEach((r) => { while (r.length < ncol) r.push(''); r.length = ncol; });
  while (align.length < ncol) align.push('');
  return { s, e, rows, align, ncol };
}

/** Row and column of a cursor at `ch` on document line `lineNo`. */
export function cellPos(t: TableModel, lineNo: number, lineText: string, ch: number) {
  const row = lineNo <= t.s + 1 ? 0 : lineNo - t.s - 1;
  const before = lineText.slice(0, ch).replace(/\\\|/g, '');
  return { row, col: Math.max(0, Math.min(t.ncol - 1, (before.match(/\|/g) || []).length - 1)) };
}

/** The table as aligned Markdown lines, plus where each cell's text starts. */
export function tableText(t: TableModel) {
  const w: number[] = [];
  for (let k = 0; k < t.ncol; k++) w[k] = Math.max(3, ...t.rows.map((r) => strLen(r[k] || '')));
  const lead = (s: string, k: number) => {
    const n = w[k] - strLen(s);
    return t.align[k] === 'right' ? n : t.align[k] === 'center' ? Math.floor(n / 2) : 0;
  };
  const cell = (s: string, k: number) => { const n = w[k] - strLen(s), a = lead(s, k); return ' '.repeat(a) + s + ' '.repeat(n - a); };
  const line = (r: string[]) => '| ' + r.map((c, k) => cell(c || '', k)).join(' | ') + ' |';
  const sep = '| ' + w.map((n, k) => {
    const a = t.align[k];
    return a === 'center' ? ':' + '-'.repeat(n - 2) + ':' : a === 'right' ? '-'.repeat(n - 1) + ':' : a === 'left' ? ':' + '-'.repeat(n - 1) : '-'.repeat(n);
  }).join(' | ') + ' |';
  /** Line offset inside the table and character range of a cell's text. */
  const cellRange = (row: number, col: number) => {
    const text = t.rows[row]?.[col] || '';
    let ch = 2;
    for (let k = 0; k < col; k++) ch += w[k] + 3;
    ch += lead(text, col);
    return { lineOffset: row === 0 ? 0 : row + 1, from: ch, to: ch + strLen(text) };
  };
  return { lines: [line(t.rows[0]), sep, ...t.rows.slice(1).map(line)], cellRange };
}

/** Applies an edit and returns the cell to select afterwards, or an error message. */
export function applyTableOp(t: TableModel, op: TableOp, row: number, col: number, arg?: Align): { row: number; col: number } | string {
  const blank = () => Array(t.ncol).fill('');
  switch (op) {
    case 'rowBelow': t.rows.splice(row + 1, 0, blank()); return { row: row + 1, col };
    case 'rowAbove':
      if (row === 0) { t.rows.splice(1, 0, blank()); return { row: 1, col }; }
      t.rows.splice(row, 0, blank());
      return { row, col };
    case 'colLeft':
    case 'colRight': {
      const at = op === 'colRight' ? col + 1 : col;
      t.rows.forEach((r) => r.splice(at, 0, ''));
      t.align.splice(at, 0, '');
      t.ncol++;
      return { row, col: at };
    }
    case 'delRow':
      if (row === 0) return 'The header row cannot be deleted. Select the whole table to remove it.';
      t.rows.splice(row, 1);
      return { row: Math.min(row, t.rows.length - 1), col };
    case 'delCol':
      if (t.ncol <= 1) return 'A table needs at least one column.';
      t.rows.forEach((r) => r.splice(col, 1));
      t.align.splice(col, 1);
      t.ncol--;
      return { row, col: Math.min(col, t.ncol - 1) };
    case 'align': t.align[col] = arg || ''; return { row, col };
    case 'format': return { row, col };
  }
}

/** Next or previous cell for Tab / Shift+Tab; adds a row when tabbing past the last cell. */
export function stepCell(t: TableModel, row: number, col: number, dir: 1 | -1) {
  col += dir;
  if (col >= t.ncol) { col = 0; row++; }
  if (col < 0) { col = t.ncol - 1; row--; }
  if (row < 0) { row = 0; col = 0; }
  if (row >= t.rows.length) t.rows.push(Array(t.ncol).fill(''));
  return { row, col };
}

export function newTable(cols: number, rows: number): TableModel {
  return {
    s: 0, e: 0, ncol: cols, align: Array(cols).fill(''),
    rows: [Array.from({ length: cols }, (_, k) => `Column ${k + 1}`), ...Array.from({ length: rows }, () => Array(cols).fill(''))],
  };
}

/** Cells copied from a spreadsheet (tab-separated lines) as a Markdown table. */
export function tsvToTable(text: string): string {
  const rows = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t').map((c) => c.trim().replace(/\|/g, '\\|')));
  const ncol = Math.max(...rows.map((r) => r.length));
  rows.forEach((r) => { while (r.length < ncol) r.push(''); });
  return tableText({ s: 0, e: 0, rows, align: Array(ncol).fill(''), ncol }).lines.join('\n');
}
export const looksLikeTsv = (text: string) => {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  return lines.length > 1 && lines.every((l) => l.includes('\t'));
};
