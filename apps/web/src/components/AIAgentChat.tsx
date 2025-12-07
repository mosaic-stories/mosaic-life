import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Heart, Search, Send, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { legacies, aiAgents } from '../lib/mockData';
import ThemeSelector from './ThemeSelector';

interface AIAgentChatProps {
  onNavigate: (view: string) => void;
  legacyId: string;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: string;
}

export default function AIAgentChat({ onNavigate, legacyId, currentTheme, onThemeChange }: AIAgentChatProps) {
  const navigate = useNavigate();
  const [selectedAgent, setSelectedAgent] = useState(aiAgents[0]);
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'agent',
      content: "Hello! I'm here to help you organize and explore Margaret's life story. I've noticed you have several stories about her cooking and garden. Would you like me to help connect these themes?",
      timestamp: '2:34 PM'
    }
  ]);

  const legacy = legacies.find(l => l.id === legacyId) || legacies[0];

  const getAgentIcon = (iconName: string) => {
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

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      content: inputMessage,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    };

    setMessages([...messages, newMessage]);
    setInputMessage('');

    // Simulate agent response
    setTimeout(() => {
      const agentResponse: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        content: getAgentResponse(selectedAgent.id, inputMessage),
        timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      };
      setMessages(prev => [...prev, agentResponse]);
    }, 1000);
  };

  const getAgentResponse = (agentId: string, _userMessage: string) => {
    const responses: { [key: string]: string } = {
      'biographer': "That's a wonderful detail. I notice this story connects to the theme of 'nurturing' that appears in several other memories. Would you like me to create a thematic collection around this?",
      'reporter': "Can you tell me more about that specific moment? What time of day was it? What did the room look like? What sounds do you remember?",
      'friend': "It sounds like that memory holds a lot of meaning for you. Take your time - there's no rush to capture everything at once.",
      'twin': "Based on the stories shared, Margaret might have said something like: 'The secret isn't in the recipe, it's in the love you fold into each dumpling.'"
    };
    return responses[agentId] || "Thank you for sharing that. Tell me more.";
  };

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
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
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
            {aiAgents.map((agent) => (
              <Card
                key={agent.id}
                className={`p-4 cursor-pointer transition-all ${
                  selectedAgent.id === agent.id
                    ? 'border-amber-300 bg-amber-50 shadow-sm'
                    : 'hover:border-neutral-300 hover:shadow-sm'
                }`}
                onClick={() => setSelectedAgent(agent)}
              >
                <div className="flex items-start gap-3">
                  <div className={`size-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    agent.id === 'biographer' ? 'bg-blue-100' :
                    agent.id === 'reporter' ? 'bg-emerald-100' :
                    agent.id === 'friend' ? 'bg-rose-100' :
                    'bg-purple-100'
                  }`}>
                    {getAgentIcon(agent.icon)}
                  </div>
                  <div className="space-y-1 flex-1">
                    <h3 className="text-neutral-900">{agent.name}</h3>
                    <p className="text-xs text-neutral-500">{agent.role}</p>
                    <p className="text-sm text-neutral-600 leading-relaxed">
                      {agent.description}
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
              <div className={`size-10 rounded-lg flex items-center justify-center ${
                selectedAgent.id === 'biographer' ? 'bg-blue-100' :
                selectedAgent.id === 'reporter' ? 'bg-emerald-100' :
                selectedAgent.id === 'friend' ? 'bg-rose-100' :
                'bg-purple-100'
              }`}>
                {getAgentIcon(selectedAgent.icon)}
              </div>
              <div>
                <h3 className="text-neutral-900">{selectedAgent.name}</h3>
                <p className="text-sm text-neutral-500">{selectedAgent.role}</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {message.sender === 'agent' && (
                  <Avatar className="size-8 flex-shrink-0">
                    <AvatarFallback className="bg-amber-100 text-amber-700 text-sm">
                      AI
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={`flex flex-col gap-1 max-w-lg ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <Card className={`p-4 ${
                    message.sender === 'user'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white'
                  }`}>
                    <p className={message.sender === 'user' ? 'text-white' : 'text-neutral-700'}>
                      {message.content}
                    </p>
                  </Card>
                  <span className="text-xs text-neutral-500 px-1">{message.timestamp}</span>
                </div>
                {message.sender === 'user' && (
                  <Avatar className="size-8 flex-shrink-0">
                    <AvatarFallback className="bg-neutral-200 text-neutral-700 text-sm">
                      You
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
          </div>

          {/* Input Area */}
          <div className="bg-white border-t px-6 py-4">
            <div className="flex gap-3">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={`Ask ${selectedAgent.name} anything...`}
                className="flex-1"
              />
              <Button onClick={handleSendMessage} className="gap-2">
                <Send className="size-4" />
                Send
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}