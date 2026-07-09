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

interface ActivityFeedItemProps {
  item: SocialFeedItem;
  /**
   * @deprecated No longer used for rendering — the server-rendered
   * `item.summary` already accounts for the viewing user (rendered as
   * "You ..." for their own actions). Kept optional so existing call sites
   * don't need to change.
   */
  currentUserId?: string;
  onClick?: () => void;
}

/**
 * Renders an activity feed item from the server-provided `item.summary` —
 * a human sentence naming the actor and the affected legacy/story (see
 * `activity-feed-language`). The backend only ever returns items that have
 * a sentence template, so `summary` is always populated; this component
 * intentionally does not reconstruct any text from `item.metadata` or
 * `item.entity`, since raw metadata (e.g. an uploaded filename) must never
 * be shown verbatim.
 */
export default function ActivityFeedItem({ item, onClick }: ActivityFeedItemProps) {
  const Icon = entityIcons[item.entity_type] || BookOpen;
  const entityLabel = entityLabels[item.entity_type] || item.entity_type;

  const timeAgo = formatDistanceToNow(new Date(item.created_at), {
    addSuffix: true,
  });
  const isInteractive = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isInteractive}
      className={`flex items-start gap-3 w-full text-left py-3 px-2 rounded-lg transition-colors ${
        isInteractive
          ? 'hover:bg-neutral-50'
          : 'cursor-not-allowed opacity-60'
      }`}
    >
      <div className="mt-0.5 flex-shrink-0 size-8 rounded-full bg-neutral-100 flex items-center justify-center">
        <Icon className="size-4 text-neutral-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-neutral-900">{item.summary}</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          {entityLabel} &middot; {timeAgo}
        </p>
      </div>
    </button>
  );
}
