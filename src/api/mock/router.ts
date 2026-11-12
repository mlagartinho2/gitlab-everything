/* Answers /api/v4 paths from the demo data with the same response shapes GitLab returns. */
import { DAY, byDate } from '../../lib/format';
import { LABEL_HUE } from '../../lib/labels';
import { pageSlug } from '../../lib/wiki/paths';
import type { Group, Issue, Job, Pipeline, Project, WikiPage } from '../types';
import { DEMO_LABELS, DEMO_MILESTONES, buildDemo, type DemoDb, type DemoMembership } from './data';

let DB: DemoDb | null = null;
export const demoDb = () => (DB ??= buildDemo());
/** Throws the demo data away; used by tests. */
export const resetDemo = () => { DB = null; };

interface MockResponse { status: number; data: unknown; next: string | null; total: string | null }

export function mockRequest(method: string, path: string, body?: unknown): Promise<MockResponse> {
  return new Promise((res) => setTimeout(() => {
    const r = route(method, path, body as Record<string, any> | undefined);
    const data = r.data === '' ? '' : JSON.parse(JSON.stringify(r.data));
    res({ ...r, data, next: null, total: Array.isArray(r.data) ? String(r.data.length) : null });
  }, import.meta.env.MODE === 'test' ? 0 : 80 + Math.random() * 160));
}

export function jobsFor(pl: Pipeline): Job[] {
  let seed = pl.id;
  const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const defs: [string, string][] = [['build', 'compile'], ['build', 'docker-image'], ['test', 'unit-tests'], ['test', 'integration-tests'], ['scan', 'sast'], ['scan', 'dependency-scanning'], ['deploy', 'deploy-staging'], ['deploy', 'deploy-production']];
  const order = ['build', 'test', 'scan', 'deploy'];
  const pivot = 2 + Math.floor(r() * 4);
  const pStage = order.indexOf(defs[pivot][0]);
  return defs.map(([stage, name], i) => {
    const si = order.indexOf(stage);
    let status: Job['status'] = 'success';
    if (pl.status === 'success') status = name === 'deploy-production' ? (pl.ref === 'main' ? 'manual' : 'skipped') : name === 'deploy-staging' && pl.ref !== 'main' ? 'skipped' : 'success';
    else if (pl.status === 'failed') status = i === pivot ? 'failed' : si <= pStage ? 'success' : 'skipped';
    else if (pl.status === 'running') status = si < pStage ? 'success' : si === pStage ? 'running' : 'created';
    else if (pl.status === 'canceled') status = si < pStage ? 'success' : 'canceled';
    else status = si === 0 ? 'pending' : 'created';
    const d = status === 'success' || status === 'failed' ? Math.round(18 + r() * 220) : null;
    return { id: pl.id * 10 + i, name, stage, status, duration: d, allow_failure: name === 'dependency-scanning', web_url: pl.web_url.replace(/pipelines\/\d+$/, `jobs/${pl.id * 10 + i}`) };
  });
}

