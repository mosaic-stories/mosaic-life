/**
 * Renders a single chat message (user or assistant) with avatar, timestamp, and content.
 */

import { AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { ChatMessage as ChatMessageType } from '@/features/ai-chat/store/aiChatStore';
import { formatTimestamp } from './utils';

interface ChatMessageProps {
  message: ChatMessageType;
  onRetry: () => void;
}

export function ChatMessage({ message, onRetry }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isStreamingMessage = message.status === 'streaming';
  const hasError = message.status === 'error';

  return (
    <div
      className={`flex gap-2 md:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isUser && (
        <Avatar className="size-7 md:size-8 flex-shrink-0">
          <AvatarFallback className="bg-amber-100 text-amber-700 text-xs md:text-sm">
            AI
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={`flex flex-col gap-1 max-w-[85%] sm:max-w-md md:max-w-lg ${isUser ? 'items-end' : 'items-start'}`}
      >
        <Card
          className={`p-3 md:p-4 ${
            isUser
              ? 'bg-amber-600 text-white border-amber-600'
              : hasError
                ? 'bg-red-50 border-red-200'
                : 'bg-white'
          }`}
        >
          <p className={isUser ? 'text-white' : hasError ? 'text-red-700' : 'text-neutral-700'}>
            {message.content}
            {isStreamingMessage && (
              <span className="inline-block w-2 h-4 ml-1 bg-amber-500 animate-pulse" />
            )}
          </p>
          {message.blocked && (
            <Badge variant="outline" className="text-xs text-red-500 border-red-200 mt-1">
              <ShieldAlert className="size-3 mr-1" />
              Excluded from context
            </Badge>
          )}
          {hasError && message.error && (
            <div className="mt-2 pt-2 border-t border-red-200">
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="size-4" />
                <span>{message.error}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="mt-2 text-red-600 border-red-300 hover:bg-red-50"
              >
                <RefreshCw className="size-3 mr-1" />
                Retry
              </Button>
            </div>
          )}
        </Card>
        <span className="text-xs text-neutral-500 px-1">
          {formatTimestamp(message.created_at)}
        </span>
      </div>
      {isUser && (
        <Avatar className="size-7 md:size-8 flex-shrink-0">
          <AvatarFallback className="bg-neutral-200 text-neutral-700 text-xs md:text-sm">
            You
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
