import { useState } from 'react';
import { useIssues } from '../api/hooks';
import { useNames } from '../components/names';
import { Empty, ErrorBox, Labels, Person, SearchBox, Segmented, Skeleton } from '../components/ui';
import { ago } from '../lib/format';
import { useOverlays } from '../state/overlays';
import type { ViewProps } from './ScopePage';

export function Issues({ scope }: ViewProps) {
  const [state, setState] = useState<'opened' | 'closed'>('opened');
  const [q, setQ] = useState('');
  const [label, setLabel] = useState('');
  const issues = useIssues(scope, state);
  const { pname } = useNames();
  const o = useOverlays();
  const all = issues.data || [];
  const labels = [...new Set(all.flatMap((i) => i.labels))].sort();
  const ql = q.trim().toLowerCase();
  const list = all.filter((i) => (!ql || i.title.toLowerCase().includes(ql) || pname(i.project_id).includes(ql)) && (!label || i.labels.includes(label)));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="toolbar">
        <Segmented value={state} onChange={setState} options={[['opened', 'Open'], ['closed', 'Closed']]} label="State" />
        <SearchBox value={q} onChange={setQ} placeholder="Filter by title or project" />
        <span className="count">{issues.data?.length ?? '…'} {state === 'opened' ? 'open' : 'closed'}</span>
      </div>
      {labels.length > 0 && (
        <div className="toolbar">
          <div className="chips">
            {['', ...labels].map((l) => <button key={l || 'all'} aria-pressed={label === l} onClick={() => setLabel(l)}>{l || 'All labels'}</button>)}
          </div>
        </div>
      )}
      {issues.error ? <ErrorBox error={issues.error} onRetry={() => issues.refetch()} /> : !issues.data ? <Skeleton /> : (
        <div className="panel">
          {!list.length ? <Empty title="No issues here">Nothing matches this state and filter.</Empty> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Issue</th><th>Labels</th><th>Assignee</th><th>Milestone</th><th>Due</th><th className="r">Updated</th></tr></thead>
                <tbody>
                  {list.map((i) => {
                    const over = !!i.due_date && i.state === 'opened' && i.due_date < today;
                    return (
                      <tr key={i.id} className="click" onClick={() => o.openIssue(i)}>
                        <td><div className="ttl">{i.title}</div><div className="sub">{pname(i.project_id)}#{i.iid} · opened {ago(i.created_at)} by {i.author?.name}</div></td>
                        <td><Labels labels={i.labels} /></td>
                        <td>{i.assignees?.length ? <Person user={i.assignees[0]} /> : <span className="faint">Unassigned</span>}</td>
                        <td className="mono muted">{i.milestone?.title || '—'}</td>
                        <td className="num">{i.due_date ? <span className={over ? 'tag bad' : 'muted'}>{i.due_date}</span> : <span className="faint">—</span>}</td>
                        <td className="r num muted">{ago(i.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
