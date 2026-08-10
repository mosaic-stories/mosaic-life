import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Pencil, Trash2, Loader2, X, Check, EyeOff } from 'lucide-react';
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
import { isLongResponse } from '@/features/story-responses/utils/isLongResponse';
import {
  useUpdateResponse,
  useDeleteResponse,
  useDismissOffer,
  useHideResponse,
} from '@/features/story-responses/hooks/useResponses';
import type { StoryResponseItem } from '@/features/story-responses/api/responses';

export interface ResponseItemProps {
  storyId: string;
  /** Legacy the responded-to story belongs to — used to seed-and-navigate to
   * `/legacy/:legacyId/story/new` when the author takes the "make it a story" offer. */
  legacyId: string;
  /**
   * The id of the story this response belongs to. Today this is always the
   * same value as `storyId` (responses only ever render on the story they
   * were posted against); it is threaded through as its own explicitly-named
   * prop so later work (converted-note backlink rendering) has an
   * unambiguous name to reach for.
   */
  sourceStoryId: string;
  response: StoryResponseItem;
  /** Current viewer's user id — undefined when not authenticated. */
  currentUserId?: string;
  /**
   * True when the viewer is the legacy's creator/admin, so they can remove
   * *other* members' responses (per the story-responses spec's removal-rights
   * requirement; advocate/admirer never get this).
   */
  canModerate: boolean;
  /**
   * True when the viewer is the author of the story these responses belong
   * to — gates the "hide note" affordance, which per the story-responses
   * spec is scoped to converted notes only (not general response
   * moderation, which is deferred to a separate change).
   */
  isStoryAuthor: boolean;
}

export default function ResponseItem({
  storyId,
  legacyId,
  sourceStoryId,
  response,
  currentUserId,
  canModerate,
  isStoryAuthor,
}: ResponseItemProps) {
  const navigate = useNavigate();
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
  const dismissOfferMutation = useDismissOffer(storyId);
  const hideResponseMutation = useHideResponse(storyId);

  const isOwnResponse = !!currentUserId && displayResponse.user_id === currentUserId;
  // A converted note is never editable — the backend rejects PATCH on a
  // converted response with 400 (see story_response.py::update_response).
  const isNote = displayResponse.converted_story_id != null;
  const canEdit = isOwnResponse && !isNote;
  const canDelete = isOwnResponse || canModerate;
  // Story-author "hide from others" moderation is scoped to converted notes
  // only (see D5 / R2 in the response-to-story design) — never on ordinary
  // responses.
  const canHide = isStoryAuthor && isNote;
  const isTemp = displayResponse.id.startsWith('temp-');
  // Gentle, dismissible offer to turn a long response into its own story —
  // author-only, never on a response that's already a converted note, and
  // never on the optimistic (not-yet-persisted) row. Suppressed while
  // actively editing since the row's layout changes underneath it.
  const showConvertOffer =
    isOwnResponse &&
    !isTemp &&
    !isEditing &&
    isLongResponse(displayResponse.body) &&
    !displayResponse.offer_dismissed_at &&
    displayResponse.converted_story_id == null;

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

  const handleTakeOffer = () => {
    navigate(`/legacy/${legacyId}/story/new`, {
      state: { seedBody: displayResponse.body, sourceResponseId: displayResponse.id },
    });
  };

  const handleDismissOffer = () => {
    dismissOfferMutation.mutate(displayResponse.id, {
      onSuccess: (updated) => setDisplayResponse(updated),
      onError: () => setError('Failed to dismiss. Please try again.'),
    });
  };

  const handleHide = () => {
    hideResponseMutation.mutate(displayResponse.id, {
      onSuccess: (updated) => setDisplayResponse(updated),
      onError: () => setError('Failed to hide this note. Please try again.'),
    });
  };

  // Populated once the response has been converted into a story; used to
  // link the note. `converted_story` can in principle be null while
  // `converted_story_id` is still set (e.g. a stale in-flight cache read) —
  // guarded defensively so this never throws, even though in steady state
  // the FK's ON DELETE SET NULL means the two are always consistent.
  const convertedStoryPath =
    isNote && displayResponse.converted_story && displayResponse.converted_story.legacy_id
      ? `/legacy/${displayResponse.converted_story.legacy_id}/story/${displayResponse.converted_story.id}`
      : null;

  return (
    <div
      className="flex gap-3 py-3"
      data-testid="response-item"
      data-source-story-id={sourceStoryId}
      aria-busy={isTemp}
    >
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
        ) : isNote ? (
          <p className="mt-1 text-sm" data-testid="converted-note">
            {convertedStoryPath ? (
              <Link
                to={convertedStoryPath}
                className="font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
              >
                Turned this into a story →
              </Link>
            ) : (
              <span className="text-neutral-400">Turned this into a story.</span>
            )}
          </p>
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

        {showConvertOffer && (
          <div
            className="mt-2 flex items-center gap-2 text-xs text-neutral-400"
            data-testid="convert-to-story-offer"
          >
            <span>This sounds like its own story.</span>
            <button
              type="button"
              onClick={handleTakeOffer}
              className="font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
            >
              Make it a story
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="size-5 p-0 text-neutral-300 hover:text-neutral-600"
              onClick={handleDismissOffer}
              disabled={dismissOfferMutation.isPending}
              aria-label="Dismiss story suggestion"
            >
              {dismissOfferMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <X className="size-3" />
              )}
            </Button>
          </div>
        )}
      </div>

      {!isEditing && !isTemp && (canEdit || canDelete || canHide) && (
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
          {canHide && (
            <Button
              size="sm"
              variant="ghost"
              className="size-7 p-0 text-neutral-400 hover:text-neutral-700"
              onClick={handleHide}
              disabled={hideResponseMutation.isPending}
              aria-label="Hide note"
            >
              {hideResponseMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <EyeOff className="size-3.5" />
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
