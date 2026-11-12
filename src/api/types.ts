/**
 * The subset of GitLab REST API v4 response fields the portal reads.
 * Fields are optional where GitLab omits them on list endpoints or older versions.
 */
export interface User {
  id: number;
  name: string;
  username: string;
  state?: string;
  avatar_url?: string | null;
  web_url?: string;
}
export interface Member extends User {
  access_level: number;
  expires_at?: string | null;
}
export interface Group {
  id: number;
  name: string;
  path: string;
  full_path: string;
  full_name?: string;
  parent_id: number | null;
  description?: string | null;
  visibility?: string;
  web_url: string;
}
export interface Namespace {
  id: number;
  name: string;
  path: string;
  kind: string;
  full_path: string;
}
export interface Project {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  name_with_namespace?: string;
  description?: string | null;
  namespace: Namespace;
  default_branch?: string;
  visibility?: string;
  open_issues_count?: number;
  last_activity_at: string;
  web_url: string;
  topics?: string[];
  wiki_enabled?: boolean;
  wiki_access_level?: string;
}
export interface Label {
  id: number;
  name: string;
  color?: string;
}
export interface MergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description?: string | null;
  state: 'opened' | 'merged' | 'closed' | 'locked';
  created_at: string;
  updated_at: string;
  merged_at?: string | null;
  source_branch: string;
  target_branch: string;
  author: User;
  assignees?: User[];
  reviewers?: User[];
  draft?: boolean;
  detailed_merge_status?: string;
  merge_status?: string;
  user_notes_count?: number;
  labels: string[];
  web_url: string;
  references?: { short: string; full: string };
}
export interface Issue {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description?: string | null;
  state: 'opened' | 'closed';
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  labels: string[];
  assignees?: User[];
  author?: User;
  milestone?: { id: number; title: string } | null;
  due_date?: string | null;
  weight?: number | null;
  user_notes_count?: number;
  web_url: string;
}
export type PipelineStatus =
  | 'success' | 'failed' | 'running' | 'pending' | 'created' | 'canceled' | 'skipped' | 'manual'
  | 'scheduled' | 'waiting_for_resource' | 'preparing';
export interface Pipeline {
  id: number;
  iid?: number;
  project_id: number;
  status: PipelineStatus;
  ref: string;
  sha: string;
  source?: string;
  created_at: string;
  updated_at: string;
  duration?: number | null;
  user?: User;
  web_url: string;
}
export interface Job {
  id: number;
  name: string;
  stage: string;
  status: PipelineStatus;
  duration?: number | null;
  allow_failure?: boolean;
  web_url?: string;
}
export interface Commit {
  id: string;
  short_id: string;
  title: string;
  author_name: string;
  committed_date?: string;
  created_at?: string;
  web_url?: string;
}
export interface Branch {
  name: string;
  merged: boolean;
  protected: boolean;
  default: boolean;
  commit?: Commit;
  web_url?: string;
}
export interface GitLabEvent {
  id: number;
  project_id: number;
  action_name: string;
  target_type?: string | null;
  target_iid?: number | null;
  target_title?: string | null;
  author?: User;
  author_username?: string;
  created_at: string;
  push_data?: { ref: string; commit_count: number; commit_title?: string | null };
  note?: { noteable_type?: string };
}
export interface WikiPageMeta {
  slug: string;
  title: string;
  format: string;
}
export interface WikiPage extends WikiPageMeta {
  content: string;
  encoding?: string;
}
export interface WikiBlob {
  basename?: string;
  data: string;
  path?: string;
  filename?: string;
  startline: number;
  project_id: number;
}
export interface WikiAttachment {
  file_name: string;
  file_path: string;
  link?: { url: string; markdown: string };
}
