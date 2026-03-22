import { useState, useMemo } from 'react';
import { AlertCircle, Loader2, MessageSquare, PenLine } from 'lucide-react';
import { Card } from '@/components/ui/card';
import StoryCard from './StoryCard';
import type { StorySummary } from '@/features/story/api/stories';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import { useAuth } from '@/contexts/AuthContext';

type SortOption = 'recent' | 'oldest';

export interface StoriesSectionProps {
  stories: StorySummary[] | undefined;
  storiesLoading: boolean;
  storiesError: Error | null;
  onStoryClick: (storyId: string) => void;
  onAddStory: () => void;
  canAddStory?: boolean;
  isCreatingStory?: boolean;
}

export default function StoriesSection({
  stories,
  storiesLoading,
  storiesError,
  onStoryClick,
  onAddStory,
  canAddStory = true,
  isCreatingStory = false,
}: StoriesSectionProps) {
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const storyIds = stories?.map(s => s.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('story', user ? storyIds : []);

  const sortedStories = useMemo(() => {
    if (!stories) return [];
    const sorted = [...stories];
    if (sortBy === 'oldest') {
      sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted;
  }, [stories, sortBy]);

  return (
    <div className="space-y-5">
      {/* Header with sort */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl sm:text-[22px] font-semibold text-neutral-900">
          Stories
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="border border-stone-200 rounded-lg px-3 py-1.5 text-[13px] text-neutral-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-theme-primary"
          >
            <option value="recent">Most Recent</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {storiesLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {storiesError && (
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex items-center gap-3 text-red-800">
            <AlertCircle className="size-5" />
            <p>Failed to load stories</p>
          </div>
        </Card>
      )}

      {!storiesLoading && !storiesError && sortedStories.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
          onClick={() => onStoryClick(story.id)}
          isFavorited={favoriteData?.favorites[story.id] ?? false}
        />
      ))}

      {!storiesLoading && !storiesError && stories?.length === 0 && (
        <Card className="p-8 text-center text-neutral-500">
          <MessageSquare className="size-12 mx-auto text-neutral-300 mb-4" />
          <p>No stories yet.</p>
          <p className="text-sm mt-1">Be the first to add a story to this legacy.</p>
        </Card>
      )}

      {/* Share a Memory CTA */}
      {canAddStory && (
        <div
          className="border-2 border-dashed border-stone-300 rounded-xl p-8 text-center cursor-pointer hover:border-theme-accent transition-colors"
          onClick={isCreatingStory ? undefined : onAddStory}
        >
          <div className="size-11 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
            {isCreatingStory ? (
              <Loader2 className="size-5 text-theme-primary animate-spin" />
            ) : (
              <PenLine className="size-5 text-neutral-500" />
            )}
          </div>
          <p className="font-serif text-base font-semibold text-neutral-900">Share a Memory</p>
          <p className="text-[13px] text-neutral-400 mt-1">Write a story or start a conversation with AI</p>
        </div>
      )}
    </div>
  );
}
