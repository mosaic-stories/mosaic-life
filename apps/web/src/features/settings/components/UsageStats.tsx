/**
 * Usage & Stats settings section.
 */

import { formatDistanceToNow } from 'date-fns';

import { useStats } from '@/features/settings/hooks/useSettings';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface StatCardProps {
  value: string | number;
  label: string;
}

function StatCard({ value, label }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

export default function UsageStats() {
  const { data: stats, isLoading } = useStats();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="grid grid-cols-3 gap-4">
          <div className="h-24 bg-gray-200 rounded"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8 text-gray-500">
        Unable to load statistics
      </div>
    );
  }

  const memberSince = new Date(stats.member_since);
  const memberSinceFormatted = memberSince.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const memberSinceRelative = formatDistanceToNow(memberSince, {
    addSuffix: true,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Usage & Stats</h2>
        <p className="text-sm text-gray-500">Your activity on Mosaic Life</p>
      </div>

      {/* Member Since */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700">Member Since</h3>
        <p className="mt-1 text-gray-900">
          {memberSinceFormatted}{' '}
          <span className="text-gray-500">({memberSinceRelative})</span>
        </p>
      </div>

      {/* Content Stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Content</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard value={stats.legacies_count} label="Legacies" />
          <StatCard value={stats.stories_count} label="Stories" />
          <StatCard value={stats.media_count} label="Media Items" />
          <StatCard
            value={formatBytes(stats.storage_used_bytes)}
            label="Storage Used"
          />
        </div>
      </div>

      {/* Engagement Stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Engagement</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard value={stats.chat_sessions_count} label="Chat Sessions" />
          <StatCard value={stats.legacy_views_total} label="Legacy Views" />
          <StatCard value={stats.collaborators_count} label="Collaborators" />
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Legacy Views shows total views across your public legacies.
          Collaborators counts unique contributors you've invited.
        </p>
      </div>
    </div>
  );
}
