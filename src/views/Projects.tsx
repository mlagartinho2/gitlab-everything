import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { latestDefault, scopeProjects, useMergeRequests, usePipelines } from '../api/hooks';
import { useNames } from '../components/names';
import { Empty, ErrorBox, SearchBox, Skeleton, StatusPill, Tag } from '../components/ui';
import { ago } from '../lib/format';
import type { ViewProps } from './ScopePage';

export function Projects({ tree, scope }: ViewProps) {
  const pipes = usePipelines(tree, scope);
  const mrs = useMergeRequests(scope);
  const { rel } = useNames();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('activity');
  if (pipes.error || mrs.error) return <ErrorBox error={pipes.error || mrs.error} />;
  if (!pipes.data || !mrs.data) return <Skeleton />;
  const projects = scopeProjects(tree, scope);
  const latest = latestDefault(pipes.data);
  const mrc: Record<number, number> = {};
  mrs.data.forEach((m) => { mrc[m.project_id] = (mrc[m.project_id] || 0) + 1; });
  const ql = q.trim().toLowerCase();
  let ps = projects.filter((p) => !ql || p.path_with_namespace.toLowerCase().includes(ql) || (p.description || '').toLowerCase().includes(ql));
  if (sort === 'name') ps = [...ps].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'failing') ps = [...ps].sort((a, b) => Number(latest.get(b.id)?.status === 'failed') - Number(latest.get(a.id)?.status === 'failed'));
  if (sort === 'issues') ps = [...ps].sort((a, b) => (b.open_issues_count || 0) - (a.open_issues_count || 0));
  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Filter projects" />
        <select className="sel" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort projects">
          <option value="activity">Recently active</option><option value="failing">Failing first</option>
          <option value="issues">Most open issues</option><option value="name">Name</option>
        </select>
        <span className="count">{projects.length} projects · <span className="mono">include_subgroups=true</span></span>
      </div>
      <div className="panel">
        {!ps.length ? <Empty title="No projects match">Try a shorter filter, or pick a different group in the tree.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Project</th><th>Default branch</th><th className="r">Open MRs</th><th className="r">Open issues</th><th>Visibility</th><th className="r">Last activity</th></tr></thead>
              <tbody>
                {ps.map((p) => {
                  const lp = latest.get(p.id);
                  return (
                    <tr key={p.id} className="click" onClick={() => navigate(`/p/${p.id}/overview`)}>
                      <td><div className="ttl">{p.name}</div><div className="sub">{rel(p.namespace.full_path)}{p.topics?.length ? ' · ' + p.topics[0] : ''}</div></td>
                      <td>{lp ? <StatusPill status={lp.status} /> : <span className="faint">No recent pipeline</span>}</td>
                      <td className="r num">{mrc[p.id] || 0}</td>
                      <td className="r num">{p.open_issues_count ?? '—'}</td>
                      <td><Tag>{p.visibility}</Tag></td>
                      <td className="r num muted">{ago(p.last_activity_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
