import { AlertCircle, Loader2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { rewriteBackendUrlForDev } from '@/lib/url';
import { useRecentlyViewed } from '../hooks/useActivity';
import type { EnrichedRecentItem } from '../api/activity';

interface RecentlyViewedSectionProps {
  entityType: 'legacy' | 'story';
  title: string;
  description: string;
  limit?: number;
}

function LegacyCard({
  item,
  onClick,
}: {
  item: EnrichedRecentItem;
  onClick: () => void;
}) {
  const entity = item.entity;
  if (!entity) return null;

  const dates = (() => {
    const birthYear = entity.birth_date
      ? new Date(entity.birth_date).getFullYear()
      : null;
    const deathYear = entity.death_date
      ? new Date(entity.death_date).getFullYear()
      : null;
    if (birthYear && deathYear) return `${birthYear} - ${deathYear}`;
    if (birthYear) return `Born ${birthYear}`;
    if (deathYear) return `Died ${deathYear}`;
    return '';
  })();

  return (
    <Card
      role="button"
      tabIndex={0}
      className="min-w-0 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="aspect-[4/3] overflow-hidden bg-neutral-100 flex items-center justify-center">
        {entity.profile_image_url ? (
          <img
            src={rewriteBackendUrlForDev(entity.profile_image_url)}
            alt={entity.name || ''}
            className="w-full h-full object-cover"
          />
        ) : (
          <Users className="size-12 text-neutral-300" />
        )}
      </div>
      <div className="min-w-0 p-5 space-y-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-neutral-900">{entity.name}</h3>
          {dates && <p className="text-sm text-neutral-500">{dates}</p>}
        </div>
        {entity.biography && (
          <p className="text-sm text-neutral-600 line-clamp-2">
            {entity.biography}
          </p>
        )}
      </div>
    </Card>
  );
}

function StoryCard({
  item,
  onClick,
}: {
  item: EnrichedRecentItem;
  onClick: () => void;
}) {
  const entity = item.entity;
  if (!entity) return null;

  return (
    <Card
      role="button"
      tabIndex={0}
      className="p-5 space-y-3 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="space-y-1">
        <h3 className="text-neutral-900 text-sm font-medium line-clamp-1">
          {entity.title}
        </h3>
        {entity.legacy_name && (
          <Badge variant="outline" className="text-xs">
            {entity.legacy_name}
          </Badge>
        )}
      </div>
      {entity.content_preview && (
        <p className="text-xs text-neutral-600 line-clamp-2">
          {entity.content_preview}
        </p>
      )}
      {entity.author_name && (
        <p className="text-xs text-neutral-500">by {entity.author_name}</p>
      )}
    </Card>
  );
}

export default function RecentlyViewedSection({
  entityType,
  title,
  description,
  limit = 4,
}: RecentlyViewedSectionProps) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useRecentlyViewed(entityType, limit);

  if (!isLoading && !isError && (!data || data.items.length === 0)) {
    return null;
  }

  if (!isLoading && data && !data.tracking_enabled) {
    return null;
  }

  const handleClick = (item: EnrichedRecentItem) => {
    if (entityType === 'legacy') {
      navigate(`/legacy/${item.entity_id}`);
    } else if (entityType === 'story') {
      const legacyId = item.entity?.legacy_id;
      if (legacyId) {
        navigate(`/legacy/${legacyId}/story/${item.entity_id}`);
      }
    }
  };

  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="space-y-2 mb-6">
          <h2 className="text-neutral-900 text-xl">{title}</h2>
          <p className="text-neutral-600 text-sm">{description}</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-theme-primary" />
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 text-sm text-neutral-500 py-8">
            <AlertCircle className="size-4" />
            <span>Unable to load recently viewed {entityType === 'legacy' ? 'legacies' : 'stories'}</span>
          </div>
        )}

        {!isLoading && !isError && data && data.items.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {data.items.map((item) =>
              entityType === 'legacy' ? (
                <LegacyCard
                  key={item.entity_id}
                  item={item}
                  onClick={() => handleClick(item)}
                />
              ) : (
                <StoryCard
                  key={item.entity_id}
                  item={item}
                  onClick={() => handleClick(item)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}
