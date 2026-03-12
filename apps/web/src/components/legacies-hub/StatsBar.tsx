import { Loader2 } from 'lucide-react';
import { useStats } from '@/features/settings/hooks/useSettings';

const STAT_ITEMS = [
  { emoji: '🏛', key: 'legacies_count', label: 'Legacies' },
  { emoji: '📖', key: 'stories_count', label: 'Stories' },
  { emoji: '🔗', key: 'legacy_links_count', label: 'Connections' },
  { emoji: '❤️', key: 'favorites_count', label: 'Favorites' },
] as const;

export default function StatsBar() {
  const { data: stats, isLoading } = useStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="size-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="flex flex-wrap gap-6">
      {STAT_ITEMS.map(({ emoji, key, label }) => (
        <div key={key} className="flex items-center gap-2.5">
          <span className="text-xl">{emoji}</span>
          <div>
            <div className="font-serif text-xl font-semibold text-neutral-900 leading-none">
              {stats[key]}
            </div>
            <div className="text-xs text-neutral-400 font-medium tracking-wide">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
