import { useState } from 'react';
import { usePipelines } from '../api/hooks';
import { useNames } from '../components/names';
import { Empty, ErrorBox, Icon, Person, SearchBox, Segmented, Skeleton, StatusPill } from '../components/ui';
import { ago, dur } from '../lib/format';
import { useOverlays } from '../state/overlays';
import type { ViewProps } from './ScopePage';

type Filter = 'all' | 'failed' | 'running' | 'success';
export function Pipelines({ tree, scope }: ViewProps) {
  const pipes = usePipelines(tree, scope);
  const [status, setStatus] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const { pname } = useNames();
  const o = useOverlays();
  if (pipes.error) return <ErrorBox error={pipes.error} onRetry={() => pipes.refetch()} />;
  if (!pipes.data) return <Skeleton />;
  const counts = { all: pipes.data.length, failed: 0, running: 0, success: 0 };
  pipes.data.forEach((p) => { if (p.status in counts) counts[p.status as Exclude<Filter, 'all'>]++; });
  const ql = q.trim().toLowerCase();
  const list = pipes.data.filter((p) => (status === 'all' || p.status === status) && (!ql || p.ref.toLowerCase().includes(ql) || pname(p.project_id).includes(ql))).slice(0, 200);
  return (
    <>
      <div className="toolbar">
        <Segmented value={status} onChange={setStatus} label="Status" options={[['all', `All ${counts.all}`], ['failed', `Failed ${counts.failed}`], ['running', `Running ${counts.running}`], ['success', `Passed ${counts.success}`]]} />
        <SearchBox value={q} onChange={setQ} placeholder="Filter by branch or project" />
        <span className="count">last 14 days · {scope.type === 'group' ? 'one request per project' : 'this project'}</span>
      </div>
      <div className="panel">
        {!list.length ? <Empty title="No pipelines match">Only the last 14 days are loaded. Try another status or clear the filter.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Status</th><th>Pipeline</th><th>Project</th><th>Triggered by</th><th className="r">Duration</th><th className="r">Created</th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="click" onClick={() => o.openPipeline(p)}>
                    <td><StatusPill status={p.status} /></td>
                    <td><div className="ttl mono" style={{ fontSize: 13 }}>#{p.id}</div><div className="sub"><Icon name="branch" />{p.ref} · {(p.source || '').replace(/_/g, ' ')}</div></td>
                    <td>{pname(p.project_id)}</td>
                    <td><Person user={p.user} /></td>
                    <td className="r num muted">{dur(p.duration ?? (p.status !== 'running' && p.updated_at ? (+new Date(p.updated_at) - +new Date(p.created_at)) / 1000 : null))}</td>
                    <td className="r num muted">{ago(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
