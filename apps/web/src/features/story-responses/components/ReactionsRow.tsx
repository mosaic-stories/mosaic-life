import { useEffect, useState } from 'react';
import { Heart, Flame, Smile, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import { useReactionToggle } from '@/features/story-responses/hooks/useReactionToggle';
import type {
  ReactionType,
  StoryReactionToggleResponse,
} from '@/features/story-responses/api/reactions';

export interface ReactionCounts {
  heart: number;
  candle: number;
  smile: number;
}

export interface ReactionsRowProps {
  storyId: string;
  counts: ReactionCounts;
  /**
   * Reaction types the viewer has already made on this story (from
   * `StoryDetail.my_reactions`), used to seed toggled-on state on load —
   * without it, the highlight only appears once the viewer toggles a
   * reaction during the current session.
   */
  myReactions: ReactionType[];
  /** Reactions require legacy membership/authorship — hide the row if the viewer can't react. */
  canReact: boolean;
}

interface ReactionDef {
  type: ReactionType;
  icon: LucideIcon;
  label: string;
}

// lucide-react has no literal "candle" icon; Flame is the closest equivalent
// for "lighting a candle" (see final report for this substitution note).
const REACTIONS: ReactionDef[] = [
  { type: 'heart', icon: Heart, label: 'Love this' },
  { type: 'candle', icon: Flame, label: 'Light a candle' },
  { type: 'smile', icon: Smile, label: 'This made me smile' },
];

function countFor(data: StoryReactionToggleResponse, type: ReactionType): number {
  switch (type) {
    case 'heart':
      return data.reaction_heart_count;
    case 'candle':
      return data.reaction_candle_count;
    case 'smile':
      return data.reaction_smile_count;
  }
}

interface Override {
  reacted: boolean;
  count: number;
}

function reactedStateFrom(myReactions: ReactionType[]): Record<ReactionType, boolean> {
  return {
    heart: myReactions.includes('heart'),
    candle: myReactions.includes('candle'),
    smile: myReactions.includes('smile'),
  };
}

export default function ReactionsRow({
  storyId,
  counts,
  myReactions,
  canReact,
}: ReactionsRowProps) {
  const toggle = useReactionToggle(storyId);

  // Seed toggled-on state from the story detail response's `my_reactions`
  // field, so a reload/navigation shows the viewer's prior reactions
  // immediately rather than only after they toggle again this session.
  const [reactedState, setReactedState] = useState<Record<ReactionType, boolean>>(() =>
    reactedStateFrom(myReactions),
  );
  const [overrides, setOverrides] = useState<Partial<Record<ReactionType, Override>>>({});

  // Re-sync from the authoritative `myReactions` prop when it changes (e.g.
  // a refetch after toggling, or navigating to a different story that
  // reuses this mounted component).
  useEffect(() => {
    setReactedState(reactedStateFrom(myReactions));
  }, [storyId, myReactions]);

  // Clear an override once the authoritative count (from story detail/list
  // refetch) catches up with what we optimistically predicted.
  useEffect(() => {
    setOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      (Object.keys(next) as ReactionType[]).forEach((type) => {
        const override = next[type];
        if (override && counts[type] === override.count) {
          delete next[type];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [counts]);

  const handleToggle = (type: ReactionType) => {
    if (toggle.isPending) return;

    const previousReacted = overrides[type]?.reacted ?? reactedState[type];
    const previousCount = overrides[type]?.count ?? counts[type];
    const nextReacted = !previousReacted;
    const nextCount = nextReacted ? previousCount + 1 : Math.max(0, previousCount - 1);

    setReactedState((prev) => ({ ...prev, [type]: nextReacted }));
    setOverrides((prev) => ({ ...prev, [type]: { reacted: nextReacted, count: nextCount } }));

    toggle.mutate(type, {
      onSuccess: (data) => {
        setReactedState((prev) => ({ ...prev, [type]: data.reacted }));
        setOverrides((prev) => ({
          ...prev,
          [type]: { reacted: data.reacted, count: countFor(data, type) },
        }));
      },
      onError: () => {
        setReactedState((prev) => ({ ...prev, [type]: previousReacted }));
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
      },
    });
  };

  if (!canReact) return null;

  return (
    <div className="flex items-center gap-2" role="group" aria-label="React to this story">
      {REACTIONS.map(({ type, icon: Icon, label }) => {
        const isReacted = overrides[type]?.reacted ?? reactedState[type];
        const count = overrides[type]?.count ?? counts[type];
        return (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'gap-1.5',
              isReacted && 'border-theme-primary text-theme-primary bg-theme-primary/5',
            )}
            onClick={() => handleToggle(type)}
            disabled={toggle.isPending}
            aria-pressed={isReacted}
            aria-label={label}
          >
            <Icon className="size-4" />
            {count > 0 && <span className="text-xs">{count}</span>}
          </Button>
        );
      })}
    </div>
  );
}
