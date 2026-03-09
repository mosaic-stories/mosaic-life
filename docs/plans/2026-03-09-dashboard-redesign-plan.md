# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the authenticated dashboard from a single-column stack to a warm editorial two-column layout with a right sidebar.

**Architecture:** Restructure `DashboardPage.tsx` into a hero area + CSS grid (main column + 340px sidebar). Existing components are reorganized; new compact sidebar variants are created for activity and favorites. Two small backend additions (legacy profile image on prompts, story count on legacies).

**Tech Stack:** React, TypeScript, Tailwind CSS, TanStack Query, existing shadcn/ui components, FastAPI/Pydantic (backend)

**Design Doc:** `docs/plans/2026-03-09-dashboard-redesign-design.md`

## Status

| Task | Description | Status |
|------|-------------|--------|
| 1 | Backend: `legacy_profile_image_url` on prompts | ✅ Done |
| 2 | Backend: `story_count` on legacies | ✅ Done |
| 3 | Frontend: ContextualGreeting hero | ✅ Done |
| 4 | Frontend: StoryPromptCard avatar | ✅ Done |
| 5 | Frontend: LegacyCard overlays | ✅ Done |
| 6 | Frontend: RecentStoriesList | ✅ Done |
| 7 | Frontend: QuickActions | ✅ Done |
| 8 | Frontend: SidebarActivity | ✅ Done |
| 9 | Frontend: SidebarFavorites | ✅ Done |
| 10 | Frontend: DashboardPage layout | ✅ Done |
| 11 | Visual polish & testing | ✅ Done |

---

### Task 1: Backend — Add `legacy_profile_image_url` to Story Prompt Response

**Files:**
- Modify: `services/core-api/app/schemas/story_prompt.py`
- Modify: `services/core-api/app/routes/prompts.py`
- Test: `services/core-api/tests/` (existing prompt tests)

**Step 1: Update the response schema**

In `services/core-api/app/schemas/story_prompt.py`, add field to `StoryPromptResponse`:

```python
class StoryPromptResponse(BaseModel):
    id: str
    legacy_id: str
    legacy_name: str
    legacy_profile_image_url: str | None = None  # NEW
    prompt_text: str
    category: str
    created_at: datetime
```

**Step 2: Populate the field in the route handler**

In `services/core-api/app/routes/prompts.py`, in the `get_current_prompt()` function, after the existing legacy fetch (around line 40-41), add the profile image URL:

```python
legacy = await db.get(Legacy, prompt.legacy_id)
legacy_name = legacy.name if legacy else "Unknown"
legacy_profile_image_url = None
if legacy and legacy.profile_image_id:
    # Use the same URL pattern used elsewhere for profile images
    legacy_profile_image_url = f"/api/legacies/{legacy.id}/profile-image"
```

Then include `legacy_profile_image_url` in the response construction.

**Step 3: Update the frontend type**

In `apps/web/src/features/story-prompts/api/storyPrompts.ts`, add the field:

```typescript
export interface StoryPrompt {
  id: string;
  legacy_id: string;
  legacy_name: string;
  legacy_profile_image_url: string | null;  // NEW
  prompt_text: string;
  category: string;
  created_at: string;
}
```

**Step 4: Run backend validation**

Run: `just validate-backend`
Expected: PASS (ruff + mypy)

**Step 5: Commit**

```bash
git add services/core-api/app/schemas/story_prompt.py services/core-api/app/routes/prompts.py apps/web/src/features/story-prompts/api/storyPrompts.ts
git commit -m "feat: add legacy_profile_image_url to story prompt response"
```

---

### Task 2: Backend — Add `story_count` to Legacy Response

**Files:**
- Modify: `services/core-api/app/schemas/legacy.py`
- Modify: `services/core-api/app/routes/legacy.py` (or the service layer that builds the response)
- Test: existing legacy endpoint tests

**Step 1: Add field to schema**

In `services/core-api/app/schemas/legacy.py`, add to `LegacyResponse`:

```python
story_count: int = Field(default=0)
```

**Step 2: Populate story_count in the query/serialization**

Find where `LegacyResponse` objects are constructed (likely in the legacy service or route handler). Add a count query:

```python
from sqlalchemy import func, select
from app.models.story import Story

story_count_result = await db.execute(
    select(func.count(Story.id)).where(Story.primary_legacy_id == legacy.id)
)
story_count = story_count_result.scalar() or 0
```

