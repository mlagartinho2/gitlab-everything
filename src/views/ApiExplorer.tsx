import { useState, type FormEvent } from 'react';
import { request, useCallLog, type RawResponse } from '../api/client';
import { useConnection } from '../api/connection';
import { inGroup, type Scope, type Tree } from '../api/hooks';
import { Tag } from '../components/ui';
import { esc } from '../lib/format';
import type { ViewProps } from './ScopePage';

type Endpoint = [method: 'GET' | 'POST' | 'PUT', path: string, description: string, usedByPortal?: 1];
/** Endpoint catalog. Add entries here; ":group", ":project", ":pipeline_id" and friends are filled from the current scope. */
export const CATALOG: [string, Endpoint[]][] = [
  ['Groups', [['GET', '/groups/:group', 'Group details', 1], ['GET', '/groups/:group/descendant_groups', 'All nested subgroups', 1], ['GET', '/groups/:group/subgroups', 'Direct subgroups'], ['GET', '/groups/:group/projects?include_subgroups=true', 'Every project in the tree', 1], ['GET', '/groups/:group/labels', 'Group labels'], ['GET', '/groups/:group/milestones', 'Group milestones']]],
  ['Projects', [['GET', '/projects/:project', 'Project details'], ['GET', '/projects/:project/languages', 'Language breakdown'], ['GET', '/projects/:project/events', 'Project activity', 1]]],
  ['Merge requests', [['GET', '/groups/:group/merge_requests?state=opened&scope=all', 'Open MRs across the tree', 1], ['GET', '/projects/:project/merge_requests?state=opened', 'Open MRs in a project', 1], ['POST', '/projects/:project/merge_requests/:mr_iid/approve', 'Approve a merge request', 1]]],
  ['Issues', [['GET', '/groups/:group/issues?state=opened&scope=all', 'Open issues across the tree', 1], ['POST', '/projects/:project/issues', 'Create an issue', 1], ['PUT', '/projects/:project/issues/:issue_iid', 'Update or close an issue', 1]]],
  ['CI/CD', [['GET', '/projects/:project/pipelines', 'Pipelines', 1], ['GET', '/projects/:project/pipelines/:pipeline_id/jobs', 'Jobs in a pipeline', 1], ['POST', '/projects/:project/pipelines/:pipeline_id/retry', 'Retry failed jobs', 1], ['GET', '/projects/:project/environments', 'Environments'], ['GET', '/projects/:project/deployments', 'Deployments'], ['GET', '/groups/:group/runners', 'Group runners'], ['GET', '/groups/:group/variables', 'Group CI/CD variables']]],
  ['Repository', [['GET', '/projects/:project/repository/branches', 'Branches', 1], ['GET', '/projects/:project/repository/commits', 'Commits', 1], ['GET', '/projects/:project/repository/tags', 'Tags'], ['GET', '/projects/:project/repository/tree', 'File tree'], ['GET', '/projects/:project/repository/compare?from=main&to=main', 'Compare two refs']]],
  ['Wikis', [['GET', '/projects/:project/wikis', 'Pages in a project wiki', 1], ['GET', '/projects/:project/wikis/home', 'Read one page', 1], ['POST', '/projects/:project/wikis', 'Create a page', 1], ['PUT', '/projects/:project/wikis/:slug', 'Edit a page', 1], ['POST', '/projects/:project/wikis/attachments', 'Upload an attachment', 1], ['GET', '/groups/:group/wikis', 'Pages in a group wiki (Premium)', 1], ['GET', '/projects/:project/search?scope=wiki_blobs&search=deploy', 'Search wiki content', 1]]],
  ['Members and access', [['GET', '/groups/:group/members/all', 'Members including inherited', 1], ['GET', '/groups/:group/members', 'Direct members', 1], ['GET', '/projects/:project/members/all', 'Project members', 1], ['GET', '/groups/:group/access_requests', 'Pending access requests']]],
  ['Search', [['GET', '/groups/:group/search?scope=projects&search=api', 'Search a group', 1], ['GET', '/projects/:project/search?scope=issues&search=timeout', 'Search a project', 1]]],
  ['Releases and packages', [['GET', '/projects/:project/releases', 'Releases'], ['GET', '/projects/:project/packages', 'Package registry'], ['GET', '/projects/:project/registry/repositories', 'Container registry']]],
  ['Users and instance', [['GET', '/user', 'Current user', 1], ['GET', '/users?search=a', 'Find users'], ['GET', '/version', 'GitLab version', 1]]],
];

