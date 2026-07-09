import { Link } from 'react-router-dom';
import { Pencil, MoreHorizontal, History, Sparkles, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface StoryToolbarProps {
  legacyId: string;
  legacyName: string;
  storyTitle: string;
  canEdit: boolean;
  showHistory: boolean;
  versionCount: number | null;
  canDelete: boolean;
  onOpenHistory: () => void;
  onEdit: () => void;
  onEvolve: () => void;
  onDelete: () => void;
}

export default function StoryToolbar({
  legacyId,
  legacyName,
  storyTitle,
  canEdit,
  showHistory,
  versionCount,
  canDelete,
  onOpenHistory,
  onEdit,
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
        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="gap-2" onClick={onEdit}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="size-8 p-0" aria-label="More actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {showHistory && (
                  <DropdownMenuItem onClick={onOpenHistory}>
                    <History className="size-4 mr-2" />
                    Version history{versionCount ? ` (${versionCount})` : ''}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onEvolve}>
                  <Sparkles className="size-4 mr-2" />
                  AI workspace
                </DropdownMenuItem>
                {canDelete && (
                  <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-700">
                    <Trash2 className="size-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
}
