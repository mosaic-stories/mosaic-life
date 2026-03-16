# Clickable User Links Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all user names clickable throughout the platform, linking to `/u/{username}`.

**Architecture:** Create a shared `<UserLink>` component and add `username` to all backend API responses that reference users. Then integrate `<UserLink>` into every component that displays a user name.

**Tech Stack:** React + TypeScript (frontend), Python/FastAPI + Pydantic (backend), Vitest + React Testing Library (tests)

**Status:** ✅ COMPLETE (2026-03-16)

All 14 tasks implemented:
- Tasks 1-3: Backend schemas and services updated with `username`/`avatar_url` fields
- Task 4: `UserLink` component created with tests (6 tests)
- Task 5: All frontend TypeScript interfaces updated
- Tasks 6-8: UserLink integrated into LegacySidebar, StoryCard, ActivityFeedItem
- Tasks 9-12: UserLink integrated into PersonCard, TopConnectionsChips, ConnectionRequestsTab, NotificationItem, MemberDrawer
- Tasks 13-14: All backend tests pass (1209), all frontend tests pass (338), frontend build succeeds, `just validate-backend` passes

---

## Task 1: Add `username` to backend story schemas and service

**Files:**
- Modify: `services/core-api/app/schemas/story.py:74-82` (StoryAuthorInfo)
- Modify: `services/core-api/app/schemas/story.py:85-106` (StorySummary)
- Modify: `services/core-api/app/schemas/story.py:142-163` (StoryDetail)
- Modify: `services/core-api/app/services/story.py:486-507` (StorySummary building)
- Modify: `services/core-api/app/services/story.py:1015-1039` (StoryDetail building)

**Step 1: Update StoryAuthorInfo schema**

Add `username` field:

```python
class StoryAuthorInfo(BaseModel):
    """Schema for story author information."""

    id: UUID
    name: str
    email: str
    avatar_url: str | None = None
    username: str

    model_config = {"from_attributes": True}
```

**Step 2: Update StorySummary schema**

Add `author_username` and `author_avatar_url` after `author_name`:

```python
class StorySummary(BaseModel):
    """Schema for story summary in lists."""

    id: UUID
    title: str
    content_preview: str = Field(description="Truncated preview of story content")
    author_id: UUID
    author_name: str
    author_username: str
    author_avatar_url: str | None = None
    # ... rest unchanged
```

**Step 3: Update StoryDetail schema**

Add `author_username` and `author_avatar_url` after `author_email`:

```python
class StoryDetail(BaseModel):
    """Schema for full story details."""

    id: UUID
    author_id: UUID
    author_name: str
    author_email: str
    author_username: str
    author_avatar_url: str | None = None
    # ... rest unchanged
```

**Step 4: Update StorySummary building in story service**

In `services/core-api/app/services/story.py`, everywhere `StorySummary(` is constructed (lines ~486, ~545, ~795, ~892), add:

```python
author_username=story.author.username,
author_avatar_url=story.author.avatar_url,
```

after `author_name=story.author.name,`.

**Step 5: Update StoryDetail building in story service**

At line ~1015, add:

```python
author_username=story.author.username,
author_avatar_url=story.author.avatar_url,
```

after `author_email=story.author.email,`.

**Step 6: Run backend validation**

Run: `just validate-backend`
Expected: PASS

**Step 7: Commit**

```bash
git add services/core-api/app/schemas/story.py services/core-api/app/services/story.py
git commit -m "feat: add username and avatar_url to story author responses"
```

---

## Task 2: Add `username` to backend legacy member, activity, media, notification, and connection schemas

**Files:**
- Modify: `services/core-api/app/schemas/legacy.py:51-60` (LegacyMemberResponse)
- Modify: `services/core-api/app/schemas/activity.py:76-81` (ActorSummary)
- Modify: `services/core-api/app/schemas/media.py:74-96` (MediaSummary)
- Modify: `services/core-api/app/schemas/media.py:99-122` (MediaDetail)
- Modify: `services/core-api/app/schemas/notification.py:9-25` (NotificationResponse)
- Modify: `services/core-api/app/schemas/connection.py:15-26` (ConnectionRequestResponse)
- Modify: `services/core-api/app/schemas/connections.py:17-23` (TopConnectionResponse)
- Modify: `services/core-api/app/schemas/connections.py:44-52` (PersonConnectionResponse)

**Step 1: Update LegacyMemberResponse**

```python
class LegacyMemberResponse(BaseModel):
    """Schema for legacy member information."""

    user_id: UUID
    email: str
    name: str
    username: str
    avatar_url: str | None = None
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}
```