export function route(method: string, path: string, body: Record<string, any> = {}): { status: number; data: unknown } {
  const D = demoDb();
  const u = new URL('http://x' + path);
  const seg = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const q = u.searchParams;
  const ok = (data: unknown) => ({ status: method === 'POST' ? 201 : 200, data });
  const nf = (m = '404 Not found') => ({ status: 404, data: { message: m } });
  const notModelled = () => ({ status: 404, data: { message: '404 Not found. This endpoint is not modelled in the demo data. Switch to live mode to call it.' } });
  const findGroup = (k: string) => (/^\d+$/.test(k) ? D.groups.find((g) => g.id === +k) : D.groups.find((g) => g.full_path === k));
  const findProject = (k: string) => (/^\d+$/.test(k) ? D.projects.find((p) => p.id === +k) : D.projects.find((p) => p.path_with_namespace === k));
  const under = (fp: string, g: Group) => fp === g.full_path || fp.startsWith(g.full_path + '/');
  const projIn = (g: Group) => D.projects.filter((p) => under(p.namespace.full_path, g));
  const filterList = <T extends { state: string; title: string; labels: string[]; created_at: string; updated_at: string }>(arr: T[]) => {
    let out = arr;
    const st = q.get('state');
    if (st && st !== 'all') out = out.filter((x) => x.state === st);
    const s = (q.get('search') || '').toLowerCase();
    if (s) out = out.filter((x) => x.title.toLowerCase().includes(s));
    const lb = q.get('labels');
    if (lb) { const want = lb.split(','); out = out.filter((x) => want.every((l) => x.labels.includes(l))); }
    const ob = q.get('order_by') === 'updated_at' ? 'updated_at' : 'created_at';
    return [...out].sort(byDate<T>(ob));
  };
  const memberRow = (m: DemoMembership) => ({ ...D.users.find((x) => x.id === m.user_id)!, access_level: m.access_level, expires_at: m.expires_at, membership_state: 'active' });
  const membersAll = (g: Group) => {
    const anc = D.groups.filter((x) => under(g.full_path, x));
    const best = new Map<number, DemoMembership>();
    for (const m of D.membership.filter((m) => anc.some((a) => a.id === m.group_id))) {
      const cur = best.get(m.user_id);
      if (!cur || cur.access_level < m.access_level) best.set(m.user_id, m);
    }
    return [...best.values()].map(memberRow).sort((a, b) => b.access_level - a.access_level || a.name.localeCompare(b.name));
  };
  const searchIn = (projects: Project[]) => {
    const scope = q.get('scope'), s = (q.get('search') || '').toLowerCase();
    const ids = new Set(projects.map((p) => p.id));
    if (scope === 'projects') return ok(projects.filter((p) => p.path_with_namespace.toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s)));
    if (scope === 'issues') return ok(D.issues.filter((i) => ids.has(i.project_id) && (i.title + ' ' + i.description).toLowerCase().includes(s)).sort(byDate<Issue>('updated_at')));
    if (scope === 'merge_requests') return ok(D.mrs.filter((m) => ids.has(m.project_id) && (m.title + ' ' + m.description).toLowerCase().includes(s)).sort(byDate('updated_at')));
    if (scope === 'wiki_blobs') {
      const hits = [];
      for (const p of projects) for (const w of D.wikis['p:' + p.id] || []) {
        const ls = w.content.split('\n');
        const i = ls.findIndex((l) => l.toLowerCase().includes(s));
        if (s && i >= 0) hits.push({ basename: w.slug, data: ls.slice(Math.max(0, i - 1), i + 2).join('\n'), path: w.slug + '.md', filename: w.slug + '.md', id: null, ref: 'main', startline: Math.max(1, i), project_id: p.id });
      }
      return ok(hits);
    }
    return { status: 400, data: { error: 'scope does not have a valid value' } };
  };
  const wikiRoute = (key: string) => {
    const pages: WikiPage[] = D.wikis[key] || (D.wikis[key] = []);
    const slug = seg.slice(3).join('/');
    if (!slug) {
      if (method === 'POST') {
        const t = String(body.title || '').trim();
        if (!t) return { status: 400, data: { error: 'title is missing' } };
        const s = pageSlug(t);
        if (pages.some((w) => w.slug === s)) return { status: 400, data: { message: 'Duplicate page: A page with that title already exists' } };
        const w: WikiPage = { format: body.format || 'markdown', slug: s, title: t.split('/').pop()!, content: body.content || '', encoding: 'UTF-8' };
        pages.push(w);
        return { status: 201, data: w };
      }
      const full = ['1', 'true'].includes(q.get('with_content') || '');
      return ok(pages.map((w) => (full ? w : { format: w.format, slug: w.slug, title: w.title, encoding: 'UTF-8' })));
    }
    const w = pages.find((x) => x.slug === slug);
    if (!w) return nf('404 Wiki Page Not Found');
    if (method === 'DELETE') { pages.splice(pages.indexOf(w), 1); return { status: 204, data: '' }; }
    if (method === 'PUT') {
      if (body.title && body.title !== w.title) {
        const ns = pageSlug(body.title);
        if (ns !== w.slug && pages.some((x) => x.slug === ns)) return { status: 400, data: { message: 'Duplicate page: A page with that title already exists' } };
        w.title = String(body.title).split('/').pop()!;
        w.slug = ns;
      }
      if (body.content != null) w.content = body.content;
    }
    return ok(w);
  };

  if (seg[0] === 'user' && seg.length === 1) return ok(D.me);
  if (seg[0] === 'version') return ok({ version: '17.5.1-ee', revision: 'demo0000' });
  if (seg[0] === 'users' && seg.length === 1) { const s = (q.get('search') || '').toLowerCase(); return ok(D.users.filter((x) => !s || x.name.toLowerCase().includes(s) || x.username.includes(s))); }
  if (seg[0] === 'groups' && seg.length === 1) return ok(D.groups);
  if (seg[0] === 'projects' && seg.length === 1) return ok(D.projects);

  if (seg[0] === 'groups') {
    const g = findGroup(seg[1]);
    if (!g) return nf('404 Group Not Found');
    const sub = seg[2];
    if (!sub) return ok(g);
    if (sub === 'descendant_groups') return ok(D.groups.filter((x) => x.id !== g.id && under(x.full_path, g)));
    if (sub === 'subgroups') return ok(D.groups.filter((x) => x.parent_id === g.id));
    if (sub === 'projects') {
      let ps = q.get('include_subgroups') === 'true' ? projIn(g) : D.projects.filter((p) => p.namespace.id === g.id);
      const s = (q.get('search') || '').toLowerCase();
      if (s) ps = ps.filter((p) => p.path.includes(s));
      return ok([...ps].sort(byDate<Project>('last_activity_at')));
    }
    if (sub === 'merge_requests') { const ids = new Set(projIn(g).map((p) => p.id)); return ok(filterList(D.mrs.filter((m) => ids.has(m.project_id)))); }
    if (sub === 'issues') { const ids = new Set(projIn(g).map((p) => p.id)); return ok(filterList(D.issues.filter((m) => ids.has(m.project_id)))); }
    if (sub === 'members') return seg[3] === 'all' ? ok(membersAll(g)) : ok(D.membership.filter((m) => m.group_id === g.id).map(memberRow));
    if (sub === 'search') return searchIn(projIn(g));
    if (sub === 'wikis') return wikiRoute('g:' + g.id);
    if (sub === 'labels') return ok([...DEMO_LABELS, 'priority::high', 'priority::medium'].map((name, k) => ({ id: 300 + k, name, color: `hsl(${LABEL_HUE[name.split('::')[0]] ?? 0} 62% 50%)`, open_issues_count: D.issues.filter((i) => i.state === 'opened' && i.labels.includes(name)).length })));
    if (sub === 'milestones') return ok(DEMO_MILESTONES.map((title, k) => ({ id: 7 + k, iid: k + 1, group_id: g.id, title, state: 'active', due_date: new Date(Date.now() + (k + 1) * 30 * DAY).toISOString().slice(0, 10) })));
    return notModelled();
  }

  if (seg[0] === 'projects') {
    const p = findProject(seg[1]);
    if (!p) return nf('404 Project Not Found');
    const sub = seg[2];
    if (!sub) return ok(p);
    if (sub === 'pipelines') {
      if (seg[3]) {
        const pl = D.pipelines.find((x) => x.id === +seg[3] && x.project_id === p.id);
        if (!pl) return nf();
        if (seg[4] === 'jobs') return ok(jobsFor(pl).reverse());
        if (seg[4] === 'retry' && method === 'POST') { pl.status = 'running'; pl.duration = null; pl.updated_at = new Date().toISOString(); return ok(pl); }
        return ok(pl);
      }
      let l = D.pipelines.filter((x) => x.project_id === p.id);
      const ua = q.get('updated_after');
      if (ua) l = l.filter((x) => new Date(x.updated_at) >= new Date(ua));
      if (q.get('ref')) l = l.filter((x) => x.ref === q.get('ref'));
      if (q.get('status')) l = l.filter((x) => x.status === q.get('status'));
      return ok([...l].sort((a, b) => b.id - a.id));
    }
    if (sub === 'merge_requests') {
      if (seg[3]) {
        const m = D.mrs.find((x) => x.project_id === p.id && x.iid === +seg[3]);
        if (!m) return nf();
        if (seg[4] === 'approve' && method === 'POST') {
          if (!m._approvedBy.includes(D.me.id)) m._approvedBy.push(D.me.id);
          if (m.detailed_merge_status === 'not_approved') m.detailed_merge_status = 'mergeable';
          return { status: 201, data: { id: m.id, iid: m.iid, approved: true, approved_by: [{ user: D.me }] } };
        }
        if (seg[4] === 'approvals') return ok({ approved: m._approvedBy.length > 0, approved_by: m._approvedBy.map((id) => ({ user: D.users.find((x) => x.id === id) })) });
        return ok(m);
      }
      return ok(filterList(D.mrs.filter((m) => m.project_id === p.id)));
    }
    if (sub === 'issues') {
      if (method === 'POST' && !seg[3]) {
        const iid = Math.max(0, ...D.issues.filter((i) => i.project_id === p.id).map((i) => i.iid)) + 1;
        const now = new Date().toISOString();
        const is: Issue = {
          id: Math.max(...D.issues.map((i) => i.id)) + 1, iid, project_id: p.id, title: body.title, description: body.description || '', state: 'opened',
          created_at: now, updated_at: now, closed_at: null, labels: body.labels ? String(body.labels).split(',').filter(Boolean) : [], assignees: [],
          author: D.me, milestone: null, due_date: null, weight: null, user_notes_count: 0, web_url: `${p.web_url}/-/issues/${iid}`,
        };
        D.issues.push(is);
        p.open_issues_count = (p.open_issues_count || 0) + 1;
        p.last_activity_at = now;
        D.events.push({ id: Date.now(), project_id: p.id, action_name: 'opened', target_type: 'Issue', target_iid: iid, target_title: is.title, author: D.me, author_username: 'demo', created_at: now });
        return { status: 201, data: is };
      }
      if (seg[3]) {
        const is = D.issues.find((i) => i.project_id === p.id && i.iid === +seg[3]);
        if (!is) return nf();
        if (method === 'PUT') {
          const now = new Date().toISOString();
          if (body.state_event === 'close' && is.state !== 'closed') {
            is.state = 'closed'; is.closed_at = now; p.open_issues_count = (p.open_issues_count || 1) - 1;
            D.events.push({ id: Date.now(), project_id: p.id, action_name: 'closed', target_type: 'Issue', target_iid: is.iid, target_title: is.title, author: D.me, author_username: 'demo', created_at: now });
          }
          if (body.state_event === 'reopen' && is.state === 'closed') { is.state = 'opened'; is.closed_at = null; p.open_issues_count = (p.open_issues_count || 0) + 1; }
          if (body.title) is.title = body.title;
          is.updated_at = now;
        }
        return ok(is);
      }
      return ok(filterList(D.issues.filter((i) => i.project_id === p.id)));
    }
    if (sub === 'repository') {
      if (seg[3] === 'branches') return ok(D.branches[p.id]);
      if (seg[3] === 'commits') return ok(D.commits[p.id]);
      if (seg[3] === 'tags') return ok([{ name: 'v1.8.0', target: D.commits[p.id][3].id, commit: D.commits[p.id][3], protected: true }, { name: 'v1.7.2', target: D.commits[p.id][9].id, commit: D.commits[p.id][9], protected: true }]);
      return notModelled();
    }
    if (sub === 'events') return ok(D.events.filter((e) => e.project_id === p.id).sort(byDate('created_at')).slice(0, +(q.get('per_page') || 20)));
    if (sub === 'members') return ok(membersAll(D.groups.find((x) => x.id === p.namespace.id)!));
    if (sub === 'search') return searchIn([p]);
    if (sub === 'wikis') return wikiRoute('p:' + p.id);
    if (sub === 'languages') return ok({ [p.topics?.[0] || 'Text']: 91.4, Dockerfile: 4.8, Shell: 3.8 });
    if (sub === 'environments') return ok([{ id: 1, name: 'staging', state: 'available', external_url: `https://staging.${p.path}.example.com` }, { id: 2, name: 'production', state: 'available', external_url: `https://${p.path}.example.com` }]);
    return notModelled();
  }
  return notModelled();
}
