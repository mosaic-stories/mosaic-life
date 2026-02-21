/**
 * Scrollable message area with empty state and loading indicator.
 */

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { Persona } from '@/features/ai-chat/api/ai';
import type { ChatMessage as ChatMessageType } from '@/features/ai-chat/store/aiChatStore';
import { ChatMessage } from './ChatMessage';
import { PersonaIcon } from './PersonaIcon';
import { getPersonaColor } from './utils';

interface MessageListProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  selectedPersona: Persona | undefined;
  selectedPersonaId: string;
  onRetry: () => void;
}

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(function MessageList(
  {
    messages,
    isLoading,
    selectedPersona,
    selectedPersonaId,
    onRetry,
  },
  ref
) {
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="size-8 animate-spin text-amber-600" />
            <p className="text-neutral-600">Loading conversation...</p>
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex items-center justify-center h-full px-4">
          <div className="text-center max-w-md">
            <div
              className={`size-12 md:size-16 rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-4 ${getPersonaColor(selectedPersonaId)}`}
            >
              {selectedPersona && <PersonaIcon iconName={selectedPersona.icon} />}
            </div>
            <h3 className="text-base md:text-lg font-medium text-neutral-900 mb-2">
              Start a conversation with {selectedPersona?.name}
            </h3>
            <p className="text-sm md:text-base text-neutral-600">
              {selectedPersona?.description}
            </p>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} onRetry={onRetry} />
          ))}
          <div ref={ref} />
        </>
      )}
    </div>
  );
});
