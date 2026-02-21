import { apiGet, apiPost, apiDelete } from '@/lib/api/client';

// --- Types ---

export interface VersionSummary {
  version_number: number;
  status: 'active' | 'inactive' | 'draft';
  source: string;
  source_version: number | null;
  change_summary: string | null;
  stale: boolean;
  created_by: string;
  created_at: string;
}

export interface VersionDetail extends VersionSummary {
  title: string;
  content: string;
}

export interface VersionListResponse {
  versions: VersionSummary[];
  total: number;
  page: number;
  page_size: number;
  warning: string | null;
}

// --- API Functions ---

export async function getVersions(
  storyId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<VersionListResponse> {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('page_size', String(pageSize));
  return apiGet<VersionListResponse>(
    `/api/stories/${storyId}/versions?${params.toString()}`
  );
}

export async function getVersion(
  storyId: string,
  versionNumber: number
): Promise<VersionDetail> {
  return apiGet<VersionDetail>(
    `/api/stories/${storyId}/versions/${versionNumber}`
  );
}

export async function restoreVersion(
  storyId: string,
  versionNumber: number
): Promise<VersionDetail> {
  return apiPost<VersionDetail>(
    `/api/stories/${storyId}/versions/${versionNumber}/activate`
  );
}

export async function approveDraft(
  storyId: string
): Promise<VersionDetail> {
  return apiPost<VersionDetail>(
    `/api/stories/${storyId}/versions/draft/approve`
  );
}

export async function discardDraft(storyId: string): Promise<void> {
  return apiDelete(`/api/stories/${storyId}/versions/draft`);
}
