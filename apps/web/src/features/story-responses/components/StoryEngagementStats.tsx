import { MessageCircle, Heart, Flame, Smile } from 'lucide-react';

export interface StoryEngagementStatsProps {
  responseCount: number;
  reactionHeartCount: number;
  reactionCandleCount: number;
  reactionSmileCount: number;
  className?: string;
}

/**
 * Compact response/reaction counts for story card surfaces (hubs, legacy
 * pages) — shared by StoryCard and StoryCardList so both stay in sync.
 * Mirrors the "only show non-zero counts" convention FavoriteButton already
 * uses for favorite_count.
 */
export default function StoryEngagementStats({
  responseCount,
  reactionHeartCount,
  reactionCandleCount,
  reactionSmileCount,
  className = '',
}: StoryEngagementStatsProps) {
  const stats: { key: string; Icon: typeof MessageCircle; count: number; label: string }[] = [
    { key: 'responses', Icon: MessageCircle, count: responseCount, label: 'responses' },
    { key: 'heart', Icon: Heart, count: reactionHeartCount, label: 'heart reactions' },
    { key: 'candle', Icon: Flame, count: reactionCandleCount, label: 'candle reactions' },
    { key: 'smile', Icon: Smile, count: reactionSmileCount, label: 'smile reactions' },
  ].filter((stat) => stat.count > 0);

  if (stats.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {stats.map(({ key, Icon, count, label }) => (
        <span
          key={key}
          className="inline-flex items-center gap-0.5 text-[11px] text-neutral-400"
          aria-label={`${count} ${label}`}
        >
          <Icon size={11} />
          {count}
        </span>
      ))}
    </div>
  );
}
