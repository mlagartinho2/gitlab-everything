/* CodeMirror 6 configuration for the wiki editor: language, keys, theme and behaviours. */
import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, completionStatus, type CompletionSource } from '@codemirror/autocomplete';
import { copyLineDown, defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { lintGutter, linter, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import {
  crosshairCursor, drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder, rectangularSelection,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { COMMANDS, indentList, isListLine, tableStep, type CommandId } from './commands';

export const wrapCompartment = new Compartment();
export const numbersCompartment = new Compartment();

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--surface)', color: 'var(--fg)', fontSize: '13.5px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--f-mono)', lineHeight: '1.7' },
  '.cm-content': { padding: '14px 0 40vh', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 18px 0 12px' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', borderRight: '1px solid var(--line)', color: 'var(--faint)' },
  '.cm-lineNumbers .cm-gutterElement': { fontSize: '11.5px', padding: '0 6px 0 8px', minWidth: '24px' },
  '.cm-activeLine': { backgroundColor: 'var(--sunken)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--sunken)', color: 'var(--fg)' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--accent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--sel) !important' },
  '.cm-selectionMatch': { backgroundColor: 'var(--hit)' },
  '.cm-searchMatch': { backgroundColor: 'var(--hit)', borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': { outline: '2px solid var(--accent)', backgroundColor: 'var(--hit)' },
  '&.cm-focused .cm-matchingBracket': { color: 'var(--ok)', fontWeight: '700', backgroundColor: 'transparent' },
  '.cm-placeholder': { color: 'var(--faint)' },
  '.cm-panels': { backgroundColor: 'var(--sunken)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-search': { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', padding: '8px 10px', fontFamily: 'var(--f-body)', fontSize: '12.5px' },
  '.cm-search br': { flexBasis: '100%', height: '0' },
  '.cm-textfield': { border: '1px solid var(--line-strong)', backgroundColor: 'var(--surface)', color: 'var(--fg)', borderRadius: '6px', padding: '5px 8px', fontFamily: 'var(--f-mono)', fontSize: '12.5px', margin: '0' },
  '.cm-textfield:focus': { outline: 'none', borderColor: 'var(--accent)' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: '6px', padding: '4px 9px', color: 'var(--fg)', fontFamily: 'var(--f-body)', fontSize: '12px', margin: '0', cursor: 'pointer' },
  '.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--muted)', fontSize: '12px' },
  '.cm-search button[name=close]': { position: 'static', marginLeft: 'auto', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer' },
  '.cm-gutter-lint': { width: '14px' },
  '.cm-lint-marker': { width: '8px', height: '8px', borderRadius: '50%', margin: '7px 0 0 3px', content: 'none' },
  '.cm-lint-marker-error': { backgroundColor: 'var(--bad)' },
  '.cm-lint-marker-warning': { backgroundColor: 'var(--warn)' },
  '.cm-lint-marker-info': { backgroundColor: 'var(--info)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--bad) 1px', textUnderlineOffset: '3px' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--warn) 1px', textUnderlineOffset: '3px' },
  '.cm-lintRange-info': { backgroundImage: 'none', textDecoration: 'underline dotted var(--info) 1px', textUnderlineOffset: '3px' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '9px', boxShadow: 'var(--shadow)', color: 'var(--fg)', overflow: 'hidden' },
  '.cm-diagnostic': { padding: '6px 10px', borderLeft: '3px solid var(--info)', fontFamily: 'var(--f-body)', fontSize: '13px' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--bad)' },
  '.cm-diagnostic-warning': { borderLeftColor: 'var(--warn)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--f-body)', fontSize: '13.5px', maxHeight: '320px', minWidth: '280px', padding: '4px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '6px 9px', borderRadius: '7px', display: 'flex', alignItems: 'center', gap: '10px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--sunken)', color: 'var(--fg)' },
  '.cm-completionLabel': { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis' },
  '.cm-completionDetail': { fontFamily: 'var(--f-mono)', fontSize: '11.5px', color: 'var(--faint)', fontStyle: 'normal', marginLeft: 'auto' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700', color: 'var(--accent)' },
  '.cm-completionIcon': { display: 'none' },
});

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.28em' },
  { tag: t.heading2, fontWeight: '700', fontSize: '1.16em' },
  { tag: t.heading3, fontWeight: '700', fontSize: '1.06em' },
  { tag: t.heading, fontWeight: '700', color: 'var(--fg)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--info)' },
  { tag: t.url, color: 'var(--faint)' },
  { tag: t.processingInstruction, color: 'var(--accent)', fontWeight: '500' },
  { tag: t.monospace, color: 'var(--j-str)' },
  { tag: t.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: t.contentSeparator, color: 'var(--faint)' },
  { tag: t.keyword, color: 'var(--j-key)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--j-str)' },
  { tag: [t.number, t.integer, t.float], color: 'var(--j-num)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--j-com)', fontStyle: 'italic' },
  { tag: [t.typeName, t.className, t.function(t.variableName), t.definition(t.variableName), t.bool, t.atom], color: 'var(--info)' },
  { tag: [t.tagName], color: 'var(--j-key)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--j-num)' },
  { tag: t.meta, color: 'var(--muted)' },
  { tag: t.invalid, color: 'var(--bad)' },
]);

export interface EditorHooks {
  save: () => void;
  togglePreview: () => void;
  onDocChange: () => void;
  onSelection: () => void;
  paste: (e: ClipboardEvent, view: EditorView) => boolean;
  drop: (e: DragEvent, view: EditorView) => boolean;
  checks: (doc: string) => { line: number; severity: 'error' | 'warning' | 'info'; message: string }[];
}

export function editorExtensions(opts: { hooks: EditorHooks; completions: CompletionSource; wrap: boolean; lineNumbers: boolean }): Extension[] {
  const { hooks } = opts;
  const run = (id: CommandId) => (v: EditorView) => { COMMANDS[id](v); return true; };
  const wikiKeys = [
    { key: 'Mod-b', run: run('bold') }, { key: 'Mod-i', run: run('italic') }, { key: 'Mod-Shift-x', run: run('strike') }, { key: 'Mod-e', run: run('code') },
    { key: 'Mod-k', run: run('link') }, { key: 'Mod-Shift-8', run: run('ul') }, { key: 'Mod-Shift-7', run: run('ol') }, { key: 'Mod-Shift-9', run: run('task') },
    { key: 'Mod-Shift-.', run: run('quote') }, { key: 'Mod-Alt-0', run: run('h0') },
    ...([1, 2, 3, 4, 5, 6] as const).map((n) => ({ key: `Mod-Alt-${n}`, run: run(`h${n}` as CommandId) })),
    { key: 'Mod-s', run: () => { hooks.save(); return true; }, preventDefault: true },
    { key: 'Mod-Alt-p', run: () => { hooks.togglePreview(); return true; } },
    { key: 'Mod-Shift-d', run: copyLineDown },
    { key: 'Mod-h', run: openSearchPanel },
    {
      key: 'Tab',
      run: (v: EditorView) => {
        if (completionStatus(v.state) === 'active') return acceptCompletion(v);
        if (tableStep(v, 1)) return true;
        if (isListLine(v) || !v.state.selection.main.empty) { indentList(v, 1); return true; }
        v.dispatch(v.state.replaceSelection('  '));
        return true;
      },
      shift: (v: EditorView) => { if (tableStep(v, -1)) return true; indentList(v, -1); return true; },
    },
  ];
  return [
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSelectionMatches(),
    search({ top: true }),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(highlight),
    autocompletion({ override: [opts.completions], icons: false, closeOnBlur: true }),
    linter((view) => hooks.checks(view.state.doc.toString()).map((c): Diagnostic => {
      const line = view.state.doc.line(Math.min(c.line + 1, view.state.doc.lines));
      return { from: line.from, to: line.to, severity: c.severity, message: c.message };
    }), { delay: 400 }),
    lintGutter(),
    numbersCompartment.of(opts.lineNumbers ? lineNumbers() : []),
    wrapCompartment.of(opts.wrap ? EditorView.lineWrapping : []),
    placeholder('Write in Markdown. Type / for blocks, [[ for pages, # for issues, ! for merge requests, @ for people and : for emoji.'),
    EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': 'Page content in Markdown' }),
    Prec.high(keymap.of(wikiKeys)),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) hooks.onDocChange();
      if (u.docChanged || u.selectionSet) hooks.onSelection();
    }),
    EditorView.domEventHandlers({ paste: (e, v) => hooks.paste(e, v), drop: (e, v) => hooks.drop(e, v) }),
    theme,
  ];
}
