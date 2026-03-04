import { MessageCircle, Users, Link, Sparkles, Loader2 } from 'lucide-react';
import { useConnectionsStats } from '@/features/connections/hooks/useConnections';

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

export default function ConnectionsStatsBar() {
  const { data: stats, isLoading } = useConnectionsStats();

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
      <StatItem icon={<MessageCircle className="size-5" />} count={stats.conversations_count} label="Conversations" />
      <StatItem icon={<Users className="size-5" />} count={stats.people_count} label="People" />
      <StatItem icon={<Link className="size-5" />} count={stats.shared_legacies_count} label="Shared Legacies" />
      <StatItem icon={<Sparkles className="size-5" />} count={stats.personas_used_count} label="Personas Used" />
    </div>
  );
}
