import { ArrowLeft, Loader2, Save, Pencil, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeaderSlot } from '@/components/header';
import VersionHistoryButton from './VersionHistoryButton';

interface StoryToolbarProps {
  legacyName: string;
  isViewMode: boolean;
  isEditMode: boolean;
  canEdit: boolean;
  showHistory: boolean;
  versionCount: number | null;
  isMutating: boolean;
  titleEmpty: boolean;
  contentEmpty: boolean;
  hasActiveEvolution: boolean;
  onBack: () => void;
  onEditClick: () => void;
  onCancelEdit: () => void;
  onPublish: () => void;
  onOpenHistory: () => void;
  onEvolve: () => void;
}

export default function StoryToolbar({
  legacyName,
  isViewMode,
  isEditMode,
  canEdit,
  showHistory,
  versionCount,
  isMutating,
  titleEmpty,
  contentEmpty,
  hasActiveEvolution,
  onBack,
  onEditClick,
  onCancelEdit,
  onPublish,
  onOpenHistory,
  onEvolve,
}: StoryToolbarProps) {
  return (
    <HeaderSlot>
      <button
        onClick={onBack}
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
              onClick={onEditClick}
            >
              <Pencil className="size-4" />
              Edit Story
            </Button>
          )}
          {showHistory && (
            <VersionHistoryButton
              versionCount={versionCount}
              onClick={onOpenHistory}
            />
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onEvolve}
            >
              <Sparkles className="size-4" />
              {hasActiveEvolution ? 'Continue Evolving' : 'Evolve Story'}
            </Button>
          )}
        </>
      ) : (
        <>
          {isEditMode && (
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              Cancel
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled>
            Save Draft
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={onPublish}
            disabled={isMutating || titleEmpty || contentEmpty}
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
    </HeaderSlot>
  );
}
