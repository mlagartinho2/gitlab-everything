import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection } from '../api/connection';
import { useWikiSpaces } from '../api/hooks';
import { useNames } from '../components/names';
import { Empty, ErrorBox, Icon, SearchBox, Skeleton } from '../components/ui';
import type { ViewProps } from './ScopePage';

/** Every wiki under the scope with its pages. Pages open in the full-screen wiki workspace. */
export function WikiDirectory({ tree, scope }: ViewProps) {
  const spaces = useWikiSpaces(tree, scope);
  const { rel } = useNames();
  const c = useConnection();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  if (spaces.error) return <ErrorBox error={spaces.error} onRetry={() => spaces.refetch()} />;
  if (!spaces.data) return <Skeleton />;
  const all = spaces.data;
  const withPages = all.filter((s) => s.pages.length);
  const emptyOk = all.filter((s) => !s.pages.length && !s.error);
  const groupErr = all.filter((s) => s.type === 'group' && s.error).length;
  const total = withPages.reduce((n, s) => n + s.pages.length, 0);
  const defaultSpace = all.find((s) => s.type === scope.type && s.id === scope.id && !s.error) || all.find((s) => !s.error);
  const ql = q.trim().toLowerCase();
  const rows = withPages.map((s) => ({
    s,
    pages: s.pages.filter((p) => !ql || p.title.toLowerCase().includes(ql) || p.slug.toLowerCase().includes(ql) || s.path.toLowerCase().includes(ql))
      .sort((a, b) => Number(b.slug === 'home') - Number(a.slug === 'home') || a.slug.localeCompare(b.slug)),
  })).filter((r) => r.pages.length);
  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Filter pages" />
        {defaultSpace && <button className="btn primary" onClick={() => navigate(`/wiki/${defaultSpace.key}/new`)}><Icon name="plus" />New page</button>}
        <span className="count">{total} page{total === 1 ? '' : 's'} in {withPages.length} of {all.length} wikis · pages open full screen</span>
      </div>
      {groupErr > 0 && c.mode === 'live' && <p className="muted" style={{ margin: '-4px 0 14px', fontSize: 13 }}>Group wikis were not available for {groupErr} group{groupErr === 1 ? '' : 's'}. They need GitLab Premium or Ultimate, or the wiki is turned off.</p>}
      <div className="panel">
        {!total ? <Empty title="No wiki pages yet">None of the wikis in this scope have pages. Create the first one with New page.</Empty>
          : !rows.length ? <Empty title="No pages match">Clear the filter to see every page.</Empty> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Page</th><th>Path</th></tr></thead>
                <tbody>
                  {rows.map(({ s, pages }) => [
                    <tr key={s.key} className="grp"><td colSpan={2}><div className="grp-h"><Icon name={s.type === 'group' ? 'group' : 'repo'} /><span>{rel(s.path)}</span>{s.type === 'group' && <span className="tag">group wiki</span>}<span className="faint">{s.pages.length} page{s.pages.length === 1 ? '' : 's'}</span><button className="btn sm" onClick={() => navigate(`/wiki/${s.key}`)}>Open wiki</button></div></td></tr>,
                    ...pages.map((p) => (
                      <tr key={s.key + p.slug} className="click" onClick={() => navigate(`/wiki/${s.key}/page/${p.slug}`)}>
                        <td><div className="ttl"><Icon name="book" />{p.title}</div></td><td className="mono muted">{p.slug}</td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          )}
      </div>
      {emptyOk.length > 0 && (
        <p className="muted" style={{ margin: '14px 0 0', fontSize: 13 }}>
          {emptyOk.length} more wiki{emptyOk.length === 1 ? ' has' : 's have'} no pages yet:{' '}
          {emptyOk.slice(0, 6).map((s) => <button key={s.key} className="btn sm ghost" onClick={() => navigate(`/wiki/${s.key}/new`)}>{rel(s.path)}</button>)}{emptyOk.length > 6 ? ' …' : ''}
        </p>
      )}
    </>
  );
}
