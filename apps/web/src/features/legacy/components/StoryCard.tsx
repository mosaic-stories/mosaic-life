import { Calendar, Link2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { StorySummary } from '@/features/story/api/stories';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';

export interface StoryCardProps {
  story: StorySummary;
  onClick?: () => void;
  isFavorited?: boolean;
}

export default function StoryCard({ story, onClick, isFavorited = false }: StoryCardProps) {
  const authorInitials = story.author_name
    ? story.author_name.split(' ').map(n => n[0]).join('')
    : '?';
  const associatedLegaciesLabel = story.legacies
    .map((legacy) => legacy.role === 'primary'
      ? `${legacy.legacy_name} (primary)`
      : legacy.legacy_name)
    .join(' · ');
  const formattedDate = new Date(story.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Card
      className="min-w-0 p-8 space-y-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="min-w-0 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-neutral-900">{story.title}</h3>
            {story.status === 'draft' && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Draft
              </span>
            )}
            {story.shared_from && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                <Link2 className="size-3" />
                Shared from {story.shared_from}
              </span>
            )}
          </div>
          {story.content_preview && (
            <p className="text-neutral-600 text-sm line-clamp-2 mt-2">{story.content_preview}</p>
          )}
          {associatedLegaciesLabel && (
            <p className="truncate text-neutral-500 text-sm mt-2">About: {associatedLegaciesLabel}</p>
          )}
          <div className="flex items-center gap-3 text-sm text-neutral-500 mt-3">
            <div className="flex items-center gap-2">
              <Avatar className="size-6">
                <AvatarFallback className="text-xs">{authorInitials}</AvatarFallback>
              </Avatar>
              <span>{story.author_name || 'Anonymous'}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Calendar className="size-3" />
              <span>{formattedDate}</span>
            </div>
            {story.visibility !== 'public' && (
              <>
                <span>•</span>
                <Badge variant="outline" className="text-xs">
                  {story.visibility === 'private' ? 'Members only' : 'Personal'}
                </Badge>
              </>
            )}
          </div>
        </div>
        {!story.shared_from && (
          <div className="shrink-0">
            <FavoriteButton
              entityType="story"
              entityId={story.id}
              isFavorited={isFavorited}
              favoriteCount={story.favorite_count}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
