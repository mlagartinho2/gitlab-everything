/* Formatting commands for the CodeMirror 6 wiki editor. Each takes the EditorView and edits the main selection. */
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { startCompletion } from '@codemirror/autocomplete';
import { redo, undo } from '@codemirror/commands';
import { LIST_RE } from '../../lib/markdown/render';
import { applyTableOp, cellPos, newTable, stepCell, tableAt, tableText, type Align, type TableModel, type TableOp } from '../../lib/wiki/tables';
import { fillTemplate } from '../../lib/wiki/templates';
import { today } from '../../lib/format';

const main = (v: EditorView) => v.state.selection.main;

/** Inserts text at the selection. ⟨…⟩ marks what to select afterwards; `block` puts it on its own lines. */
export function insertSnippet(view: EditorView, snippet: string, block = false) {
  let text = fillTemplate(snippet);
  const { from, to } = main(view);
  const doc = view.state.doc;
  if (block) {
    const line = doc.lineAt(from), endLine = doc.lineAt(to);
    const before = line.text.slice(0, from - line.from), after = endLine.text.slice(to - endLine.from);
    if (before.trim()) text = '\n\n' + text;
    else if (line.number > 1 && doc.line(line.number - 1).text.trim()) text = '\n' + text;
    if (after.trim()) text += '\n\n';
    else if (endLine.number < doc.lines && doc.line(endLine.number + 1).text.trim()) text += '\n';
  }
  const a = text.indexOf('⟨'), b = text.indexOf('⟩');
  const clean = text.replace('⟨', '').replace('⟩', '');
  const selection = a >= 0 ? EditorSelection.range(from + a, from + (b > a ? b - 1 : a)) : EditorSelection.cursor(from + clean.length);
  view.dispatch({ changes: { from, to, insert: clean }, selection, scrollIntoView: true, userEvent: 'input' });
  view.focus();
}

/** Wraps the selection in markers, or removes them when it is already wrapped. */
export function wrapSel(view: EditorView, l: string, r: string, placeholder: string) {
  const { from, to } = main(view);
  const s = view.state;
  const sel = s.sliceDoc(from, to);
  const bef = s.sliceDoc(Math.max(0, from - l.length), from), aft = s.sliceDoc(to, to + r.length);
  if (sel && bef === l && aft === r) {
    view.dispatch({ changes: [{ from: from - l.length, to: from }, { from: to, to: to + r.length }], selection: { anchor: from - l.length, head: to - l.length } });
  } else if (sel && sel.startsWith(l) && sel.endsWith(r) && sel.length >= l.length + r.length) {
    view.dispatch({ changes: { from, to, insert: sel.slice(l.length, sel.length - r.length) }, selection: { anchor: from, head: to - l.length - r.length } });
  } else if (sel) {
    view.dispatch({ changes: { from, to, insert: l + sel + r }, selection: { anchor: from + l.length, head: to + l.length } });
  } else {
    insertSnippet(view, `${l}⟨${placeholder}⟩${r}`);
    return;
  }
  view.focus();
}

/** Line numbers (1-based) covered by the selection. */
function selectedLines(view: EditorView) {
  const { from, to } = main(view);
  const doc = view.state.doc;
  const a = doc.lineAt(from).number;
  let b = doc.lineAt(to).number;
  if (b > a && doc.lineAt(to).from === to) b--;
  const out: number[] = [];
  for (let n = a; n <= b; n++) out.push(n);
  return out;
}
/** Applies per-line replacements and, for a single line, puts the cursor at its end. */
function replaceLines(view: EditorView, lines: number[], fn: (text: string, index: number) => string | null) {
  const doc = view.state.doc;
  const changes = [];
  let k = 0;
  for (const n of lines) {
    const l = doc.line(n);
    const out = fn(l.text, k);
    if (out != null && out !== l.text) changes.push({ from: l.from, to: l.to, insert: out });
    if (out != null) k++;
  }
  const tr = view.state.update({ changes });
  const sel = lines.length === 1 ? EditorSelection.cursor(tr.state.doc.line(lines[0]).to) : undefined;
  view.dispatch({ changes, selection: sel });
  view.focus();
}

