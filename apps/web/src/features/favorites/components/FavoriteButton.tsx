import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavoriteToggle } from '../hooks/useFavorites';
import type { EntityType } from '../api/favorites';

interface FavoriteButtonProps {
  entityType: EntityType;
  entityId: string;
  isFavorited: boolean;
  favoriteCount: number;
  size?: 'sm' | 'default';
}

export default function FavoriteButton({
  entityType,
  entityId,
  isFavorited,
  favoriteCount,
  size = 'sm',
}: FavoriteButtonProps) {
  const toggle = useFavoriteToggle();
  const [optimistic, setOptimistic] = useState<{ favorited: boolean; count: number } | null>(null);

  // Clear optimistic state once parent props catch up with fresh data
  useEffect(() => {
    if (optimistic && isFavorited === optimistic.favorited) {
      setOptimistic(null);
    }
  }, [isFavorited, optimistic]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (toggle.isPending) return;

    // Base optimistic values on current display, not stale parent props
    const currentFavorited = optimistic ? optimistic.favorited : isFavorited;
    const currentCount = optimistic ? optimistic.count : favoriteCount;
    setOptimistic({
      favorited: !currentFavorited,
      count: !currentFavorited ? currentCount + 1 : Math.max(0, currentCount - 1),
    });

    toggle.mutate(
      { entityType, entityId },
      {
        onSuccess: (data) => {
          setOptimistic({ favorited: data.favorited, count: data.favorite_count });
        },
        onError: () => {
          setOptimistic(null);
        },
      },
    );
  };

  const showFilled = optimistic ? optimistic.favorited : isFavorited;
  const displayCount = optimistic ? optimistic.count : favoriteCount;

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleClick}
      disabled={toggle.isPending}
      className="gap-1 text-neutral-500 hover:text-red-500"
      aria-label={showFilled ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart
        className={`size-4 transition-colors ${
          showFilled ? 'fill-red-500 text-red-500' : ''
        }`}
      />
      {displayCount > 0 && (
        <span className="text-xs">{displayCount}</span>
      )}
    </Button>
  );
}
