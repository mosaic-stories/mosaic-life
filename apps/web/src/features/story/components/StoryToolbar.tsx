import { Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import PageActionBar from '@/components/PageActionBar';
import VersionHistoryButton from './VersionHistoryButton';

interface StoryToolbarProps {
  legacyId: string;
  legacyName: string;
  isEditMode: boolean;
  canEdit: boolean;
  showHistory: boolean;
  versionCount: number | null;
  hasActiveEvolution: boolean;
  canDelete: boolean;
  onOpenHistory: () => void;
  onEvolve: () => void;
  onDelete: () => void;
}

export default function StoryToolbar({
  legacyId,
  legacyName,
  isEditMode,
  canEdit,
  showHistory,
  versionCount,
  hasActiveEvolution,
  canDelete,
  onOpenHistory,
  onEvolve,
  onDelete,
}: StoryToolbarProps) {
  return (
    <PageActionBar backLabel={legacyName} backTo={`/legacy/${legacyId}`}>
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
    </PageActionBar>
  );
}
