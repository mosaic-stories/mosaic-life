import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Heart, Lock, Loader2, MessageSquare, MoreVertical, Pencil, Plus, Share2, Sparkles, Trash2, Users, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { getThemeClasses } from '../lib/themes';
import MediaUploader from './MediaUploader';
import MediaGalleryInline from './MediaGalleryInline';
import ThemeSelector from './ThemeSelector';
import { useLegacyWithFallback, useDeleteLegacy } from '@/lib/hooks/useLegacies';
import { useStoriesWithFallback } from '@/lib/hooks/useStories';
import { formatLegacyDates } from '@/lib/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import type { StorySummary } from '@/lib/api/stories';

interface LegacyProfileProps {
  legacyId: string;
  onNavigate: (view: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
  user: { name: string; email: string; avatarUrl?: string } | null;
}

function DemoBadge() {
  return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
      Demo
    </Badge>
  );
}

function StoryCard({ story, onClick }: { story: StorySummary; onClick?: () => void }) {
  const authorInitials = story.author_name
    ? story.author_name.split(' ').map(n => n[0]).join('')
    : '?';
  const formattedDate = new Date(story.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Card
      className="p-8 space-y-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <h3 className="text-neutral-900">{story.title}</h3>
          {story.content_preview && (
            <p className="text-neutral-600 text-sm line-clamp-2 mt-2">{story.content_preview}</p>
          )}
          <div className="flex items-center gap-3 text-sm text-neutral-500 mt-3">
            <div className="flex items-center gap-2">
              <Avatar className="size-6">
                <AvatarFallback className="text-xs">{authorInitials}</AvatarFallback>
              </Avatar>
              <span>{story.author_name || 'Anonymous'}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Calendar className="size-3" />
              <span>{formattedDate}</span>
            </div>
            {story.visibility !== 'public' && (
              <>
                <span>•</span>
                <Badge variant="outline" className="text-xs">
                  {story.visibility === 'private' ? 'Members only' : 'Personal'}
                </Badge>
              </>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm">
          <Heart className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

export default function LegacyProfile({ legacyId, onNavigate, currentTheme, onThemeChange, user }: LegacyProfileProps) {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<'stories' | 'media' | 'ai'>('stories');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Use fallback hooks that try private endpoint first, then fall back to public
  const legacyQuery = useLegacyWithFallback(legacyId, !!user);
  const storiesQuery = useStoriesWithFallback(legacyId, !!user);
  const deleteLegacy = useDeleteLegacy();

  const legacy = legacyQuery.data;
  const legacyLoading = legacyQuery.isLoading;
  const legacyError = legacyQuery.error;
  const stories = storiesQuery.data;
  const storiesLoading = storiesQuery.isLoading;
  const storiesError = storiesQuery.error;

  const _theme = getThemeClasses(currentTheme);

  // Check if current user is the creator of the legacy
  const _isCreator = user && legacy?.created_by === legacy?.members?.find(m => m.email === user.email)?.user_id;

  const handleAddStory = () => {
    navigate(`/legacy/${legacyId}/story/new`);
  };

  const handleDeleteLegacy = async () => {
    try {
      await deleteLegacy.mutateAsync(legacyId);
      navigate('/my-legacies');
    } catch (error) {
      console.error('Failed to delete legacy:', error);
    }
  };

  if (legacyLoading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--theme-background))] flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[rgb(var(--theme-primary))]" />
      </div>
    );
  }

  if (legacyError || !legacy) {
    return (
      <div className="min-h-screen bg-[rgb(var(--theme-background))] flex items-center justify-center p-6">
        <Card className="p-6 border-red-200 bg-red-50 max-w-md">
          <div className="flex items-center gap-3 text-red-800">
            <AlertCircle className="size-5" />
            <div>
              <p className="font-medium">Failed to load legacy</p>
              <p className="text-sm text-red-600">The legacy could not be found or an error occurred.</p>
            </div>
          </div>
          <Button className="mt-4" onClick={() => navigate('/my-legacies')}>
            Back to My Legacies
          </Button>
        </Card>
      </div>
    );
  }

  const dates = formatLegacyDates(legacy);
  const memberCount = legacy.members?.length || 0;
  const storyCount = stories?.length || 0;

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/my-legacies')}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to my legacies</span>
            </button>
            <div className="flex items-center gap-3">
              <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
              <Button variant="ghost" size="sm">
                <Share2 className="size-4" />
              </Button>
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/legacy/${legacyId}/edit`)}>
                      <Pencil className="size-4" />
                      Edit Legacy
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="size-4" />
                      Delete Legacy
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button size="sm" onClick={handleAddStory} className="bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]">
                <Plus className="size-4 mr-2" />
                Add Story
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Profile Header */}
      <section className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-start gap-8">
            <div className="size-32 rounded-2xl overflow-hidden bg-neutral-100 flex-shrink-0">
              {legacy.profile_image_url ? (
                <img
                  src={rewriteBackendUrlForDev(legacy.profile_image_url)}
                  alt={legacy.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Users className="size-12 text-neutral-400" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-neutral-900">{legacy.name}</h1>
                  <Badge variant="outline" className="bg-[rgb(var(--theme-accent-light))] text-[rgb(var(--theme-primary-dark))] border-[rgb(var(--theme-accent))]">
                    <Lock className="size-3 mr-1" />
                    Private
                  </Badge>
                </div>
                {dates && <p className="text-neutral-600">{dates}</p>}
                {legacy.biography && <p className="text-neutral-700 max-w-2xl">{legacy.biography}</p>}
              </div>

              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2 text-neutral-600">
                  <MessageSquare className="size-4" />
                  <span>{storyCount} {storyCount === 1 ? 'story' : 'stories'}</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-600">
                  <Users className="size-4" />
                  <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                </div>
                {legacy.creator_name && (
                  <div className="text-neutral-500">
                    Created by {legacy.creator_name}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Navigation */}
      <nav className="bg-white/90 backdrop-blur-sm border-b sticky top-[73px] z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveSection('stories')}
              className={`py-4 border-b-2 transition-colors ${
                activeSection === 'stories'
                  ? 'border-[rgb(var(--theme-primary))] text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Stories
            </button>
            <button
              onClick={() => setActiveSection('media')}
              className={`py-4 border-b-2 transition-colors ${
                activeSection === 'media'
                  ? 'border-[rgb(var(--theme-primary))] text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Media Gallery
            </button>
            <button
              onClick={() => setActiveSection('ai')}
              className={`py-4 border-b-2 transition-colors flex items-center gap-2 ${
                activeSection === 'ai'
                  ? 'border-[rgb(var(--theme-primary))] text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Sparkles className="size-4" />
              AI Interactions
              <DemoBadge />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {activeSection === 'stories' && (
          <div className="max-w-3xl space-y-6">
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

            {!storiesLoading && !storiesError && stories?.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                onClick={() => navigate(`/legacy/${legacyId}/story/${story.id}`)}
              />
            ))}

            {!storiesLoading && !storiesError && stories?.length === 0 && (
              <Card className="p-8 text-center text-neutral-500">
                <MessageSquare className="size-12 mx-auto text-neutral-300 mb-4" />
                <p>No stories yet.</p>
                <p className="text-sm mt-1">Be the first to add a story to this legacy.</p>
              </Card>
            )}

            <Card
              className="p-8 border-dashed hover:border-[rgb(var(--theme-accent))] hover:bg-[rgb(var(--theme-accent-light))]/30 transition-colors cursor-pointer"
              onClick={handleAddStory}
            >
              <div className="text-center space-y-3">
                <div className="size-12 rounded-full bg-[rgb(var(--theme-accent-light))] flex items-center justify-center mx-auto">
                  <Plus className="size-6 text-[rgb(var(--theme-primary))]" />
                </div>
                <div>
                  <p className="text-neutral-900">Add a new story</p>
                  <p className="text-sm text-neutral-500">Share a memory or moment</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeSection === 'media' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-neutral-900">Photo Gallery</h2>
            </div>

            {user && (
              <MediaUploader legacyId={legacyId} />
            )}

            <MediaGalleryInline
              legacyId={legacyId}
              profileImageId={legacy.profile_image_id}
              canEdit={!!user}
            />
          </div>
        )}

        {activeSection === 'ai' && (
          <div className="max-w-3xl space-y-6">
            <Card className="p-8 space-y-4 bg-gradient-to-br from-[rgb(var(--theme-gradient-from))] to-[rgb(var(--theme-gradient-to))] border-[rgb(var(--theme-accent))]">
              <div className="flex items-start gap-4">
                <div className="size-12 rounded-full bg-[rgb(var(--theme-primary))] flex items-center justify-center flex-shrink-0">
                  <Sparkles className="size-6 text-white" />
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-neutral-900">AI-Powered Interactions</h3>
                    <DemoBadge />
                  </div>
                  <p className="text-neutral-600">
                    Explore different ways to interact with and preserve {legacy.name}'s legacy through AI assistants
                  </p>
                </div>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card
                className="p-6 space-y-4 cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => navigate(`/legacy/${legacyId}/ai-chat`)}
              >
                <div className="flex items-start justify-between">
                  <div className="size-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <MessageSquare className="size-6 text-blue-600" />
                  </div>
                  <ArrowLeft className="size-4 text-neutral-400 group-hover:text-neutral-900 transition-colors rotate-180" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-neutral-900">Chat Interface</h3>
                    <DemoBadge />
                  </div>
                  <p className="text-sm text-neutral-600">
                    Conversational AI agents that help you explore stories, ask questions, and preserve memories
                  </p>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  Interactive
                </Badge>
              </Card>

              <Card
                className="p-6 space-y-4 cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => onNavigate('ai-panel')}
              >
                <div className="flex items-start justify-between">
                  <div className="size-12 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Users className="size-6 text-purple-600" />
                  </div>
                  <ArrowLeft className="size-4 text-neutral-400 group-hover:text-neutral-900 transition-colors rotate-180" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-neutral-900">Agent Panel</h3>
                    <DemoBadge />
                  </div>
                  <p className="text-sm text-neutral-600">
                    Browse and select from specialized AI agents, each with unique perspectives and expertise
                  </p>
                </div>
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  Curated
                </Badge>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Legacy</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{legacy?.name}"? This action cannot be undone.
              All stories and media associated with this legacy will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteLegacy.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteLegacy}
              disabled={deleteLegacy.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLegacy.isPending ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="size-4 mr-2" />
                  Delete Legacy
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