Note: `avatar_url` already returned by service but was missing from the schema. Adding both.

**Step 2: Update ActorSummary**

```python
class ActorSummary(BaseModel):
    """Minimal user info for social feed items."""

    id: UUID
    name: str
    username: str
    avatar_url: str | None = None
```

**Step 3: Update MediaSummary and MediaDetail**

Add after `uploader_name`:

```python
    uploader_username: str
    uploader_avatar_url: str | None = None
```

**Step 4: Update NotificationResponse**

Add after `actor_avatar_url`:

```python
    actor_username: str | None = None
```

**Step 5: Update ConnectionRequestResponse**

Add username fields:

```python
class ConnectionRequestResponse(BaseModel):
    id: UUID
    from_user_id: UUID
    from_user_name: str
    from_user_username: str
    from_user_avatar_url: str | None = None
    to_user_id: UUID
    to_user_name: str
    to_user_username: str
    to_user_avatar_url: str | None = None
    relationship_type: str
    message: str | None = None
    status: str
    created_at: datetime
```

**Step 6: Update TopConnectionResponse and PersonConnectionResponse**

Add `username` field after `display_name` in both:

```python
class TopConnectionResponse(BaseModel):
    user_id: UUID
    display_name: str
    username: str
    avatar_url: str | None
    shared_legacy_count: int
```

```python
class PersonConnectionResponse(BaseModel):
    user_id: UUID
    display_name: str
    username: str
    avatar_url: str | None
    shared_legacy_count: int
    shared_legacies: list[SharedLegacySummary]
    highest_shared_role: str
```

**Step 7: Run backend validation**

Run: `just validate-backend`
Expected: FAIL (services not yet updated to provide new fields)

---

## Task 3: Update backend services to populate `username`

**Files:**
- Modify: `services/core-api/app/services/member.py:56-64` (legacy member dict)
- Modify: `services/core-api/app/services/activity.py:542-550` (actor map building)
- Modify: `services/core-api/app/services/media.py:335-363` (MediaSummary building)
- Modify: `services/core-api/app/services/notification.py:79-95` (notification building)
- Modify: `services/core-api/app/services/connection_request.py:157-169` (create_request response)
- Modify: `services/core-api/app/services/connection_request.py:399-414` (list_incoming response)
- Modify: `services/core-api/app/services/connection_request.py:435-450` (list_outgoing response)
- Modify: `services/core-api/app/services/connections.py:115-122` (top_connections)
- Modify: `services/core-api/app/services/connections.py:161-185` (_ConnectionAccumulator)
- Modify: `services/core-api/app/services/connections.py:244-248` (people building)

**Step 1: Update member service**

In `services/core-api/app/services/member.py` at line ~56, add `"username": user.username,` to the member dict:

```python
members.append(
    {
        "user_id": str(user.id),
        "email": user.email,
        "name": user.name,
        "username": user.username,
        "avatar_url": user.avatar_url,
        "role": member.role,
        "joined_at": joined_at_str,
    }
)
```

**Step 2: Update activity service actor loading**

In `services/core-api/app/services/activity.py` at line ~542, add `User.username` to the select and include it in actor_map:

```python
actor_rows = await db.execute(
    select(User.id, User.name, User.username, User.avatar_url).where(User.id.in_(actor_ids))
)
for uid, name, username, avatar_url in actor_rows.all():
    actor_map[uid] = {
        "id": uid,
        "name": name or "",
        "username": username or "",
        "avatar_url": avatar_url,
    }
```

**Step 3: Update media service**

In `services/core-api/app/services/media.py` at line ~343, add after `uploader_name=m.owner.name,`:

```python
uploader_username=m.owner.username,
uploader_avatar_url=m.owner.avatar_url,
```

Do this for both MediaSummary (line ~336) and MediaDetail building locations.

**Step 4: Update notification service**

In `services/core-api/app/services/notification.py` at line ~87, add:

```python
actor_username=n.actor.username if n.actor else None,
```

**Step 5: Update connection request service**

In `services/core-api/app/services/connection_request.py`, update all three response-building locations:

At line ~157 (create_request), ~399 (list_incoming), ~435 (list_outgoing), add:

```python
from_user_username=req.from_user.username,
to_user_username=req.to_user.username,
```

For create_request (line ~157), use `sender.username` and `target_user.username` instead since those are the local variables.

**Step 6: Update connections hub service**

In `services/core-api/app/services/connections.py`:

