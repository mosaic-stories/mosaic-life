# Legacy Detail Page Redesign — Implementation Plan

> **Status:** COMPLETED (2026-03-11)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the legacy detail page from a single-column flat layout into a two-column layout with full-width hero banner, sticky tab bar with stats, and a persistent sidebar.

**Architecture:** In-place refactor of existing components (ProfileHeader, SectionNav, StoryCard, StoriesSection, AISection, LegacyProfile) plus two new sidebar components. All styling uses the existing dynamic theme system via `--theme-*` CSS variables.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, TanStack Query, existing story-prompts hooks.

**Design doc:** `docs/plans/2026-03-11-legacy-detail-redesign-design.md`
**Reference mockup:** `mosaic-legacy-detail-redesign.jsx` (root directory)

---

## Task 1: Add "Warm Earth" Theme

**Files:**
- Modify: `apps/web/src/lib/themes.ts`
- Modify: `apps/web/src/lib/themeUtils.ts`

**Step 1: Add theme definition to themes.ts**

In `apps/web/src/lib/themes.ts`, add after the `muted-clay` entry (before the `// Vibrant themes` comment):

```ts
  {
    id: 'warm-earth',
    name: 'Warm Earth',
    description: 'Rich and timeless',
    category: 'muted',
    colors: {
      primary: 'bg-stone-700',
      primaryLight: 'bg-stone-50',
      primaryDark: 'bg-stone-800',
      accent: 'border-stone-300',
      accentLight: 'bg-stone-100',
      surface: 'bg-stone-50',
      surfaceHover: 'hover:border-stone-400'
    }
  },
```

**Step 2: Add color map to themeUtils.ts**

In `apps/web/src/lib/themeUtils.ts`, add after the `'muted-clay'` entry (before `// Vibrant themes`):

```ts
  'warm-earth': {
    primary: '92 75 58',         // #5C4B3A
    primaryLight: '212 197 176', // #D4C5B0
    primaryDark: '61 50 37',     // #3D3225
    accent: '139 125 107',       // #8B7D6B
    accentLight: '245 241 235',  // #F5F1EB
    gradientFrom: '92 75 58',   // #5C4B3A
    gradientTo: '122 107 90',   // #7A6B5A
    background: '250 248 245',  // #FAF8F5
    surface: '255 255 255',     // white
  },
```

