/**
 * The tabs of a group or project. To add a view: create the component in src/views, add it here,
 * and add it to VIEW_COMPONENTS in ScopePage.tsx. `only` limits a view to groups or projects.
 */
export interface ViewDef { id: string; label: string; only?: 'group' | 'project' }

export const VIEWS: ViewDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects', only: 'group' },
  { id: 'merge-requests', label: 'Merge requests' },
  { id: 'issues', label: 'Issues' },
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'repository', label: 'Repository', only: 'project' },
  { id: 'wiki', label: 'Wiki' },
  { id: 'members', label: 'Members' },
  { id: 'activity', label: 'Activity' },
  { id: 'search', label: 'Search' },
  { id: 'api-explorer', label: 'API explorer' },
];

export const viewAllowed = (id: string, type: 'group' | 'project') => {
  const v = VIEWS.find((x) => x.id === id);
  return !!v && (!v.only || v.only === type);
};
