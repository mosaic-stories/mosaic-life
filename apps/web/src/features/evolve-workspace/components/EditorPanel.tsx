import { useCallback } from 'react';
import StoryEditor from '@/features/editor/components/StoryEditor';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, RefreshCw, RotateCcw } from 'lucide-react';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { DiffView } from './DiffView';

interface EditorPanelProps {
  content: string;
  onChange: (markdown: string) => void;
  legacyId: string;
  onAcceptRewrite: (content: string) => void;
  onRegenerate: () => void;
  onRestore: (content: string) => void;
}

export function EditorPanel({
  content,
  onChange,
  legacyId,
  onAcceptRewrite,
  onRegenerate,
  onRestore,
}: EditorPanelProps) {
  const rewriteState = useEvolveWorkspaceStore((s) => s.rewriteState);
  const rewriteContent = useEvolveWorkspaceStore((s) => s.rewriteContent);
  const originalContent = useEvolveWorkspaceStore((s) => s.originalContent);
  const viewMode = useEvolveWorkspaceStore((s) => s.viewMode);
  const setViewMode = useEvolveWorkspaceStore((s) => s.setViewMode);
  const discardRewrite = useEvolveWorkspaceStore((s) => s.discardRewrite);
  const acceptRewrite = useEvolveWorkspaceStore((s) => s.acceptRewrite);
  const compareState = useEvolveWorkspaceStore((s) => s.compareState);
  const compareVersionNumber = useEvolveWorkspaceStore((s) => s.compareVersionNumber);
  const closeCompare = useEvolveWorkspaceStore((s) => s.closeCompare);

  const isRewriting = rewriteState === 'streaming' || rewriteState === 'reviewing';
  const isComparing = compareState === 'comparing';

  const handleAccept = useCallback(() => {
    if (rewriteContent) {
      onAcceptRewrite(rewriteContent);
      acceptRewrite();
    }
  }, [rewriteContent, onAcceptRewrite, acceptRewrite]);

  const handleDiscard = useCallback(() => {
    discardRewrite();
  }, [discardRewrite]);

  const handleRestore = useCallback(() => {
    if (originalContent) {
      onRestore(originalContent);
      closeCompare();
    }
  }, [originalContent, onRestore, closeCompare]);

  const handleCloseCompare = useCallback(() => {
    closeCompare();
  }, [closeCompare]);

  // Version comparison mode (takes priority)
  if (isComparing) {
    return (
      <div className="flex flex-col h-full">
        {/* Comparison header */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-neutral-50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Comparing with</span>
            <Badge variant="outline" className="text-xs">
              v{compareVersionNumber}
            </Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={handleCloseCompare}>
            <X className="h-4 w-4 mr-1" />
            Close
          </Button>
        </div>

        {/* Diff view */}
        <div className="flex-1 overflow-y-auto">
          <DiffView
            original={originalContent ?? ''}
            rewrite={rewriteContent ?? ''}
          />
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-t bg-white shrink-0">
          <Button size="sm" onClick={handleRestore}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Restore this version
          </Button>
          <Button size="sm" variant="outline" onClick={handleCloseCompare}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // Normal editing mode
  if (!isRewriting) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto">
          <StoryEditor
            content={content}
            onChange={onChange}
            legacyId={legacyId}
            placeholder="Start writing your story..."
          />
        </div>
      </div>
    );
  }

  // Rewrite mode: show toggle + content + action buttons
  return (
    <div className="flex flex-col h-full">
      {/* View mode toggle + status */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-neutral-50 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-500 mr-2">View:</span>
          <Button
            variant={viewMode === 'editor' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('editor')}
          >
            Editor
          </Button>
          <Button
            variant={viewMode === 'diff' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('diff')}
          >
            Diff
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {rewriteState === 'streaming' && (
            <span className="text-xs text-amber-600 animate-pulse">Rewriting...</span>
          )}
          {rewriteState === 'reviewing' && (
            <span className="text-xs text-emerald-600">Rewrite complete</span>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'editor' ? (
          rewriteState === 'streaming' ? (
            <div className="px-6 py-4 font-serif">
              <Streamdown isAnimating={true} caret="block">
                {rewriteContent ?? ''}
              </Streamdown>
            </div>
          ) : (
            <StoryEditor
              content={rewriteContent ?? ''}
              onChange={(md) =>
                useEvolveWorkspaceStore.setState({ rewriteContent: md })
              }
              legacyId={legacyId}
            />
          )
        ) : (
          <DiffView
            original={originalContent ?? ''}
            rewrite={rewriteContent ?? ''}
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 px-4 py-3 border-t bg-white shrink-0">
        <Button size="sm" onClick={handleAccept} disabled={rewriteState === 'streaming'}>
          <Check className="h-4 w-4 mr-1" />
          Accept
        </Button>
        <Button size="sm" variant="outline" onClick={handleDiscard}>
          <X className="h-4 w-4 mr-1" />
          Discard
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRegenerate}
          disabled={rewriteState === 'streaming'}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Regenerate
        </Button>
      </div>
    </div>
  );
}
