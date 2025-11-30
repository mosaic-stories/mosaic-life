import { ArrowLeft, Send, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import { NotificationBell } from './notifications';
import { useState } from 'react';

interface AIAgentChatMinimalProps {
  onNavigate: (view: string) => void;
  legacyId: string;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIAgentChatMinimal({
  onNavigate,
  legacyId: _legacyId,
  currentTheme,
  onThemeChange,
  user,
  onAuthClick,
  onSignOut
}: AIAgentChatMinimalProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm here to help you with your tribute. I can help you write stories, suggest improvements, or answer questions. What would you like to do?"
    }
  ]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);

    // Mock AI response
    setTimeout(() => {
      const aiResponse: Message = {
        role: 'assistant',
        content: "I'd be happy to help with that! Here's a suggestion: Start by thinking about a specific moment that stands out. What do you remember most vividly?"
      };
      setMessages(prev => [...prev, aiResponse]);
    }, 500);

    setInput('');
  };

  const quickPrompts = [
    "Help me write a story",
    "Improve my writing",
    "Suggest story ideas",
    "How do I add photos?"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))] flex flex-col">
      {/* Navigation */}
      <nav className="border-b bg-white/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button 
            onClick={() => onNavigate('profile-minimal')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="size-5" />
            <span className="text-sm">Back</span>
          </button>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => onNavigate('ai-chat')}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
            >
              Full Version
            </button>
            <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
            {user ? (
              <>
                <NotificationBell />
                <UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
              </>
            ) : (
              <Button onClick={onAuthClick} size="sm">Sign In</Button>
            )}
          </div>
        </div>
      </nav>

      {/* Chat Container */}
      <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-10 rounded-xl bg-[rgb(var(--theme-primary))] flex items-center justify-center">
              <Sparkles className="size-5 text-white" />
            </div>
            <div>
              <h2 className="text-neutral-900">AI Assistant</h2>
              <p className="text-sm text-neutral-600">
                {user ? 'Get help with your tribute' : 'Try the AI assistant - No sign in required'}
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-6">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl p-4 ${
                  message.role === 'user'
                    ? 'bg-[rgb(var(--theme-primary))] text-white'
                    : 'bg-white border border-[rgb(var(--theme-border))]'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="size-4 text-[rgb(var(--theme-primary))]" />
                    <span className="text-xs text-neutral-600">AI Assistant</span>
                  </div>
                )}
                <p className={`text-sm ${message.role === 'user' ? 'text-white' : 'text-neutral-700'}`}>
                  {message.content}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Prompts */}
        {messages.length <= 1 && (
          <div className="mb-4">
            <p className="text-xs text-neutral-600 mb-2">Quick actions:</p>
            <div className="flex gap-2 flex-wrap">
              {quickPrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setInput(prompt);
                  }}
                  className="text-xs px-3 py-2 rounded-lg border border-[rgb(var(--theme-border))] hover:border-[rgb(var(--theme-primary))] transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="bg-white rounded-2xl border border-[rgb(var(--theme-border))] p-4">
          <div className="flex gap-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask me anything..."
              className="flex-1 min-h-[60px] resize-none border-0 focus-visible:ring-0 p-0"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim()}
              className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] text-white self-end"
              size="icon"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}