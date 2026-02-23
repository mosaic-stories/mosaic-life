import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAIChat, usePersonas, useConversationList, useDeleteConversation } from '@/features/ai-chat/hooks/useAIChat';
import { useLegacy } from '@/features/legacy/hooks/useLegacies';
import { usePrevious } from '@/hooks/usePrevious';
import { SEOHead } from '@/components/seo';
import { HeaderSlot } from '@/components/header';
import { AgentSidebar } from './AgentSidebar';
import { MobileAgentSheet } from './MobileAgentSheet';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

interface AIAgentChatProps {
  legacyId?: string;
}

// Phase 1 only includes Biographer and Friend personas
const ALLOWED_PERSONAS = ['biographer', 'friend'];

export default function AIAgentChat({
  legacyId: propLegacyId,
}: AIAgentChatProps) {
  const navigate = useNavigate();
  const params = useParams();

  // Get legacyId from route params or props
  const legacyId = propLegacyId || params.legacyId || '';

  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('biographer');
  const [inputMessage, setInputMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [mobileAgentSelectorOpen, setMobileAgentSelectorOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch personas from API
  const {
    data: allPersonas,
    isLoading: personasLoading,
    error: personasError,
  } = usePersonas();

  // Filter to only allowed personas for Phase 1
  const personas = useMemo(
    () => allPersonas?.filter((p) => ALLOWED_PERSONAS.includes(p.id)) || [],
    [allPersonas]
  );

  // Fetch conversation list for selected persona
  const { data: conversationList } = useConversationList(legacyId, selectedPersonaId);

  // Delete conversation mutation
  const deleteConversationMutation = useDeleteConversation(legacyId, selectedPersonaId);

  // Use the AI chat hook
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

  // Get legacy info from the API
  const { data: legacy } = useLegacy(legacyId);

  // Get selected persona
  const selectedPersona = personas.find((p) => p.id === selectedPersonaId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Restore focus to input when streaming completes
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

  // Reset selected conversation when persona changes
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
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
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
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="size-12 text-red-500" />
          <h2 className="text-xl font-semibold text-neutral-900">Failed to load AI agents</h2>
          <p className="text-neutral-600">
            We couldn&apos;t load the AI agents. Please try refreshing the page.
          </p>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="size-4 mr-2" />
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300 flex flex-col">
      <SEOHead
        title="AI Chat"
        description="Chat with AI agents about this legacy"
        noIndex={true}
      />
      <HeaderSlot>
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => navigate(`/legacy/${legacyId}`)}
            className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors min-w-0"
          >
            <ArrowLeft className="size-4 flex-shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Back to </span>
              {legacy?.name || 'Legacy'}
            </span>
          </button>
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 hidden md:inline-flex"
          >
            Chat Interface
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/legacy/${legacyId}/ai-panel`)}
            className="hidden sm:inline-flex"
          >
            Switch to Panel
          </Button>
        </div>
      </HeaderSlot>

      {/* Global error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 md:px-6 py-2 md:py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-red-700 min-w-0">
              <AlertCircle className="size-4 md:size-5 flex-shrink-0" />
              <span className="text-sm md:text-base truncate">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={clearError} className="text-red-700 flex-shrink-0">
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <MobileAgentSheet
          open={mobileAgentSelectorOpen}
          onOpenChange={setMobileAgentSelectorOpen}
          personas={personas}
          selectedPersonaId={selectedPersonaId}
          onSelectPersona={setSelectedPersonaId}
        />

        <AgentSidebar
          personas={personas}
          selectedPersonaId={selectedPersonaId}
          onSelectPersona={setSelectedPersonaId}
        />

        {/* Chat Area */}
        <main className="flex-1 flex flex-col bg-neutral-50">
          <ChatHeader
            selectedPersona={selectedPersona}
            selectedPersonaId={selectedPersonaId}
            isStreaming={isStreaming}
            showHistory={showHistory}
            onShowHistoryChange={setShowHistory}
            onNewChat={handleNewChat}
            onOpenMobileSelector={() => setMobileAgentSelectorOpen(true)}
            conversationList={conversationList}
            selectedConversationId={selectedConversationId}
            onSelectConversation={setSelectedConversationId}
            onDeleteConversation={handleDeleteConversation}
            isDeleting={deleteConversationMutation.isPending}
          />

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
        </main>
      </div>
    </div>
  );
}
