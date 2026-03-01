# Persona Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to see which AI persona they're chatting with in the Evolve workspace and switch between Biographer and Friend personas.

**Architecture:** Add `activePersonaId` and a `conversationIds` map to the evolve workspace Zustand store. Refactor the conversation init effect to be persona-aware. Add a compact dropdown at the top of the AI chat panel using the existing `DropdownMenu` shadcn/ui component and the `usePersonas()` React Query hook. No backend changes needed.

**Tech Stack:** React, TypeScript, Zustand, TanStack Query, Radix DropdownMenu (shadcn/ui), Lucide icons, Vitest

**Design doc:** `docs/plans/2026-02-28-persona-selector-design.md`

---

## Key Context

**Phase 1 personas:** `biographer` and `friend` only (constant array — easy to expand later).

**Conversation model:** Separate conversation per persona per story. The backend `POST /api/ai/conversations/new` creates a new conversation for any persona. The `conversationIds` map in the workspace store tracks which conversation belongs to which persona during the current session.

**Seed messages:** `useConversationSeed` fires once per component mount via a `hasFiredRef`. To ensure it fires for each new persona conversation, we'll add `key={conversationId}` to the `AIChatTool` mount point so it fully remounts when the conversation changes.

**Existing persona data:** Backend returns personas via `GET /api/ai/personas` with `{ id, name, icon, description }`. Frontend has `usePersonas()` hook (1hr stale time) and a `PersonaIcon` component that maps icon strings (`BookOpen`, `Heart`, etc.) to Lucide icons.

---

### Task 1: Add persona state to workspace store ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts`
- Modify: `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`

**Step 1: Write the failing tests**

Add to the end of `useEvolveWorkspaceStore.test.ts` (before the final `});`):

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`

Expected: FAIL — `activePersonaId` is undefined, `setActivePersona` is not a function, etc.

**Step 3: Add persona state to the store**

In `useEvolveWorkspaceStore.ts`:

Add to the `EvolveWorkspaceState` interface (after the pinned context section, before reset):

```typescript
  // Persona selection
  activePersonaId: string;
  conversationIds: Record<string, string>;
  setActivePersona: (personaId: string) => void;
  setConversationForPersona: (personaId: string, conversationId: string) => void;
```

Add to `initialState` (after `pinnedContextIds`):

```typescript
  activePersonaId: 'biographer' as string,
  conversationIds: {} as Record<string, string>,
```

Add to the store creation (after `togglePinnedContext`, before `reset`):

```typescript
  setActivePersona: (personaId) => set({ activePersonaId: personaId }),

  setConversationForPersona: (personaId, conversationId) =>
    set((state) => ({
      conversationIds: { ...state.conversationIds, [personaId]: conversationId },
    })),
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`

Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts
git commit -m "feat: add persona selection state to evolve workspace store"
```

---

### Task 2: Refactor conversation init in EvolveWorkspace ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`

**Step 1: Read store values for persona state**

In `EvolveWorkspace.tsx`, add store selectors after the existing ones (after line 58):

```typescript
  const activePersonaId = useEvolveWorkspaceStore((s) => s.activePersonaId);
  const conversationIds = useEvolveWorkspaceStore((s) => s.conversationIds);
  const setConversationForPersona = useEvolveWorkspaceStore((s) => s.setConversationForPersona);
```

**Step 2: Remove local conversationId useState**

Remove this line (line 49):
```typescript
  const [conversationId, setConversationId] = useState<string | null>(null);
```

Replace it with a derived value:
```typescript
  const conversationId = conversationIds[activePersonaId] ?? null;
```

**Step 3: Replace the conversation init useEffect**

Replace the existing `useEffect` at lines 64-89 with two separate effects:

```typescript
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
```

**Step 4: Verify build compiles**

Run: `cd apps/web && npx tsc --noEmit`

Expected: No type errors. The `conversationId` variable type is now `string | null` (same as before), so all downstream consumers (ToolPanel, MobileToolSheet, handleRewrite) work without changes.

**Step 5: Commit**

```bash
git add apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx
git commit -m "feat: make conversation init persona-aware in evolve workspace"
```

---

### Task 3: Create PersonaSelector component ✅

**Files:**
- Create: `apps/web/src/features/evolve-workspace/components/PersonaSelector.tsx`

**Step 1: Create the component**

```tsx
import { ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { usePersonas } from '@/features/ai-chat/hooks/useAIChat';
import { PersonaIcon } from '@/features/ai-chat/components/PersonaIcon';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';

const PHASE_1_PERSONAS = ['biographer', 'friend'];

export function PersonaSelector({ disabled }: { disabled?: boolean }) {
  const activePersonaId = useEvolveWorkspaceStore((s) => s.activePersonaId);
  const setActivePersona = useEvolveWorkspaceStore((s) => s.setActivePersona);
  const { data: personas } = usePersonas();

  const available = personas?.filter((p) => PHASE_1_PERSONAS.includes(p.id)) ?? [];
  const active = available.find((p) => p.id === activePersonaId);

  return (
    <div className="px-3 py-2 border-b shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between h-auto py-1.5 px-2 font-normal"
            disabled={disabled}
          >
            <span className="flex items-center gap-2 min-w-0">
              {active && <PersonaIcon iconName={active.icon} />}
              <span className="text-sm font-medium truncate">
                {active?.name ?? 'Select persona'}
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
          {available.map((persona) => (
            <DropdownMenuItem
              key={persona.id}
              onClick={() => setActivePersona(persona.id)}
              className="flex items-center gap-2"
            >
              <PersonaIcon iconName={persona.icon} />
              <span className="flex-1 text-sm">{persona.name}</span>
              {persona.id === activePersonaId && (
                <Check className="h-4 w-4 text-theme-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

**Step 2: Verify build compiles**

Run: `cd apps/web && npx tsc --noEmit`

Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/PersonaSelector.tsx
git commit -m "feat: add PersonaSelector dropdown component"
```

