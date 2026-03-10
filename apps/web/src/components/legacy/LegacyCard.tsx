import { Users, Globe, Lock, BookOpen, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatLegacyDates, getLegacyContext } from '@/features/legacy/api/legacies';
import type { Legacy } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import { CONTEXT_LABELS, CONTEXT_COLORS } from '@/lib/legacy-context';

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
  showVisibility,
  hideContextBadge,
}: LegacyCardProps) {
  const navigate = useNavigate();
  const dates = formatLegacyDates(legacy);
  const context = getLegacyContext(legacy);
  const memberCount = legacy.members?.length || 0;
  const handleNavigate = () => navigate(`/legacy/${legacy.id}`);

  return (
    <Card
      className="min-w-0 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
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
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100 flex items-center justify-center">
        {legacy.profile_image_url ? (
          <img
            src={rewriteBackendUrlForDev(legacy.profile_image_url)}
            alt={legacy.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Users className="size-12 text-neutral-300" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 pb-2.5">
          {context === 'memorial' ? (
            <span className="text-xs font-medium text-white bg-white/20 backdrop-blur-sm rounded px-2 py-0.5">
              In Memoriam
            </span>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-1 text-xs font-medium text-white">
            <Users className="size-3" />
            {memberCount}
          </span>
        </div>
      </div>
      <div className="min-w-0 p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="truncate text-neutral-900">{legacy.name}</h3>
            {dates && <p className="text-sm text-neutral-500">{dates}</p>}
          </div>
          <div className="shrink-0 flex items-center gap-1">
            {trailingAction}
            {!hideContextBadge && (
              <Badge variant="outline" className={CONTEXT_COLORS[context] || 'bg-neutral-100 text-neutral-800'}>
                {CONTEXT_LABELS[context] || context}
              </Badge>
            )}
          </div>
        </div>
        {legacy.biography && (
          <p className="text-sm text-neutral-600 line-clamp-2">{legacy.biography}</p>
        )}
        {showVisibility && (
          <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
            <span className="flex items-center gap-1">
              {legacy.visibility === 'public' ? (
                <><Globe className="size-3" /> Public</>
              ) : (
                <><Lock className="size-3" /> Private</>
              )}
            </span>
          </div>
        )}
        <div className="mt-3 flex gap-2 min-w-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/legacy/${legacy.id}?tab=stories`); }}
            className="flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <BookOpen className="size-3.5" />
            {legacy.story_count ?? 0} Stories
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/legacy/${legacy.id}?tab=ai`); }}
            className="flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <MessageSquare className="size-3.5" />
            Talk to AI
          </button>
        </div>
      </div>
    </Card>
  );
}
