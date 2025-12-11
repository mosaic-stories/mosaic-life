import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Heart,
  Search,
  Send,
  Users,
  Loader2,
  RefreshCw,
  AlertCircle,
  Plus,
  History,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useAIChat, usePersonas, useConversationList, useDeleteConversation } from '@/hooks/useAIChat';
import { cn } from './ui/utils';
import type { Persona } from '@/lib/api/ai';
import type { ChatMessage } from '@/stores/aiChatStore';
import { legacies } from '../lib/mockData';
import ThemeSelector from './ThemeSelector';
import { usePrevious } from '@/hooks/usePrevious';

interface AIAgentChatProps {
  onNavigate: (view: string) => void;
  legacyId?: string;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

// Phase 1 only includes Biographer and Friend personas
const ALLOWED_PERSONAS = ['biographer', 'friend'];

export default function AIAgentChat({
  onNavigate: _onNavigate,
  legacyId: propLegacyId,
  currentTheme,
  onThemeChange,
}: AIAgentChatProps) {
  const navigate = useNavigate();
  const params = useParams();

  // Get legacyId from route params or props
  const legacyId = propLegacyId || params.legacyId || '';

  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('biographer');
  const [inputMessage, setInputMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
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

  // Get legacy info (still using mock for now until legacy API is integrated)
  const legacy = legacies.find((l) => l.id === legacyId) || legacies[0];

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
      // Streaming just finished, refocus the input after the browser paints
      // Use requestAnimationFrame to wait for React's re-render, then setTimeout
      // to ensure the disabled attribute has been removed
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

  const getPersonaIcon = (iconName: string) => {
    switch (iconName) {
      case 'BookOpen':
        return <BookOpen className="size-5 text-blue-600" />;
      case 'Search':
        return <Search className="size-5 text-emerald-600" />;
      case 'Heart':
        return <Heart className="size-5 text-rose-600" />;
      case 'Users':
        return <Users className="size-5 text-purple-600" />;
      default:
        return <BookOpen className="size-5 text-blue-600" />;
    }
  };

  const getPersonaColor = (personaId: string) => {
    switch (personaId) {
      case 'biographer':
        return 'bg-blue-100';
      case 'reporter':
        return 'bg-emerald-100';
      case 'friend':
        return 'bg-rose-100';
      case 'twin':
        return 'bg-purple-100';
      default:
        return 'bg-blue-100';
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isStreaming) return;

    const content = inputMessage.trim();
    setInputMessage('');
    await sendMessage(content);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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
    e.stopPropagation(); // Prevent selecting the conversation when clicking delete

    try {
      await deleteConversationMutation.mutateAsync(conversationId);
      // If we deleted the currently selected conversation, clear the selection
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(null);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const formatTimestamp = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatRelativeTime = (isoString: string | null) => {
    if (!isoString) return 'No messages';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';
    const isStreamingMessage = message.status === 'streaming';
    const hasError = message.status === 'error';

    return (
      <div
        key={message.id}
        className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      >
        {!isUser && (
          <Avatar className="size-8 flex-shrink-0">
            <AvatarFallback className="bg-amber-100 text-amber-700 text-sm">
              AI
            </AvatarFallback>
          </Avatar>
        )}
        <div
          className={`flex flex-col gap-1 max-w-lg ${isUser ? 'items-end' : 'items-start'}`}
        >
          <Card
            className={`p-4 ${
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
                  onClick={retryLastMessage}
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
          <Avatar className="size-8 flex-shrink-0">
            <AvatarFallback className="bg-neutral-200 text-neutral-700 text-sm">
              You
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    );
  };

  // Show loading state while personas are loading
  if (personasLoading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--theme-background))] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-amber-600" />
          <p className="text-neutral-600">Loading AI agents...</p>
        </div>
      </div>
    );
  }

  // Show error state if personas failed to load
  if (personasError) {
    return (
      <div className="min-h-screen bg-[rgb(var(--theme-background))] flex items-center justify-center">
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
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300 flex flex-col">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(`/legacy/${legacyId}`)}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to {legacy.name}</span>
            </button>
            <div className="flex items-center gap-3">
              <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
              <Badge
                variant="outline"
                className="bg-blue-50 text-blue-700 border-blue-200"
              >
                Chat Interface
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/legacy/${legacyId}/ai-panel`)}
              >
                Switch to Panel
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Global error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="size-5" />
              <span>{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={clearError} className="text-red-700">
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Agent Selector Sidebar */}
        <aside className="w-80 bg-white border-r p-6 space-y-6">
          <div className="space-y-2">
            <h2 className="text-neutral-900">Select an Agent</h2>
            <p className="text-sm text-neutral-600">
              Each agent brings a unique perspective to help you preserve memories
            </p>
          </div>

          <div className="space-y-3">
            {personas.map((persona: Persona) => (
              <Card
                key={persona.id}
                className={`p-4 cursor-pointer transition-all ${
                  selectedPersonaId === persona.id
                    ? 'border-amber-300 bg-amber-50 shadow-sm'
                    : 'hover:border-neutral-300 hover:shadow-sm'
                }`}
                onClick={() => setSelectedPersonaId(persona.id)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`size-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getPersonaColor(persona.id)}`}
                  >
                    {getPersonaIcon(persona.icon)}
                  </div>
                  <div className="space-y-1 flex-1">
                    <h3 className="text-neutral-900">{persona.name}</h3>
                    <p className="text-sm text-neutral-600 leading-relaxed">
                      {persona.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </aside>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col bg-neutral-50">
          {/* Chat Header */}
          <div className="bg-white border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <div
                className={`size-10 rounded-lg flex items-center justify-center ${getPersonaColor(selectedPersonaId)}`}
              >
                {selectedPersona && getPersonaIcon(selectedPersona.icon)}
              </div>
              <div>
                <h3 className="text-neutral-900">{selectedPersona?.name || 'AI Agent'}</h3>
                <p className="text-sm text-neutral-500">{selectedPersona?.description}</p>
              </div>
              {isStreaming && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  <Loader2 className="size-3 mr-1 animate-spin" />
                  Thinking...
                </Badge>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewChat}
                  disabled={isStreaming}
                >
                  <Plus className="size-4 mr-1" />
                  New Chat
                </Button>

                <Popover open={showHistory} onOpenChange={setShowHistory}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <History className="size-4 mr-1" />
                      History
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-2">
                      <h4 className="font-medium">Recent Conversations</h4>
                      {conversationList?.length === 0 && (
                        <p className="text-sm text-neutral-500">No previous conversations</p>
                      )}
                      {conversationList?.map((conv) => (
                        <div
                          key={conv.id}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded hover:bg-neutral-100 group",
                            selectedConversationId === conv.id && "bg-amber-50"
                          )}
                        >
                          <button
                            onClick={() => {
                              setSelectedConversationId(conv.id);
                              setShowHistory(false);
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
                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                            disabled={deleteConversationMutation.isPending}
                            className={cn(
                              "p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity",
                              "text-neutral-400 hover:text-red-600 hover:bg-red-50",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                            title="Delete conversation"
                          >
                            {deleteConversationMutation.isPending ? (
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
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="size-8 animate-spin text-amber-600" />
                  <p className="text-neutral-600">Loading conversation...</p>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <div
                    className={`size-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${getPersonaColor(selectedPersonaId)}`}
                  >
                    {selectedPersona && getPersonaIcon(selectedPersona.icon)}
                  </div>
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">
                    Start a conversation with {selectedPersona?.name}
                  </h3>
                  <p className="text-neutral-600">
                    {selectedPersona?.description}
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

          {/* Input Area */}
          <div className="bg-white border-t px-6 py-4">
            <div className="flex gap-3">
              <Input
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  isStreaming
                    ? 'Please wait...'
                    : `Ask ${selectedPersona?.name || 'the agent'} anything...`
                }
                className="flex-1"
                disabled={isStreaming || isLoading}
              />
              <Button
                onClick={handleSendMessage}
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
        </main>
      </div>
    </div>
  );
}
