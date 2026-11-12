/* Presentational pieces of the editor: toolbar, menus, side panel, changes view, templates. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, Tag } from '../../components/ui';
import type { Heading } from '../../lib/markdown/render';
import type { Check } from '../../lib/wiki/checks';
import { lineDiff } from '../../lib/wiki/diff';
import { TEMPLATES } from '../../lib/wiki/templates';
import type { IconName } from '../../lib/icons';
import { SLASH } from './completions';

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
export const CODE_LANGS = ['bash', 'javascript', 'typescript', 'json', 'yaml', 'python', 'java', 'kotlin', 'go', 'sql', 'html', 'css', 'xml', 'diff', 'dockerfile', 'plaintext'];

/** A small menu anchored under a toolbar button. Closes on outside click or Escape. */
export function Popover({ anchor, onClose, children }: { anchor: HTMLElement; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const el = ref.current!;
    const top = r.bottom + el.offsetHeight + 8 > innerHeight ? Math.max(8, r.top - el.offsetHeight - 4) : r.bottom + 4;
    setPos({ left: Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8)), top });
  }, [anchor]);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [anchor, onClose]);
  return <div ref={ref} className="wk-pop" style={pos} onMouseDown={(e) => e.preventDefault()}>{children}</div>;
}
export function PopItem({ icon, label, hint, onPick }: { icon?: ReactNode; label: ReactNode; hint?: string; onPick: () => void }) {
  return <button className="it" onClick={onPick}><span className="ic">{icon}</span><span className="tx">{label}</span>{hint && <small>{hint}</small>}</button>;
}
export function TablePicker({ onPick }: { onPick: (cols: number, rows: number) => void }) {
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  return (
    <>
      <div className="grid-pick" onMouseLeave={() => setHover([0, 0])}>
        {Array.from({ length: 64 }, (_, k) => {
          const c = (k % 8) + 1, r = Math.floor(k / 8) + 1;
          return <i key={k} className={c <= hover[0] && r <= hover[1] ? 'on' : ''} onMouseEnter={() => setHover([c, r])} onClick={() => onPick(c, Math.max(1, r - 1))} />;
        })}
      </div>
      <div className="grid-lbl">{hover[0] ? `${hover[0]} × ${hover[1]} (header + ${Math.max(1, hover[1] - 1)} row${hover[1] - 1 === 1 ? '' : 's'})` : 'Pick a size'}</div>
    </>
  );
}

const ICON_FOR: Record<string, IconName | ReactNode> = {
  h1: <b>H1</b>, h2: <b>H2</b>, h3: <b>H3</b>, ul: 'ul', ol: 'ol', task: 'task', quote: 'quote', codeblock: 'code', table3: 'table', hr: 'hr', upload: 'image',
  pagelink: 'book', mermaid: 'diagram', sequence: 'diagram', math: 'sigma', mathInline: 'sigma', details: 'fold', note: 'issue', tip: 'bulb', important: 'shield',
  warning: 'warn', caution: 'warn', toc: 'toc', footnote: 'fn', date: 'cal', mention: 'at', issue: 'issue', mr: 'merge', emoji: 'smile', kbd: 'keys',
};
export const slashIcon = (id: string) => { const v = ICON_FOR[id]; return typeof v === 'string' ? <Icon name={v as IconName} /> : v; };
export const INSERT_ITEMS = SLASH.filter((s) => !['h1', 'h2', 'h3', 'ul', 'ol', 'task', 'quote', 'hr'].includes(s.id));

