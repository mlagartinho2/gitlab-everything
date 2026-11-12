/* Small presentational building blocks shared by every view. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PipelineStatus, User } from '../api/types';
import { hash, initials } from '../lib/format';
import { ICONS, type IconName } from '../lib/icons';
import { labelHue } from '../lib/labels';

export function Icon({ name, className = '', spin }: { name: IconName; className?: string; spin?: boolean }) {
  return <svg className={`i ${spin ? 'spin ' : ''}${className}`} viewBox="0 0 16 16" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

const STATUS: Record<string, [string, string, IconName]> = {
  success: ['passed', 'ok', 'check'], failed: ['failed', 'bad', 'x'], running: ['running', 'info', 'run'], pending: ['pending', 'warn', 'clock'],
  created: ['created', 'muted', 'clock'], waiting_for_resource: ['waiting', 'warn', 'clock'], preparing: ['preparing', 'warn', 'clock'],
  canceled: ['canceled', 'muted', 'slash'], skipped: ['skipped', 'muted', 'skip'], manual: ['manual', 'muted', 'play'], scheduled: ['scheduled', 'muted', 'clock'],
};
export function StatusPill({ status }: { status: PipelineStatus | string }) {
  const [label, tone, icon] = STATUS[status] || [status, 'muted', 'clock'];
  return <span className={`st st-${tone}`}><Icon name={icon} spin={status === 'running'} />{label}</span>;
}
export function StatusIcon({ status, title }: { status: string; title?: string }) {
  const [label, tone, icon] = STATUS[status] || [status, 'muted', 'clock'];
  return <span className={`sticon st-${tone}`} title={title || label}><Icon name={icon} spin={status === 'running'} /></span>;
}

export function Avatar({ user, large }: { user?: Pick<User, 'name' | 'username'> | null; large?: boolean }) {
  if (!user) return null;
  return <span className={`av${large ? ' lg' : ''}`} style={{ ['--h' as string]: hash(user.username || user.name) % 360 }} title={user.name}>{initials(user.name)}</span>;
}
export function Person({ user }: { user?: User | null }) {
  if (!user) return <span className="faint">—</span>;
  return <span className="person"><Avatar user={user} /><span>{user.name}</span></span>;
}
export function AvatarStack({ users }: { users: User[] }) {
  return <span className="stack">{users.slice(0, 4).map((u) => <Avatar key={u.id} user={u} />)}</span>;
}

export function Label({ name }: { name: string }) {
  const [scope, val] = String(name).split('::');
  return (
    <span className="lbl" style={{ ['--h' as string]: labelHue(scope) }}>
      <b>{scope}</b>{val && <em>{val}</em>}
    </span>
  );
}
export function Labels({ labels }: { labels?: string[] }) {
  if (!labels?.length) return <span className="faint">—</span>;
  return <div className="lbls">{labels.map((l) => <Label key={l} name={l} />)}</div>;
}
export function Tag({ tone = '', children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return <span className={`tag ${tone}`} title={title}>{children}</span>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id?: string }) {
  return (
    <label className="search">
      <Icon name="search" />
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}
export function Skeleton() {
  return <div className="panel panel-b"><div className="sk">{[42, 88, 76, 64, 81].map((w) => <div key={w} style={{ width: `${w}%` }} />)}</div></div>;
}
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as { status?: number; message?: string };
  return (
    <div className="panel empty">
      <h3>{e?.status ? `GitLab answered ${e.status}` : 'This view could not load'}</h3>
      <p>{e?.message || String(error)}</p>
      <div className="row">
        {onRetry && <button className="btn" onClick={onRetry}><Icon name="retry" />Try again</button>}
        <Link className="btn" to="/connection">Check connection</Link>
      </div>
    </div>
  );
}

export function Tile({ label, value, sub, to, tone }: { label: string; value: ReactNode; sub: ReactNode; to: string; tone?: string }) {
  return (
    <Link className={`tile${tone ? ' ' + tone : ''}`} to={to}>
      <span className="lbl-t">{label}</span><span className="val">{value}</span><span className="sub">{sub}</span>
    </Link>
  );
}

/** Renders loading and error states for a query, then the children with its data. */
export function Loaded<T>({ q, children }: { q: { data?: T; error: unknown; isPending: boolean; refetch: () => unknown }; children: (data: T) => ReactNode }) {
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending || q.data === undefined) return <Skeleton />;
  return <>{children(q.data)}</>;
}
