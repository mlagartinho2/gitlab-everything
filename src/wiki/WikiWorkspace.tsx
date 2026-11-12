import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useTree, useWikiSpace, type Tree, type WikiSpace } from '../api/hooks';
import { ErrorBox } from '../components/ui';
import { connection } from '../api/connection';
import { demoUploads } from './prefs';
import { Editor } from './Editor';
import { Reader } from './Reader';
import type { RenderContext } from '../lib/markdown/render';

/** The full-screen wiki: /wiki/:space/page/<slug>, /wiki/:space/edit/<slug>, /wiki/:space/new */
export function WikiWorkspace() {
  const { space: key = '' } = useParams();
  const tree = useTree();
  const space = useWikiSpace(tree.data, key);
  useEffect(() => {
    document.body.classList.add('wk-open');
    return () => document.body.classList.remove('wk-open');
  }, []);
  let body;
  if (tree.error || space.error) body = <div className="wk-empty"><ErrorBox error={tree.error || space.error} onRetry={() => { tree.refetch(); space.refetch(); }} /></div>;
  else if (!tree.data || !space.data) body = <div className="wk-empty"><div className="sk"><div style={{ width: '40%' }} /><div style={{ width: '80%' }} /><div style={{ width: '65%' }} /></div></div>;
  else {
    const home = (space.data.pages.find((p) => p.slug === 'home') || space.data.pages[0])?.slug;
    body = (
      <Routes>
        <Route index element={home ? <Navigate to={`page/${home}`} replace /> : <Reader tree={tree.data} space={space.data} />} />
        <Route path="page/*" element={<Reader tree={tree.data} space={space.data} />} />
        <Route path="edit/*" element={<Editor tree={tree.data} space={space.data} />} />
        <Route path="new" element={<Editor tree={tree.data} space={space.data} isNew />} />
      </Routes>
    );
  }
  return <div className="wk" role="dialog" aria-modal="true" aria-label="Wiki">{body}</div>;
}

/** Where "Portal" goes back to: the wiki tab of the group or project that owns the wiki. */
export const portalPath = (s: { type: 'group' | 'project'; id: number }) => `/${s.type === 'group' ? 'g' : 'p'}/${s.id}/wiki`;
export const pageUrl = (s: WikiSpace, slug: string, mode: 'page' | 'edit' = 'page') => `/wiki/${s.key}/${mode}/${slug}`;

export function renderContext(tree: Tree, space: WikiSpace, curSlug: string, tasks: boolean): RenderContext {
  return {
    slugs: new Set(space.pages.map((p) => p.slug)),
    curSlug,
    projectId: space.type === 'project' ? space.id : null,
    tasks,
    upload: (src) => { const p = src.replace(/^\//, ''); return demoUploads.get(p) || `${space.web}/-/wikis/${p}`; },
    findProject: (path) => [...tree.projMap.values()].find((x) => x.path_with_namespace === path || x.path_with_namespace.endsWith('/' + path) || x.path === path)?.id,
  };
}
export const gitlabRenderOptions = (space: WikiSpace) => ({ base: connection.get().base, wikiWeb: space.web });
