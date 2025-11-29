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
} from '@/lib/api/media';
import { legacyKeys } from './useLegacies';

export const mediaKeys = {
  all: ['media'] as const,
  lists: () => [...mediaKeys.all, 'list'] as const,
  list: (legacyId: string) => [...mediaKeys.lists(), legacyId] as const,
};

export function useLegacyMedia(legacyId: string | undefined) {
  return useQuery({
    queryKey: mediaKeys.list(legacyId!),
    queryFn: () => listMedia(legacyId!),
    enabled: !!legacyId,
  });
}

export function useMediaUpload(legacyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<MediaItem> => {
      // Validate file
      const error = validateFile(file);
      if (error) {
        throw new Error(error);
      }

      // Step 1: Get upload URL
      const { upload_url, media_id } = await requestUploadUrl(legacyId, file);

      // Step 2: Upload file directly
      await uploadFile(upload_url, file);

      // Step 3: Confirm upload
      return await confirmUpload(legacyId, media_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
    },
  });
}

export function useDeleteMedia(legacyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mediaId: string) => deleteMedia(legacyId, mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.list(legacyId) });
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
