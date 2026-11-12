import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { DAY, HOUR, byDate } from '../lib/format';
import { get, getAll, groupPath, write } from './client';
import { connection, useConnection, type Connection } from './connection';
import type { GitLabEvent, Group, Issue, Member, MergeRequest, Pipeline, Project, WikiPageMeta } from './types';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

const connKey = (c: Connection) => (c.mode === 'demo' ? 'demo' : `${c.base}|${c.root}|${c.token.slice(-6)}`);
/** Query keys always start with the connection, so demo and live data never mix. */
export function useKey() {
  const c = useConnection();
  return connKey(c);
}

/* ---------- tree and scope ---------- */
export interface Tree {
  root: Group;
  groups: Group[];
  projects: Project[];
  projMap: Map<number, Project>;
}
export type Scope =
  | { type: 'group'; id: number; name: string; full_path: string; description?: string | null; web_url: string }
  | { type: 'project'; id: number; name: string; full_path: string; description?: string | null; web_url: string };

export const groupScope = (g: Group): Scope => ({ type: 'group', id: g.id, name: g.name, full_path: g.full_path, description: g.description, web_url: g.web_url });
export const projectScope = (p: Project): Scope => ({ type: 'project', id: p.id, name: p.name, full_path: p.path_with_namespace, description: p.description, web_url: p.web_url });
export const scopeBase = (s: Scope) => (s.type === 'group' ? groupPath(s.id) : `/projects/${s.id}`);
export const inGroup = (fullPath: string, g: { full_path: string }) => fullPath === g.full_path || fullPath.startsWith(g.full_path + '/');
/** Path relative to the root group, which is how the portal shows paths. */
export const relPath = (tree: Tree | undefined, p?: string) => {
  if (!p) return '';
  const r = tree?.root.full_path;
  return !r || p === r ? p : p.startsWith(r + '/') ? p.slice(r.length + 1) : p;
};

export async function loadTree(root: string): Promise<Tree> {
  const g = await get<Group>(groupPath(root));
  const [groups, projects] = await Promise.all([
    getAll<Group>(`${groupPath(g.id)}/descendant_groups?all_available=true`, 5),
    getAll<Project>(`${groupPath(g.id)}/projects?include_subgroups=true&archived=false&order_by=last_activity_at`, 10),
  ]);
  return { root: g, groups: [g, ...groups], projects, projMap: new Map(projects.map((p) => [p.id, p])) };
}

export function useTree() {
  const c = useConnection();
  return useQuery({ queryKey: [connKey(c), 'tree'], queryFn: () => loadTree(c.root), staleTime: 5 * 60_000 });
}

export function scopeProjects(tree: Tree, scope: Scope): Project[] {
  if (scope.type === 'project') return [tree.projMap.get(scope.id)].filter(Boolean) as Project[];
  return tree.projects.filter((p) => inGroup(p.namespace.full_path, scope)).sort(byDate<Project>('last_activity_at'));
}

/* ---------- generic ---------- */
export function useGet<T>(path: string | null) {
  const key = useKey();
  return useQuery({ queryKey: [key, 'get', path], queryFn: () => get<T>(path!), enabled: !!path });
}
export function useGetAll<T>(path: string | null, pages = 3) {
  const key = useKey();
  return useQuery({ queryKey: [key, 'all', path, pages], queryFn: () => getAll<T>(path!, pages), enabled: !!path });
}

/* ---------- scope-aware loaders ---------- */
export const useMergeRequests = (scope: Scope, state = 'opened') =>
  useGetAll<MergeRequest>(`${scopeBase(scope)}/merge_requests?state=${state}&scope=all&order_by=updated_at`);
export const useIssues = (scope: Scope, state = 'opened') =>
  useGetAll<Issue>(`${scopeBase(scope)}/issues?state=${state}&scope=all&order_by=updated_at`);

export interface PipelineRow extends Pipeline { _project: Project }
/** Pipelines from the last 14 days, one request per project (the 30 most active in scope). */
export function usePipelines(tree: Tree, scope: Scope) {
  const key = useKey();
  return useQuery({
    queryKey: [key, 'pipelines', scope.type, scope.id],
    queryFn: async () => {
      const ps = scopeProjects(tree, scope).slice(0, 30);
      const since = new Date(Math.floor((Date.now() - 14 * DAY) / HOUR) * HOUR).toISOString();
      const lists = await Promise.all(ps.map((p) =>
        getAll<Pipeline>(`/projects/${p.id}/pipelines?updated_after=${encodeURIComponent(since)}&order_by=id&sort=desc`, 1)
          .then((l) => l.map((x) => ({ ...x, _project: p })))
          .catch(() => [] as PipelineRow[])));
      return lists.flat().sort(byDate<PipelineRow>('created_at'));
    },
  });
}
/** The newest pipeline on each project's default branch. */
export function latestDefault(pipes: PipelineRow[]) {
  const m = new Map<number, PipelineRow>();
  for (const p of pipes) {
    if (p.ref !== (p._project.default_branch || 'main')) continue;
    if (!m.has(p.project_id)) m.set(p.project_id, p);
  }
  return m;
}

