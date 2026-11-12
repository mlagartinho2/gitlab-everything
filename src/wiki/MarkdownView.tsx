import { forwardRef, useEffect, useRef, type MouseEvent } from 'react';
import { renderMermaid } from '../lib/markdown/extras';
import { findAnchor } from '../lib/markdown/render';
import { useOverlays } from '../state/overlays';
import { useCopy, useToast } from '../state/toast';

interface Props {
  html: string;
  /** Called with the 0-based source line when a task checkbox is clicked. */
  onTask?: (line: number, checked: boolean, input: HTMLInputElement) => void;
  /** Called when a link to another wiki page is clicked. Without it, such links do nothing. */
  onWikiLink?: (slug: string, anchor: string) => void;
  /** Called when a heading's # link is clicked, to copy a link to that section. */
  onSectionLink?: (anchor: string) => void;
  className?: string;
  id?: string;
}

/** Rendered Markdown with diagrams, copy buttons, in-page anchors and issue/MR references wired up. */
export const MarkdownView = forwardRef<HTMLDivElement, Props>(function MarkdownView({ html, onTask, onWikiLink, onSectionLink, className = '', id }, outer) {
  const inner = useRef<HTMLDivElement | null>(null);
  const overlays = useOverlays();
  const copy = useCopy();
  const toast = useToast();
  useEffect(() => { if (inner.current) renderMermaid(inner.current); }, [html]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const box = inner.current!;
    const target = e.target as HTMLElement;
    const cp = target.closest('[data-copy]');
    if (cp) { copy(cp.closest('.code')?.querySelector('pre')?.innerText || ''); return; }
    if (target instanceof HTMLInputElement && target.classList.contains('task')) {
      if (onTask) onTask(Number(target.dataset.srcLine), target.checked, target);
      else e.preventDefault();
      return;
    }
    const a = target.closest('a');
    if (!a) return;
    if (a.dataset.anchor != null) {
      e.preventDefault();
      findAnchor(box, a.dataset.anchor)?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      if (a.classList.contains('anchor')) onSectionLink?.(a.dataset.anchor);
      return;
    }
    if (a.dataset.wiki != null) {
      e.preventDefault();
      if (onWikiLink) onWikiLink(a.dataset.wiki, a.dataset.hash || '');
      else toast('Links to other pages open from the reader.');
      return;
    }
    if (a.dataset.ref) {
      e.preventDefault();
      const sym = a.dataset.ref[0] as '#' | '!';
      const [pid, iid] = a.dataset.ref.slice(1).split(':').map(Number);
      overlays.openReference(sym, pid, iid);
      return;
    }
    if ((a.getAttribute('href') || '').startsWith('#')) e.preventDefault();
  };
  return (
    <div
      id={id}
      className={`md ${className}`}
      ref={(el) => { inner.current = el; if (typeof outer === 'function') outer(el); else if (outer) outer.current = el; }}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
