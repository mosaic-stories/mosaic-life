// Media API client
import { apiGet, apiPost, apiDelete, apiPatch } from './client';

export interface LegacyAssociation {
  legacy_id: string;
  legacy_name: string;
  role: 'primary' | 'secondary';
  position: number;
}

export interface LegacyAssociationInput {
  legacy_id: string;
  role?: 'primary' | 'secondary';
  position?: number;
}

export interface UploadUrlResponse {
  upload_url: string;
  media_id: string;
  storage_path: string;
}

export interface MediaItem {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  download_url: string;
  uploaded_by: string;
  uploader_name: string;
  legacies: LegacyAssociation[];
  created_at: string;
}

export interface MediaDetail extends MediaItem {
  storage_path: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File size exceeds maximum of 10 MB`;
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `File type '${file.type}' not allowed. Use JPEG, PNG, GIF, or WebP.`;
  }
  return null;
}

export async function requestUploadUrl(
  file: File,
  legacies?: LegacyAssociationInput[]
): Promise<UploadUrlResponse> {
  return apiPost<UploadUrlResponse>(
    `/api/media/upload-url`,
    {
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
      legacies,
    }
  );
}

export async function uploadFile(url: string, file: File): Promise<void> {
  // Don't rewrite S3 presigned URLs - use them directly
  const response = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
}

export async function confirmUpload(
  mediaId: string
): Promise<MediaItem> {
  return apiPost<MediaItem>(
    `/api/media/${mediaId}/confirm`
  );
}

export async function listMedia(legacyId?: string): Promise<MediaItem[]> {
  const params = new URLSearchParams();
  if (legacyId) params.append('legacy_id', legacyId);
  const queryString = params.toString();
  return apiGet<MediaItem[]>(`/api/media${queryString ? `?${queryString}` : ''}`);
}

export async function getMedia(
  mediaId: string
): Promise<MediaDetail> {
  return apiGet<MediaDetail>(`/api/media/${mediaId}`);
}

export async function deleteMedia(
  mediaId: string
): Promise<void> {
  return apiDelete(`/api/media/${mediaId}`);
}

export async function setProfileImage(
  legacyId: string,
  mediaId: string
): Promise<void> {
  return apiPatch(`/api/legacies/${legacyId}/profile-image`, {
    media_id: mediaId,
  });
}
