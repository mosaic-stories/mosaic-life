import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RewriteTool } from './RewriteTool';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

// Mock usePersonas to return a persona for the briefing
vi.mock('@/features/ai-chat/hooks/useAIChat', () => ({
  usePersonas: () => ({
    data: [
      { id: 'biographer', name: 'The Biographer', icon: 'book-open', description: '' },
      { id: 'friend', name: 'The Friend', icon: 'heart', description: '' },
    ],
  }),
}));

// Mock useStoryContext
vi.mock('../hooks/useStoryContext', () => ({
  useStoryContext: () => ({
    data: {
      id: 'ctx-1',
      story_id: 'story-1',
      summary: 'A story about growing up in Boston.',
      summary_updated_at: '2026-03-01T00:00:00Z',
      extracting: false,
      facts: [
        { id: 'f1', category: 'person', content: 'Rose', detail: 'grandmother', source: 'story', status: 'pinned', created_at: '' },
        { id: 'f2', category: 'place', content: 'Boston', detail: null, source: 'story', status: 'active', created_at: '' },
        { id: 'f3', category: 'emotion', content: 'Nostalgia', detail: null, source: 'conversation', status: 'pinned', created_at: '' },
      ],
    },
  }),
}));

// Mock aiChatStore for message count
vi.mock('@/features/ai-chat/store/aiChatStore', () => ({
  useAIChatStore: vi.fn((selector) => {
    const state = {
      conversations: new Map([
        ['conv-1', { messages: [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }, { role: 'assistant' }] }],
      ]),
    };
    return selector(state);
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('RewriteTool', () => {
  beforeEach(() => {
    useEvolveWorkspaceStore.getState().reset();
  });

  it('renders style toggles', () => {
    renderWithProviders(
      <RewriteTool storyId="story-1" conversationId="conv-1" onRewrite={vi.fn()} hasContent />,
    );
    expect(screen.getByText('Vivid')).toBeInTheDocument();
    expect(screen.getByText('Emotional')).toBeInTheDocument();
    expect(screen.getByText('Conversational')).toBeInTheDocument();
    expect(screen.getByText('Concise')).toBeInTheDocument();
    expect(screen.getByText('Documentary')).toBeInTheDocument();
  });

  it('renders length toggles', () => {
    renderWithProviders(
      <RewriteTool storyId="story-1" conversationId="conv-1" onRewrite={vi.fn()} hasContent />,
    );
    expect(screen.getByText('Similar')).toBeInTheDocument();
    expect(screen.getByText('Shorter')).toBeInTheDocument();
    expect(screen.getByText('Longer')).toBeInTheDocument();
  });

  it('shows pinned facts in briefing', () => {
    renderWithProviders(
      <RewriteTool storyId="story-1" conversationId="conv-1" onRewrite={vi.fn()} hasContent />,
    );
    // 2 pinned facts: Rose and Nostalgia
    expect(screen.getByText('Rose')).toBeInTheDocument();
    expect(screen.getByText('Nostalgia')).toBeInTheDocument();
  });

  it('shows context summary in briefing', () => {
    renderWithProviders(
      <RewriteTool storyId="story-1" conversationId="conv-1" onRewrite={vi.fn()} hasContent />,
    );
    expect(screen.getByText(/A story about growing up in Boston/)).toBeInTheDocument();
  });

  it('calls onRewrite when button clicked', () => {
    const onRewrite = vi.fn();
    renderWithProviders(
      <RewriteTool storyId="story-1" conversationId="conv-1" onRewrite={onRewrite} hasContent />,
    );
    fireEvent.click(screen.getByRole('button', { name: /rewrite story/i }));
    expect(onRewrite).toHaveBeenCalledOnce();
  });

  it('shows Write Story label when hasContent is false', () => {
    renderWithProviders(
      <RewriteTool storyId="story-1" conversationId="conv-1" onRewrite={vi.fn()} hasContent={false} />,
    );
    expect(screen.getByRole('button', { name: /write story/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /write story/i })).not.toBeDisabled();
  });

  it('shows Rewriting label during streaming state', () => {
    useEvolveWorkspaceStore.getState().startRewrite('content');
    renderWithProviders(
      <RewriteTool storyId="story-1" conversationId="conv-1" onRewrite={vi.fn()} hasContent />,
    );
    expect(screen.getByText(/rewriting/i)).toBeInTheDocument();
  });

  it('shows Regenerate label during reviewing state', () => {
    useEvolveWorkspaceStore.getState().startRewrite('content');
    useEvolveWorkspaceStore.getState().completeRewrite();
    renderWithProviders(
      <RewriteTool storyId="story-1" conversationId="conv-1" onRewrite={vi.fn()} hasContent />,
    );
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
  });

  it('selects writing style on click', () => {
    renderWithProviders(
      <RewriteTool storyId="story-1" conversationId="conv-1" onRewrite={vi.fn()} hasContent />,
    );
    fireEvent.click(screen.getByText('Vivid'));
    expect(useEvolveWorkspaceStore.getState().writingStyle).toBe('vivid');
  });
});
