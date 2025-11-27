import { useState } from 'react';
import { ArrowLeft, HelpCircle, Image, Save, Sparkles, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { legacies } from '../lib/mockData';
import { getThemeClasses } from '../lib/themes';
import ThemeSelector from './ThemeSelector';

interface StoryCreationProps {
  onNavigate: (view: string) => void;
  legacyId: string;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

interface AIPrompt {
  id: string;
  question: string;
  context: string;
}

export default function StoryCreation({ onNavigate, legacyId, currentTheme, onThemeChange }: StoryCreationProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showAIPrompts, setShowAIPrompts] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<AIPrompt | null>(null);
  
  const legacy = legacies.find(l => l.id === legacyId) || legacies[0];
  const theme = getThemeClasses(currentTheme);

  const aiPrompts: AIPrompt[] = [
    {
      id: '1',
      question: 'What was the setting like?',
      context: 'Adding sensory details helps bring your story to life'
    },
    {
      id: '2',
      question: 'What did they say or do?',
      context: 'Specific dialogue or actions make moments memorable'
    },
    {
      id: '3',
      question: 'How did this make you feel?',
      context: 'Emotions help readers connect with your experience'
    },
    {
      id: '4',
      question: 'What made this moment special?',
      context: 'Understanding the significance adds depth to your story'
    }
  ];

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    
    // Show AI prompts after user has written a bit
    if (e.target.value.length > 50 && !showAIPrompts) {
      setShowAIPrompts(true);
      setCurrentPrompt(aiPrompts[0]);
    }
  };

  const dismissPrompt = () => {
    setCurrentPrompt(null);
    // Show next prompt after a delay
    setTimeout(() => {
      const nextIndex = aiPrompts.findIndex(p => p.id === currentPrompt?.id) + 1;
      if (nextIndex < aiPrompts.length) {
        setCurrentPrompt(aiPrompts[nextIndex]);
      }
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to {legacy.name}</span>
            </button>
            <div className="flex items-center gap-3">
              <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
              <Button variant="ghost" size="sm">
                Save Draft
              </Button>
              <Button size="sm" className="gap-2">
                <Save className="size-4" />
                Publish Story
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Info Card */}
          <Card className="p-6 bg-[rgb(var(--theme-accent-light))] border-[rgb(var(--theme-accent))]">
            <div className="flex items-start gap-4">
              <div className="size-10 rounded-full bg-[rgb(var(--theme-primary))] flex items-center justify-center flex-shrink-0">
                <Sparkles className="size-5 text-white" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-neutral-900">AI writing assistant enabled</h3>
                <p className="text-sm text-neutral-600">
                  As you write, I'll suggest questions to help you add rich details and capture the full story. You can ignore or engage with any prompt.
                </p>
              </div>
            </div>
          </Card>

          {/* Writing Interface */}
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm text-neutral-600">Story Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your story a title..."
                className="text-lg"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-neutral-600">Your Story</label>
              <div className="relative">
                <textarea
                  value={content}
                  onChange={handleContentChange}
                  placeholder="Start writing your story here..."
                  className="w-full min-h-[400px] p-6 rounded-lg border border-neutral-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-100 outline-none resize-none bg-white"
                  style={{ fontSize: 'inherit', lineHeight: 'inherit' }}
                />

                {/* AI Prompt Overlay */}
                {currentPrompt && (
                  <div className="absolute right-6 top-6 max-w-xs">
                    <Card className="p-4 shadow-lg border-[rgb(var(--theme-accent))] bg-white animate-in slide-in-from-right">
                      <div className="flex items-start gap-3">
                        <div className="size-8 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <HelpCircle className="size-4 text-[rgb(var(--theme-primary))]" />
                        </div>
                        <div className="space-y-2 flex-1">
                          <p className="text-sm text-neutral-900">{currentPrompt.question}</p>
                          <p className="text-xs text-neutral-500">{currentPrompt.context}</p>
                        </div>
                        <button
                          onClick={dismissPrompt}
                          className="text-neutral-400 hover:text-neutral-600 transition-colors"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
              <p className="text-sm text-neutral-500">
                {content.length} characters
              </p>
            </div>

            {/* Media Upload */}
            <div className="space-y-2">
              <label className="text-sm text-neutral-600">Add Media (Optional)</label>
              <button className="w-full p-8 rounded-lg border-2 border-dashed border-neutral-300 hover:border-[rgb(var(--theme-accent))] hover:bg-[rgb(var(--theme-accent-light))]/30 transition-colors">
                <div className="flex flex-col items-center gap-3">
                  <div className="size-12 rounded-full bg-neutral-100 flex items-center justify-center">
                    <Image className="size-6 text-neutral-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-neutral-900">Add photos or videos</p>
                    <p className="text-sm text-neutral-500">Drag and drop or click to browse</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* AI Suggestions Panel */}
          {showAIPrompts && (
            <Card className="p-6 space-y-4 bg-[rgb(var(--theme-surface))]">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-[rgb(var(--theme-primary))]" />
                <h3 className="text-neutral-900">Enrich your story</h3>
              </div>
              <p className="text-sm text-neutral-600">
                Consider adding these details to make your story more vivid:
              </p>
              <div className="grid gap-2">
                {aiPrompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    className="p-3 rounded-lg border border-neutral-200 hover:border-[rgb(var(--theme-accent))] hover:bg-[rgb(var(--theme-accent-light))]/30 transition-colors text-left"
                    onClick={() => setCurrentPrompt(prompt)}
                  >
                    <p className="text-sm text-neutral-700">{prompt.question}</p>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}