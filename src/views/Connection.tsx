import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { explain, groupPath, request } from '../api/client';
import { connection, useConnection, type Connection, type Mode } from '../api/connection';
import { loadTree } from '../api/hooks';
import type { Group, User } from '../api/types';
import { StatusIcon } from '../components/ui';
import { useToast } from '../state/toast';

/** Choose between demo data and a GitLab instance, and test the token. */
export function ConnectionPage() {
  const c = useConnection();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(c.mode);
  const [base, setBase] = useState(c.base);
  const [token, setToken] = useState(c.token);
  const [root, setRoot] = useState(c.mode === 'live' ? c.root : connection.defaultRoot());
  const [remember, setRemember] = useState(c.remember);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<{ ok: boolean; text: string }[] | null>(null);

  const validate = () => {
    if (!/^(https?:\/\/|\/)/.test(base.trim())) return 'Enter the full URL, starting with https://, or a proxy path such as /gitlab.';
    if (!token.trim()) return 'Enter a personal access token.';
    return '';
  };
  const test = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    setLines(null);
    const conn: Connection = { mode: 'live', base: base.trim().replace(/\/+$/, ''), token: token.trim(), root: root.trim(), remember };
    try {
      const [ver, me] = await Promise.all([request<{ version: string }>('GET', '/version', undefined, conn), request<User>('GET', '/user', undefined, conn)]);
      const out = [
        { ok: ver.status < 300, text: ver.status < 300 ? `GitLab ${ver.data.version}` : explain(ver.status, ver.data) },
        { ok: me.status < 300, text: me.status < 300 ? `Signed in as ${me.data.name} (@${me.data.username})` : explain(me.status, me.data) },
      ];
      if (conn.root) {
        const g = await request<Group>('GET', groupPath(conn.root), undefined, conn);
        out.push({ ok: g.status < 300, text: g.status < 300 ? `Found group ${g.data.full_path} (ID ${g.data.id})` : explain(g.status, g.data) });
      }
      setLines(out);
    } catch (e) {
      setLines([{ ok: false, text: (e as Error).message }]);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'demo') {
      connection.useDemo();
      qc.clear();
      toast('Using demo data');
      navigate('/');
      return;
    }
    const v = validate() || (!root.trim() ? 'Enter the path or ID of your top-level group.' : '');
    if (v) { setError(v); return; }
    const next = { mode: 'live' as const, base: base.trim().replace(/\/+$/, ''), token: token.trim(), root: root.trim(), remember };
    setBusy(true);
    const prev = connection.get();
    connection.set(next);
    try {
      await loadTree(next.root);
      qc.clear();
      toast(`Connected to ${next.root}`);
      navigate('/');
    } catch (x) {
      connection.set(prev);
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="scope-head"><div className="txt"><div className="eyebrow">Settings</div><h1>Connection</h1><p className="desc">Where the portal gets its data. Nothing is stored on a server: the token stays in this browser.</p></div></section>
      <div className="conn">
        <div className="panel">
          <div className="panel-h"><h3>Where the data comes from</h3></div>
          <div className="panel-b">
            <form onSubmit={submit}>
              <div className="modepick" role="radiogroup" aria-label="Data source">
                <label><input type="radio" name="mode" checked={mode === 'demo'} onChange={() => setMode('demo')} /><span><b>Demo data</b><small>A sample company with 9 subgroups and 21 projects. Nothing leaves this page.</small></span></label>
                <label><input type="radio" name="mode" checked={mode === 'live'} onChange={() => setMode('live')} /><span><b>Your GitLab</b><small>Calls /api/v4 on your instance with a personal access token.</small></span></label>
              </div>
              <label className="fld"><span>GitLab URL</span><input className="inp" id="conn-base" value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://gitlab.yourcompany.com" spellCheck={false} /></label>
              <label className="fld"><span>Personal access token</span>
                <input className="inp" id="conn-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="glpat-…" autoComplete="off" spellCheck={false} />
                <span className="hint">Scope read_api is enough to browse. Use api to create issues, approve merge requests, retry pipelines and edit wikis.</span>
              </label>
              <label className="fld"><span>Top-level group</span><input className="inp" id="conn-root" value={root} onChange={(e) => setRoot(e.target.value)} placeholder="your-group (path or numeric ID)" spellCheck={false} /></label>
              <label className="chk" style={{ marginBottom: 14 }}><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Keep the token in this browser tab until it closes</label>
              <div className="actions">
                <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Connecting…' : 'Use this source'}</button>
                <button className="btn" type="button" onClick={test} disabled={mode === 'demo'}>Test connection</button>
              </div>
              {lines && <ul className="result-lines">{lines.map((l, i) => <li key={i}><StatusIcon status={l.ok ? 'success' : 'failed'} /><span>{l.text}</span></li>)}</ul>}
              {error && <p className="form-err">{error}</p>}
            </form>
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Before you go live</h3></div>
          <div className="panel-b">
            <ol className="notes">
              <li>GitLab's REST API accepts cross-origin requests with a token header, so the browser talks to GitLab directly. If your instance blocks that, run the development proxy described in the README and enter <code>/gitlab</code> as the URL.</li>
              <li>The token stays in this page's memory, and in session storage only if you tick the box. It is sent only to the GitLab URL above.</li>
              <li>Project wikis work on every GitLab tier. Group wikis, and searching wikis across a whole group, need Premium or Ultimate; the portal skips them when they are unavailable.</li>
              <li>Large trees: the portal pages through up to 1,000 projects and fetches pipelines for the 30 most active projects in the current scope.</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
