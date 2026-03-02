import { useNavigate } from 'react-router-dom';
import { Loader2, MoreVertical, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface LegacyHeaderControlsProps {
  legacyId: string;
  user: { name: string; email: string; avatarUrl?: string } | null;
  onAddStory: () => void;
  isCreatingStory?: boolean;
  onDelete: () => void;
  onShare: () => void;
}

export default function LegacyHeaderControls({
  legacyId,
  user,
  onAddStory,
  isCreatingStory = false,
  onDelete,
  onShare,
}: LegacyHeaderControlsProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onShare}>
        <Share2 className="size-4" />
      </Button>
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
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
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              Delete Legacy
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button size="sm" onClick={onAddStory} disabled={isCreatingStory} className="bg-theme-primary hover:bg-theme-primary-dark">
        {isCreatingStory ? (
          <Loader2 className="size-4 mr-2 animate-spin" />
        ) : (
          <Plus className="size-4 mr-2" />
        )}
        <span className="hidden sm:inline">Add Story</span>
      </Button>
    </div>
  );
}
