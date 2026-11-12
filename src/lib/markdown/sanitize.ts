import DOMPurify from 'dompurify';
import { isUpload } from '../wiki/paths';
import { renderMath } from './extras';

/**
 * Cleans HTML returned by GitLab's POST /markdown before it is shown, and adapts it to the
 * portal: absolute links and images, in-page anchors that do not touch the URL, Mermaid and
 * math placeholders, read-only task checkboxes.
 */
export function sanitizeGitLabHtml(html: string, opts: { base: string; wikiWeb: string }): string {
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'data-math-style', 'data-canonical-lang', 'lang'],
    FORBID_TAGS: ['style', 'form', 'textarea', 'select', 'button'],
  });
  const doc = new DOMParser().parseFromString(`<div>${clean}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const abs = (v: string) =>
    /^(https?:|data:image\/|blob:|mailto:)/i.test(v) ? v
      : v.startsWith('/') ? opts.base.replace(/\/+$/, '') + v
        : isUpload(v) ? `${opts.wikiWeb}/-/wikis/${v.replace(/^\//, '')}` : v;
  root.querySelectorAll('a').forEach((a) => {
    const h = a.getAttribute('href') || '';
    if (h.startsWith('#')) { a.setAttribute('data-anchor', h.slice(1)); a.setAttribute('href', '#'); }
    else { a.setAttribute('href', abs(h)); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
  });
  root.querySelectorAll('img').forEach((img) => {
    const s = img.getAttribute('data-src') || img.getAttribute('src');
    if (s) img.setAttribute('src', abs(s));
  });
  root.querySelectorAll('input').forEach((i) => (i.type === 'checkbox' ? i.setAttribute('disabled', '') : i.remove()));
  root.querySelectorAll('pre[lang="mermaid"], pre.language-mermaid, pre[data-canonical-lang="mermaid"]').forEach((pre) => {
    const d = doc.createElement('div');
    d.className = 'mermaid-box';
    d.setAttribute('data-mermaid', pre.textContent || '');
    pre.replaceWith(d);
  });
  root.querySelectorAll('code.js-render-math, [data-math-style]').forEach((c) => {
    const s = doc.createElement('span');
    s.innerHTML = renderMath(c.textContent || '', c.getAttribute('data-math-style') === 'display');
    c.replaceWith(s);
  });
  return root.innerHTML;
}
