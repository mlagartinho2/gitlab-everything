import { useGet, useGetAll } from '../api/hooks';
import type { Branch, Commit } from '../api/types';
import { ErrorBox, Icon, Skeleton, Tag } from '../components/ui';
import { ago } from '../lib/format';
import type { ViewProps } from './ScopePage';

export function Repository({ tree, scope }: ViewProps) {
  const branches = useGetAll<Branch>(`/projects/${scope.id}/repository/branches`, 2);
  const commits = useGet<Commit[]>(`/projects/${scope.id}/repository/commits?per_page=20`);
  if (branches.error || commits.error) return <ErrorBox error={branches.error || commits.error} />;
  if (!branches.data || !commits.data) return <Skeleton />;
  const sorted = [...branches.data].sort((a, b) => Number(b.default) - Number(a.default) || +new Date(b.commit?.committed_date || 0) - +new Date(a.commit?.committed_date || 0));
  return (
    <div className="grid-2">
      <div className="panel">
        <div className="panel-h"><h3>Recent commits</h3><span className="aside faint mono">{tree.projMap.get(scope.id)?.default_branch || 'main'}</span></div>
        <div className="tbl-wrap"><table className="tbl"><tbody>
          {commits.data.map((c) => (
            <tr key={c.id}><td><div className="ttl">{c.title}</div><div className="sub"><Icon name="commit" />{c.short_id} · {c.author_name}</div></td><td className="r num muted">{ago(c.committed_date || c.created_at)}</td></tr>
          ))}
        </tbody></table></div>
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Branches</h3><span className="aside faint mono">{branches.data.length}</span></div>
        <div className="tbl-wrap"><table className="tbl"><tbody>
          {sorted.map((b) => (
            <tr key={b.name}>
              <td><div className="ttl mono" style={{ fontSize: 13 }}>{b.name}</div>
                <div className="sub">{b.default && <Tag tone="acc">default</Tag>}{b.protected && <Tag>protected</Tag>}{b.merged && <Tag tone="info">merged</Tag>} {b.commit?.title}</div></td>
              <td className="r num muted">{ago(b.commit?.committed_date)}</td>
            </tr>
          ))}
        </tbody></table></div>
      </div>
    </div>
  );
}
