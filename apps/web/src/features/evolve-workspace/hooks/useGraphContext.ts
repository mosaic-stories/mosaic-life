import { useQuery } from '@tanstack/react-query';
import { getGraphContext, type GraphContextResponse } from '../api/graphContext';

export function useGraphContext(storyId: string | undefined, enabled = true) {
  return useQuery<GraphContextResponse>({
    queryKey: ['graph-context', storyId],
    queryFn: () => getGraphContext(storyId!),
    enabled: !!storyId && enabled,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: false,
  });
}
