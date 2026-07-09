import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Pencil, Trash2, Loader2, X, Check } from 'lucide-react';
import UserLink from '@/components/UserLink';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import PlainTextBody from '@/features/story-responses/utils/PlainTextBody';
import { useUpdateResponse, useDeleteResponse } from '@/features/story-responses/hooks/useResponses';
import type { StoryResponseItem } from '@/features/story-responses/api/responses';

export interface ResponseItemProps {
  storyId: string;
  response: StoryResponseItem;
  /** Current viewer's user id — undefined when not authenticated. */
  currentUserId?: string;
  /**
   * True when the viewer is the legacy's creator/admin, so they can remove
   * *other* members' responses (per the story-responses spec's removal-rights
   * requirement; advocate/admirer never get this).
   */
  canModerate: boolean;
}

export default function ResponseItem({
  storyId,
  response,
  currentUserId,
  canModerate,
}: ResponseItemProps) {
  // Mirrors the `response` prop, but is also updated directly from a
  // successful edit's response body. The list view (ResponsesSection)
  // re-renders this component with fresh props once its query cache is
  // reconciled, but display shouldn't depend on that round-trip completing —
  // this keeps the row self-contained and immediately correct after save.
  const [displayResponse, setDisplayResponse] = useState(response);
  useEffect(() => {
    setDisplayResponse(response);
  }, [response]);

  const [isEditing, setIsEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(response.body);
  const [error, setError] = useState<string | null>(null);

  const updateResponse = useUpdateResponse(storyId);
  const deleteResponse = useDeleteResponse(storyId);

  const isOwnResponse = !!currentUserId && displayResponse.user_id === currentUserId;
  const canEdit = isOwnResponse;
  const canDelete = isOwnResponse || canModerate;
  const isTemp = displayResponse.id.startsWith('temp-');

  const timeAgo = formatDistanceToNow(new Date(displayResponse.created_at), { addSuffix: true });

  const handleStartEdit = () => {
    setDraftBody(displayResponse.body);
    setError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDraftBody(displayResponse.body);
    setError(null);
  };

  const handleSaveEdit = () => {
    const trimmed = draftBody.trim();
    if (!trimmed) {
      setError('Response cannot be empty.');
      return;
    }
    setError(null);
    updateResponse.mutate(
      { responseId: displayResponse.id, body: trimmed },
      {
        onSuccess: (updated) => {
          setDisplayResponse(updated);
          setIsEditing(false);
        },
        onError: () => setError('Failed to save your edit. Please try again.'),
      },
    );
  };

  const handleDelete = () => {
    deleteResponse.mutate(displayResponse.id, {
      onError: () => setError('Failed to delete this response. Please try again.'),
    });
  };

  return (
    <div className="flex gap-3 py-3" data-testid="response-item" aria-busy={isTemp}>
      <UserLink
        username={displayResponse.user_username}
        displayName={displayResponse.user_name}
        avatarUrl={displayResponse.user_avatar_url}
        showAvatar
        avatarClassName="size-8"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <UserLink
            username={displayResponse.user_username}
            displayName={displayResponse.user_name}
            className="font-medium text-neutral-900"
          />
          <span aria-hidden="true">&middot;</span>
          <span>{isTemp ? 'Sending…' : timeAgo}</span>
          {displayResponse.edited_at && !isTemp && (
            <span className="text-neutral-400" data-testid="edited-marker">
              (edited)
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="mt-1.5 space-y-2">
            <Textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              disabled={updateResponse.isPending}
              rows={3}
              aria-label="Edit response"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={updateResponse.isPending}
              >
                {updateResponse.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelEdit}
                disabled={updateResponse.isPending}
              >
                <X className="size-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <PlainTextBody
            text={displayResponse.body}
            className="mt-1 text-sm text-neutral-800 leading-relaxed"
          />
        )}

        {error && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      {!isEditing && !isTemp && (canEdit || canDelete) && (
        <div className="flex items-start gap-1 shrink-0">
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              className="size-7 p-0 text-neutral-400 hover:text-neutral-700"
              onClick={handleStartEdit}
              aria-label="Edit response"
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0 text-neutral-400 hover:text-red-600"
                  disabled={deleteResponse.isPending}
                  aria-label="Delete response"
                >
                  {deleteResponse.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this response?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
}