export function SidePanel({ tab, setTab, headings, checks, cursorLine, goLine }: {
  tab: 'outline' | 'checks' | 'keys'; setTab: (t: 'outline' | 'checks' | 'keys') => void; headings: Heading[]; checks: Check[]; cursorLine: number; goLine: (line: number, id?: string) => void;
}) {
  let active = -1;
  headings.forEach((h, i) => { if (h.line <= cursorLine) active = i; });
  const keys: [string, string][] = [['Bold', `${MOD} B`], ['Italic', `${MOD} I`], ['Strikethrough', `${MOD} Shift X`], ['Inline code', `${MOD} E`], ['Link', `${MOD} K`], ['Heading 1–6', `${MOD} Alt 1–6`], ['Paragraph', `${MOD} Alt 0`],
    ['Bulleted list', `${MOD} Shift 8`], ['Numbered list', `${MOD} Shift 7`], ['Task list', `${MOD} Shift 9`], ['Quote', `${MOD} Shift .`], ['Indent / outdent list', 'Tab / Shift Tab'], ['Next table cell', 'Tab'],
    ['Find', `${MOD} F`], ['Replace', `${MOD} H`], ['Select next match', `${MOD} D`], ['Add cursor', `${MOD} click`], ['Move line', 'Alt ↑ / ↓'], ['Duplicate line', `${MOD} Shift D`],
    ['Toggle preview', `${MOD} Alt P`], ['Save', `${MOD} S`], ['Insert block', '/'], ['Link to page', '[['], ['Reference issue / MR', '# / !'], ['Mention', '@'], ['Emoji', ':name']];
  return (
    <aside className="wk-side" id="wk-side">
      <div className="wk-side-tabs">
        {([['outline', 'Outline'], ['checks', `Checks (${checks.length})`], ['keys', 'Shortcuts']] as const).map(([v, l]) => (
          <button key={v} aria-pressed={tab === v} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>
      <div className="wk-side-b">
        {tab === 'outline' && (headings.length
          ? headings.map((h, i) => <button key={h.id + i} className={`ol-item${i === active ? ' on' : ''}`} style={{ paddingLeft: 14 + (h.level - 1) * 12 }} onClick={() => goLine(h.line, h.id)}>{h.text || '(empty heading)'}</button>)
          : <div className="empty"><h3>No headings yet</h3><p>Headings you write appear here so you can jump between sections.</p></div>)}
        {tab === 'checks' && (checks.length
          ? checks.map((c, i) => <button key={i} className="lint-item" onClick={() => goLine(c.line)}><span className={`lint-dot ${c.severity === 'warning' ? '' : c.severity}`} /><span>{c.message}</span><small>Line {c.line + 1}</small></button>)
          : <div className="empty"><h3>No problems found</h3><p>Links, images, headings, tables and code blocks look fine.</p></div>)}
        {tab === 'keys' && (
          <ul className="keys">
            {keys.map(([a, b]) => <li key={a}><span>{a}</span><span>{b.split(' / ').map((x, i) => <span key={i}>{i > 0 && ' / '}{x.split(' ').map((y, j) => <kbd key={j} style={{ marginLeft: j ? 3 : 0 }}>{y}</kbd>)}</span>)}</span></li>)}
          </ul>
        )}
      </div>
    </aside>
  );
}

export function ChangesView({ base, current, theirs, isNew }: { base: string; current: string; theirs: string | null; isNew: boolean }) {
  const ops = lineDiff(theirs ?? base, current);
  const add = ops.filter((o) => o.t === '+').length, del = ops.filter((o) => o.t === '-').length;
  const keep = new Set<number>();
  ops.forEach((o, i) => { if (o.t !== ' ') for (let k = i - 3; k <= i + 3; k++) keep.add(k); });
  const rows: ReactNode[] = [];
  let gap = 0;
  const flush = (k: string) => { if (gap) { rows.push(<div key={k} className="gap">{gap} unchanged line{gap === 1 ? '' : 's'}</div>); gap = 0; } };
  ops.forEach((o, i) => {
    if (o.t === ' ' && !keep.has(i)) { gap++; return; }
    flush('g' + i);
    rows.push(
      <div key={i} className={o.t === '+' ? 'add' : o.t === '-' ? 'del' : ''}>
        <span>{o.a != null ? o.a + 1 : ''}</span><span>{o.b != null ? o.b + 1 : ''}</span><span>{o.t === ' ' ? '' : o.t === '+' ? '+' : '−'}</span><code>{o.text || ' '}</code>
      </div>,
    );
  });
  flush('end');
  return (
    <section className="wk-pane wk-diff" aria-label="Changes">
      <div className="diff-h">
        <h3>{theirs != null ? 'Their saved version compared with yours' : isNew ? 'New page' : 'Your changes'}</h3>
        <Tag tone="ok">+{add}</Tag><Tag tone="bad">−{del}</Tag>
        <span className="muted" style={{ fontSize: 13 }}>{theirs != null ? 'Lines marked − exist only in the version someone else saved. Lines marked + exist only in yours.' : 'Compared with the version you opened.'}</span>
      </div>
      {add || del ? <div className="diff">{rows}</div> : <div className="panel empty"><h3>No changes yet</h3><p>Edits you make appear here before you save.</p></div>}
    </section>
  );
}

export function TemplatePicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="wk-tpls" id="wk-tpls">
      <h3>Start from a template</h3>
      <p>Pick a starting point. You can change everything afterwards.</p>
      <div className="tpl-grid">
        {TEMPLATES.map((t) => <button key={t.id} className="tpl" onClick={() => onPick(t.id)}><b>{t.name}</b><span>{t.description}</span></button>)}
      </div>
    </div>
  );
}
