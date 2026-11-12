import { useCallback } from 'react';
import { relPath, useTree } from '../api/hooks';

/** Project names and paths relative to the root group, for labels across the app. */
export function useNames() {
  const { data: tree } = useTree();
  const rel = useCallback((p?: string) => relPath(tree, p), [tree]);
  const pname = useCallback((id: number) => relPath(tree, tree?.projMap.get(id)?.path_with_namespace) || `project ${id}`, [tree]);
  return { tree, rel, pname };
}
