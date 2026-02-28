import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useStory, useUpdateStory } from '@/features/story/hooks/useStories';
import { useIsMobile } from '@/components/ui/use-mobile';
import { useActiveEvolution, useDiscardEvolution } from '@/lib/hooks/useEvolution';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { EditorPanel } from './components/EditorPanel';
import { ToolStrip } from './components/ToolStrip';
import { ToolPanel } from './components/ToolPanel';
import { BottomToolbar } from './components/BottomToolbar';
import { MobileToolSheet } from './components/MobileToolSheet';
import { MobileBottomBar } from './components/MobileBottomBar';
import { useAIRewrite } from './hooks/useAIRewrite';
import { type ToolId, useEvolveWorkspaceStore } from './store/useEvolveWorkspaceStore';

interface EvolveWorkspaceProps {
  storyId?: string;
  legacyId?: string;
}

export default function EvolveWorkspace({ storyId: propStoryId, legacyId: propLegacyId }: EvolveWorkspaceProps) {
  const params = useParams<{ storyId: string; legacyId: string }>();
  const storyId = propStoryId ?? params.storyId ?? '';
  const legacyId = propLegacyId ?? params.legacyId ?? '';

  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [content, setContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [conversationId] = useState<string | null>(null);

  const { data: story, isLoading } = useStory(storyId);
  const updateStory = useUpdateStory();
  const { data: activeSession } = useActiveEvolution(storyId);
  const discardEvolution = useDiscardEvolution(
    storyId,
    activeSession?.id ?? '',
  );
  const { triggerRewrite } = useAIRewrite(storyId);

  const writingStyle = useEvolveWorkspaceStore((s) => s.writingStyle);
  const lengthPreference = useEvolveWorkspaceStore((s) => s.lengthPreference);
  const pinnedContextIds = useEvolveWorkspaceStore((s) => s.pinnedContextIds);
  const setActiveTool = useEvolveWorkspaceStore((s) => s.setActiveTool);

  // Initialize content from story data
  useEffect(() => {
    if (story?.content && !isDirty) {
      setContent(story.content);
    }
  }, [story?.content, isDirty]);

  const handleContentChange = useCallback((markdown: string) => {
    setContent(markdown);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!story) return;
    await updateStory.mutateAsync({
      storyId,
      data: {
        title: story.title,
        content,
        visibility: story.visibility,
        legacies: story.legacies.map((l) => ({
          legacy_id: l.legacy_id,
          role: l.role,
        })),
      },
    });
    setIsDirty(false);
  }, [story, storyId, content, updateStory]);

  const handleRewrite = useCallback(() => {
    triggerRewrite(content, {
      conversation_id: conversationId,
      pinned_context_ids: pinnedContextIds,
      writing_style: writingStyle,
      length_preference: lengthPreference,
    });
  }, [content, conversationId, pinnedContextIds, writingStyle, lengthPreference, triggerRewrite]);

  const handleAcceptRewrite = useCallback(
    (rewrittenContent: string) => {
      setContent(rewrittenContent);
      setIsDirty(true);
    },
    [],
  );

  const handleDiscard = useCallback(async () => {
    if (activeSession?.id) {
      await discardEvolution.mutateAsync();
    }
    navigate(`/legacy/${legacyId}/story/${storyId}`);
  }, [activeSession?.id, discardEvolution, navigate, legacyId, storyId]);

  const wordCount = useMemo(
    () => content.split(/\s+/).filter(Boolean).length,
    [content],
  );

  const handleMobileToolSelect = useCallback(
    (toolId: string) => {
      if (toolId === 'rewrite') {
        handleRewrite();
      } else {
        setActiveTool(toolId as ToolId);
        setMobileSheetOpen(true);
      }
    },
    [handleRewrite, setActiveTool],
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
          title={story?.title ?? 'Untitled'}
          isSaving={updateStory.isPending}
          isDirty={isDirty}
          isDiscarding={discardEvolution.isPending}
          onSave={handleSave}
          onDiscard={handleDiscard}
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
                  />
                </ResizablePanel>
                <ToolStrip />
                <ResizableHandle />
                <ResizablePanel defaultSize={35} minSize={20}>
                  <ToolPanel
                    legacyId={legacyId}
                    storyId={storyId}
                    conversationId={conversationId}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
            <BottomToolbar onRewrite={handleRewrite} wordCount={wordCount} />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
