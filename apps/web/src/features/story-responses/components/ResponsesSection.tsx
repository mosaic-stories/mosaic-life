import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ResponseItem from './ResponseItem';
import { useResponsesList, useCreateResponse } from '@/features/story-responses/hooks/useResponses';

export interface ResponsesSectionProps {
  storyId: string;
  currentUserId?: string;
  /** Legacy creator/admin — can remove other members' responses. */
  canModerate: boolean;
  /** Authoritative count from the story record, shown in the section heading. */
  responseCount?: number;
}

export default function ResponsesSection({
  storyId,
  currentUserId,
  canModerate,
  responseCount,
}: ResponsesSectionProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useResponsesList(storyId);
  const createResponse = useCreateResponse(storyId);

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;

    setError(null);
    createResponse.mutate(trimmed, {
      onError: () => setError('Failed to post your response. Please try again.'),
    });
    // Optimistic insert happens inside the mutation; clear the input right away.
    setDraft('');
  };

  return (
    <section className="mt-12 border-t border-stone-200 pt-8" aria-label="Memories and responses">
      <h2 className="font-serif text-xl font-semibold text-neutral-900">
        Memories &amp; responses
        {typeof responseCount === 'number' && responseCount > 0 && (
          <span className="ml-2 text-sm font-normal text-neutral-400">{responseCount}</span>
        )}
      </h2>

      {currentUserId && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add what you remember…"
            rows={3}
            disabled={createResponse.isPending}
            aria-label="Add what you remember"
          />
          <div className="flex items-center justify-between">
            {error ? (
              <p className="text-xs text-red-600" role="alert">
                {error}
              </p>
            ) : (
              <span />
            )}
            <Button type="submit" size="sm" disabled={!draft.trim() || createResponse.isPending}>
              {createResponse.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Post
            </Button>
          </div>
        </form>
      )}

      <div className="mt-6 divide-y divide-stone-100">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-neutral-400">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-sm text-neutral-400">
            No responses yet. Be the first to share a memory.
          </p>
        ) : (
          items.map((response) => (
            <ResponseItem
              key={response.id}
              storyId={storyId}
              response={response}
              currentUserId={currentUserId}
              canModerate={canModerate}
            />
          ))
        )}
      </div>

      {hasNextPage && (
        <div className="mt-2 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              'Show more responses'
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
