import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Globe, Users, Lock } from 'lucide-react';
import VersionHistoryDrawer from './VersionHistoryDrawer';
import StoryToolbar from './StoryToolbar';
import StoryViewer from './StoryViewer';
import DeleteStoryDialog from './DeleteStoryDialog';
import { useLegacy } from '@/features/legacy/hooks/useLegacies';
import { useStory, useDeleteStory } from '@/features/story/hooks/useStories';
import {
  useVersions,
  useVersionDetail,
  useRestoreVersion,
  useApproveDraft,
  useDiscardDraft,
} from '@/features/story/hooks/useVersions';
import { useActiveEvolution } from '@/lib/hooks/useEvolution';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/seo';
import { getStoryDisplayTitle } from '@/features/story/utils/displayTitle';
import ReactionsRow from '@/features/story-responses/components/ReactionsRow';
import ResponsesSection from '@/features/story-responses/components/ResponsesSection';
import StoryBacklinks from './StoryBacklinks';

interface StoryReadPageProps {
  legacyId: string;
  storyId?: string;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

const VISIBILITY_MAP = {
  public: { icon: Globe, label: 'Public', description: 'Anyone can read this story' },
  private: { icon: Users, label: 'Members Only', description: 'Only legacy members can read this story' },
  personal: { icon: Lock, label: 'Personal', description: 'Only you can see this story' },
} as const;

export default function StoryReadPage({ legacyId, storyId }: StoryReadPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [previewVersionNumber, setPreviewVersionNumber] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: legacy } = useLegacy(legacyId);
  const { data: existingStory, isLoading: storyLoading } = useStory(storyId);
  const { data: activeEvolution, isSuccess: hasEvolutionData } = useActiveEvolution(storyId, !!storyId);
  const deleteStory = useDeleteStory();

  const isAuthor = useMemo(() => {
    if (!existingStory || !user) return false;

    if (existingStory.author_id === user.id) return true;

    return normalizeEmail(existingStory.author_email) === normalizeEmail(user.email);
  }, [existingStory, user]);

  const canEdit = !!existingStory && !!user && isAuthor;
  const showHistory = isAuthor && (existingStory?.version_count ?? 0) > 1;

  // Responses/reactions are gated to legacy members (any non-pending role) or
  // the story's author — see `require_legacy_member_or_story_author` in
  // services/core-api/app/services/story_response.py. `legacy.current_user_role`
  // (from useLegacy above) is how the rest of this codebase already surfaces a
  // viewer's role for the legacy this page is scoped to (see e.g.
  // features/members/components/InviteMemberModal's `currentUserRole` prop,
  // features/legacy/components/LegacyEdit.tsx's `isCreator` check).
  const legacyRole = legacy?.current_user_role;
  const canRespondOrReact = isAuthor || !!legacyRole;
  // Delete affordance for *other* members' responses is limited to legacy
  // creator/admin (advocate/admirer excluded) — mirrors
  // `DELETE_ADMIN_ROLES` in services/core-api/app/services/story_response.py.
  const canModerateResponses = legacyRole === 'creator' || legacyRole === 'admin';
  const versionsQuery = useVersions(storyId ?? '', isHistoryOpen && !!storyId);
  const versionDetailQuery = useVersionDetail(storyId ?? '', previewVersionNumber);
  const restoreVersionMutation = useRestoreVersion(storyId ?? '');
  const approveDraftMutation = useApproveDraft(storyId ?? '');
  const discardDraftMutation = useDiscardDraft(storyId ?? '');

  // When previewing a version, use its content instead of the story's
  const previewData = versionDetailQuery.data;
  const displayTitle = previewData
    ? getStoryDisplayTitle(previewData.title, previewData.created_at)
    : existingStory
      ? getStoryDisplayTitle(existingStory.title, existingStory.created_at)
      : '';
  const displayContent = previewData ? previewData.content : (existingStory?.content ?? '');
  const isPreviewing = previewVersionNumber !== null && previewData !== undefined;
  const isPreviewActive = previewData?.status === 'active';

  const hasActiveEvolution = hasEvolutionData && !!activeEvolution
    && !['completed', 'discarded'].includes(activeEvolution.phase);

  const handleSelectVersion = (versionNumber: number) => {
    setPreviewVersionNumber(versionNumber);
  };

  const handleRestore = () => {
    if (previewVersionNumber === null) return;
    restoreVersionMutation.mutate(previewVersionNumber, {
      onSuccess: () => {
        setPreviewVersionNumber(null);
      },
    });
  };

