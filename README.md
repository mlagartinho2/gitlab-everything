# GitLab Everything

A web portal over the GitLab REST API for one top-level group and everything under it: subgroups, projects, merge requests, issues, pipelines, members, activity, search, an API explorer, and a full-screen wiki reader and Markdown editor.

It runs entirely in the browser. Out of the box it shows **demo data** (a sample company with 9 subgroups and 21 projects), so you can try every feature without a GitLab instance. Switch to **live mode** on the Connection page with your GitLab URL, a personal access token and your top-level group.

The full specification, written for implementing future enhancements, is in [docs/SPEC.md](docs/SPEC.md).

## Quick start

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev          # http://localhost:5173 with demo data
```

Then open **Connection** (top-right chip) to point the portal at your GitLab.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the built site on http://localhost:4173 |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright) against the demo data |

First time running the end-to-end tests: `npx playwright install chromium`, or use an installed Chrome with `CHROME_PATH=/path/to/chrome npm run e2e`.

## Connecting to your GitLab

1. Create a personal access token in GitLab (**Preferences → Access tokens**).
   - `read_api` is enough to browse.
   - `api` is needed to create and close issues, approve merge requests, retry pipelines, and create, edit or delete wiki pages.
2. In the portal, open **Connection**, choose **Your GitLab**, and enter the URL, the token and the path (or numeric ID) of your top-level group.
3. **Test connection** checks the version, your user and the group before you switch.

The token is kept in memory. If you tick *Keep the token in this browser tab*, it is also kept in `sessionStorage` until the tab closes. It is only ever sent to your GitLab URL.

### When GitLab blocks cross-origin requests

GitLab's REST API normally accepts requests from other origins when they carry a token header, so no backend is needed. If your instance sits behind an SSO gateway or blocks it, use a same-origin proxy:

- **Development:** set `GITLAB_PROXY_TARGET=https://gitlab.example.com` in `.env.local`, restart `npm run dev`, and enter `/gitlab` as the GitLab URL.
- **Production:** uncomment the `/gitlab/` block in `nginx.conf` and enter `/gitlab` as the GitLab URL.

### Prefilling the Connection page

Copy `.env.example` to `.env.local` and set `VITE_GITLAB_URL` and `VITE_GITLAB_ROOT_GROUP`. These are baked into the build; users still paste their own token.

## Deploying

The build output is a static site. Any static host works as long as unknown paths fall back to `index.html` (the app uses real URLs such as `/g/1/issues` and `/wiki/group-1/page/home`).

With Docker:

```bash
docker build -t gitlab-everything \
  --build-arg VITE_GITLAB_URL=https://gitlab.example.com \
  --build-arg VITE_GITLAB_ROOT_GROUP=my-group .
docker run -p 8080:8080 gitlab-everything
```

## Project layout

```
src/
  api/          GitLab client, connection settings, query hooks, demo data and demo router
  components/   Shared UI: icons, status pills, labels, drawers, new-issue dialog
  layout/       Shell: top bar, group tree
  views/        One file per tab (overview, issues, pipelines, …) and the view registry
  wiki/         Full-screen wiki: reader, editor (CodeMirror 6), preferences
  lib/          Pure code: formatting, Markdown renderer, wiki tables, checks, diff, templates
  state/        Toasts and overlays (drawers, dialogs)
  styles/       Design tokens and all CSS
e2e/            Playwright tests
docs/SPEC.md    Specification and guide for enhancements
```
