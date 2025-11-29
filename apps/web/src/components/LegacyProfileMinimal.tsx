import { ArrowLeft, Share2, Plus, MessageSquare, Sparkles, Users, Loader2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import ThemeSelector from './ThemeSelector';
import UserProfileDropdown from './UserProfileDropdown';
import { useLegacyWithFallback } from '@/lib/hooks/useLegacies';
import { useStoriesWithFallback } from '@/lib/hooks/useStories';
import { formatLegacyDates } from '@/lib/api/legacies';

interface LegacyProfileMinimalProps {
  legacyId: string;
  onNavigate: (view: string) => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAuthClick: () => void;
  onSignOut: () => void;
}

export default function LegacyProfileMinimal({
  legacyId,
  onNavigate,
  currentTheme,
  onThemeChange,
  user,
  onAuthClick,
  onSignOut
}: LegacyProfileMinimalProps) {
  // Use fallback hooks that try private endpoint first, then fall back to public
  const legacyQuery = useLegacyWithFallback(legacyId, !!user);
  const storiesQuery = useStoriesWithFallback(legacyId, !!user);

  const legacy = legacyQuery.data;
  const legacyLoading = legacyQuery.isLoading;
  const legacyError = legacyQuery.error;
  const stories = storiesQuery.data;
  const storiesLoading = storiesQuery.isLoading;
  const storiesError = storiesQuery.error;

  const dates = legacy ? formatLegacyDates(legacy) : '';

  if (legacyLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))] flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[rgb(var(--theme-primary))]" />
      </div>
    );
  }

  if (legacyError || !legacy) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))] flex items-center justify-center p-6">
        <Card className="p-6 border-red-200 bg-red-50 max-w-md">
          <div className="flex items-center gap-3 text-red-800">
            <AlertCircle className="size-5" />
            <div>
              <p className="font-medium">Failed to load legacy</p>
              <p className="text-sm text-red-600">The legacy could not be found or an error occurred.</p>
            </div>
          </div>
          <Button className="mt-4" onClick={() => onNavigate('home-minimal')}>
            Back to Home
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-[rgb(var(--theme-bg))]">
      {/* Navigation */}
      <nav className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button 
            onClick={() => onNavigate('home-minimal')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="size-5" />
            <span className="text-sm">Back</span>
          </button>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => onNavigate('profile')}
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
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Profile Header */}
        <div className="bg-white rounded-2xl p-8 border border-[rgb(var(--theme-border))] mb-8">
          <div className="flex items-start gap-6">
            <div className="size-24 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0">
              <Users className="size-10 text-neutral-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-neutral-900 mb-2">{legacy.name}</h1>
              {dates && <p className="text-neutral-600 mb-3">{dates}</p>}
              {legacy.biography && (
                <p className="text-neutral-700 mb-4">{legacy.biography}</p>
              )}
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={() => onNavigate('story-minimal')}
                  className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))] text-white gap-2"
                >
                  <Plus className="size-4" />
                  Add Story
                </Button>
                <Button size="sm" variant="outline" className="gap-2">
                  <Share2 className="size-4" />
                  Share
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button className="px-4 py-2 rounded-lg bg-[rgb(var(--theme-primary))] text-white">
            Stories
          </button>
          <button
            onClick={() => onNavigate('gallery-minimal')}
            className="px-4 py-2 rounded-lg border border-[rgb(var(--theme-border))] hover:border-[rgb(var(--theme-primary))] transition-colors"
          >
            Gallery
          </button>
          <button
            onClick={() => onNavigate('ai-chat-minimal')}
            className="px-4 py-2 rounded-lg border border-[rgb(var(--theme-border))] hover:border-[rgb(var(--theme-primary))] transition-colors gap-2 flex items-center"
          >
            <Sparkles className="size-4" />
            AI Chat
          </button>
        </div>

        {/* Stories */}
        <div className="space-y-6">
          {storiesLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-[rgb(var(--theme-primary))]" />
            </div>
          )}

          {storiesError && (
            <Card className="p-6 border-red-200 bg-red-50">
              <div className="flex items-center gap-3 text-red-800">
                <AlertCircle className="size-5" />
                <p>Failed to load stories</p>
              </div>
            </Card>
          )}

          {!storiesLoading && !storiesError && stories?.map((story) => {
            const authorInitials = story.author_name
              ? story.author_name.split(' ').map(n => n[0]).join('')
              : '?';
            const formattedDate = new Date(story.created_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <div
                key={story.id}
                className="bg-white rounded-2xl p-6 border border-[rgb(var(--theme-border))] hover:border-[rgb(var(--theme-primary))] transition-colors"
              >
                {/* Author */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="size-10 rounded-full bg-[rgb(var(--theme-bg))] flex items-center justify-center">
                    <span className="text-sm">{authorInitials}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-neutral-900">{story.author_name || 'Anonymous'}</p>
                    <p className="text-xs text-neutral-500">{formattedDate}</p>
                  </div>
                  {story.visibility !== 'public' && (
                    <Badge variant="outline" className="text-xs">
                      {story.visibility === 'private' ? 'Members only' : 'Personal'}
                    </Badge>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-neutral-900 mb-3">{story.title}</h3>
              </div>
            );
          })}

          {!storiesLoading && !storiesError && stories?.length === 0 && (
            <div className="bg-white rounded-2xl p-8 border border-[rgb(var(--theme-border))] text-center text-neutral-500">
              <MessageSquare className="size-12 mx-auto text-neutral-300 mb-4" />
              <p>No stories yet.</p>
              <p className="text-sm mt-1">Be the first to add a story to this legacy.</p>
            </div>
          )}

          {/* Add Story Prompt */}
          <button
            onClick={() => onNavigate('story-minimal')}
            className="w-full bg-white border-2 border-dashed border-[rgb(var(--theme-border))] rounded-2xl p-8 hover:border-[rgb(var(--theme-primary))] transition-all group"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="size-12 rounded-full bg-[rgb(var(--theme-bg))] flex items-center justify-center group-hover:bg-[rgb(var(--theme-primary))] transition-colors">
                <Plus className="size-6 text-[rgb(var(--theme-primary))] group-hover:text-white transition-colors" />
              </div>
              <p className="text-neutral-600">Share a memory</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}