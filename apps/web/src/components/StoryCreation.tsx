import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, AlertCircle, Pencil, Eye, Globe, Users, Lock } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import LegacyMultiSelect from './LegacyMultiSelect';
import VersionHistoryButton from './VersionHistoryButton';
import VersionHistoryDrawer from './VersionHistoryDrawer';
import VersionPreviewBanner from './VersionPreviewBanner';
import { getThemeClasses } from '../lib/themes';
import { useLegacy } from '@/lib/hooks/useLegacies';
import { useStory, useCreateStory, useUpdateStory } from '@/lib/hooks/useStories';
import {
  useVersions,
  useVersionDetail,
  useRestoreVersion,
  useApproveDraft,
  useDiscardDraft,
} from '@/lib/hooks/useVersions';
import type { LegacyAssociationInput } from '@/lib/api/stories';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/seo';
import { HeaderSlot } from '@/components/header';

interface StoryCreationProps {
  onNavigate: (view: string) => void;
  legacyId: string;
  storyId?: string;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export default function StoryCreation({ onNavigate: _onNavigate, legacyId, storyId, currentTheme, onThemeChange: _onThemeChange }: StoryCreationProps) {
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

  const { data: legacy, isLoading: _legacyLoading } = useLegacy(legacyId);
  const { data: existingStory, isLoading: storyLoading } = useStory(storyId);
  const createStory = useCreateStory();
  const updateStory = useUpdateStory();
  const _theme = getThemeClasses(currentTheme);

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

  // Get visibility icon and label
  const getVisibilityInfo = (vis: 'public' | 'private' | 'personal') => {
    switch (vis) {
      case 'public':
        return { icon: Globe, label: 'Public', description: 'Anyone can read this story' };
      case 'private':
        return { icon: Users, label: 'Members Only', description: 'Only legacy members can read this story' };
      case 'personal':
        return { icon: Lock, label: 'Personal', description: 'Only you can see this story' };
    }
  };

  const visibilityInfo = getVisibilityInfo(visibility);
  const VisibilityIcon = visibilityInfo.icon;
  const associatedLegaciesLabel = existingStory?.legacies?.length
    ? existingStory.legacies
      .map((legacy) => legacy.role === 'primary'
        ? `${legacy.legacy_name} (primary)`
        : legacy.legacy_name)
      .join(' · ')
    : null;

  return (
    <div className="min-h-screen bg-[rgb(var(--theme-background))] transition-colors duration-300">
      <SEOHead
        title={isEditMode ? "Edit Story" : "Create Story"}
        description="Create or edit a story for this legacy"
        noIndex={true}
      />
      <HeaderSlot>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span>Back to {legacyName}</span>
          </button>

          {isViewMode && isEditMode ? (
            <>
              {canEdit && (
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={handleEditClick}
                >
                  <Pencil className="size-4" />
                  Edit Story
                </Button>
              )}
              {showHistory && (
                <VersionHistoryButton
                  versionCount={existingStory?.version_count ?? null}
                  onClick={() => setIsHistoryOpen(true)}
                />
              )}
            </>
          ) : (
            <>
              {isEditMode && (
                <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                  Cancel
                </Button>
              )}
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
            </>
          )}
        </div>
      </HeaderSlot>

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

          {isViewMode && isEditMode ? (
            // Read-only View Mode
            <div className="space-y-8">
              {/* Version Preview Banner */}
              {isPreviewing && previewData && (
                <VersionPreviewBanner
                  versionNumber={previewData.version_number}
                  source={previewData.source}
                  createdAt={previewData.created_at}
                  isActive={isPreviewActive}
                  onRestore={handleRestore}
                  isRestoring={restoreVersionMutation.isPending}
                />
              )}

              {/* Story Header */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <VisibilityIcon className="size-4" />
                  <span>{visibilityInfo.label}</span>
                  <span className="mx-2">|</span>
                  <span>{existingStory?.author_name}</span>
                  {existingStory && (
                    <>
                      <span className="mx-2">|</span>
                      <span>
                        {new Date(existingStory.created_at).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </>
                  )}
                </div>
                {associatedLegaciesLabel && (
                  <p className="text-sm text-neutral-600">
                    About: {associatedLegaciesLabel}
                  </p>
                )}
                <h1 className="text-3xl font-semibold text-neutral-900">{displayTitle}</h1>
              </div>

              {/* Story Content */}
              <Card className="p-8 bg-white">
                <div className="prose prose-neutral max-w-none">
                  {/* Render content - for now as plain text with line breaks preserved */}
                  <div className="whitespace-pre-wrap text-neutral-800 leading-relaxed">
                    {displayContent}
                  </div>
                </div>
              </Card>

              {/* View mode info */}
              {canEdit && (
                <div className="flex items-center justify-center gap-2 text-sm text-neutral-500">
                  <Eye className="size-4" />
                  <span>Viewing mode</span>
                  <span className="mx-1">-</span>
                  <button
                    onClick={handleEditClick}
                    className="text-[rgb(var(--theme-primary))] hover:underline"
                  >
                    Click to edit
                  </button>
                </div>
              )}
            </div>
          ) : (
            // Edit Mode
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm text-neutral-600">Legacies *</label>
                <LegacyMultiSelect
                  value={selectedLegacies}
                  onChange={setSelectedLegacies}
                  requirePrimary={true}
                  disabled={isMutating}
                />
                <p className="text-xs text-neutral-500">
                  Select one or more legacies and mark one as primary.
                </p>
              </div>

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
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Start writing your story here... Use Markdown for formatting."
                    className="w-full min-h-[400px] p-6 rounded-lg border border-neutral-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-100 outline-none resize-none bg-white font-mono text-sm"
                  />
                </div>
                <p className="text-sm text-neutral-500">{content.length} characters</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Version History Drawer */}
      {showHistory && storyId && (
        <VersionHistoryDrawer
          open={isHistoryOpen}
          onOpenChange={(open) => {
            setIsHistoryOpen(open);
            if (!open) setPreviewVersionNumber(null);
          }}
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
