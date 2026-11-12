import { useState } from 'react';
import { useMergeRequests } from '../api/hooks';
import { mrStatus } from '../components/Drawers';
import { useNames } from '../components/names';
import { AvatarStack, Empty, ErrorBox, Icon, Labels, Person, SearchBox, Segmented, Skeleton, Tag } from '../components/ui';
import { ago } from '../lib/format';
import { useOverlays } from '../state/overlays';
import type { ViewProps } from './ScopePage';

type State = 'opened' | 'merged' | 'closed';
export function MergeRequests({ scope }: ViewProps) {
  const [state, setState] = useState<State>('opened');
  const [q, setQ] = useState('');
  const [hideDrafts, setHideDrafts] = useState(false);
  const mrs = useMergeRequests(scope, state);
  const { pname } = useNames();
  const o = useOverlays();
  const isDraft = (m: { draft?: boolean; title: string }) => m.draft || /^draft:/i.test(m.title);
  const ql = q.trim().toLowerCase();
  const list = (mrs.data || []).filter((m) => (!ql || m.title.toLowerCase().includes(ql) || m.source_branch.toLowerCase().includes(ql) || pname(m.project_id).includes(ql)) && !(hideDrafts && isDraft(m)));
  return (
    <>
      <div className="toolbar">
        <Segmented value={state} onChange={setState} options={[['opened', 'Open'], ['merged', 'Merged'], ['closed', 'Closed']]} label="State" />
        <SearchBox value={q} onChange={setQ} placeholder="Filter by title, branch or project" />
        <label className="chk"><input type="checkbox" checked={hideDrafts} onChange={(e) => setHideDrafts(e.target.checked)} />Hide drafts</label>
        <span className="count">{mrs.data?.length ?? '…'} {state} · {scope.type === 'group' ? 'across the group tree' : 'in this project'}</span>
      </div>
      {mrs.error ? <ErrorBox error={mrs.error} onRetry={() => mrs.refetch()} /> : !mrs.data ? <Skeleton /> : (
        <div className="panel">
          {!list.length ? <Empty title="No merge requests here">{state === 'opened' ? 'Nothing open in this scope matches. Clear the filter or switch to merged.' : 'Nothing matches in this state.'}</Empty> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Merge request</th><th>Author</th><th>Reviewers</th><th>Status</th><th>Labels</th><th className="r">Updated</th></tr></thead>
                <tbody>
                  {list.map((m) => (
                    <tr key={m.id} className="click" onClick={() => o.openMergeRequest(m)}>
                      <td><div className="ttl">{isDraft(m) && <Tag>Draft</Tag>}{m.title.replace(/^draft:\s*/i, '')}</div><div className="sub">{pname(m.project_id)}!{m.iid} · <Icon name="branch" />{m.source_branch}</div></td>
                      <td><Person user={m.author} /></td>
                      <td>{m.reviewers?.length ? <AvatarStack users={m.reviewers} /> : <span className="faint">None</span>}</td>
                      <td>{mrStatus(m)}</td>
                      <td><Labels labels={m.labels} /></td>
                      <td className="r num muted">{ago(m.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
