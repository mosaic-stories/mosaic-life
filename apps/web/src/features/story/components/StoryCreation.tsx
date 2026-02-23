import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Globe, Users, Lock, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import VersionHistoryDrawer from './VersionHistoryDrawer';
import StoryToolbar from './StoryToolbar';
import StoryViewer from './StoryViewer';
import StoryEditForm from './StoryEditForm';
import DeleteStoryDialog from './DeleteStoryDialog';
import EvolutionResumeBanner from './EvolutionResumeBanner';
import { useLegacy } from '@/features/legacy/hooks/useLegacies';
import { useStory, useCreateStory, useUpdateStory, useDeleteStory } from '@/features/story/hooks/useStories';
import {
  useVersions,
  useVersionDetail,
  useRestoreVersion,
  useApproveDraft,
  useDiscardDraft,
} from '@/features/story/hooks/useVersions';
import type { LegacyAssociationInput } from '@/features/story/api/stories';
import { useActiveEvolution } from '@/lib/hooks/useEvolution';
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isViewMode, setIsViewMode] = useState(true);
  const [selectedLegacies, setSelectedLegacies] = useState<LegacyAssociationInput[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [previewVersionNumber, setPreviewVersionNumber] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: legacy, isLoading: _legacyLoading } = useLegacy(legacyId);
  const { data: existingStory, isLoading: storyLoading } = useStory(storyId);
  const { data: activeEvolution } = useActiveEvolution(storyId, !!storyId);
  const createStory = useCreateStory();
  const updateStory = useUpdateStory();
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

  const hasActiveEvolution = !!activeEvolution
    && !['completed', 'discarded'].includes(activeEvolution.phase);

  // For new stories, start in edit mode
  useEffect(() => {
    if (!storyId) {
      setIsViewMode(false);
    }
  }, [storyId]);

  // Populate form with existing story data when editing
  useEffect(() => {
    if (existingStory) {
      setTitle(existingStory.title);
      setContent(existingStory.content);
      setVisibility(existingStory.visibility);
      setSelectedLegacies(
        existingStory.legacies.map((legacy, index) => ({
          legacy_id: legacy.legacy_id,
          role: legacy.role,
          position: legacy.position ?? index,
        }))
      );
    }
  }, [existingStory]);

  useEffect(() => {
    if (isEditMode) return;

    setSelectedLegacies((current) => {
      if (current.some((legacy) => legacy.legacy_id === legacyId)) {
        return current;
      }

      const next = [...current];
      if (next.length === 0) {
        next.push({ legacy_id: legacyId, role: 'primary', position: 0 });
      } else {
        next.push({ legacy_id: legacyId, role: 'secondary', position: next.length });
      }

      return next.map((legacy, index) => ({
        ...legacy,
        position: index,
      }));
    });
  }, [isEditMode, legacyId]);

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) {
      setSubmitError('Please add a title and content for your story.');
      return;
    }

    if (selectedLegacies.length === 0) {
      setSubmitError('Please select at least one legacy for this story.');
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
            legacies: selectedLegacies.map((legacy, index) => ({
              legacy_id: legacy.legacy_id,
              role: legacy.role,
              position: index,
            })),
          },
        });
      } else {
        await createStory.mutateAsync({
          legacies: selectedLegacies.map((legacy, index) => ({
            legacy_id: legacy.legacy_id,
            role: legacy.role,
            position: index,
          })),
          title: title.trim(),
          content: content.trim(),
          visibility,
        });
      }

      // Navigate back to the legacy profile on success
      const primaryLegacyId = selectedLegacies.find((legacy) => legacy.role === 'primary')?.legacy_id
        ?? selectedLegacies[0]?.legacy_id
        ?? legacyId;

      navigate(`/legacy/${primaryLegacyId}`);
    } catch (error) {
      setSubmitError(isEditMode ? 'Failed to update story. Please try again.' : 'Failed to publish story. Please try again.');
    }
  };

  const handleBack = () => {
    navigate(`/legacy/${legacyId}`);
  };

  const handleEditClick = () => {
    setIsViewMode(false);
  };

  const handleCancelEdit = () => {
    // Reset to original values and switch back to view mode
    if (existingStory) {
      setTitle(existingStory.title);
      setContent(existingStory.content);
      setVisibility(existingStory.visibility);
    }
    setIsViewMode(true);
  };

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
  const isMutating = createStory.isPending || updateStory.isPending;

  // Show loading state while fetching existing story in edit mode
  if (isEditMode && storyLoading) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-theme-primary" />
      </div>
    );
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
        title={isEditMode ? "Edit Story" : "Create Story"}
        description="Create or edit a story for this legacy"
        noIndex={true}
      />
      <StoryToolbar
        legacyName={legacyName}
        isViewMode={isViewMode}
        isEditMode={isEditMode}
        canEdit={canEdit}
        showHistory={showHistory}
        versionCount={existingStory?.version_count ?? null}
        isMutating={isMutating}
        titleEmpty={!title.trim()}
        contentEmpty={!content.trim()}
        hasActiveEvolution={hasActiveEvolution}
        canDelete={canEdit}
        onBack={handleBack}
        onEditClick={handleEditClick}
        onCancelEdit={handleCancelEdit}
        onPublish={handlePublish}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onEvolve={handleNavigateToEvolve}
        onDelete={() => setShowDeleteDialog(true)}
      />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Evolution resume banner */}
          {hasActiveEvolution && (
            <EvolutionResumeBanner onContinue={handleNavigateToEvolve} />
          )}

          {/* Error Message */}
          {submitError && (
            <Card className="p-4 border-red-200 bg-red-50">
              <div className="flex items-center gap-3 text-red-800">
                <AlertCircle className="size-5" />
                <p>{submitError}</p>
              </div>
            </Card>
          )}

          {isViewMode && isEditMode ? (
            <StoryViewer
              displayTitle={displayTitle}
              displayContent={displayContent}
              visibilityIcon={visibilityInfo.icon}
              visibilityLabel={visibilityInfo.label}
              authorName={existingStory?.author_name}
              createdAt={existingStory?.created_at}
              associatedLegaciesLabel={associatedLegaciesLabel}
              canEdit={canEdit}
              onEditClick={handleEditClick}
              isPreviewing={isPreviewing}
              previewData={previewData}
              isPreviewActive={isPreviewActive}
              onRestore={handleRestore}
              isRestoring={restoreVersionMutation.isPending}
            />
          ) : (
            <StoryEditForm
              title={title}
              onTitleChange={setTitle}
              content={content}
              onContentChange={setContent}
              visibility={visibility}
              onVisibilityChange={setVisibility}
              selectedLegacies={selectedLegacies}
              onLegaciesChange={setSelectedLegacies}
              isMutating={isMutating}
              legacyId={legacyId}
            />
          )}
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
