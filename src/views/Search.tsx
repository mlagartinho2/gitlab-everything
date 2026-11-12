import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { scopeBase, spaceKey, useGetAll } from '../api/hooks';
import type { Issue, MergeRequest, Project, WikiBlob } from '../api/types';
import { useNames } from '../components/names';
import { Empty, Icon, Labels, Segmented, Skeleton } from '../components/ui';
import { ago } from '../lib/format';
import { useOverlays } from '../state/overlays';
import type { ViewProps } from './ScopePage';

type Scope = 'projects' | 'issues' | 'merge_requests' | 'wiki_blobs';
export function Search({ scope }: ViewProps) {
  const [kind, setKind] = useState<Scope>('projects');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const path = q ? `${scopeBase(scope)}/search?scope=${kind}&search=${encodeURIComponent(q)}` : null;
  const res = useGetAll<unknown>(path, 1);
  const { pname, rel } = useNames();
  const o = useOverlays();
  const navigate = useNavigate();
  const submit = (e: FormEvent) => { e.preventDefault(); setQ(input.trim()); };

  let body;
  if (!q) body = <Empty title={`Search ${scope.name}`}>Search covers every project, issue, merge request and wiki page under the selected group or project.</Empty>;
  else if (res.error) body = <Empty title="This search did not run">{(res.error as Error).message}{kind === 'wiki_blobs' && scope.type === 'group' ? ' Searching wikis across a whole group needs advanced search, a Premium feature. Select a project to search its wiki.' : ''}</Empty>;
  else if (!res.data) body = <Skeleton />;
  else if (!res.data.length) body = <Empty title="No results">Nothing in {scope.name} matches “{q}”.</Empty>;
  else if (kind === 'projects') body = (
    <div className="tbl-wrap"><table className="tbl"><tbody>
      {(res.data as Project[]).map((p) => (
        <tr key={p.id} className="click" onClick={() => navigate(`/p/${p.id}/overview`)}><td><div className="ttl">{p.name}</div><div className="sub">{rel(p.path_with_namespace)}</div></td><td className="muted">{p.description}</td></tr>
      ))}
    </tbody></table></div>
  );
  else if (kind === 'wiki_blobs') body = (
    <div className="tbl-wrap"><table className="tbl"><tbody>
      {(res.data as WikiBlob[]).map((h, k) => {
        const slug = String(h.path || h.filename || '').replace(/\.(md|markdown|rdoc|asciidoc|adoc|org|textile)$/, '');
        return (
          <tr key={k} className="click" onClick={() => navigate(`/wiki/${spaceKey('project', h.project_id)}/page/${slug}`)}>
            <td><div className="ttl"><Icon name="book" />{slug}</div><div className="sub">{pname(h.project_id)} wiki · line {h.startline}</div></td>
            <td><pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>{h.data}</pre></td>
          </tr>
        );
      })}
    </tbody></table></div>
  );
  else {
    const isMR = kind === 'merge_requests';
    body = (
      <div className="tbl-wrap"><table className="tbl"><tbody>
        {(res.data as (Issue | MergeRequest)[]).map((i) => (
          <tr key={i.id} className="click" onClick={() => (isMR ? o.openMergeRequest(i as MergeRequest) : o.openIssue(i as Issue))}>
            <td><div className="ttl">{i.title}</div><div className="sub">{pname(i.project_id)}{isMR ? '!' : '#'}{i.iid} · {i.state}</div></td>
            <td><Labels labels={i.labels} /></td>
            <td className="r num muted">{ago(i.updated_at)}</td>
          </tr>
        ))}
      </tbody></table></div>
    );
  }
  return (
    <>
      <form className="toolbar" onSubmit={submit}>
        <Segmented value={kind} onChange={setKind} label="What to search" options={[['projects', 'Projects'], ['issues', 'Issues'], ['merge_requests', 'Merge requests'], ['wiki_blobs', 'Wiki']]} />
        <label className="search"><Icon name="search" /><input id="searchInput" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search terms" autoComplete="off" /></label>
        <button className="btn primary" type="submit">Search</button>
        <span className="count mono">GET {scope.type === 'group' ? '/groups/:id' : '/projects/:id'}/search</span>
      </form>
      <div className="panel">{body}</div>
    </>
  );
}
