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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (toggle.isPending) return;
    toggle.mutate({ entityType, entityId });
  };

  // Optimistic display: flip during pending state
  const showFilled = toggle.isPending ? !isFavorited : isFavorited;
  const displayCount = toggle.isPending
    ? isFavorited
      ? Math.max(0, favoriteCount - 1)
      : favoriteCount + 1
    : favoriteCount;

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
