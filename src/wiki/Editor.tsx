import { useQueryClient } from '@tanstack/react-query';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { lineNumbers } from '@codemirror/view';
import { openSearchPanel, closeSearchPanel, searchPanelOpen } from '@codemirror/search';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, enc, explain, groupPath, request, upload, write, getAll } from '../api/client';
import { connection, useConnection } from '../api/connection';
import { relPath, spaceKey, useKey, useWikiSpace, type Tree, type WikiSpace } from '../api/hooks';
import type { Issue, Member, MergeRequest, WikiAttachment, WikiPage } from '../api/types';
import { Icon, Segmented } from '../components/ui';
import { countWords, readingMinutes } from '../lib/format';
import { mdRender, findAnchor } from '../lib/markdown/render';
import { sanitizeGitLabHtml } from '../lib/markdown/sanitize';
import { checkMarkdown } from '../lib/wiki/checks';
import { pageSlug } from '../lib/wiki/paths';
import { looksLikeTsv, tsvToTable } from '../lib/wiki/tables';
import { fillTemplate, TEMPLATES } from '../lib/wiki/templates';
import { useToast } from '../state/toast';
import { codeBlock, COMMANDS, currentTable, insertSnippet, insertTable, tableOp, type CommandId } from './editor/commands';
import { wikiCompletions } from './editor/completions';
import { CODE_LANGS, ChangesView, INSERT_ITEMS, MOD, PopItem, Popover, SidePanel, TablePicker, TemplatePicker, slashIcon } from './editor/parts';
import { editorExtensions, numbersCompartment, wrapCompartment } from './editor/setup';
import { MarkdownView } from './MarkdownView';
import { demoUploads, useWikiPrefs, wikiPrefs, type WikiPrefs } from './prefs';
import { gitlabRenderOptions, pageUrl, renderContext } from './WikiWorkspace';

type Banner = { tone: 'warn' | 'bad' | 'info'; text: ReactNode; actions?: { label: string; run: () => void; danger?: boolean }[] } | null;
type Menu = { kind: 'heading' | 'code' | 'insert' | 'templates' | 'table'; anchor: HTMLElement } | null;

const draftKey = (spaceKey: string, slug: string | null) => {
  const c = connection.get();
  return `gle-draft|${c.mode === 'live' ? c.base : 'demo'}|${spaceKey}|${slug ?? '(new page)'}`;
};
interface Draft { title: string; content: string; base: string; at: number }
const readDraft = (k: string): Draft | null => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const writeDraft = (k: string, d: Draft) => { try { localStorage.setItem(k, JSON.stringify(d)); return true; } catch { return false; } };
const dropDraft = (k: string) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } };

/** Loads the page fresh (not from cache), then shows the editor. */
export function Editor({ tree, space, isNew = false }: { tree: Tree; space: WikiSpace; isNew?: boolean }) {
  const params = useParams();
  const slug = isNew ? null : params['*'] || '';
  const [page, setPage] = useState<WikiPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (isNew) return;
    let off = false;
    request<WikiPage>('GET', `${space.base}/${enc(slug!)}`).then((r) => {
      if (off) return;
      if (r.status >= 400) setError(explain(r.status, r.data)); else setPage(r.data);
    }, (e) => !off && setError((e as Error).message));
    return () => { off = true; };
  }, [isNew, slug, space.base]);
  if (error) return <div className="wk-empty"><h2>The editor could not open</h2><p>{error}</p><div className="actions"><button className="btn" onClick={() => navigate(`/wiki/${space.key}`)}>Back to the wiki</button></div></div>;
  if (!isNew && !page) return <div className="wk-empty"><div className="sk"><div style={{ width: '40%' }} /><div style={{ width: '80%' }} /><div style={{ width: '65%' }} /></div><p style={{ marginTop: 16 }}>Loading the page…</p></div>;
  return <EditorBody key={slug ?? 'new'} tree={tree} space={space} page={page} />;
}

