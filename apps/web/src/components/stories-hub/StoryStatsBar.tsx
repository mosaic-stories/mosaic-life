import { FileText, Heart, Sparkles, Landmark, Loader2 } from 'lucide-react';
import { useStoryStats } from '@/features/story/hooks/useStories';

interface StatItemProps {
  icon: React.ReactNode;
  count: number;
  label: string;
}

function StatItem({ icon, count, label }: StatItemProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="text-neutral-400">{icon}</div>
      <div>
        <p className="text-lg font-semibold text-neutral-900">{count}</p>
        <p className="text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

export default function StoryStatsBar() {
  const { data: stats, isLoading } = useStoryStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="size-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="flex flex-wrap gap-2 divide-x divide-neutral-200">
      <StatItem icon={<FileText className="size-5" />} count={stats.my_stories_count} label="My Stories" />
      <StatItem icon={<Heart className="size-5" />} count={stats.favorites_given_count} label="Favorites" />
      <StatItem icon={<Sparkles className="size-5" />} count={stats.stories_evolved_count} label="Evolved" />
      <StatItem icon={<Landmark className="size-5" />} count={stats.legacies_written_for_count} label="Legacies" />
    </div>
  );
}
