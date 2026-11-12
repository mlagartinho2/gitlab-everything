import type { WikiPageMeta } from '../../api/types';

export interface PageNode {
  name: string;
  path: string;
  page: WikiPageMeta | null;
  children: Map<string, PageNode>;
}

/** Nested pages (slugs with slashes) as a tree of folders and pages. */
export function buildPageTree(pages: WikiPageMeta[]): PageNode {
  const root: PageNode = { name: '', path: '', page: null, children: new Map() };
  for (const p of pages) {
    const parts = p.slug.split('/');
    let n = root;
    parts.forEach((part, i) => {
      if (!n.children.has(part)) n.children.set(part, { name: part.replace(/-/g, ' '), path: parts.slice(0, i + 1).join('/'), page: null, children: new Map() });
      n = n.children.get(part)!;
    });
    n.page = p;
  }
  return root;
}

export const sortedChildren = (n: PageNode) =>
  [...n.children.values()].sort((a, b) => Number(b.path === 'home') - Number(a.path === 'home') || (a.page?.title || a.name).localeCompare(b.page?.title || b.name));
