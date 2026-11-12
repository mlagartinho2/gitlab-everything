import { describe, expect, it } from 'vitest';
import { mdRender } from './render';

const html = (src: string, ctx = {}) => mdRender(src, ctx).html;

describe('mdRender', () => {
  it('renders headings with anchors, source lines and an outline', () => {
    const r = mdRender('# Title\n\ntext\n\n## Next step\n\n## Next step');
    expect(r.html).toContain('<h1 id="wkh-title" data-line="0">');
    expect(r.headings.map((h) => [h.level, h.id, h.line])).toEqual([[1, 'title', 0], [2, 'next-step', 4], [2, 'next-step-1', 6]]);
  });

  it('escapes raw HTML and refuses script links', () => {
    const out = html('<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('href="javascript');
  });

  it('keeps a small set of inline HTML tags', () => {
    expect(html('Press <kbd>Ctrl</kbd> and H<sub>2</sub>O')).toContain('<kbd>Ctrl</kbd>');
  });

  it('renders tables with alignment', () => {
    const out = html('| a | b |\n|:--|--:|\n| 1 | 2 |');
    expect(out).toContain('<th style="text-align:left">a</th>');
    expect(out).toContain('<td style="text-align:right">2</td>');
  });

  it('renders nested and task lists with the source line of each task', () => {
    const out = html('- one\n  - nested\n- [ ] todo\n- [x] done', { tasks: true });
    expect(out).toMatch(/<ul data-line="0"><li><span class="tt">one<\/span><ul data-line="1">/);
    expect(out).toContain('data-src-line="2"');
    expect(out).toMatch(/data-src-line="3" checked/);
  });

  it('renders GitLab alerts, details and a table of contents', () => {
    const out = html('[[_TOC_]]\n\n## A\n\n> [!warning]\n> careful\n\n<details>\n<summary>More</summary>\n\nhidden\n\n</details>');
    expect(out).toContain('class="alert alert-warning"');
    expect(out).toContain('<summary>More</summary>');
    expect(out).toContain('data-anchor="a">A</a>');
  });

  it('marks links to missing wiki pages', () => {
    const out = html('[ok](home) and [gone](missing-page)', { slugs: new Set(['home']) });
    expect(out).toContain('class="wl" data-wiki="home"');
    expect(out).toContain('class="wl broken" data-wiki="missing-page"');
  });

  it('turns issue and merge request references into chips', () => {
    const out = html('See #12 and !3 and group/repo#4', { projectId: 7, findProject: (p: string) => (p === 'group/repo' ? 9 : undefined) });
    expect(out).toContain('data-ref="#7:12"');
    expect(out).toContain('data-ref="!7:3"');
    expect(out).toContain('data-ref="#9:4"');
  });

  it('collects footnotes at the end', () => {
    const out = html('Fact[^1].\n\n[^1]: Source.');
    expect(out).toContain('class="fn"');
    expect(out).toContain('<section class="footnotes">');
  });

  it('keeps mermaid source for the diagram renderer and highlights code', () => {
    const out = html('```mermaid\ngraph LR\nA-->B\n```\n\n```js\nconst a = 1;\n```');
    expect(out).toContain('class="mermaid-box"');
    expect(out).toContain('hljs-keyword');
  });
});
