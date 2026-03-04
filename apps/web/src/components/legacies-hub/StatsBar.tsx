import { Landmark, BookOpen, Link, Heart, Loader2 } from 'lucide-react';
import { useStats } from '@/features/settings/hooks/useSettings';

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
    <div className="flex flex-wrap gap-2 divide-x divide-neutral-200">
      <StatItem icon={<Landmark className="size-5" />} count={stats.legacies_count} label="Legacies" />
      <StatItem icon={<BookOpen className="size-5" />} count={stats.stories_count} label="Stories" />
      <StatItem icon={<Link className="size-5" />} count={stats.legacy_links_count} label="Connections" />
      <StatItem icon={<Heart className="size-5" />} count={stats.favorites_count} label="Favorites" />
    </div>
  );
}