  const handleApproveDraft = () => {
    approveDraftMutation.mutate(undefined, {
      onSuccess: () => {
        setPreviewVersionNumber(null);
      },
    });
  };

  const handleDiscardDraft = () => {
    discardDraftMutation.mutate(undefined, {
      onSuccess: () => {
        setPreviewVersionNumber(null);
      },
    });
  };

  const handleNavigateToEvolve = () => {
    navigate(`/legacy/${legacyId}/story/${storyId}/evolve`);
  };

  const handleEdit = () => {
    navigate(`/legacy/${legacyId}/story/${storyId}/edit`);
  };

  const handleDeleteStory = async () => {
    if (!storyId) return;
    try {
      await deleteStory.mutateAsync({ storyId });
      navigate(`/legacy/${legacyId}`);
    } catch (error) {
      console.error('Failed to delete story:', error);
    }
  };

  const legacyName = legacy?.name || 'Legacy';

  // Show loading state while fetching the story
  if (!storyId || storyLoading) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-theme-primary" />
      </div>
    );
  }

  const visibilityInfo = VISIBILITY_MAP[existingStory?.visibility ?? 'private'];
  const displayableTitle = existingStory
    ? getStoryDisplayTitle(existingStory.title, existingStory.created_at)
    : 'Story';

  const associatedLegaciesLabel = existingStory?.legacies?.length
    ? existingStory.legacies
      .map((legacy) => legacy.role === 'primary'
        ? `${legacy.legacy_name} (primary)`
        : legacy.legacy_name)
      .join(' · ')
    : null;

  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300">
      <SEOHead
        title={displayableTitle}
        description="View this story"
        noIndex={true}
      />
      <StoryToolbar
        legacyId={legacyId}
        legacyName={legacyName}
        storyTitle={displayableTitle}
        canEdit={canEdit}
        showHistory={showHistory}
        versionCount={existingStory?.version_count ?? null}
        canDelete={canEdit}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onEdit={handleEdit}
        onEvolve={handleNavigateToEvolve}
        onDelete={() => setShowDeleteDialog(true)}
      />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <StoryViewer
          displayTitle={displayTitle}
          displayContent={displayContent}
          visibilityIcon={visibilityInfo.icon}
          visibilityLabel={visibilityInfo.label}
          authorName={existingStory?.author_name}
          createdAt={existingStory?.created_at}
          associatedLegaciesLabel={associatedLegaciesLabel}
          isPreviewing={isPreviewing}
          previewData={previewData}
          isPreviewActive={isPreviewActive}
          onRestore={handleRestore}
          isRestoring={restoreVersionMutation.isPending}
          hasActiveEvolution={!!hasActiveEvolution}
          onResumeDraft={handleNavigateToEvolve}
        />

        {!isPreviewing && existingStory && (
          <StoryBacklinks
            sourceStory={existingStory.source_story}
            grownStories={existingStory.grown_from_responses}
          />
        )}

        {!isPreviewing && existingStory && (
          <div className="mt-8">
            <ReactionsRow
              storyId={existingStory.id}
              canReact={canRespondOrReact}
              counts={{
                heart: existingStory.reaction_heart_count ?? 0,
                candle: existingStory.reaction_candle_count ?? 0,
                smile: existingStory.reaction_smile_count ?? 0,
              }}
              myReactions={existingStory.my_reactions ?? []}
            />
          </div>
        )}

        {!isPreviewing && existingStory && canRespondOrReact && (
          <ResponsesSection
            storyId={existingStory.id}
            legacyId={legacyId}
            sourceStoryId={existingStory.id}
            currentUserId={user?.id}
            canModerate={canModerateResponses}
            isStoryAuthor={isAuthor}
            responseCount={existingStory.response_count}
          />
        )}
      </main>

      {/* Delete Story Dialog */}
      {canEdit && storyId && (
        <DeleteStoryDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          storyTitle={existingStory?.title ?? ''}
          versionCount={existingStory?.version_count ?? 1}
          isPending={deleteStory.isPending}
          onConfirm={handleDeleteStory}
        />
      )}

      {/* Version History Drawer */}
      {showHistory && storyId && (
        <VersionHistoryDrawer
          open={isHistoryOpen}
          onOpenChange={setIsHistoryOpen}
          data={versionsQuery.data}
          isLoading={versionsQuery.isLoading}
          selectedVersion={previewVersionNumber}
          onSelectVersion={handleSelectVersion}
          onApproveDraft={handleApproveDraft}
          onDiscardDraft={handleDiscardDraft}
          isDraftActionPending={
            approveDraftMutation.isPending || discardDraftMutation.isPending
          }
        />
      )}
    </div>
  );
}
