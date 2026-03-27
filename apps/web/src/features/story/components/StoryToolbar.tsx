import { Link } from 'react-router-dom';
import { Sparkles, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import VersionHistoryButton from './VersionHistoryButton';

interface StoryToolbarProps {
  legacyId: string;
  legacyName: string;
  storyTitle: string;
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
  storyTitle,
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
    <div className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        <nav className="flex items-center gap-2 text-sm text-neutral-500 min-w-0">
          <Link to="/" className="hover:text-neutral-900 transition-colors shrink-0">Home</Link>
          <ChevronRight className="size-3 shrink-0" />
          <Link to="/my/legacies" className="hover:text-neutral-900 transition-colors shrink-0">Legacies</Link>
          <ChevronRight className="size-3 shrink-0" />
          <Link to={`/legacy/${legacyId}`} className="hover:text-neutral-900 transition-colors shrink-0">{legacyName}</Link>
          <ChevronRight className="size-3 shrink-0" />
          <span className="text-neutral-900 font-medium truncate">{storyTitle}</span>
        </nav>
        {isEditMode && (
          <div className="flex items-center gap-2 shrink-0">
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
          </div>
        )}
      </div>
    </div>
  );
}
