import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Heart, Search, Sparkles, Users, Rocket } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { aiAgents } from '../lib/mockData';
import { useLegacy } from '@/lib/hooks/useLegacies';
import ThemeSelector from './ThemeSelector';

interface AIAgentPanelProps {
  onNavigate: (view: string) => void;
  legacyId: string;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

interface Interaction {
  id: string;
  title: string;
  description: string;
  action: string;
}

export default function AIAgentPanel({ onNavigate: _onNavigate, legacyId, currentTheme, onThemeChange }: AIAgentPanelProps) {
  const navigate = useNavigate();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [comingSoonDialogOpen, setComingSoonDialogOpen] = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  
  // Get legacy info from the API
  const { data: legacy } = useLegacy(legacyId);

  const handleInteractionClick = (interaction: Interaction) => {
    setSelectedInteraction(interaction);
    setComingSoonDialogOpen(true);
  };

  const agentInteractions: { [key: string]: Interaction[] } = {
    'biographer': [
      {
        id: '1',
        title: 'Create a Timeline',
        description: 'Organize stories chronologically to see the arc of Margaret\'s life',
        action: 'Generate Timeline'
      },
      {
        id: '2',
        title: 'Find Story Themes',
        description: 'Discover recurring themes across all shared memories',
        action: 'Analyze Themes'
      },
      {
        id: '3',
        title: 'Identify Gaps',
        description: 'Suggest time periods or topics that could use more stories',
        action: 'Show Gaps'
      }
    ],
    'reporter': [
      {
        id: '1',
        title: 'Deep Dive Interview',
        description: 'Answer guided questions to capture a specific memory in detail',
        action: 'Start Interview'
      },
      {
        id: '2',
        title: 'Fact Check Stories',
        description: 'Cross-reference details across different stories for accuracy',
        action: 'Review Facts'
      },
      {
        id: '3',
        title: 'Expand on a Memory',
        description: 'Get prompted with questions to add more detail to an existing story',
        action: 'Choose Story'
      }
    ],
    'friend': [
      {
        id: '1',
        title: 'Reflection Space',
        description: 'A safe place to process feelings and memories at your own pace',
        action: 'Begin Reflection'
      },
      {
        id: '2',
        title: 'Gratitude Journal',
        description: 'Capture what you\'re grateful for in your relationship with Margaret',
        action: 'Start Journal'
      },
      {
        id: '3',
        title: 'Letter Writing',
        description: 'Write a letter to Margaret, with gentle prompts if helpful',
        action: 'Write Letter'
      }
    ],
    'twin': [
      {
        id: '1',
        title: 'Ask Margaret',
        description: 'Pose questions and receive responses based on her known values and voice',
        action: 'Ask a Question'
      },
      {
        id: '2',
        title: 'What Would She Say?',
        description: 'Get perspective on current situations based on her wisdom',
        action: 'Get Perspective'
      },
      {
        id: '3',
        title: 'Voice Training',
        description: 'Improve the digital twin by adding more stories and quotes',
        action: 'Add Training Data'
      }
    ]
  };

  const getAgentIcon = (iconName: string) => {
    switch (iconName) {
      case 'BookOpen':
        return <BookOpen className="size-6 text-blue-600" />;
      case 'Search':
        return <Search className="size-6 text-emerald-600" />;
      case 'Heart':
        return <Heart className="size-6 text-rose-600" />;
      case 'Users':
        return <Users className="size-6 text-purple-600" />;
      default:
        return <BookOpen className="size-6 text-blue-600" />;
    }
  };

  const getAgentColor = (agentId: string) => {
    switch (agentId) {
      case 'biographer':
        return {
          bg: 'bg-blue-100',
          border: 'border-blue-200',
          text: 'text-blue-700',
          hover: 'hover:border-blue-300 hover:shadow-blue-100'
        };
      case 'reporter':
        return {
          bg: 'bg-emerald-100',
          border: 'border-emerald-200',
          text: 'text-emerald-700',
          hover: 'hover:border-emerald-300 hover:shadow-emerald-100'
        };
      case 'friend':
        return {
          bg: 'bg-rose-100',
          border: 'border-rose-200',
          text: 'text-rose-700',
          hover: 'hover:border-rose-300 hover:shadow-rose-100'
        };
      case 'twin':
        return {
          bg: 'bg-purple-100',
          border: 'border-purple-200',
          text: 'text-purple-700',
          hover: 'hover:border-purple-300 hover:shadow-purple-100'
        };
      default:
        return {
          bg: 'bg-neutral-100',
          border: 'border-neutral-200',
          text: 'text-neutral-700',
          hover: 'hover:border-neutral-300 hover:shadow-neutral-100'
        };
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => navigate(`/legacy/${legacyId}`)}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to {legacy?.name || 'Legacy'}</span>
            </button>
            <div className="flex items-center gap-3">
              <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                Agent Panel
              </Badge>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate(`/legacy/${legacyId}/ai-chat`)}
              >
                Switch to Chat
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Intro */}
          <div className="max-w-3xl space-y-3">
            <h1 className="text-neutral-900">AI Agents</h1>
            <p className="text-neutral-600">
              Each agent offers specialized capabilities to help you preserve and interact with {legacy?.name ? `${legacy.name}'s` : 'this'} legacy. Select an agent to explore what they can do.
            </p>
          </div>

