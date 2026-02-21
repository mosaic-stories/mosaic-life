/**
 * Chat header showing current agent info, streaming badge, new chat button, and history.
 */

import { Plus, Loader2, Menu, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Persona, ConversationSummary } from '@/features/ai-chat/api/ai';
import { PersonaIcon } from './PersonaIcon';
import { ConversationHistoryPopover } from './ConversationHistoryPopover';
import { getPersonaColor } from './utils';

interface ChatHeaderProps {
  selectedPersona: Persona | undefined;
  selectedPersonaId: string;
  isStreaming: boolean;
  showHistory: boolean;
  onShowHistoryChange: (open: boolean) => void;
  onNewChat: () => void;
  onOpenMobileSelector: () => void;
  conversationList: ConversationSummary[] | undefined;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string, e: React.MouseEvent) => void;
  isDeleting: boolean;
}

export function ChatHeader({
  selectedPersona,
  selectedPersonaId,
  isStreaming,
  showHistory,
  onShowHistoryChange,
  onNewChat,
  onOpenMobileSelector,
  conversationList,
  selectedConversationId,
  onSelectConversation,
  onDeleteConversation,
  isDeleting,
}: ChatHeaderProps) {
  return (
    <div className="bg-white border-b px-4 md:px-6 py-3 md:py-4">
      <div className="flex items-center gap-2 md:gap-3">
        {/* Mobile menu button to open agent selector */}
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden p-2"
          onClick={onOpenMobileSelector}
        >
          <Menu className="size-5" />
        </Button>

        {/* Agent selector trigger - mobile (compact) */}
        <button
          className="md:hidden flex items-center gap-2 min-w-0"
          onClick={onOpenMobileSelector}
        >
          <div
            className={`size-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getPersonaColor(selectedPersonaId)}`}
          >
            {selectedPersona && <PersonaIcon iconName={selectedPersona.icon} />}
          </div>
          <span className="text-neutral-900 font-medium truncate">
            {selectedPersona?.name || 'AI Agent'}
          </span>
          <ChevronDown className="size-4 text-neutral-500 flex-shrink-0" />
        </button>

        {/* Agent info - desktop */}
        <div
          className={`hidden md:flex size-10 rounded-lg items-center justify-center ${getPersonaColor(selectedPersonaId)}`}
        >
          {selectedPersona && <PersonaIcon iconName={selectedPersona.icon} />}
        </div>
        <div className="hidden md:block">
          <h3 className="text-neutral-900">{selectedPersona?.name || 'AI Agent'}</h3>
          <p className="text-sm text-neutral-500">{selectedPersona?.description}</p>
        </div>

        {isStreaming && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 hidden sm:flex">
            <Loader2 className="size-3 mr-1 animate-spin" />
            Thinking...
          </Badge>
        )}
        {/* Mobile streaming indicator (icon only) */}
        {isStreaming && (
          <Loader2 className="size-4 animate-spin text-amber-600 sm:hidden" />
        )}

        <div className="flex items-center gap-1 md:gap-2 ml-auto">
          {/* New Chat - full button on desktop, icon on mobile */}
          <Button
            variant="outline"
            size="sm"
            onClick={onNewChat}
            disabled={isStreaming}
            className="hidden sm:flex"
          >
            <Plus className="size-4 mr-1" />
            New Chat
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onNewChat}
            disabled={isStreaming}
            className="sm:hidden size-9"
            title="New Chat"
          >
            <Plus className="size-4" />
          </Button>

          <ConversationHistoryPopover
            open={showHistory}
            onOpenChange={onShowHistoryChange}
            conversations={conversationList}
            selectedConversationId={selectedConversationId}
            onSelectConversation={onSelectConversation}
            onDeleteConversation={onDeleteConversation}
            isDeleting={isDeleting}
          />
        </div>
      </div>
    </div>
  );
}
