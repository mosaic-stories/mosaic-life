import { AlertCircle, Loader2, MessageSquare, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import StoryCard from './StoryCard';
import type { StorySummary } from '@/features/story/api/stories';

export interface StoriesSectionProps {
  stories: StorySummary[] | undefined;
  storiesLoading: boolean;
  storiesError: Error | null;
  onStoryClick: (storyId: string) => void;
  onAddStory: () => void;
}

export default function StoriesSection({
  stories,
  storiesLoading,
  storiesError,
  onStoryClick,
  onAddStory,
}: StoriesSectionProps) {
  return (
    <div className="max-w-3xl space-y-6">
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

      {!storiesLoading && !storiesError && stories?.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
          onClick={() => onStoryClick(story.id)}
        />
      ))}

      {!storiesLoading && !storiesError && stories?.length === 0 && (
        <Card className="p-8 text-center text-neutral-500">
          <MessageSquare className="size-12 mx-auto text-neutral-300 mb-4" />
          <p>No stories yet.</p>
          <p className="text-sm mt-1">Be the first to add a story to this legacy.</p>
        </Card>
      )}

      <Card
        className="p-8 border-dashed hover:border-theme-accent hover:bg-theme-accent-light/30 transition-colors cursor-pointer"
        onClick={onAddStory}
      >
        <div className="text-center space-y-3">
          <div className="size-12 rounded-full bg-theme-accent-light flex items-center justify-center mx-auto">
            <Plus className="size-6 text-theme-primary" />
          </div>
          <div>
            <p className="text-neutral-900">Add a new story</p>
            <p className="text-sm text-neutral-500">Share a memory or moment</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
