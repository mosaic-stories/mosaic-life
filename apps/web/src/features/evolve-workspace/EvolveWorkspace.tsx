import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useStory, storyKeys, useUpdateStory } from '@/features/story/hooks/useStories';
import { useIsMobile } from '@/components/ui/use-mobile';
import { evolutionKeys, useActiveEvolution, useSaveManualDraft } from '@/lib/hooks/useEvolution';
import { discardActiveEvolution, acceptEvolution } from '@/lib/api/evolution';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { EditorPanel } from './components/EditorPanel';
import { ToolStrip } from './components/ToolStrip';
import { ToolPanel } from './components/ToolPanel';
import { MobileToolSheet } from './components/MobileToolSheet';
import { MobileBottomBar } from './components/MobileBottomBar';
import { useAIRewrite } from './hooks/useAIRewrite';
import { storyContextKeys } from './hooks/useStoryContext';
import type { StoryContextResponse } from './api/storyContext';
import { type ToolId, useEvolveWorkspaceStore } from './store/useEvolveWorkspaceStore';
import { useAIChatStore } from '@/features/ai-chat/store/aiChatStore';
import { createNewConversation } from '@/features/ai-chat/api/ai';

/** Reset both workspace stores (no React hook needed). */
function resetAllStores() {
  useEvolveWorkspaceStore.getState().reset();
  useAIChatStore.getState().reset();
}

interface EvolveWorkspaceProps {
  storyId?: string;
  legacyId?: string;
}

