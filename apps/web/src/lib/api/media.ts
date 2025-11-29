// Media API client
import { apiGet, apiPost, apiDelete, apiPatch } from './client';

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
  created_at: string;
}

export interface MediaDetail extends MediaItem {
  legacy_id: string;
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
  legacyId: string,
  file: File
): Promise<UploadUrlResponse> {
  return apiPost<UploadUrlResponse>(
    `/api/legacies/${legacyId}/media/upload-url`,
    {
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
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
  legacyId: string,
  mediaId: string
): Promise<MediaItem> {
  return apiPost<MediaItem>(
    `/api/legacies/${legacyId}/media/${mediaId}/confirm`
  );
}

export async function listMedia(legacyId: string): Promise<MediaItem[]> {
  return apiGet<MediaItem[]>(`/api/legacies/${legacyId}/media`);
}

export async function getMedia(
  legacyId: string,
  mediaId: string
): Promise<MediaDetail> {
  return apiGet<MediaDetail>(`/api/legacies/${legacyId}/media/${mediaId}`);
}

export async function deleteMedia(
  legacyId: string,
  mediaId: string
): Promise<void> {
  return apiDelete(`/api/legacies/${legacyId}/media/${mediaId}`);
}

export async function setProfileImage(
  legacyId: string,
  mediaId: string
): Promise<void> {
  return apiPatch(`/api/legacies/${legacyId}/profile-image`, {
    media_id: mediaId,
  });
}
