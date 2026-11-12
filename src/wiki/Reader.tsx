import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { enc, request } from '../api/client';
import { useConnection } from '../api/connection';
import { spaceKey, useGet, useKey, useWrite, type Tree, type WikiSpace } from '../api/hooks';
import type { WikiPage } from '../api/types';
import { Icon, Segmented, Skeleton } from '../components/ui';
import { useNames } from '../components/names';
import { countWords, readingMinutes } from '../lib/format';
import { findAnchor, mdRender } from '../lib/markdown/render';
import { sanitizeGitLabHtml } from '../lib/markdown/sanitize';
import { buildPageTree, sortedChildren, type PageNode } from '../lib/wiki/tree';
import { useCopy, useToast } from '../state/toast';
import { MarkdownView } from './MarkdownView';
import { useWikiPrefs, wikiPrefs } from './prefs';
import { gitlabRenderOptions, pageUrl, portalPath, renderContext } from './WikiWorkspace';

export function Reader({ tree, space }: { tree: Tree; space: WikiSpace }) {
  const slug = useParams()['*'] || '';
  const { hash } = useLocation();
  const navigate = useNavigate();
  const prefs = useWikiPrefs();
  const c = useConnection();
  const { rel } = useNames();
  const page = useGet<WikiPage>(slug ? `${space.base}/${enc(slug)}` : null);
  const writeApi = useWrite();
  const toast = useToast();
  const copy = useCopy();
  const qc = useQueryClient();
  const key = useKey();
  const scroller = useRef<HTMLDivElement>(null);
  const md = useRef<HTMLDivElement>(null);
  const [pq, setPq] = useState('');
  const [armed, setArmed] = useState(false);
  const [gitlabHtml, setGitlabHtml] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  // On phones the page list starts closed; on larger screens it follows the saved preference.
  const [narrowNav, setNarrowNav] = useState(false);
  const narrow = window.innerWidth <= 860;
  const navOpen = narrow ? narrowNav : prefs.navOpen;

  const rendered = useMemo(() => (page.data ? mdRender(page.data.content, renderContext(tree, space, page.data.slug, true)) : null), [page.data, tree, space]);
  const useGitLab = c.mode === 'live' && prefs.renderer === 'gitlab';
  useEffect(() => {
    setGitlabHtml(null);
    if (!useGitLab || !page.data) return;
    let off = false;
    const body: Record<string, unknown> = { text: page.data.content, gfm: true };
    if (space.type === 'project') body.project = tree.projMap.get(space.id)?.path_with_namespace;
    request<{ html: string }>('POST', '/markdown', body).then((r) => {
      if (off) return;
      if (r.status < 300) setGitlabHtml(sanitizeGitLabHtml(r.data.html, gitlabRenderOptions(space)));
      else toast('GitLab could not render this page; showing the portal rendering.', true);
    });
    return () => { off = true; };
  }, [useGitLab, page.data, space, tree, toast]);

  // Jump to #anchor from the URL, otherwise start at the top.
  useEffect(() => {
    if (!rendered || !scroller.current) return;
    const a = decodeURIComponent(hash.slice(1));
    const t = a && md.current ? findAnchor(md.current, a) : null;
    if (t) t.scrollIntoView({ block: 'start' }); else scroller.current.scrollTop = 0;
  }, [rendered, hash]);

  // "On this page": highlight the section being read.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const onScroll = () => requestAnimationFrame(() => {
      const hs = [...sc.querySelectorAll<HTMLElement>('.md h1[id],.md h2[id],.md h3[id]')];
      const top = sc.getBoundingClientRect().top;
      let cur: string | null = null;
      for (const h of hs) { if (h.getBoundingClientRect().top - top < 100) cur = h.id.replace(/^(wkh-|user-content-)/, ''); else break; }
      setActive(cur);
    });
    sc.addEventListener('scroll', onScroll);
    onScroll();
    return () => sc.removeEventListener('scroll', onScroll);
  }, [rendered]);

  // E opens the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'e' || e.metaKey || e.ctrlKey || e.altKey || !page.data) return;
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName) || document.querySelector('.drawer')) return;
      e.preventDefault();
      navigate(pageUrl(space, page.data.slug, 'edit'));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [page.data, space, navigate]);

  const toggleTask = async (line: number, _checked: boolean, input: HTMLInputElement) => {
    const pg = page.data!;
    const lines = pg.content.replace(/\r\n?/g, '\n').split('\n');
    const before = lines[line];
    if (before == null) return;
    lines[line] = before.replace(/\[( |x|X)\]/, (_m, ch) => (ch === ' ' ? '[x]' : '[ ]'));
    input.disabled = true;
    const top = scroller.current?.scrollTop;
    try {
      await writeApi('PUT', `${space.base}/${enc(pg.slug)}`, { content: lines.join('\n') });
      toast(input.checked ? 'Task marked done and saved' : 'Task reopened and saved');
      requestAnimationFrame(() => { if (scroller.current && top != null) scroller.current.scrollTop = top; });
    } catch (e) {
      input.checked = !input.checked;
      input.disabled = false;
      toast((e as Error).message, true);
    }
  };
  const del = async () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 5000); return; }
    const title = page.data?.title || slug;
    try {
      await writeApi('DELETE', `${space.base}/${enc(slug)}`);
      toast(`Deleted “${title}”`);
      await qc.invalidateQueries({ queryKey: [key, 'wiki', space.key] });
      navigate(`/wiki/${space.key}`, { replace: true });
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const goWiki = (s: string, anchor: string) => {
    if (space.pages.some((p) => p.slug === s)) navigate(pageUrl(space, s) + (anchor ? '#' + anchor : ''));
    else navigate(`/wiki/${space.key}/new?title=${encodeURIComponent(s.replace(/-/g, ' '))}`);
  };
  const setNav = (v: boolean) => (narrow ? setNarrowNav(v) : wikiPrefs.set({ navOpen: v }));

  const spaces = useMemo(() => [
    ...tree.groups.map((g) => ({ key: spaceKey('group', g.id), label: `${rel(g.full_path)} (group wiki)` })),
    ...tree.projects.filter((p) => p.wiki_enabled !== false).map((p) => ({ key: spaceKey('project', p.id), label: rel(p.path_with_namespace) })),
  ], [tree, rel]);
  const parts = slug.split('/');
  const words = page.data ? countWords(page.data.content) : 0;
  const hs = rendered?.headings.filter((h) => h.level <= 3) || [];
  const minLevel = Math.min(...hs.map((h) => h.level), 3);

  return (
    <>
      <header className="wk-bar">
        <button className="btn ghost" onClick={() => navigate(portalPath(space))}><Icon name="back" />Portal</button>
        <button className="icon-btn" onClick={() => setNav(!navOpen)} aria-label="Show or hide the page list" title="Page list"><Icon name="outline" /></button>
        <select className="sel" id="wk-space" aria-label="Wiki" value={space.key} onChange={(e) => navigate(`/wiki/${e.target.value}`)}>
          {spaces.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div className="wk-crumbs" id="wk-crumbs">
          <span>{rel(space.path)}</span>
          {parts.slice(0, -1).map((p) => <span key={p}><span className="faint">/</span><span>{p}</span></span>)}
          {page.data && <><span className="faint">/</span><b>{page.data.title}</b></>}
        </div>
        <div className="wk-acts">
          {c.mode === 'live' && <Segmented value={prefs.renderer} onChange={(v) => wikiPrefs.set({ renderer: v })} options={[['portal', 'Portal'], ['gitlab', 'GitLab']]} label="Renderer" />}
          <button className="tb" aria-pressed={prefs.wide} onClick={() => wikiPrefs.set({ wide: !prefs.wide })} title={prefs.wide ? 'Narrow the text column' : 'Use the full width'} aria-label="Toggle full width"><Icon name="expand" /></button>
          <button className="btn" onClick={() => navigate(`/wiki/${space.key}/new`)}><Icon name="plus" />New page</button>
          {page.data && <button className={`btn danger${armed ? ' armed' : ''}`} id="wk-del" onClick={del}><Icon name="trash" />{armed ? 'Confirm delete' : 'Delete'}</button>}
          {page.data && c.mode === 'live' && <a className="btn" href={`${space.web}/-/wikis/${page.data.slug}`} target="_blank" rel="noopener noreferrer"><Icon name="ext" />Open in GitLab</a>}
          {page.data && <button className="btn primary" id="wk-editbtn" onClick={() => navigate(pageUrl(space, page.data!.slug, 'edit'))}><Icon name="pencil" />Edit <kbd style={{ background: 'none', borderColor: 'currentColor', opacity: 0.7 }}>E</kbd></button>}
        </div>
      </header>
      <div className={`wk-read${navOpen ? '' : ' nonav'}`} id="wk-read">
        <aside className="wk-nav" aria-label="Pages">
          <label className="search"><Icon name="search" /><input id="wk-pq" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Filter pages" autoComplete="off" /></label>
          <PageTree space={space} current={slug} q={pq} onOpen={(s) => { if (window.innerWidth <= 860) setNav(false); navigate(pageUrl(space, s)); }} />
        </aside>
        <main className="wk-article" id="wk-scroll" ref={scroller}>
          <article className={`wk-doc${prefs.wide ? ' wide' : ''}`} id="wk-doc">
            {!slug ? (
              <div className="wk-empty">
                <div className="eyebrow"><Icon name="book" /> {rel(space.path)}</div>
                <h2 style={{ marginTop: 10 }}>This wiki has no pages yet</h2>
                <p>Start with a Home page. It becomes the wiki's landing page.</p>
                <button className="btn primary" onClick={() => navigate(`/wiki/${space.key}/new?title=Home`)}><Icon name="plus" />Create the Home page</button>
              </div>
            ) : page.error ? (
              <div className="wk-empty">
                <h2>This page could not open</h2><p>{(page.error as Error).message}</p>
                {(page.error as { status?: number }).status === 404 && <button className="btn primary" onClick={() => navigate(`/wiki/${space.key}/new?title=${encodeURIComponent(slug.replace(/-/g, ' '))}`)}><Icon name="plus" />Create “{slug}”</button>}
              </div>
            ) : !page.data || !rendered ? <Skeleton /> : (
              <>
                <div className="eyebrow"><Icon name={space.type === 'group' ? 'group' : 'repo'} /> {rel(space.path)} <span className="faint">{space.type === 'group' ? 'group wiki · ' : ''}{page.data.format || 'markdown'}</span></div>
                <h1 className="pt">{page.data.title}</h1>
                <div className="wk-meta"><span>{page.data.slug}</span><span>{words.toLocaleString('en')} words</span><span>{readingMinutes(words)} min read</span><span>{rendered.headings.length} section{rendered.headings.length === 1 ? '' : 's'}</span></div>
                {page.data.format && page.data.format !== 'markdown'
                  ? <pre>{page.data.content}</pre>
                  : <MarkdownView id="wk-md" ref={md} html={gitlabHtml ?? rendered.html} onTask={gitlabHtml ? undefined : toggleTask} onWikiLink={goWiki}
                      onSectionLink={(a) => copy(c.mode === 'live' ? `${space.web}/-/wikis/${slug}#${a}` : `${slug}#${a}`, 'Link to this section copied')} />}
              </>
            )}
          </article>
        </main>
        <aside className="wk-toc" aria-label="On this page">
          {hs.length > 0 && <h4>On this page</h4>}
          {hs.map((h) => (
            <a key={h.id} href="#" className={active === h.id ? 'on' : ''} style={{ paddingLeft: (h.level - minLevel) * 12 + 10 }}
              onClick={(e) => { e.preventDefault(); if (md.current) findAnchor(md.current, h.id)?.scrollIntoView({ block: 'start' }); }}>{h.text}</a>
          ))}
        </aside>
      </div>
    </>
  );
}

function PageTree({ space, current, q, onOpen }: { space: WikiSpace; current: string; q: string; onOpen: (slug: string) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const root = useMemo(() => buildPageTree(space.pages), [space.pages]);
  const ql = q.trim().toLowerCase();
  const render = (n: PageNode, depth: number): (JSX.Element | null)[] => sortedChildren(n).map((c) => {
    const label = c.page ? c.page.title : c.name;
    const sub = c.children.size ? render(c, depth + 1).filter(Boolean) : [];
    if (ql && !label.toLowerCase().includes(ql) && !c.path.toLowerCase().includes(ql) && !sub.length) return null;
    const isOpen = !!ql || open.has(c.path) || current.startsWith(c.path + '/');
    const toggle = () => setOpen((s) => { const x = new Set(s); if (x.has(c.path)) x.delete(c.path); else x.add(c.path); return x; });
    return (
      <div key={c.path}>
        <div className={`pnode${c.page ? '' : ' dir'}`} style={{ paddingLeft: depth * 14 }} aria-current={c.page?.slug === current ? 'page' : undefined}>
          {c.children.size ? <button className="tw" onClick={toggle} aria-expanded={isOpen} aria-label={`Expand ${label}`}><Icon name="chev" /></button> : <span className="tw blank" />}
          {c.page
            ? <button className="pl" onClick={() => onOpen(c.page!.slug)}><Icon name="book" /><span>{label}</span></button>
            : <button className="pl" onClick={toggle}><Icon name="group" /><span>{label}</span></button>}
        </div>
        {isOpen && sub}
      </div>
    );
  });
  const items = render(root, 0).filter(Boolean);
  return <div className="ptree" id="wk-tree">{items.length ? items : <p className="faint" style={{ margin: 6 }}>{space.pages.length ? 'No pages match.' : 'No pages yet.'}</p>}</div>;
}
