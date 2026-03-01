# Rewrite Briefing Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the disconnected bottom-bar AI Rewrite button with a Rewrite tool panel that shows what feeds the rewrite and absorbs the Style panel's controls.

**Architecture:** Frontend-only change. The Rewrite tool becomes a new panel in the existing ToolStrip/ToolPanel system, absorbing StyleTool. BottomToolbar is removed. The rewrite API request shape is unchanged — we're reorganizing where the frontend gathers and displays the inputs.

**Tech Stack:** React, TypeScript, Zustand, TanStack Query, Lucide icons, Vitest, React Testing Library

**Design doc:** `docs/plans/2026-03-01-rewrite-briefing-panel-design.md`

---

### Task 1: Update Zustand Store — Replace `'style'` with `'rewrite'` in ToolId ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts:5`
- Modify: `apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`

**Step 1: Update the failing test**

In `useEvolveWorkspaceStore.test.ts`, add a test that `'rewrite'` is a valid tool and the old `'style'` value is no longer accepted:

```typescript
it('setActiveTool accepts rewrite tool', () => {
  useEvolveWorkspaceStore.getState().setActiveTool('rewrite');
  expect(useEvolveWorkspaceStore.getState().activeTool).toBe('rewrite');
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`
Expected: TypeScript compilation error — `'rewrite'` is not assignable to `ToolId`

**Step 3: Update the ToolId type**

In `useEvolveWorkspaceStore.ts` line 5, change:

```typescript
// Before
export type ToolId = 'ai-chat' | 'context' | 'versions' | 'media' | 'style';

// After
export type ToolId = 'ai-chat' | 'context' | 'versions' | 'media' | 'rewrite';
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.ts apps/web/src/features/evolve-workspace/store/useEvolveWorkspaceStore.test.ts
git commit -m "feat(evolve): replace 'style' with 'rewrite' in ToolId type"
```

---

### Task 2: Create RewriteTool Component ✅

**Files:**
- Create: `apps/web/src/features/evolve-workspace/tools/RewriteTool.tsx`
- Create: `apps/web/src/features/evolve-workspace/tools/RewriteTool.test.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/features/evolve-workspace/tools/RewriteTool.test.tsx`:

```tsx
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

  it('disables button when hasContent is false', () => {
    renderWithProviders(
      <RewriteTool storyId="story-1" conversationId="conv-1" onRewrite={vi.fn()} hasContent={false} />,
    );
    expect(screen.getByRole('button', { name: /rewrite story/i })).toBeDisabled();
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
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/tools/RewriteTool.test.tsx`
Expected: FAIL — module `./RewriteTool` not found

**Step 3: Implement RewriteTool**

Create `apps/web/src/features/evolve-workspace/tools/RewriteTool.tsx`:

