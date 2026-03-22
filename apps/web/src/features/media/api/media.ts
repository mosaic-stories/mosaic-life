// Media API client
import { apiGet, apiPost, apiDelete, apiPatch, apiPut } from '@/lib/api/client';

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

export interface TagItem {
  id: string;
  name: string;
}

export interface MediaPersonItem {
  person_id: string;
  person_name: string;
  role: string;
}

export interface PersonSearchResult {
  id: string;
  canonical_name: string;
}

export interface MediaUpdateData {
  caption?: string | null;
  date_taken?: string | null;
  location?: string | null;
  era?: string | null;
}

export interface MediaItem {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  download_url: string;
  uploaded_by: string;
  uploader_name: string;
  uploader_username: string;
  uploader_avatar_url: string | null;
  legacies: LegacyAssociation[];
  created_at: string;
  favorite_count?: number;
  caption?: string | null;
  date_taken?: string | null;
  location?: string | null;
  era?: string | null;
  tags: TagItem[];
  people: MediaPersonItem[];
}

export interface MediaDetail extends MediaItem {
  storage_path: string;
}

export function getMediaContentUrl(mediaId: string): string {
  return `/api/media/${mediaId}/content`;
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
  // Use trailing slash to avoid 307 redirect that may use http:// behind proxy
  return apiGet<MediaItem[]>(`/api/media/${queryString ? `?${queryString}` : ''}`);
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

export async function setBackgroundImage(
  legacyId: string,
  mediaId: string
): Promise<void> {
  return apiPatch(`/api/legacies/${legacyId}/background-image`, {
    media_id: mediaId,
  });
}

export async function updateMedia(mediaId: string, data: MediaUpdateData): Promise<MediaDetail> {
  return apiPut<MediaDetail>(`/api/media/${mediaId}`, data);
}

export async function listMediaPeople(mediaId: string): Promise<MediaPersonItem[]> {
  return apiGet<MediaPersonItem[]>(`/api/media/${mediaId}/people`);
}

export async function tagPerson(mediaId: string, data: { person_id?: string; name?: string; role: string }): Promise<MediaPersonItem> {
  return apiPost<MediaPersonItem>(`/api/media/${mediaId}/people`, data);
}

export async function untagPerson(mediaId: string, personId: string): Promise<void> {
  return apiDelete(`/api/media/${mediaId}/people/${personId}`);
}

export async function listMediaTags(mediaId: string): Promise<TagItem[]> {
  return apiGet<TagItem[]>(`/api/media/${mediaId}/tags`);
}

export async function addMediaTag(mediaId: string, name: string, legacyId: string): Promise<TagItem> {
  return apiPost<TagItem>(`/api/media/${mediaId}/tags?legacy_id=${legacyId}`, { name });
}

export async function removeMediaTag(mediaId: string, tagId: string): Promise<void> {
  return apiDelete(`/api/media/${mediaId}/tags/${tagId}`);
}

export async function listLegacyTags(legacyId: string): Promise<TagItem[]> {
  return apiGet<TagItem[]>(`/api/tags/?legacy_id=${legacyId}`);
}

export async function searchPersons(query: string, legacyId?: string): Promise<PersonSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (legacyId) params.append('legacy_id', legacyId);
  return apiGet<PersonSearchResult[]>(`/api/persons/search?${params}`);
}