export default function EvolveWorkspace({ storyId: propStoryId, legacyId: propLegacyId }: EvolveWorkspaceProps) {
  const params = useParams<{ storyId: string; legacyId: string }>();
  const storyId = propStoryId ?? params.storyId ?? '';
  const legacyId = propLegacyId ?? params.legacyId ?? '';

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [content, setContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [title, setTitle] = useState('Untitled');

  const { data: story, isLoading } = useStory(storyId);
  const updateStory = useUpdateStory();
  const { data: activeEvolution } = useActiveEvolution(storyId);
  const saveDraft = useSaveManualDraft(storyId);
  const { triggerRewrite, abort: abortRewrite } = useAIRewrite(storyId);

  const hasDraft = !!activeEvolution?.draft_version_id;
  const sessionId = activeEvolution?.id;

  const writingStyle = useEvolveWorkspaceStore((s) => s.writingStyle);
  const lengthPreference = useEvolveWorkspaceStore((s) => s.lengthPreference);
  const pinnedContextIds = useEvolveWorkspaceStore((s) => s.pinnedContextIds);
  const setActiveTool = useEvolveWorkspaceStore((s) => s.setActiveTool);
  const activePersonaId = useEvolveWorkspaceStore((s) => s.activePersonaId);
  const conversationIds = useEvolveWorkspaceStore((s) => s.conversationIds);
  const setConversationForPersona = useEvolveWorkspaceStore((s) => s.setConversationForPersona);

  const conversationId = conversationIds[activePersonaId] ?? null;

  // Create a conversation for the active persona when it doesn't exist yet.
  useEffect(() => {
    if (conversationIds[activePersonaId]) return;

    let mounted = true;

    async function initConversation() {
      try {
        const conv = await createNewConversation({
          persona_id: activePersonaId,
          legacies: [{ legacy_id: legacyId, role: 'primary', position: 0 }],
        });
        if (mounted) {
          setConversationForPersona(activePersonaId, conv.id);
        }
      } catch (err) {
        console.error('Failed to create evolve conversation:', err);
      }
    }

    initConversation();

    return () => {
      mounted = false;
    };
  }, [activePersonaId, legacyId, conversationIds, setConversationForPersona]);

  // Reset stores on unmount so navigation away starts clean.
  useEffect(() => {
    return () => {
      resetAllStores();
    };
  }, []);

  // Initialize content from story data
  useEffect(() => {
    if (story?.content && !isDirty) {
      setContent(story.content);
    }
  }, [story?.content, isDirty]);

  useEffect(() => {
    if (story?.title) {
      setTitle(story.title);
    }
  }, [story?.title]);

  const handleContentChange = useCallback((markdown: string) => {
    setContent(markdown);
    setIsDirty(true);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!story) return;
    await saveDraft.mutateAsync({
      title,
      content,
    });
    setIsDirty(false);
  }, [story, title, content, saveDraft]);

  const handleFinish = useCallback(async (visibility?: 'public' | 'private' | 'personal') => {
    if (!sessionId || !story) return;
    setIsFinishing(true);
    try {
      // Auto-save draft if there are unsaved changes
      if (isDirty) {
        await saveDraft.mutateAsync({
          title,
          content,
        });
        setIsDirty(false);
      }
      // Accept the session (promotes draft to active, completes session)
      await acceptEvolution(storyId, sessionId, { visibility });
      // Clear caches
      queryClient.removeQueries({ queryKey: evolutionKeys.all });
      await queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
      resetAllStores();
      navigate(`/legacy/${legacyId}/story/${storyId}`);
    } catch (err) {
      console.error('Failed to finish evolution session:', err);
    } finally {
      setIsFinishing(false);
    }
  }, [sessionId, story, isDirty, title, content, storyId, legacyId, saveDraft, queryClient, navigate]);

  const handleUpdateTitle = useCallback(
    async (nextTitle: string) => {
      const trimmedTitle = nextTitle.trim();
      if (!trimmedTitle || !storyId) return;

      const previousTitle = title;
      setTitle(trimmedTitle);
      try {
        await updateStory.mutateAsync({
          storyId,
          data: { title: trimmedTitle },
        });
      } catch (err) {
        setTitle(previousTitle);
        throw err;
      }
    },
    [storyId, title, updateStory],
  );

  const handleRewrite = useCallback(() => {
    // Gather pinned facts from context panel
    const context = queryClient.getQueryData<StoryContextResponse | null>(
      storyContextKeys.detail(storyId),
    );
    const pinnedFacts = context?.facts
      ?.filter((f) => f.status === 'pinned')
      .map(({ category, content: factContent, detail }) => ({ category, content: factContent, detail }));

    triggerRewrite(content, {
      conversation_id: conversationId,
      pinned_context_ids: pinnedContextIds,
      writing_style: writingStyle,
      length_preference: lengthPreference,
      context_summary: context?.summary ?? undefined,
      pinned_facts: pinnedFacts,
    });
  }, [content, conversationId, pinnedContextIds, writingStyle, lengthPreference, triggerRewrite, queryClient, storyId]);

  const handleAcceptRewrite = useCallback(
    (rewrittenContent: string) => {
      setContent(rewrittenContent);
      setIsDirty(true);
    },
    [],
  );

  const handleRestore = useCallback(
    (restoredContent: string) => {
      setContent(restoredContent);
      setIsDirty(true);
    },
    [],
  );

  const handleDiscard = useCallback(async () => {
    setIsDiscarding(true);

    // Abort any in-flight AI rewrite and clear its Zustand state immediately
    // so the EditorPanel stops showing the rewrite preview.
    abortRewrite();

    try {
      await discardActiveEvolution(storyId);
    } catch (err) {
      console.error('Failed to discard active evolution session:', err);
    } finally {
      // Clear TanStack Query caches so the story page doesn't show stale data.
      queryClient.setQueryData(evolutionKeys.active(storyId), null);
      queryClient.removeQueries({ queryKey: evolutionKeys.active(storyId) });
      await queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });

      // Reset the entire workspace store (tool selections, pinned context,
      // style prefs, etc.) so a future visit starts clean.
      resetAllStores();

      setIsDiscarding(false);
      navigate(`/legacy/${legacyId}/story/${storyId}`);
    }
  }, [queryClient, storyId, legacyId, navigate, abortRewrite]);

  const wordCount = useMemo(
    () => content.split(/\s+/).filter(Boolean).length,
    [content],
  );

  const handleMobileToolSelect = useCallback(
    (toolId: string) => {
      setActiveTool(toolId as ToolId);
      setMobileSheetOpen(true);
    },
    [setActiveTool],
  );

  if (isLoading) {
    return (
      <div className="h-[calc(100dvh-3.5rem)] flex items-center justify-center">
        <span className="text-neutral-400">Loading workspace...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden bg-theme-background">
        <WorkspaceHeader
          legacyId={legacyId}
          storyId={storyId}
          title={title}
          currentVisibility={story?.visibility}
          isSaving={saveDraft.isPending}
          isDirty={isDirty}
          isDiscarding={isDiscarding}
          isFinishing={isFinishing}
          isUpdatingTitle={updateStory.isPending}
          hasDraft={hasDraft}
          onSaveDraft={handleSaveDraft}
          onFinish={handleFinish}
          onDiscard={handleDiscard}
          onUpdateTitle={handleUpdateTitle}
        />

        {isMobile ? (
          /* Mobile layout: full editor + bottom bar + sheet */
          <>
            <div className="flex-1 overflow-y-auto">
              <EditorPanel
                content={content}
                onChange={handleContentChange}
                legacyId={legacyId}
                onAcceptRewrite={handleAcceptRewrite}
                onRegenerate={handleRewrite}
                onRestore={handleRestore}
              />
            </div>
            <MobileBottomBar
              wordCount={wordCount}
              onToolSelect={handleMobileToolSelect}
            />
            <MobileToolSheet
              open={mobileSheetOpen}
              onOpenChange={setMobileSheetOpen}
              legacyId={legacyId}
              storyId={storyId}
              conversationId={conversationId}
              currentContent={content}
              onRewrite={handleRewrite}
              onCancelRewrite={abortRewrite}
            />
          </>
        ) : (
          /* Desktop layout: resizable panels */
          <>
            <div className="flex-1 flex min-h-0">
              <ResizablePanelGroup direction="horizontal">
                <ResizablePanel defaultSize={65} minSize={40} maxSize={80}>
                  <EditorPanel
                    content={content}
                    onChange={handleContentChange}
                    legacyId={legacyId}
                    onAcceptRewrite={handleAcceptRewrite}
                    onRegenerate={handleRewrite}
                    onRestore={handleRestore}
                  />
                </ResizablePanel>
                <ToolStrip />
                <ResizableHandle />
                <ResizablePanel defaultSize={35} minSize={20}>
                  <ToolPanel
                    legacyId={legacyId}
                    storyId={storyId}
                    conversationId={conversationId}
                    currentContent={content}
                    onRewrite={handleRewrite}
                    onCancelRewrite={abortRewrite}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
