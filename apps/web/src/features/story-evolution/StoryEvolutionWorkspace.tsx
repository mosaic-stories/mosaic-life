import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/components/ui/utils';
import { useStory } from '@/lib/hooks/useStories';
import {
  useActiveEvolution,
  useStartEvolution,
  useAdvancePhase,
  useDiscardEvolution,
  useAcceptEvolution,
} from '@/lib/hooks/useEvolution';
import type { WritingStyle, LengthPreference } from '@/lib/api/evolution';
import { PhaseIndicator } from './PhaseIndicator';
import { ElicitationPanel } from './ElicitationPanel';
import { SummaryCheckpoint } from './SummaryCheckpoint';
import { StyleSelector } from './StyleSelector';
import { DraftStreamPanel } from './DraftStreamPanel';
import { DraftReviewPanel } from './DraftReviewPanel';
import { HeaderSlot } from '@/components/header';
import { SEOHead } from '@/components/seo';

interface StoryEvolutionWorkspaceProps {
  storyId?: string;
  legacyId: string;
  onNavigate: (view: string) => void;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

export default function StoryEvolutionWorkspace({
  storyId,
  legacyId,
  onNavigate: _onNavigate,
  currentTheme: _currentTheme,
  onThemeChange: _onThemeChange,
}: StoryEvolutionWorkspaceProps) {
  const navigate = useNavigate();
  const [draftText, setDraftText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);

  // Fetch story data
  const { data: story, isLoading: storyLoading } = useStory(storyId);

  // Evolution session
  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
  } = useActiveEvolution(storyId, !!storyId);

  const startEvolution = useStartEvolution(storyId ?? '');
  const advancePhase = useAdvancePhase(storyId ?? '', session?.id ?? '');
  const discardEvolution = useDiscardEvolution(
    storyId ?? '',
    session?.id ?? ''
  );
  const acceptEvolution = useAcceptEvolution(
    storyId ?? '',
    session?.id ?? ''
  );

  // Phase transition handlers
  const handleStart = async () => {
    try {
      await startEvolution.mutateAsync('biographer');
    } catch (err) {
      console.error('Failed to start evolution:', err);
    }
  };

  const handleReadyToSummarize = useCallback(async () => {
    try {
      await advancePhase.mutateAsync({ phase: 'summary' });
    } catch (err) {
      console.error('Failed to advance to summary:', err);
    }
  }, [advancePhase]);

  const handleApproveSummary = useCallback(async () => {
    try {
      await advancePhase.mutateAsync({ phase: 'style_selection' });
    } catch (err) {
      console.error('Failed to advance to style selection:', err);
    }
  }, [advancePhase]);

  const handleContinueChat = useCallback(async () => {
    try {
      await advancePhase.mutateAsync({ phase: 'elicitation' });
    } catch (err) {
      console.error('Failed to return to elicitation:', err);
    }
  }, [advancePhase]);

  const handleStyleSubmit = useCallback(
    async (style: WritingStyle, length: LengthPreference) => {
      try {
        await advancePhase.mutateAsync({
          phase: 'drafting',
          writing_style: style,
          length_preference: length,
        });
      } catch (err) {
        console.error('Failed to advance to drafting:', err);
      }
    },
    [advancePhase]
  );

  const handleDraftComplete = useCallback(
    (text: string, _versionId: string, _versionNumber: number) => {
      setDraftText(text);
      advancePhase.mutate({ phase: 'review' });
    },
    [advancePhase]
  );

  const handleDraftError = useCallback((message: string) => {
    setStreamError(message);
  }, []);

  const handleAccept = useCallback(async () => {
    try {
      await acceptEvolution.mutateAsync();
      navigate(`/legacy/${legacyId}/story/${storyId}`);
    } catch (err) {
      console.error('Failed to accept evolution:', err);
    }
  }, [acceptEvolution, navigate, legacyId, storyId]);

  const handleDiscard = useCallback(async () => {
    try {
      await discardEvolution.mutateAsync();
      navigate(`/legacy/${legacyId}/story/${storyId}`);
    } catch (err) {
      console.error('Failed to discard evolution:', err);
    }
  }, [discardEvolution, navigate, legacyId, storyId]);

  const handleRevisionComplete = useCallback(
    (newText: string, _versionId: string, _versionNumber: number) => {
      setDraftText(newText);
    },
    []
  );

  const handleBack = () => {
    navigate(`/legacy/${legacyId}/story/${storyId}`);
  };

  // Guard: storyId is required
  if (!storyId) {
    return (
      <div className="min-h-screen bg-[rgb(var(--theme-background))] flex items-center justify-center">
        <p className="text-muted-foreground">No story selected.</p>
      </div>
    );
  }

