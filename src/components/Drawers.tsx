import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useConnection } from '../api/connection';
import { useGetAll, useWrite, type PipelineRow } from '../api/hooks';
import type { Issue, Job, MergeRequest } from '../api/types';
import { ago, dur } from '../lib/format';
import { useToast } from '../state/toast';
import { useNames } from './names';
import { Icon, Labels, Person, StatusIcon, StatusPill, Tag } from './ui';

export function mrStatus(m: MergeRequest) {
  if (m.state === 'merged') return <Tag tone="info">Merged</Tag>;
  if (m.state === 'closed') return <Tag>Closed</Tag>;
  const map: Record<string, [string, string]> = {
    mergeable: ['ok', 'Ready to merge'], not_approved: ['warn', 'Needs approval'], conflict: ['bad', 'Conflicts'], ci_still_running: ['info', 'CI running'],
    ci_must_pass: ['warn', 'CI must pass'], draft_status: ['', 'Draft'], discussions_not_resolved: ['warn', 'Open threads'], need_rebase: ['warn', 'Needs rebase'],
    checking: ['', 'Checking'], unchecked: ['', 'Unchecked'], blocked_status: ['bad', 'Blocked'],
  };
  const s = m.detailed_merge_status || m.merge_status || 'open';
  const [tone, label] = map[s] || ['', s.replace(/_/g, ' ')];
  return <Tag tone={tone}>{label}</Tag>;
}

