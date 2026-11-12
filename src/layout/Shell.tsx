import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useConnection } from '../api/connection';
import { relPath, useTree, type Tree } from '../api/hooks';
import { Icon } from '../components/ui';
import { useToast } from '../state/toast';
import { GroupTree } from './GroupTree';

/** Which group or project the URL points at, and which view. */
export function useRouteScope() {
  const { pathname } = useLocation();
  const m = matchPath('/:t/:id/:view?', pathname);
  if (!m || (m.params.t !== 'g' && m.params.t !== 'p')) return null;
  return { type: m.params.t === 'g' ? 'group' as const : 'project' as const, id: Number(m.params.id), view: m.params.view || 'overview' };
}

export function Shell() {
  const tree = useTree();
  const route = useRouteScope();
  const [railOpen, setRailOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setRailOpen(false), [pathname]);
  return (
    <>
      <TopBar tree={tree.data} onMenu={() => setRailOpen((v) => !v)} />
      <div className="shell">
        <aside className={`rail${railOpen ? ' open' : ''}`} aria-label="Groups and projects">
          <div className="rail-label">Top-level group</div>
          {tree.data ? <GroupTree tree={tree.data} selected={route} />
            : <p className="muted" style={{ padding: '6px 4px', margin: 0 }}>{tree.error ? (tree.error as Error).message : 'Loading groups…'}</p>}
          <RailFoot />
        </aside>
        <main className="main"><div className="main-in"><Outlet /></div></main>
      </div>
      {railOpen && <div className="scrim" onClick={() => setRailOpen(false)} />}
    </>
  );
}

function RailFoot() {
  return <div className="rail-foot"><Link to="/connection">Connection settings</Link> · <a href="https://docs.gitlab.com/ee/api/rest/" target="_blank" rel="noopener noreferrer">GitLab API docs</a></div>;
}

function TopBar({ tree, onMenu }: { tree?: Tree; onMenu: () => void }) {
  const c = useConnection();
  const qc = useQueryClient();
  const toast = useToast();
  const route = useRouteScope();
  const navigate = useNavigate();
  const crumbs = useMemo(() => {
    if (!tree || !route) return [];
    const full = route.type === 'group' ? tree.groups.find((g) => g.id === route.id)?.full_path : tree.projMap.get(route.id)?.path_with_namespace;
    if (!full) return [];
    const parts = full.split('/');
    const rootDepth = tree.root.full_path.split('/').length;
    const out: { label: string; to: string; current: boolean }[] = [];
    for (let i = rootDepth - 1; i < parts.length; i++) {
      const fp = parts.slice(0, i + 1).join('/');
      const last = i === parts.length - 1;
      if (last && route.type === 'project') out.push({ label: parts[i], to: `/p/${route.id}/${route.view}`, current: true });
      else {
        const g = tree.groups.find((x) => x.full_path === fp);
        if (g) out.push({ label: parts[i], to: `/g/${g.id}/${route.view === 'repository' ? 'overview' : route.view}`, current: last });
      }
    }
    return out;
  }, [tree, route]);
  const refresh = async () => {
    await qc.invalidateQueries();
    toast('Reloaded');
  };
  return (
    <header className="topbar">
      <div className="topbar-in">
        <button className="icon-btn only-narrow" onClick={onMenu} aria-label="Show group tree"><Icon name="menu" /></button>
        <Link className="brand" to="/" aria-label="GitLab Everything home">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="var(--accent)" /><rect x="6" y="6" width="12" height="12" rx="3" fill="none" stroke="var(--accent-fg)" strokeWidth="1.8" /><rect x="9.5" y="9.5" width="5" height="5" rx="1.2" fill="var(--accent-fg)" /></svg>
          <span>GitLab Everything</span>
        </Link>
        <nav className="crumbs" aria-label="Scope">
          {crumbs.map((cr, i) => (
            <span key={cr.to} style={{ display: 'contents' }}>
              {i > 0 && <span className="sep">/</span>}
              <button onClick={() => navigate(cr.to)} aria-current={cr.current ? 'page' : undefined} title={relPath(tree, cr.label)}>{cr.label}</button>
            </span>
          ))}
        </nav>
        <div className="top-actions">
          <Link className={`mode-chip${c.mode === 'live' ? ' live' : ''}`} to="/connection" style={{ textDecoration: 'none' }}>
            <span className="d" /><span>{c.mode === 'live' ? `Live · ${c.base.replace(/^https?:\/\//, '')}` : 'Demo data'}</span>
          </Link>
          <button className="icon-btn" onClick={refresh} aria-label="Reload data from GitLab" title="Reload data"><Icon name="retry" /></button>
        </div>
      </div>
    </header>
  );
}
