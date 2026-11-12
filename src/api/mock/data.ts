/* Demo data shaped like GitLab API v4 responses. Deterministic: the same seed builds the same company. */
import { DAY, HOUR, cap, hex, pick, rng, slug } from '../../lib/format';
import type { Branch, Commit, GitLabEvent, Group, Issue, MergeRequest, Pipeline, Project, User, WikiPage } from '../types';

export const DEMO_HOST = 'https://gitlab.example.com';

const GDEF: [number, string, string, number | null, string][] = [
  [1, 'Acme', 'acme', null, 'Top-level group for all engineering work'],
  [10, 'Platform', 'platform', 1, 'Runtime, networking and developer platform'],
  [11, 'Infrastructure', 'infra', 10, 'Cloud accounts, clusters and infrastructure as code'],
  [12, 'Observability', 'observability', 10, 'Logs, metrics, traces and alerting'],
  [20, 'Payments', 'payments', 1, 'Checkout, refunds and money movement'],
  [21, 'Ledger', 'ledger', 20, 'Bookkeeping and reconciliation'],
  [30, 'Mobile', 'mobile', 1, 'iOS, Android and the mobile backend'],
  [40, 'Data', 'data', 1, 'Warehouse, feature store and analytics'],
  [41, 'Pipelines', 'pipelines-etl', 40, 'Ingestion and transformation jobs'],
  [50, 'Shared Libraries', 'shared-libs', 1, 'Code shared across all teams'],
];
const PDEF: [number, string, string, string, string[]][] = [
  [11, 'terraform-modules', 'Reusable Terraform modules for AWS accounts and networking', 'HCL', ['VPC module', 'IAM roles', 'state backend']],
  [11, 'k8s-cluster-config', 'GitOps manifests for the production and staging clusters', 'YAML', ['ingress controller', 'cluster autoscaler', 'namespace quotas']],
  [12, 'log-shipper', 'Ships container logs to the central log store', 'Go', ['log batching', 'Kafka sink', 'line parser']],
  [12, 'metrics-gateway', 'Prometheus remote-write gateway with tenant isolation', 'Go', ['remote-write', 'tenant limits', 'scrape config']],
  [12, 'alert-rules', 'Alerting rules and runbooks for every service', 'YAML', ['SLO alerts', 'paging policy', 'runbook links']],
  [10, 'api-gateway', 'Edge gateway for public and partner APIs', 'Java', ['rate limiter', 'JWT validation', 'route config']],
  [10, 'service-mesh', 'Mesh policies, mTLS and traffic shaping', 'YAML', ['mTLS policy', 'retry budget', 'sidecar config']],
  [20, 'checkout-service', 'Cart, totals and checkout API', 'Java', ['cart totals', 'payment intents', 'checkout API']],
  [20, 'refunds-worker', 'Processes refund requests from the queue', 'Kotlin', ['refund queue', 'PSP client', 'idempotency keys']],
  [21, 'ledger-core', 'Double-entry ledger and balance service', 'Java', ['journal entries', 'balance snapshots', 'posting rules']],
  [21, 'reconciliation-jobs', 'Nightly reconciliation against PSP settlement files', 'Python', ['settlement parser', 'mismatch report', 'SFTP fetch']],
  [30, 'ios-app', 'Customer iOS app', 'Swift', ['onboarding flow', 'push notifications', 'offline cache']],
  [30, 'android-app', 'Customer Android app', 'Kotlin', ['onboarding flow', 'deep links', 'offline cache']],
  [30, 'mobile-bff', 'Backend for frontend serving both mobile apps', 'TypeScript', ['home feed', 'session refresh', 'GraphQL schema']],
  [40, 'analytics-warehouse', 'Warehouse schemas, grants and access policies', 'SQL', ['schema grants', 'PII masking', 'cost reports']],
  [40, 'feature-store', 'Online and offline feature store', 'Python', ['feature registry', 'online serving', 'backfill job']],
  [41, 'ingest-kafka', 'Kafka to object storage ingestion', 'Scala', ['topic consumer', 'schema registry', 'compaction']],
  [41, 'dbt-models', 'dbt models for the reporting layer', 'SQL', ['orders model', 'revenue mart', 'freshness tests']],
  [50, 'java-commons', 'Shared Java libraries for logging, config and HTTP clients', 'Java', ['HTTP client', 'config loader', 'structured logging']],
  [50, 'ui-kit', 'Design system components for web apps', 'TypeScript', ['Button', 'DataTable', 'theme tokens']],
  [50, 'ci-templates', 'Shared CI/CD templates included by every project', 'YAML', ['build template', 'SAST job', 'release job']],
];
const MR_T = ['Bump {dep} to {ver}', 'Add retry with backoff to {thing}', 'Fix flaky test in {thing}', 'Move CI to shared ci-templates', 'Remove deprecated v1 {thing} endpoints', 'Add OpenTelemetry spans to {thing}', 'Refactor {thing} loading', 'Put {thing} behind a feature flag', 'Cache {thing} lookups', 'Harden input validation in {thing}', 'Split {thing} into smaller modules', 'Add contract tests for {thing}'];
const ISSUE_T = ['{thing} returns 500 when the payload is empty', 'Timeouts in {thing} under load', 'Document how to run {thing} locally', 'Upgrade the base image used by {thing}', '{thing}: add metrics for error rate', 'Investigate memory growth in {thing}', 'Rotate credentials used by {thing}', 'Support pagination in {thing}', 'Flaky integration test around {thing}', 'Remove dead code in {thing}', '{thing} dashboard is missing p99 latency', 'CVE in a transitive dependency of {thing}'];
const DEPS = ['spring-boot', 'jackson-databind', 'react', 'gradle', 'node', 'terraform-provider-aws', 'kotlin', 'okhttp'];
export const DEMO_LABELS = ['bug', 'feature', 'tech-debt', 'security', 'performance', 'docs', 'ux'];
export const DEMO_MILESTONES = ['2026.11', '2026.12', '2027 Q1'];

