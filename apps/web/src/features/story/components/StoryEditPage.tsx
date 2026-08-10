import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StoryEditor } from '@/features/editor';
import { useStory, useCreateStory, useUpdateStory } from '@/features/story/hooks/useStories';
import { SEOHead } from '@/components/seo';

type Visibility = 'public' | 'private' | 'personal';

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'private', label: 'Members Only' },
  { value: 'public', label: 'Public' },
  { value: 'personal', label: 'Personal' },
];

const AUTOSAVE_DELAY_MS = 1200;

interface StoryEditPageProps {
  legacyId: string;
  storyId?: string;
}

interface EditPageLocationState {
  seedQuote?: string;
  /**
   * Raw response body to seed the new story's content with, verbatim (no
   * `> ` blockquote wrap, unlike `seedQuote`). Set when navigating here via
   * a response's "make it a story" offer (see openspec/changes/response-to-story).
   */
  seedBody?: string;
  /** The response this story is being converted from, when seeded via `seedBody`. */
  sourceResponseId?: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function StoryEditPage({ legacyId, storyId }: StoryEditPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const editLocationState = location.state as EditPageLocationState | null;
  const seedQuote = editLocationState?.seedQuote;
  const seedBody = editLocationState?.seedBody;
  const sourceResponseId = editLocationState?.sourceResponseId;
  // A response-conversion seed always wins over a story-prompt seed if both
  // are somehow present (shouldn't normally happen — different entry points).
  const seedContent = seedBody ?? (seedQuote ? `> ${seedQuote}\n\n` : '');
  const isSeededFromResponse = !!(seedBody || sourceResponseId);

  const isNew = !storyId;
  const { data: existingStory, isLoading: storyLoading } = useStory(storyId);
  const createStory = useCreateStory();
  const updateStory = useUpdateStory();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState(() => seedContent);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Tracks the effective story id across the create-on-first-input transition,
  // before the route navigation to /edit remounts this component with it.
  const effectiveIdRef = useRef<string | undefined>(storyId);
  const hasCreatedRef = useRef(!isNew);
  const creatingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const fieldsRef = useRef({ title, content, visibility });
  fieldsRef.current = { title, content, visibility };

  // Populate fields from the loaded story, but never once the user has
  // started editing — otherwise a slow initial fetch racing the user's
  // first keystrokes (or a background refetch after autosave invalidates
  // the query) would silently clobber locally-typed content with stale
  // server data.
  const hasEditedRef = useRef(false);
  useEffect(() => {
    if (existingStory && existingStory.id === storyId && !hasEditedRef.current) {
      setTitle(existingStory.title);
      setContent(existingStory.content);
      setVisibility(existingStory.visibility);
    }
  }, [existingStory, storyId]);

  // Synchronize component state and refs when storyId changes (e.g. when navigating between different edit routes)
  useEffect(() => {
    // Only reset if the storyId physically changed from what we have in effectiveIdRef.current.
    // This allows us to transition seamlessly from '/new' (storyId=undefined) to the newly created UUID
    // edit route after the first keystroke causes runCreate to update effectiveIdRef.current.
    if (storyId !== effectiveIdRef.current) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      effectiveIdRef.current = storyId;
      hasCreatedRef.current = !isNew;
      creatingRef.current = false;
      hasEditedRef.current = false;
      isSavingRef.current = false;
      pendingSaveRef.current = false;

      // Reset states. If the newly loaded story's query cache data is already available
      // and matches the new storyId, we can sync immediately; otherwise reset to empty
      // and let the existingStory-synchronizing effect handle hydration when data arrives.
      if (existingStory && existingStory.id === storyId && !isNew) {
        setTitle(existingStory.title);
        setContent(existingStory.content);
        setVisibility(existingStory.visibility);
      } else {
        setTitle('');
        setContent(seedContent);
        setVisibility('private');
      }
      setSaveState('idle');
    }
  }, [storyId, isNew, seedContent, existingStory]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const runAutosave = useCallback(async () => {
    const id = effectiveIdRef.current;
    if (!id) return;
    if (isSavingRef.current) {
      // A save is already in flight. Don't fire an overlapping request —
      // saves are slow enough (see backend issue on update_story latency)
      // that two in-flight PUTs can resolve out of order and let an
      // older snapshot silently overwrite newer content. Queue instead:
      // the in-flight save's `finally` below will pick up the latest
      // fields once it completes.
      pendingSaveRef.current = true;
      return;
    }
    isSavingRef.current = true;
    setSaveState('saving');
    try {
      await updateStory.mutateAsync({
        storyId: id,
        data: { ...fieldsRef.current },
      });
      setSaveState('saved');
    } catch (err) {
      console.error('Failed to autosave story:', err);
      setSaveState('error');
    } finally {
      isSavingRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void runAutosave();
      }
    }
  }, [updateStory]);

