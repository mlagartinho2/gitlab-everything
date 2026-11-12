/* Suggestions while typing: / blocks, [[ pages, # issues, ! merge requests, @ people, :emoji. */
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import type { Issue, Member, MergeRequest, WikiPageMeta } from '../../api/types';
import { EMOJI } from '../../lib/markdown/extras';
import { pageSlug } from '../../lib/wiki/paths';
import { COMMANDS, type CommandId } from './commands';

export interface CompletionData {
  pages: () => WikiPageMeta[];
  issues: () => Promise<Issue[]>;
  mergeRequests: () => Promise<MergeRequest[]>;
  members: () => Promise<Member[]>;
  /** Text of a reference to an issue or MR from this wiki: "#12" in its own project, "group/project#12" elsewhere. */
  reference: (sym: '#' | '!', projectId: number, iid: number) => string;
  projectLabel: (projectId: number) => string;
  /** Commands that need the app, such as opening the file picker. */
  run: (id: string, view: EditorView) => boolean;
}

export const SLASH: { id: CommandId | 'upload'; label: string; detail: string }[] = [
  { id: 'h1', label: 'Heading 1', detail: 'Large section heading' }, { id: 'h2', label: 'Heading 2', detail: 'Medium section heading' }, { id: 'h3', label: 'Heading 3', detail: 'Small section heading' },
  { id: 'ul', label: 'Bulleted list', detail: 'Simple list' }, { id: 'ol', label: 'Numbered list', detail: 'Ordered steps' }, { id: 'task', label: 'Task list', detail: 'Checkboxes readers can tick' },
  { id: 'quote', label: 'Quote', detail: 'Quoted text' }, { id: 'codeblock', label: 'Code block', detail: 'Syntax-highlighted code' }, { id: 'table3', label: 'Table', detail: '3 columns, 2 rows' },
  { id: 'hr', label: 'Divider', detail: 'Horizontal rule' }, { id: 'upload', label: 'Image or file', detail: 'Upload and link an attachment' }, { id: 'pagelink', label: 'Link to a page', detail: 'Another page in this wiki' },
  { id: 'mermaid', label: 'Flowchart', detail: 'Mermaid diagram' }, { id: 'sequence', label: 'Sequence diagram', detail: 'Mermaid sequence diagram' }, { id: 'math', label: 'Math block', detail: 'LaTeX equation' },
  { id: 'mathInline', label: 'Inline math', detail: 'Equation inside a sentence' }, { id: 'details', label: 'Collapsible section', detail: 'Hidden until expanded' },
  { id: 'note', label: 'Note', detail: 'Blue callout' }, { id: 'tip', label: 'Tip', detail: 'Green callout' }, { id: 'important', label: 'Important', detail: 'Purple callout' },
  { id: 'warning', label: 'Warning', detail: 'Amber callout' }, { id: 'caution', label: 'Caution', detail: 'Red callout' }, { id: 'toc', label: 'Table of contents', detail: 'Built from the headings' },
  { id: 'footnote', label: 'Footnote', detail: 'Numbered note at the end' }, { id: 'date', label: "Today's date", detail: 'YYYY-MM-DD' }, { id: 'mention', label: 'Mention someone', detail: '@username' },
  { id: 'issue', label: 'Issue reference', detail: '#123' }, { id: 'mr', label: 'Merge request reference', detail: '!45' }, { id: 'emoji', label: 'Emoji', detail: ':rocket:' }, { id: 'kbd', label: 'Keyboard key', detail: '<kbd>' },
];

const inCode = (ctx: CompletionContext) => {
  for (let n: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(ctx.state).resolveInner(ctx.pos, -1); n; n = n.parent) {
    if (/^(FencedCode|CodeBlock|InlineCode|CodeText)$/.test(n.name)) return true;
  }
  return false;
};
/** Replaces [from, to] (plus extra characters after `to`) with text. */
const replace = (view: EditorView, from: number, to: number, text: string) =>
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input.complete' });

export function wikiCompletions(data: CompletionData): CompletionSource {
  return async (ctx): Promise<CompletionResult | null> => {
    if (inCode(ctx)) return null;
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);
    let m: RegExpMatchArray | null;

    if ((m = before.match(/(^|\s)\/([\w-]{0,24})$/))) {
      const from = ctx.pos - m[2].length;
      return {
        from,
        validFor: /^[\w-]*$/,
        options: SLASH.map((s): Completion => ({
          label: s.label, detail: s.detail, type: 'keyword',
          apply: (view, _c, f, t) => {
            replace(view, f - 1, t, '');
            if (!data.run(s.id, view)) COMMANDS[s.id as CommandId](view);
          },
        })),
      };
    }
    if ((m = before.match(/\[\[([^\]\n]{0,60})$/))) {
      const q = m[1];
      const from = ctx.pos - q.length;
      // closeBrackets may have added "]]" after the cursor; swallow it.
      const close = (view: EditorView, t: number) => { const after = view.state.sliceDoc(t, t + 2); return t + (after === ']]' ? 2 : after.startsWith(']') ? 1 : 0); };
      const options: Completion[] = data.pages().map((p) => ({
        label: p.title, detail: p.slug, type: 'text',
        apply: (view, _c, f, t) => replace(view, f - 2, close(view, t), `[${p.title}](${p.slug})`),
      }));
      if (q.trim() && !data.pages().some((p) => p.title.toLowerCase() === q.trim().toLowerCase())) {
        options.push({ label: `New page: ${q.trim()}`, detail: pageSlug(q), boost: -99, apply: (view, _c, f, t) => replace(view, f - 2, close(view, t), `[${q.trim()}](${pageSlug(q)})`) });
      }
      return { from, options, filter: true };
    }
    if ((m = before.match(/(^|[\s(])([#!])(\d{0,7}|[A-Za-z][\w-]{0,30})$/))) {
      const sym = m[2] as '#' | '!';
      const q = m[3];
      if (sym === '#' && !before.slice(0, before.length - q.length - 1).trim()) return null; // a heading
      const list = await (sym === '#' ? data.issues() : data.mergeRequests());
      if (ctx.aborted) return null;
      return {
        from: ctx.pos - q.length,
        validFor: /^[\w-]*$/,
        options: list.slice(0, 200).map((i) => ({
          label: `${i.iid} ${i.title}`, detail: data.projectLabel(i.project_id), type: sym === '#' ? 'issue' : 'mr',
          apply: (view, _c, f, t) => replace(view, f - 1, t, data.reference(sym, i.project_id, i.iid) + ' '),
        })),
      };
    }
    if ((m = before.match(/(^|[\s(])@([\w.-]{0,30})$/))) {
      const list = await data.members();
      if (ctx.aborted) return null;
      return {
        from: ctx.pos - m[2].length,
        validFor: /^[\w.-]*$/,
        options: list.map((u) => ({ label: u.username, detail: u.name, type: 'variable', apply: (view, _c, f, t) => replace(view, f - 1, t, `@${u.username} `) })),
      };
    }
    if ((m = before.match(/(^|\s):([a-z0-9_+-]{0,24})$/)) && (m[2].length > 0 || ctx.explicit)) {
      return {
        from: ctx.pos - m[2].length,
        validFor: /^[a-z0-9_+-]*$/,
        options: Object.entries(EMOJI).map(([name, ch]) => ({ label: name, detail: ch, type: 'constant', apply: (view, _c, f, t) => replace(view, f - 1, t, `:${name}: `) })),
      };
    }
    return null;
  };
}
