import { describe, expect, it } from 'vitest';
import { checkMarkdown } from './checks';
import { lineDiff } from './diff';
import { resolveWiki } from './paths';
import { applyTableOp, stepCell, tableAt, tableText, tsvToTable } from './tables';

const doc = (s: string) => { const l = s.split('\n'); return { get: (n: number) => l[n], last: l.length - 1 }; };

describe('tables', () => {
  const d = doc('intro\n| a | b |\n| --- | --- |\n| 1 | 2 |\nafter');
  it('finds the table around a line', () => {
    const t = tableAt(d.get, d.last, 3)!;
    expect([t.s, t.e, t.ncol, t.rows]).toEqual([1, 3, 2, [['a', 'b'], ['1', '2']]]);
    expect(tableAt(d.get, d.last, 0)).toBeNull();
  });
  it('adds columns, aligns and formats', () => {
    const t = tableAt(d.get, d.last, 3)!;
    expect(applyTableOp(t, 'colRight', 1, 0)).toEqual({ row: 1, col: 1 });
    applyTableOp(t, 'align', 1, 2, 'right');
    expect(tableText(t).lines).toEqual(['| a   |     |   b |', '| --- | --- | --: |', '| 1   |     |   2 |']);
  });
  it('refuses to delete the header row', () => {
    expect(typeof applyTableOp(tableAt(d.get, d.last, 1)!, 'delRow', 0, 0)).toBe('string');
  });
  it('adds a row when tabbing past the last cell', () => {
    const t = tableAt(d.get, d.last, 3)!;
    expect(stepCell(t, 1, 1, 1)).toEqual({ row: 2, col: 0 });
    expect(t.rows.length).toBe(3);
  });
  it('converts spreadsheet cells', () => {
    expect(tsvToTable('a\tb\n1\t2')).toBe('| a   | b   |\n| --- | --- |\n| 1   | 2   |');
  });
});

describe('checks', () => {
  it('flags broken links, missing alt text, heading jumps and open code blocks', () => {
    const out = checkMarkdown('# A\n### C\n[x](nope)\n![](a.png)\n```\ncode', { slugs: new Set(['home']) });
    expect(out.map((c) => c.severity + ':' + c.line)).toEqual(['warning:1', 'warning:2', 'warning:3', 'error:4']);
  });
});

describe('diff', () => {
  it('shows added and removed lines', () => {
    const d2 = lineDiff('a\nb\nc', 'a\nB\nc\nd');
    expect(d2.filter((x) => x.t !== ' ').map((x) => x.t + x.text)).toEqual(['+B', '-b', '+d']);
  });
});

describe('resolveWiki', () => {
  it('resolves relative links inside nested pages', () => {
    const ctx = { slugs: new Set(['runbooks/db', 'runbooks/cache', 'home']), curSlug: 'runbooks/db' };
    expect(resolveWiki(ctx, 'cache')).toMatchObject({ slug: 'runbooks/cache', exists: true });
    expect(resolveWiki(ctx, '/home#setup')).toMatchObject({ slug: 'home', anchor: 'setup', exists: true });
  });
});
