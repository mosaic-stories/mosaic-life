import { ChevronRight, BookOpen, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatLegacyDates, getLegacyContext } from '@/features/legacy/api/legacies';
import type { Legacy } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import { formatDistanceToNow } from 'date-fns';

export interface LegacyCardListProps {
  legacy: Legacy;
  trailingAction?: React.ReactNode;
}

export default function LegacyCardList({ legacy, trailingAction }: LegacyCardListProps) {
  const navigate = useNavigate();
  const dates = formatLegacyDates(legacy);
  const context = getLegacyContext(legacy);
  const memberCount = legacy.members?.length ?? 0;

  return (
    <div
      className="flex items-center gap-5 px-5 py-4 border-b border-stone-100 hover:bg-stone-50 cursor-pointer transition-colors"
      onClick={() => navigate(`/legacy/${legacy.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(`/legacy/${legacy.id}`);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Avatar container */}
      <div className="relative shrink-0">
        {legacy.profile_image_url ? (
          <img
            src={rewriteBackendUrlForDev(legacy.profile_image_url)}
            alt={legacy.name}
            className="size-14 rounded-full border-2 border-stone-200 object-cover"
          />
        ) : (
          <div className="size-14 rounded-full border-2 border-stone-200 bg-stone-100 flex items-center justify-center">
            <Users className="size-6 text-neutral-300" />
          </div>
        )}
        {context === 'memorial' && (
          <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full px-1.5 py-0.5 text-[10px] shadow-sm border border-stone-200">
            In Memoriam
          </div>
        )}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <h3 className="font-serif text-lg font-semibold text-neutral-900 truncate">{legacy.name}</h3>
          <span className="text-sm text-neutral-400 shrink-0">{dates}</span>
        </div>
        {legacy.biography && (
          <p className="text-sm text-neutral-500 truncate mt-0.5">{legacy.biography}</p>
        )}
      </div>

      {/* Stats + meta */}
      <div className="flex items-center gap-5 shrink-0 text-sm text-neutral-500">
        <span className="flex items-center gap-1">
          <BookOpen className="size-3.5" />
          {legacy.story_count ?? 0} stories
        </span>
        <span className="flex items-center gap-1">
          <Users className="size-3.5" />
          {memberCount} members
        </span>
        <span className="text-xs text-neutral-400">
          {formatDistanceToNow(new Date(legacy.updated_at), { addSuffix: true })}
        </span>
        {trailingAction && <div className="shrink-0">{trailingAction}</div>}
        <ChevronRight className="size-4 text-neutral-300" />
      </div>
    </div>
  );
}