const LIST_PREFIX = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/;
export type ListKind = 'ul' | 'ol' | 'task' | 'quote';
export function toggleList(view: EditorView, kind: ListKind) {
  const test = { ul: /^\s*[-*+]\s+(?!\[[ xX]\]\s)/, ol: /^\s*\d+[.)]\s+/, task: /^\s*[-*+]\s+\[[ xX]\]\s+/, quote: /^\s*>/ }[kind];
  const lines = selectedLines(view);
  const doc = view.state.doc;
  const filled = lines.filter((n) => doc.line(n).text.trim());
  const allHave = filled.length > 0 && filled.every((n) => test.test(doc.line(n).text));
  replaceLines(view, lines, (text, k) => {
    if (!text.trim() && lines.length > 1) return null;
    const m = text.match(kind === 'quote' ? /^(\s*)>\s?/ : LIST_PREFIX);
    const indent = m ? m[1] : text.match(/^\s*/)![0];
    const body = m ? text.slice(m[0].length) : text.slice(indent.length);
    if (allHave) return indent + body;
    return indent + { ul: '- ', ol: `${k + 1}. `, task: '- [ ] ', quote: '> ' }[kind] + body;
  });
}
export function setHeading(view: EditorView, level: number) {
  replaceLines(view, selectedLines(view), (text) => {
    const m = text.match(/^\s{0,3}(#{1,6})\s*/);
    const body = m ? text.slice(m[0].length) : text;
    return level && (!m || m[1].length !== level) ? '#'.repeat(level) + ' ' + body : body;
  });
}
/** Indents list items by their marker width (2 for bullets, 3 for "1."). */
export function indentList(view: EditorView, dir: 1 | -1) {
  const lines = selectedLines(view);
  const m = view.state.doc.line(lines[0]).text.match(/^\s*([-*+]|\d+[.)])\s/);
  const n = m && /\d/.test(m[1]) ? m[1].length + 1 : 2;
  const doc = view.state.doc;
  const changes = lines.map((ln) => {
    const l = doc.line(ln);
    if (dir > 0) return { from: l.from, insert: ' '.repeat(n) };
    const k = Math.min(l.text.match(/^ */)![0].length, n);
    return { from: l.from, to: l.from + k };
  });
  view.dispatch({ changes });
  view.focus();
}
export function link(view: EditorView) {
  const { from, to } = main(view);
  const sel = view.state.sliceDoc(from, to);
  if (/^(https?:\/\/|mailto:)\S+$/.test(sel)) insertSnippet(view, `[⟨link text⟩](${sel})`);
  else if (sel) insertSnippet(view, `[${sel}](⟨https://⟩)`);
  else insertSnippet(view, '[⟨link text⟩](https://)');
}
export function codeBlock(view: EditorView, lang = '') {
  const { from, to } = main(view);
  const sel = view.state.sliceDoc(from, to);
  insertSnippet(view, sel ? '```' + lang + '\n' + sel.replace(/\n$/, '') + '\n```' : '```' + lang + '\n⟨⟩\n```', true);
}
export function footnote(view: EditorView) {
  const v = view.state.doc.toString();
  let n = 1;
  while (v.includes(`[^${n}]`)) n++;
  const { from, to } = main(view);
  const doc = view.state.doc;
  const last = doc.line(doc.lines);
  const pad = last.text.trim() ? '\n\n' : doc.lines > 1 && doc.line(doc.lines - 1).text.trim() ? '\n' : '';
  const def = `${pad}[^${n}]: `;
  view.dispatch({ changes: [{ from, to, insert: `[^${n}]` }, { from: last.to, insert: def }] });
  view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
  view.focus();
}
/** Types a trigger character (#, !, @, :, [[) and opens its suggestions. */
export function trigger(view: EditorView, chars: string) {
  const { from } = main(view);
  const before = view.state.sliceDoc(Math.max(0, from - 1), from);
  insertSnippet(view, (chars !== '[[' && before && /\S/.test(before) ? ' ' : '') + chars);
  startCompletion(view);
}

/* ---- tables ---- */
const getter = (view: EditorView) => (n: number) => (n >= 0 && n < view.state.doc.lines ? view.state.doc.line(n + 1).text : undefined);
export function currentTable(view: EditorView): { t: TableModel; row: number; col: number } | null {
  const { head } = main(view);
  const ln = view.state.doc.lineAt(head);
  const t = tableAt(getter(view), view.state.doc.lines - 1, ln.number - 1);
  if (!t) return null;
  return { t, ...cellPos(t, ln.number - 1, ln.text, head - ln.from) };
}
function writeTable(view: EditorView, t: TableModel, row: number, col: number) {
  const { lines, cellRange } = tableText(t);
  const doc = view.state.doc;
  const from = doc.line(t.s + 1).from, to = doc.line(t.e + 1).to;
  const cr = cellRange(row, col);
  let off = 0;
  for (let k = 0; k < cr.lineOffset; k++) off += lines[k].length + 1;
  view.dispatch({ changes: { from, to, insert: lines.join('\n') }, selection: { anchor: from + off + cr.from, head: from + off + cr.to }, scrollIntoView: true });
  view.focus();
}
/** Runs a table edit at the cursor. Returns an error message when the edit is not possible. */
export function tableOp(view: EditorView, op: TableOp, arg?: Align): string | null {
  const cur = currentTable(view);
  if (!cur) return 'Put the cursor inside a table first.';
  const r = applyTableOp(cur.t, op, cur.row, cur.col, arg);
  if (typeof r === 'string') return r;
  writeTable(view, cur.t, r.row, r.col);
  return null;
}
export function tableStep(view: EditorView, dir: 1 | -1): boolean {
  const cur = currentTable(view);
  if (!cur) return false;
  const next = stepCell(cur.t, cur.row, cur.col, dir);
  writeTable(view, cur.t, next.row, next.col);
  return true;
}
export function insertTable(view: EditorView, cols: number, rows: number) {
  const start = main(view).from;
  insertSnippet(view, tableText(newTable(cols, rows)).lines.join('\n'), true);
  const k = view.state.doc.toString().indexOf('|', start);
  if (k < 0) return;
  const ln = view.state.doc.lineAt(k).number - 1;
  const t = tableAt(getter(view), view.state.doc.lines - 1, ln);
  if (t) writeTable(view, t, 0, 0);
}
export const isListLine = (view: EditorView) => LIST_RE.test(view.state.doc.lineAt(main(view).head).text);

/* ---- registry used by the toolbar, the slash menu and shortcuts ---- */
export type CommandId =
  | 'undo' | 'redo' | 'bold' | 'italic' | 'strike' | 'code' | 'mark' | 'kbd' | 'ul' | 'ol' | 'task' | 'quote' | 'indent' | 'outdent'
  | 'link' | 'hr' | 'codeblock' | 'table3' | 'mermaid' | 'sequence' | 'math' | 'mathInline' | 'details' | 'toc' | 'footnote' | 'date'
  | 'note' | 'tip' | 'important' | 'warning' | 'caution' | 'pagelink' | 'mention' | 'issue' | 'mr' | 'emoji'
  | 'h0' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export const COMMANDS: Record<CommandId, (v: EditorView) => void> = {
  undo: (v) => undo(v), redo: (v) => redo(v),
  bold: (v) => wrapSel(v, '**', '**', 'bold text'), italic: (v) => wrapSel(v, '_', '_', 'italic text'), strike: (v) => wrapSel(v, '~~', '~~', 'text'),
  code: (v) => wrapSel(v, '`', '`', 'code'), mark: (v) => wrapSel(v, '==', '==', 'highlight'), kbd: (v) => wrapSel(v, '<kbd>', '</kbd>', 'Ctrl'),
  ul: (v) => toggleList(v, 'ul'), ol: (v) => toggleList(v, 'ol'), task: (v) => toggleList(v, 'task'), quote: (v) => toggleList(v, 'quote'),
  indent: (v) => indentList(v, 1), outdent: (v) => indentList(v, -1), link, hr: (v) => insertSnippet(v, '---', true), codeblock: (v) => codeBlock(v),
  table3: (v) => insertTable(v, 3, 2),
  mermaid: (v) => insertSnippet(v, '```mermaid\ngraph LR\n  A[⟨Start⟩] --> B[Next step]\n  B --> C{Decision}\n  C -->|Yes| D[Done]\n  C -->|No| B\n```', true),
  sequence: (v) => insertSnippet(v, '```mermaid\nsequenceDiagram\n  participant U as ⟨User⟩\n  participant A as API\n  U->>A: Request\n  A-->>U: Response\n```', true),
  math: (v) => insertSnippet(v, '```math\n⟨a^2 + b^2 = c^2⟩\n```', true), mathInline: (v) => insertSnippet(v, '$`⟨x^2⟩`$'),
  details: (v) => insertSnippet(v, '<details>\n<summary>⟨Summary⟩</summary>\n\nHidden content\n\n</details>', true),
  toc: (v) => insertSnippet(v, '[[_TOC_]]', true), footnote, date: (v) => insertSnippet(v, today()),
  note: (v) => insertSnippet(v, '> [!NOTE]\n> ⟨Useful information⟩', true), tip: (v) => insertSnippet(v, '> [!TIP]\n> ⟨A helpful suggestion⟩', true),
  important: (v) => insertSnippet(v, '> [!IMPORTANT]\n> ⟨Something readers must know⟩', true), warning: (v) => insertSnippet(v, '> [!WARNING]\n> ⟨Something that needs attention⟩', true),
  caution: (v) => insertSnippet(v, '> [!CAUTION]\n> ⟨A risk or a negative outcome⟩', true),
  pagelink: (v) => trigger(v, '[['), mention: (v) => trigger(v, '@'), issue: (v) => trigger(v, '#'), mr: (v) => trigger(v, '!'), emoji: (v) => trigger(v, ':'),
  h0: (v) => setHeading(v, 0), h1: (v) => setHeading(v, 1), h2: (v) => setHeading(v, 2), h3: (v) => setHeading(v, 3), h4: (v) => setHeading(v, 4), h5: (v) => setHeading(v, 5), h6: (v) => setHeading(v, 6),
};
