import { useTopConnections } from '@/features/connections/hooks/useConnections';
import UserLink from '@/components/UserLink';

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
              <UserLink
                username={item.username}
                displayName={item.display_name}
                showAvatar
                avatarUrl={item.avatar_url}
                avatarClassName="size-12"
                className="flex max-w-[72px] flex-col items-center gap-1.5"
                nameClassName="max-w-[72px] truncate text-xs text-neutral-600"
              />
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-theme-primary text-white text-xs flex items-center justify-center font-medium">
                {item.shared_legacy_count}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
