import hljs from 'highlight.js/lib/common';
import katex from 'katex';
import { esc } from '../format';

export const EMOJI: Record<string, string> = {
  smile: '😄', grinning: '😀', joy: '😂', wink: '😉', thinking: '🤔', thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎', ok_hand: '👌',
  clap: '👏', wave: '👋', pray: '🙏', muscle: '💪', eyes: '👀', heart: '❤️', tada: '🎉', rocket: '🚀', fire: '🔥', sparkles: '✨', star: '⭐',
  zap: '⚡', boom: '💥', bulb: '💡', warning: '⚠️', rotating_light: '🚨', no_entry: '⛔', stop_sign: '🛑', x: '❌', white_check_mark: '✅',
  heavy_check_mark: '✔️', question: '❓', exclamation: '❗', information_source: 'ℹ️', bug: '🐛', construction: '🚧', wrench: '🔧', hammer: '🔨',
  gear: '⚙️', lock: '🔒', unlock: '🔓', key: '🔑', link: '🔗', memo: '📝', pencil2: '✏️', book: '📖', books: '📚', bookmark: '🔖', pushpin: '📌',
  paperclip: '📎', calendar: '📅', hourglass: '⌛', chart_with_upwards_trend: '📈', chart_with_downwards_trend: '📉', bar_chart: '📊', package: '📦',
  mag: '🔍', inbox_tray: '📥', outbox_tray: '📤', recycle: '♻️', arrow_right: '➡️', arrow_left: '⬅️', arrow_up: '⬆️', arrow_down: '⬇️', '100': '💯',
  coffee: '☕', cloud: '☁️', computer: '💻', robot: '🤖', test_tube: '🧪', shield: '🛡️', speech_balloon: '💬', mega: '📣', bell: '🔔', trophy: '🏆',
  dart: '🎯', checkered_flag: '🏁',
};

/** Syntax highlighting for fenced code blocks (highlight.js common languages). */
export function highlight(code: string, lang: string): string {
  const alias: Record<string, string> = { sh: 'bash', shell: 'bash', yml: 'yaml', js: 'javascript', ts: 'typescript', };
  const l = alias[lang] || lang;
  if (l && hljs.getLanguage(l)) {
    try { return hljs.highlight(code, { language: l, ignoreIllegals: true }).value; } catch { /* fall through */ }
  }
  return esc(code);
}

/** LaTeX to MathML, which browsers render without any extra CSS or fonts. */
export function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, output: 'mathml', throwOnError: false, strict: 'ignore', trust: false });
  } catch {
    return `<code class="math-raw">${esc(tex)}</code>`;
  }
}

const isDark = () => {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

/* Mermaid is large, so it loads on demand the first time a page contains a diagram. */
const cache = new Map<string, string>();
let seq = 0;
let theme: boolean | null = null;
let lib: Promise<typeof import('mermaid')['default']> | null = null;

/** Renders every `.mermaid-box[data-mermaid]` inside root. Safe to call repeatedly. */
export async function renderMermaid(root: HTMLElement) {
  const boxes = [...root.querySelectorAll<HTMLElement>('.mermaid-box[data-mermaid]:not([data-done])')];
  if (!boxes.length) return;
  let mermaid: typeof import('mermaid')['default'];
  try {
    mermaid = await (lib ??= import('mermaid').then((m) => m.default));
  } catch {
    lib = null;
    boxes.forEach((b) => { b.dataset.done = '1'; b.insertAdjacentHTML('beforeend', '<p class="mm-err">The diagram library could not load, so the source is shown.</p>'); });
    return;
  }
  const dark = isDark();
  if (theme !== dark) {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', fontFamily: 'IBM Plex Sans, system-ui, sans-serif' });
    theme = dark;
  }
  for (const b of boxes) {
    if (!b.isConnected) continue;
    b.dataset.done = '1';
    const src = b.dataset.mermaid || '';
    const key = (dark ? 'd' : 'l') + src;
    let svg = cache.get(key);
    if (!svg) {
      const id = 'gle-mm-' + ++seq;
      try {
        svg = (await mermaid.render(id, src)).svg;
        cache.set(key, svg);
      } catch (e) {
        document.getElementById('d' + id)?.remove();
        document.getElementById(id)?.remove();
        if (b.isConnected) b.innerHTML = `<pre><code>${esc(src)}</code></pre><p class="mm-err">Diagram error: ${esc(String((e as Error)?.message || e).split('\n')[0])}</p>`;
        continue;
      }
    }
    if (b.isConnected) b.innerHTML = svg;
  }
}
