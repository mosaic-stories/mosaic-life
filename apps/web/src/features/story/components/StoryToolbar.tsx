import { ArrowLeft, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { HeaderSlot } from '@/components/header';
import VersionHistoryButton from './VersionHistoryButton';

interface StoryToolbarProps {
  legacyName: string;
  isEditMode: boolean;
  canEdit: boolean;
  showHistory: boolean;
  versionCount: number | null;
  hasActiveEvolution: boolean;
  canDelete: boolean;
  onBack: () => void;
  onOpenHistory: () => void;
  onEvolve: () => void;
  onDelete: () => void;
}

export default function StoryToolbar({
  legacyName,
  isEditMode,
  canEdit,
  showHistory,
  versionCount,
  hasActiveEvolution,
  canDelete,
  onBack,
  onOpenHistory,
  onEvolve,
  onDelete,
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

      {isEditMode && (
        <>
          {showHistory && (
            <VersionHistoryButton
              versionCount={versionCount}
              onClick={onOpenHistory}
            />
          )}
          {canEdit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={onEvolve}
                >
                  <Sparkles className="size-4" />
                  {hasActiveEvolution ? 'Continue Evolving' : 'Evolve'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Edit and enhance your story with AI assistance
              </TooltipContent>
            </Tooltip>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </>
      )}
    </HeaderSlot>
  );
}