Note: The exact model field name (`primary_legacy_id` vs `legacy_id`) needs to be verified against the Story model. Check `services/core-api/app/models/story.py` for the correct column name.

**Step 3: Update the frontend type**

In `apps/web/src/features/legacy/api/legacies.ts`, add to the `Legacy` interface:

```typescript
story_count: number;
```

**Step 4: Run backend validation**

Run: `just validate-backend`
Expected: PASS

**Step 5: Commit**

```bash
git add services/core-api/app/schemas/legacy.py services/core-api/app/routes/legacy.py apps/web/src/features/legacy/api/legacies.ts
git commit -m "feat: add story_count to legacy response"
```

---

### Task 3: Frontend — Upgrade ContextualGreeting (Hero Area)

**Files:**
- Modify: `apps/web/src/components/dashboard/ContextualGreeting.tsx`

**Step 1: Redesign the hero area layout**

Replace the current simple text layout with:
- Full-width gradient background section using theme variables
- Flex layout: greeting (left) + CTA card (right)
- CTA upgrades from text link to a card with pen icon, story title, and arrow
- Responsive: `flex-col sm:flex-row` so card stacks on mobile

```tsx
return (
  <section className="bg-gradient-to-b from-theme-background to-transparent">
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
        {/* Left: Greeting */}
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-normal tracking-tight text-neutral-900">
            {greeting}, <span className="italic">{firstName}</span>
          </h1>
          <p className="text-sm text-neutral-500 mt-1.5">
            Every story you tell keeps a memory alive.
          </p>
        </div>

        {/* Right: Continue Writing CTA card */}
        {recentStory && legacyId && (
          <button
            onClick={() => navigate(`/legacy/${legacyId}/story/${storyId}`)}
            className="flex items-center gap-3.5 bg-white border border-neutral-200 rounded-xl px-5 py-3.5 shadow-sm hover:shadow-md transition-shadow max-w-sm cursor-pointer"
          >
            <div className="size-10 rounded-lg bg-theme-primary/10 flex items-center justify-center shrink-0">
              <PenLine className="size-4 text-theme-primary" />
            </div>
            <div className="min-w-0 text-left">
              <div className="text-xs text-neutral-500">Continue writing</div>
              <div className="text-sm font-medium truncate">{recentStory.title}</div>
            </div>
            <ArrowRight className="size-4 text-neutral-400 shrink-0" />
          </button>
        )}
      </div>
    </div>
  </section>
);
```

Keep the existing notification fallback and generic prompt logic — just render them differently when there's no recent story.

**Step 2: Verify it renders**

Run: `npm run dev` from `apps/web/`
Navigate to dashboard, confirm hero area displays correctly.

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/ContextualGreeting.tsx
git commit -m "feat: upgrade hero greeting with editorial style and CTA card"
```

---

### Task 4: Frontend — Update StoryPromptCard with Legacy Avatar

**Files:**
- Modify: `apps/web/src/features/story-prompts/components/StoryPromptCard.tsx`

**Step 1: Add legacy avatar and gradient background**

Update the component to show a circular legacy profile image next to the "Story Prompt" label and apply a subtle gradient background:

```tsx
{/* Avatar + label row */}
<div className="flex items-center gap-2.5 mb-1">
  {prompt.legacy_profile_image_url && (
    <div className="size-8 rounded-full overflow-hidden border-2 border-neutral-200 shrink-0">
      <img
        src={rewriteBackendUrlForDev(prompt.legacy_profile_image_url)}
        alt={prompt.legacy_name}
        className="size-full object-cover"
      />
    </div>
  )}
  <div>
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      Story Prompt
    </span>
    {/* shuffle button */}
  </div>
