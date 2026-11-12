import type { ComponentType } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useConnection } from '../api/connection';
import { groupScope, inGroup, projectScope, scopeProjects, useTree, type Scope, type Tree } from '../api/hooks';
import { ErrorBox, Icon, Skeleton } from '../components/ui';
import { useOverlays } from '../state/overlays';
import { Activity } from './Activity';
import { ApiExplorer } from './ApiExplorer';
import { Issues } from './Issues';
import { Members } from './Members';
import { MergeRequests } from './MergeRequests';
import { Overview } from './Overview';
import { Pipelines } from './Pipelines';
import { Projects } from './Projects';
import { VIEWS, viewAllowed } from './registry';
import { Repository } from './Repository';
import { Search } from './Search';
import { WikiDirectory } from './WikiDirectory';

export interface ViewProps { tree: Tree; scope: Scope }
const VIEW_COMPONENTS: Record<string, ComponentType<ViewProps>> = {
  overview: Overview, projects: Projects, 'merge-requests': MergeRequests, issues: Issues, pipelines: Pipelines, repository: Repository,
  wiki: WikiDirectory, members: Members, activity: Activity, search: Search, 'api-explorer': ApiExplorer,
};

/** A group or project: header, view tabs and the selected view. */
export function ScopePage({ type }: { type: 'group' | 'project' }) {
  const { id, view = 'overview' } = useParams();
  const tree = useTree();
  if (tree.error) return <ErrorBox error={tree.error} onRetry={() => tree.refetch()} />;
  if (!tree.data) return <Skeleton />;
  const t = tree.data;
  const scope = type === 'group'
    ? (() => { const g = t.groups.find((x) => x.id === Number(id)); return g && groupScope(g); })()
    : (() => { const p = t.projMap.get(Number(id)); return p && projectScope(p); })();
  if (!scope) return <ErrorBox error={new Error(`This ${type} is not part of the group tree for ${t.root.full_path}.`)} />;
  if (!viewAllowed(view, type)) return <Navigate to={`/${type === 'group' ? 'g' : 'p'}/${id}/overview`} replace />;
  const View = VIEW_COMPONENTS[view];
  return (
    <>
      <ScopeHeader tree={t} scope={scope} />
      <nav className="tabs" aria-label="Views">
        {VIEWS.filter((v) => viewAllowed(v.id, type)).map((v) => (
          <Link key={v.id} to={`/${type === 'group' ? 'g' : 'p'}/${id}/${v.id}`} aria-current={v.id === view ? 'page' : undefined}>{v.label}</Link>
        ))}
        <Link to="/connection">Connection</Link>
      </nav>
      <View key={`${scope.type}-${scope.id}`} tree={t} scope={scope} />
    </>
  );
}

function ScopeHeader({ tree, scope }: ViewProps) {
  const c = useConnection();
  const { openNewIssue } = useOverlays();
  let meta: string;
  if (scope.type === 'group') {
    const subs = tree.groups.filter((g) => g.id !== scope.id && inGroup(g.full_path, scope)).length;
    const ps = tree.projects.filter((p) => inGroup(p.namespace.full_path, scope)).length;
    meta = `${subs} subgroup${subs === 1 ? '' : 's'} · ${ps} project${ps === 1 ? '' : 's'}`;
  } else {
    const p = tree.projMap.get(scope.id);
    meta = `${p?.visibility || ''}${p?.topics?.length ? ' · ' + p.topics.join(', ') : ''} · default branch ${p?.default_branch || 'main'}`;
  }
  const kind = scope.type === 'group' ? (scope.id === tree.root.id ? 'Top-level group' : 'Subgroup') : 'Project';
  return (
    <section className="scope-head">
      <div className="txt">
        <div className="eyebrow">{kind} <span className="faint">{meta}</span></div>
        <h1>{scope.name}</h1>
        <div className="path">{scope.full_path}</div>
        {scope.description && <p className="desc">{scope.description}</p>}
      </div>
      <div className="scope-actions">
        {c.mode === 'live' && <a className="btn" href={scope.web_url} target="_blank" rel="noopener noreferrer"><Icon name="ext" />Open in GitLab</a>}
        <button className="btn primary" onClick={() => openNewIssue(scopeProjects(tree, scope))}><Icon name="plus" />New issue</button>
      </div>
    </section>
  );
}