  // Loading state
  if (storyLoading || sessionLoading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--theme-background))] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-[rgb(var(--theme-primary))]" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // No session — show start screen
  if (!session || sessionError) {
    return (
      <div className="min-h-screen bg-[rgb(var(--theme-background))]">
        <SEOHead
          title="Evolve Story"
          description="Evolve your story with AI"
          noIndex={true}
        />
        <HeaderSlot>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to story</span>
            </button>
          </div>
        </HeaderSlot>
        <main className="max-w-2xl mx-auto px-6 py-16">
          <Card className="p-8 text-center">
            <Sparkles className="size-10 mx-auto mb-4 text-purple-600" />
            <h1 className="text-xl font-semibold text-foreground mb-2">
              Evolve this story
            </h1>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Have a conversation with an AI agent to add more detail and nuance
              to your story, then generate a polished new version.
            </p>
            <Button
              onClick={handleStart}
              disabled={startEvolution.isPending}
              className="bg-[rgb(var(--theme-primary))] text-white hover:bg-[rgb(var(--theme-primary))]/90"
            >
              {startEvolution.isPending ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="size-4 mr-2" />
              )}
              Start Evolution
            </Button>
            {startEvolution.isError && (
              <p className="mt-4 text-sm text-red-600">
                Failed to start evolution. Please try again.
              </p>
            )}
          </Card>
        </main>
      </div>
    );
  }

  // Active session — show workspace
  const phase = session.phase;

  const renderPhasePanel = () => {
    switch (phase) {
      case 'elicitation':
        return (
          <ElicitationPanel
            conversationId={session.conversation_id}
            legacyId={legacyId}
            onReadyToSummarize={handleReadyToSummarize}
          />
        );
      case 'summary':
        return (
          <SummaryCheckpoint
            summaryText={session.summary_text ?? ''}
            onApprove={handleApproveSummary}
            onContinueChat={handleContinueChat}
            isAdvancing={advancePhase.isPending}
          />
        );
      case 'style_selection':
        return (
          <StyleSelector
            onSubmit={handleStyleSubmit}
            isSubmitting={advancePhase.isPending}
            defaultStyle={session.writing_style ?? undefined}
            defaultLength={session.length_preference ?? undefined}
          />
        );
      case 'drafting':
        return (
          <DraftStreamPanel
            storyId={storyId}
            sessionId={session.id}
            onComplete={handleDraftComplete}
            onError={handleDraftError}
          />
        );
      case 'review':
        return (
          <DraftReviewPanel
            draftContent={draftText}
            storyId={storyId}
            sessionId={session.id}
            onAccept={handleAccept}
            onDiscard={handleDiscard}
            onRevisionComplete={handleRevisionComplete}
            isAccepting={acceptEvolution.isPending}
            isDiscarding={discardEvolution.isPending}
          />
        );
      case 'completed':
      case 'discarded':
        return (
          <Card className="p-8 text-center m-6">
            <p className="text-muted-foreground">
              This evolution session has been {phase}.
            </p>
            <Button variant="outline" className="mt-4" onClick={handleBack}>
              Return to story
            </Button>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-[calc(100dvh-3.5rem)] bg-[rgb(var(--theme-background))] flex flex-col overflow-hidden">
      <SEOHead
        title="Evolve Story"
        description="Evolve your story with AI"
        noIndex={true}
      />
      <HeaderSlot>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span>Back to story</span>
          </button>
          <Badge
            variant="outline"
            className="bg-purple-50 text-purple-700 border-purple-200"
          >
            Evolution
          </Badge>
          {phase !== 'completed' && phase !== 'discarded' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-1"
                  disabled={discardEvolution.isPending}
                >
                  <X className="size-3.5 mr-1" />
                  Discard
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard evolution session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will discard all progress in this evolution session
                    including any conversation and draft. Your original story
                    will remain unchanged.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep working</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDiscard}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {discardEvolution.isPending ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : null}
                    Discard session
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </HeaderSlot>

      {/* Phase indicator */}
      <div className="border-b bg-white px-4 py-3 shrink-0">
        <div className="max-w-7xl mx-auto">
          <PhaseIndicator currentPhase={phase} />
        </div>
      </div>

      {/* Stream error banner */}
      {streamError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 shrink-0">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="size-4" />
              <span>{streamError}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStreamError(null)}
              className="text-red-700"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex-1 flex min-h-0 max-w-7xl w-full mx-auto">
        {/* Left panel: Original story (hidden on mobile) */}
        <aside className="hidden lg:block w-[45%] border-r overflow-y-auto p-6">
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Original Story
            </h2>
            <h3 className="text-lg font-semibold text-foreground">
              {story?.title ?? 'Untitled'}
            </h3>
            <div className="font-serif text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
              {story?.content ?? ''}
            </div>
          </div>
        </aside>

        {/* Right panel: Phase content */}
        <main
          className={cn(
            'flex-1 flex flex-col min-h-0',
            (phase === 'summary' || phase === 'style_selection') &&
              'p-6 overflow-y-auto'
          )}
        >
          {renderPhasePanel()}
        </main>
      </div>
    </div>
  );
}