</div>
```

Change the outer Card to use a gradient background:

```tsx
<Card className="p-6 bg-gradient-to-br from-theme-background to-theme-surface border-neutral-200">
```

Remove the outer `py-12` section wrapper — spacing is now handled by the parent grid.

**Step 2: Import `rewriteBackendUrlForDev`**

Add: `import { rewriteBackendUrlForDev } from '@/lib/url';`

**Step 3: Verify rendering**

Check the dashboard — story prompt should show legacy avatar when available.

**Step 4: Commit**

```bash
git add apps/web/src/features/story-prompts/components/StoryPromptCard.tsx
git commit -m "feat: add legacy avatar to story prompt card"
```

---

### Task 5: Frontend — Update LegacyCard with Overlays and Action Buttons

**Files:**
- Modify: `apps/web/src/components/legacy/LegacyCard.tsx`

**Step 1: Add image overlays**

Move the member count to an overlay on the image area (bottom-right). Add an "In Memoriam" badge overlay (bottom-left) for memorial legacies:

```tsx
<div className="aspect-[4/3] overflow-hidden bg-neutral-100 relative">
  {/* Image */}
  {legacy.profile_image_url ? (
    <img src={rewriteBackendUrlForDev(legacy.profile_image_url)} alt={legacy.name}
      className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full flex items-center justify-center">
      <Users className="size-12 text-neutral-300" />
    </div>
  )}
  {/* Gradient overlay for readability */}
  <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
  {/* Bottom overlays */}
  <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between">
    <div>
      {context === 'memorial' && (
        <span className="bg-amber-800 text-white text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide">
          In Memoriam
        </span>
      )}
    </div>
    <div className="flex items-center gap-1 text-white/85 text-xs">
      <Users className="size-3.5" />
      <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
    </div>
  </div>
</div>
```

**Step 2: Add action buttons**

Replace the existing member count text in the card footer with two action buttons:

```tsx
<div className="flex gap-2 mt-3">
  <button
    onClick={(e) => { e.stopPropagation(); navigate(`/legacy/${legacy.id}?tab=stories`); }}
    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
  >
    <BookOpen className="size-3.5" />
    {legacy.story_count ?? 0} Stories
  </button>
  <button
    onClick={(e) => { e.stopPropagation(); navigate(`/legacy/${legacy.id}?tab=ai`); }}
    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
  >
    <MessageSquare className="size-3.5" />
    Talk to AI
  </button>
</div>
```

Import `BookOpen, MessageSquare` from lucide-react.

**Step 3: Remove old member count text from footer**

Remove the `<span>{memberCount} members</span>` from the existing footer area.

**Step 4: Verify rendering**

Check the dashboard and legacy list pages — card should show overlays and buttons.

**Step 5: Commit**

```bash
git add apps/web/src/components/legacy/LegacyCard.tsx
git commit -m "feat: add image overlays and action buttons to legacy card"
```

---

### Task 6: Frontend — Create RecentStoriesList Component

**Files:**
- Create: `apps/web/src/components/dashboard/RecentStoriesList.tsx`

**Step 1: Create the compact list component**

```tsx
import { Clock, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRecentlyViewed } from '@/features/activity/hooks/useActivity';

