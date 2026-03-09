import { Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRecentlyViewed } from '@/features/activity/hooks/useActivity';

export default function RecentStoriesList() {
  const navigate = useNavigate();
  const { data, isLoading } = useRecentlyViewed('story', 5);

  if (isLoading || !data?.items?.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-serif font-medium tracking-tight">Recent Stories</h2>
        <button
          onClick={() => navigate('/stories')}
          className="text-xs text-theme-primary font-medium hover:underline"
        >
          Browse all
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {data.items.map((item, i) => {
          const story = item.entity;
          if (!story) return null;
          const legacyId = story.legacy_id;

          return (
            <button
              type="button"
              key={item.entity_id}
              onClick={() =>
                legacyId && navigate(`/legacy/${legacyId}/story/${item.entity_id}`)
              }
              className="flex items-start gap-3.5 bg-white rounded-xl px-4 py-3.5 border border-neutral-100 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            >
              <div
                className={`w-1 h-10 rounded-full shrink-0 mt-0.5 ${
                  i === 0 ? 'bg-theme-primary' : 'bg-neutral-200'
                }`}
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-serif font-medium truncate">
                  {story.title || 'Untitled'}
                </h4>
                {story.legacy_name && (
                  <div className="text-xs text-neutral-400 mt-0.5">{story.legacy_name}</div>
                )}
                {story.content_preview && (
                  <p className="text-xs text-neutral-500 mt-1.5 truncate leading-relaxed">
                    {story.content_preview}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 text-[11px] text-neutral-400">
                  {story.author_name && <span>by {story.author_name}</span>}
                  {item.last_activity_at && (
                    <>
                      <span className="opacity-40">&middot;</span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatRelativeDate(item.last_activity_at)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}