export interface MemberRow { user: Member; best: number; where: { path: string; level: number; expires?: string | null }[] }
/** Members with access (including inherited) plus direct grants in every subgroup. */
export function useMembers(tree: Tree, scope: Scope) {
  const key = useKey();
  return useQuery({
    queryKey: [key, 'members', scope.type, scope.id],
    queryFn: async (): Promise<MemberRow[]> => {
      if (scope.type === 'project') {
        const l = await getAll<Member>(`/projects/${scope.id}/members/all`);
        return l.map((m) => ({ user: m, best: m.access_level, where: [{ path: scope.full_path, level: m.access_level, expires: m.expires_at }] }));
      }
      const desc = tree.groups.filter((x) => x.id !== scope.id && inGroup(x.full_path, scope)).slice(0, 25);
      const [inh, ...direct] = await Promise.all([
        getAll<Member>(`${groupPath(scope.id)}/members/all`),
        ...desc.map((d) => getAll<Member>(`${groupPath(d.id)}/members`).then((l) => l.map((m) => ({ ...m, _g: d }))).catch(() => [])),
      ]);
      const by = new Map<number, MemberRow>();
      const add = (m: Member, path: string) => {
        const e = by.get(m.id) || { user: m, best: 0, where: [] };
        e.where.push({ path, level: m.access_level, expires: m.expires_at });
        e.best = Math.max(e.best, m.access_level);
        by.set(m.id, e);
      };
      inh.forEach((m) => add(m, scope.full_path));
      (direct.flat() as (Member & { _g: Group })[]).forEach((m) => add(m, m._g.full_path));
      return [...by.values()].sort((a, b) => b.best - a.best || a.user.name.localeCompare(b.user.name));
    },
  });
}

export function useEvents(tree: Tree, scope: Scope) {
  const key = useKey();
  return useQuery({
    queryKey: [key, 'events', scope.type, scope.id],
    queryFn: async () => {
      const ps = scopeProjects(tree, scope).slice(0, 15);
      const lists = await Promise.all(ps.map((p) => get<GitLabEvent[]>(`/projects/${p.id}/events?per_page=20`).catch(() => [])));
      return { events: lists.flat().sort(byDate<GitLabEvent>('created_at')).slice(0, 120), projects: ps.length };
    },
  });
}

/* ---------- wikis ---------- */
export interface WikiSpace {
  key: string; // "group-1" or "project-1011", also used in URLs
  type: 'group' | 'project';
  id: number;
  name: string;
  path: string;
  web: string;
  base: string; // API path to the wiki, e.g. /projects/1011/wikis
  pages: WikiPageMeta[];
  error?: number | string;
}
export const spaceKey = (type: 'group' | 'project', id: number) => `${type}-${id}`;
export function parseSpaceKey(k: string): { type: 'group' | 'project'; id: number } | null {
  const m = /^(group|project)-(\d+)$/.exec(k);
  return m ? { type: m[1] as 'group' | 'project', id: +m[2] } : null;
}
export function spaceFor(tree: Tree, key: string): Omit<WikiSpace, 'pages'> | null {
  const k = parseSpaceKey(key);
  if (!k) return null;
  if (k.type === 'group') {
    const g = tree.groups.find((x) => x.id === k.id);
    return g ? { key, type: 'group', id: g.id, name: g.name, path: g.full_path, web: g.web_url, base: `${groupPath(g.id)}/wikis` } : null;
  }
  const p = tree.projMap.get(k.id);
  return p ? { key, type: 'project', id: p.id, name: p.name, path: p.path_with_namespace, web: p.web_url, base: `/projects/${p.id}/wikis` } : null;
}
/** Every wiki under the scope: group wikis (Premium) for each group and the project wikis. */
export function useWikiSpaces(tree: Tree, scope: Scope) {
  const key = useKey();
  return useQuery({
    queryKey: [key, 'wikis', scope.type, scope.id],
    queryFn: async (): Promise<WikiSpace[]> => {
      const spaces: Omit<WikiSpace, 'pages'>[] = [];
      if (scope.type === 'group') {
        for (const g of tree.groups.filter((x) => inGroup(x.full_path, scope)).slice(0, 25)) spaces.push(spaceFor(tree, spaceKey('group', g.id))!);
      }
      for (const p of scopeProjects(tree, scope).filter((p) => p.wiki_enabled !== false && p.wiki_access_level !== 'disabled').slice(0, 40)) {
        spaces.push(spaceFor(tree, spaceKey('project', p.id))!);
      }
      return Promise.all(spaces.map((s) =>
        get<WikiPageMeta[]>(s.base).then((pages) => ({ ...s, pages: Array.isArray(pages) ? pages : [] }))
          .catch((e) => ({ ...s, pages: [], error: e.status || 'failed' }))));
    },
  });
}
export function useWikiSpace(tree: Tree | undefined, key: string) {
  const k = useKey();
  return useQuery({
    queryKey: [k, 'wiki', key],
    enabled: !!tree,
    queryFn: async (): Promise<WikiSpace> => {
      const s = spaceFor(tree!, key);
      if (!s) throw new Error('This wiki is not part of the current group tree.');
      const pages = await get<WikiPageMeta[]>(s.base);
      return { ...s, pages };
    },
  });
}

/* ---------- writes ---------- */
/** A write that refreshes every cached query for this connection afterwards. */
export function useWrite() {
  const qc = useQueryClient();
  const key = useKey();
  return useCallback(async <T,>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) => {
    const out = await write<T>(method, path, body);
    await qc.invalidateQueries({ queryKey: [key] });
    return out;
  }, [qc, key]);
}

export const isDemo = () => connection.get().mode === 'demo';