```tsx
import {
  Sparkles,
  Eye,
  Heart,
  MessageCircle,
  AlignLeft,
  FileText,
  Loader2,
  User,
  MapPin,
  Calendar,
  Link2,
  Package,
  GitBranch,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { useStoryContext } from '../hooks/useStoryContext';
import { usePersonas } from '@/features/ai-chat/hooks/useAIChat';
import { useAIChatStore } from '@/features/ai-chat/store/aiChatStore';
import type { WritingStyle, LengthPreference } from '@/lib/api/evolution';
import type { FactCategory } from '../api/storyContext';

const WRITING_STYLES: {
  id: WritingStyle;
  label: string;
  description: string;
  icon: typeof Eye;
}[] = [
  { id: 'vivid', label: 'Vivid', description: 'Sensory details, atmosphere', icon: Eye },
  { id: 'emotional', label: 'Emotional', description: 'Feelings, relationships', icon: Heart },
  { id: 'conversational', label: 'Conversational', description: 'Informal, personal', icon: MessageCircle },
  { id: 'concise', label: 'Concise', description: 'Tight, impactful', icon: AlignLeft },
  { id: 'documentary', label: 'Documentary', description: 'Factual, chronological', icon: FileText },
];

const LENGTH_OPTIONS: { id: LengthPreference; label: string }[] = [
  { id: 'similar', label: 'Similar' },
  { id: 'shorter', label: 'Shorter' },
  { id: 'longer', label: 'Longer' },
];

const CATEGORY_ICONS: Record<FactCategory, typeof User> = {
  person: User,
  place: MapPin,
  date: Calendar,
  event: Sparkles,
  emotion: Heart,
  relationship: Link2,
  object: Package,
};

interface RewriteToolProps {
  storyId: string;
  conversationId: string | null;
  onRewrite: () => void;
  onCancel?: () => void;
  hasContent: boolean;
}

export function RewriteTool({ storyId, conversationId, onRewrite, onCancel, hasContent }: RewriteToolProps) {
  const rewriteState = useEvolveWorkspaceStore((s) => s.rewriteState);
  const compareState = useEvolveWorkspaceStore((s) => s.compareState);
  const writingStyle = useEvolveWorkspaceStore((s) => s.writingStyle);
  const lengthPreference = useEvolveWorkspaceStore((s) => s.lengthPreference);
  const setWritingStyle = useEvolveWorkspaceStore((s) => s.setWritingStyle);
  const setLengthPreference = useEvolveWorkspaceStore((s) => s.setLengthPreference);
  const setActiveTool = useEvolveWorkspaceStore((s) => s.setActiveTool);
  const activePersonaId = useEvolveWorkspaceStore((s) => s.activePersonaId);

  const { data: context } = useStoryContext(storyId);
  const { data: personas } = usePersonas();

  // Get message count from AI chat store
  const messageCount = useAIChatStore((s) => {
    if (!conversationId) return 0;
    const conv = s.conversations.get(conversationId);
    return conv?.messages?.length ?? 0;
  });

  const pinnedFacts = context?.facts?.filter((f) => f.status === 'pinned') ?? [];
  const personaName = personas?.find((p) => p.id === activePersonaId)?.name ?? activePersonaId;
  const turnCount = Math.floor(messageCount / 2); // pairs of user+assistant

  const isStreaming = rewriteState === 'streaming';
  const isReviewing = rewriteState === 'reviewing';
  const isDisabled = !hasContent || isStreaming || compareState !== 'idle';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Style section */}
        <section>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Style
          </h3>
          <div className="flex flex-wrap gap-1">
            {WRITING_STYLES.map(({ id, label, description, icon: Icon }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setWritingStyle(id)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors',
                      writingStyle === id
                        ? 'border-theme-primary bg-theme-primary/5 text-theme-primary'
                        : 'border-neutral-200 text-neutral-600 hover:border-neutral-300',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{description}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </section>

        {/* Length section */}
        <section>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Length
          </h3>
          <div className="flex gap-1">
            {LENGTH_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setLengthPreference(id)}
                className={cn(
                  'flex-1 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors text-center',
                  lengthPreference === id
                    ? 'border-theme-primary bg-theme-primary/5 text-theme-primary'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Divider */}
        <hr className="border-neutral-100" />

        {/* Briefing section */}
        <section className="space-y-3">
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Rewrite will use
          </h3>

          {/* Context briefing */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-600">
              <GitBranch className="h-3.5 w-3.5" />
              Context
            </div>
            {context?.summary ? (
              <p className="text-xs text-neutral-500 line-clamp-2 pl-5">
                {context.summary}
              </p>
            ) : (
              <p className="text-xs text-neutral-400 pl-5">
                No summary yet —{' '}
                <button
                  onClick={() => setActiveTool('context')}
                  className="text-theme-primary hover:underline"
                >
                  extract context
                </button>
              </p>
            )}

            {pinnedFacts.length > 0 ? (
              <div className="pl-5 space-y-0.5">
                <p className="text-xs text-neutral-500">
                  {pinnedFacts.length} pinned fact{pinnedFacts.length !== 1 ? 's' : ''}
                </p>
                {pinnedFacts.map((fact) => {
                  const Icon = CATEGORY_ICONS[fact.category];
                  return (
                    <div key={fact.id} className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <Icon className="h-3 w-3 shrink-0 text-neutral-400" />
                      <span>{fact.content}</span>
                      {fact.detail && (
                        <span className="text-neutral-400">— {fact.detail}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 pl-5">
                No facts pinned —{' '}
                <button
                  onClick={() => setActiveTool('context')}
                  className="text-theme-primary hover:underline"
                >
                  pin facts in Context
                </button>
              </p>
            )}
          </div>

          {/* Conversation briefing */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-600">
              <MessageSquare className="h-3.5 w-3.5" />
              Conversation
            </div>
            {turnCount > 0 ? (
              <p className="text-xs text-neutral-500 pl-5">
                {turnCount} turn{turnCount !== 1 ? 's' : ''} with {personaName}
              </p>
            ) : (
              <p className="text-xs text-neutral-400 pl-5">
                No conversation yet —{' '}
                <button
                  onClick={() => setActiveTool('ai-chat')}
                  className="text-theme-primary hover:underline"
                >
                  chat with a persona
                </button>
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Sticky action footer */}
      <div className="shrink-0 p-3 border-t bg-white">
        {isReviewing && (
          <p className="text-xs text-neutral-400 mb-2 text-center">
            Accept or discard the rewrite in the editor
          </p>
        )}
        <Button
          className="w-full"
          onClick={onRewrite}
          disabled={isDisabled}
          aria-label={isReviewing ? 'Regenerate' : 'Rewrite Story'}
        >
          {isStreaming ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Rewriting…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" />
              {isReviewing ? 'Regenerate' : 'Rewrite Story'}
            </>
          )}
        </Button>
        {isStreaming && onCancel && (
          <button
            onClick={onCancel}
            className="w-full mt-1.5 text-xs text-neutral-500 hover:text-neutral-700 text-center"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/tools/RewriteTool.test.tsx`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/web/src/features/evolve-workspace/tools/RewriteTool.tsx apps/web/src/features/evolve-workspace/tools/RewriteTool.test.tsx
