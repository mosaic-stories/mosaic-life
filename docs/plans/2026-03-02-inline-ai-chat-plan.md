# Inline AI Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Embed the AI chat interface directly in the Legacy detail page's AI tab, replacing demo cards and eliminating the separate chat page.

**Architecture:** Replace `AISection` (demo card layout) with inline chat using existing hooks (`useAIChat`, `usePersonas`, `useConversationList`) and sub-components (`MessageList`, `ChatInput`, `ConversationHistoryPopover`). Delete standalone page components, sidebar, and routes. Persona selection becomes horizontal pills.

**Tech Stack:** React, TypeScript, TanStack Query, Zustand, Tailwind CSS, Lucide icons

---

### Task 1: Update SectionNav — rename tab and remove Demo badge ✅ DONE

**Files:**
- Modify: `apps/web/src/features/legacy/components/SectionNav.tsx:46-54`

**Step 1: Remove DemoBadge and rename tab**

Replace the entire file content of `SectionNav.tsx`. Remove the `DemoBadge` component and the `Badge` import. Change tab label from "AI Interactions" to "AI Chat".

```tsx
import { Link2, Sparkles } from 'lucide-react';

export type SectionId = 'stories' | 'media' | 'links' | 'ai';

export interface SectionNavProps {
  activeSection: SectionId;
  onSectionChange: (section: SectionId) => void;
}

export default function SectionNav({ activeSection, onSectionChange }: SectionNavProps) {
  const baseClass = 'py-4 border-b-2 transition-colors';
  const activeClass = 'border-theme-primary text-neutral-900';
  const inactiveClass = 'border-transparent text-neutral-500 hover:text-neutral-900';

  return (
    <nav className="bg-white/90 backdrop-blur-sm border-b sticky top-[73px] z-30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex gap-8">
          <button
            onClick={() => onSectionChange('stories')}
            className={`${baseClass} ${activeSection === 'stories' ? activeClass : inactiveClass}`}
          >
            Stories
          </button>
          <button
            onClick={() => onSectionChange('media')}
            className={`${baseClass} ${activeSection === 'media' ? activeClass : inactiveClass}`}
          >
            Media Gallery
          </button>
          <button
            onClick={() => onSectionChange('links')}
            className={`${baseClass} ${activeSection === 'links' ? activeClass : inactiveClass} flex items-center gap-2`}
          >
            <Link2 className="size-4" />
            Linked Legacies
          </button>
          <button
            onClick={() => onSectionChange('ai')}
            className={`${baseClass} ${activeSection === 'ai' ? activeClass : inactiveClass} flex items-center gap-2`}
          >
            <Sparkles className="size-4" />
            AI Chat
          </button>
        </div>
      </div>
    </nav>
  );
}
```

**Step 2: Verify the app compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors related to SectionNav

**Step 3: Commit**

```bash
git add apps/web/src/features/legacy/components/SectionNav.tsx
git commit -m "refactor: rename AI Interactions tab to AI Chat and remove Demo badge"
```

---

### Task 2: Rebuild AISection as inline chat host ✅ DONE

**Files:**
- Modify: `apps/web/src/features/legacy/components/AISection.tsx` (full rewrite)
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx:222-229` (update AISection props)

**Step 1: Rewrite AISection.tsx**

Replace the entire file. The new component:
- Takes `legacyId` (string) as its only prop
- Uses `usePersonas()` to fetch and filter personas (biographer, friend)
- Uses `useAIChat()` for conversation management and messaging
- Uses `useConversationList()` and `useDeleteConversation()` for history
- Renders persona pills, toolbar (New Chat + History), `MessageList`, and `ChatInput`
- Uses `usePrevious` hook to restore focus after streaming

```tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import { useAIChat, usePersonas, useConversationList, useDeleteConversation } from '@/features/ai-chat/hooks/useAIChat';
import { usePrevious } from '@/hooks/usePrevious';
import { MessageList } from '@/features/ai-chat/components/MessageList';
import { ChatInput } from '@/features/ai-chat/components/ChatInput';
import { ConversationHistoryPopover } from '@/features/ai-chat/components/ConversationHistoryPopover';
import { PersonaIcon } from '@/features/ai-chat/components/PersonaIcon';
import { getPersonaColor } from '@/features/ai-chat/components/utils';
import type { Persona } from '@/features/ai-chat/api/ai';

export interface AISectionProps {
  legacyId: string;
}

const ALLOWED_PERSONAS = ['biographer', 'friend'];

