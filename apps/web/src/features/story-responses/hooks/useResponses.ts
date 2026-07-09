// TanStack Query hooks for story responses.
// Follows the query-key / mutation conventions in
// apps/web/src/features/story/hooks/useStories.ts and
// apps/web/src/features/favorites/hooks/useFavorites.ts.
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  listResponses,
  createResponse,
  updateResponse,
  deleteResponse,
  type StoryResponseItem,
  type StoryResponseListResponse,
} from '@/features/story-responses/api/responses';
import { storyKeys } from '@/features/story/hooks/useStories';
import { useAuth } from '@/contexts/AuthContext';

export const responseKeys = {
  all: ['story-responses'] as const,
  lists: () => [...responseKeys.all, 'list'] as const,
  list: (storyId: string) => [...responseKeys.lists(), storyId] as const,
};

type ResponsesPageData = InfiniteData<StoryResponseListResponse, string | undefined>;

/** Applies `transform` to every loaded page — for edits/removals, which may target any page. */
function updateCachedPages(
  old: ResponsesPageData | undefined,
  transform: (items: StoryResponseItem[]) => StoryResponseItem[],
): ResponsesPageData | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({ ...page, items: transform(page.items) })),
  };
}

/** Appends a newly-created item to the last page only, matching cursor-pagination order. */
function appendToLastPage(
  old: ResponsesPageData | undefined,
  item: StoryResponseItem,
): ResponsesPageData | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page, index) =>
      index === old.pages.length - 1 ? { ...page, items: [...page.items, item] } : page,
    ),
  };
}

export function useResponsesList(storyId: string | undefined) {
  return useInfiniteQuery({
    queryKey: responseKeys.list(storyId ?? ''),
    queryFn: ({ pageParam }) => listResponses(storyId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? (lastPage.next_cursor ?? undefined) : undefined,
    enabled: !!storyId,
  });
}

/** A locally-minted id so the optimistic row can be identified/removed on error. */
function makeTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useCreateResponse(storyId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<
    StoryResponseItem,
    Error,
    string,
    { previousData?: ResponsesPageData; tempId: string }
  >({
    mutationFn: (body: string) => createResponse(storyId, body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: responseKeys.list(storyId) });
      const previousData = queryClient.getQueryData<ResponsesPageData>(
        responseKeys.list(storyId),
      );
      const tempId = makeTempId();
      const optimisticItem: StoryResponseItem = {
        id: tempId,
        story_id: storyId,
        user_id: user?.id ?? '',
        user_name: user?.name ?? 'You',
        user_username: user?.username ?? '',
        user_avatar_url: user?.avatar_url ?? null,
        body,
        created_at: new Date().toISOString(),
        edited_at: null,
      };

      queryClient.setQueryData<ResponsesPageData>(responseKeys.list(storyId), (old) => {
        if (!old) {
          return {
            pages: [{ items: [optimisticItem], next_cursor: null, has_more: false }],
            pageParams: [undefined],
          };
        }
        return appendToLastPage(old, optimisticItem);
      });

      return { previousData, tempId };
    },
    onError: (_err, _body, context) => {
      if (context) {
        queryClient.setQueryData(responseKeys.list(storyId), context.previousData);
      }
    },
    onSettled: () => {
      // Reconcile the optimistic row (and its real id/timestamp) with the server.
      queryClient.invalidateQueries({ queryKey: responseKeys.list(storyId) });
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}

export function useUpdateResponse(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    StoryResponseItem,
    Error,
    { responseId: string; body: string },
    { previousData?: ResponsesPageData }
  >({
    mutationFn: ({ responseId, body }) => updateResponse(storyId, responseId, body),
    onMutate: async ({ responseId, body }) => {
      await queryClient.cancelQueries({ queryKey: responseKeys.list(storyId) });
      const previousData = queryClient.getQueryData<ResponsesPageData>(
        responseKeys.list(storyId),
      );
      queryClient.setQueryData<ResponsesPageData>(responseKeys.list(storyId), (old) =>
        updateCachedPages(old, (items) =>
          items.map((item) =>
            item.id === responseId
              ? { ...item, body, edited_at: new Date().toISOString() }
              : item,
          ),
        ),
      );
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context) {
        queryClient.setQueryData(responseKeys.list(storyId), context.previousData);
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<ResponsesPageData>(responseKeys.list(storyId), (old) =>
        updateCachedPages(old, (items) =>
          items.map((item) => (item.id === updated.id ? updated : item)),
        ),
      );
    },
  });
}

export function useDeleteResponse(storyId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    string,
    { previousData?: ResponsesPageData }
  >({
    mutationFn: (responseId: string) => deleteResponse(storyId, responseId),
    onMutate: async (responseId) => {
      await queryClient.cancelQueries({ queryKey: responseKeys.list(storyId) });
      const previousData = queryClient.getQueryData<ResponsesPageData>(
        responseKeys.list(storyId),
      );
      queryClient.setQueryData<ResponsesPageData>(responseKeys.list(storyId), (old) =>
        updateCachedPages(old, (items) => items.filter((item) => item.id !== responseId)),
      );
      return { previousData };
    },
    onError: (_err, _responseId, context) => {
      if (context) {
        queryClient.setQueryData(responseKeys.list(storyId), context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: responseKeys.list(storyId) });
      queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });
}