export default function RecentStoriesList() {
  const navigate = useNavigate();
  const { data, isLoading } = useRecentlyViewed('story', 5);

  if (isLoading || !data?.items?.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-serif font-medium tracking-tight">Recent Stories</h2>
        <button
          onClick={() => navigate('/stories')}
          className="text-xs text-theme-primary font-medium hover:underline"
        >
          Browse all
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {data.items.map((item, i) => {
          const story = item.entity;
          if (!story) return null;
          const legacyId = story.legacy_id;

          return (
            <div
              key={item.entity_id}
              onClick={() => legacyId && navigate(`/legacy/${legacyId}/story/${item.entity_id}`)}
              className="flex items-start gap-3.5 bg-white rounded-xl px-4 py-3.5 border border-neutral-100 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            >
              {/* Accent bar */}
              <div
                className={`w-1 h-10 rounded-full shrink-0 mt-0.5 ${
                  i === 0 ? 'bg-theme-primary' : 'bg-neutral-200'
                }`}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-serif font-medium truncate">
                    {story.title || 'Untitled'}
                  </h4>
                </div>
                {story.legacy_name && (
                  <div className="text-xs text-neutral-400 mt-0.5">{story.legacy_name}</div>
                )}
                {story.content_preview && (
                  <p className="text-xs text-neutral-500 mt-1.5 truncate leading-relaxed">
                    {story.content_preview}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 text-[11px] text-neutral-400">
                  {story.author_name && <span>by {story.author_name}</span>}
                  {item.last_activity_at && (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatRelativeDate(item.last_activity_at)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}
```

**Step 2: Verify it compiles**

Run: `npm run build` from `apps/web/`
Expected: PASS (component not yet imported, but should compile clean)

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/RecentStoriesList.tsx
git commit -m "feat: create compact RecentStoriesList component for dashboard"
```

---

### Task 7: Frontend — Create QuickActions Component

**Files:**
- Create: `apps/web/src/components/dashboard/QuickActions.tsx`

**Step 1: Create the component**

This component renders three action buttons. "Create a Legacy" navigates directly. "Write a Story" and "Invite Family" use Option B: if user has 1 legacy, go direct; if multiple, show the existing `LegacyPickerDialog` (for stories) or a similar picker for invites.

```tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, PenLine, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import LegacyPickerDialog from '@/components/stories-hub/LegacyPickerDialog';
import InviteMemberModal from '@/features/members/components/InviteMemberModal';

export default function QuickActions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: legaciesData } = useLegacies('all');
  const legacies = legaciesData?.items ?? [];

  const [showStoryPicker, setShowStoryPicker] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLegacyId, setInviteLegacyId] = useState<string | null>(null);
  const [showInvitePicker, setShowInvitePicker] = useState(false);

  // Determine role for the selected legacy
  const inviteLegacyRole = useMemo(() => {
    if (!inviteLegacyId || !user) return 'admirer';
    const legacy = legacies.find(l => l.id === inviteLegacyId);
    const member = legacy?.members?.find(m => m.email === user.email);
    return member?.role || 'admirer';
  }, [inviteLegacyId, legacies, user]);

  const handleWriteStory = () => {
    if (legacies.length === 1) {
      navigate(`/legacy/${legacies[0].id}/story/new`);
    } else {
      setShowStoryPicker(true);
    }
  };

  const handleInviteFamily = () => {
    if (legacies.length === 1) {
      setInviteLegacyId(legacies[0].id);
      setShowInviteModal(true);
    } else {
      setShowInvitePicker(true);
    }
  };

  const handleInviteLegacySelect = (legacyId: string) => {
    setShowInvitePicker(false);
    setInviteLegacyId(legacyId);
    setShowInviteModal(true);
  };

  const actions = [
    { icon: Plus, label: 'Create a Legacy', color: 'text-theme-primary', onClick: () => navigate('/legacy/new') },
    { icon: PenLine, label: 'Write a Story', color: 'text-green-600', onClick: handleWriteStory },
    { icon: Users, label: 'Invite Family', color: 'text-amber-700', onClick: handleInviteFamily },
  ];

  return (
    <>
      <div className="bg-white rounded-xl border border-neutral-100 p-4">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
          Quick Actions
        </h3>
        <div className="flex flex-col gap-1">
          {actions.map(({ icon: Icon, label, color, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-neutral-900 hover:bg-neutral-50 transition-colors text-left"
            >
              <Icon className={`size-4 ${color}`} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Story legacy picker (reuses existing component) */}
      <LegacyPickerDialog open={showStoryPicker} onOpenChange={setShowStoryPicker} />

      {/* Invite legacy picker — simple dialog for selecting legacy before invite */}
      {showInvitePicker && (
        <InviteLegacyPicker
          legacies={legacies}
          open={showInvitePicker}
          onOpenChange={setShowInvitePicker}
          onSelect={handleInviteLegacySelect}
        />
      )}

      {/* Invite modal */}
      {inviteLegacyId && (
        <InviteMemberModal
          isOpen={showInviteModal}
          onClose={() => { setShowInviteModal(false); setInviteLegacyId(null); }}
          legacyId={inviteLegacyId}
          currentUserRole={inviteLegacyRole}
          onInviteSent={() => { setShowInviteModal(false); setInviteLegacyId(null); }}
        />
      )}
    </>
  );
}

/** Lightweight legacy picker for invite flow */
function InviteLegacyPicker({
  legacies,
  open,
  onOpenChange,
  onSelect,
}: {
  legacies: Array<{ id: string; name: string; profile_image_url?: string | null }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (legacyId: string) => void;
}) {
  // Import Dialog components inline or use a simpler approach
  // For now, reuse the same pattern as LegacyPickerDialog but with invite context
  const { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } = require('@/components/ui/dialog');
  const { Users } = require('lucide-react');
  const { rewriteBackendUrlForDev } = require('@/lib/url');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a Legacy</DialogTitle>
          <DialogDescription>Which legacy would you like to invite members to?</DialogDescription>
        </DialogHeader>
        <div className="max-h-[300px] overflow-y-auto space-y-1">
          {legacies.map((legacy) => (
            <button
              key={legacy.id}
              onClick={() => onSelect(legacy.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-100 transition-colors text-left"
            >
              <div className="size-10 rounded-full overflow-hidden bg-neutral-100 shrink-0">
                {legacy.profile_image_url ? (
                  <img src={rewriteBackendUrlForDev(legacy.profile_image_url)} alt={legacy.name} className="size-full object-cover" />
                ) : (
                  <div className="size-full flex items-center justify-center">
                    <Users className="size-4 text-neutral-300" />
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-neutral-900 truncate">{legacy.name}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Note:** The `InviteLegacyPicker` inner component above uses `require()` for illustration — in the actual implementation, use proper imports at the top of the file. The `LegacyPickerDialog` could also be generalized to accept a custom `onSelect` callback instead of always navigating to `/legacy/{id}/story/new`, which would allow reuse for the invite flow too. The implementer should evaluate whether to generalize `LegacyPickerDialog` or keep the separate inner component.

**Step 2: Verify it compiles**

Run: `npm run build` from `apps/web/`

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/QuickActions.tsx
git commit -m "feat: create QuickActions sidebar component with smart legacy picker"
```

---

### Task 8: Frontend — Create SidebarActivity Component

**Files:**
- Create: `apps/web/src/components/dashboard/SidebarActivity.tsx`

**Step 1: Create compact activity feed for sidebar**

```tsx
import { AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSocialFeed } from '@/features/activity/hooks/useActivity';
import ActivityFeedItem from '@/features/activity/components/ActivityFeedItem';
import type { SocialFeedItem } from '@/features/activity/api/activity';

function getActivityRoute(item: SocialFeedItem): string | null {
  switch (item.entity_type) {
    case 'legacy':
      return `/legacy/${item.entity_id}`;
    case 'story': {
      const legacyId =
        item.entity?.legacy_id ??
        (item.metadata as { legacy_id?: string } | null)?.legacy_id;
      return legacyId ? `/legacy/${legacyId}/story/${item.entity_id}` : null;
    }
    case 'media': {
      const legacyId =
        item.entity?.legacy_id ??
        (item.metadata as { legacy_id?: string } | null)?.legacy_id;
      return legacyId ? `/legacy/${legacyId}/gallery` : null;
    }
    default:
      return null;
  }
}

export default function SidebarActivity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, isError } = useSocialFeed(4);

  if (!isLoading && !isError && (!data || data.items.length === 0)) return null;

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-4">
      <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3.5">
        Recent Activity
      </h3>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin text-theme-primary" />
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-xs text-neutral-400 py-4">
          <AlertCircle className="size-3.5" />
          <span>Unable to load activity</span>
        </div>
      )}

      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="divide-y divide-neutral-100">
          {data.items.map((item) => (
            <ActivityFeedItem
              key={item.id}
              item={item}
              currentUserId={user?.id || ''}
              onClick={() => {
                const route = getActivityRoute(item);
                if (route) navigate(route);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Note:** This reuses the existing `ActivityFeedItem` component. If its current rendering is too wide for the 340px sidebar, the implementer may need to create a more compact variant or adjust `ActivityFeedItem` to accept a `compact` prop. Check the rendered width during visual verification.

**Step 2: Commit**

```bash
git add apps/web/src/components/dashboard/SidebarActivity.tsx
git commit -m "feat: create compact SidebarActivity component"
```

---

### Task 9: Frontend — Create SidebarFavorites Component

**Files:**
- Create: `apps/web/src/components/dashboard/SidebarFavorites.tsx`

**Step 1: Create compact favorites for sidebar**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { useMyFavorites } from '@/features/favorites/hooks/useFavorites';
import type { EntityType, FavoriteItem } from '@/features/favorites/api/favorites';

type FilterType = 'all' | EntityType;

export default function SidebarFavorites() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('all');
  const entityTypeFilter = filter === 'all' ? undefined : filter;
  const { data, isLoading } = useMyFavorites(entityTypeFilter, 4);

  if (!isLoading && (!data || data.total === 0) && filter === 'all') return null;

  const filters: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Stories', value: 'story' },
    { label: 'Legacies', value: 'legacy' },
    { label: 'Media', value: 'media' },
  ];

  const handleItemClick = (item: FavoriteItem) => {
    const entity = item.entity as Record<string, string> | null;
    const legacyId = entity?.legacy_id;
    switch (item.entity_type) {
      case 'story':
        if (legacyId) navigate(`/legacy/${legacyId}/story/${item.entity_id}`);
        break;
      case 'legacy':
        navigate(`/legacy/${item.entity_id}`);
        break;
      case 'media':
        if (legacyId) navigate(`/legacy/${legacyId}/gallery`);
        break;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-4">
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
          My Favorites
        </h3>
        <button
          onClick={() => navigate('/favorites')}
          className="text-xs text-theme-primary hover:underline"
        >
          See all
        </button>
      </div>

      {/* Compact filter tabs */}
      <div className="flex rounded-lg overflow-hidden border border-neutral-100 mb-3.5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex-1 py-1.5 text-[11px] font-medium capitalize transition-colors ${
              filter === f.value
                ? 'bg-theme-primary text-white'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin text-theme-primary" />
        </div>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.items.slice(0, 3).map((item) => {
            const entity = item.entity as Record<string, string> | null;
            if (!entity) return null;
            const title = entity.title || entity.name || entity.filename || 'Untitled';
            const legacyName = entity.legacy_name;

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
              >
                <Heart className="size-3 text-theme-primary opacity-70 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{title}</div>
                  <div className="text-[11px] text-neutral-400">
                    {item.entity_type}{legacyName ? ` · ${legacyName}` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && data && data.items.length === 0 && filter !== 'all' && (
        <p className="text-xs text-neutral-400 text-center py-4">
          No {filter} favorites yet
        </p>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/dashboard/SidebarFavorites.tsx
git commit -m "feat: create compact SidebarFavorites component"
```

---

### Task 10: Frontend — Restructure DashboardPage Layout

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`

**Step 1: Rewrite DashboardPage with two-column layout**

This is the final assembly step. Replace the current single-column stack with the new layout:

```tsx
import { Plus, Loader2, ArrowRight } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { useLegacies } from '@/features/legacy/hooks/useLegacies';
import ContextualGreeting from '@/components/dashboard/ContextualGreeting';
import LegacyCard from '@/components/legacy/LegacyCard';
import StoryPromptCard from '@/features/story-prompts/components/StoryPromptCard';
import RecentStoriesList from '@/components/dashboard/RecentStoriesList';
import QuickActions from '@/components/dashboard/QuickActions';
import SidebarActivity from '@/components/dashboard/SidebarActivity';
import SidebarFavorites from '@/components/dashboard/SidebarFavorites';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: myLegaciesData, isLoading: myLegaciesLoading } = useLegacies('all', { enabled: true });
  const myLegacies = myLegaciesData?.items;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <ContextualGreeting />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 pb-16 w-full">
        <div className="grid lg:grid-cols-[1fr_340px] gap-8 mt-8">

          {/* LEFT COLUMN */}
          <div className="space-y-8">
            <StoryPromptCard />

            {/* My Legacies */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-serif font-medium tracking-tight">My Legacies</h2>
                <span
                  onClick={() => navigate('/legacies')}
                  className="text-xs text-theme-primary font-medium cursor-pointer hover:underline"
                >
                  View all
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myLegaciesLoading && (
                  <div className="col-span-full flex items-center justify-center py-12">
                    <Loader2 className="size-6 animate-spin text-theme-primary" />
                  </div>
                )}

                {!myLegaciesLoading && myLegacies?.slice(0, 2).map((legacy) => (
                  <LegacyCard key={legacy.id} legacy={legacy} />
                ))}
              </div>

              {!myLegaciesLoading && myLegacies && myLegacies.length > 2 && (
                <div className="mt-4 text-center">
                  <Link
                    to="/legacies"
                    className="text-sm text-theme-primary hover:text-theme-primary-dark font-medium inline-flex items-center gap-1"
                  >
                    View all {myLegacies.length} legacies
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              )}
            </section>

            <RecentStoriesList />
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
            <QuickActions />
            <SidebarActivity />
            <SidebarFavorites />
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}
```

**Key changes from current:**
- Removed `RecentlyViewedSection` (both legacy and story variants)
- Removed `RecentActivitySection` (replaced by `SidebarActivity`)
- Removed `FavoritesSection` (replaced by `SidebarFavorites`)
- Removed "Create New" dashed card (redundant with Quick Actions)
- Removed per-section `py-20` / `bg-neutral-50` alternating backgrounds
- Added CSS grid with `lg:grid-cols-[1fr_340px]`
- Sidebar is sticky on desktop (`lg:sticky lg:top-20 lg:self-start`)

**Step 2: Verify everything renders**

Run: `npm run dev` from `apps/web/`
Check:
- Desktop: two-column layout, sidebar on right
- Mobile (resize browser): single column, sidebar content below main
- Hero area with gradient and CTA card
- Story prompt with legacy avatar
- Legacy cards with overlays and action buttons
- Recent stories compact list
- Sidebar: Quick Actions, Activity, Favorites

**Step 3: Run lint and type checks**

Run: `npm run lint && npm run build` from `apps/web/`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/pages/DashboardPage.tsx
git commit -m "feat: restructure dashboard with two-column layout and sidebar"
```

---

### Task 11: Visual Polish and Responsive Testing

**Files:**
- May touch any of the above components for adjustments

**Step 1: Desktop visual review**

Open `http://localhost:5173` at full desktop width. Verify:
- [ ] Hero gradient transitions smoothly
- [ ] CTA card aligns right of greeting
- [ ] Story prompt card has legacy avatar
- [ ] Legacy cards show image overlays (member count, In Memoriam badge)
- [ ] Legacy card action buttons work (navigate to correct tabs)
- [ ] Recent stories list shows accent bars and truncated excerpts
- [ ] Sidebar Quick Actions buttons all work (Create Legacy, Write Story, Invite Family)
- [ ] Sidebar activity feed is readable at 340px width
- [ ] Sidebar favorites tabs work

**Step 2: Mobile visual review**

Resize to mobile width. Verify:
- [ ] Layout collapses to single column
- [ ] Sidebar content appears below main content
- [ ] CTA card stacks below greeting
- [ ] Legacy cards stack to single column
- [ ] Everything is touch-friendly (adequate tap targets)

**Step 3: Quick Actions legacy picker test**

If user has multiple legacies:
- [ ] "Write a Story" shows legacy picker dialog
- [ ] "Invite Family" shows legacy picker, then invite modal
If user has one legacy:
- [ ] "Write a Story" navigates directly
- [ ] "Invite Family" opens invite modal directly

**Step 4: Fix any issues found, commit**

```bash
git add -u
git commit -m "fix: visual polish and responsive adjustments for dashboard redesign"
```

---

## Task Dependency Graph

```
Task 1 (backend: prompt image) ──┐
Task 2 (backend: story count) ───┤
                                  ├── Task 4 (StoryPromptCard) ──┐
                                  │                               │
Task 3 (ContextualGreeting) ──────┤                               │
Task 5 (LegacyCard) ─────────────┤                               │
Task 6 (RecentStoriesList) ───────┤                               │
Task 7 (QuickActions) ────────────┼── Task 10 (DashboardPage) ── Task 11 (Polish)
Task 8 (SidebarActivity) ─────────┤
Task 9 (SidebarFavorites) ────────┘
```

**Parallelizable groups:**
- Tasks 1 + 2 (backend, independent)
- Tasks 3 + 5 + 6 + 7 + 8 + 9 (frontend components, independent of each other)
- Task 4 depends on Task 1 (needs `legacy_profile_image_url` field)
- Task 5 depends on Task 2 (needs `story_count` field)
- Task 10 depends on all component tasks (3-9)
- Task 11 depends on Task 10

## Notes for Implementer

1. **Theme colors:** Use Tailwind theme classes (`text-theme-primary`, `bg-theme-background`, etc.) — NOT the hardcoded hex values from `example-dashboard-redesign.jsx`.

2. **Serif font:** The redesign uses Georgia/serif for headings. Use Tailwind's `font-serif` class. Verify `tailwind.config.js` has a serif font stack configured; if not, add one.

3. **`ActivityFeedItem` in sidebar:** The existing component may render too wide for 340px. If so, add a `compact?: boolean` prop or create a simpler inline rendering.

4. **`LegacyPickerDialog` generalization:** Consider adding an `onSelect?: (legacyId: string) => void` prop to make it reusable for both story creation and invite flows, instead of maintaining the separate `InviteLegacyPicker` inner component.

5. **Story favorited status:** The `useRecentlyViewed` data doesn't include a `favorited` flag. The heart icon on recent stories is deferred — can be added later by cross-referencing with favorites data or adding the field to the API.

6. **Backend exact paths:** The implementer should verify exact model field names (e.g., `Story.primary_legacy_id` vs `Story.legacy_id`) and the profile image URL pattern by reading the actual models before implementing Tasks 1-2.