export default function AISection({ legacyId }: AISectionProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('biographer');
  const [inputMessage, setInputMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch personas
  const { data: allPersonas, isLoading: personasLoading, error: personasError } = usePersonas();
  const personas = useMemo(
    () => allPersonas?.filter((p) => ALLOWED_PERSONAS.includes(p.id)) || [],
    [allPersonas]
  );

  // Conversation list + delete for history
  const { data: conversationList } = useConversationList(legacyId, selectedPersonaId);
  const deleteConversationMutation = useDeleteConversation(legacyId, selectedPersonaId);

  // Main chat hook
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    retryLastMessage,
    clearError,
    startNewConversation,
  } = useAIChat({
    legacyId,
    personaId: selectedPersonaId,
    conversationId: selectedConversationId,
  });

  const selectedPersona = personas.find((p) => p.id === selectedPersonaId);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Restore focus after streaming
  const wasStreaming = usePrevious(isStreaming);
  useEffect(() => {
    if (wasStreaming && !isStreaming && !isLoading) {
      const rafId = requestAnimationFrame(() => {
        setTimeout(() => {
          if (inputRef.current && !inputRef.current.disabled) {
            inputRef.current.focus();
          }
        }, 0);
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [isStreaming, isLoading, wasStreaming]);

  // Set initial persona when personas load
  useEffect(() => {
    if (personas.length > 0 && !personas.find((p) => p.id === selectedPersonaId)) {
      setSelectedPersonaId(personas[0].id);
    }
  }, [personas, selectedPersonaId]);

  // Reset conversation when persona changes
  useEffect(() => {
    setSelectedConversationId(null);
  }, [selectedPersonaId]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isStreaming) return;
    const content = inputMessage.trim();
    setInputMessage('');
    await sendMessage(content);
  };

  const handleNewChat = async () => {
    try {
      const newConversationId = await startNewConversation();
      setSelectedConversationId(newConversationId);
    } catch (err) {
      console.error('Failed to start new conversation:', err);
    }
  };

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversationMutation.mutateAsync(conversationId);
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(null);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Loading state
  if (personasLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-amber-600" />
          <p className="text-neutral-600">Loading AI agents...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (personasError) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="size-12 text-red-500" />
          <h2 className="text-xl font-semibold text-neutral-900">Failed to load AI agents</h2>
          <p className="text-neutral-600">Please try refreshing the page.</p>
          <Button onClick={() => window.location.reload()}>Refresh Page</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
      {/* Persona pills + toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex gap-2">
          {personas.map((persona) => (
            <PersonaPill
              key={persona.id}
              persona={persona}
              isSelected={persona.id === selectedPersonaId}
              onClick={() => setSelectedPersonaId(persona.id)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleNewChat} className="gap-1">
            <Plus className="size-4" />
            <span className="hidden sm:inline">New Chat</span>
          </Button>
          <ConversationHistoryPopover
            open={showHistory}
            onOpenChange={setShowHistory}
            conversations={conversationList}
            selectedConversationId={selectedConversationId}
            onSelectConversation={(id) => {
              setSelectedConversationId(id);
            }}
            onDeleteConversation={handleDeleteConversation}
            isDeleting={deleteConversationMutation.isPending}
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-red-700 min-w-0">
            <AlertCircle className="size-4 flex-shrink-0" />
            <span className="text-sm truncate">{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearError} className="text-red-700 flex-shrink-0">
            Dismiss
          </Button>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-neutral-50 rounded-xl border overflow-hidden min-h-0">
        {/* Streaming indicator */}
        {isStreaming && (
          <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" />
            {selectedPersona?.name || 'Agent'} is thinking...
          </div>
        )}

        <MessageList
          ref={messagesEndRef}
          messages={messages}
          isLoading={isLoading}
          selectedPersona={selectedPersona}
          selectedPersonaId={selectedPersonaId}
          onRetry={retryLastMessage}
        />

        <ChatInput
          ref={inputRef}
          inputMessage={inputMessage}
          onInputChange={setInputMessage}
          onSend={handleSendMessage}
          isStreaming={isStreaming}
          isLoading={isLoading}
          personaName={selectedPersona?.name}
        />
      </div>
    </div>
  );
}

/** Compact persona pill button */
function PersonaPill({
  persona,
  isSelected,
  onClick,
}: {
  persona: Persona;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all',
        isSelected
          ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-sm'
          : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
      )}
    >
      <div className={cn('size-6 rounded-full flex items-center justify-center', getPersonaColor(persona.id))}>
        <PersonaIcon iconName={persona.icon} />
      </div>
      {persona.name}
    </button>
  );
}
```

**Step 2: Update LegacyProfile to pass new props**

In `LegacyProfile.tsx`, the `AISection` currently receives `legacyName`, `onChatClick`, and `onPanelClick`. Change it to just receive `legacyId`.

Find this block (lines 223-229):
```tsx
        {activeSection === 'ai' && (
          <AISection
            legacyName={legacy.name}
            onChatClick={() => navigate(`/legacy/${legacyId}/ai-chat`)}
            onPanelClick={() => navigate(`/legacy/${legacyId}/ai-panel`)}
          />
        )}
```

Replace with:
```tsx
        {activeSection === 'ai' && (
          <AISection legacyId={legacyId} />
        )}
```

**Step 3: Verify the app compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/components/AISection.tsx apps/web/src/features/legacy/components/LegacyProfile.tsx
git commit -m "feat: embed AI chat directly in Legacy detail page AI tab"
```

---

### Task 3: Remove standalone routes ✅ DONE

**Files:**
- Modify: `apps/web/src/routes/index.tsx:18-19,150-165`

**Step 1: Remove AI chat and AI panel route entries**

In `routes/index.tsx`, remove:
1. The lazy import for `AIAgentChat` (line 18)
2. The lazy import for `AIAgentPanel` (line 19)
3. The route entry for `legacy/:legacyId/ai-chat` (lines 150-157)
4. The route entry for `legacy/:legacyId/ai-panel` (lines 158-165)

Remove these two lines:
```tsx
const AIAgentChat = lazy(() => import('@/features/ai-chat/components/AIAgentChat'));
const AIAgentPanel = lazy(() => import('@/features/ai-chat/components/AIAgentPanel'));
```

Remove these two route blocks:
```tsx
      {
        path: 'legacy/:legacyId/ai-chat',
        element: (
          <ProtectedRoute>
            <LazyPage><WithLegacyId Component={AIAgentChat} /></LazyPage>
          </ProtectedRoute>
        ),
      },
      {
        path: 'legacy/:legacyId/ai-panel',
        element: (
          <ProtectedRoute>
            <LazyPage><WithLegacyId Component={AIAgentPanel} /></LazyPage>
          </ProtectedRoute>
        ),
      },
```

**Step 2: Verify the app compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "refactor: remove standalone AI chat and AI panel routes"
```

---

### Task 4: Delete dead components ✅ DONE

**Files:**
- Delete: `apps/web/src/features/ai-chat/components/AIAgentChat.tsx`
- Delete: `apps/web/src/features/ai-chat/components/AIAgentPanel.tsx`
- Delete: `apps/web/src/features/ai-chat/components/AgentSidebar.tsx`
- Delete: `apps/web/src/features/ai-chat/components/MobileAgentSheet.tsx`
- Delete: `apps/web/src/features/ai-chat/components/ChatHeader.tsx`
- Delete: `apps/web/src/features/ai-chat/components/PersonaCard.tsx`

**Step 1: Delete all 6 files**

```bash
rm apps/web/src/features/ai-chat/components/AIAgentChat.tsx
rm apps/web/src/features/ai-chat/components/AIAgentPanel.tsx
rm apps/web/src/features/ai-chat/components/AgentSidebar.tsx
rm apps/web/src/features/ai-chat/components/MobileAgentSheet.tsx
rm apps/web/src/features/ai-chat/components/ChatHeader.tsx
rm apps/web/src/features/ai-chat/components/PersonaCard.tsx
```

**Step 2: Update the barrel export**

In `apps/web/src/features/ai-chat/index.ts`, remove the two deleted default exports. The file should become:

```ts
export * from './api/ai';
export * from './hooks/useAIChat';
```

**Step 3: Verify no broken imports remain**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors. All imports of deleted components were self-contained (only imported by each other and by `AIAgentChat.tsx` which is also deleted).

**Step 4: Commit**

```bash
git add -A apps/web/src/features/ai-chat/
git commit -m "refactor: delete standalone AI chat page components and update exports"
```

---

### Task 5: Manual smoke test ✅ DONE (compilation verified; manual browser testing deferred to user)

**Step 1: Start the dev server**

Run: `cd apps/web && npm run dev`

**Step 2: Verify the AI Chat tab**

1. Navigate to a legacy detail page (e.g., `/legacy/<some-id>`)
2. Click the "AI Chat" tab — should show persona pills (Biographer, The Friend) and an empty chat area
3. Type a message and send — should see streaming response
4. Switch persona — should reset to new conversation
5. Click "New Chat" — should start fresh conversation
6. Open History dropdown — should show past conversations
7. Verify responsive: resize to mobile width — pills should still be usable

**Step 3: Verify deleted routes return 404**

1. Navigate directly to `/legacy/<id>/ai-chat` — should redirect to catch-all (home page)
2. Navigate directly to `/legacy/<id>/ai-panel` — should redirect to catch-all (home page)

**Step 4: Commit any fixes if needed**

---

### Task 6: Run linting and type checks ✅ DONE

**Step 1: Run TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 2: Run ESLint**

Run: `cd apps/web && npm run lint`
Expected: No errors related to changed files

**Step 3: Run existing tests**

Run: `cd apps/web && npm run test -- --run`
Expected: All tests pass. No existing tests reference the deleted components.

**Step 4: Final commit if any lint fixes were needed**

```bash
git add -A
git commit -m "chore: lint fixes for inline AI chat refactor"
```
