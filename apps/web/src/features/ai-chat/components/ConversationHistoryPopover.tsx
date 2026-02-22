/**
 * Conversation history popover for browsing and managing past conversations.
 */

import { History, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/components/ui/utils';
import type { ConversationSummary } from '@/features/ai-chat/api/ai';
import { formatDate, formatRelativeTime } from './utils';

interface ConversationHistoryPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: ConversationSummary[] | undefined;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string, e: React.MouseEvent) => void;
  isDeleting: boolean;
}

export function ConversationHistoryPopover({
  open,
  onOpenChange,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onDeleteConversation,
  isDeleting,
}: ConversationHistoryPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* History - single responsive trigger */}
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 h-9 px-2 sm:px-3" title="History">
          <History className="size-4" />
          <span className="hidden sm:inline">History</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <h4 className="font-medium">Recent Conversations</h4>
          {conversations?.length === 0 && (
            <p className="text-sm text-neutral-500">No previous conversations</p>
          )}
          {conversations?.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "flex items-center gap-2 p-2 rounded hover:bg-neutral-100 group",
                selectedConversationId === conv.id && "bg-amber-50"
              )}
            >
              <button
                onClick={() => {
                  onSelectConversation(conv.id);
                  onOpenChange(false);
                }}
                className="flex-1 text-left min-w-0"
              >
                <p className="text-sm font-medium truncate">
                  {conv.title || `Chat from ${formatDate(conv.created_at)}`}
                </p>
                <p className="text-xs text-neutral-500">
                  {conv.message_count} messages · {formatRelativeTime(conv.last_message_at)}
                </p>
              </button>
              <button
                onClick={(e) => onDeleteConversation(conv.id, e)}
                disabled={isDeleting}
                className={cn(
                  "p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity",
                  "text-neutral-400 hover:text-red-600 hover:bg-red-50",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                title="Delete conversation"
              >
                {isDeleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
