import { ArrowLeft, Sparkles, Save, X } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import { useState } from 'react';

interface StoryCreationMinimalProps {
  onNavigate: (view: string) => void;
  legacyId: string;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function StoryCreationMinimal({
  onNavigate,
  legacyId,
  currentTheme,
  onThemeChange,
  user,
  onAuthClick,
  onSignOut
}: StoryCreationMinimalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');

  const handleAISuggest = () => {
    setShowAI(true);
    // Mock AI suggestion
    setTimeout(() => {
      setAiSuggestion("Consider starting with 'I remember when...' to make the story more personal and engaging.");
    }, 500);
  };

  const handleSave = () => {
    // Mock save
    onNavigate('profile-minimal');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))]">
      {/* Navigation */}
      <nav className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50">
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
              onClick={() => onNavigate('story')}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
            >
              Full Version
            </button>
            <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
            {user ? (
              <UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
            ) : (
              <Button onClick={onAuthClick} size="sm">Sign In</Button>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-neutral-900 mb-2">Share a Story</h1>
          <p className="text-neutral-600">
            {user ? 'Add a memory or reflection' : 'Demo Mode - Try the story editor'}
          </p>
        </div>

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm text-neutral-700 mb-2">
              Title (optional)
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your story a title..."
              className="w-full"
            />
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-neutral-700">
                Your Story
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAISuggest}
                className="gap-2"
              >
                <Sparkles className="size-4" />
                AI Help
              </Button>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share your memory..."
              className="w-full min-h-[300px] resize-none"
            />
          </div>

          {/* AI Suggestion Panel */}
          {showAI && (
            <div className="bg-[rgb(var(--theme-bg))] border border-[rgb(var(--theme-primary))] rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="size-8 rounded-lg bg-[rgb(var(--theme-primary))] text-white flex items-center justify-center flex-shrink-0">
                  <Sparkles className="size-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-neutral-700 mb-3">{aiSuggestion}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setContent(prev => prev + (prev ? ' ' : '') + aiSuggestion);
                        setShowAI(false);
                      }}
                    >
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAI(false)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
                <button
                  onClick={() => setShowAI(false)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <Button
              onClick={handleSave}
              disabled={!content.trim()}
              className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] text-white gap-2"
            >
              <Save className="size-4" />
              Save Story
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigate('profile-minimal')}
            >
              Cancel
            </Button>
          </div>

          {/* AI Tips */}
          <div className="bg-white rounded-xl p-6 border border-[rgb(var(--theme-border))]">
            <h3 className="text-sm text-neutral-900 mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-[rgb(var(--theme-primary))]" />
              Writing Tips
            </h3>
            <ul className="space-y-2 text-sm text-neutral-600">
              <li>• Start with a specific moment or detail</li>
              <li>• Include emotions and sensory details</li>
              <li>• Keep it personal and authentic</li>
              <li>• Ask AI for help refining your story</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}