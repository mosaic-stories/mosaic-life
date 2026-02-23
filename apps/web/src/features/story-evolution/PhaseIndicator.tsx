import { Check, MessageSquare, FileText, Palette, Sparkles } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import type { EvolutionPhase } from '@/lib/api/evolution';

interface PhaseIndicatorProps {
  currentPhase: EvolutionPhase;
  onPhaseClick?: (phase: EvolutionPhase) => void;
  className?: string;
}

interface PhaseConfig {
  id: EvolutionPhase;
  label: string;
  Icon: React.ElementType;
}

const WORKFLOW_PHASES: PhaseConfig[] = [
  { id: 'elicitation', label: 'Chat', Icon: MessageSquare },
  { id: 'summary', label: 'Summary', Icon: FileText },
  { id: 'style_selection', label: 'Style', Icon: Palette },
  { id: 'drafting', label: 'Drafting', Icon: Sparkles },
  { id: 'review', label: 'Review', Icon: Check },
];

const PHASE_ORDER: Record<EvolutionPhase, number> = {
  elicitation: 0,
  summary: 1,
  style_selection: 2,
  drafting: 3,
  review: 4,
  completed: 5,
  discarded: -1,
};

/** Phases that should never be a backward-navigation target. */
const NON_CLICKABLE_PHASES: Set<EvolutionPhase> = new Set(['drafting']);

function getStepState(
  stepIndex: number,
  currentPhaseIndex: number,
  isDiscarded: boolean
): 'completed' | 'current' | 'future' {
  if (isDiscarded) return 'future';
  if (currentPhaseIndex >= WORKFLOW_PHASES.length) return 'completed';
  if (stepIndex < currentPhaseIndex) return 'completed';
  if (stepIndex === currentPhaseIndex) return 'current';
  return 'future';
}

export function PhaseIndicator({ currentPhase, onPhaseClick, className }: PhaseIndicatorProps) {
  const isDiscarded = currentPhase === 'discarded';
  const currentPhaseIndex = PHASE_ORDER[currentPhase];

  const mobileLabel = isDiscarded
    ? 'Discarded'
    : currentPhase === 'completed'
      ? 'Completed'
      : (WORKFLOW_PHASES.find((p) => p.id === currentPhase)?.label ?? '');

  return (
    <div className={cn('w-full', className)}>
      {/* Mobile: single-step summary */}
      <div className="flex items-center gap-2 md:hidden">
        <span className="text-sm font-medium text-muted-foreground">Step:</span>
        <span
          className={cn(
            'text-sm font-semibold',
            isDiscarded
              ? 'text-muted-foreground line-through'
              : currentPhase === 'completed'
                ? 'text-emerald-600'
                : 'text-theme-primary'
          )}
        >
          {mobileLabel}
        </span>
      </div>

      {/* Desktop: full step indicator */}
      <div className="hidden md:flex items-center w-full">
        {WORKFLOW_PHASES.map((phase, index) => {
          const state = getStepState(index, currentPhaseIndex, isDiscarded);
          const isLast = index === WORKFLOW_PHASES.length - 1;
          const { Icon } = phase;
          const isClickable =
            onPhaseClick &&
            state === 'completed' &&
            !NON_CLICKABLE_PHASES.has(phase.id);

          const stepContent = (
            <>
              <div
                className={cn(
                  'size-8 rounded-full flex items-center justify-center transition-colors',
                  state === 'current' && 'bg-theme-primary text-white shadow-sm',
                  state === 'completed' && 'bg-emerald-50 text-emerald-600',
                  state === 'future' && 'bg-muted text-muted-foreground',
                  isClickable && 'group-hover:bg-emerald-100'
                )}
              >
                {state === 'completed' ? (
                  <Check className="size-4" strokeWidth={2.5} />
                ) : (
                  <Icon className="size-4" />
                )}
              </div>
              <span
                className={cn(
                  'text-xs leading-none text-center whitespace-nowrap',
                  state === 'current' && 'font-bold text-theme-primary',
                  state === 'completed' && 'font-medium text-emerald-600',
                  state === 'future' && 'text-muted-foreground',
                  isClickable && 'group-hover:text-emerald-700'
                )}
              >
                {phase.label}
              </span>
            </>
          );

          return (
            <div key={phase.id} className="flex items-center flex-1 min-w-0">
              {isClickable ? (
                <button
                  type="button"
                  className="group flex flex-col items-center gap-1.5 shrink-0 cursor-pointer"
                  onClick={() => onPhaseClick(phase.id)}
                  aria-label={phase.label}
                >
                  {stepContent}
                </button>
              ) : (
                <div
                  className="flex flex-col items-center gap-1.5 shrink-0"
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {stepContent}
                </div>
              )}

              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-px mx-2 mb-4 transition-colors',
                    index < currentPhaseIndex && !isDiscarded
                      ? 'bg-emerald-300'
                      : 'border-t border-dashed border-muted-foreground/30'
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