  const scheduleAutosave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void runAutosave();
    }, AUTOSAVE_DELAY_MS);
  }, [runAutosave]);

  const runCreate = useCallback(async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setSaveState('saving');
    const snapshot = { ...fieldsRef.current };
    const trimmedTitle = snapshot.title.trim();
    try {
      const newStory = await createStory.mutateAsync({
        title: trimmedTitle || undefined,
        content: snapshot.content,
        visibility: snapshot.visibility,
        status: 'draft',
        legacies: [{ legacy_id: legacyId, role: 'primary', position: 0 }],
        source_response_id: sourceResponseId,
      });
      hasCreatedRef.current = true;
      effectiveIdRef.current = newStory.id;
      setSaveState('saved');
      navigate(`/legacy/${legacyId}/story/${newStory.id}/edit`, { replace: true });

      const current = fieldsRef.current;
      if (
        current.title !== snapshot.title ||
        current.content !== snapshot.content ||
        current.visibility !== snapshot.visibility
      ) {
        setSaveState('saving');
        void runAutosave();
      }
    } catch (err) {
      console.error('Failed to create story:', err);
      creatingRef.current = false;
      setSaveState('error');
    }
  }, [createStory, legacyId, navigate, runAutosave, sourceResponseId]);

  const handleChange = useCallback(
    (next: Partial<{ title: string; content: string; visibility: Visibility }>) => {
      hasEditedRef.current = true;
      if (next.title !== undefined) setTitle(next.title);
      if (next.content !== undefined) setContent(next.content);
      if (next.visibility !== undefined) setVisibility(next.visibility);
      fieldsRef.current = { ...fieldsRef.current, ...next };

      if (!hasCreatedRef.current) {
        void runCreate();
        return;
      }

      scheduleAutosave();
    },
    [runCreate, scheduleAutosave],
  );

  const handleRetry = useCallback(() => {
    if (!hasCreatedRef.current) {
      creatingRef.current = false;
      void runCreate();
    } else {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void runAutosave();
    }
  }, [runCreate, runAutosave]);

  const handleBack = () => {
    if (effectiveIdRef.current) {
      navigate(`/legacy/${legacyId}/story/${effectiveIdRef.current}`);
    } else {
      navigate(`/legacy/${legacyId}`);
    }
  };

  const handleOpenEvolve = () => {
    if (!effectiveIdRef.current) return;
    navigate(`/legacy/${legacyId}/story/${effectiveIdRef.current}/evolve`);
  };

  if (!isNew && storyLoading) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-theme-primary" />
      </div>
    );
  }

  const statusText =
    saveState === 'saving' ? 'Saving…'
      : saveState === 'saved' ? 'Saved'
        : saveState === 'error' ? "Couldn't save"
          : '';

  // Story creation is lazy (first edit triggers runCreate), so a seeded
  // draft that hasn't been touched yet isn't persisted anywhere. Surface
  // that so the author knows to make a modification before navigating away.
  const showNotSavedYetBadge = isSeededFromResponse && isNew && !hasCreatedRef.current;

  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300">
      <SEOHead title={title || 'Write a story'} description="Write a story" noIndex={true} />

      <div className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" className="gap-2" onClick={handleBack}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <div className="flex items-center gap-3 shrink-0">
            {showNotSavedYetBadge && (
              <span
                className="text-xs text-neutral-400 border border-neutral-200 rounded-full px-2 py-0.5"
                title="Make an edit to save this as a new story."
                data-testid="not-saved-yet-indicator"
              >
                Not saved yet
              </span>
            )}
            <span
              className={`text-xs ${saveState === 'error' ? 'text-destructive' : 'text-neutral-400'}`}
              role="status"
            >
              {statusText}
            </span>
            {saveState === 'error' && (
              <Button variant="ghost" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            )}
            {effectiveIdRef.current && (
              <Button variant="ghost" size="sm" className="gap-2 text-neutral-500" onClick={handleOpenEvolve}>
                <Sparkles className="size-4" />
                AI workspace
              </Button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <Input
          value={title}
          onChange={(e) => handleChange({ title: e.target.value })}
          placeholder="Give your story a title (optional)"
          className="h-auto border-none px-0 font-serif text-3xl font-semibold shadow-none focus-visible:ring-0 bg-transparent"
          aria-label="Story title"
        />

        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500">Visibility:</span>
          <div className="flex gap-1.5">
            {VISIBILITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChange({ visibility: opt.value })}
                className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                  visibility === opt.value
                    ? 'bg-theme-primary text-white border-theme-primary'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <StoryEditor
          content={content}
          onChange={(markdown) => handleChange({ content: markdown })}
          legacyId={legacyId}
          placeholder="Start writing your story here..."
        />
      </main>
    </div>
  );
}
