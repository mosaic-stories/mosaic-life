// Legacy Link API functions
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client';

export interface LegacyLinkResponse {
  id: string;
  person_id: string;
  requester_legacy_id: string;
  target_legacy_id: string;
  status: 'pending' | 'active' | 'rejected' | 'revoked';
  requester_share_mode: 'selective' | 'all';
  target_share_mode: 'selective' | 'all';
  requested_by: string;
  responded_by: string | null;
  requested_at: string;
  responded_at: string | null;
  revoked_at: string | null;
  requester_legacy_name: string | null;
  target_legacy_name: string | null;
  person_name: string | null;
}

export interface LegacyLinkShareResponse {
  id: string;
  resource_type: 'story' | 'media';
  resource_id: string;
  source_legacy_id: string;
  shared_at: string;
  shared_by: string;
}

export async function listLinks(): Promise<LegacyLinkResponse[]> {
  return apiGet<LegacyLinkResponse[]>('/api/legacy-links/');
}

export async function getLink(linkId: string): Promise<LegacyLinkResponse> {
  return apiGet<LegacyLinkResponse>(`/api/legacy-links/${linkId}`);
}

export async function createLinkRequest(params: {
  requester_legacy_id: string;
  target_legacy_id: string;
  person_id: string;
}): Promise<LegacyLinkResponse> {
  return apiPost<LegacyLinkResponse>(
    `/api/legacy-links/?requester_legacy_id=${params.requester_legacy_id}`,
    {
      target_legacy_id: params.target_legacy_id,
      person_id: params.person_id,
    }
  );
}

export async function respondToLink(
  linkId: string,
  action: 'accept' | 'reject'
): Promise<LegacyLinkResponse> {
  return apiPatch<LegacyLinkResponse>(
    `/api/legacy-links/${linkId}/respond`,
    { action }
  );
}

export async function revokeLink(linkId: string): Promise<LegacyLinkResponse> {
  return apiPatch<LegacyLinkResponse>(
    `/api/legacy-links/${linkId}/revoke`,
    {}
  );
}

export async function updateShareMode(
  linkId: string,
  mode: 'selective' | 'all'
): Promise<LegacyLinkResponse> {
  return apiPatch<LegacyLinkResponse>(
    `/api/legacy-links/${linkId}/share-mode`,
    { mode }
  );
}

export async function shareResource(
  linkId: string,
  resourceType: 'story' | 'media',
  resourceId: string
): Promise<LegacyLinkShareResponse> {
  return apiPost<LegacyLinkShareResponse>(
    `/api/legacy-links/${linkId}/shares`,
    { resource_type: resourceType, resource_id: resourceId }
  );
}

export async function unshareResource(
  linkId: string,
  shareId: string
): Promise<void> {
  return apiDelete(`/api/legacy-links/${linkId}/shares/${shareId}`);
}

export async function listShares(
  linkId: string
): Promise<LegacyLinkShareResponse[]> {
  return apiGet<LegacyLinkShareResponse[]>(
    `/api/legacy-links/${linkId}/shares`
  );
}
