import { useNavigate } from 'react-router-dom';
import { Loader2, FileEdit } from 'lucide-react';
import StoryCard from '@/features/legacy/components/StoryCard';
import { useScopedStories } from '@/features/story/hooks/useStories';
import type { StoryScope } from '@/features/story/api/stories';

export default function DraftsTabContent() {
  const navigate = useNavigate();
  const { data, isLoading } = useScopedStories('drafts' as StoryScope);

  const handleStoryClick = (storyId: string, legacyId?: string) => {
    if (legacyId) {
      navigate(`/legacy/${legacyId}/story/${storyId}`);
    }
  };

  return (
    <div className="space-y-6">
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.items.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onClick={() => handleStoryClick(story.id, story.legacies[0]?.legacy_id)}
            />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.items.length === 0) && (
        <div className="text-center py-12">
          <FileEdit className="size-12 mx-auto text-neutral-300 mb-4" />
          <p className="text-neutral-600">No drafts in progress.</p>
          <p className="text-sm text-neutral-500 mt-1">Start writing a new story!</p>
        </div>
      )}
    </div>
  );
}
