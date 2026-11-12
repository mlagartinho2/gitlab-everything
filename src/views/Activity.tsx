import type { ReactNode } from 'react';
import { useEvents } from '../api/hooks';
import type { GitLabEvent } from '../api/types';
import { useNames } from '../components/names';
import { Avatar, Empty, ErrorBox, Skeleton } from '../components/ui';
import { DAY } from '../lib/format';
import type { ViewProps } from './ScopePage';

function describe(e: GitLabEvent): ReactNode {
  const t = e.target_type, a = e.action_name;
  if (e.push_data) return <>{a === 'pushed new' ? 'pushed new branch' : 'pushed to'} <code>{e.push_data.ref}</code>{e.push_data.commit_title && <div className="ctx">{e.push_data.commit_count > 1 ? `${e.push_data.commit_count} commits · ` : ''}{e.push_data.commit_title}</div>}</>;
  if (t === 'MergeRequest') return <>{a === 'accepted' ? 'merged' : a} merge request <b>!{e.target_iid}</b> {e.target_title}</>;
  if (t === 'Issue') return <>{a} issue <b>#{e.target_iid}</b> {e.target_title}</>;
  if (t === 'Note' || t === 'DiffNote' || t === 'DiscussionNote') return <>commented on {e.note?.noteable_type === 'Issue' ? 'issue' : 'merge request'} <b>{e.target_title}</b></>;
  return <>{a} {t} {e.target_title}</>;
}
const dayLabel = (d: string) => {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((+t - +x) / DAY);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : x.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' });
};

export function Activity({ tree, scope }: ViewProps) {
  const q = useEvents(tree, scope);
  const { pname } = useNames();
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton />;
  const { events, projects } = q.data;
  if (!events.length) return <div className="panel"><Empty title="No recent activity">Nothing has happened in these projects lately.</Empty></div>;
  const groups: { label: string; items: GitLabEvent[] }[] = [];
  for (const e of events) {
    const l = dayLabel(e.created_at);
    if (groups[groups.length - 1]?.label !== l) groups.push({ label: l, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  return (
    <>
      <div className="toolbar"><span className="count" style={{ marginLeft: 0 }}>Latest events from the {projects} most active project{projects === 1 ? '' : 's'} in scope</span></div>
      <div className="panel">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="feed-day">{g.label}</div>
            <ul className="feed">
              {g.items.map((e) => {
                const au = e.author || { name: e.author_username || '?', username: e.author_username || '?' };
                return (
                  <li key={`${e.project_id}-${e.id}`}>
                    <Avatar user={au} />
                    <div className="what"><b>{au.name}</b> {describe(e)}<div className="ctx">{pname(e.project_id)}</div></div>
                    <span className="num faint">{new Date(e.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
