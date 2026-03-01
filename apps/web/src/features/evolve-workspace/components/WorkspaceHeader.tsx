import { ArrowLeft, Save, Trash2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface WorkspaceHeaderProps {
  legacyId: string;
  storyId: string;
  title: string;
  isSaving: boolean;
  isDirty: boolean;
  isDiscarding: boolean;
  isFinishing: boolean;
  hasDraft: boolean;
  onSaveDraft: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}

export function WorkspaceHeader({
  legacyId,
  storyId,
  title,
  isSaving,
  isDirty,
  isDiscarding,
  isFinishing,
  hasDraft,
  onSaveDraft,
  onFinish,
  onDiscard,
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();

  const canFinish = hasDraft || isDirty;

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
          {isSaving
            ? 'Saving...'
            : isFinishing
              ? 'Publishing...'
              : isDirty
                ? 'Unsaved changes'
                : 'Saved'}
        </span>

        {/* Discard session */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={isDiscarding || isSaving || isFinishing}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Discard session
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard this evolution session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will discard the session and any unsaved changes. The original story will be
                unchanged. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDiscard}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Discard session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Save draft */}
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveDraft}
          disabled={isSaving || !isDirty || isFinishing}
        >
          <Save className="h-4 w-4 mr-1" />
          Save draft
        </Button>

        {/* Finish */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              disabled={!canFinish || isSaving || isDiscarding || isFinishing}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Finish
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish this version?</AlertDialogTitle>
              <AlertDialogDescription>
                This will replace the current story with your edited version and close the evolution
                session.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onFinish}>
                Publish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
