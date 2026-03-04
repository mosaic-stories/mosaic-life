import { User } from 'lucide-react';
import { useTopConnections } from '@/features/connections/hooks/useConnections';

export default function TopConnectionsChips() {
  const { data, isLoading } = useTopConnections(6);

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-500">Top Connections</h3>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.map((item) => (
          <div
            key={item.user_id}
            className="flex flex-col items-center gap-1.5 min-w-0"
          >
            <div className="relative">
              <div className="size-12 rounded-full overflow-hidden bg-neutral-100 ring-2 ring-transparent">
                {item.avatar_url ? (
                  <img
                    src={item.avatar_url}
                    alt={item.display_name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center">
                    <User className="size-5 text-neutral-300" />
                  </div>
                )}
              </div>
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-theme-primary text-white text-xs flex items-center justify-center font-medium">
                {item.shared_legacy_count}
              </span>
            </div>
            <span className="text-xs text-neutral-600 truncate max-w-[72px]">
              {item.display_name.split(' ')[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
