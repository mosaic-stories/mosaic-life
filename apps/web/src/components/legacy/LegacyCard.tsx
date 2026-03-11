import { Users, BookOpen, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatLegacyDates, getLegacyContext } from '@/features/legacy/api/legacies';
import type { Legacy } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';

export interface LegacyCardProps {
  legacy: Legacy;
  /** Optional trailing element rendered next to the context badge (e.g. FavoriteButton) */
  trailingAction?: React.ReactNode;
  /** When true, show public/private visibility indicator in the footer */
  showVisibility?: boolean;
  /** When true, suppress the context badge in the text area */
  hideContextBadge?: boolean;
}

export default function LegacyCard({
  legacy,
  trailingAction,
}: LegacyCardProps) {
  const navigate = useNavigate();
  const dates = formatLegacyDates(legacy);
  const context = getLegacyContext(legacy);
  const memberCount = legacy.members?.length ?? 0;
  const handleNavigate = () => navigate(`/legacy/${legacy.id}`);

  return (
    <div
      className="rounded-2xl overflow-hidden hover:-translate-y-1 group bg-white border border-stone-200 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer"
      onClick={handleNavigate}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleNavigate();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Cover zone */}
      <div className="h-36 relative overflow-hidden">
        {legacy.profile_image_url ? (
          <img
            src={rewriteBackendUrlForDev(legacy.profile_image_url)}
            alt={legacy.name}
            className="object-cover brightness-[0.85] saturate-[0.9] group-hover:scale-105 transition-transform duration-500 w-full h-full"
          />
        ) : (
          <div className="bg-gradient-to-br from-stone-200 to-stone-300 w-full h-full" />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        {/* In Memoriam badge */}
        {context === 'memorial' && (
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-semibold text-neutral-700">
            In Memoriam
          </div>
        )}
        {/* Profile photo */}
        <div className="absolute -bottom-7 left-5 size-16 rounded-full border-[3px] border-white shadow-md overflow-hidden">
          {legacy.profile_image_url ? (
            <img
              src={rewriteBackendUrlForDev(legacy.profile_image_url)}
              alt={legacy.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-stone-100 flex items-center justify-center">
              <Users className="size-6 text-neutral-300" />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="pt-10 pb-5 px-5">
        <h3 className="font-serif text-lg font-semibold text-neutral-900 truncate">{legacy.name}</h3>
        <p className="text-sm text-neutral-400">{dates}</p>
        {legacy.biography && (
          <p className="text-sm text-neutral-500 italic line-clamp-2 mt-1">{legacy.biography}</p>
        )}

        <div className="border-t border-stone-100 mt-3 pt-3">
          <div className="flex items-center gap-4 text-sm text-neutral-500">
            <span className="flex items-center gap-1">
              <BookOpen className="size-3.5" />
              {legacy.story_count ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-3.5" />
              {memberCount}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="size-3.5" />
              {legacy.favorite_count ?? 0}
            </span>
            <div className="ml-auto">{trailingAction}</div>
          </div>
        </div>

        {/* Hover buttons */}
        <div className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/legacy/${legacy.id}?tab=stories`); }}
            className="flex-1 py-2 text-xs font-medium rounded-lg bg-theme-primary text-white hover:bg-theme-primary-dark transition-colors"
          >
            View Stories
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/legacy/${legacy.id}?tab=ai`); }}
            className="flex-1 py-2 text-xs font-medium rounded-lg border border-stone-300 text-neutral-700 hover:bg-stone-50 transition-colors"
          >
            AI Chat
          </button>
        </div>
      </div>
    </div>
  );
}
