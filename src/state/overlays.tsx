import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get } from '../api/client';
import type { PipelineRow } from '../api/hooks';
import type { Issue, MergeRequest, Project } from '../api/types';
import { IssueDrawer, MergeRequestDrawer, PipelineDrawer } from '../components/Drawers';
import { NewIssueModal } from '../components/NewIssueModal';
import { useToast } from './toast';

type Drawer =
  | { kind: 'mr'; item: MergeRequest }
  | { kind: 'issue'; item: Issue }
  | { kind: 'pipeline'; item: PipelineRow }
  | null;

interface Overlays {
  openMergeRequest: (item: MergeRequest) => void;
  openIssue: (item: Issue) => void;
  openPipeline: (item: PipelineRow) => void;
  /** Fetches an issue (#) or merge request (!) by project and IID, then opens it. */
  openReference: (sym: '#' | '!', projectId: number, iid: number) => Promise<void>;
  openNewIssue: (projects: Project[]) => void;
  close: () => void;
}
const Ctx = createContext<Overlays | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [newIssue, setNewIssue] = useState<Project[] | null>(null);
  const toast = useToast();
  const close = useCallback(() => { setDrawer(null); setNewIssue(null); }, []);
  const openReference = useCallback(async (sym: '#' | '!', projectId: number, iid: number) => {
    try {
      if (sym === '#') setDrawer({ kind: 'issue', item: await get<Issue>(`/projects/${projectId}/issues/${iid}`) });
      else setDrawer({ kind: 'mr', item: await get<MergeRequest>(`/projects/${projectId}/merge_requests/${iid}`) });
    } catch (e) {
      toast((e as Error).message, true);
    }
  }, [toast]);
  const value = useMemo<Overlays>(() => ({
    openMergeRequest: (item) => setDrawer({ kind: 'mr', item }),
    openIssue: (item) => setDrawer({ kind: 'issue', item }),
    openPipeline: (item) => setDrawer({ kind: 'pipeline', item }),
    openReference,
    openNewIssue: (projects) => setNewIssue(projects),
    close,
  }), [openReference, close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && (drawer || newIssue)) close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer, newIssue, close]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {(drawer || newIssue) && <div className="scrim" onClick={close} />}
      {drawer?.kind === 'mr' && <MergeRequestDrawer item={drawer.item} onClose={close} />}
      {drawer?.kind === 'issue' && <IssueDrawer item={drawer.item} onClose={close} />}
      {drawer?.kind === 'pipeline' && <PipelineDrawer item={drawer.item} onClose={close} />}
      {newIssue && <NewIssueModal projects={newIssue} onClose={close} />}
    </Ctx.Provider>
  );
}
export function useOverlays() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOverlays must be used inside OverlayProvider');
  return v;
}