**Step 3: Verify the app builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add apps/web/src/lib/themes.ts apps/web/src/lib/themeUtils.ts
git commit -m "feat(themes): add Warm Earth theme with rich brown palette"
```

---

## Task 2: Create SidebarSection Component

**Files:**
- Create: `apps/web/src/features/legacy/components/SidebarSection.tsx`

**Step 1: Create the component**

Create `apps/web/src/features/legacy/components/SidebarSection.tsx`:

```tsx
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface SidebarSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function SidebarSection({ title, defaultOpen = true, children }: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full pb-2.5 border-b border-stone-200 cursor-pointer"
      >
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          {title}
        </span>
        <ChevronRight
          size={14}
          className={`text-neutral-300 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && <div className="mt-3.5">{children}</div>}
    </div>
  );
}
```

**Step 2: Verify the app builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/web/src/features/legacy/components/SidebarSection.tsx
git commit -m "feat(legacy): add SidebarSection collapsible component"
```

---

## Task 3: Create LegacySidebar Component

**Files:**
- Create: `apps/web/src/features/legacy/components/LegacySidebar.tsx`

**Dependencies:** Task 2 (SidebarSection)

**Step 1: Create the component**

Create `apps/web/src/features/legacy/components/LegacySidebar.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { PenLine, Plus, Sparkles, MessageCircle, RefreshCw, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentPrompt, useShufflePrompt, useActOnPrompt } from '@/features/story-prompts/hooks/useStoryPrompt';
import type { Legacy, LegacyMember } from '@/features/legacy/api/legacies';
import type { SectionId } from './SectionNav';
import SidebarSection from './SidebarSection';

interface LegacySidebarProps {
  legacy: Legacy;
  legacyId: string;
  onMembersClick: () => void;
  onSectionChange: (section: SectionId) => void;
}

export default function LegacySidebar({
  legacy,
  legacyId,
  onMembersClick,
  onSectionChange,
}: LegacySidebarProps) {
  const navigate = useNavigate();
  const members = legacy.members ?? [];

  return (
    <aside className="space-y-5">
      {/* About / Timeline / Members card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        {/* About */}
        <SidebarSection title="About">
          {legacy.biography ? (
            <p className="text-sm text-neutral-600 leading-relaxed mb-3">
              {legacy.biography}
            </p>
          ) : (
            <p className="text-sm text-neutral-400 italic mb-3">
              Add a biography to tell their story
            </p>
          )}
          <button
            onClick={() => navigate(`/legacy/${legacyId}/edit`)}
            className="text-sm font-medium text-theme-primary hover:text-theme-primary-dark transition-colors flex items-center gap-1"
          >
            Edit biography <PenLine size={12} />
          </button>
        </SidebarSection>

        {/* Life Timeline (stub) */}
        <SidebarSection title="Life Timeline" defaultOpen={false}>
          <div className="flex items-center gap-3 py-2">
            <div className="flex flex-col items-center">
              <div className="size-2 rounded-full bg-neutral-300" />
              <div className="w-px h-6 bg-stone-200" />
              <div className="size-2 rounded-full bg-neutral-300" />
            </div>
            <div>
              <p className="text-sm text-neutral-400 italic">
                Add life events to build a timeline
              </p>
              <button
                onClick={() => navigate(`/legacy/${legacyId}/edit`)}
                className="text-xs font-medium text-theme-primary hover:text-theme-primary-dark transition-colors mt-1 flex items-center gap-1"
              >
                <Calendar size={11} /> Add events
              </button>
            </div>
          </div>
        </SidebarSection>

        {/* Members */}
        <SidebarSection title="Members">
          <div className="flex flex-col gap-2.5">
            {members.map((member) => (
              <MemberRow key={member.user_id} member={member} />
            ))}
            <button
              onClick={onMembersClick}
              className="flex items-center gap-1.5 py-2 text-sm font-medium text-theme-primary hover:text-theme-primary-dark transition-colors"
            >
              <Plus size={14} /> Invite someone
            </button>
          </div>
        </SidebarSection>
      </div>

      {/* AI Story Prompt widget */}
      <StoryPromptWidget
        legacyId={legacyId}
        onSectionChange={onSectionChange}
      />
    </aside>
  );
}

function MemberRow({ member }: { member: LegacyMember }) {
  const initials = member.name
    ? member.name.split(' ').map(n => n[0]).join('').toUpperCase()
    : member.email[0].toUpperCase();

  const roleLabel = member.role === 'creator' ? 'Creator' : 'Member';

  return (
    <div className="flex items-center gap-2.5">
      <div className="size-8 rounded-full bg-theme-primary flex items-center justify-center text-[11px] font-semibold text-white shrink-0">
        {initials}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-neutral-800 truncate">
          {member.name || member.email}
        </div>
        <div className="text-[11px] text-neutral-400">{roleLabel}</div>
      </div>
    </div>
  );
}

function StoryPromptWidget({
  legacyId,
  onSectionChange,
}: {
  legacyId: string;
  onSectionChange: (section: SectionId) => void;
}) {
  const navigate = useNavigate();
  const { data: prompt, isLoading } = useCurrentPrompt();
  const shuffle = useShufflePrompt();
  const act = useActOnPrompt();

  if (isLoading || !prompt) return null;

  const handleDiscuss = async () => {
    const result = await act.mutateAsync({
      promptId: prompt.id,
      action: 'discuss',
    });
    if (result.conversation_id) {
      navigate(
        `/legacy/${result.legacy_id}?tab=ai&conversation=${result.conversation_id}&seed=story_prompt`,
      );
      onSectionChange('ai');
    }
  };

  const handleWriteStory = async () => {
    const result = await act.mutateAsync({
      promptId: prompt.id,
      action: 'write_story',
    });
    if (result.story_id) {
      navigate(
        `/legacy/${result.legacy_id}/story/${result.story_id}/evolve?conversation_id=${result.conversation_id}`,
      );
    }
  };

  const handleShuffle = () => {
    shuffle.mutate(prompt.id);
  };

  return (
    <div className="bg-gradient-to-br from-theme-primary-dark to-theme-primary rounded-2xl p-5 text-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} />
          <span className="text-sm font-semibold">Story Prompt</span>
        </div>
        <button
          onClick={handleShuffle}
          disabled={shuffle.isPending}
          className="text-white/60 hover:text-white transition-colors"
          title="Get a different prompt"
        >
          <RefreshCw size={14} className={shuffle.isPending ? 'animate-spin' : ''} />
        </button>
      </div>
      <p className="font-serif text-[15px] italic leading-relaxed mb-4 opacity-95">
        &ldquo;{prompt.prompt_text}&rdquo;
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 bg-white/20 backdrop-blur border-white/30 text-white hover:bg-white/30 hover:text-white"
          onClick={handleDiscuss}
          disabled={act.isPending}
        >
          <MessageCircle size={14} className="mr-1.5" />
          Discuss
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-white text-theme-primary-dark hover:bg-white/90"
          onClick={handleWriteStory}
          disabled={act.isPending}
        >
          <PenLine size={14} className="mr-1.5" />
          Write a Story
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Verify the app builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacySidebar.tsx
git commit -m "feat(legacy): add LegacySidebar with About, Timeline, Members, Story Prompt"
```

---

## Task 4: Rewrite ProfileHeader as Hero Banner

**Files:**
- Modify: `apps/web/src/features/legacy/components/ProfileHeader.tsx`
- Modify: `apps/web/src/features/legacy/components/ProfileHeader.test.tsx`

**Step 1: Rewrite ProfileHeader.tsx**

The component's props interface expands. The hero replaces the flat white header.

Replace the entire content of `apps/web/src/features/legacy/components/ProfileHeader.tsx` with:

```tsx
import { Link } from 'react-router-dom';
import { Globe, Lock, Users, ChevronRight, Share2, MoreVertical, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Legacy } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';

export interface ProfileHeaderProps {
  legacy: Legacy;
  dates: string;
  legacyId: string;
  isAuthenticated: boolean;
  onAddStory: () => void;
  isCreatingStory: boolean;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ProfileHeader({
  legacy,
  dates,
  legacyId,
  isAuthenticated,
  onAddStory,
  isCreatingStory,
  onShare,
  onEdit,
  onDelete,
}: ProfileHeaderProps) {
  const profileImageUrl = legacy.profile_image_url
    ? rewriteBackendUrlForDev(legacy.profile_image_url)
    : null;

  return (
    <section className="relative h-[280px] sm:h-[280px] overflow-hidden bg-gradient-to-br from-theme-primary-dark via-theme-primary to-theme-primary/70">
      {/* Cover image background */}
      {profileImageUrl && (
        <img
          src={profileImageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-15 blur-sm"
        />
      )}

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-theme-primary-dark/30 to-theme-primary-dark/85" />

      {/* Breadcrumb */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-5">
        <nav className="flex items-center gap-2 text-[13px] text-white/60">
          <Link to="/" className="hover:text-white/80 transition-colors">Home</Link>
          <ChevronRight size={12} />
          <Link to="/legacies" className="hover:text-white/80 transition-colors">Legacies</Link>
          <ChevronRight size={12} />
          <span className="text-white/90 font-medium">{legacy.name}</span>
        </nav>
      </div>

      {/* Hero content — anchored to bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-6 flex items-end gap-5 sm:gap-6">
          {/* Profile photo */}
          <div className="size-[90px] sm:size-[110px] rounded-2xl border-[3px] sm:border-4 border-white/90 overflow-hidden shrink-0 shadow-lg">
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={legacy.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-theme-primary-dark/50 flex items-center justify-center">
                <Users className="size-10 text-white/60" />
              </div>
            )}
          </div>

          {/* Name & details */}
          <div className="flex-1 pb-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-white tracking-tight truncate">
                {legacy.name}
              </h1>
              <Badge className="bg-white/20 backdrop-blur-sm text-white border-white/30 text-[11px] font-semibold shrink-0">
                {legacy.visibility === 'public' ? (
                  <><Globe size={11} className="mr-1" /> Public</>
                ) : (
                  <><Lock size={11} className="mr-1" /> Private</>
                )}
              </Badge>
            </div>
            {dates && (
              <p className="text-white/60 text-sm sm:text-[15px]">{dates}</p>
            )}
            {legacy.biography && (
              <p className="text-white/85 text-sm sm:text-base italic font-serif mt-1 line-clamp-1">
                &ldquo;{legacy.biography}&rdquo;
              </p>
            )}
          </div>

          {/* Action buttons */}
          {isAuthenticated && (
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                className="bg-white text-theme-primary-dark hover:bg-white/90 shadow-md"
                onClick={onAddStory}
                disabled={isCreatingStory}
              >
                {isCreatingStory ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <Plus className="size-4 mr-1.5" />
                )}
                <span className="hidden sm:inline">Add Story</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25 hover:text-white"
                onClick={onShare}
              >
                <Share2 size={16} />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25 hover:text-white"
                  >
                    <MoreVertical size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="size-4" /> Edit Legacy
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 className="size-4" /> Delete Legacy
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Update ProfileHeader.test.tsx**

Replace the entire content of `apps/web/src/features/legacy/components/ProfileHeader.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProfileHeader from './ProfileHeader';

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

const baseLegacy = {
  id: 'legacy-1',
  name: 'Test Legacy',
  biography: 'An amazing person',
  birth_date: null,
  death_date: null,
  created_by: 'user-1',
  created_at: '2026-03-09T00:00:00Z',
  updated_at: '2026-03-09T00:00:00Z',
  visibility: 'public' as const,
  story_count: 0,
  members: [],
  gender: 'female',
  profile_image_url: null,
};

describe('ProfileHeader', () => {
  it('renders the legacy name and biography in the hero', () => {
    render(
      <MemoryRouter>
        <ProfileHeader
          legacy={baseLegacy}
          dates="1957 – 2025"
          legacyId="legacy-1"
          isAuthenticated={true}
          onAddStory={() => {}}
          isCreatingStory={false}
          onShare={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Legacy');
    expect(screen.getByText(/An amazing person/)).toBeInTheDocument();
    expect(screen.getByText('1957 – 2025')).toBeInTheDocument();
  });

  it('shows Public badge for public legacies', () => {
    render(
      <MemoryRouter>
        <ProfileHeader
          legacy={baseLegacy}
          dates=""
          legacyId="legacy-1"
          isAuthenticated={false}
          onAddStory={() => {}}
          isCreatingStory={false}
          onShare={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('hides action buttons when not authenticated', () => {
    render(
      <MemoryRouter>
        <ProfileHeader
          legacy={baseLegacy}
          dates=""
          legacyId="legacy-1"
          isAuthenticated={false}
          onAddStory={() => {}}
          isCreatingStory={false}
          onShare={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText('Add Story')).not.toBeInTheDocument();
  });

  it('renders breadcrumb navigation', () => {
    render(
      <MemoryRouter>
        <ProfileHeader
          legacy={baseLegacy}
          dates=""
          legacyId="legacy-1"
          isAuthenticated={false}
          onAddStory={() => {}}
          isCreatingStory={false}
          onShare={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Legacies')).toBeInTheDocument();
  });
});
```

**Step 3: Run tests**

Run: `cd apps/web && npx vitest run src/features/legacy/components/ProfileHeader.test.tsx`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/components/ProfileHeader.tsx apps/web/src/features/legacy/components/ProfileHeader.test.tsx
git commit -m "feat(legacy): rewrite ProfileHeader as full-width hero banner"
```

---

## Task 5: Update SectionNav with Icons and Stats

**Files:**
- Modify: `apps/web/src/features/legacy/components/SectionNav.tsx`

**Step 1: Rewrite SectionNav.tsx**

Replace the entire content of `apps/web/src/features/legacy/components/SectionNav.tsx`:

```tsx
import { BookOpen, Image, Link2, Sparkles, Users, MessageSquare } from 'lucide-react';

export type SectionId = 'stories' | 'media' | 'links' | 'ai';

interface TabDef {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const tabs: TabDef[] = [
  { id: 'stories', label: 'Stories', icon: BookOpen },
  { id: 'media', label: 'Media Gallery', icon: Image },
  { id: 'links', label: 'Linked Legacies', icon: Link2 },
  { id: 'ai', label: 'AI Chat', icon: Sparkles },
];

export interface SectionNavProps {
  activeSection: SectionId;
  onSectionChange: (section: SectionId) => void;
  storyCount?: number;
  memberCount?: number;
  creatorName?: string | null;
  onMembersClick?: () => void;
}

export default function SectionNav({
  activeSection,
  onSectionChange,
  storyCount,
  memberCount,
  creatorName,
  onMembersClick,
}: SectionNavProps) {
  return (
    <nav className="bg-white border-b sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        {/* Tabs */}
        <div className="flex gap-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSectionChange(tab.id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3.5 border-b-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'border-theme-primary text-neutral-900 font-semibold'
                    : 'border-transparent text-neutral-400 hover:text-neutral-700'
                }`}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.id === 'stories' && storyCount != null && storyCount > 0 && (
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-px rounded-md ${
                      isActive
                        ? 'bg-theme-primary text-white'
                        : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {storyCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick stats (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-5">
          {storyCount != null && (
            <div className="flex items-center gap-1.5 text-[13px] text-neutral-500">
              <MessageSquare size={14} />
              {storyCount} {storyCount === 1 ? 'story' : 'stories'}
            </div>
          )}
          {memberCount != null && (
            <button
              onClick={onMembersClick}
              className="flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-theme-primary transition-colors"
            >
              <Users size={14} />
              {memberCount} {memberCount === 1 ? 'member' : 'members'}
            </button>
          )}
          {creatorName && (
            <div className="text-[13px] text-neutral-500">
              Created by <span className="font-semibold text-theme-primary">{creatorName}</span>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
```

**Step 2: Verify the app builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors (callers updated in Task 7).

**Step 3: Commit**

```bash
git add apps/web/src/features/legacy/components/SectionNav.tsx
git commit -m "feat(legacy): add icons and stats to SectionNav sticky tab bar"
```

---

## Task 6: Enhance StoryCard and StoriesSection

**Files:**
- Modify: `apps/web/src/features/legacy/components/StoryCard.tsx`
- Modify: `apps/web/src/features/legacy/components/StoriesSection.tsx`
- Modify: `apps/web/src/features/legacy/components/StoryCard.test.tsx`

**Step 1: Update StoryCard.tsx**

Replace entire content of `apps/web/src/features/legacy/components/StoryCard.tsx`:

```tsx
import { Globe, Lock } from 'lucide-react';
import type { StorySummary } from '@/features/story/api/stories';
import FavoriteButton from '@/features/favorites/components/FavoriteButton';

export interface StoryCardProps {
  story: StorySummary;
  onClick?: () => void;
  isFavorited?: boolean;
}

export default function StoryCard({ story, onClick, isFavorited = false }: StoryCardProps) {
  const authorInitials = story.author_name
    ? story.author_name.split(' ').map(n => n[0]).join('')
    : '?';
  const formattedDate = new Date(story.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const visibilityLabel =
    story.visibility === 'public' ? 'Public' :
    story.visibility === 'personal' ? 'Personal' : 'Members only';

  return (
    <div
      className="rounded-xl border border-stone-200 bg-white hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      <div className="p-5">
        {/* Title + favorite */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-serif text-[17px] font-semibold text-neutral-900 leading-snug line-clamp-2">
            {story.title}
          </h3>
          {!story.shared_from && (
            <FavoriteButton
              entityType="story"
              entityId={story.id}
              isFavorited={isFavorited}
              favoriteCount={story.favorite_count}
            />
          )}
        </div>

        {/* Content preview */}
        {story.content_preview && (
          <p className="text-sm text-neutral-500 line-clamp-3 leading-relaxed">
            {story.content_preview}
          </p>
        )}

        {/* Status badges */}
        <div className="flex gap-1.5 mt-3">
          {story.status === 'draft' && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Draft
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-stone-100 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-full bg-theme-primary flex items-center justify-center text-[9px] font-semibold text-white">
            {authorInitials}
          </div>
          <span className="text-xs text-neutral-500">{story.author_name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-neutral-400 flex items-center gap-1">
            {story.visibility === 'public' ? <Globe size={11} /> : <Lock size={11} />}
            {visibilityLabel}
          </span>
          <span className="text-[11px] text-neutral-400">{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Update StoriesSection.tsx with sort dropdown**

Replace entire content of `apps/web/src/features/legacy/components/StoriesSection.tsx`:

```tsx
import { useState, useMemo } from 'react';
import { AlertCircle, Loader2, MessageSquare, PenLine } from 'lucide-react';
import { Card } from '@/components/ui/card';
import StoryCard from './StoryCard';
import type { StorySummary } from '@/features/story/api/stories';
import { useFavoriteCheck } from '@/features/favorites/hooks/useFavorites';
import { useAuth } from '@/contexts/AuthContext';

type SortOption = 'recent' | 'oldest';

export interface StoriesSectionProps {
  stories: StorySummary[] | undefined;
  storiesLoading: boolean;
  storiesError: Error | null;
  onStoryClick: (storyId: string) => void;
  onAddStory: () => void;
  isCreatingStory?: boolean;
}

export default function StoriesSection({
  stories,
  storiesLoading,
  storiesError,
  onStoryClick,
  onAddStory,
  isCreatingStory = false,
}: StoriesSectionProps) {
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const storyIds = stories?.map(s => s.id) ?? [];
  const { data: favoriteData } = useFavoriteCheck('story', user ? storyIds : []);

  const sortedStories = useMemo(() => {
    if (!stories) return [];
    const sorted = [...stories];
    if (sortBy === 'oldest') {
      sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted;
  }, [stories, sortBy]);

  return (
    <div className="space-y-5">
      {/* Header with sort */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl sm:text-[22px] font-semibold text-neutral-900">
          Stories
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="border border-stone-200 rounded-lg px-3 py-1.5 text-[13px] text-neutral-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-theme-primary"
          >
            <option value="recent">Most Recent</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {storiesLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-theme-primary" />
        </div>
      )}

      {storiesError && (
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex items-center gap-3 text-red-800">
            <AlertCircle className="size-5" />
            <p>Failed to load stories</p>
          </div>
        </Card>
      )}

      {!storiesLoading && !storiesError && sortedStories.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
          onClick={() => onStoryClick(story.id)}
          isFavorited={favoriteData?.favorites[story.id] ?? false}
        />
      ))}

      {!storiesLoading && !storiesError && stories?.length === 0 && (
        <Card className="p-8 text-center text-neutral-500">
          <MessageSquare className="size-12 mx-auto text-neutral-300 mb-4" />
          <p>No stories yet.</p>
          <p className="text-sm mt-1">Be the first to add a story to this legacy.</p>
        </Card>
      )}

      {/* Share a Memory CTA */}
      <div
        className="border-2 border-dashed border-stone-300 rounded-xl p-8 text-center cursor-pointer hover:border-theme-accent transition-colors"
        onClick={isCreatingStory ? undefined : onAddStory}
      >
        <div className="size-11 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
          {isCreatingStory ? (
            <Loader2 className="size-5 text-theme-primary animate-spin" />
          ) : (
            <PenLine className="size-5 text-neutral-500" />
          )}
        </div>
        <p className="font-serif text-base font-semibold text-neutral-900">Share a Memory</p>
        <p className="text-[13px] text-neutral-400 mt-1">Write a story or start a conversation with AI</p>
      </div>
    </div>
  );
}
```

**Step 3: Update StoryCard.test.tsx**

Replace entire content of `apps/web/src/features/legacy/components/StoryCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StoryCard from './StoryCard';
import type { StorySummary } from '@/features/story/api/stories';

vi.mock('@/features/favorites/components/FavoriteButton', () => ({
  default: () => <button type="button">Favorite</button>,
}));

const story: StorySummary = {
  id: 'story-1',
  title: 'A very long story title that should never force its parent hub card wider than the available grid track',
  content_preview: 'Long content preview that should remain inside the card body.',
  status: 'published',
  visibility: 'public',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  author_id: 'user-1',
  author_name: 'Jordan Example',
  legacies: [
    { legacy_id: 'legacy-1', legacy_name: 'Test Legacy', role: 'primary', position: 0 },
  ],
  favorite_count: 0,
  shared_from: null,
};

describe('StoryCard', () => {
  it('renders title and content preview', () => {
    render(<StoryCard story={story} />);

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/a very long story title/i);
    expect(screen.getByText(/Long content preview/)).toBeInTheDocument();
  });

  it('uses truncation classes for long titles', () => {
    render(<StoryCard story={story} />);

    const title = screen.getByRole('heading', { level: 3 });
    expect(title.className).toMatch(/line-clamp/);
  });

  it('shows visibility label and author name', () => {
    render(<StoryCard story={story} />);

    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Jordan Example')).toBeInTheDocument();
  });

  it('shows Members only for private visibility', () => {
    const privateStory = { ...story, visibility: 'private' as const };
    render(<StoryCard story={privateStory} />);

    expect(screen.getByText('Members only')).toBeInTheDocument();
  });
});
```

**Step 4: Run tests**

Run: `cd apps/web && npx vitest run src/features/legacy/components/StoryCard.test.tsx`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add apps/web/src/features/legacy/components/StoryCard.tsx apps/web/src/features/legacy/components/StoriesSection.tsx apps/web/src/features/legacy/components/StoryCard.test.tsx
git commit -m "feat(legacy): enhance StoryCard and StoriesSection with sort and richer footer"
```

---

## Task 7: Update LegacyProfile with Two-Column Layout

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx`
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.test.tsx`

**Dependencies:** Tasks 3, 4, 5

**Step 1: Rewrite LegacyProfile.tsx**

Replace the entire content of `apps/web/src/features/legacy/components/LegacyProfile.tsx`:

```tsx
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLegacyWithFallback, useDeleteLegacy } from '@/features/legacy/hooks/useLegacies';
import { useStoriesWithFallback, useCreateStory } from '@/features/story/hooks/useStories';
import { formatLegacyDates } from '@/features/legacy/api/legacies';
import { rewriteBackendUrlForDev } from '@/lib/url';
import MemberDrawer from '@/features/members/components/MemberDrawer';
import { useMemberProfile } from '@/features/members/hooks/useMemberProfile';
import { SEOHead, getLegacySchema } from '@/components/seo';
import type { LegacySchemaInput } from '@/components/seo';
import { useAuth } from '@/contexts/AuthContext';
import ProfileHeader from './ProfileHeader';
import SectionNav from './SectionNav';
import type { SectionId } from './SectionNav';
import StoriesSection from './StoriesSection';
import MediaSection from './MediaSection';
import AISection from './AISection';
import DeleteLegacyDialog from './DeleteLegacyDialog';
import LegacyLinkPanel from '@/features/legacy-link/components/LegacyLinkPanel';
import LegacySidebar from './LegacySidebar';

type PromptSeedMode = 'story_prompt' | undefined;

interface LegacyProfileProps {
  legacyId: string;
}

export default function LegacyProfile({ legacyId }: LegacyProfileProps) {
  const { user: authUser } = useAuth();
  const user = useMemo(() => {
    return authUser ? { name: authUser.name || authUser.email, email: authUser.email, avatarUrl: authUser.avatar_url } : null;
  }, [authUser]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as SectionId | null;
  const conversationParam = searchParams.get('conversation') || undefined;
  const promptSeedMode: PromptSeedMode = searchParams.get('seed') === 'story_prompt'
    ? 'story_prompt'
    : undefined;
  const [activeSection, setActiveSection] = useState<SectionId>(tabParam || 'stories');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMemberDrawer, setShowMemberDrawer] = useState(false);

  // Use fallback hooks that try private endpoint first, then fall back to public
  const legacyQuery = useLegacyWithFallback(legacyId, !!user);
  const storiesQuery = useStoriesWithFallback(legacyId, !!user);
  const deleteLegacy = useDeleteLegacy();

  const createStory = useCreateStory();

  useEffect(() => {
    setActiveSection(tabParam || 'stories');
  }, [tabParam]);

  const legacy = legacyQuery.data;
  const legacyLoading = legacyQuery.isLoading;
  const legacyError = legacyQuery.error;
  const stories = storiesQuery.data;
  const storiesLoading = storiesQuery.isLoading;
  const storiesError = storiesQuery.error;

  // Find current user's membership and role
  const currentUserMember = useMemo(() => {
    if (!user || !legacy?.members) return null;
    return legacy.members.find(m => m.email === user.email);
  }, [user, legacy?.members]);

  const currentUserRole = currentUserMember?.role || 'admirer';
  const isMember = !!currentUserMember;
  const _memberProfileQuery = useMemberProfile(legacyId, { enabled: isMember });

  const handleAddStory = useCallback(async () => {
    try {
      const title = `Untitled Story - ${new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
      const newStory = await createStory.mutateAsync({
        title,
        content: '',
        visibility: 'private',
        status: 'draft',
        legacies: [{ legacy_id: legacyId, role: 'primary', position: 0 }],
      });
      navigate(`/legacy/${legacyId}/story/${newStory.id}/evolve`);
    } catch (err) {
      console.error('Failed to create story:', err);
    }
  }, [legacyId, createStory, navigate]);

  const handleDeleteLegacy = async () => {
    try {
      await deleteLegacy.mutateAsync(legacyId);
      navigate('/legacies');
    } catch (error) {
      console.error('Failed to delete legacy:', error);
    }
  };

  // Generate SEO data
  const profileImageUrl = legacy?.profile_image_url
    ? rewriteBackendUrlForDev(legacy.profile_image_url)
    : undefined;

  const seoSchema: LegacySchemaInput | null = legacy ? {
    id: legacy.id,
    name: legacy.name,
    biography: legacy.biography,
    profileImageUrl: profileImageUrl,
    birthDate: legacy.birth_date,
    deathDate: legacy.death_date,
    createdAt: legacy.created_at,
    updatedAt: legacy.updated_at,
  } : null;

  if (legacyLoading) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-theme-primary" />
      </div>
    );
  }

  if (legacyError || !legacy) {
    const is404 = legacyError && 'status' in legacyError && (legacyError as unknown as { status: number }).status === 404;

    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-4">
          <div className="size-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto">
            <Lock className="size-8 text-neutral-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-neutral-900">Legacy Not Found</h2>
            {is404 ? (
              <p className="text-sm text-neutral-600">
                This legacy doesn't exist or is private. If this is a private legacy, you may need to be invited by a member.
              </p>
            ) : (
              <p className="text-sm text-neutral-600">
                An error occurred while loading this legacy. Please try again.
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-center pt-2">
            <Button variant="outline" onClick={() => navigate('/')}>
              Go Home
            </Button>
            <Button onClick={() => navigate('/legacies')}>
              All Legacies
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const dates = formatLegacyDates(legacy);
  const memberCount = legacy.members?.length || 0;
  const storyCount = stories?.length || 0;

  return (
    <div className="min-h-screen bg-theme-background transition-colors duration-300">
      {legacy && seoSchema && (
        <SEOHead
          title={legacy.name}
          description={legacy.biography ?? undefined}
          path={`/legacy/${legacyId}`}
          ogImage={profileImageUrl}
          ogType="profile"
          structuredData={getLegacySchema(seoSchema)}
        />
      )}

      <ProfileHeader
        legacy={legacy}
        dates={dates}
        legacyId={legacyId}
        isAuthenticated={!!authUser}
        onAddStory={handleAddStory}
        isCreatingStory={createStory.isPending}
        onShare={() => setShowMemberDrawer(true)}
        onEdit={() => navigate(`/legacy/${legacyId}/edit`)}
        onDelete={() => setShowDeleteDialog(true)}
      />

      <SectionNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        storyCount={storyCount}
        memberCount={memberCount}
        creatorName={legacy.creator_name}
        onMembersClick={() => setShowMemberDrawer(true)}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-9">
        {/* Main content */}
        <main>
          {activeSection === 'stories' && (
            <StoriesSection
              stories={stories}
              storiesLoading={storiesLoading}
              storiesError={storiesError}
              onStoryClick={(storyId) => navigate(`/legacy/${legacyId}/story/${storyId}`)}
              onAddStory={handleAddStory}
              isCreatingStory={createStory.isPending}
            />
          )}

          {activeSection === 'links' && (
            <LegacyLinkPanel
              legacyId={legacyId}
              personId={legacy.person_id}
              legacyName={legacy.name}
            />
          )}

          {activeSection === 'media' && (
            <MediaSection
              legacyId={legacyId}
              profileImageId={legacy.profile_image_id}
              isAuthenticated={!!user}
            />
          )}

          {activeSection === 'ai' && (
            <AISection
              legacyId={legacyId}
              initialConversationId={conversationParam}
              initialSeedMode={promptSeedMode}
            />
          )}
        </main>

        {/* Sidebar */}
        <LegacySidebar
          legacy={legacy}
          legacyId={legacyId}
          onMembersClick={() => setShowMemberDrawer(true)}
          onSectionChange={setActiveSection}
        />
      </div>

      <DeleteLegacyDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        legacyName={legacy.name}
        isPending={deleteLegacy.isPending}
        onConfirm={handleDeleteLegacy}
      />

      <MemberDrawer
        legacyId={legacyId}
        isOpen={showMemberDrawer}
        onClose={() => setShowMemberDrawer(false)}
        currentUserRole={currentUserRole}
        visibility={legacy.visibility}
        isMember={isMember}
      />
    </div>
  );
}
```

**Step 2: Update LegacyProfile.test.tsx**

The test mocks ProfileHeader and SectionNav, so we need to update the mocks for the new props and add a mock for LegacySidebar.

In `apps/web/src/features/legacy/components/LegacyProfile.test.tsx`, make these changes:

1. Remove the PageActionBar mock (no longer used).
2. Add LegacySidebar mock.
3. Update ProfileHeader mock to accept new props.

Replace the entire file:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  searchParams: new URLSearchParams(),
  authUser: {
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: null,
  } as { name: string; email: string; avatar_url: string | null } | null,
  memberProfileHook: vi.fn<
    (legacyId: string, options?: { enabled?: boolean }) => { data: null; isLoading: boolean }
  >(() => ({ data: null, isLoading: false })),
  legacy: {
    id: 'legacy-1',
    name: 'Test Legacy',
    biography: 'Test biography',
    members: [{ email: 'test@example.com', role: 'creator' }],
    profile_image_url: null,
    birth_date: null,
    death_date: null,
    created_at: '2026-03-09T00:00:00Z',
    updated_at: '2026-03-09T00:00:00Z',
    person_id: 'person-1',
    profile_image_id: null,
    visibility: 'public',
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useSearchParams: () => [mocks.searchParams],
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.authUser }),
}));

vi.mock('@/features/legacy/hooks/useLegacies', () => ({
  useLegacyWithFallback: () => ({ data: mocks.legacy, isLoading: false, error: null }),
  useDeleteLegacy: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/story/hooks/useStories', () => ({
  useStoriesWithFallback: () => ({ data: [], isLoading: false, error: null }),
  useCreateStory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/members/hooks/useMemberProfile', () => ({
  useMemberProfile: (
    legacyId: string,
    options?: { enabled?: boolean }
  ) => mocks.memberProfileHook(legacyId, options),
}));

vi.mock('@/features/legacy/api/legacies', () => ({
  formatLegacyDates: () => 'Jan 1, 1900 - Jan 1, 2000',
}));

vi.mock('@/lib/url', () => ({
  rewriteBackendUrlForDev: (value: string) => value,
}));

vi.mock('@/components/seo', () => ({
  SEOHead: () => null,
  getLegacySchema: () => ({}),
}));

vi.mock('./ProfileHeader', () => ({
  default: () => <div data-testid="profile-header" />,
}));

vi.mock('./SectionNav', () => ({
  default: () => <div data-testid="section-nav" />,
}));

vi.mock('./StoriesSection', () => ({
  default: () => <div data-testid="stories-section" />,
}));

vi.mock('./MediaSection', () => ({
  default: () => <div data-testid="media-section" />,
}));

vi.mock('./AISection', () => ({
  default: () => <div data-testid="ai-section" />,
}));

vi.mock('./DeleteLegacyDialog', () => ({
  default: () => null,
}));

vi.mock('./LegacySidebar', () => ({
  default: () => <div data-testid="legacy-sidebar" />,
}));

vi.mock('@/features/members/components/MemberDrawer', () => ({
  default: () => null,
}));

vi.mock('@/features/legacy-link/components/LegacyLinkPanel', () => ({
  default: () => <div data-testid="links-section" />,
}));

import LegacyProfile from './LegacyProfile';

describe('LegacyProfile', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams('tab=stories');
    mocks.navigate.mockReset();
    mocks.authUser = {
      name: 'Test User',
      email: 'test@example.com',
      avatar_url: null,
    };
    mocks.memberProfileHook.mockReset();
    mocks.memberProfileHook.mockReturnValue({ data: null, isLoading: false });
    mocks.legacy = {
      id: 'legacy-1',
      name: 'Test Legacy',
      biography: 'Test biography',
      members: [{ email: 'test@example.com', role: 'creator' }],
      profile_image_url: null,
      birth_date: null,
      death_date: null,
      created_at: '2026-03-09T00:00:00Z',
      updated_at: '2026-03-09T00:00:00Z',
      person_id: 'person-1',
      profile_image_id: null,
      visibility: 'public',
    };
  });

  it('updates the visible section when the tab query param changes while mounted', () => {
    const { rerender } = render(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('stories-section')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-section')).not.toBeInTheDocument();

    mocks.searchParams = new URLSearchParams('tab=ai');
    rerender(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('ai-section')).toBeInTheDocument();
    expect(screen.queryByTestId('stories-section')).not.toBeInTheDocument();
  });

  it('renders profile header and sidebar', () => {
    render(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('profile-header')).toBeInTheDocument();
    expect(screen.getByTestId('legacy-sidebar')).toBeInTheDocument();
  });

  it('renders profile header for admirer members', () => {
    mocks.legacy = {
      ...mocks.legacy,
      members: [{ email: 'test@example.com', role: 'admirer' }],
    };

    render(<LegacyProfile legacyId="legacy-1" />);

    expect(screen.getByTestId('profile-header')).toBeInTheDocument();
  });

  it('disables member profile loading for public viewers who are not members', () => {
    mocks.authUser = null;
    mocks.legacy = {
      ...mocks.legacy,
      members: [],
    };

    render(<LegacyProfile legacyId="legacy-1" />);

    expect(mocks.memberProfileHook).toHaveBeenCalledWith('legacy-1', {
      enabled: false,
    });
  });
});
```

**Step 3: Run all tests**

Run: `cd apps/web && npx vitest run src/features/legacy/components/`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacyProfile.tsx apps/web/src/features/legacy/components/LegacyProfile.test.tsx
git commit -m "feat(legacy): add two-column layout with sidebar to LegacyProfile"
```

---

## Task 8: Polish AISection Theme Colors

**Files:**
- Modify: `apps/web/src/features/legacy/components/AISection.tsx`

**Step 1: Update PersonaPill styling**

In `apps/web/src/features/legacy/components/AISection.tsx`, find the `PersonaPill` function (around line 367) and update the class names.

Replace:
```tsx
        isSelected
          ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-sm'
          : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
```

With:
```tsx
        isSelected
          ? 'bg-theme-primary text-white border-theme-primary shadow-sm'
          : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
```

**Step 2: Update streaming indicator color**

Find the streaming indicator (around line 334):
```tsx
          <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-center gap-2">
```

Replace with:
```tsx
          <div className="px-4 py-1.5 bg-theme-accent-light border-b border-theme-accent/30 text-xs text-theme-primary-dark flex items-center gap-2">
```

**Step 3: Verify the app builds**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

**Step 4: Run AI section test**

Run: `cd apps/web && npx vitest run src/features/legacy/components/AISection.test.tsx`
Expected: Tests pass.

**Step 5: Commit**

```bash
git add apps/web/src/features/legacy/components/AISection.tsx
git commit -m "feat(legacy): update AISection persona pills and streaming indicator to use theme colors"
```

---

## Task 9: Final Integration Test and Build Verification

**Files:** None (verification only)

**Step 1: Run all legacy component tests**

Run: `cd apps/web && npx vitest run src/features/legacy/`
Expected: All tests pass.

**Step 2: Run full test suite**

Run: `cd apps/web && npx vitest run`
Expected: All tests pass. If any unrelated tests fail, note them but don't fix — they were pre-existing.

**Step 3: Verify TypeScript compilation**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors.

**Step 4: Verify production build**

Run: `cd apps/web && npm run build`
Expected: Build succeeds with no errors.

**Step 5: Commit any remaining changes (if any)**

If any minor fixes were needed during verification:

```bash
git add -A
git commit -m "fix(legacy): address type/lint issues from detail page redesign"
```
