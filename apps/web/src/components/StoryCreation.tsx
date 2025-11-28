import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle, Image, Loader2, Save, Sparkles, X, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { getThemeClasses } from '../lib/themes';
import ThemeSelector from './ThemeSelector';
import { useLegacy } from '@/lib/hooks/useLegacies';
import { useStory, useCreateStory, useUpdateStory } from '@/lib/hooks/useStories';

interface StoryCreationProps {
  onNavigate: (view: string) => void;
  legacyId: string;
  storyId?: string;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

interface AIPrompt {
  id: string;
  question: string;
  context: string;
}

function DemoBadge() {
  return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
      Demo
    </Badge>
  );
}

export default function StoryCreation({ onNavigate, legacyId, storyId, currentTheme, onThemeChange }: StoryCreationProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'personal'>('private');
  const [showAIPrompts, setShowAIPrompts] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<AIPrompt | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: legacy, isLoading: legacyLoading } = useLegacy(legacyId);
  const { data: existingStory, isLoading: storyLoading } = useStory(storyId);
  const createStory = useCreateStory();
  const updateStory = useUpdateStory();
  const theme = getThemeClasses(currentTheme);

  const isEditMode = !!storyId;

  // Populate form with existing story data when editing
  useEffect(() => {
    if (existingStory) {
      setTitle(existingStory.title);
      setContent(existingStory.content);
      setVisibility(existingStory.visibility);
    }
  }, [existingStory]);

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

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) {
      setSubmitError('Please add a title and content for your story.');
      return;
    }

    setSubmitError(null);

    try {
      if (isEditMode && storyId) {
        await updateStory.mutateAsync({
          storyId,
          data: {
            title: title.trim(),
            content: content.trim(),
            visibility,
          },
        });
      } else {
        await createStory.mutateAsync({
          legacy_id: legacyId,
          title: title.trim(),
          content: content.trim(),
          visibility,
        });
      }

      // Navigate back to the legacy profile on success
      navigate(`/legacy/${legacyId}`);
    } catch (error) {
      setSubmitError(isEditMode ? 'Failed to update story. Please try again.' : 'Failed to publish story. Please try again.');
    }
  };

  const handleBack = () => {
    navigate(`/legacy/${legacyId}`);
  };

  const legacyName = legacy?.name || 'Legacy';
  const isMutating = createStory.isPending || updateStory.isPending;

  // Show loading state while fetching existing story in edit mode
  if (isEditMode && storyLoading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--theme-background))] flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[rgb(var(--theme-primary))]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to {legacyName}</span>
            </button>
            <div className="flex items-center gap-3">
              <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
              <Button variant="ghost" size="sm" disabled>
                Save Draft
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={handlePublish}
                disabled={isMutating || !title.trim() || !content.trim()}
              >
                {isMutating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {isEditMode ? 'Update Story' : 'Publish Story'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Error Message */}
          {submitError && (
            <Card className="p-4 border-red-200 bg-red-50">
              <div className="flex items-center gap-3 text-red-800">
                <AlertCircle className="size-5" />
                <p>{submitError}</p>
              </div>
            </Card>
          )}

          {/* Info Card */}
          <Card className="p-6 bg-[rgb(var(--theme-accent-light))] border-[rgb(var(--theme-accent))]">
            <div className="flex items-start gap-4">
              <div className="size-10 rounded-full bg-[rgb(var(--theme-primary))] flex items-center justify-center flex-shrink-0">
                <Sparkles className="size-5 text-white" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-neutral-900">AI writing assistant enabled</h3>
                  <DemoBadge />
                </div>
                <p className="text-sm text-neutral-600">
                  As you write, I'll suggest questions to help you add rich details and capture the full story. You can ignore or engage with any prompt.
                </p>
              </div>
            </div>
          </Card>

          {/* Writing Interface */}
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm text-neutral-600">Story Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your story a title..."
                className="text-lg"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-neutral-600">Visibility</label>
              <div className="flex gap-2">
                <Button
                  variant={visibility === 'public' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setVisibility('public')}
                >
                  Public
                </Button>
                <Button
                  variant={visibility === 'private' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setVisibility('private')}
                >
                  Members Only
                </Button>
                <Button
                  variant={visibility === 'personal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setVisibility('personal')}
                >
                  Personal
                </Button>
              </div>
              <p className="text-xs text-neutral-500">
                {visibility === 'public' && 'Anyone can read this story'}
                {visibility === 'private' && 'Only legacy members can read this story'}
                {visibility === 'personal' && 'Only you can see this story'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-neutral-600">Your Story *</label>
              <div className="relative">
                <textarea
                  value={content}
                  onChange={handleContentChange}
                  placeholder="Start writing your story here... Use Markdown for formatting."
                  className="w-full min-h-[400px] p-6 rounded-lg border border-neutral-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-100 outline-none resize-none bg-white font-mono text-sm"
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
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-neutral-900">{currentPrompt.question}</p>
                            <DemoBadge />
                          </div>
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
              <p className="text-sm text-neutral-500">{content.length} characters • Markdown supported</p>
            </div>

            {/* Media Upload */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600">Add Media (Optional)</label>
                <DemoBadge />
              </div>
              <button
                className="w-full p-8 rounded-lg border-2 border-dashed border-neutral-300 hover:border-[rgb(var(--theme-accent))] hover:bg-[rgb(var(--theme-accent-light))]/30 transition-colors opacity-50 cursor-not-allowed"
                disabled
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="size-12 rounded-full bg-neutral-100 flex items-center justify-center">
                    <Image className="size-6 text-neutral-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-neutral-900">Add photos or videos</p>
                    <p className="text-sm text-neutral-500">Media upload coming soon</p>
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
                <DemoBadge />
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
