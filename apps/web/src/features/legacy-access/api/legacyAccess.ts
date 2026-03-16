import { apiGet, apiPost, apiPatch } from '@/lib/api/client';

export interface LegacyAccessRequestCreate {
  requested_role: 'advocate' | 'admirer';
  message?: string | null;
}

export interface ConnectedMemberInfo {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
}

export interface LegacyAccessRequestResponse {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar_url: string | null;
  legacy_id: string;
  legacy_name: string;
  requested_role: string;
  assigned_role: string | null;
  message: string | null;
  status: string;
  connected_members: ConnectedMemberInfo[] | null;
  created_at: string;
  resolved_at: string | null;
}

export interface OutgoingAccessRequestResponse {
  id: string;
  legacy_id: string;
  legacy_name: string;
  requested_role: string;
  status: string;
  created_at: string;
}

export interface ApproveRequest {
  assigned_role?: 'advocate' | 'admirer' | 'admin';
}

export async function submitAccessRequest(
  legacyId: string,
  data: LegacyAccessRequestCreate
): Promise<LegacyAccessRequestResponse> {
  return apiPost<LegacyAccessRequestResponse>(
    `/api/legacies/${legacyId}/access-requests`,
    data
  );
}

export async function listPendingAccessRequests(
  legacyId: string
): Promise<LegacyAccessRequestResponse[]> {
  return apiGet<LegacyAccessRequestResponse[]>(
    `/api/legacies/${legacyId}/access-requests`
  );
}

export async function approveAccessRequest(
  legacyId: string,
  requestId: string,
  data?: ApproveRequest
): Promise<LegacyAccessRequestResponse> {
  return apiPatch<LegacyAccessRequestResponse>(
    `/api/legacies/${legacyId}/access-requests/${requestId}/approve`,
    data ?? {}
  );
}

export async function declineAccessRequest(
  legacyId: string,
  requestId: string
): Promise<{ status: string }> {
  return apiPatch<{ status: string }>(
    `/api/legacies/${legacyId}/access-requests/${requestId}/decline`,
    {}
  );
}

export async function getOutgoingAccessRequests(): Promise<
  OutgoingAccessRequestResponse[]
> {
  return apiGet<OutgoingAccessRequestResponse[]>(
    '/api/access-requests/outgoing'
  );
}
