import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Globe, Users, Lock, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import VersionHistoryDrawer from './VersionHistoryDrawer';
import StoryToolbar from './StoryToolbar';
import StoryViewer from './StoryViewer';
import DeleteStoryDialog from './DeleteStoryDialog';
import EvolutionResumeBanner from './EvolutionResumeBanner';
import { useLegacy } from '@/features/legacy/hooks/useLegacies';
import { useStory, useDeleteStory, storyKeys } from '@/features/story/hooks/useStories';
import {
  useVersions,
  useVersionDetail,
  useRestoreVersion,
  useApproveDraft,
  useDiscardDraft,
} from '@/features/story/hooks/useVersions';
import { useActiveEvolution, evolutionKeys } from '@/lib/hooks/useEvolution';
import { discardActiveEvolution } from '@/lib/api/evolution';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/seo';

interface StoryCreationProps {
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

export default function StoryCreation({ legacyId, storyId }: StoryCreationProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'personal'>('private');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [previewVersionNumber, setPreviewVersionNumber] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const queryClient = useQueryClient();
  const [isDiscardingEvolution, setIsDiscardingEvolution] = useState(false);

  const { data: legacy, isLoading: _legacyLoading } = useLegacy(legacyId);
  const { data: existingStory, isLoading: storyLoading } = useStory(storyId);
  const { data: activeEvolution, isSuccess: hasEvolutionData } = useActiveEvolution(storyId, !!storyId);
  const deleteStory = useDeleteStory();
  const isEditMode = !!storyId;

  // Version history (only fetch when drawer is open)
  const isAuthor = useMemo(() => {
    if (!existingStory || !user) return false;

    if (existingStory.author_id === user.id) return true;

    return normalizeEmail(existingStory.author_email) === normalizeEmail(user.email);
  }, [existingStory, user]);

  const showHistory = isAuthor && (existingStory?.version_count ?? 0) > 1;
  const versionsQuery = useVersions(storyId ?? '', isHistoryOpen && !!storyId);
  const versionDetailQuery = useVersionDetail(storyId ?? '', previewVersionNumber);
  const restoreVersionMutation = useRestoreVersion(storyId ?? '');
  const approveDraftMutation = useApproveDraft(storyId ?? '');
  const discardDraftMutation = useDiscardDraft(storyId ?? '');

  // When previewing a version, use its content instead of the story's
  const previewData = versionDetailQuery.data;
  const displayTitle = previewData ? previewData.title : title;
  const displayContent = previewData ? previewData.content : content;
  const isPreviewing = previewVersionNumber !== null && previewData !== undefined;
  const isPreviewActive = previewData?.status === 'active';

  // Check if user can edit this story (author-only)
  const canEdit = useMemo(() => {
    return !!existingStory && !!user && isAuthor;
  }, [existingStory, user, isAuthor]);

  const hasActiveEvolution = hasEvolutionData && !!activeEvolution
    && !['completed', 'discarded'].includes(activeEvolution.phase);

  // Guard: if no storyId, redirect to legacy page (creation now goes through evolve)
  useEffect(() => {
    if (!storyId) {
      navigate(`/legacy/${legacyId}`, { replace: true });
    }
  }, [storyId, legacyId, navigate]);

  // Populate form with existing story data when editing
  useEffect(() => {
    if (existingStory) {
      setTitle(existingStory.title);
      setContent(existingStory.content);
      setVisibility(existingStory.visibility);
    }
  }, [existingStory]);

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

  const handleDiscardEvolution = async () => {
    if (!storyId) return;
    setIsDiscardingEvolution(true);
    try {
      await discardActiveEvolution(storyId);
    } catch (err) {
      console.error('Failed to discard evolution session:', err);
    } finally {
      queryClient.setQueryData(evolutionKeys.active(storyId), null);
      queryClient.removeQueries({ queryKey: evolutionKeys.active(storyId) });
      await queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
      setIsDiscardingEvolution(false);
    }
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

  // Show loading state while fetching existing story
  if (isEditMode && storyLoading) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-theme-primary" />
      </div>
    );
  }

  // If no storyId, render nothing (redirect effect will fire)
  if (!storyId) {
    return null;
  }

  const visibilityInfo = VISIBILITY_MAP[visibility];

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
        title={existingStory?.title ?? 'Story'}
        description="View this story"
        noIndex={true}
      />
      <StoryToolbar
        legacyId={legacyId}
        legacyName={legacyName}
        isEditMode={isEditMode}
        canEdit={canEdit}
        showHistory={showHistory}
        versionCount={existingStory?.version_count ?? null}
        hasActiveEvolution={hasActiveEvolution}
        canDelete={canEdit}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onEvolve={handleNavigateToEvolve}
        onDelete={() => setShowDeleteDialog(true)}
      />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Evolution resume banner */}
          {hasActiveEvolution && (
            <EvolutionResumeBanner
              onContinue={handleNavigateToEvolve}
              onDiscard={handleDiscardEvolution}
              isDiscarding={isDiscardingEvolution}
            />
          )}

          {/* Draft story CTA */}
          {existingStory?.status === 'draft' && (
            <Card className="border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-sm text-amber-800 mb-2">This story is still a draft.</p>
              <Button size="sm" onClick={handleNavigateToEvolve}>
                <Sparkles className="size-4 mr-2" />
                Continue in Workspace
              </Button>
            </Card>
          )}

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
          />
        </div>
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
