import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Loader2, Share2, MoreVertical, Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import PageActionBar from '@/components/PageActionBar';
import { useLegacyWithFallback, useDeleteLegacy } from '@/features/legacy/hooks/useLegacies';
import { useStoriesWithFallback, useCreateStory } from '@/features/story/hooks/useStories';
import { formatLegacyDates } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import MemberDrawer from '@/features/members/components/MemberDrawer';
import MyRelationshipSection from '@/features/members/components/MyRelationshipSection';
import { SEOHead, getLegacySchema } from '@/components/seo';
import type { LegacySchemaInput } from '@/components/seo';
import { useAuth } from '@/contexts/AuthContext';
import ProfileHeader from './ProfileHeader';
import SectionNav from './SectionNav';
import type { SectionId } from './SectionNav';
import StoriesSection from './StoriesSection';
import MediaSection from './MediaSection';
import AISection from './AISection';
import DeleteLegacyDialog from './DeleteLegacyDialog';
import LegacyLinkPanel from '@/features/legacy-link/components/LegacyLinkPanel';

type PromptSeedMode = 'story_prompt' | undefined;

interface LegacyProfileProps {
  legacyId: string;
}

export default function LegacyProfile({ legacyId }: LegacyProfileProps) {
  const { user: authUser } = useAuth();
  const user = useMemo(() => {
    return authUser ? { name: authUser.name || authUser.email, email: authUser.email, avatarUrl: authUser.avatar_url } : null;
  }, [authUser]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as SectionId | null;
  const conversationParam = searchParams.get('conversation') || undefined;
  const promptSeedMode: PromptSeedMode = searchParams.get('seed') === 'story_prompt'
    ? 'story_prompt'
    : undefined;
  const [activeSection, setActiveSection] = useState<SectionId>(tabParam || 'stories');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMemberDrawer, setShowMemberDrawer] = useState(false);

  // Use fallback hooks that try private endpoint first, then fall back to public
  const legacyQuery = useLegacyWithFallback(legacyId, !!user);
  const storiesQuery = useStoriesWithFallback(legacyId, !!user);
  const deleteLegacy = useDeleteLegacy();

  const createStory = useCreateStory();

  useEffect(() => {
    setActiveSection(tabParam || 'stories');
  }, [tabParam]);

  const legacy = legacyQuery.data;
  const legacyLoading = legacyQuery.isLoading;
  const legacyError = legacyQuery.error;
  const stories = storiesQuery.data;
  const storiesLoading = storiesQuery.isLoading;
  const storiesError = storiesQuery.error;

  // Find current user's membership and role
  const currentUserMember = useMemo(() => {
    if (!user || !legacy?.members) return null;
    return legacy.members.find(m => m.email === user.email);
  }, [user, legacy?.members]);

  const currentUserRole = currentUserMember?.role || 'admirer';
  const isMember = !!currentUserMember;

  // Check if current user is the creator of the legacy
  const _isCreator = currentUserRole === 'creator';

  const handleAddStory = useCallback(async () => {
    try {
      const title = `Untitled Story - ${new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
      const newStory = await createStory.mutateAsync({
        title,
        content: '',
        visibility: 'private',
        status: 'draft',
        legacies: [{ legacy_id: legacyId, role: 'primary', position: 0 }],
      });
      navigate(`/legacy/${legacyId}/story/${newStory.id}/evolve`);
    } catch (err) {
      console.error('Failed to create story:', err);
    }
  }, [legacyId, createStory, navigate]);

  const handleDeleteLegacy = async () => {
    try {
      await deleteLegacy.mutateAsync(legacyId);
      navigate('/legacies');
    } catch (error) {
      console.error('Failed to delete legacy:', error);
    }
  };

  // Generate SEO data
  const profileImageUrl = legacy?.profile_image_url
    ? rewriteBackendUrlForDev(legacy.profile_image_url)
    : undefined;

  const seoSchema: LegacySchemaInput | null = legacy ? {
    id: legacy.id,
    name: legacy.name,
    biography: legacy.biography,
    profileImageUrl: profileImageUrl,
    birthDate: legacy.birth_date,
    deathDate: legacy.death_date,
    createdAt: legacy.created_at,
    updatedAt: legacy.updated_at,
  } : null;

  if (legacyLoading) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-theme-primary" />
      </div>
    );
  }

  if (legacyError || !legacy) {
    // Check if this is a 404 error (not found or private)
    const is404 = legacyError && 'status' in legacyError && (legacyError as unknown as { status: number }).status === 404;

    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-4">
          <div className="size-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto">
            <Lock className="size-8 text-neutral-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-neutral-900">Legacy Not Found</h2>
            {is404 ? (
              <p className="text-sm text-neutral-600">
                This legacy doesn't exist or is private. If this is a private legacy, you may need to be invited by a member.
              </p>
            ) : (
              <p className="text-sm text-neutral-600">
                An error occurred while loading this legacy. Please try again.
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-center pt-2">
            <Button variant="outline" onClick={() => navigate('/')}>
              Go Home
            </Button>
            <Button onClick={() => navigate('/legacies')}>
              All Legacies
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const dates = formatLegacyDates(legacy);
  const memberCount = legacy.members?.length || 0;
  const storyCount = stories?.length || 0;

  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300">
      {legacy && seoSchema && (
        <SEOHead
          title={legacy.name}
          description={legacy.biography ?? undefined}
          path={`/legacy/${legacyId}`}
          ogImage={profileImageUrl}
          ogType="profile"
          structuredData={getLegacySchema(seoSchema)}
        />
      )}

      <PageActionBar backLabel="Legacies" backTo="/legacies">
        <Button variant="ghost" size="sm" onClick={() => setShowMemberDrawer(true)} aria-label="Share">
          <Share2 className="size-4" />
        </Button>
        {authUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Legacy options">
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
        {authUser && (
          <Button size="sm" onClick={handleAddStory} disabled={createStory.isPending} className="bg-theme-primary hover:bg-theme-primary-dark">
            {createStory.isPending ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Plus className="size-4 mr-2" />
            )}
            <span className="hidden sm:inline">Add Story</span>
          </Button>
        )}
      </PageActionBar>

      <ProfileHeader
        legacy={legacy}
        dates={dates}
        storyCount={storyCount}
        memberCount={memberCount}
        onMembersClick={() => setShowMemberDrawer(true)}
      />

      {isMember && (
        <MyRelationshipSection legacyId={legacyId} legacyName={legacy.name} />
      )}

      <SectionNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <main className="max-w-7xl mx-auto px-6 py-12">
        {activeSection === 'stories' && (
          <StoriesSection
            stories={stories}
            storiesLoading={storiesLoading}
            storiesError={storiesError}
            onStoryClick={(storyId) => navigate(`/legacy/${legacyId}/story/${storyId}`)}
            onAddStory={handleAddStory}
            isCreatingStory={createStory.isPending}
          />
        )}

        {activeSection === 'links' && (
          <LegacyLinkPanel
            legacyId={legacyId}
            personId={legacy.person_id}
            legacyName={legacy.name}
          />
        )}

        {activeSection === 'media' && (
          <MediaSection
            legacyId={legacyId}
            profileImageId={legacy.profile_image_id}
            isAuthenticated={!!user}
          />
        )}

        {activeSection === 'ai' && (
          <AISection
            legacyId={legacyId}
            initialConversationId={conversationParam}
            initialSeedMode={promptSeedMode}
          />
        )}
      </main>

      <DeleteLegacyDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        legacyName={legacy.name}
        isPending={deleteLegacy.isPending}
        onConfirm={handleDeleteLegacy}
      />

      <MemberDrawer
        legacyId={legacyId}
        isOpen={showMemberDrawer}
        onClose={() => setShowMemberDrawer(false)}
        currentUserRole={currentUserRole}
        visibility={legacy.visibility}
        isMember={isMember}
      />
    </div>
  );
}
