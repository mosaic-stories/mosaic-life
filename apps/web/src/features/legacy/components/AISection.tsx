import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import { useAIChat, usePersonas, useConversationList, useDeleteConversation } from '@/features/ai-chat/hooks/useAIChat';
import { usePrevious } from '@/hooks/usePrevious';
import { MessageList } from '@/features/ai-chat/components/MessageList';
import { ChatInput } from '@/features/ai-chat/components/ChatInput';
import { ConversationHistoryPopover } from '@/features/ai-chat/components/ConversationHistoryPopover';
import { PersonaIcon } from '@/features/ai-chat/components/PersonaIcon';
import { getPersonaColor } from '@/features/ai-chat/components/utils';
import type { Persona } from '@/features/ai-chat/api/ai';

export interface AISectionProps {
  legacyId: string;
}

const ALLOWED_PERSONAS = ['biographer', 'friend'];

export default function AISection({ legacyId }: AISectionProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('biographer');
  const [inputMessage, setInputMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch personas
  const { data: allPersonas, isLoading: personasLoading, error: personasError } = usePersonas();
  const personas = useMemo(
    () => allPersonas?.filter((p) => ALLOWED_PERSONAS.includes(p.id)) || [],
    [allPersonas]
  );

  // Conversation list + delete for history
  const { data: conversationList } = useConversationList(legacyId, selectedPersonaId);
  const deleteConversationMutation = useDeleteConversation(legacyId, selectedPersonaId);

  // Main chat hook
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    retryLastMessage,
    clearError,
    startNewConversation,
  } = useAIChat({
    legacyId,
    personaId: selectedPersonaId,
    conversationId: selectedConversationId,
  });

  const selectedPersona = personas.find((p) => p.id === selectedPersonaId);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Restore focus after streaming
  const wasStreaming = usePrevious(isStreaming);
  useEffect(() => {
    if (wasStreaming && !isStreaming && !isLoading) {
      const rafId = requestAnimationFrame(() => {
        setTimeout(() => {
          if (inputRef.current && !inputRef.current.disabled) {
            inputRef.current.focus();
          }
        }, 0);
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [isStreaming, isLoading, wasStreaming]);

  // Set initial persona when personas load
  useEffect(() => {
    if (personas.length > 0 && !personas.find((p) => p.id === selectedPersonaId)) {
      setSelectedPersonaId(personas[0].id);
    }
  }, [personas, selectedPersonaId]);

  // Reset conversation when persona changes
  useEffect(() => {
    setSelectedConversationId(null);
  }, [selectedPersonaId]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isStreaming) return;
    const content = inputMessage.trim();
    setInputMessage('');
    await sendMessage(content);
  };

  const handleNewChat = async () => {
    try {
      const newConversationId = await startNewConversation();
      setSelectedConversationId(newConversationId);
    } catch (err) {
      console.error('Failed to start new conversation:', err);
    }
  };

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversationMutation.mutateAsync(conversationId);
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(null);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Loading state
  if (personasLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-amber-600" />
          <p className="text-neutral-600">Loading AI agents...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (personasError) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="size-12 text-red-500" />
          <h2 className="text-xl font-semibold text-neutral-900">Failed to load AI agents</h2>
          <p className="text-neutral-600">Please try refreshing the page.</p>
          <Button onClick={() => window.location.reload()}>Refresh Page</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
      {/* Persona pills + toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex gap-2">
          {personas.map((persona) => (
            <PersonaPill
              key={persona.id}
              persona={persona}
              isSelected={persona.id === selectedPersonaId}
              onClick={() => setSelectedPersonaId(persona.id)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleNewChat} className="gap-1">
            <Plus className="size-4" />
            <span className="hidden sm:inline">New Chat</span>
          </Button>
          <ConversationHistoryPopover
            open={showHistory}
            onOpenChange={setShowHistory}
            conversations={conversationList}
            selectedConversationId={selectedConversationId}
            onSelectConversation={(id) => {
              setSelectedConversationId(id);
            }}
            onDeleteConversation={handleDeleteConversation}
            isDeleting={deleteConversationMutation.isPending}
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-red-700 min-w-0">
            <AlertCircle className="size-4 flex-shrink-0" />
            <span className="text-sm truncate">{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearError} className="text-red-700 flex-shrink-0">
            Dismiss
          </Button>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-neutral-50 rounded-xl border overflow-hidden min-h-0">
        {/* Streaming indicator */}
        {isStreaming && (
          <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" />
            {selectedPersona?.name || 'Agent'} is thinking...
          </div>
        )}

        <MessageList
          ref={messagesEndRef}
          messages={messages}
          isLoading={isLoading}
          selectedPersona={selectedPersona}
          selectedPersonaId={selectedPersonaId}
          onRetry={retryLastMessage}
        />

        <ChatInput
          ref={inputRef}
          inputMessage={inputMessage}
          onInputChange={setInputMessage}
          onSend={handleSendMessage}
          isStreaming={isStreaming}
          isLoading={isLoading}
          personaName={selectedPersona?.name}
        />
      </div>
    </div>
  );
}

/** Compact persona pill button */
function PersonaPill({
  persona,
  isSelected,
  onClick,
}: {
  persona: Persona;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all',
        isSelected
          ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-sm'
          : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
      )}
    >
      <div className={cn('size-6 rounded-full flex items-center justify-center', getPersonaColor(persona.id))}>
        <PersonaIcon iconName={persona.icon} />
      </div>
      {persona.name}
    </button>
  );
}
