// TanStack Query hooks for media
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listMedia,
  requestUploadUrl,
  uploadFile,
  confirmUpload,
  deleteMedia,
  setProfileImage,
  validateFile,
  type MediaItem,
  type LegacyAssociationInput,
} from '@/lib/api/media';
import { legacyKeys } from './useLegacies';

export const mediaKeys = {
  all: ['media'] as const,
  lists: () => [...mediaKeys.all, 'list'] as const,
  list: (legacyId?: string) => [...mediaKeys.lists(), legacyId ?? 'all'] as const,
};

/**
 * Fetch media items, optionally filtered by legacy.
 * @param legacyId - Optional legacy ID to filter media
 * @param options - Query options including enabled flag
 */
export function useMedia(legacyId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: mediaKeys.list(legacyId),
    queryFn: () => listMedia(legacyId),
    // Only fetch when enabled (defaults to true for backwards compatibility)
    enabled: options?.enabled ?? true,
  });
}

/**
 * @deprecated Use useMedia instead
 */
export function useLegacyMedia(legacyId: string | undefined) {
  return useMedia(legacyId);
}

interface MediaUploadOptions {
  file: File;
  legacies?: LegacyAssociationInput[];
}

/**
 * Upload media with optional legacy associations.
 * @param legacyId - Optional legacy ID to associate media with (for backward compatibility)
 */
export function useMediaUpload(legacyId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: File | MediaUploadOptions): Promise<MediaItem> => {
      // Handle both old API (File) and new API (MediaUploadOptions)
      const file = options instanceof File ? options : options.file;
      const legacies = options instanceof File
        ? (legacyId ? [{ legacy_id: legacyId, role: 'primary' as const }] : undefined)
        : options.legacies;

      // Validate file
      const error = validateFile(file);
      if (error) {
        throw new Error(error);
      }

      // Step 1: Get upload URL
      const { upload_url, media_id } = await requestUploadUrl(file, legacies);

      // Step 2: Upload file directly
      await uploadFile(upload_url, file);

      // Step 3: Confirm upload
      return await confirmUpload(media_id);
    },
    onSuccess: () => {
      // Invalidate all media queries for the legacy if specified
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
      // Also invalidate the general media list
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
    },
  });
}

/**
 * Delete media.
 * @param legacyId - Optional legacy ID for cache invalidation (for backward compatibility)
 */
export function useDeleteMedia(legacyId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mediaId: string) => deleteMedia(mediaId),
    onSuccess: () => {
      // Invalidate specific legacy media list if legacyId provided
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
      // Also invalidate the general media list
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
    },
  });
}

export function useSetProfileImage(legacyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mediaId: string) => setProfileImage(legacyId, mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.detail(legacyId) });
    },
  });
}
