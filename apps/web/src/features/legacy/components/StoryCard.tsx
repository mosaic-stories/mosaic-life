import { Calendar, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { StorySummary } from '@/features/story/api/stories';

export interface StoryCardProps {
  story: StorySummary;
  onClick?: () => void;
}

export default function StoryCard({ story, onClick }: StoryCardProps) {
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
      className="p-8 space-y-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <h3 className="text-neutral-900">{story.title}</h3>
          {story.content_preview && (
            <p className="text-neutral-600 text-sm line-clamp-2 mt-2">{story.content_preview}</p>
          )}
          {associatedLegaciesLabel && (
            <p className="text-neutral-500 text-sm mt-2">About: {associatedLegaciesLabel}</p>
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
        <Button variant="ghost" size="sm">
          <Heart className="size-4" />
        </Button>
      </div>
    </Card>
  );
}
