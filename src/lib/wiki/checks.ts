/* Checks run while editing: things that render badly or break links in GitLab. */
import { splitRow } from '../markdown/render';
import { headingId, isExternal, isUpload, resolveWiki, stripMd } from './paths';

export type Severity = 'error' | 'warning' | 'info';
export interface Check { severity: Severity; line: number; message: string }

export function checkMarkdown(src: string, ctx: { slugs: Set<string>; curSlug?: string }): Check[] {
  const L = src.split('\n');
  const out: Check[] = [];
  const seen = new Map<string, number>();
  let fence: number | null = null;
  let lastH = 0;
  let cols: number | null = null;
  L.forEach((l, i) => {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(l)) { fence = fence === null ? i : null; return; }
    if (fence !== null) return;
    const h = l.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (h) {
      const lv = h[1].length, id = headingId(stripMd(h[2]));
      if (lastH && lv > lastH + 1) out.push({ severity: 'warning', line: i, message: `Heading jumps from level ${lastH} to ${lv}` });
      lastH = lv;
      if (seen.has(id)) out.push({ severity: 'info', line: i, message: `Duplicate heading, also on line ${seen.get(id)! + 1}. Its link gets a number suffix.` });
      else seen.set(id, i);
    } else if (/^\s{0,3}#{1,6}[^\s#]/.test(l) && !/^\s*#\d/.test(l)) {
      out.push({ severity: 'info', line: i, message: 'Missing space after # — this will not render as a heading' });
    }
    const code = l.replace(/`[^`]*`/g, '');
    for (const m of code.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g)) {
      const [, bang, txt, href] = m;
      if (!href) out.push({ severity: 'error', line: i, message: `${bang ? 'Image' : 'Link'} has no target` });
      else if (bang && !txt.trim()) out.push({ severity: 'warning', line: i, message: 'Image has no alt text for screen readers' });
      else if (!bang && !txt.trim()) out.push({ severity: 'warning', line: i, message: 'Link has no text' });
      else if (!bang && !isExternal(href) && !href.startsWith('#') && !isUpload(href) && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        const r = resolveWiki(ctx, href);
        if (!r.exists) out.push({ severity: 'warning', line: i, message: `“${r.slug}” is not a page in this wiki yet` });
      }
      if (/^javascript:/i.test(href)) out.push({ severity: 'error', line: i, message: 'GitLab removes javascript: links' });
    }
    if (/\[Uploading .*…\]\(\)/.test(l)) out.push({ severity: 'info', line: i, message: 'Upload still in progress' });
    if (/<script\b/i.test(l)) out.push({ severity: 'error', line: i, message: 'GitLab strips script tags from wiki pages' });
    if (/^\s*\|/.test(l)) {
      const cells = splitRow(l).length;
      if (i + 1 < L.length && /^\s*\|?\s*:?-+:?\s*\|/.test(L[i + 1])) cols = cells;
      else if (cols !== null && !/^\s*\|?\s*:?-+/.test(l) && cells !== cols) out.push({ severity: 'warning', line: i, message: `Table row has ${cells} cells, the header has ${cols}` });
    } else cols = null;
  });
  if (fence !== null) out.push({ severity: 'error', line: fence, message: 'Code block is never closed' });
  return out.sort((a, b) => a.line - b.line);
}
