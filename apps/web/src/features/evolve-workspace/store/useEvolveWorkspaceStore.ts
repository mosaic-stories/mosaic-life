import { create } from 'zustand';
import type { WritingStyle, LengthPreference } from '@/lib/api/evolution';

export type ToolId = 'ai-chat' | 'context' | 'versions' | 'media' | 'style';
export type RewriteState = 'idle' | 'streaming' | 'reviewing';
export type ViewMode = 'editor' | 'diff';
export type CompareState = 'idle' | 'loading' | 'comparing';

interface EvolveWorkspaceState {
  // Tool panel
  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;

  // AI rewrite lifecycle
  rewriteState: RewriteState;
  rewriteContent: string | null;
  originalContent: string | null;
  viewMode: ViewMode;

  startRewrite: (currentContent: string) => void;
  appendRewriteChunk: (chunk: string) => void;
  completeRewrite: () => void;
  discardRewrite: () => void;
  acceptRewrite: () => void;
  setViewMode: (mode: ViewMode) => void;

  // Version comparison
  compareState: CompareState;
  compareVersionNumber: number | null;
  startCompare: (versionNumber: number, versionContent: string, currentDraftContent: string) => void;
  closeCompare: () => void;

  // Style preferences
  writingStyle: WritingStyle | null;
  lengthPreference: LengthPreference | null;
  setWritingStyle: (style: WritingStyle) => void;
  setLengthPreference: (pref: LengthPreference) => void;

  // Pinned context
  pinnedContextIds: string[];
  togglePinnedContext: (id: string) => void;

  // Persona selection
  activePersonaId: string;
  conversationIds: Record<string, string>;
  setActivePersona: (personaId: string) => void;
  setConversationForPersona: (personaId: string, conversationId: string) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  activeTool: 'ai-chat' as ToolId,
  rewriteState: 'idle' as RewriteState,
  rewriteContent: null as string | null,
  originalContent: null as string | null,
  viewMode: 'editor' as ViewMode,
  compareState: 'idle' as CompareState,
  compareVersionNumber: null as number | null,
  writingStyle: null as WritingStyle | null,
  lengthPreference: null as LengthPreference | null,
  pinnedContextIds: [] as string[],
  activePersonaId: 'biographer' as string,
  conversationIds: {} as Record<string, string>,
};

export const useEvolveWorkspaceStore = create<EvolveWorkspaceState>((set) => ({
  ...initialState,

  setActiveTool: (tool) => set({ activeTool: tool }),

  startRewrite: (currentContent) =>
    set({
      rewriteState: 'streaming',
      originalContent: currentContent,
      rewriteContent: '',
      compareState: 'idle',
      compareVersionNumber: null,
    }),

  appendRewriteChunk: (chunk) =>
    set((state) => ({
      rewriteContent: (state.rewriteContent ?? '') + chunk,
    })),

  completeRewrite: () => set({ rewriteState: 'reviewing' }),

  discardRewrite: () =>
    set({
      rewriteState: 'idle',
      rewriteContent: null,
      originalContent: null,
    }),

  acceptRewrite: () =>
    set({
      rewriteState: 'idle',
      rewriteContent: null,
      originalContent: null,
    }),

  setViewMode: (mode) => set({ viewMode: mode }),

  startCompare: (versionNumber, versionContent, currentDraftContent) =>
    set((state) => {
      if (state.rewriteState !== 'idle') return state;
      return {
        compareState: 'comparing',
        compareVersionNumber: versionNumber,
        originalContent: versionContent,
        rewriteContent: currentDraftContent,
        viewMode: 'diff',
      };
    }),

  closeCompare: () =>
    set({
      compareState: 'idle',
      compareVersionNumber: null,
      originalContent: null,
      rewriteContent: null,
      viewMode: 'editor',
    }),

  setWritingStyle: (style) => set({ writingStyle: style }),
  setLengthPreference: (pref) => set({ lengthPreference: pref }),

  togglePinnedContext: (id) =>
    set((state) => ({
      pinnedContextIds: state.pinnedContextIds.includes(id)
        ? state.pinnedContextIds.filter((p) => p !== id)
        : [...state.pinnedContextIds, id],
    })),

  setActivePersona: (personaId) => set({ activePersonaId: personaId }),

  setConversationForPersona: (personaId, conversationId) =>
    set((state) => ({
      conversationIds: { ...state.conversationIds, [personaId]: conversationId },
    })),

  reset: () => set(initialState),
}));
