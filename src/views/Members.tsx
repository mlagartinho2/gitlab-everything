import { useState } from 'react';
import { useMembers } from '../api/hooks';
import { useNames } from '../components/names';
import { Avatar, Empty, ErrorBox, SearchBox, Skeleton, Tag } from '../components/ui';
import { ACCESS_LEVEL, ACCESS_TONE } from '../lib/labels';
import type { ViewProps } from './ScopePage';

export function Members({ tree, scope }: ViewProps) {
  const members = useMembers(tree, scope);
  const { rel } = useNames();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState(0);
  if (members.error) return <ErrorBox error={members.error} onRetry={() => members.refetch()} />;
  if (!members.data) return <Skeleton />;
  const ql = q.trim().toLowerCase();
  const rows = members.data.filter((r) => (!ql || r.user.name.toLowerCase().includes(ql) || r.user.username.toLowerCase().includes(ql)) && (!level || r.best === level));
  const levels = [...new Set(members.data.map((r) => r.best))].sort((a, b) => b - a);
  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Filter by name or username" />
        <select className="sel" value={level} onChange={(e) => setLevel(+e.target.value)} aria-label="Filter by role">
          <option value={0}>All roles</option>
          {levels.map((l) => <option key={l} value={l}>{ACCESS_LEVEL[l]}</option>)}
        </select>
        <span className="count">{members.data.length} people · {scope.type === 'group' ? 'inherited access plus direct grants in subgroups' : 'including inherited access'}</span>
      </div>
      <div className="panel">
        {!rows.length ? <Empty title="No members match">Clear the filter or choose another role.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Member</th><th>Highest role</th><th>Where access is granted</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user.id}>
                    <td><span className="person"><Avatar user={r.user} large /><span><div style={{ fontWeight: 500 }}>{r.user.name}</div><div className="mono muted">@{r.user.username}</div></span></span></td>
                    <td><Tag tone={ACCESS_TONE[r.best] || ''}>{ACCESS_LEVEL[r.best] || r.best}</Tag></td>
                    <td><div className="lbls">{r.where.map((w, k) => (
                      <Tag key={k} title={`${ACCESS_LEVEL[w.level] || ''}${w.expires ? ', expires ' + w.expires : ''}`}>{rel(w.path)} · {ACCESS_LEVEL[w.level] || w.level}{w.expires ? ` · until ${w.expires}` : ''}</Tag>
                    ))}</div></td>
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