At line ~118 (get_top_connections), add `"username": user.username,` to the dict.

At line ~166 (_ConnectionAccumulator dataclass), add `username: str` field.

At line ~177 (to_dict), add `"username": self.username`.

At line ~244 (people accumulator creation), add `username=user.username,`.

**Step 7: Run backend validation**

Run: `just validate-backend`
Expected: PASS

**Step 8: Commit**

```bash
git add services/core-api/app/schemas/ services/core-api/app/services/
git commit -m "feat: populate username in all user-referencing API responses"
```

---

## Task 4: Create the `UserLink` frontend component with tests

**Files:**
- Create: `apps/web/src/components/UserLink.tsx`
- Create: `apps/web/src/components/UserLink.test.tsx`

**Step 1: Write tests for UserLink**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import UserLink from './UserLink';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('UserLink', () => {
  it('renders display name as a link to /u/{username}', () => {
    renderWithRouter(
      <UserLink username="joe-smith-a1b2" displayName="Joe Smith" />
    );
    const link = screen.getByRole('link', { name: 'Joe Smith' });
    expect(link).toHaveAttribute('href', '/u/joe-smith-a1b2');
  });

  it('does not render avatar by default', () => {
    renderWithRouter(
      <UserLink username="joe-smith-a1b2" displayName="Joe Smith" avatarUrl="https://example.com/avatar.jpg" />
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders avatar when showAvatar is true', () => {
    renderWithRouter(
      <UserLink
        username="joe-smith-a1b2"
        displayName="Joe Smith"
        avatarUrl="https://example.com/avatar.jpg"
        showAvatar
      />
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders initials fallback when showAvatar is true but no avatarUrl', () => {
    renderWithRouter(
      <UserLink username="joe-smith-a1b2" displayName="Joe Smith" showAvatar />
    );
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    renderWithRouter(
      <UserLink username="joe-smith-a1b2" displayName="Joe Smith" className="text-lg" />
    );
    const link = screen.getByRole('link');
    expect(link.className).toContain('text-lg');
  });

  it('stops click propagation to prevent parent card navigation', () => {
    // UserLink should stop propagation so clicking the name doesn't
    // also trigger the parent card's onClick
    renderWithRouter(
      <UserLink username="joe-smith-a1b2" displayName="Joe Smith" />
    );
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && npm run test -- --run src/components/UserLink.test.tsx`
Expected: FAIL (component doesn't exist yet)

**Step 3: Create UserLink component**

```tsx
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export interface UserLinkProps {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  showAvatar?: boolean;
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

export default function UserLink({
  username,
  displayName,
  avatarUrl,
  showAvatar = false,
  className = '',
}: UserLinkProps) {
  return (
    <Link
      to={`/u/${username}`}
      className={`inline-flex items-center gap-1.5 hover:underline ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {showAvatar && (
        <Avatar className="size-6">
          <AvatarImage src={avatarUrl || undefined} alt={displayName} />
          <AvatarFallback className="bg-theme-primary text-white text-[9px] font-semibold">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      )}
      <span>{displayName}</span>
    </Link>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npm run test -- --run src/components/UserLink.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/UserLink.tsx apps/web/src/components/UserLink.test.tsx
git commit -m "feat: create UserLink component for clickable user names"
```

---

## Task 5: Update frontend TypeScript interfaces

**Files:**
- Modify: `apps/web/src/features/story/api/stories.ts:17-48`
- Modify: `apps/web/src/features/legacy/api/legacies.ts:4-11`
- Modify: `apps/web/src/features/activity/api/activity.ts:3-7`
- Modify: `apps/web/src/features/media/api/media.ts:46-63`
- Modify: `apps/web/src/features/notifications/api/notifications.ts:5-18`
- Modify: `apps/web/src/features/user-connections/api/userConnections.ts:11-23`
- Modify: `apps/web/src/features/connections/api/connections.ts:11-16,32-39`

**Step 1: Update StorySummary and StoryDetail**

In `apps/web/src/features/story/api/stories.ts`:

Add `author_username: string;` and `author_avatar_url: string | null;` after `author_name` in both `StorySummary` (after line 23) and `StoryDetail` (after line 36).

**Step 2: Update LegacyMember**

In `apps/web/src/features/legacy/api/legacies.ts`:

Add `username: string;` after `name`:

```typescript
export interface LegacyMember {
  user_id: string;
  email: string;
  name: string | null;
  username: string;
  avatar_url?: string | null;
  role: 'creator' | 'admin' | 'advocate' | 'admirer';
  joined_at: string;
}
```

**Step 3: Update ActorSummary**

In `apps/web/src/features/activity/api/activity.ts`:

```typescript
export interface ActorSummary {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
}
```

**Step 4: Update MediaItem**

In `apps/web/src/features/media/api/media.ts`:

Add after `uploader_name`:

```typescript
  uploader_username: string;
  uploader_avatar_url: string | null;
```

**Step 5: Update NotificationResponse**

In `apps/web/src/features/notifications/api/notifications.ts`:

Add after `actor_avatar_url`:

```typescript
  actor_username: string | null;
```

**Step 6: Update ConnectionRequestResponse**

In `apps/web/src/features/user-connections/api/userConnections.ts`:

Add `from_user_username: string;` after `from_user_name` and `to_user_username: string;` after `to_user_name`:

```typescript
export interface ConnectionRequestResponse {
  id: string;
  from_user_id: string;
  from_user_name: string;
  from_user_username: string;
  from_user_avatar_url: string | null;
  to_user_id: string;
  to_user_name: string;
  to_user_username: string;
  to_user_avatar_url: string | null;
  relationship_type: string;
  message: string | null;
  status: string;
  created_at: string;
}
```

**Step 7: Update TopConnection and PersonConnection**

In `apps/web/src/features/connections/api/connections.ts`:

Add `username: string;` after `display_name` in both `TopConnection` and `PersonConnection`.

**Step 8: Commit**

```bash
git add apps/web/src/features/
git commit -m "feat: add username to all frontend user-related TypeScript interfaces"
```

---

## Task 6: Integrate UserLink into LegacySidebar MemberRow

**Files:**
- Modify: `apps/web/src/features/legacy/components/LegacySidebar.tsx:95-115`

**Step 1: Update MemberRow to use UserLink**

Replace the current MemberRow function (lines 95-115):

```tsx
function MemberRow({ member }: { member: LegacyMember }) {
  const roleLabel = member.role === 'creator' ? 'Creator' : 'Member';

  return (
    <div className="flex items-center gap-2.5">
      <UserLink
        username={member.username}
        displayName={member.name || member.email}
        avatarUrl={member.avatar_url}
        showAvatar
        className="text-sm font-medium text-neutral-800"
      />
      <div className="ml-auto">
        <div className="text-[11px] text-neutral-400">{roleLabel}</div>
      </div>
    </div>
  );
}
```

Add `import UserLink from '@/components/UserLink';` to the imports.

**Step 2: Run frontend tests**

Run: `cd apps/web && npm run test -- --run`
Expected: PASS (or fix any broken tests due to new markup)

**Step 3: Commit**

```bash
git add apps/web/src/features/legacy/components/LegacySidebar.tsx
git commit -m "feat: make legacy sidebar member names clickable via UserLink"
```

---

## Task 7: Integrate UserLink into StoryCard

**Files:**
- Modify: `apps/web/src/features/legacy/components/StoryCard.tsx:1-81`
- Modify: `apps/web/src/features/legacy/components/StoryCard.test.tsx`

**Step 1: Update StoryCard footer**

Replace the author display section (lines 64-70) with UserLink. Remove the manual initials logic (lines 12-14). Add UserLink import.

The footer author section becomes:

```tsx
<div className="flex items-center gap-2">
  <UserLink
    username={story.author_username}
    displayName={story.author_name}
    avatarUrl={story.author_avatar_url}
    showAvatar
    className="text-xs text-neutral-500"
  />
</div>
```

**Step 2: Update StoryCard test mock data**

In `StoryCard.test.tsx`, add `author_username: 'jordan-example-x1y2'` and `author_avatar_url: null` to the mock story object. Wrap the render in `<MemoryRouter>` since UserLink uses `<Link>`.

**Step 3: Run tests**

Run: `cd apps/web && npm run test -- --run src/features/legacy/components/StoryCard.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/features/legacy/components/StoryCard.tsx apps/web/src/features/legacy/components/StoryCard.test.tsx
git commit -m "feat: make story card author names clickable via UserLink"
```

---

## Task 8: Integrate UserLink into ActivityFeedItem

**Files:**
- Modify: `apps/web/src/features/activity/components/ActivityFeedItem.tsx:38-93`
- Modify: `apps/web/src/components/dashboard/SidebarActivity.test.tsx`

**Step 1: Update ActivityFeedItem**

Replace the actor name span (line 81) with a conditional: if actor is current user show "You", otherwise show inline `<UserLink>`. Add UserLink import.

Line 80-81 becomes:

```tsx
<p className="text-sm text-neutral-900">
  {item.actor.id === currentUserId ? (
    <span className="font-medium">You</span>
  ) : (
    <UserLink
      username={item.actor.username}
      displayName={item.actor.name}
      className="font-medium text-neutral-900"
    />
  )}{' '}
  {actionText}{' '}
  {entityName && (
    <span className="font-medium">&ldquo;{entityName}&rdquo;</span>
  )}
</p>
```

Remove the `actorName` const (line 44) since the logic is now in the JSX.

**Step 2: Update SidebarActivity test mock data**

In `SidebarActivity.test.tsx`, add `username: 'joe-x1y2'` to all actor mocks. Ensure MemoryRouter wraps renders.

**Step 3: Run tests**

Run: `cd apps/web && npm run test -- --run src/components/dashboard/SidebarActivity.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/features/activity/components/ActivityFeedItem.tsx apps/web/src/components/dashboard/SidebarActivity.test.tsx
git commit -m "feat: make activity feed actor names clickable via UserLink"
```

---

## Task 9: Integrate UserLink into PersonCard and TopConnectionsChips

**Files:**
- Modify: `apps/web/src/components/connections-hub/PersonCard.tsx:1-52`
- Modify: `apps/web/src/components/connections-hub/TopConnectionsChips.tsx:1-45`
- Modify: `apps/web/src/components/connections-hub/PersonCard.test.tsx`
- Modify: `apps/web/src/components/connections-hub/TopConnectionsChips.test.tsx`

**Step 1: Update PersonCard**

Replace the avatar + name block (lines 14-33) with UserLink. Add UserLink import.

The name/avatar section becomes:

```tsx
<div className="flex items-center gap-3">
  <UserLink
    username={person.username}
    displayName={person.display_name}
    avatarUrl={person.avatar_url}
    showAvatar
    className="text-sm font-medium text-neutral-900"
  />
  {/* ... shared legacy count and role badge remain */}
</div>
```

Keep the shared legacy count text and role badge outside the UserLink.

**Step 2: Update TopConnectionsChips**

Replace the avatar + name rendering (lines 19-39) with UserLink. The chip becomes:

```tsx
<div key={item.user_id} className="flex flex-col items-center gap-1.5 min-w-0">
  <div className="relative">
    <UserLink
      username={item.username}
      displayName={item.display_name}
      showAvatar
      avatarUrl={item.avatar_url}
      className="flex flex-col items-center gap-1.5"
    />
    <span className="absolute -top-1 -right-1 size-5 rounded-full bg-theme-primary text-white text-xs flex items-center justify-center font-medium">
      {item.shared_legacy_count}
    </span>
  </div>
</div>
```

Note: The avatar sizing in TopConnectionsChips is `size-12` vs UserLink's default `size-6`. Pass a className override or adjust the UserLink component to accept an `avatarSize` prop. Simplest approach: pass a `className` that overrides the avatar size via CSS.

**Step 3: Update test mock data**

Add `username: 'sarah-x1y2'` (etc.) to mock data in both test files. Wrap renders in MemoryRouter.

**Step 4: Run tests**

Run: `cd apps/web && npm run test -- --run src/components/connections-hub/PersonCard.test.tsx src/components/connections-hub/TopConnectionsChips.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/connections-hub/PersonCard.tsx apps/web/src/components/connections-hub/TopConnectionsChips.tsx apps/web/src/components/connections-hub/PersonCard.test.tsx apps/web/src/components/connections-hub/TopConnectionsChips.test.tsx
git commit -m "feat: make PersonCard and TopConnectionsChips user names clickable"
```

---

## Task 10: Integrate UserLink into ConnectionRequestsTab

**Files:**
- Modify: `apps/web/src/features/user-connections/components/ConnectionRequestsTab.tsx:16-129`

**Step 1: Update IncomingRequestCard**

Replace avatar + name block (lines 32-40) with UserLink. Remove manual initials (lines 23-27). Add UserLink import.

```tsx
<UserLink
  username={request.from_user_username}
  displayName={request.from_user_name}
  avatarUrl={request.from_user_avatar_url}
  showAvatar
  className="font-medium text-neutral-900"
/>
```

**Step 2: Update OutgoingRequestCard**

Same pattern, replacing lines 94-101:

```tsx
<UserLink
  username={request.to_user_username}
  displayName={request.to_user_name}
  avatarUrl={request.to_user_avatar_url}
  showAvatar
  className="font-medium text-neutral-900"
/>
```

Remove manual initials (lines 85-89).

**Step 3: Run tests**

Run: `cd apps/web && npm run test -- --run`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/features/user-connections/components/ConnectionRequestsTab.tsx
git commit -m "feat: make connection request user names clickable via UserLink"
```

---

## Task 11: Integrate UserLink into NotificationItem

**Files:**
- Modify: `apps/web/src/features/notifications/components/NotificationItem.tsx:12-64`

**Step 1: Update NotificationItem**

The notification message is a pre-built string (e.g., "Joe Smith wants to connect with you"), so we can't easily replace just the name within the message. Instead, make the avatar + a small name label clickable above the message.

Replace the avatar section (lines 36-41). Add UserLink import. When `actor_username` is present, wrap the avatar in a UserLink:

```tsx
{notification.actor_username ? (
  <UserLink
    username={notification.actor_username}
    displayName={initials}
    avatarUrl={notification.actor_avatar_url}
    showAvatar
    className="flex-shrink-0"
  />
) : (
  <Avatar className="size-9 flex-shrink-0">
    <AvatarImage src={notification.actor_avatar_url || undefined} />
    <AvatarFallback className="bg-theme-primary text-white text-xs">
      {initials}
    </AvatarFallback>
  </Avatar>
)}
```

Note: For notifications, the avatar becomes clickable but the message text itself stays as-is. This is a pragmatic choice — rewriting notification messages to embed links would be a larger change.

**Step 2: Run tests**

Run: `cd apps/web && npm run test -- --run`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/features/notifications/components/NotificationItem.tsx
git commit -m "feat: make notification actor avatars clickable via UserLink"
```

---

## Task 12: Integrate UserLink into MemberDrawer

**Files:**
- Modify: `apps/web/src/features/members/components/MemberDrawer.tsx:200-222`

**Step 1: Update member name display**

Replace the avatar + name block (lines 205-218). The name portion (line 213-218) becomes:

```tsx
<div className="flex-1 min-w-0">
  <div className="font-medium truncate">
    <UserLink
      username={member.username}
      displayName={member.name || member.email}
      avatarUrl={member.avatar_url}
      className="font-medium"
    />
    {isCurrentUser && (
      <span className="text-muted-foreground ml-1">(you)</span>
    )}
  </div>
  <div className="text-sm text-muted-foreground truncate">
    {member.email}
  </div>
</div>
```

Keep the Avatar component separately above since MemberDrawer uses a larger `size-10` avatar. Alternatively, use UserLink with showAvatar and a size override class.

Add UserLink import.

**Step 2: Run tests**

Run: `cd apps/web && npm run test -- --run`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/features/members/components/MemberDrawer.tsx
git commit -m "feat: make member drawer user names clickable via UserLink"
```

---

## Task 13: Update existing backend tests

**Files:**
- Modify: Backend test files that assert on response shapes for stories, members, activity, media, notifications, connections

**Step 1: Search for tests that assert on response fields**

Run: `cd services/core-api && grep -rn "author_name\|uploader_name\|actor_name\|from_user_name\|display_name" tests/`

For each test that constructs mock User objects or asserts on response fields, add the new `username` field.

**Step 2: Update test fixtures**

Any test User fixture that creates a User object should already have `username` set (since it's a required field on the model). Verify and add `username` to any mock data or response assertions that check field presence.

**Step 3: Run all backend tests**

Run: `cd services/core-api && uv run pytest`
Expected: PASS

**Step 4: Commit**

```bash
git add services/core-api/tests/
git commit -m "test: update backend tests for username in API responses"
```

---

## Task 14: Final validation and cleanup

**Step 1: Run full backend validation**

Run: `just validate-backend`
Expected: PASS

**Step 2: Run full frontend tests**

Run: `cd apps/web && npm run test -- --run`
Expected: PASS

**Step 3: Run frontend build**

Run: `cd apps/web && npm run build`
Expected: PASS (no TypeScript errors)

**Step 4: Manual smoke test (if local env running)**

Run: `docker compose -f infra/compose/docker-compose.yml up -d`

Verify:
- Legacy page: member names in sidebar are clickable links
- Story cards: author names are clickable
- Activity feed: actor names (not "You") are clickable
- Connections hub: person cards and top connections chips are clickable
- Connection requests: user names are clickable
- Notifications: actor avatars are clickable
- Member drawer: member names are clickable
- All links navigate to `/u/{username}`

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "feat: complete clickable user links across platform"
```
