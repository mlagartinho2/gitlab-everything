import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient, useTree } from './api/hooks';
import { Empty, ErrorBox, Skeleton } from './components/ui';
import { Shell } from './layout/Shell';
import { OverlayProvider } from './state/overlays';
import { ToastProvider } from './state/toast';
import { ConnectionPage } from './views/Connection';
import { ScopePage } from './views/ScopePage';

// The wiki workspace (editor, Markdown, diagrams) loads on first use to keep the portal fast.
const WikiWorkspace = lazy(() => import('./wiki/WikiWorkspace').then((m) => ({ default: m.WikiWorkspace })));

/**
 * Routes
 *   /                         → the top-level group's overview
 *   /g/:groupId/:view         → a group (views listed in views/registry.ts)
 *   /p/:projectId/:view       → a project
 *   /connection               → demo or live settings
 *   /wiki/:space/page/<slug>  → full-screen wiki reader (space = group-<id> or project-<id>)
 *   /wiki/:space/edit/<slug>  → full-screen editor
 *   /wiki/:space/new          → new page (?title= prefills the title)
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <OverlayProvider>
            <Routes>
              <Route path="/wiki/:space/*" element={<Suspense fallback={<div className="wk"><div className="wk-empty"><p>Loading the wiki…</p></div></div>}><WikiWorkspace /></Suspense>} />
              <Route element={<Shell />}>
                <Route index element={<Home />} />
                <Route path="connection" element={<ConnectionPage />} />
                <Route path="g/:id/:view?" element={<ScopePage type="group" />} />
                <Route path="p/:id/:view?" element={<ScopePage type="project" />} />
                <Route path="*" element={<div className="panel"><Empty title="Page not found">This address does not match anything in the portal. <Link to="/">Go to the overview</Link>.</Empty></div>} />
              </Route>
            </Routes>
          </OverlayProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function Home() {
  const tree = useTree();
  if (tree.error) return <ErrorBox error={tree.error} onRetry={() => tree.refetch()} />;
  if (!tree.data) return <Skeleton />;
  return <Navigate to={`/g/${tree.data.root.id}/overview`} replace />;
}
