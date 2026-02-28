import { describe, it, expect, beforeEach } from 'vitest';
import { useEvolveWorkspaceStore } from './useEvolveWorkspaceStore';

describe('useEvolveWorkspaceStore', () => {
  beforeEach(() => {
    useEvolveWorkspaceStore.getState().reset();
  });

  it('defaults to ai-chat tool', () => {
    expect(useEvolveWorkspaceStore.getState().activeTool).toBe('ai-chat');
  });

  it('defaults to idle rewrite state', () => {
    expect(useEvolveWorkspaceStore.getState().rewriteState).toBe('idle');
  });

  it('defaults to editor view mode', () => {
    expect(useEvolveWorkspaceStore.getState().viewMode).toBe('editor');
  });

  it('setActiveTool changes the active tool', () => {
    useEvolveWorkspaceStore.getState().setActiveTool('versions');
    expect(useEvolveWorkspaceStore.getState().activeTool).toBe('versions');
  });

  it('startRewrite snapshots original and sets streaming', () => {
    useEvolveWorkspaceStore.getState().startRewrite('original content');
    const state = useEvolveWorkspaceStore.getState();
    expect(state.rewriteState).toBe('streaming');
    expect(state.originalContent).toBe('original content');
    expect(state.rewriteContent).toBe('');
  });

  it('appendRewriteChunk accumulates content', () => {
    useEvolveWorkspaceStore.getState().startRewrite('original');
    useEvolveWorkspaceStore.getState().appendRewriteChunk('Hello ');
    useEvolveWorkspaceStore.getState().appendRewriteChunk('world');
    expect(useEvolveWorkspaceStore.getState().rewriteContent).toBe('Hello world');
  });

  it('completeRewrite transitions to reviewing', () => {
    useEvolveWorkspaceStore.getState().startRewrite('original');
    useEvolveWorkspaceStore.getState().completeRewrite();
    expect(useEvolveWorkspaceStore.getState().rewriteState).toBe('reviewing');
  });

  it('discardRewrite resets to idle', () => {
    useEvolveWorkspaceStore.getState().startRewrite('original');
    useEvolveWorkspaceStore.getState().appendRewriteChunk('new');
    useEvolveWorkspaceStore.getState().discardRewrite();
    const state = useEvolveWorkspaceStore.getState();
    expect(state.rewriteState).toBe('idle');
    expect(state.rewriteContent).toBeNull();
    expect(state.originalContent).toBeNull();
  });

  it('togglePinnedContext adds and removes IDs', () => {
    useEvolveWorkspaceStore.getState().togglePinnedContext('ent-1');
    expect(useEvolveWorkspaceStore.getState().pinnedContextIds).toEqual(['ent-1']);
    useEvolveWorkspaceStore.getState().togglePinnedContext('ent-1');
    expect(useEvolveWorkspaceStore.getState().pinnedContextIds).toEqual([]);
  });

  it('setWritingStyle updates style', () => {
    useEvolveWorkspaceStore.getState().setWritingStyle('emotional');
    expect(useEvolveWorkspaceStore.getState().writingStyle).toBe('emotional');
  });

  it('setLengthPreference updates preference', () => {
    useEvolveWorkspaceStore.getState().setLengthPreference('longer');
    expect(useEvolveWorkspaceStore.getState().lengthPreference).toBe('longer');
  });

  // --- Version comparison ---

  it('defaults to idle compare state', () => {
    expect(useEvolveWorkspaceStore.getState().compareState).toBe('idle');
  });

  it('defaults to null compare version number', () => {
    expect(useEvolveWorkspaceStore.getState().compareVersionNumber).toBeNull();
  });

  it('startCompare sets comparing state with content', () => {
    useEvolveWorkspaceStore.getState().startCompare(2, 'old version text', 'current draft text');
    const state = useEvolveWorkspaceStore.getState();
    expect(state.compareState).toBe('comparing');
    expect(state.compareVersionNumber).toBe(2);
    expect(state.originalContent).toBe('old version text');
    expect(state.rewriteContent).toBe('current draft text');
    expect(state.viewMode).toBe('diff');
  });

  it('closeCompare resets to idle', () => {
    useEvolveWorkspaceStore.getState().startCompare(2, 'old', 'new');
    useEvolveWorkspaceStore.getState().closeCompare();
    const state = useEvolveWorkspaceStore.getState();
    expect(state.compareState).toBe('idle');
    expect(state.compareVersionNumber).toBeNull();
    expect(state.originalContent).toBeNull();
    expect(state.rewriteContent).toBeNull();
    expect(state.viewMode).toBe('editor');
  });

  it('startCompare is blocked during rewrite', () => {
    useEvolveWorkspaceStore.getState().startRewrite('original');
    useEvolveWorkspaceStore.getState().startCompare(2, 'old', 'new');
    const state = useEvolveWorkspaceStore.getState();
    expect(state.compareState).toBe('idle');
    expect(state.rewriteState).toBe('streaming');
  });

  it('startRewrite auto-closes active comparison', () => {
    useEvolveWorkspaceStore.getState().startCompare(2, 'old', 'new');
    expect(useEvolveWorkspaceStore.getState().compareState).toBe('comparing');
    useEvolveWorkspaceStore.getState().startRewrite('draft content');
    const state = useEvolveWorkspaceStore.getState();
    expect(state.compareState).toBe('idle');
    expect(state.compareVersionNumber).toBeNull();
    expect(state.rewriteState).toBe('streaming');
  });

  it('reset clears comparison state', () => {
    useEvolveWorkspaceStore.getState().startCompare(3, 'old', 'new');
    useEvolveWorkspaceStore.getState().reset();
    const state = useEvolveWorkspaceStore.getState();
    expect(state.compareState).toBe('idle');
    expect(state.compareVersionNumber).toBeNull();
  });

  // --- Persona selection ---

  it('defaults to biographer persona', () => {
    expect(useEvolveWorkspaceStore.getState().activePersonaId).toBe('biographer');
  });

  it('defaults to empty conversationIds', () => {
    expect(useEvolveWorkspaceStore.getState().conversationIds).toEqual({});
  });

  it('setActivePersona changes the active persona', () => {
    useEvolveWorkspaceStore.getState().setActivePersona('friend');
    expect(useEvolveWorkspaceStore.getState().activePersonaId).toBe('friend');
  });

  it('setConversationForPersona stores conversation ID in map', () => {
    useEvolveWorkspaceStore.getState().setConversationForPersona('biographer', 'conv-123');
    expect(useEvolveWorkspaceStore.getState().conversationIds).toEqual({ biographer: 'conv-123' });
  });

  it('setConversationForPersona preserves other persona entries', () => {
    useEvolveWorkspaceStore.getState().setConversationForPersona('biographer', 'conv-1');
    useEvolveWorkspaceStore.getState().setConversationForPersona('friend', 'conv-2');
    expect(useEvolveWorkspaceStore.getState().conversationIds).toEqual({
      biographer: 'conv-1',
      friend: 'conv-2',
    });
  });

  it('reset clears persona state', () => {
    useEvolveWorkspaceStore.getState().setActivePersona('friend');
    useEvolveWorkspaceStore.getState().setConversationForPersona('friend', 'conv-99');
    useEvolveWorkspaceStore.getState().reset();
    const state = useEvolveWorkspaceStore.getState();
    expect(state.activePersonaId).toBe('biographer');
    expect(state.conversationIds).toEqual({});
  });
});
