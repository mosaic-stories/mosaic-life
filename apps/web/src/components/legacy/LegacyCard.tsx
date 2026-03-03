import { Users, Globe, Lock } from 'lucide-react';
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
}

export default function LegacyCard({ legacy, trailingAction, showVisibility }: LegacyCardProps) {
  const navigate = useNavigate();
  const dates = formatLegacyDates(legacy);
  const context = getLegacyContext(legacy);
  const memberCount = legacy.members?.length || 0;

  return (
    <Card
      className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
      onClick={() => navigate(`/legacy/${legacy.id}`)}
    >
      <div className="aspect-[4/3] overflow-hidden bg-neutral-100 flex items-center justify-center">
        {legacy.profile_image_url ? (
          <img
            src={rewriteBackendUrlForDev(legacy.profile_image_url)}
            alt={legacy.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Users className="size-12 text-neutral-300" />
        )}
      </div>
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1">
            <h3 className="text-neutral-900">{legacy.name}</h3>
            {dates && <p className="text-sm text-neutral-500">{dates}</p>}
          </div>
          <div className="flex items-center gap-1">
            {trailingAction}
            <Badge variant="outline" className={CONTEXT_COLORS[context] || 'bg-neutral-100 text-neutral-800'}>
              {CONTEXT_LABELS[context] || context}
            </Badge>
          </div>
        </div>
        {legacy.biography && (
          <p className="text-sm text-neutral-600 line-clamp-2">{legacy.biography}</p>
        )}
        <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
          <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
          {showVisibility && (
            <span className="flex items-center gap-1">
              {legacy.visibility === 'public' ? (
                <><Globe className="size-3" /> Public</>
              ) : (
                <><Lock className="size-3" /> Private</>
              )}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