function EditorBody({ tree, space, page }: { tree: Tree; space: WikiSpace; page: WikiPage | null }) {
  const isNew = !page;
  const navigate = useNavigate();
  const { search } = useLocation();
  const toast = useToast();
  const qc = useQueryClient();
  const key = useKey();
  const c = useConnection();
  const prefs = useWikiPrefs();
  const narrow = window.innerWidth <= 860;

  // For a new page the wiki can be changed before saving.
  const [targetKey, setTargetKey] = useState(space.key);
  const target = useWikiSpace(tree, targetKey).data ?? space;
  const targetRef = useRef(target);
  targetRef.current = target;

  const base = useRef((page?.content || '').replace(/\r\n?/g, '\n'));
  const baseTitle = useRef(page?.title ?? new URLSearchParams(search).get('title') ?? '');
  const [title, setTitle] = useState(baseTitle.current);
  const [doc, setDoc] = useState(base.current);
  const [cursor, setCursor] = useState({ line: 0, col: 0, sel: 0, cursors: 1 });
  const [inTable, setInTable] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [saving, setSaving] = useState(false);
  const [draftAt, setDraftAt] = useState(0);
  const [theirs, setTheirs] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(isNew && !base.current);
  const [gitlabHtml, setGitlabHtml] = useState<{ html: string } | { error: string } | null>(null);
  const view = useRef<EditorView | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const previewMd = useRef<HTMLDivElement>(null);
  const lock = useRef({ editor: 0, preview: 0 });
  const timers = useRef<Record<string, number>>({});
  const debounce = (k: string, ms: number, fn: () => void) => { window.clearTimeout(timers.current[k]); timers.current[k] = window.setTimeout(fn, ms); };

  const viewMode: WikiPrefs['view'] = narrow && prefs.view === 'split' ? 'write' : prefs.view;
  const dk = draftKey(targetKey, page?.slug ?? null);
  const dirty = doc !== base.current || title !== baseTitle.current;
  const ctxSlug = isNew ? pageSlug(title) : page!.slug;
  const rendered = useMemo(() => mdRender(doc, renderContext(tree, target, ctxSlug, true)), [doc, tree, target, ctxSlug]);
  const checks = useMemo(() => checkMarkdown(doc, { slugs: new Set(target.pages.map((p) => p.slug)), curSlug: ctxSlug }), [doc, target, ctxSlug]);

  /* ---- latest values for the editor's callbacks ---- */
  const latest = useRef({ save: () => {}, togglePreview: () => {}, upload: (_f: File[], _at?: number) => {} });

  /* ---- uploads ---- */
  const uploadFiles = useCallback(async (files: File[], at?: number) => {
    const v = view.current;
    if (!v || !files.length) return;
    if (at != null) v.dispatch({ selection: { anchor: at } });
    for (const f of files) {
      const img = /^image\//.test(f.type);
      const ph = `${img ? '!' : ''}[Uploading ${f.name}…]()`;
      insertSnippet(v, ph + (files.length > 1 ? '\n' : ''));
      const replacePh = (text: string) => {
        const i = v.state.doc.toString().indexOf(ph);
        if (i >= 0) v.dispatch({ changes: { from: i, to: i + ph.length, insert: text } });
      };
      try {
        let md: string;
        if (connection.get().mode === 'demo') {
          const path = `uploads/${Math.random().toString(16).slice(2, 10)}/${f.name.replace(/[^\w.-]+/g, '_')}`;
          demoUploads.set(path, URL.createObjectURL(f));
          md = `${img ? '!' : ''}[${f.name}](${path})`;
        } else {
          const a = await upload<WikiAttachment>(`${targetRef.current.base}/attachments`, f);
          md = a.link?.markdown || `${img ? '!' : ''}[${a.file_name}](${a.file_path})`;
        }
        replacePh(md);
      } catch (e) {
        replacePh('');
        toast((e as Error).message, true);
      }
    }
  }, [toast]);
  latest.current.upload = uploadFiles;

  /* ---- create CodeMirror once ---- */
  useEffect(() => {
    const projectOf = () => (targetRef.current.type === 'project' ? targetRef.current.id : null);
    const apiBase = () => (targetRef.current.type === 'project' ? `/projects/${targetRef.current.id}` : groupPath(targetRef.current.id));
    const cache = new Map<string, Promise<unknown[]>>();
    const load = <T,>(k: string, url: () => string) => {
      const ck = targetRef.current.key + k;
      if (!cache.has(ck)) cache.set(ck, getAll<T>(url(), 1).catch(() => []));
      return cache.get(ck) as Promise<T[]>;
    };
    const completions = wikiCompletions({
      pages: () => targetRef.current.pages,
      issues: () => load<Issue>('i', () => `${apiBase()}/issues?state=opened&scope=all&order_by=updated_at`),
      mergeRequests: () => load<MergeRequest>('m', () => `${apiBase()}/merge_requests?state=opened&scope=all&order_by=updated_at`),
      members: () => load<Member>('u', () => `${apiBase()}/members/all`),
      reference: (sym, pid, iid) => (pid === projectOf() ? `${sym}${iid}` : `${tree.projMap.get(pid)?.path_with_namespace || ''}${sym}${iid}`),
      projectLabel: (pid) => relPath(tree, tree.projMap.get(pid)?.path_with_namespace),
      run: (id) => { if (id === 'upload') { document.getElementById('wk-file')?.click(); return true; } return false; },
    });
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: base.current,
        extensions: editorExtensions({
          wrap: wikiPrefs.get().wrap,
          lineNumbers: wikiPrefs.get().lineNumbers,
          completions,
          hooks: {
            save: () => latest.current.save(),
            togglePreview: () => latest.current.togglePreview(),
            onDocChange: () => debounce('doc', 120, () => setDoc(v.state.doc.toString())),
            onSelection: () => debounce('sel', 60, () => {
              const s = v.state.selection;
              const ln = v.state.doc.lineAt(s.main.head);
              setCursor({ line: ln.number - 1, col: s.main.head - ln.from, sel: s.main.to - s.main.from, cursors: s.ranges.length });
              setInTable(!!currentTable(v));
            }),
            paste: (e, view2) => {
              const files = [...(e.clipboardData?.files || [])];
              if (files.length) { e.preventDefault(); latest.current.upload(files); return true; }
              const text = e.clipboardData?.getData('text/plain') || '';
              const sel = view2.state.selection.main;
              if (!sel.empty && /^(https?:\/\/|mailto:)\S+$/.test(text.trim()) && !view2.state.sliceDoc(sel.from, sel.to).includes('\n')) {
                e.preventDefault();
                view2.dispatch({ changes: { from: sel.from, to: sel.to, insert: `[${view2.state.sliceDoc(sel.from, sel.to)}](${text.trim()})` } });
                return true;
              }
              if (looksLikeTsv(text)) { e.preventDefault(); insertSnippet(view2, tsvToTable(text), true); toast('Pasted cells as a table'); return true; }
              return false;
            },
            drop: (e, view2) => {
              const files = [...(e.dataTransfer?.files || [])];
              if (!files.length) return false;
              e.preventDefault();
              latest.current.upload(files, view2.posAtCoords({ x: e.clientX, y: e.clientY }) ?? undefined);
              return true;
            },
            checks: (d) => checkMarkdown(d, { slugs: new Set(targetRef.current.pages.map((p) => p.slug)), curSlug: '' }),
          },
        }),
      }),
    });
    view.current = v;
    if (!isNew || baseTitle.current) v.focus();
    const t = timers.current;
    return () => { Object.values(t).forEach(window.clearTimeout); v.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { view.current?.dispatch({ effects: wrapCompartment.reconfigure(prefs.wrap ? EditorView.lineWrapping : []) }); }, [prefs.wrap]);
  useEffect(() => { view.current?.dispatch({ effects: numbersCompartment.reconfigure(prefs.lineNumbers ? lineNumbers() : []) }); }, [prefs.lineNumbers]);
  useEffect(() => { requestAnimationFrame(() => view.current?.requestMeasure()); }, [viewMode, prefs.side]);

  /* ---- drafts: offer to restore, then keep one while there are unsaved changes ---- */
  useEffect(() => {
    const d = readDraft(dk);
    if (d && (d.content !== base.current || (d.title || '') !== baseTitle.current)) {
      const when = new Date(d.at).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      setBanner({
        tone: 'info', text: `You have an unsaved draft of this page from ${when}, kept in this browser.`,
        actions: [
          { label: 'Restore draft', run: () => { setShowTemplates(false); setText(d.content); setTitle(d.title || baseTitle.current); setBanner(null); } },
          { label: 'Discard draft', run: () => { dropDraft(dk); setBanner(null); } },
        ],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!dirty) { dropDraft(dk); setDraftAt(0); return; }
    debounce('draft', 800, () => { if (writeDraft(dk, { title, content: doc, base: base.current, at: Date.now() })) setDraftAt(Date.now()); });
  }, [doc, title, dk, dirty]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  /* ---- GitLab renderer (live mode) ---- */
  const useGitLab = c.mode === 'live' && prefs.renderer === 'gitlab' && (viewMode === 'split' || viewMode === 'preview');
  useEffect(() => {
    if (!useGitLab) { setGitlabHtml(null); return; }
    const id = window.setTimeout(async () => {
      const body: Record<string, unknown> = { text: doc, gfm: true };
      if (target.type === 'project') body.project = tree.projMap.get(target.id)?.path_with_namespace;
      const r = await request<{ html: string }>('POST', '/markdown', body);
      setGitlabHtml(r.status < 300 ? { html: sanitizeGitLabHtml(r.data.html, gitlabRenderOptions(target)) } : { error: explain(r.status, r.data) });
    }, 700);
    return () => window.clearTimeout(id);
  }, [useGitLab, doc, target, tree]);

  /* ---- scroll the preview with the source, and back ---- */
  useEffect(() => {
    const v = view.current, pv = preview.current;
    if (!v || !pv) return;
    const blocks = () => [...pv.querySelectorAll<HTMLElement>('.md > [data-line]')];
    const fromEditor = () => requestAnimationFrame(() => {
      if (!wikiPrefs.get().syncScroll || Date.now() < lock.current.editor) return;
      const top = v.scrollDOM.scrollTop;
      lock.current.preview = Date.now() + 150;
      if (top <= 2) { pv.scrollTop = 0; return; }
      const els = blocks();
      if (!els.length) { pv.scrollTop = (top / Math.max(1, v.scrollDOM.scrollHeight - v.scrollDOM.clientHeight)) * (pv.scrollHeight - pv.clientHeight); return; }
      const line = v.state.doc.lineAt(v.lineBlockAtHeight(top).from).number - 1;
      let a: HTMLElement | null = null, b: HTMLElement | null = null;
      for (const el of els) { if (Number(el.dataset.line) <= line) a = el; else { b = el; break; } }
      const yOf = (ln: number) => v.lineBlockAt(v.state.doc.line(Math.min(ln + 1, v.state.doc.lines)).from).top;
      const aY = yOf(a ? Number(a.dataset.line) : 0), bY = b ? yOf(Number(b.dataset.line)) : v.contentHeight;
      const aTop = a ? a.offsetTop : 0, bTop = b ? b.offsetTop : pv.scrollHeight;
      const frac = bY > aY ? Math.min(1, Math.max(0, (top - aY) / (bY - aY))) : 0;
      pv.scrollTop = aTop + frac * (bTop - aTop) - 16;
    });
    const fromPreview = () => requestAnimationFrame(() => {
      if (!wikiPrefs.get().syncScroll || Date.now() < lock.current.preview) return;
      const els = blocks();
      if (!els.length) return;
      const top = pv.scrollTop + 16;
      let a: HTMLElement | null = null, b: HTMLElement | null = null;
      for (const el of els) { if (el.offsetTop <= top) a = el; else { b = el; break; } }
      const yOf = (ln: number) => v.lineBlockAt(v.state.doc.line(Math.min(ln + 1, v.state.doc.lines)).from).top;
      const aY = yOf(a ? Number(a.dataset.line) : 0), bY = b ? yOf(Number(b.dataset.line)) : v.contentHeight;
      const aTop = a ? a.offsetTop : 0, bTop = b ? b.offsetTop : pv.scrollHeight;
      const frac = bTop > aTop ? Math.min(1, Math.max(0, (top - aTop) / (bTop - aTop))) : 0;
      lock.current.editor = Date.now() + 150;
      v.scrollDOM.scrollTop = aY + frac * (bY - aY);
    });
    v.scrollDOM.addEventListener('scroll', fromEditor);
    pv.addEventListener('scroll', fromPreview);
    return () => { v.scrollDOM.removeEventListener('scroll', fromEditor); pv.removeEventListener('scroll', fromPreview); };
  }, [viewMode]);

  /* ---- actions ---- */
  const setText = (text: string) => {
    const v = view.current!;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: 0 } });
    setDoc(text);
  };
  const cmd = (id: CommandId) => { const v = view.current; if (v) { COMMANDS[id](v); v.focus(); } };
  const setView = (v: WikiPrefs['view']) => wikiPrefs.set({ view: v });
  const applyTemplate = (id: string, replaceAll: boolean) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setShowTemplates(false);
    const body = fillTemplate(t.body);
    const v = view.current!;
    if (replaceAll || !v.state.doc.toString().trim()) {
      setText(body);
      const m = body.match(/^#\s+(.+)$/m);
      if (m && !title.trim()) setTitle(m[1].replace(/:\s*Title$|: Topic.*$|…$/, '').trim());
    } else insertSnippet(v, body, true);
    v.focus();
  };
  const goLine = (line: number, id?: string) => {
    const v = view.current!;
    const pos = v.state.doc.line(Math.min(line + 1, v.state.doc.lines)).from;
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 60 }) });
    v.focus();
    if (id && previewMd.current) { lock.current.preview = Date.now() + 400; findAnchor(previewMd.current, id)?.scrollIntoView({ block: 'start' }); }
  };
  const leave = (to: string) => {
    const now = view.current ? view.current.state.doc.toString() : doc;
    if (now === base.current && title === baseTitle.current) { navigate(to); return; }
    setBanner({
      tone: 'warn', text: 'You have unsaved changes on this page.',
      actions: [
        { label: 'Discard changes', danger: true, run: () => { dropDraft(dk); base.current = view.current!.state.doc.toString(); baseTitle.current = title; setBanner(null); navigate(to); } },
        { label: 'Keep editing', run: () => setBanner(null) },
      ],
    });
  };
  const save = async (force = false) => {
    const v = view.current;
    if (!v || saving) return;
    const content = v.state.doc.toString();
    const t = title.trim();
    if (!t) { setBanner({ tone: 'bad', text: 'Give the page a title before saving.' }); document.getElementById('wk-title')?.focus(); return; }
    if (!isNew && content === base.current && t === baseTitle.current) { toast('No changes to save'); return; }
    setSaving(true);
    try {
      if (!isNew && !force) {
        const r = await request<WikiPage>('GET', `${target.base}/${enc(page!.slug)}`);
        const remote = r.status < 300 ? String(r.data.content || '').replace(/\r\n?/g, '\n') : null;
        if (remote != null && remote !== base.current) {
          setTheirs(remote);
          setBanner({
            tone: 'bad', text: 'Someone saved this page after you opened it. Saving now would replace their changes.',
            actions: [
              { label: 'Compare versions', run: () => setView('changes') },
              { label: 'Save mine anyway', danger: true, run: () => { setBanner(null); save(true); } },
              { label: 'Load their version', run: () => { writeDraft(dk, { title, content, base: base.current, at: Date.now() }); base.current = remote; setText(remote); setTheirs(null); setBanner({ tone: 'info', text: 'Their version is loaded. Your text is kept as a draft in this browser.' }); } },
            ],
          });
          return;
        }
      }
      const saved = isNew
        ? await write<WikiPage>('POST', target.base, { title: t, content, format: 'markdown' })
        : await write<WikiPage>('PUT', `${target.base}/${enc(page!.slug)}`, { title: t, content });
      dropDraft(dk);
      base.current = content;
      baseTitle.current = t;
      setTheirs(null);
      toast(isNew ? `Created “${saved.title}”` : `Saved “${saved.title}”`);
      await qc.invalidateQueries({ queryKey: [key] });
      navigate(pageUrl(target, saved.slug), { replace: true });
    } catch (e) {
      setBanner({ tone: 'bad', text: e instanceof ApiError ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };
  latest.current.save = () => save();
  latest.current.togglePreview = () => setView(wikiPrefs.get().view === 'preview' ? 'split' : 'preview');

  const toggleTaskInSource = (line: number) => {
    const v = view.current!;
    const l = v.state.doc.line(line + 1);
    const next = l.text.replace(/\[( |x|X)\]/, (_m, ch) => (ch === ' ' ? '[x]' : '[ ]'));
    if (next !== l.text) v.dispatch({ changes: { from: l.from, to: l.to, insert: next } });
  };
  const runTable = (op: Parameters<typeof tableOp>[1], arg?: Parameters<typeof tableOp>[2]) => {
    const err = tableOp(view.current!, op, arg);
    if (err) toast(err, true);
  };
  const tb = (id: CommandId, label: ReactNode, title: string) => (
    <button className="tb" data-cmd={id} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(id)}>{label}</button>
  );
  const mb = (kind: NonNullable<Menu>['kind'], label: ReactNode, title: string) => (
    <button className="tb" data-menu={kind} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => setMenu(menu?.kind === kind ? null : { kind, anchor: e.currentTarget })}>{label}<Icon name="caret" /></button>
  );
  const sideTab = prefs.side || 'outline';
  const words = countWords(doc);
  const slugLine = isNew
    ? (title.trim() ? <>Saves as <code>{pageSlug(title)}</code>{title.includes('/') ? ' · slashes create nested pages' : ''}</> : <>Give the page a title. Use slashes for nested pages, like <code>runbooks/database</code></>)
    : title.trim() && title !== baseTitle.current ? <>Renames the page from <code>{page!.slug}</code></> : <code>{page!.slug}</code>;
  const status = saving ? 'Saving…' : dirty ? `Unsaved changes${draftAt ? ` · draft kept ${new Date(draftAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}` : ''}` : isNew ? 'New page' : 'No changes';
  const errors = checks.filter((x) => x.severity === 'error').length;
  const spaces = isNew ? [
    ...tree.groups.map((g) => ({ key: spaceKey('group', g.id), label: `${relPath(tree, g.full_path)} (group wiki)` })),
    ...tree.projects.filter((p) => p.wiki_enabled !== false).map((p) => ({ key: spaceKey('project', p.id), label: relPath(tree, p.path_with_namespace) })),
  ] : [];

  return (
    <>
      <header className="wk-bar">
        <button className="btn ghost" onClick={() => leave(isNew ? `/wiki/${space.key}` : pageUrl(space, page!.slug))}><Icon name="back" />{isNew ? 'Cancel' : 'Close editor'}</button>
        {isNew
          ? <select className="sel" id="wk-space-new" aria-label="Wiki to create the page in" value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>{spaces.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          : <span className="wk-crumbs"><span>{relPath(tree, space.path)}</span></span>}
        <div className="wk-titlebox">
          <input id="wk-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Page title" maxLength={255} aria-label="Page title" autoComplete="off" autoFocus={isNew && !title}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); view.current?.focus(); } }} />
          <span className="wk-slug" id="wk-slugline">{slugLine}</span>
        </div>
        <Segmented value={viewMode} onChange={setView} label="View" options={[['write', 'Write'], ['split', 'Split'], ['preview', 'Preview'], ['changes', 'Changes']]} />
        <span className={`wk-status${dirty ? ' dirty' : ''}`} id="wk-status">{status}</span>
        <button className="btn primary" id="wk-save" onClick={() => save()} disabled={saving}><Icon name="check" />{isNew ? 'Create page' : 'Save'}</button>
      </header>

      <div className="wk-tools" role="toolbar" aria-label="Formatting">
        <div className="tgrp">{tb('undo', <Icon name="undo" />, `Undo (${MOD}+Z)`)}{tb('redo', <Icon name="redo" />, `Redo (${MOD}+Shift+Z)`)}</div>
        <div className="tgrp">
          {mb('heading', <span style={{ fontWeight: 700 }}>H</span>, 'Heading')}
          {tb('bold', <b>B</b>, `Bold (${MOD}+B)`)}{tb('italic', <i style={{ fontFamily: 'Georgia, serif' }}>I</i>, `Italic (${MOD}+I)`)}
          {tb('strike', <s>S</s>, `Strikethrough (${MOD}+Shift+X)`)}{tb('code', <span className="mono" style={{ fontSize: 11.5 }}>&lt;/&gt;</span>, `Inline code (${MOD}+E)`)}
          {tb('mark', <mark style={{ background: 'var(--hit)', color: 'inherit', padding: '0 3px', borderRadius: 3 }}>M</mark>, 'Highlight')}
        </div>
        <div className="tgrp">
          {tb('ul', <Icon name="ul" />, `Bulleted list (${MOD}+Shift+8)`)}{tb('ol', <Icon name="ol" />, `Numbered list (${MOD}+Shift+7)`)}{tb('task', <Icon name="task" />, `Task list (${MOD}+Shift+9)`)}
          {tb('quote', <Icon name="quote" />, `Quote (${MOD}+Shift+.)`)}{tb('outdent', <Icon name="outdent" />, 'Outdent (Shift+Tab)')}{tb('indent', <Icon name="indent" />, 'Indent (Tab)')}
        </div>
        <div className="tgrp">
          {tb('link', <Icon name="link" />, `Link (${MOD}+K)`)}
          <button className="tb" title="Upload an image or file (or paste or drop it)" aria-label="Upload an image or file" onMouseDown={(e) => e.preventDefault()} onClick={() => document.getElementById('wk-file')?.click()}><Icon name="image" /></button>
          {mb('table', <Icon name="table" />, 'Insert a table')}{mb('code', <Icon name="code" />, 'Code block')}{tb('hr', <Icon name="hr" />, 'Divider')}
          {mb('insert', <><Icon name="plus" /><span style={{ fontWeight: 500 }}>Insert</span></>, 'Insert diagrams, math, callouts and more')}
        </div>
        {inTable && (
          <div className="tgrp ctx" id="wk-tctx"><span className="lbl-t">Table</span>
            {([['rowAbove', <Icon key="u" name="up" />, 'Insert row above'], ['rowBelow', <Icon key="d" name="down" />, 'Insert row below'], ['colLeft', '+◧', 'Insert column left'], ['colRight', '◨+', 'Insert column right'], ['delRow', '−row', 'Delete row'], ['delCol', '−col', 'Delete column']] as const).map(([op, label, t]) => (
              <button key={op} className={`tb${typeof label === 'string' ? ' txt' : ''}`} data-top={op} title={t} aria-label={t} onMouseDown={(e) => e.preventDefault()} onClick={() => runTable(op)}>{label}</button>
            ))}
            {([['left', '⇤', 'Align column left'], ['center', '↔', 'Center column'], ['right', '⇥', 'Align column right']] as const).map(([a, l, t]) => (
              <button key={a} className="tb txt" data-top="align" data-arg={a} title={t} aria-label={t} onMouseDown={(e) => e.preventDefault()} onClick={() => runTable('align', a)}>{l}</button>
            ))}
            <button className="tb txt" data-top="format" title="Tidy the table" onMouseDown={(e) => e.preventDefault()} onClick={() => runTable('format')}>Tidy</button>
          </div>
        )}
        <span className="tspacer" />
        <div className="tgrp">
          {mb('templates', <Icon name="tpl" />, 'Templates')}
          <button className="tb" title={`Find and replace (${MOD}+F)`} aria-label="Find and replace" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { const v = view.current!; if (searchPanelOpen(v.state)) closeSearchPanel(v); else openSearchPanel(v); }}><Icon name="find" /></button>
          <button className="tb" aria-pressed={prefs.wrap} title="Wrap long lines" aria-label="Wrap long lines" onClick={() => wikiPrefs.set({ wrap: !prefs.wrap })}><Icon name="wrap" /></button>
          <button className="tb" aria-pressed={prefs.lineNumbers} title="Line numbers" aria-label="Line numbers" onClick={() => wikiPrefs.set({ lineNumbers: !prefs.lineNumbers })}><Icon name="lines" /></button>
        </div>
        <div className="tgrp">
          {([['outline', <Icon key="o" name="outline" />, 'Outline'], ['checks', <span key="c" style={{ display: 'contents' }}><Icon name="check" /><span className={`badge ${errors ? 'bad' : checks.length ? '' : 'ok'}`}>{checks.length || '✓'}</span></span>, 'Checks'], ['keys', <Icon key="k" name="keys" />, 'Keyboard shortcuts']] as const).map(([v, l, t]) => (
            <button key={v} className="tb" aria-pressed={prefs.side === v} title={t} aria-label={t} data-side={v} onClick={() => wikiPrefs.set({ side: prefs.side === v ? '' : v })}>{l}</button>
          ))}
        </div>
      </div>

      {banner && (
        <div className={`wk-banner${banner.tone === 'warn' ? '' : ' ' + banner.tone}`} id="wk-banner">
          <span>{banner.text}</span>
          {banner.actions && <span className="acts">{banner.actions.map((a) => <button key={a.label} className={`btn sm${a.danger ? ' danger' : ''}`} onClick={a.run}>{a.label}</button>)}</span>}
        </div>
      )}

      <div className={`wk-edit v-${viewMode}${prefs.side ? ' side' : ''}`} id="wk-edit">
        <section className="wk-pane wk-src" aria-label="Markdown source">
          <div className="wk-cm" ref={host} />
          {showTemplates && <TemplatePicker onPick={(id) => applyTemplate(id, true)} />}
          <input type="file" id="wk-file" multiple hidden onChange={(e) => { uploadFiles([...(e.target.files || [])]); e.target.value = ''; }} />
        </section>
        <section className="wk-pane wk-prev" aria-label="Preview">
          <div className="wk-prev-h">
            <span>Preview</span>
            {c.mode === 'live' && <Segmented value={prefs.renderer} onChange={(v) => wikiPrefs.set({ renderer: v })} options={[['portal', 'Portal'], ['gitlab', 'GitLab']]} label="Renderer" />}
            <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>{gitlabHtml && 'error' in gitlabHtml ? `GitLab render failed: ${gitlabHtml.error}` : gitlabHtml ? 'Rendered by GitLab' : ''}</span>
            <label className="chk" style={{ marginLeft: 'auto' }}><input type="checkbox" id="wk-sync" checked={prefs.syncScroll} onChange={(e) => wikiPrefs.set({ syncScroll: e.target.checked })} />Scroll together</label>
          </div>
          <div className="wk-prev-scroll" id="wk-prev" ref={preview}>
            <MarkdownView id="wk-prev-md" ref={previewMd} html={gitlabHtml && 'html' in gitlabHtml ? gitlabHtml.html : rendered.html} onTask={(line) => toggleTaskInSource(line)} />
          </div>
        </section>
        {viewMode === 'changes' && <ChangesView base={base.current} current={doc} theirs={theirs} isNew={isNew} />}
        {prefs.side && <SidePanel tab={sideTab} setTab={(t) => wikiPrefs.set({ side: t })} headings={rendered.headings} checks={checks} cursorLine={cursor.line} goLine={goLine} />}
      </div>

      <footer className="wk-statusbar" id="wk-sb">
        <span>Ln {cursor.line + 1}, Col {cursor.col + 1}{cursor.sel ? ` · ${cursor.sel} selected` : ''}{cursor.cursors > 1 ? ` · ${cursor.cursors} cursors` : ''}</span>
        <span>{words.toLocaleString('en')} words</span><span>{doc.length.toLocaleString('en')} characters</span><span>{readingMinutes(words)} min read</span>
        <span>{doc.split('\n').length} lines</span><span className="r">Markdown · {relPath(tree, target.path)}</span>
      </footer>

      {menu && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)}>
          {menu.kind === 'heading' && [0, 1, 2, 3, 4, 5, 6].map((n) => (
            <PopItem key={n} icon={n ? `H${n}` : '¶'} label={n ? <span style={{ fontWeight: 700, fontSize: 17 - n }}>Heading {n}</span> : 'Paragraph'} hint={`${MOD}+Alt+${n}`} onPick={() => { setMenu(null); cmd(`h${n}` as CommandId); }} />
          ))}
          {menu.kind === 'code' && <><div className="hd">Language</div>{CODE_LANGS.map((l) => <PopItem key={l} label={l} onPick={() => { setMenu(null); codeBlock(view.current!, l === 'plaintext' ? '' : l); }} />)}</>}
          {menu.kind === 'insert' && INSERT_ITEMS.map((s) => (
            <PopItem key={s.id} icon={slashIcon(s.id)} label={s.label} hint={s.detail} onPick={() => { setMenu(null); if (s.id === 'upload') document.getElementById('wk-file')?.click(); else cmd(s.id as CommandId); }} />
          ))}
          {menu.kind === 'templates' && <><div className="hd">Insert a template at the cursor</div>{TEMPLATES.filter((t) => t.body).map((t) => <PopItem key={t.id} icon={<Icon name="tpl" />} label={t.name} onPick={() => { setMenu(null); applyTemplate(t.id, false); }} />)}</>}
          {menu.kind === 'table' && <TablePicker onPick={(cols, rows) => { setMenu(null); insertTable(view.current!, cols, rows); }} />}
        </Popover>
      )}
    </>
  );
}