git commit -m "feat(evolve): add RewriteTool component with style controls and briefing"
```

---

### Task 3: Update ToolStrip — Replace Style with Rewrite ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/components/ToolStrip.tsx`

**Step 1: Update ToolStrip**

Replace the entire `TOOLS` array and add the divider/spacer layout. The new structure groups assembly tools (Chat, Context) at top, reference tools (Versions, Media) in the middle, and Rewrite at the bottom:

```tsx
import { MessageSquare, GitBranch, History, Image, Sparkles } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { type ToolId, useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const ASSEMBLY_TOOLS: { id: ToolId; icon: typeof MessageSquare; label: string }[] = [
  { id: 'ai-chat', icon: MessageSquare, label: 'AI Persona' },
  { id: 'context', icon: GitBranch, label: 'Context' },
];

const REFERENCE_TOOLS: { id: ToolId; icon: typeof MessageSquare; label: string }[] = [
  { id: 'versions', icon: History, label: 'Versions' },
  { id: 'media', icon: Image, label: 'Media' },
];

const REWRITE_TOOL: { id: ToolId; icon: typeof Sparkles; label: string } = {
  id: 'rewrite', icon: Sparkles, label: 'Rewrite',
};

function ToolButton({
  id,
  icon: Icon,
  label,
  activeTool,
  onClick,
}: {
  id: ToolId;
  icon: typeof MessageSquare;
  label: string;
  activeTool: ToolId;
  onClick: (id: ToolId) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onClick(id)}
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-md mb-1 transition-colors',
            activeTool === id
              ? 'bg-theme-primary/10 text-theme-primary'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700',
          )}
          aria-label={label}
          aria-pressed={activeTool === id}
        >
          <Icon className="h-5 w-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function ToolStrip() {
  const activeTool = useEvolveWorkspaceStore((s) => s.activeTool);
  const setActiveTool = useEvolveWorkspaceStore((s) => s.setActiveTool);

  return (
    <div className="flex flex-col items-center py-2 px-1 border-x bg-neutral-50 shrink-0 w-12">
      {/* Assembly tools */}
      {ASSEMBLY_TOOLS.map((tool) => (
        <ToolButton key={tool.id} {...tool} activeTool={activeTool} onClick={setActiveTool} />
      ))}

      {/* Divider */}
      <hr className="w-6 border-neutral-200 my-1" />

      {/* Reference tools */}
      {REFERENCE_TOOLS.map((tool) => (
        <ToolButton key={tool.id} {...tool} activeTool={activeTool} onClick={setActiveTool} />
      ))}

      {/* Spacer pushes Rewrite to bottom */}
      <div className="flex-1" />

      {/* Divider */}
      <hr className="w-6 border-neutral-200 my-1" />

      {/* Rewrite tool at bottom */}
      <ToolButton {...REWRITE_TOOL} activeTool={activeTool} onClick={setActiveTool} />
    </div>
  );
}
```

