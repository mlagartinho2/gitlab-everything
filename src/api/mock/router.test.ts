import { beforeEach, describe, expect, it } from 'vitest';
import { resetDemo, route } from './router';

const data = <T,>(method: string, path: string, body?: Record<string, unknown>) => route(method, path, body).data as T;

describe('demo API', () => {
  beforeEach(() => resetDemo());

  it('answers group tree endpoints', () => {
    expect(data<{ full_path: string }>('GET', '/groups/acme').full_path).toBe('acme');
    expect(data<unknown[]>('GET', '/groups/1/descendant_groups')).toHaveLength(9);
    expect(data<unknown[]>('GET', '/groups/1/projects?include_subgroups=true')).toHaveLength(21);
    expect(route('GET', '/groups/nope').status).toBe(404);
  });

  it('creates, renames and deletes wiki pages', () => {
    expect(route('POST', '/groups/1/wikis', { title: 'runbooks/Database failover', content: '# x' }).status).toBe(201);
    expect(data<{ title: string }>('GET', `/groups/1/wikis/${encodeURIComponent('runbooks/Database-failover')}`).title).toBe('Database failover');
    expect(route('POST', '/groups/1/wikis', { title: 'runbooks/Database failover' }).status).toBe(400);
    const renamed = data<{ slug: string }>('PUT', `/groups/1/wikis/${encodeURIComponent('runbooks/Database-failover')}`, { title: 'runbooks/DB' });
    expect(renamed.slug).toBe('runbooks/DB');
    expect(route('DELETE', `/groups/1/wikis/${encodeURIComponent('runbooks/DB')}`).status).toBe(204);
  });

  it('closes issues and approves merge requests', () => {
    const issues = data<{ iid: number; project_id: number }[]>('GET', '/groups/1/issues?state=opened');
    const i = issues[0];
    expect(data<{ state: string }>('PUT', `/projects/${i.project_id}/issues/${i.iid}`, { state_event: 'close' }).state).toBe('closed');
    const mr = data<{ iid: number; project_id: number }[]>('GET', '/groups/1/merge_requests?state=opened')[0];
    expect(data<{ approved: boolean }>('POST', `/projects/${mr.project_id}/merge_requests/${mr.iid}/approve`).approved).toBe(true);
  });

  it('marks endpoints it does not model', () => {
    expect(route('GET', '/groups/1/runners').status).toBe(404);
  });
});
