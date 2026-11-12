import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inGroup, type Tree } from '../api/hooks';
import type { Group } from '../api/types';
import { Icon, SearchBox } from '../components/ui';
import { viewAllowed } from '../views/registry';

interface Selected { type: 'group' | 'project'; id: number; view: string }

/** The top-level group, its subgroups and projects, as an expandable tree that sets the scope. */
export function GroupTree({ tree, selected }: { tree: Tree; selected: Selected | null }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<Set<number>>(() => new Set([tree.root.id]));
  const [q, setQ] = useState('');

  // Keep the selected item's ancestors expanded.
  useEffect(() => {
    if (!selected) return;
    let g: Group | undefined = selected.type === 'project'
      ? tree.groups.find((x) => x.id === tree.projMap.get(selected.id)?.namespace.id)
      : tree.groups.find((x) => x.id === selected.id);
    const next = new Set(open);
    let changed = false;
    while (g) {
      if (!next.has(g.id)) { next.add(g.id); changed = true; }
      const parent: number | null = g.parent_id;
      g = tree.groups.find((x) => x.id === parent);
    }
    if (changed) setOpen(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.type, selected?.id, tree]);

  const count = useMemo(() => {
    const m = new Map<number, number>();
    for (const g of tree.groups) m.set(g.id, tree.projects.filter((p) => inGroup(p.namespace.full_path, g)).length);
    return m;
  }, [tree]);

  const go = (type: 'g' | 'p', id: number) => {
    const view = selected?.view || 'overview';
    const t = type === 'g' ? 'group' : 'project';
    navigate(`/${type}/${id}/${viewAllowed(view, t) ? view : 'overview'}`);
  };
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ql = q.trim().toLowerCase();

  const node = (g: Group, depth: number): JSX.Element | null => {
    const kids = tree.groups.filter((x) => x.parent_id === g.id).sort((a, b) => a.name.localeCompare(b.name));
    const kidEls = kids.map((k) => node(k, depth + 1)).filter(Boolean) as JSX.Element[];
    const projects = tree.projects.filter((p) => p.namespace.id === g.id).sort((a, b) => a.name.localeCompare(b.name))
      .filter((p) => !ql || p.name.toLowerCase().includes(ql) || g.name.toLowerCase().includes(ql));
    const selfMatch = !ql || g.name.toLowerCase().includes(ql) || g.path.toLowerCase().includes(ql);
    if (ql && !selfMatch && !kidEls.length && !projects.length) return null;
    const isOpen = !!ql || open.has(g.id);
    const hasKids = kids.length > 0 || tree.projects.some((p) => p.namespace.id === g.id);
    const sel = selected?.type === 'group' && selected.id === g.id;
    return (
      <div key={g.id}>
        <div className={`node${sel ? ' sel' : ''}`} style={{ paddingLeft: depth * 14 }}>
          <button className={`tw${hasKids ? '' : ' blank'}`} onClick={() => toggle(g.id)} aria-expanded={isOpen} aria-label={`Expand ${g.name}`}><Icon name="chev" /></button>
          <button className="nl" onClick={() => go('g', g.id)}><Icon name="group" /><span className="name">{g.name}</span><span className="cnt">{count.get(g.id)}</span></button>
        </div>
        {isOpen && kidEls}
        {isOpen && projects.map((p) => (
          <div key={p.id} className={`node${selected?.type === 'project' && selected.id === p.id ? ' sel' : ''}`} style={{ paddingLeft: (depth + 1) * 14 }}>
            <span className="tw blank" />
            <button className="nl" onClick={() => go('p', p.id)}><Icon name="repo" /><span className="name">{p.name}</span></button>
          </div>
        ))}
      </div>
    );
  };
  return (
    <>
      <div style={{ flex: 'none' }}><SearchBox value={q} onChange={setQ} placeholder="Filter groups and projects" id="treeQ" /></div>
      <div className="tree">{node(tree.root, 0) || <p className="muted" style={{ padding: '6px 4px', margin: 0 }}>Nothing matches that filter.</p>}</div>
    </>
  );
}