**Step 2: Verify visually**

Run: `cd apps/web && npm run dev`
Expected: ToolStrip shows Chat and Context at top, divider, Versions and Media, spacer, divider, Rewrite (sparkles icon) at bottom. Style icon (Pen) is gone.

**Step 3: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/ToolStrip.tsx
git commit -m "feat(evolve): reorganize ToolStrip with grouped sections and Rewrite at bottom"
```

---

### Task 4: Wire RewriteTool into ToolPanel and MobileToolSheet ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/components/ToolPanel.tsx`
- Modify: `apps/web/src/features/evolve-workspace/components/MobileToolSheet.tsx`

**Step 1: Update ToolPanel**

Replace the StyleTool import and conditional with RewriteTool. Add required props for RewriteTool:

```tsx
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { AIChatTool } from '../tools/AIChatTool';
import { ContextTool } from '../tools/ContextTool';
import { VersionsTool } from '../tools/VersionsTool';
import { MediaTool } from '../tools/MediaTool';
import { RewriteTool } from '../tools/RewriteTool';

interface ToolPanelProps {
  legacyId: string;
  storyId: string;
  conversationId: string | null;
  currentContent: string;
  onRewrite: () => void;
  onCancelRewrite?: () => void;
}

export function ToolPanel({
  legacyId,
  storyId,
  conversationId,
  currentContent,
  onRewrite,
  onCancelRewrite,
}: ToolPanelProps) {
  const activeTool = useEvolveWorkspaceStore((s) => s.activeTool);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="px-4 py-2 border-b shrink-0">
        <h2 className="text-sm font-medium text-neutral-600 capitalize">
          {activeTool.replace('-', ' ')}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTool === 'ai-chat' && (
          <AIChatTool
            key={conversationId}
            legacyId={legacyId}
            storyId={storyId}
            conversationId={conversationId}
          />
        )}
        {activeTool === 'context' && <ContextTool storyId={storyId} />}
        {activeTool === 'versions' && <VersionsTool storyId={storyId} currentContent={currentContent} />}
        {activeTool === 'media' && <MediaTool legacyId={legacyId} />}
        {activeTool === 'rewrite' && (
          <RewriteTool
            storyId={storyId}
            conversationId={conversationId}
            onRewrite={onRewrite}
            onCancel={onCancelRewrite}
            hasContent={currentContent.trim().length > 0}
          />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Update MobileToolSheet**

Same pattern — replace StyleTool with RewriteTool:

```tsx
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useEvolveWorkspaceStore } from '../store/useEvolveWorkspaceStore';
import { AIChatTool } from '../tools/AIChatTool';
import { ContextTool } from '../tools/ContextTool';
import { VersionsTool } from '../tools/VersionsTool';
import { MediaTool } from '../tools/MediaTool';
import { RewriteTool } from '../tools/RewriteTool';

interface MobileToolSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legacyId: string;
  storyId: string;
  conversationId: string | null;
  currentContent: string;
  onRewrite: () => void;
  onCancelRewrite?: () => void;
}

