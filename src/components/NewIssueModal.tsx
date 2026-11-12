import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useWrite } from '../api/hooks';
import type { Issue, Project } from '../api/types';
import { useToast } from '../state/toast';
import { useNames } from './names';
import { Label } from './ui';

const LABEL_CHOICES = ['bug', 'feature', 'tech-debt', 'security', 'docs'];

export function NewIssueModal({ projects, onClose }: { projects: Project[]; onClose: () => void }) {
  const { rel, pname } = useNames();
  const writeApi = useWrite();
  const toast = useToast();
  const sorted = [...projects].sort((a, b) => a.path_with_namespace.localeCompare(b.path_with_namespace));
  const [projectId, setProjectId] = useState(sorted[0]?.id);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Give the issue a title.'); return; }
    setBusy(true);
    setError('');
    try {
      const is = await writeApi<Issue>('POST', `/projects/${projectId}/issues`, { title: title.trim(), description, labels: labels.join(',') });
      toast(`Created #${is.iid} in ${pname(projectId!)}`);
      onClose();
    } catch (x) {
      setError((x as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="modal">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="ni-title">
        <form onSubmit={submit}>
          <h2 id="ni-title">New issue</h2>
          <label className="fld"><span>Project</span>
            <select className="sel" id="ni-project" value={projectId} onChange={(e) => setProjectId(+e.target.value)}>
              {sorted.map((p) => <option key={p.id} value={p.id}>{rel(p.path_with_namespace)}</option>)}
            </select>
          </label>
          <label className="fld"><span>Title</span>
            <input ref={titleRef} className="inp" id="ni-title-input" maxLength={255} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the problem or request" />
          </label>
          <label className="fld"><span>Description</span>
            <textarea className="inp" id="ni-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Markdown works here" />
          </label>
          <fieldset className="fld"><legend>Labels</legend>
            <div className="chk-row">
              {LABEL_CHOICES.map((l) => (
                <label className="chk" key={l}>
                  <input type="checkbox" checked={labels.includes(l)} onChange={(e) => setLabels(e.target.checked ? [...labels, l] : labels.filter((x) => x !== l))} />
                  <Label name={l} />
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="form-err">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create issue'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
