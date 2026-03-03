import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useTopLegacies } from '@/features/story/hooks/useStories';
import { rewriteBackendUrlForDev } from '@/lib/url';

export default function TopLegaciesChips() {
  const navigate = useNavigate();
  const { data, isLoading } = useTopLegacies(6);

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-500">Top Legacies</h3>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.map((item) => (
          <button
            key={item.legacy_id}
            onClick={() => navigate(`/legacy/${item.legacy_id}`)}
            className="flex flex-col items-center gap-1.5 min-w-0 group"
          >
            <div className="relative">
              <div className="size-12 rounded-full overflow-hidden bg-neutral-100 ring-2 ring-transparent group-hover:ring-theme-primary transition-all">
                {item.profile_image_url ? (
                  <img
                    src={rewriteBackendUrlForDev(item.profile_image_url)}
                    alt={item.legacy_name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center">
                    <Users className="size-5 text-neutral-300" />
                  </div>
                )}
              </div>
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-theme-primary text-white text-xs flex items-center justify-center font-medium">
                {item.story_count}
              </span>
            </div>
            <span className="text-xs text-neutral-600 truncate max-w-[72px]">
              {item.legacy_name.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
