import { Landmark, BookOpen, Image, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { SocialFeedItem } from '../api/activity';

const entityIcons: Record<string, typeof Landmark> = {
  legacy: Landmark,
  story: BookOpen,
  media: Image,
  conversation: MessageCircle,
};

const entityLabels: Record<string, string> = {
  legacy: 'Legacy',
  story: 'Story',
  media: 'Media',
  conversation: 'Conversation',
};

const actionLabels: Record<string, string> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  favorited: 'favorited',
  unfavorited: 'unfavorited',
  shared: 'shared',
  joined: 'joined',
  invited: 'invited',
  ai_conversation_started: 'started a conversation about',
  ai_story_evolved: 'evolved',
};

interface ActivityFeedItemProps {
  item: SocialFeedItem;
  currentUserId: string;
  onClick?: () => void;
}

export default function ActivityFeedItem({
  item,
  currentUserId,
  onClick,
}: ActivityFeedItemProps) {
  const Icon = entityIcons[item.entity_type] || BookOpen;
  const actorName = item.actor.id === currentUserId ? 'You' : item.actor.name;
  const actionText = actionLabels[item.action] || item.action;
  const entityLabel = entityLabels[item.entity_type] || item.entity_type;
  const metadata = item.metadata as
    | { title?: string; name?: string; filename?: string }
    | null
    | undefined;
  const entityName =
    item.entity?.title ||
    item.entity?.name ||
    item.entity?.filename ||
    metadata?.title ||
    metadata?.name ||
    metadata?.filename ||
    '';

  const timeAgo = formatDistanceToNow(new Date(item.created_at), {
    addSuffix: true,
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 w-full text-left py-3 px-2 rounded-lg hover:bg-neutral-50 transition-colors"
    >
      <div className="mt-0.5 flex-shrink-0 size-8 rounded-full bg-neutral-100 flex items-center justify-center">
        <Icon className="size-4 text-neutral-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-neutral-900">
          <span className="font-medium">{actorName}</span>{' '}
          {actionText}{' '}
          {entityName && (
            <span className="font-medium">&ldquo;{entityName}&rdquo;</span>
          )}
        </p>
        <p className="text-xs text-neutral-500 mt-0.5">
          {entityLabel} &middot; {timeAgo}
        </p>
      </div>
    </button>
  );
}