function DrawerShell({ kicker, title, onClose, children }: { kicker: ReactNode; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  return (
    <aside className="drawer" aria-label="Details">
      <div className="drawer-head">
        <div className="txt"><div className="eyebrow">{kicker}</div><h2>{title}</h2></div>
        <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close details"><Icon name="close" /></button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}
function OpenInGitLab({ url }: { url?: string }) {
  const c = useConnection();
  if (c.mode !== 'live' || !url) return null;
  return <a className="btn" href={url} target="_blank" rel="noopener noreferrer"><Icon name="ext" />Open in GitLab</a>;
}

export function MergeRequestDrawer({ item: m, onClose }: { item: MergeRequest; onClose: () => void }) {
  const { pname } = useNames();
  const writeApi = useWrite();
  const toast = useToast();
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      await writeApi('POST', `/projects/${m.project_id}/merge_requests/${m.iid}/approve`);
      setApproved(true);
      toast(`Approved !${m.iid} in ${pname(m.project_id)}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DrawerShell kicker={<><Icon name="merge" /> {pname(m.project_id)}!{m.iid}</>} title={m.title} onClose={onClose}>
      <div className="actions">
        {m.state === 'opened' && <button className="btn primary" onClick={approve} disabled={approved || busy}><Icon name="check" />{approved ? 'Approved' : 'Approve'}</button>}
        <OpenInGitLab url={m.web_url} />
      </div>
      <dl className="kv">
        <dt>Status</dt><dd>{mrStatus(m)}</dd>
        <dt>Branches</dt><dd className="mono">{m.source_branch} → {m.target_branch}</dd>
        <dt>Author</dt><dd><Person user={m.author} /></dd>
        <dt>Reviewers</dt><dd>{m.reviewers?.length ? m.reviewers.map((u) => <div key={u.id}><Person user={u} /></div>) : <span className="faint">None assigned</span>}</dd>
        <dt>Labels</dt><dd><Labels labels={m.labels} /></dd>
        <dt>Opened</dt><dd>{ago(m.created_at)}</dd>
        <dt>Updated</dt><dd>{ago(m.updated_at)}</dd>
        <dt>Comments</dt><dd className="num">{m.user_notes_count ?? 0}</dd>
      </dl>
      {m.description && <div><h4 className="sect-h">Description</h4><p className="prose">{m.description}</p></div>}
    </DrawerShell>
  );
}

export function IssueDrawer({ item: i, onClose }: { item: Issue; onClose: () => void }) {
  const { pname } = useNames();
  const writeApi = useWrite();
  const toast = useToast();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeIssue = async () => {
    if (!armed) { setArmed(true); return; }
    setBusy(true);
    try {
      await writeApi('PUT', `/projects/${i.project_id}/issues/${i.iid}`, { state_event: 'close' });
      toast(`Closed #${i.iid} in ${pname(i.project_id)}`);
      onClose();
    } catch (e) {
      toast((e as Error).message, true);
      setBusy(false);
    }
  };
  return (
    <DrawerShell kicker={<><Icon name="issue" /> {pname(i.project_id)}#{i.iid}</>} title={i.title} onClose={onClose}>
      <div className="actions">
        {i.state === 'opened'
          ? <button className={`btn danger${armed ? ' armed' : ''}`} onClick={closeIssue} disabled={busy}>{armed ? 'Confirm: close this issue' : 'Close issue'}</button>
          : <Tag>Closed</Tag>}
        <OpenInGitLab url={i.web_url} />
      </div>
      <dl className="kv">
        <dt>Labels</dt><dd><Labels labels={i.labels} /></dd>
        <dt>Assignee</dt><dd>{i.assignees?.length ? i.assignees.map((u) => <div key={u.id}><Person user={u} /></div>) : <span className="faint">Unassigned</span>}</dd>
        <dt>Author</dt><dd><Person user={i.author} /></dd>
        <dt>Milestone</dt><dd className="mono">{i.milestone?.title || '—'}</dd>
        <dt>Due</dt><dd className="num">{i.due_date || '—'}</dd>
        <dt>Weight</dt><dd className="num">{i.weight ?? '—'}</dd>
        <dt>Opened</dt><dd>{ago(i.created_at)}</dd>
        <dt>Comments</dt><dd className="num">{i.user_notes_count ?? 0}</dd>
      </dl>
      {i.description && <div><h4 className="sect-h">Description</h4><p className="prose">{i.description}</p></div>}
    </DrawerShell>
  );
}

export function PipelineDrawer({ item: p, onClose }: { item: PipelineRow; onClose: () => void }) {
  const { pname } = useNames();
  const writeApi = useWrite();
  const toast = useToast();
  const jobs = useGetAll<Job>(`/projects/${p.project_id}/pipelines/${p.id}/jobs`, 2);
  const [status, setStatus] = useState(p.status);
  const canRetry = status === 'failed' || status === 'canceled';
  const retry = async () => {
    try {
      await writeApi('POST', `/projects/${p.project_id}/pipelines/${p.id}/retry`);
      setStatus('running');
      toast(`Retrying pipeline #${p.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const list = [...(jobs.data || [])].sort((a, b) => a.id - b.id);
  const stages = [...new Set(list.map((j) => j.stage))];
  return (
    <DrawerShell kicker={`Pipeline #${p.id}`} title={<><StatusPill status={status} /> <span style={{ fontSize: 16 }}>{pname(p.project_id)}</span></>} onClose={onClose}>
      <div className="actions">
        {canRetry && <button className="btn primary" onClick={retry}><Icon name="retry" />Retry failed jobs</button>}
        <OpenInGitLab url={p.web_url} />
      </div>
      <dl className="kv">
        <dt>Branch</dt><dd className="mono">{p.ref}</dd>
        <dt>Commit</dt><dd className="mono">{(p.sha || '').slice(0, 8)}</dd>
        <dt>Source</dt><dd>{(p.source || '').replace(/_/g, ' ')}</dd>
        <dt>Triggered by</dt><dd><Person user={p.user} /></dd>
        <dt>Created</dt><dd>{ago(p.created_at)}</dd>
        <dt>Duration</dt><dd className="num">{dur(p.duration)}</dd>
      </dl>
      <div>
        <h4 className="sect-h">Jobs by stage</h4>
        {jobs.error ? <p className="form-err">{(jobs.error as Error).message}</p>
          : !jobs.data ? <div className="sk"><div style={{ width: '70%' }} /><div style={{ width: '50%' }} /></div>
            : !list.length ? <p className="muted">This pipeline has no jobs.</p>
              : (
                <div className="stages">
                  {stages.map((s) => (
                    <div className="stage" key={s}>
                      <div className="stage-h">{s}</div>
                      {list.filter((j) => j.stage === s).map((j) => (
                        <div className="job" key={j.id} title={`${j.status}${j.allow_failure ? ', allowed to fail' : ''}`}>
                          <StatusIcon status={j.status} /><span>{j.name}</span><span className="faint num">{j.duration ? dur(j.duration) : ''}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
      </div>
    </DrawerShell>
  );
}
