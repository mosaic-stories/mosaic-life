import { useState, useRef, useEffect } from 'react';
import { Check, X, MessageSquare, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { streamRevise } from '@/lib/api/evolution';

interface DraftReviewPanelProps {
  draftContent: string;
  storyId: string;
  sessionId: string;
  onAccept: () => void;
  onDiscard: () => void;
  onRevisionComplete: (
    newText: string,
    versionId: string,
    versionNumber: number
  ) => void;
  isAccepting?: boolean;
  isDiscarding?: boolean;
}

export function DraftReviewPanel({
  draftContent,
  storyId,
  sessionId,
  onAccept,
  onDiscard,
  onRevisionComplete,
  isAccepting = false,
  isDiscarding = false,
}: DraftReviewPanelProps) {
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [revisionInstructions, setRevisionInstructions] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [revisedText, setRevisedText] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const accumulatedRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const displayContent = isRevising ? revisedText : draftContent;
  const isActionDisabled = isAccepting || isDiscarding || isRevising;

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Auto-scroll during revision streaming
  useEffect(() => {
    if (isRevising && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [revisedText, isRevising]);

  const handleRequestRevision = () => {
    if (!revisionInstructions.trim() || isRevising) return;

    setIsRevising(true);
    accumulatedRef.current = '';
    setRevisedText('');

    abortControllerRef.current = streamRevise(
      storyId,
      sessionId,
      revisionInstructions.trim(),
      (chunk) => {
        accumulatedRef.current += chunk;
        setRevisedText(accumulatedRef.current);
      },
      (versionId, versionNumber) => {
        setIsRevising(false);
        setShowRevisionInput(false);
        setRevisionInstructions('');
        onRevisionComplete(accumulatedRef.current, versionId, versionNumber);
      },
      (message, _retryable) => {
        setIsRevising(false);
        console.error('Revision error:', message);
      }
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Draft content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-6">
        <Card className="p-6 bg-white">
          <div className="font-serif text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {displayContent}
            {isRevising && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-[rgb(var(--theme-primary))] animate-pulse" />
            )}
          </div>
        </Card>
      </div>

      {/* Revision input */}
      {showRevisionInput && (
        <div className="px-4 pb-2">
          <div className="flex gap-2">
            <Textarea
              value={revisionInstructions}
              onChange={(e) => setRevisionInstructions(e.target.value)}
              placeholder="Describe what changes you'd like..."
              className="min-h-[60px]"
              disabled={isRevising}
            />
            <Button
              onClick={handleRequestRevision}
              disabled={!revisionInstructions.trim() || isRevising}
              size="icon"
              className="shrink-0 self-end"
            >
              {isRevising ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Action bar */}
      <Separator />
      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        <Button
          onClick={onAccept}
          disabled={isActionDisabled}
          className="flex-1 sm:flex-none"
        >
          {isAccepting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Accept Draft
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowRevisionInput(!showRevisionInput)}
          disabled={isActionDisabled}
          className="flex-1 sm:flex-none"
        >
          <MessageSquare className="size-4" />
          Request Changes
        </Button>
        <Button
          variant="ghost"
          onClick={onDiscard}
          disabled={isActionDisabled}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          {isDiscarding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <X className="size-4" />
          )}
          Discard
        </Button>
      </div>
    </div>
  );
}
