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
});
