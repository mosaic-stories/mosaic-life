import { useState, useEffect, useRef } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { Card } from '@/components/ui/card';
import { streamGenerate } from '@/lib/api/evolution';

interface DraftStreamPanelProps {
  storyId: string;
  sessionId: string;
  onComplete: (
    text: string,
    versionId: string,
    versionNumber: number
  ) => void;
  onError: (message: string) => void;
}

export function DraftStreamPanel({
  storyId,
  sessionId,
  onComplete,
  onError,
}: DraftStreamPanelProps) {
  const [streamedText, setStreamedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const accumulatedTextRef = useRef('');

  // Use refs for callbacks to avoid re-triggering the stream effect
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const controller = streamGenerate(
      storyId,
      sessionId,
      (chunk) => {
        accumulatedTextRef.current += chunk;
        setStreamedText(accumulatedTextRef.current);
      },
      (versionId, versionNumber) => {
        setIsStreaming(false);
        onCompleteRef.current(
          accumulatedTextRef.current,
          versionId,
          versionNumber
        );
      },
      (message, _retryable) => {
        setIsStreaming(false);
        onErrorRef.current(message);
      }
    );

    return () => {
      controller.abort();
    };
  }, [storyId, sessionId]);

  // Auto-scroll as content streams in
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [streamedText]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        {isStreaming ? (
          <>
            <Loader2 className="size-4 animate-spin text-[rgb(var(--theme-primary))]" />
            <span className="text-sm font-medium text-[rgb(var(--theme-primary))]">
              Generating your evolved draft...
            </span>
          </>
        ) : (
          <>
            <Sparkles className="size-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-600">
              Draft complete
            </span>
          </>
        )}
      </div>

      {/* Streaming content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-6">
        <Card className="p-6 bg-white">
          <div className="font-serif text-sm leading-relaxed text-foreground/90">
            <Streamdown isAnimating={isStreaming} caret="block">
              {streamedText}
            </Streamdown>
          </div>
        </Card>
      </div>
    </div>
  );
}
