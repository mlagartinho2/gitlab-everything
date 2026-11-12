import { useNavigate } from 'react-router-dom';
import { latestDefault, scopeProjects, inGroup, useIssues, useMergeRequests, usePipelines, type PipelineRow } from '../api/hooks';
import { useNames } from '../components/names';
import { ErrorBox, Icon, Skeleton, StatusIcon, StatusPill, Tag, Tile } from '../components/ui';
import { DAY, ago } from '../lib/format';
import { useOverlays } from '../state/overlays';
import type { ViewProps } from './ScopePage';

export function Overview({ tree, scope }: ViewProps) {
  const mrs = useMergeRequests(scope);
  const issues = useIssues(scope);
  const pipes = usePipelines(tree, scope);
  const { pname, rel } = useNames();
  const o = useOverlays();
  const navigate = useNavigate();
  const err = mrs.error || issues.error || pipes.error;
  if (err) return <ErrorBox error={err} onRetry={() => { mrs.refetch(); issues.refetch(); pipes.refetch(); }} />;
  if (!mrs.data || !issues.data || !pipes.data) return <Skeleton />;

  const base = `/${scope.type === 'group' ? 'g' : 'p'}/${scope.id}`;
  const projects = scopeProjects(tree, scope);
  const latest = latestDefault(pipes.data);
  const failing = [...latest.values()].filter((p) => p.status === 'failed');
  const done = pipes.data.filter((p) => p.status === 'success' || p.status === 'failed');
  const okN = done.filter((p) => p.status === 'success').length;
  const rate = done.length ? Math.round((okN / done.length) * 100) : null;
  const isDraft = (m: { draft?: boolean; title: string }) => m.draft || /^draft:/i.test(m.title);
  const stale = mrs.data.filter((m) => !isDraft(m) && Date.now() - new Date(m.created_at).getTime() > 7 * DAY)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const bugs = issues.data.filter((i) => i.labels.includes('bug')).length;
  const sec = issues.data.filter((i) => i.labels.includes('security'));
  const lp = scope.type === 'project' ? latest.get(scope.id) : undefined;

  const attention = [
    ...failing.map((p) => (
      <li key={`p${p.id}`}><button onClick={() => o.openPipeline(p)}><StatusIcon status="failed" /><span className="t">{pname(p.project_id)}</span><span className="m">{p.ref} pipeline #{p.id} failed · {ago(p.created_at)}</span></button></li>
    )),
    ...sec.slice(0, 3).map((i) => (
      <li key={`i${i.id}`}><button onClick={() => o.openIssue(i)}><span className="sticon st-bad"><Icon name="shield" /></span><span className="t">{i.title}</span><span className="m">{pname(i.project_id)}#{i.iid} · security · {i.assignees?.length ? 'assigned' : 'unassigned'}</span></button></li>
    )),
    ...stale.slice(0, 4).map((m) => (
      <li key={`m${m.id}`}><button onClick={() => o.openMergeRequest(m)}><span className="sticon st-warn"><Icon name="merge" /></span><span className="t">{m.title}</span><span className="m">{pname(m.project_id)}!{m.iid} · open {Math.floor((Date.now() - +new Date(m.created_at)) / DAY)} days{m.reviewers?.length ? '' : ' · no reviewer'}</span></button></li>
    )),
  ];

  const kids = scope.type === 'group' ? tree.groups.filter((g) => g.parent_id === scope.id).sort((a, b) => a.name.localeCompare(b.name)) : [];

  return (
    <>
      <div className="tiles">
        {scope.type === 'project'
          ? <Tile label={`Latest on ${projects[0]?.default_branch || 'main'}`} value={lp ? <StatusPill status={lp.status} /> : <span className="muted" style={{ fontSize: 16 }}>No pipelines</span>} sub={lp ? `#${lp.id} · ${ago(lp.created_at)}` : 'Nothing in the last 14 days'} to={`${base}/pipelines`} tone={lp?.status === 'failed' ? 'bad' : ''} />
          : <Tile label="Projects" value={projects.length} sub={`${failing.length} failing on the default branch`} to={`${base}/projects`} tone={failing.length ? 'bad' : ''} />}
        <Tile label="Open merge requests" value={mrs.data.length} sub={`${stale.length} open longer than 7 days`} to={`${base}/merge-requests`} />
        <Tile label="Open issues" value={issues.data.length} sub={`${bugs} bug${bugs === 1 ? '' : 's'} · ${sec.length} security`} to={`${base}/issues`} />
        <Tile label="Pipeline pass rate" value={rate == null ? '—' : `${rate}%`} sub={`${okN} of ${done.length} finished · last 14 days`} to={`${base}/pipelines`} />
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-h"><h3>Pipelines per day</h3>
            <div className="aside legend"><span><i style={{ background: 'var(--ok)' }} />Passed</span><span><i style={{ background: 'var(--bad)' }} />Failed</span><span><i style={{ background: 'var(--faint)' }} />Running, canceled, other</span></div>
          </div>
          <div className="panel-b chart">{pipes.data.length ? <DayChart pipes={pipes.data} /> : <p className="muted" style={{ margin: 0 }}>No pipelines ran in the last 14 days.</p>}</div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Needs attention</h3><span className="aside faint mono">{attention.length}</span></div>
          {attention.length ? <ul className="att">{attention.slice(0, 9)}</ul> : <div className="panel-b muted">Nothing needs attention right now.</div>}
        </div>
      </div>
      {kids.length > 0 && (
        <div className="panel">
          <div className="panel-h"><h3>Subgroups</h3><span className="aside muted" style={{ fontSize: 12.5 }}>Each row covers the subgroup and everything nested under it</span></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Subgroup</th><th className="r">Projects</th><th className="r">Open MRs</th><th className="r">Open issues</th><th>Pass rate, 14 days</th><th>Default branches</th></tr></thead>
              <tbody>
                {kids.map((g) => {
                  const ids = new Set(tree.projects.filter((p) => inGroup(p.namespace.full_path, g)).map((p) => p.id));
                  const gp = pipes.data!.filter((p) => ids.has(p.project_id) && (p.status === 'success' || p.status === 'failed'));
                  const gok = gp.filter((p) => p.status === 'success').length;
                  const gfail = [...latest.values()].filter((p) => ids.has(p.project_id) && p.status === 'failed').length;
                  const pct = gp.length ? (gok / gp.length) * 100 : 0;
                  return (
                    <tr key={g.id} className="click" onClick={() => navigate(`/g/${g.id}/overview`)}>
                      <td><div className="ttl">{g.name}</div><div className="sub">{rel(g.full_path)}</div></td>
                      <td className="r num">{ids.size}</td>
                      <td className="r num">{mrs.data!.filter((m) => ids.has(m.project_id)).length}</td>
                      <td className="r num">{issues.data!.filter((i) => ids.has(i.project_id)).length}</td>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div className="bar-mini" title={`${gok} of ${gp.length} passed`}><span style={{ width: `${pct}%`, background: 'var(--ok)' }} /><span style={{ width: `${gp.length ? 100 - pct : 0}%`, background: 'var(--bad)' }} /></div><span className="num muted">{gp.length ? `${Math.round(pct)}%` : '—'}</span></div></td>
                      <td>{gfail ? <Tag tone="bad">{gfail} failing</Tag> : <Tag tone="ok">All green</Tag>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/** Stacked bars of passed, failed and other pipelines for each of the last 14 days. */
export function DayChart({ pipes }: { pipes: PipelineRow[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, k) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - k));
    return { d, key: d.toDateString(), ok: 0, bad: 0, other: 0 };
  });
  for (const p of pipes) {
    const day = days.find((x) => x.key === new Date(p.created_at).toDateString());
    if (day) day[p.status === 'success' ? 'ok' : p.status === 'failed' ? 'bad' : 'other']++;
  }
  const max = Math.max(1, ...days.map((x) => x.ok + x.bad + x.other));
  const step = max <= 10 ? 2 : max <= 25 ? 5 : max <= 60 ? 10 : 25;
  const top = Math.ceil(max / step) * step;
  const W = 640, H = 220, L = 34, R = 8, T = 10, B = 28;
  const bw = (W - L - R) / 14, barW = Math.min(26, bw * 0.62);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pipelines per day over the last 14 days">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} strokeDasharray={v ? '2 4' : undefined} />
          <text x={L - 8} y={y(v) + 3.5} textAnchor="end">{v}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = L + i * bw + (bw - barW) / 2;
        let base = 0;
        const label = d.d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
        return (
          <g key={d.key}>
            {(['ok', 'bad', 'other'] as const).map((k) => {
              if (!d[k]) return null;
              const y1 = y(base + d[k]), h = y(base) - y1;
              base += d[k];
              return <rect key={k} x={x} y={y1} width={barW} height={Math.max(0, h - 1)} rx={2} fill={k === 'ok' ? 'var(--ok)' : k === 'bad' ? 'var(--bad)' : 'var(--faint)'}><title>{`${label}: ${d.ok} passed, ${d.bad} failed, ${d.other} other`}</title></rect>;
            })}
            {i % 2 === 1 && <text x={L + i * bw + bw / 2} y={H - 9} textAnchor="middle">{i === 13 ? 'Today' : label}</text>}
          </g>
        );
      })}
    </svg>
  );
}
