import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

interface BottomToolbarProps {
  onRewrite: () => void;
  wordCount: number;
}

export function BottomToolbar({ onRewrite, wordCount }: BottomToolbarProps) {
  const rewriteState = useEvolveWorkspaceStore((s) => s.rewriteState);
  const compareState = useEvolveWorkspaceStore((s) => s.compareState);
  const writingStyle = useEvolveWorkspaceStore((s) => s.writingStyle);
  const lengthPreference = useEvolveWorkspaceStore((s) => s.lengthPreference);

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t bg-white shrink-0">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={onRewrite}
          disabled={rewriteState === 'streaming' || compareState !== 'idle'}
        >
          <Sparkles className="h-4 w-4 mr-1" />
          AI Rewrite
        </Button>

        {writingStyle && (
          <span className="text-xs text-neutral-500 capitalize">
            Style: {writingStyle}
          </span>
        )}
        {lengthPreference && (
          <span className="text-xs text-neutral-500 capitalize">
            Length: {lengthPreference}
          </span>
        )}
      </div>

      <span className="text-xs text-neutral-400">{wordCount} words</span>
    </div>
  );
}