export function MobileToolSheet({
  open,
  onOpenChange,
  legacyId,
  storyId,
  conversationId,
  currentContent,
  onRewrite,
  onCancelRewrite,
}: MobileToolSheetProps) {
  const activeTool = useEvolveWorkspaceStore((s) => s.activeTool);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[60vh]">
        <div className="px-2 py-1 border-b">
          <h2 className="text-sm font-medium text-neutral-600 capitalize">
            {activeTool.replace('-', ' ')}
          </h2>
        </div>
        <div className="overflow-y-auto flex-1">
          {activeTool === 'ai-chat' && (
            <AIChatTool key={conversationId} legacyId={legacyId} storyId={storyId} conversationId={conversationId} />
          )}
          {activeTool === 'context' && <ContextTool storyId={storyId} />}
          {activeTool === 'versions' && <VersionsTool storyId={storyId} currentContent={currentContent} />}
          {activeTool === 'media' && <MediaTool legacyId={legacyId} />}
          {activeTool === 'rewrite' && (
            <RewriteTool
              storyId={storyId}
              conversationId={conversationId}
              onRewrite={() => {
                onRewrite();
                onOpenChange(false); // dismiss sheet after triggering
              }}
              onCancel={onCancelRewrite}
              hasContent={currentContent.trim().length > 0}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Errors in `EvolveWorkspace.tsx` because ToolPanel/MobileToolSheet now expect `onRewrite` and `onCancelRewrite` props we haven't wired yet. That's expected — Task 5 will fix it.

**Step 4: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/ToolPanel.tsx apps/web/src/features/evolve-workspace/components/MobileToolSheet.tsx
git commit -m "feat(evolve): wire RewriteTool into ToolPanel and MobileToolSheet"
```

---

### Task 5: Update EvolveWorkspace — Remove BottomToolbar, Pass Rewrite Props ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx`

**Step 1: Remove BottomToolbar and wire new props**

Key changes:
1. Remove `BottomToolbar` import and rendering
2. Pass `onRewrite={handleRewrite}` and `onCancelRewrite={abortRewrite}` to `ToolPanel` and `MobileToolSheet`
3. Update `handleMobileToolSelect` — `'rewrite'` now opens the sheet instead of triggering directly
4. Move word count to `WorkspaceHeader` or `EditorPanel` (use header since it already shows metadata)

Replace the full component. The main changes from the current file:

**Imports** — Remove `BottomToolbar`, no other import changes:
```typescript
// Remove this line:
// import { BottomToolbar } from './components/BottomToolbar';
```

**handleMobileToolSelect** — `'rewrite'` should now open the Rewrite panel in the sheet instead of triggering the rewrite immediately:

```typescript
const handleMobileToolSelect = useCallback(
  (toolId: string) => {
    setActiveTool(toolId as ToolId);
    setMobileSheetOpen(true);
  },
  [setActiveTool],
);
```

**Desktop layout** — Remove `<BottomToolbar>`, pass new props to `<ToolPanel>`:

```tsx
<ToolPanel
  legacyId={legacyId}
  storyId={storyId}
  conversationId={conversationId}
  currentContent={content}
  onRewrite={handleRewrite}
  onCancelRewrite={abortRewrite}
/>
```

**Mobile layout** — Pass new props to `<MobileToolSheet>`:

```tsx
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
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS — no type errors

**Step 3: Run all evolve workspace tests**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add apps/web/src/features/evolve-workspace/EvolveWorkspace.tsx
git commit -m "feat(evolve): remove BottomToolbar, wire rewrite through ToolPanel"
```

---

### Task 6: Update MobileBottomBar — Replace Style and Rewrite with Single Rewrite Tool ✅

**Files:**
- Modify: `apps/web/src/features/evolve-workspace/components/MobileBottomBar.tsx`

**Step 1: Update MOBILE_TOOLS array**

Remove the `'style'` entry and keep `'rewrite'` — but now it opens the panel instead of triggering directly:

```tsx
import { MessageSquare, GitBranch, History, Image, Sparkles } from 'lucide-react';

const MOBILE_TOOLS = [
  { id: 'ai-chat', icon: MessageSquare, label: 'Chat' },
  { id: 'context', icon: GitBranch, label: 'Context' },
  { id: 'versions', icon: History, label: 'Versions' },
  { id: 'media', icon: Image, label: 'Media' },
  { id: 'rewrite', icon: Sparkles, label: 'Rewrite' },
];

interface MobileBottomBarProps {
  wordCount: number;
  onToolSelect: (toolId: string) => void;
}

export function MobileBottomBar({ wordCount, onToolSelect }: MobileBottomBarProps) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 border-t bg-white shrink-0">
      <div className="flex items-center gap-1">
        {MOBILE_TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onToolSelect(id)}
            className="flex flex-col items-center p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label={label}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] mt-0.5">{label}</span>
          </button>
        ))}
      </div>
      <span className="text-[10px] text-neutral-400">{wordCount}w</span>
    </div>
  );
}
```

**Step 2: Verify no import issues**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/features/evolve-workspace/components/MobileBottomBar.tsx
git commit -m "feat(evolve): update MobileBottomBar to replace Style with Rewrite tool"
```

---

### Task 7: Delete Obsolete Files ✅

**Files:**
- Delete: `apps/web/src/features/evolve-workspace/tools/StyleTool.tsx`
- Delete: `apps/web/src/features/evolve-workspace/components/BottomToolbar.tsx`

**Step 1: Verify no remaining imports**

Search for any remaining references to the deleted files:

Run: `grep -r "StyleTool\|BottomToolbar" apps/web/src/features/evolve-workspace/ --include="*.ts" --include="*.tsx"`
Expected: No results (all references were removed in earlier tasks). If there are results, fix them first.

**Step 2: Delete the files**

```bash
rm apps/web/src/features/evolve-workspace/tools/StyleTool.tsx
rm apps/web/src/features/evolve-workspace/components/BottomToolbar.tsx
```

**Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add -u apps/web/src/features/evolve-workspace/tools/StyleTool.tsx apps/web/src/features/evolve-workspace/components/BottomToolbar.tsx
git commit -m "chore(evolve): remove obsolete StyleTool and BottomToolbar components"
```

---

### Task 8: Run Full Test Suite and Lint ✅

**Files:** None (validation only)

**Step 1: Run all evolve workspace tests**

Run: `cd apps/web && npx vitest run src/features/evolve-workspace/`
Expected: All tests PASS

**Step 2: Run full frontend test suite**

Run: `cd apps/web && npm run test`
Expected: All tests PASS. If any tests fail due to removed StyleTool or BottomToolbar imports, fix those imports.

**Step 3: Run lint**

Run: `cd apps/web && npm run lint`
Expected: PASS with no errors

**Step 4: Run TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 5: Commit any fixes**

If any fixes were needed from test/lint failures:
```bash
git add -A apps/web/src/features/evolve-workspace/
git commit -m "fix(evolve): resolve test and lint issues from rewrite panel migration"
```

---

### Task 9: Manual Smoke Test

**Files:** None (manual verification)

**Step 1: Start dev server**

Run: `cd apps/web && npm run dev`

**Step 2: Verify desktop layout**

Open `http://localhost:5173` and navigate to a story's Evolve workspace. Verify:

1. ToolStrip shows: Chat, Context | Versions, Media | Rewrite (sparkles, at bottom)
2. No Style icon in the strip
3. No BottomToolbar visible
4. Clicking Rewrite icon opens the Rewrite panel with:
   - Style toggles (5 options, compact chips)
   - Length toggles (3 options)
   - "Rewrite will use" briefing with context summary, pinned facts, conversation info
   - "Rewrite Story" button at bottom
5. Empty states show instructional links that navigate to the right panels
6. Selecting a style in the Rewrite panel highlights it
7. Clicking "Rewrite Story" triggers the rewrite and shows streaming in the editor
8. During streaming, button shows "Rewriting…"
9. After streaming completes, button shows "Regenerate"

**Step 3: Verify mobile layout**

Use browser dev tools to switch to mobile viewport. Verify:

1. Bottom bar shows: Chat, Context, Versions, Media, Rewrite (no Style)
2. Tapping Rewrite opens drawer with the Rewrite panel
3. Triggering rewrite from drawer dismisses the drawer
4. Streaming visible in editor

**Step 4: Commit if any final tweaks needed**

```bash
git add -A apps/web/src/features/evolve-workspace/
git commit -m "fix(evolve): polish rewrite panel from smoke testing"
```
