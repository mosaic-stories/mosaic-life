import { useEffect, useState } from 'react';
import { ArrowLeft, Save, Trash2, CheckCircle, Pencil } from 'lucide-react';
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

type StoryVisibility = 'public' | 'private' | 'personal';

interface WorkspaceHeaderProps {
  legacyId: string;
  storyId: string;
  title: string;
  currentVisibility?: StoryVisibility;
  isSaving: boolean;
  isDirty: boolean;
  isDiscarding: boolean;
  isFinishing: boolean;
  isUpdatingTitle: boolean;
  hasDraft: boolean;
  onSaveDraft: () => void;
  onFinish: (visibility?: StoryVisibility) => void;
  onDiscard: () => void;
  onUpdateTitle: (title: string) => Promise<void>;
}

export function WorkspaceHeader({
  legacyId,
  storyId,
  title,
  currentVisibility,
  isSaving,
  isDirty,
  isDiscarding,
  isFinishing,
  isUpdatingTitle,
  hasDraft,
  onSaveDraft,
  onFinish,
  onDiscard,
  onUpdateTitle,
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [finishVisibility, setFinishVisibility] = useState<StoryVisibility>(
    currentVisibility ?? 'private'
  );

  useEffect(() => {
    setFinishVisibility(currentVisibility ?? 'private');
  }, [currentVisibility]);

  const canFinish = hasDraft || isDirty;

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(title);
    }
  }, [title, isEditingTitle]);

  const commitTitle = async () => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle || nextTitle === title) {
      setDraftTitle(title);
      setIsEditingTitle(false);
      return;
    }

    try {
      await onUpdateTitle(nextTitle);
      setIsEditingTitle(false);
    } catch (err) {
      console.error('Failed to update story title:', err);
      setDraftTitle(title);
      setIsEditingTitle(false);
    }
  };

  const cancelEditTitle = () => {
    setDraftTitle(title);
    setIsEditingTitle(false);
  };

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
        <div className="group flex items-center gap-1.5 min-w-0">
          {isEditingTitle ? (
            <input
              autoFocus
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void commitTitle();
                }
                if (event.key === 'Escape') {
                  cancelEditTitle();
                }
              }}
              disabled={isUpdatingTitle}
              className="h-8 w-[18rem] max-w-[45vw] rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
              aria-label="Story title"
            />
          ) : (
            <>
              <h1 className="text-sm font-medium text-neutral-700 truncate max-w-[22rem]">{title}</h1>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsEditingTitle(true)}
                disabled={isUpdatingTitle || isSaving || isFinishing || isDiscarding}
                className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Edit story title"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
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
                This will replace the current story with your edited version and close the
                evolution session.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {/* Visibility picker */}
            <div className="space-y-2 py-2">
              <label className="text-sm font-medium">Visibility</label>
              <div className="flex gap-2">
                {(['public', 'private', 'personal'] as const).map((v) => (
                  <Button
                    key={v}
                    variant={finishVisibility === v ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFinishVisibility(v)}
                  >
                    {v === 'public' ? 'Public' : v === 'private' ? 'Members Only' : 'Personal'}
                  </Button>
                ))}
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onFinish(finishVisibility)}>
                Publish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
