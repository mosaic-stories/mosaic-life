import { GitBranch } from 'lucide-react';

interface EvolveSuggestionCardProps {
  reason: string;
  onEvolve: () => void;
  onDismiss: () => void;
}

export function EvolveSuggestionCard({
  reason,
  onEvolve,
  onDismiss,
}: EvolveSuggestionCardProps) {
  return (
    <div className="mx-4 my-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-start gap-2">
        <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1">
          <p className="text-sm text-amber-800 dark:text-amber-200">{reason}</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={onEvolve}
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
            >
              Evolve into Story
            </button>
            <button
              onClick={onDismiss}
              className="rounded-md px-3 py-1 text-xs text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