export function fillPath(p: string, tree: Tree, scope: Scope) {
  const gid = scope.type === 'group' ? scope.id : tree.projMap.get(scope.id)?.namespace.id ?? tree.root.id;
  const pid = scope.type === 'project' ? scope.id : tree.projects.find((x) => inGroup(x.namespace.full_path, scope))?.id ?? ':project';
  return p.replace(':group', String(gid)).replace(':project', String(pid)).replace(':mr_iid', '1').replace(':issue_iid', '1').replace(':slug', 'home');
}

/** JSON with keys, strings, numbers and literals wrapped for colouring. Escapes first. */
export function highlightJson(json: string) {
  return esc(json).replace(/(&quot;(?:[^&\\]|\\.|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/g,
    (m, str, colon, kw) => (str ? (colon ? `<span class="j-k">${str}</span>${colon}` : `<span class="j-s">${str}</span>`) : kw ? `<span class="j-b">${m}</span>` : `<span class="j-n">${m}</span>`));
}

export function ApiExplorer({ tree, scope }: ViewProps) {
  const c = useConnection();
  const log = useCallLog();
  const [picked, setPicked] = useState<Endpoint>(['GET', '/groups/:group', 'Group details', 1]);
  const [path, setPath] = useState(() => fillPath('/groups/:group', tree, scope));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RawResponse | { error: string } | null>(null);
  const pick = (e: Endpoint) => { setPicked(e); setPath(fillPath(e[1], tree, scope)); setResult(null); };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const p = path.trim().startsWith('/') ? path.trim() : '/' + path.trim();
    setBusy(true);
    try { setResult(await request('GET', p)); } catch (x) { setResult({ error: (x as Error).message }); }
    setBusy(false);
  };
  const writeNote = picked[0] !== 'GET';
  let text = '';
  if (result && 'data' in result) {
    text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
    if (text.length > 80000) text = text.slice(0, 80000) + '\n… truncated';
  }
  return (
    <div className="ex">
      <div className="panel cat" aria-label="Endpoint catalog">
        {CATALOG.map(([area, items]) => (
          <div key={area}>
            <h4>{area}</h4>
            {items.map((e) => (
              <button key={e[0] + e[1]} onClick={() => pick(e)}>
                <span className="ep"><span className={`meth ${e[0]}`}>{e[0]}</span><span>{e[1]}</span></span>
                <span className="d">{e[2]}{e[3] && <span className="tag acc" style={{ padding: '2px 5px', fontSize: 10.5 }}>in portal</span>}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div className="panel">
          <div className="panel-h"><h3>Request</h3><span className="aside muted" style={{ fontSize: 12.5 }}>{c.mode === 'demo' ? 'Answered by the demo data' : `Sent to ${c.base}`}</span></div>
          <div className="panel-b">
            <form className="reqbar" onSubmit={send}>
              <span className="meth GET" style={{ padding: '6px 8px', fontSize: 12 }}>GET</span>
              <label className="url"><span>/api/v4</span><input id="exPath" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} autoComplete="off" aria-label="Request path" /></label>
              <button className="btn primary" type="submit" disabled={busy}>Send</button>
            </form>
            {writeNote && <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>{picked[0]} calls change data, so the explorer only sends GET. This one runs from the portal's own buttons.</p>}
            {busy ? <div className="resmeta">Sending request…</div>
              : !result ? <p className="muted" style={{ margin: '14px 0 0' }}>Pick an endpoint on the left or type a path, then send it. Placeholders are filled from the group or project you have selected.</p>
                : 'error' in result ? <><div className="resmeta"><Tag tone="bad">No response</Tag></div><p className="muted">{result.error}</p></>
                  : (
                    <>
                      <div className="resmeta">
                        <Tag tone={result.status < 300 ? 'ok' : result.status < 500 ? 'warn' : 'bad'}>{result.status}</Tag><span>{result.ms} ms</span>
                        {Array.isArray(result.data) && <span>{result.data.length} item{result.data.length === 1 ? '' : 's'} on this page</span>}
                        {result.total && <span>x-total: {result.total}</span>}{result.next && <span>x-next-page: {result.next}</span>}
                      </div>
                      <pre className="json" dangerouslySetInnerHTML={{ __html: highlightJson(text) }} />
                    </>
                  )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Calls made this session</h3><span className="aside faint mono">{log.length}</span></div>
          {log.length ? (
            <ul className="log">
              {log.slice(0, 25).map((l) => (
                <li key={l.at + l.path}><span className={`meth ${l.method}`}>{l.method}</span><span className={l.status < 300 ? 'muted' : 'tag bad'}>{l.status}</span><span title={l.path}>{l.path}</span><span className="faint num">{l.ms} ms</span></li>
              ))}
            </ul>
          ) : <div className="panel-b muted">No calls yet.</div>}
        </div>
      </div>
    </div>
  );
}
