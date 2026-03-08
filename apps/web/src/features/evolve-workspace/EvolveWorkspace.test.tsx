import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock react-router-dom before imports
const mockSearchParams = new URLSearchParams();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ storyId: 'story-1', legacyId: 'legacy-1' }),
    useNavigate: () => vi.fn(),
    useSearchParams: () => [mockSearchParams],
  };
});

import { useEvolveWorkspaceStore } from './store/useEvolveWorkspaceStore';

describe('EvolveWorkspace conversation handoff', () => {
  beforeEach(() => {
    useEvolveWorkspaceStore.getState().reset();
    mockSearchParams.delete('conversation_id');
  });

  it('should set conversation from URL query param', async () => {
    mockSearchParams.set('conversation_id', 'conv-from-evolve');

    // Simulate the effect logic: when evolveConversationId is present and
    // no conversation exists for the active persona, set it directly.
    const store = useEvolveWorkspaceStore.getState();
    const activePersonaId = store.activePersonaId;
    const evolveConversationId = mockSearchParams.get('conversation_id');

    if (evolveConversationId && !store.conversationIds[activePersonaId]) {
      store.setConversationForPersona(activePersonaId, evolveConversationId);
    }

    const updated = useEvolveWorkspaceStore.getState();
    expect(updated.conversationIds[activePersonaId]).toBe('conv-from-evolve');
  });

  it('should not override existing conversation for persona', () => {
    useEvolveWorkspaceStore.getState().setConversationForPersona('biographer', 'existing-conv');

    mockSearchParams.set('conversation_id', 'conv-from-evolve');
    const evolveConversationId = mockSearchParams.get('conversation_id');

    // Re-read state after the mutation so the guard sees the existing conversation.
    const current = useEvolveWorkspaceStore.getState();

    // Should NOT override because conversation already exists
    if (evolveConversationId && !current.conversationIds['biographer']) {
      current.setConversationForPersona('biographer', evolveConversationId);
    }

    const updated = useEvolveWorkspaceStore.getState();
    expect(updated.conversationIds['biographer']).toBe('existing-conv');
  });
});
