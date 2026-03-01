import { useState, useRef, useEffect } from 'react';
import { Send, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAIChat } from '@/features/ai-chat/hooks/useAIChat';
import { useConversationSeed } from '../hooks/useConversationSeed';
import { PersonaSelector } from '../components/PersonaSelector';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';

interface AIChatToolProps {
  legacyId: string;
  storyId: string;
  conversationId: string | null;
}

export function AIChatTool({ legacyId, storyId, conversationId }: AIChatToolProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activePersonaId = useEvolveWorkspaceStore((s) => s.activePersonaId);

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    retryLastMessage,
    clearError,
  } = useAIChat({
    legacyId,
    personaId: activePersonaId,
    conversationId,
  });

  // Stream opening message when conversation is empty
  useConversationSeed(conversationId, storyId);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Persona selector */}
      <PersonaSelector disabled={isStreaming} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <p className="text-sm text-neutral-400 text-center py-8">
            Preparing your AI companion...
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg px-3 py-2 ${
              msg.role === 'user'
                ? 'bg-theme-primary/10 ml-4'
                : msg.role === 'assistant'
                  ? 'bg-neutral-50 mr-4'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {msg.role === 'assistant' && msg.status === 'streaming' ? (
              <Streamdown isAnimating={true} caret="block">
                {msg.content}
              </Streamdown>
            ) : (
              <span className="whitespace-pre-wrap">{msg.content}</span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 text-red-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={retryLastMessage}>
              <RotateCcw className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t shrink-0">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the story..."
            className="min-h-[60px] max-h-[120px] text-sm resize-none"
            disabled={isStreaming}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
