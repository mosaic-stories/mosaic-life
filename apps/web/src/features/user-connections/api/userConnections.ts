import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client';

// --- Connection Request Types ---

export interface ConnectionRequestCreate {
  to_user_id: string;
  relationship_type: string;
  message?: string | null;
}

export interface ConnectionRequestResponse {
  id: string;
  from_user_id: string;
  from_user_name: string;
  from_user_username: string;
  from_user_avatar_url: string | null;
  to_user_id: string;
  to_user_name: string;
  to_user_username: string;
  to_user_avatar_url: string | null;
  relationship_type: string;
  message: string | null;
  status: string;
  created_at: string;
}

// --- Connection Types ---

export interface ConnectionResponse {
  id: string;
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  connected_at: string;
}

export interface ConnectionDetailResponse extends ConnectionResponse {
  relationship_type: string | null;
  who_they_are_to_me: string | null;
  who_i_am_to_them: string | null;
  nicknames: string[] | null;
  character_traits: string[] | null;
}

export interface RelationshipUpdate {
  relationship_type?: string | null;
  who_they_are_to_me?: string | null;
  who_i_am_to_them?: string | null;
  nicknames?: string[] | null;
  character_traits?: string[] | null;
}

// --- Connection Request API ---

export async function createConnectionRequest(
  data: ConnectionRequestCreate
): Promise<ConnectionRequestResponse> {
  return apiPost<ConnectionRequestResponse>('/api/connections/requests', data);
}

export async function getIncomingRequests(): Promise<ConnectionRequestResponse[]> {
  return apiGet<ConnectionRequestResponse[]>('/api/connections/requests/incoming');
}

export async function getOutgoingRequests(): Promise<ConnectionRequestResponse[]> {
  return apiGet<ConnectionRequestResponse[]>('/api/connections/requests/outgoing');
}

export async function acceptRequest(
  requestId: string
): Promise<ConnectionResponse> {
  return apiPatch<ConnectionResponse>(
    `/api/connections/requests/${requestId}/accept`,
    {}
  );
}

export async function declineRequest(
  requestId: string
): Promise<{ status: string }> {
  return apiPatch<{ status: string }>(
    `/api/connections/requests/${requestId}/decline`,
    {}
  );
}

export async function cancelRequest(
  requestId: string
): Promise<{ status: string }> {
  return apiDelete<{ status: string }>(
    `/api/connections/requests/${requestId}`
  );
}

// --- Connection API ---

export async function listConnections(): Promise<ConnectionResponse[]> {
  return apiGet<ConnectionResponse[]>('/api/connections/list');
}

export async function removeConnection(
  connectionId: string
): Promise<{ status: string }> {
  return apiDelete<{ status: string }>(`/api/connections/${connectionId}`);
}

export async function getConnectionRelationship(
  connectionId: string
): Promise<ConnectionDetailResponse> {
  return apiGet<ConnectionDetailResponse>(
    `/api/connections/${connectionId}/relationship`
  );
}

export async function updateConnectionRelationship(
  connectionId: string,
  data: RelationshipUpdate
): Promise<ConnectionDetailResponse> {
  return apiPatch<ConnectionDetailResponse>(
    `/api/connections/${connectionId}/relationship`,
    data
  );
}
