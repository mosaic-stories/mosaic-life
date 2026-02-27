import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface WorkspaceHeaderProps {
  legacyId: string;
  storyId: string;
  title: string;
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => void;
}

export function WorkspaceHeader({
  legacyId,
  storyId,
  title,
  isSaving,
  isDirty,
  onSave,
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/legacy/${legacyId}/story/${storyId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to story
        </Button>
        <h1 className="text-sm font-medium text-neutral-700 truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">
          {isSaving ? 'Saving...' : isDirty ? 'Unsaved changes' : 'Saved'}
        </span>
        <Button size="sm" onClick={onSave} disabled={isSaving || !isDirty}>
          <Save className="h-4 w-4 mr-1" />
          Save
        </Button>
      </div>
    </div>
  );
}