---

### Task 4: Wire PersonaSelector into AIChatTool and update mount points ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/tools/AIChatTool.tsx`
- Modify: `apps/web/src/features/evolve-workspace/components/ToolPanel.tsx`
- Modify: `apps/web/src/features/evolve-workspace/components/MobileToolSheet.tsx`

**Step 1: Update AIChatTool to use store persona and show selector**

Replace the full content of `AIChatTool.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import { Send, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAIChat } from '@/features/ai-chat/hooks/useAIChat';
import { useConversationSeed } from '../hooks/useConversationSeed';
import { PersonaSelector } from '../components/PersonaSelector';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';

interface AIChatToolProps {
  legacyId: string;
  storyId: string;
  conversationId: string | null;
}

export function AIChatTool({ legacyId, storyId, conversationId }: AIChatToolProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activePersonaId = useEvolveWorkspaceStore((s) => s.activePersonaId);

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    retryLastMessage,
    clearError,
  } = useAIChat({
    legacyId,
    personaId: activePersonaId,
    conversationId,
  });

  // Stream opening message when conversation is empty
  useConversationSeed(conversationId, storyId);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Persona selector */}
      <PersonaSelector disabled={isStreaming} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <p className="text-sm text-neutral-400 text-center py-8">
            Preparing your AI companion...
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg px-3 py-2 ${
              msg.role === 'user'
                ? 'bg-theme-primary/10 ml-4'
                : msg.role === 'assistant'
                  ? 'bg-neutral-50 mr-4'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {msg.role === 'assistant' && msg.status === 'streaming' ? (
              <Streamdown isAnimating={true} caret="block">
                {msg.content}
              </Streamdown>
            ) : (
              <span className="whitespace-pre-wrap">{msg.content}</span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 text-red-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={retryLastMessage}>
              <RotateCcw className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t shrink-0">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the story..."
            className="min-h-[60px] max-h-[120px] text-sm resize-none"
            disabled={isStreaming}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add `key={conversationId}` to AIChatTool in ToolPanel**

This ensures full remount when persona changes (so `useConversationSeed`'s `hasFiredRef` resets).

In `ToolPanel.tsx`, change line 27-31 from:

```tsx
          <AIChatTool
            legacyId={legacyId}
            storyId={storyId}
            conversationId={conversationId}
          />
```

to:

```tsx
          <AIChatTool
            key={conversationId}
            legacyId={legacyId}
            storyId={storyId}
            conversationId={conversationId}
          />
```

**Step 3: Add `key={conversationId}` to AIChatTool in MobileToolSheet**

In `MobileToolSheet.tsx`, change line 38 from:

```tsx
            <AIChatTool legacyId={legacyId} storyId={storyId} conversationId={conversationId} />
```

to:

```tsx
            <AIChatTool key={conversationId} legacyId={legacyId} storyId={storyId} conversationId={conversationId} />
```

**Step 4: Verify build compiles**

Run: `cd apps/web && npx tsc --noEmit`

Expected: No type errors.

**Step 5: Run all existing store tests**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/`

Expected: ALL PASS

**Step 6: Commit**

```bash
git add apps/web/src/features/evolve-workspace/tools/AIChatTool.tsx apps/web/src/features/evolve-workspace/components/ToolPanel.tsx apps/web/src/features/evolve-workspace/components/MobileToolSheet.tsx
git commit -m "feat: wire persona selector into AI chat panel with remount on switch"
```

---

### Task 5: Smoke test

No automated E2E tests for this feature. Perform manual verification:

**Step 1: Start the dev environment**

```bash
docker compose -f infra/compose/docker-compose.yml up -d
cd apps/web && npm run dev
```

**Step 2: Navigate to an evolve workspace for any story**

Open a story and enter the Evolve workspace.

**Step 3: Verify default state**

- [ ] AI chat panel shows "The Biographer" in the dropdown header
- [ ] Seed message streams in from the biographer persona
- [ ] Send a test message and receive a response

**Step 4: Switch to Friend persona**

- [ ] Click the dropdown and select "The Friend"
- [ ] Chat clears (new conversation)
- [ ] Seed message streams in from the friend persona
- [ ] Send a test message and receive a response

**Step 5: Switch back to Biographer**

- [ ] Click dropdown and select "The Biographer"
- [ ] Previous biographer messages are restored (not a blank conversation)
- [ ] No seed message fires (conversation already has messages)

**Step 6: Verify streaming lock**

- [ ] While an AI response is streaming, the persona dropdown is disabled/non-clickable

**Step 7: Verify mobile**

- [ ] Open mobile layout (resize browser to < 768px)
- [ ] Open AI chat from bottom bar
- [ ] Persona selector appears and works in the mobile drawer

---

## File Change Summary

| File | Action | Lines Changed (approx) |
|------|--------|----------------------|
| `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts` | Modify | +10 |
| `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts` | Modify | +35 |
| `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx` | Modify | +15 / -10 |
| `apps/web/src/features/evolve-workspace/components/PersonaSelector.tsx` | Create | ~55 |
| `apps/web/src/features/evolve-workspace/tools/AIChatTool.tsx` | Modify | +5 / -2 |
| `apps/web/src/features/evolve-workspace/components/ToolPanel.tsx` | Modify | +1 |
| `apps/web/src/features/evolve-workspace/components/MobileToolSheet.tsx` | Modify | +1 |
| **Total** | | ~120 LOC |
