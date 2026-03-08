import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  navigate: vi.fn(),
  story: {
    id: 'story-1',
    title: 'Draft Story',
    content: '',
    visibility: 'private',
    status: 'draft',
    source_conversation_id: 'source-conv',
  },
  createNewConversation: vi.fn(),
  updateStory: { mutateAsync: vi.fn(), isPending: false },
  activeEvolution: null,
  saveDraft: { mutateAsync: vi.fn(), isPending: false },
  triggerRewrite: vi.fn(),
  abortRewrite: vi.fn(),
  aiChatReset: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ storyId: 'story-1', legacyId: 'legacy-1' }),
    useNavigate: () => mocks.navigate,
    useSearchParams: () => [mocks.searchParams],
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock('@/features/story/hooks/useStories', () => ({
  useStory: () => ({ data: mocks.story, isLoading: false }),
  useUpdateStory: () => mocks.updateStory,
  storyKeys: {
    detail: (storyId: string) => ['story', storyId],
  },
}));

vi.mock('@/components/ui/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/lib/hooks/useEvolution', () => ({
  evolutionKeys: {
    all: ['evolution'],
    active: (storyId: string) => ['evolution', storyId],
  },
  useActiveEvolution: () => ({ data: mocks.activeEvolution }),
  useSaveManualDraft: () => mocks.saveDraft,
}));

vi.mock('@/lib/api/evolution', () => ({
  discardActiveEvolution: vi.fn(),
  acceptEvolution: vi.fn(),
}));

vi.mock('./hooks/useAIRewrite', () => ({
  useAIRewrite: () => ({ triggerRewrite: mocks.triggerRewrite, abort: mocks.abortRewrite }),
}));

vi.mock('./hooks/useStoryContext', () => ({
  storyContextKeys: {
    detail: (storyId: string) => ['story-context', storyId],
  },
}));

vi.mock('@/features/ai-chat/store/aiChatStore', () => ({
  useAIChatStore: {
    getState: () => ({ reset: mocks.aiChatReset }),
  },
}));

vi.mock('@/features/ai-chat/api/ai', () => ({
  createNewConversation: mocks.createNewConversation,
}));

vi.mock('./components/WorkspaceHeader', () => ({
  WorkspaceHeader: () => <div data-testid="workspace-header" />,
}));

vi.mock('./components/EditorPanel', () => ({
  EditorPanel: () => <div data-testid="editor-panel" />,
}));

vi.mock('./components/ToolStrip', () => ({
  ToolStrip: () => <div data-testid="tool-strip" />,
}));

vi.mock('./components/ToolPanel', () => ({
  ToolPanel: () => <div data-testid="tool-panel" />,
}));

vi.mock('./components/MobileToolSheet', () => ({
  MobileToolSheet: () => <div data-testid="mobile-tool-sheet" />,
}));

vi.mock('./components/MobileBottomBar', () => ({
  MobileBottomBar: () => <div data-testid="mobile-bottom-bar" />,
}));

vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div data-testid="resize-handle" />,
}));

import EvolveWorkspace from './EvolveWorkspace';
import { useEvolveWorkspaceStore } from './store/useEvolveWorkspaceStore';

function renderWithProviders() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EvolveWorkspace />
    </QueryClientProvider>,
  );
}

describe('EvolveWorkspace conversation handoff', () => {
  beforeEach(() => {
    useEvolveWorkspaceStore.getState().reset();
    mocks.searchParams = new URLSearchParams();
    mocks.story = {
      id: 'story-1',
      title: 'Draft Story',
      content: '',
      visibility: 'private',
      status: 'draft',
      source_conversation_id: 'source-conv',
    };
    mocks.createNewConversation.mockReset();
    mocks.createNewConversation.mockResolvedValue({ id: 'new-conv' });
    mocks.updateStory.mutateAsync.mockReset();
    mocks.saveDraft.mutateAsync.mockReset();
    mocks.triggerRewrite.mockReset();
    mocks.abortRewrite.mockReset();
    mocks.navigate.mockReset();
    mocks.aiChatReset.mockReset();
  });

  it('uses evolve_summary only when a route conversation handoff is present', async () => {
    mocks.searchParams.set('conversation_id', 'conv-from-evolve');

    renderWithProviders();

    await waitFor(() => {
      const state = useEvolveWorkspaceStore.getState();
      expect(state.conversationIds[state.activePersonaId]).toBe('conv-from-evolve');
    });

    expect(useEvolveWorkspaceStore.getState().seedMode).toBe('evolve_summary');
    expect(mocks.createNewConversation).not.toHaveBeenCalled();
  });

  it('keeps default seed mode when creating a new conversation without route handoff', async () => {
    renderWithProviders();

    await waitFor(() => {
      const state = useEvolveWorkspaceStore.getState();
      expect(state.conversationIds[state.activePersonaId]).toBe('new-conv');
    });

    expect(useEvolveWorkspaceStore.getState().seedMode).toBe('default');
    expect(mocks.createNewConversation).toHaveBeenCalledOnce();
  });
});