          {/* Agent Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {aiAgents.map((agent) => {
              const colors = getAgentColor(agent.id);
              const isSelected = selectedAgent === agent.id;
              
              return (
                <Card
                  key={agent.id}
                  className={`p-8 cursor-pointer transition-all ${
                    isSelected 
                      ? `${colors.border} shadow-lg ring-2 ring-offset-2 ${colors.border.replace('border-', 'ring-')}` 
                      : `hover:shadow-md ${colors.hover}`
                  }`}
                  onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
                >
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className={`size-14 rounded-xl ${colors.bg} flex items-center justify-center flex-shrink-0`}>
                        {getAgentIcon(agent.icon)}
                      </div>
                      <div className="flex-1 space-y-1">
                        <h3 className="text-neutral-900">{agent.name}</h3>
                        <p className="text-sm text-neutral-500">{agent.role}</p>
                      </div>
                    </div>

                    <p className="text-neutral-600 leading-relaxed">
                      {agent.description}
                    </p>

                    {isSelected && (
                      <div className="pt-4 space-y-3 border-t border-neutral-200 animate-in fade-in slide-in-from-top-2">
                        <p className="text-sm text-neutral-900">Available interactions:</p>
                        <div className="space-y-2">
                          {agentInteractions[agent.id]?.map((interaction) => (
                            <div
                              key={interaction.id}
                              className="p-4 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors border border-neutral-200"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1 flex-1">
                                  <p className="text-neutral-900">{interaction.title}</p>
                                  <p className="text-sm text-neutral-600">{interaction.description}</p>
                                </div>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleInteractionClick(interaction);
                                  }}
                                >
                                  {interaction.action}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Help Section */}
          <Card className="p-8 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
            <div className="flex items-start gap-4">
              <div className="size-12 rounded-full bg-amber-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="size-6 text-white" />
              </div>
              <div className="space-y-3 flex-1">
                <h3 className="text-neutral-900">Not sure where to start?</h3>
                <p className="text-neutral-600 leading-relaxed">
                  Try <strong>The Reporter</strong> if you want to capture a specific memory in detail, or <strong>The Biographer</strong> to see how your stories connect into a larger narrative. The <strong>Digital Twin</strong> requires more stories to be effective, but can be powerful for ongoing conversations.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </main>

      {/* Coming Soon Dialog */}
      <Dialog open={comingSoonDialogOpen} onOpenChange={setComingSoonDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-100">
              <Rocket className="size-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center">Coming Soon!</DialogTitle>
            <DialogDescription className="text-center">
              {selectedInteraction && (
                <>
                  <strong className="text-neutral-700">{selectedInteraction.title}</strong> is a feature we're 
                  actively working on. This capability will help you {selectedInteraction.description.toLowerCase()}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
            <p className="text-sm text-amber-800">
              We're building something special here. Stay tuned for updates as we continue to enhance 
              Mosaic's AI capabilities!
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button
              variant="outline"
              onClick={() => setComingSoonDialogOpen(false)}
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}