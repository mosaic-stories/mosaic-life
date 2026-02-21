// Invitation API functions
import { apiGet, apiPost, apiDelete } from './client';

export interface InvitationCreate {
  email?: string;
  user_id?: string;
  role: 'creator' | 'admin' | 'advocate' | 'admirer';
}

export interface InvitationResponse {
  id: string;
  legacy_id: string;
  email: string;
  role: string;
  invited_by: string;
  inviter_name: string | null;
  inviter_email: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

export interface InvitationPreview {
  legacy_id: string;
  legacy_name: string;
  legacy_biography: string | null;
  legacy_profile_image_url: string | null;
  inviter_name: string | null;
  role: string;
  expires_at: string;
  status: string;
}

export interface InvitationAcceptResponse {
  message: string;
  legacy_id: string;
  role: string;
}

export async function sendInvitation(
  legacyId: string,
  data: InvitationCreate
): Promise<InvitationResponse> {
  return apiPost<InvitationResponse>(
    `/api/legacies/${legacyId}/invitations`,
    data
  );
}

export async function listInvitations(
  legacyId: string
): Promise<InvitationResponse[]> {
  return apiGet<InvitationResponse[]>(
    `/api/legacies/${legacyId}/invitations`
  );
}

export async function revokeInvitation(
  legacyId: string,
  invitationId: string
): Promise<void> {
  return apiDelete(`/api/legacies/${legacyId}/invitations/${invitationId}`);
}

export async function getInvitationPreview(
  token: string
): Promise<InvitationPreview> {
  return apiGet<InvitationPreview>(`/api/invitations/${token}`);
}

export async function acceptInvitation(
  token: string
): Promise<InvitationAcceptResponse> {
  return apiPost<InvitationAcceptResponse>(
    `/api/invitations/${token}/accept`,
    {}
  );
}
