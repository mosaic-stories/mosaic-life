// TanStack Query hooks for media
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addMediaLegacyAssociation,
  clearBackgroundImage,
  clearProfileImage,
  listMedia,
  requestUploadUrl,
  uploadFile,
  confirmUpload,
  deleteMedia,
  setProfileImage,
  setBackgroundImage,
  validateFile,
  updateMedia,
  tagPerson,
  untagPerson,
  addMediaTag,
  removeMediaTag,
  listLegacyTags,
  searchPersons,
  type MediaItem,
  type LegacyAssociationInput,
  type MediaUpdateData,
} from '@/features/media/api/media';
import { legacyKeys } from '@/features/legacy/hooks/useLegacies';

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

export function useClearProfileImage(legacyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clearProfileImage(legacyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.detail(legacyId) });
    },
  });
}

export function useSetBackgroundImage(legacyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mediaId: string) => setBackgroundImage(legacyId, mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.detail(legacyId) });
    },
  });
}

export function useClearBackgroundImage(legacyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clearBackgroundImage(legacyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legacyKeys.detail(legacyId) });
    },
  });
}

export function useAddMediaLegacyAssociation(legacyId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      mediaId,
      targetLegacyId,
      role,
      position,
    }: {
      mediaId: string;
      targetLegacyId: string;
      role?: 'primary' | 'secondary';
      position?: number;
    }) => addMediaLegacyAssociation(mediaId, targetLegacyId, role, position),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: mediaKeys.list(legacyId ?? variables.targetLegacyId),
      });
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: legacyKeys.detail(variables.targetLegacyId),
      });
    },
  });
}

export function useUpdateMedia(legacyId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, data }: { mediaId: string; data: MediaUpdateData }) =>
      updateMedia(mediaId, data),
    onSuccess: () => {
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
    },
  });
}

export function useTagPerson(legacyId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, data }: { mediaId: string; data: { person_id?: string; name?: string; role: string } }) =>
      tagPerson(mediaId, data),
    onSuccess: () => {
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
    },
  });
}

export function useUntagPerson(legacyId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, personId }: { mediaId: string; personId: string }) =>
      untagPerson(mediaId, personId),
    onSuccess: () => {
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
    },
  });
}

export function useAddTag(legacyId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, name, legacyId: lid }: { mediaId: string; name: string; legacyId: string }) =>
      addMediaTag(mediaId, name, lid),
    onSuccess: () => {
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
    },
  });
}

export function useRemoveTag(legacyId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, tagId }: { mediaId: string; tagId: string }) =>
      removeMediaTag(mediaId, tagId),
    onSuccess: () => {
      if (legacyId) {
        queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
      }
    },
  });
}

export function useLegacyTags(legacyId?: string) {
  return useQuery({
    queryKey: [...mediaKeys.all, 'tags', legacyId] as const,
    queryFn: () => listLegacyTags(legacyId!),
    enabled: !!legacyId,
  });
}

export function useSearchPersons(query: string, legacyId?: string) {
  return useQuery({
    queryKey: [...mediaKeys.all, 'person-search', query, legacyId] as const,
    queryFn: () => searchPersons(query, legacyId),
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}