export interface DemoMr extends MergeRequest { _approvedBy: number[] }
export interface DemoMembership { group_id: number; user_id: number; access_level: number; expires_at: string | null; created_at: string }
export interface DemoDb {
  me: User;
  users: User[];
  groups: Group[];
  projects: Project[];
  mrs: DemoMr[];
  issues: Issue[];
  pipelines: Pipeline[];
  events: GitLabEvent[];
  branches: Record<number, Branch[]>;
  commits: Record<number, Commit[]>;
  membership: DemoMembership[];
  wikis: Record<string, WikiPage[]>;
}

export function buildDemo(): DemoDb {
  const r = rng(20261111);
  const now = Date.now();
  const at = (h: number) => new Date(now - h * HOUR).toISOString();
  const fill = (t: string, things: string[]) =>
    t.replace('{thing}', pick(r, things)).replace('{dep}', pick(r, DEPS)).replace('{ver}', `${2 + Math.floor(r() * 4)}.${Math.floor(r() * 12)}.${Math.floor(r() * 9)}`);
  const team: User[] = ([['Ana Ribeiro', 'aribeiro'], ['Lukas Meier', 'lmeier'], ['Sofia Brunner', 'sbrunner'], ['Tiago Costa', 'tcosta'], ['Elena Rossi', 'erossi'], ['Jonas Keller', 'jkeller'], ['Inês Duarte', 'iduarte'], ['Marta Novak', 'mnovak'], ['Felix Huber', 'fhuber'], ['Priya Raman', 'praman'], ['Noah Fischer', 'nfischer'], ['Camille Laurent', 'claurent']] as const)
    .map(([name, username], i) => ({ id: 101 + i, name, username, state: 'active', avatar_url: null, web_url: `${DEMO_HOST}/${username}` }));
  const me: User = { id: 100, name: 'Demo User', username: 'demo', state: 'active', avatar_url: null, web_url: `${DEMO_HOST}/demo` };
  const users = [me, ...team];
  const who = () => pick(r, team);

  const groups: Group[] = [];
  for (const [id, name, path, parent, description] of GDEF) {
    const p = groups.find((g) => g.id === parent);
    const full_path = p ? `${p.full_path}/${path}` : path;
    groups.push({ id, name, path, full_path, full_name: p ? `${p.full_name} / ${name}` : name, parent_id: parent, description, visibility: 'internal', web_url: `${DEMO_HOST}/groups/${full_path}` });
  }

  const projects: Project[] = [], mrs: DemoMr[] = [], issues: Issue[] = [], pipelines: Pipeline[] = [], events: GitLabEvent[] = [];
  const branches: Record<number, Branch[]> = {}, commits: Record<number, Commit[]> = {}, wikis: Record<string, WikiPage[]> = {};
  let pid = 1000, plid = 884000, mid = 52000, isid = 31000, evid = 9000;
  const FLAKY = new Set(['reconciliation-jobs', 'ios-app', 'ingest-kafka']);
  const ev = (p: Project, h: number, author: User, action_name: string, extra: Partial<GitLabEvent>) =>
    events.push({ id: ++evid, project_id: p.id, action_name, author, author_username: author.username, created_at: at(h), ...extra });

  for (const [gid, path, description, lang, things] of PDEF) {
    const g = groups.find((x) => x.id === gid)!;
    const id = ++pid;
    const p: Project = {
      id, name: path, path, description, path_with_namespace: `${g.full_path}/${path}`, name_with_namespace: `${g.full_name} / ${path}`,
      namespace: { id: g.id, name: g.name, path: g.path, kind: 'group', full_path: g.full_path }, default_branch: 'main',
      visibility: r() < 0.8 ? 'internal' : 'private', open_issues_count: 0, last_activity_at: '', web_url: `${DEMO_HOST}/${g.full_path}/${path}`,
      topics: [lang], wiki_enabled: true,
    };
    projects.push(p);
    if (r() < 0.72) {
      const all: WikiPage[] = [
        { slug: 'home', title: 'Home', content: `# ${path}\n\n${description}.\n\n## Owners\n\n- Team: **${g.name}**\n- Chat channel: \`#team-${g.path}\`\n- Escalation: ${g.name} on-call\n\n## Pages\n\n- [Architecture](architecture)\n- [Runbook](runbook)\n- [Local development](local-development)\n` },
        { slug: 'architecture', title: 'Architecture', content: `# Architecture\n\n${cap(things[0])} talks to ${things[1]} and exposes ${things[2]}.\n\n| Component | Language | Owner |\n|---|---|---|\n| ${things[0]} | ${lang} | ${g.name} |\n| ${things[1]} | ${lang} | ${g.name} |\n| ${things[2]} | ${lang} | ${g.name} |\n\n> Decisions are recorded as ADRs in \`docs/adr\`.\n` },
        { slug: 'runbook', title: 'Runbook', content: `# Runbook\n\n## When ${things[0]} is degraded\n\n1. Check the error-rate dashboard for ${path}.\n2. Look for a recent deploy in the pipeline history.\n3. Roll back if the deploy is the cause:\n\n\`\`\`bash\nkubectl rollout undo deployment/${path} -n ${g.path}\n\`\`\`\n\n## Escalation\n\nPage the ${g.name} on-call if the error rate stays above 2% for 10 minutes.\n` },
        { slug: 'local-development', title: 'Local development', content: `# Local development\n\n\`\`\`bash\ngit clone ${DEMO_HOST}/${g.full_path}/${path}.git\ncd ${path}\nmake run\n\`\`\`\n\nRun \`make test\` before opening a merge request. CI uses the shared templates from **ci-templates**.\n` },
      ].map((w) => ({ format: 'markdown', encoding: 'UTF-8', ...w }));
      wikis['p:' + id] = [all[0], ...all.slice(1).filter(() => r() < 0.65)];
    }
    let newest = 9999;
    const touch = (h: number) => { newest = Math.min(newest, h); };

    const nOpen = Math.floor(r() * 5), nMerged = 2 + Math.floor(r() * 4), nClosed = r() < 0.4 ? 1 : 0;
    const openBranches: string[] = [];
    for (let k = 0, iid = 0; k < nOpen + nMerged + nClosed; k++) {
      iid++;
      const state = k < nMerged ? 'merged' : k < nMerged + nClosed ? 'closed' : 'opened';
      const title = fill(pick(r, MR_T), things);
      const createdH = state === 'opened' ? 2 + r() * 24 * 18 : 24 * 3 + r() * 24 * 10;
      const updatedH = createdH * (0.15 + r() * 0.6);
      const draft = state === 'opened' && r() < 0.2;
      const src = `${/^(Fix|Harden)/.test(title) ? 'fix' : 'feat'}/${slug(title)}`;
      if (state === 'opened') openBranches.push(src);
      const author = who();
      const reviewers = [who()].filter((u) => u.id !== author.id);
      if (r() < 0.35) { const u2 = who(); if (u2.id !== author.id && !reviewers.some((x) => x.id === u2.id)) reviewers.push(u2); }
      const dms = draft ? 'draft_status' : pick(r, ['mergeable', 'mergeable', 'not_approved', 'ci_still_running', 'conflict', 'discussions_not_resolved', 'mergeable']);
      mrs.push({
        id: ++mid, iid, project_id: id, title: (draft ? 'Draft: ' : '') + title,
        description: `${title}.\n\n- Updates tests\n- Keeps the public API unchanged\n\nCloses #${1 + Math.floor(r() * 9)}`,
        state, created_at: at(createdH), updated_at: at(updatedH), merged_at: state === 'merged' ? at(updatedH) : null,
        target_branch: 'main', source_branch: src, author, assignees: [author], reviewers, draft,
        detailed_merge_status: state === 'opened' ? dms : 'not_open', user_notes_count: Math.floor(r() * 14),
        labels: r() < 0.5 ? [pick(r, ['feature', 'tech-debt', 'bug', 'performance'])] : [], web_url: `${p.web_url}/-/merge_requests/${iid}`,
        references: { short: `!${iid}`, full: `${p.path_with_namespace}!${iid}` }, _approvedBy: [],
      });
      ev(p, createdH, author, 'opened', { target_type: 'MergeRequest', target_iid: iid, target_title: title });
      if (state === 'merged') ev(p, updatedH, pick(r, team), 'accepted', { target_type: 'MergeRequest', target_iid: iid, target_title: title });
      if (r() < 0.6) ev(p, updatedH + 0.5, pick(r, team), 'commented on', { target_type: 'Note', target_title: title, note: { noteable_type: 'MergeRequest' } });
      touch(updatedH);
    }

    const nIo = 1 + Math.floor(r() * 7), nIc = 2 + Math.floor(r() * 4);
    for (let k = 0, iid = 0; k < nIo + nIc; k++) {
      iid++;
      const state = k < nIc ? 'closed' : 'opened';
      const title = cap(fill(pick(r, ISSUE_T), things));
      const createdH = 6 + r() * 24 * 40, updatedH = createdH * (0.1 + r() * 0.7);
      const lab = [pick(r, DEMO_LABELS)];
      if (/CVE|credentials/.test(title) && !lab.includes('security')) lab.push('security');
      if (/500|Timeouts|Flaky|memory/.test(title) && !lab.includes('bug')) lab.unshift('bug');
      if (r() < 0.35) lab.push(`priority::${r() < 0.4 ? 'high' : 'medium'}`);
      const dueOff = Math.round((r() - 0.35) * 30);
      issues.push({
        id: ++isid, iid, project_id: id, title, description: `Reported while working on ${pick(r, things)}.\n\nSteps, logs and links go here.`,
        state, created_at: at(createdH), updated_at: at(updatedH), closed_at: state === 'closed' ? at(updatedH) : null, labels: [...new Set(lab)],
        assignees: r() < 0.75 ? [who()] : [], author: who(), milestone: r() < 0.6 ? { id: 7, title: pick(r, DEMO_MILESTONES) } : null,
        due_date: r() < 0.3 ? new Date(now + dueOff * DAY).toISOString().slice(0, 10) : null, weight: 1 + Math.floor(r() * 5),
        user_notes_count: Math.floor(r() * 9), web_url: `${p.web_url}/-/issues/${iid}`,
      });
      ev(p, createdH, who(), 'opened', { target_type: 'Issue', target_iid: iid, target_title: title });
      if (state === 'closed') ev(p, updatedH, who(), 'closed', { target_type: 'Issue', target_iid: iid, target_title: title });
      touch(updatedH);
    }
    p.open_issues_count = nIo;

    const nP = 12 + Math.floor(r() * 14);
    const hours = Array.from({ length: nP }, () => 0.3 + r() * 24 * 13.8).sort((a, b) => b - a);
    hours.forEach((h, k) => {
      const latest = k === hours.length - 1;
      const ref = r() < 0.55 || !openBranches.length ? 'main' : pick(r, openBranches);
      const status: Pipeline['status'] = latest && r() < 0.3 ? 'running' : r() < (FLAKY.has(path) ? 0.38 : 0.09) ? 'failed' : r() < 0.05 ? 'canceled' : 'success';
      const duration = status === 'running' ? null : Math.round(140 + r() * 760);
      const user = who();
      const plId = ++plid;
      pipelines.push({
        id: plId, iid: k + 1, project_id: id, status, ref, sha: hex(r, 40), source: ref === 'main' ? (r() < 0.15 ? 'schedule' : 'push') : 'merge_request_event',
        created_at: at(h), updated_at: at(Math.max(0, h - (duration || 0) / 3600)), duration, user, web_url: `${p.web_url}/-/pipelines/${plId}`,
      });
      if (ref !== 'main' || r() < 0.5) ev(p, h + 0.02, user, 'pushed to', { push_data: { ref, commit_count: 1 + Math.floor(r() * 3), commit_title: fill(pick(r, MR_T), things) } });
      touch(h);
    });
    if (FLAKY.has(path)) {
      const lm = pipelines.filter((x) => x.project_id === id && x.ref === 'main').pop();
      if (lm) { lm.status = 'failed'; lm.duration = lm.duration || 412; }
    }

    const cm: Commit[] = Array.from({ length: 16 }, (_, k) => {
      const a = who(), h = 3 + k * (8 + r() * 20), sha = hex(r, 40);
      return { id: sha, short_id: sha.slice(0, 8), title: fill(pick(r, MR_T), things), author_name: a.name, committed_date: at(h), created_at: at(h), web_url: `${p.web_url}/-/commit/${sha}` };
    });
    commits[id] = cm;
    branches[id] = ['main', 'release/2026.11', ...openBranches].map((name, k) => ({
      name, merged: false, protected: name === 'main' || name.startsWith('release/'), default: name === 'main',
      commit: k === 0 ? cm[0] : { ...cm[Math.min(k + 2, cm.length - 1)] }, web_url: `${p.web_url}/-/tree/${name}`,
    }));
    p.last_activity_at = at(newest);
  }

  const membership: DemoMembership[] = ([
    [1, 100, 50], [1, 101, 50], [1, 102, 40], [1, 103, 20],
    [10, 104, 40], [10, 105, 30], [11, 106, 30], [11, 104, 40], [12, 107, 30],
    [20, 108, 40], [20, 109, 30], [20, 110, 30], [21, 111, 30],
    [30, 112, 40], [30, 105, 30], [40, 107, 40], [40, 111, 20], [41, 106, 30],
    [50, 102, 40], [50, 109, 30], [50, 112, 30], [50, 110, 10],
  ] as const).map(([group_id, user_id, access_level], k) => ({
    group_id, user_id, access_level, expires_at: k === 13 ? new Date(now + 21 * DAY).toISOString().slice(0, 10) : null, created_at: at(24 * (30 + k * 11)),
  }));

  const gw = (slug: string, title: string, content: string): WikiPage => ({ format: 'markdown', encoding: 'UTF-8', slug, title, content });
  wikis['g:1'] = [
    gw('home', 'Engineering handbook', '# Engineering handbook\n\nHow we build and ship software at Acme.\n\n- [Release process](release-process)\n- [On-call rotation](on-call-rotation)\n- [Code review guidelines](code-review-guidelines)\n\nEvery team owns a subgroup. Projects live in the subgroup of the team that runs them in production.\n'),
    gw('release-process', 'Release process', '# Release process\n\n1. Merge to `main` behind a feature flag.\n2. The pipeline deploys to staging automatically.\n3. Promote to production with the manual **deploy-production** job.\n4. Tag the release as `vMAJOR.MINOR.PATCH`.\n\n> Freeze window: no production deploys after 16:00 on Fridays.\n'),
    gw('on-call-rotation', 'On-call rotation', '# On-call rotation\n\n| Team | Primary | Hand-over |\n|---|---|---|\n| Platform | weekly | Monday 10:00 |\n| Payments | weekly | Tuesday 10:00 |\n| Mobile | bi-weekly | Monday 10:00 |\n\nIncidents go in the `#incidents` channel first.\n'),
    gw('code-review-guidelines', 'Code review guidelines', '# Code review guidelines\n\n- One approval from a maintainer of the project.\n- Two approvals for anything touching **payments** or **ledger**.\n- Keep merge requests under 400 changed lines where you can.\n- Resolve every thread before merging.\n'),
  ];
  wikis['g:20'] = [gw('home', 'PCI scope', '# PCI scope\n\nProjects under **payments** handle card data and are in PCI DSS scope.\n\n- No production data in staging.\n- Secrets come from the vault, never from CI variables.\n- Quarterly access review of the payments group.\n')];
  wikis['g:10'] = [gw('home', 'Platform services', '# Platform services\n\n| Service | What it does |\n|---|---|\n| api-gateway | Public and partner API edge |\n| service-mesh | mTLS and traffic policy |\n| log-shipper | Central logging |\n| metrics-gateway | Metrics ingestion |\n')];

  return { me, users, groups, projects, mrs, issues, pipelines, events, branches, commits, membership, wikis };
}
