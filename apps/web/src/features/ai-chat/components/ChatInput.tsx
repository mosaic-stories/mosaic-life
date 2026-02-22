/**
 * Chat input bar with send button and Enter key handling.
 */

import { forwardRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChatInputProps {
  inputMessage: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isStreaming: boolean;
  isLoading: boolean;
  personaName: string | undefined;
}

export const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(function ChatInput(
  {
    inputMessage,
    onInputChange,
    onSend,
    isStreaming,
    isLoading,
    personaName,
  },
  ref
) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="bg-white border-t px-4 md:px-6 py-3 md:py-4">
      <div className="flex gap-2 md:gap-3">
        <Input
          ref={ref}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="on"
          enterKeyHint="send"
          value={inputMessage}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? 'Please wait...'
              : `Ask ${personaName || 'the agent'} anything...`
          }
          className="flex-1"
          disabled={isStreaming || isLoading}
        />
        <Button
          onClick={onSend}
          className="gap-2"
          disabled={isStreaming || isLoading || !inputMessage.trim()}
        >
          {isStreaming ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Send
        </Button>
      </div>
    </div>
  );
});
