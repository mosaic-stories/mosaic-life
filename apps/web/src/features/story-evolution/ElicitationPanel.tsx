import { useState, useEffect, useRef } from 'react';
import {
  Send,
  Loader2,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/components/ui/utils';
import { useAIChat } from '@/features/ai-chat/hooks/useAIChat';
import { useSummarizeEvolution } from '@/lib/hooks/useEvolution';
import type { ChatMessage } from '@/features/ai-chat/store/aiChatStore';

interface ElicitationPanelProps {
  conversationId: string;
  legacyId: string;
  storyId: string;
  sessionId: string;
}

export function ElicitationPanel({
  conversationId,
  legacyId,
  storyId,
  sessionId,
}: ElicitationPanelProps) {
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    retryLastMessage,
    clearError,
  } = useAIChat({
    legacyId,
    personaId: 'biographer',
    conversationId,
  });

  const summarize = useSummarizeEvolution(storyId, sessionId);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show the summarize banner when there is at least one completed assistant
  // message and neither streaming nor summarizing is in progress.
  const hasAssistantReply = messages.some(
    (m) => m.role === 'assistant' && m.status !== 'streaming'
  );
  const showSummarizeBanner =
    hasAssistantReply && !isStreaming && !summarize.isPending;

  const handleSend = async () => {
    if (!inputMessage.trim() || isStreaming || summarize.isPending) return;
    const content = inputMessage.trim();
    setInputMessage('');
    await sendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTimestamp = (isoString: string) =>
    new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';
    const isStreamingMsg = message.status === 'streaming';
    const hasError = message.status === 'error';

    return (
      <div
        key={message.id}
        className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}
      >
        {!isUser && (
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="bg-purple-100 text-purple-700 text-xs">
              AI
            </AvatarFallback>
          </Avatar>
        )}
        <div
          className={cn(
            'flex flex-col gap-1 max-w-[80%]',
            isUser ? 'items-end' : 'items-start'
          )}
        >
          <Card
            className={cn(
              'p-3',
              isUser
                ? 'bg-theme-primary text-white border-theme-primary'
                : hasError
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white'
            )}
          >
            <p
              className={cn(
                'text-sm',
                isUser
                  ? 'text-white'
                  : hasError
                    ? 'text-red-700'
                    : 'text-foreground'
              )}
            >
              {message.content}
              {isStreamingMsg && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-purple-500 animate-pulse" />
              )}
            </p>
            {hasError && message.error && (
              <div className="mt-2 pt-2 border-t border-red-200">
                <div className="flex items-center gap-2 text-red-600 text-xs">
                  <AlertCircle className="size-3" />
                  <span>{message.error}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={retryLastMessage}
                  className="mt-2 text-xs h-7"
                >
                  <RefreshCw className="size-3 mr-1" />
                  Retry
                </Button>
              </div>
            )}
          </Card>
          <span className="text-[10px] text-muted-foreground px-1">
            {formatTimestamp(message.created_at)}
          </span>
        </div>
        {isUser && (
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
              You
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="size-4" />
            <span>{error}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearError}
            className="text-red-700"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-6 animate-spin text-theme-primary" />
              <p className="text-sm text-muted-foreground">
                Loading conversation...
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <p className="text-sm text-muted-foreground">
                Tell the AI more about this story. Share details, memories, and
                context to help create a richer version.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Summarize banner */}
      {showSummarizeBanner && (
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <span className="text-sm text-emerald-800">
              When you've shared enough detail, move to the next step
            </span>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white ml-3 shrink-0"
              onClick={() => summarize.mutate()}
            >
              Summarize &amp; continue
              <ArrowRight className="size-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Summarizing state banner */}
      {summarize.isPending && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
            <Loader2 className="size-4 animate-spin text-amber-700" />
            <span className="text-sm text-amber-800">
              Generating summary...
            </span>
          </div>
        </div>
      )}

      {/* Summarize error */}
      {summarize.isError && (
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="size-4" />
              <span>Failed to generate summary. Please try again.</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-100 ml-3 shrink-0"
              onClick={() => summarize.mutate()}
            >
              <RefreshCw className="size-3 mr-1" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t px-4 py-3">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              summarize.isPending
                ? 'Generating summary...'
                : isStreaming
                  ? 'Please wait...'
                  : 'Share more about this story...'
            }
            disabled={isStreaming || isLoading || summarize.isPending}
          />
          <Button
            onClick={handleSend}
            disabled={
              isStreaming ||
              isLoading ||
              summarize.isPending ||
              !inputMessage.trim()
            }
            size="icon"
          >
            {isStreaming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
