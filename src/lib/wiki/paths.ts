/** GitLab turns a page title into a slug by replacing spaces with hyphens; slashes nest pages. */
export const pageSlug = (title: string) => String(title).trim().replace(/\s+/g, '-');

/** Heading anchor in the style GitLab uses: lowercase, punctuation removed, spaces to hyphens. */
export const headingId = (t: string) =>
  String(t).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'section';

/** Plain text of a line of Markdown, for outlines and anchors. */
export const stripMd = (t: string) =>
  String(t).replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_~`]/g, '').trim();

export const isExternal = (h: string) => /^(https?:|mailto:|tel:)/i.test(h);
export const isUpload = (h: string) => /^\/?uploads\//.test(h);

export interface ResolveContext {
  slugs: Set<string>;
  curSlug?: string;
}

/** Resolves a relative link in a wiki page to a page slug in the same wiki. */
export function resolveWiki(ctx: ResolveContext, href: string) {
  let h = String(href).trim();
  let anchor = '';
  const k = h.indexOf('#');
  if (k >= 0) {
    anchor = h.slice(k + 1);
    h = h.slice(0, k);
  }
  h = h.replace(/^\.\//, '').replace(/^\//, '').replace(/\.md$/i, '');
  try { h = decodeURIComponent(h); } catch { /* keep as is */ }
  const { slugs, curSlug } = ctx;
  if (!slugs.has(h) && curSlug && curSlug.includes('/')) {
    const dir = curSlug.slice(0, curSlug.lastIndexOf('/'));
    if (slugs.has(`${dir}/${h}`)) h = `${dir}/${h}`;
  }
  if (!slugs.has(h) && slugs.has(pageSlug(h))) h = pageSlug(h);
  return { slug: h, anchor, exists: slugs.has(h) };
}
