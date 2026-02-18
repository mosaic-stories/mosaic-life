import { Sparkles, X, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import type { EvolutionPhase } from '@/lib/api/evolution';

const PHASE_LABELS: Record<EvolutionPhase, string> = {
  elicitation: 'Gathering Details',
  summary: 'Summarizing',
  style_selection: 'Choosing Style',
  drafting: 'Drafting',
  review: 'Review',
  completed: 'Completed',
  discarded: 'Discarded',
};

interface EvolutionBannerProps {
  storyTitle: string;
  phase: EvolutionPhase;
  onDiscard: () => void;
  isDiscarding?: boolean;
  className?: string;
}

export function EvolutionBanner({
  storyTitle,
  phase,
  onDiscard,
  isDiscarding = false,
  className,
}: EvolutionBannerProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-purple-200 bg-purple-50 p-4 mb-6',
        className
      )}
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Sparkles className="size-4 text-purple-700 shrink-0" />
          <span className="text-sm font-medium text-purple-800">
            Evolving: {storyTitle}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {PHASE_LABELS[phase]}
          </Badge>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={onDiscard}
          disabled={isDiscarding}
          className="text-purple-600 hover:text-red-600 hover:bg-purple-100"
        >
          {isDiscarding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <X className="size-4" />
          )}
          <span className="ml-1">{isDiscarding ? 'Discarding...' : 'Discard'}</span>
        </Button>
      </div>
    </div>
  );
}
