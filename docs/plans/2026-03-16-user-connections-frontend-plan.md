# User Connections Frontend — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the React frontend for user profiles, user-to-user connections, and legacy access requests — consuming the backend APIs built in Phases 1-3.

**Architecture:** Feature-based module structure under `apps/web/src/features/`. Each feature gets API client functions, TanStack Query hooks, and React components. The existing `/connections` page (AI Connections Hub) is extended with new tabs for user connections and requests. A new `/u/:username` route is added for public profiles. All forms use React Hook Form + Zod. All UI uses existing shadcn/ui components.

**Tech Stack:** React 18 / TypeScript (strict) / Vite / React Router / TanStack Query v5 / shadcn/ui / Zod / React Hook Form / Vitest / lucide-react

**Design doc:** [docs/plans/2026-03-15-user-connections-design.md](2026-03-15-user-connections-design.md)
**Backend plan:** [docs/plans/2026-03-15-user-connections-plan.md](2026-03-15-user-connections-plan.md)

---

## Implementation Status

| Task | Status | Notes |
|------|--------|-------|
| Task 1: API Layer — User Connections & Requests | ✅ Complete | Committed d2a4b6d |
| Task 2: API Layer — Profiles & Legacy Access | ✅ Complete | Committed d2a4b6d |
| Task 3: User Profile Page (`/u/:username`) | ✅ Complete | Committed 62edf4f |
| Task 4: Settings — Connections & Privacy Tab | ✅ Complete | Committed 62edf4f |
| Task 5: ConnectButton & ConnectionRequestDialog | ✅ Complete | Committed 62edf4f |
| Task 6: Connections Page — My Connections & Requests Tabs | ✅ Complete | Committed a952915 |
| Task 7: Legacy Access — Request Button, Dialog, MemberDrawer | ✅ Complete | Committed a952915 |
| Task 8: SearchBar Wiring & Notification Types | ✅ Complete | Committed a952915 |

---

## Conventions & Patterns

**These patterns are used throughout the codebase. Follow them exactly.**

### API Client Pattern
```typescript
// features/{feature}/api/{name}.ts
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client';

export interface SomeResponse { /* ... */ }

export async function getSomething(): Promise<SomeResponse> {
  return apiGet<SomeResponse>('/api/endpoint');
}
```

### TanStack Query Hook Pattern
```typescript
// features/{feature}/hooks/use{Feature}.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

export const featureKeys = {
  all: ['feature'] as const,
  list: () => [...featureKeys.all, 'list'] as const,
  detail: (id: string) => [...featureKeys.all, 'detail', id] as const,
};

export function useFeatureList() {
  return useQuery({
    queryKey: featureKeys.list(),
    queryFn: getFeatureList,
    staleTime: STALE_TIME,
  });
}

export function useCreateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createFeature,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featureKeys.all });
    },
  });
}
```

### Component Pattern
- shadcn/ui components from `@/components/ui/`
- Tailwind CSS for styling (theme classes: `text-theme-primary`, `bg-theme-background`)
- `Loader2` spinner from lucide-react for loading states
- `Card` for content containers
- `Button` with variants: default, outline, ghost, destructive
- `Avatar` with `AvatarImage` + `AvatarFallback` (initials)
- `Badge` for status/role labels with color classes
- `Sheet` for drawers, `Dialog` for modals
- `Select` for dropdowns, `Tabs` for tab navigation

### Existing shadcn/ui imports
```typescript
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
```

---

## Task 1: API Layer — User Connections & Requests

**Files:**
- Create: `apps/web/src/features/user-connections/api/userConnections.ts`
- Create: `apps/web/src/features/user-connections/hooks/useUserConnections.ts`
- Create: `apps/web/src/features/user-connections/index.ts`

**Step 1: Create the API client**

```typescript
// apps/web/src/features/user-connections/api/userConnections.ts
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client';

// --- Connection Request Types ---

export interface ConnectionRequestCreate {
  to_user_id: string;
  relationship_type: string;
  message?: string | null;
}

export interface ConnectionRequestResponse {
  id: string;
  from_user_id: string;
  from_user_name: string;
  from_user_avatar_url: string | null;
  to_user_id: string;
  to_user_name: string;
  to_user_avatar_url: string | null;
  relationship_type: string;
  message: string | null;
  status: string;
  created_at: string;
}

// --- Connection Types ---

export interface ConnectionResponse {
  id: string;
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  connected_at: string;
}

export interface ConnectionDetailResponse extends ConnectionResponse {
  relationship_type: string | null;
  who_they_are_to_me: string | null;
  who_i_am_to_them: string | null;
  nicknames: string[] | null;
  character_traits: string[] | null;
}

export interface RelationshipUpdate {
  relationship_type?: string | null;
  who_they_are_to_me?: string | null;
  who_i_am_to_them?: string | null;
  nicknames?: string[] | null;
  character_traits?: string[] | null;
}

// --- Connection Request API ---

export async function createConnectionRequest(
  data: ConnectionRequestCreate
): Promise<ConnectionRequestResponse> {
  return apiPost<ConnectionRequestResponse>('/api/connections/requests', data);
}

export async function getIncomingRequests(): Promise<ConnectionRequestResponse[]> {
  return apiGet<ConnectionRequestResponse[]>('/api/connections/requests/incoming');
}

export async function getOutgoingRequests(): Promise<ConnectionRequestResponse[]> {
  return apiGet<ConnectionRequestResponse[]>('/api/connections/requests/outgoing');
}

export async function acceptRequest(
  requestId: string
): Promise<ConnectionResponse> {
  return apiPatch<ConnectionResponse>(
    `/api/connections/requests/${requestId}/accept`,
    {}
  );
}

export async function declineRequest(
  requestId: string
): Promise<{ status: string }> {
  return apiPatch<{ status: string }>(
    `/api/connections/requests/${requestId}/decline`,
    {}
  );
}

export async function cancelRequest(
  requestId: string
): Promise<{ status: string }> {
  return apiDelete<{ status: string }>(
    `/api/connections/requests/${requestId}`
  );
}

// --- Connection API ---

export async function listConnections(): Promise<ConnectionResponse[]> {
  return apiGet<ConnectionResponse[]>('/api/connections/list');
}

export async function removeConnection(
  connectionId: string
): Promise<{ status: string }> {
  return apiDelete<{ status: string }>(`/api/connections/${connectionId}`);
}

export async function getConnectionRelationship(
  connectionId: string
): Promise<ConnectionDetailResponse> {
  return apiGet<ConnectionDetailResponse>(
    `/api/connections/${connectionId}/relationship`
  );
}

export async function updateConnectionRelationship(
  connectionId: string,
  data: RelationshipUpdate
): Promise<ConnectionDetailResponse> {
  return apiPatch<ConnectionDetailResponse>(
    `/api/connections/${connectionId}/relationship`,
    data
  );
}
```

**Step 2: Create the TanStack Query hooks**

```typescript
// apps/web/src/features/user-connections/hooks/useUserConnections.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createConnectionRequest,
  getIncomingRequests,
  getOutgoingRequests,
  acceptRequest,
  declineRequest,
  cancelRequest,
  listConnections,
  removeConnection,
  getConnectionRelationship,
  updateConnectionRelationship,
  type ConnectionRequestCreate,
  type RelationshipUpdate,
} from '../api/userConnections';

const STALE_TIME = 2 * 60 * 1000; // 2 minutes — connections change more often

export const userConnectionKeys = {
  all: ['user-connections'] as const,
  connections: () => [...userConnectionKeys.all, 'list'] as const,
  incomingRequests: () => [...userConnectionKeys.all, 'incoming'] as const,
  outgoingRequests: () => [...userConnectionKeys.all, 'outgoing'] as const,
  relationship: (id: string) =>
    [...userConnectionKeys.all, 'relationship', id] as const,
};

// --- Connection Queries ---

export function useMyConnections() {
  return useQuery({
    queryKey: userConnectionKeys.connections(),
    queryFn: listConnections,
    staleTime: STALE_TIME,
  });
}

export function useIncomingRequests() {
  return useQuery({
    queryKey: userConnectionKeys.incomingRequests(),
    queryFn: getIncomingRequests,
    staleTime: STALE_TIME,
  });
}

export function useOutgoingRequests() {
  return useQuery({
    queryKey: userConnectionKeys.outgoingRequests(),
    queryFn: getOutgoingRequests,
    staleTime: STALE_TIME,
  });
}

export function useConnectionRelationship(connectionId: string) {
  return useQuery({
    queryKey: userConnectionKeys.relationship(connectionId),
    queryFn: () => getConnectionRelationship(connectionId),
    staleTime: STALE_TIME,
    enabled: !!connectionId,
  });
}

// --- Connection Mutations ---

export function useCreateConnectionRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConnectionRequestCreate) =>
      createConnectionRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.outgoingRequests(),
      });
    },
  });
}

export function useAcceptRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => acceptRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.all,
      });
    },
  });
}

export function useDeclineRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => declineRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.incomingRequests(),
      });
    },
  });
}

export function useCancelRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.outgoingRequests(),
      });
    },
  });
}

export function useRemoveConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => removeConnection(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.connections(),
      });
    },
  });
}

export function useUpdateRelationship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      data,
    }: {
      connectionId: string;
      data: RelationshipUpdate;
    }) => updateConnectionRelationship(connectionId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: userConnectionKeys.relationship(variables.connectionId),
      });
    },
  });
}
```

**Step 3: Create index barrel**

```typescript
// apps/web/src/features/user-connections/index.ts
export * from './api/userConnections';
export * from './hooks/useUserConnections';
```

**Step 4: Run lint**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: PASS (no type errors — these only import from existing `@/lib/api/client` and `@tanstack/react-query`).

**Step 5: Commit**

```bash
git add apps/web/src/features/user-connections/
git commit -m "feat(frontend): add API layer for user connections and requests"
```

---

## Task 2: API Layer — Profiles, User Search & Legacy Access

**Files:**
- Create: `apps/web/src/features/profile/api/profile.ts`
- Create: `apps/web/src/features/profile/hooks/useProfile.ts`
- Create: `apps/web/src/features/profile/index.ts`
- Create: `apps/web/src/features/legacy-access/api/legacyAccess.ts`
- Create: `apps/web/src/features/legacy-access/hooks/useLegacyAccess.ts`
- Create: `apps/web/src/features/legacy-access/index.ts`
- Create: `apps/web/src/features/user-search/api/userSearch.ts`
- Create: `apps/web/src/features/user-search/hooks/useUserSearch.ts`
- Create: `apps/web/src/features/user-search/index.ts`

**Step 1: Create profile API and hooks**

```typescript
// apps/web/src/features/profile/api/profile.ts
import { apiGet, apiPatch } from '@/lib/api/client';

export interface VisibilityContext {
  show_bio: boolean;
  show_legacies: boolean;
  show_stories: boolean;
  show_media: boolean;
  show_connections: boolean;
}

export interface ProfileLegacyCard {
  id: string;
  name: string;
  subject_photo_url: string | null;
  story_count: number;
}

export interface ProfileStoryCard {
  id: string;
  title: string;
  preview: string | null;
  legacy_name: string | null;
}

export interface ProfileConnectionCard {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface ProfileResponse {
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  legacies: ProfileLegacyCard[] | null;
  stories: ProfileStoryCard[] | null;
  connections: ProfileConnectionCard[] | null;
  visibility_context: VisibilityContext;
}

export interface ProfileSettingsResponse {
  discoverable: boolean;
  visibility_legacies: string;
  visibility_stories: string;
  visibility_media: string;
  visibility_connections: string;
  visibility_bio: string;
}

export interface ProfileSettingsUpdate {
  discoverable?: boolean;
  visibility_legacies?: string;
  visibility_stories?: string;
  visibility_media?: string;
  visibility_connections?: string;
  visibility_bio?: string;
}

export async function getProfileByUsername(
  username: string
): Promise<ProfileResponse> {
  return apiGet<ProfileResponse>(`/api/users/${username}`);
}

export async function updateUsername(
  username: string
): Promise<{ username: string }> {
  return apiPatch<{ username: string }>('/api/users/me/username', { username });
}

export async function getProfileSettings(): Promise<ProfileSettingsResponse> {
  return apiGet<ProfileSettingsResponse>('/api/users/me/profile/settings');
}

export async function updateProfileSettings(
  data: ProfileSettingsUpdate
): Promise<ProfileSettingsResponse> {
  return apiPatch<ProfileSettingsResponse>(
    '/api/users/me/profile/settings',
    data
  );
}
```

```typescript
// apps/web/src/features/profile/hooks/useProfile.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProfileByUsername,
  updateUsername,
  getProfileSettings,
  updateProfileSettings,
  type ProfileSettingsUpdate,
} from '../api/profile';

const STALE_TIME = 5 * 60 * 1000;

export const profileKeys = {
  all: ['profile'] as const,
  byUsername: (username: string) =>
    [...profileKeys.all, 'user', username] as const,
  settings: () => [...profileKeys.all, 'settings'] as const,
};

export function useUserProfile(username: string) {
  return useQuery({
    queryKey: profileKeys.byUsername(username),
    queryFn: () => getProfileByUsername(username),
    staleTime: STALE_TIME,
    enabled: !!username,
  });
}

export function useProfileSettings() {
  return useQuery({
    queryKey: profileKeys.settings(),
    queryFn: getProfileSettings,
    staleTime: STALE_TIME,
  });
}

export function useUpdateUsername() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => updateUsername(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
    },
  });
}

export function useUpdateProfileSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProfileSettingsUpdate) => updateProfileSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.settings() });
    },
  });
}
```

```typescript
// apps/web/src/features/profile/index.ts
export * from './api/profile';
export * from './hooks/useProfile';
```

**Step 2: Create legacy access API and hooks**

```typescript
// apps/web/src/features/legacy-access/api/legacyAccess.ts
import { apiGet, apiPost, apiPatch } from '@/lib/api/client';

export interface LegacyAccessRequestCreate {
  requested_role: 'advocate' | 'admirer';
  message?: string | null;
}

export interface ConnectedMemberInfo {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
}

export interface LegacyAccessRequestResponse {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar_url: string | null;
  legacy_id: string;
  legacy_name: string;
  requested_role: string;
  assigned_role: string | null;
  message: string | null;
  status: string;
  connected_members: ConnectedMemberInfo[] | null;
  created_at: string;
  resolved_at: string | null;
}

export interface OutgoingAccessRequestResponse {
  id: string;
  legacy_id: string;
  legacy_name: string;
  requested_role: string;
  status: string;
  created_at: string;
}

export interface ApproveRequest {
  assigned_role?: 'advocate' | 'admirer' | 'admin';
}

export async function submitAccessRequest(
  legacyId: string,
  data: LegacyAccessRequestCreate
): Promise<LegacyAccessRequestResponse> {
  return apiPost<LegacyAccessRequestResponse>(
    `/api/legacies/${legacyId}/access-requests`,
    data
  );
}

export async function listPendingAccessRequests(
  legacyId: string
): Promise<LegacyAccessRequestResponse[]> {
  return apiGet<LegacyAccessRequestResponse[]>(
    `/api/legacies/${legacyId}/access-requests`
  );
}

export async function approveAccessRequest(
  legacyId: string,
  requestId: string,
  data?: ApproveRequest
): Promise<LegacyAccessRequestResponse> {
  return apiPatch<LegacyAccessRequestResponse>(
    `/api/legacies/${legacyId}/access-requests/${requestId}/approve`,
    data ?? {}
  );
}

export async function declineAccessRequest(
  legacyId: string,
  requestId: string
): Promise<{ status: string }> {
  return apiPatch<{ status: string }>(
    `/api/legacies/${legacyId}/access-requests/${requestId}/decline`,
    {}
  );
}

export async function getOutgoingAccessRequests(): Promise<
  OutgoingAccessRequestResponse[]
> {
  return apiGet<OutgoingAccessRequestResponse[]>(
    '/api/access-requests/outgoing'
  );
}
```

```typescript
// apps/web/src/features/legacy-access/hooks/useLegacyAccess.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  submitAccessRequest,
  listPendingAccessRequests,
  approveAccessRequest,
  declineAccessRequest,
  getOutgoingAccessRequests,
  type LegacyAccessRequestCreate,
  type ApproveRequest,
} from '../api/legacyAccess';

const STALE_TIME = 2 * 60 * 1000;

export const legacyAccessKeys = {
  all: ['legacy-access'] as const,
  pending: (legacyId: string) =>
    [...legacyAccessKeys.all, 'pending', legacyId] as const,
  outgoing: () => [...legacyAccessKeys.all, 'outgoing'] as const,
};

export function usePendingAccessRequests(
  legacyId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: legacyAccessKeys.pending(legacyId),
    queryFn: () => listPendingAccessRequests(legacyId),
    staleTime: STALE_TIME,
    enabled: options?.enabled ?? true,
  });
}

export function useOutgoingAccessRequests() {
  return useQuery({
    queryKey: legacyAccessKeys.outgoing(),
    queryFn: getOutgoingAccessRequests,
    staleTime: STALE_TIME,
  });
}

export function useSubmitAccessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      legacyId,
      data,
    }: {
      legacyId: string;
      data: LegacyAccessRequestCreate;
    }) => submitAccessRequest(legacyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: legacyAccessKeys.all,
      });
    },
  });
}

export function useApproveAccessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      legacyId,
      requestId,
      data,
    }: {
      legacyId: string;
      requestId: string;
      data?: ApproveRequest;
    }) => approveAccessRequest(legacyId, requestId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: legacyAccessKeys.pending(variables.legacyId),
      });
    },
  });
}

export function useDeclineAccessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      legacyId,
      requestId,
    }: {
      legacyId: string;
      requestId: string;
    }) => declineAccessRequest(legacyId, requestId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: legacyAccessKeys.pending(variables.legacyId),
      });
    },
  });
}
```

```typescript
// apps/web/src/features/legacy-access/index.ts
export * from './api/legacyAccess';
export * from './hooks/useLegacyAccess';
```

**Step 3: Create user search API and hooks**

```typescript
// apps/web/src/features/user-search/api/userSearch.ts
import { apiGet } from '@/lib/api/client';

export interface UserSearchResult {
  id: string;
  name: string;
  avatar_url: string | null;
  username: string | null;
}

export async function searchUsers(
  query: string,
  limit: number = 10
): Promise<UserSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return apiGet<UserSearchResult[]>(`/api/users/search?${params}`);
}
```

```typescript
// apps/web/src/features/user-search/hooks/useUserSearch.ts
import { useQuery } from '@tanstack/react-query';
import { searchUsers } from '../api/userSearch';

export const userSearchKeys = {
  all: ['user-search'] as const,
  query: (q: string) => [...userSearchKeys.all, q] as const,
};

export function useUserSearch(query: string) {
  return useQuery({
    queryKey: userSearchKeys.query(query),
    queryFn: () => searchUsers(query),
    enabled: query.length >= 3,
    staleTime: 30 * 1000, // 30 seconds — search results are ephemeral
  });
}
```

```typescript
// apps/web/src/features/user-search/index.ts
export * from './api/userSearch';
export * from './hooks/useUserSearch';
```

**Step 4: Run lint**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/features/profile/ apps/web/src/features/legacy-access/ apps/web/src/features/user-search/
git commit -m "feat(frontend): add API layer for profiles, legacy access, and user search"
```

---

## Task 3: User Profile Page (`/u/:username`)

**Files:**
- Create: `apps/web/src/features/profile/components/ProfilePage.tsx`
- Modify: `apps/web/src/routes/index.tsx` (add `/u/:username` route)

**Step 1: Create ProfilePage component**

Build the profile page that:
- Fetches profile data via `useUserProfile(username)`
- Renders header with avatar, display_name, bio (conditionally based on `visibility_context`)
- Shows legacies, stories, connections sections (conditionally)
- Includes a `ConnectButton` (placeholder initially — wired in Task 5)
- Falls back to a "nameplate" view when all content is hidden
- Adds SEO meta tags

```typescript
// apps/web/src/features/profile/components/ProfilePage.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, User, BookHeart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/seo';
import { useUserProfile } from '../hooks/useProfile';
import type { ProfileResponse } from '../api/profile';

function ProfileHeader({ profile }: { profile: ProfileResponse }) {
  const initials = profile.display_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <Avatar className="size-24">
        <AvatarImage src={profile.avatar_url || undefined} />
        <AvatarFallback className="bg-theme-primary text-white text-2xl">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-neutral-900">
          {profile.display_name}
        </h1>
        <p className="text-sm text-neutral-500">@{profile.username}</p>
      </div>
      {profile.visibility_context.show_bio && profile.bio && (
        <p className="text-neutral-600 max-w-md">{profile.bio}</p>
      )}
    </div>
  );
}

function LegaciesSection({
  legacies,
}: {
  legacies: ProfileResponse['legacies'];
}) {
  const navigate = useNavigate();
  if (!legacies || legacies.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-neutral-900">Legacies</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {legacies.map((legacy) => (
          <Card
            key={legacy.id}
            className="p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`/legacy/${legacy.id}`)}
          >
            <div className="flex items-center gap-3">
              {legacy.subject_photo_url ? (
                <img
                  src={legacy.subject_photo_url}
                  alt={legacy.name}
                  className="size-12 rounded-full object-cover"
                />
              ) : (
                <div className="size-12 rounded-full bg-neutral-100 flex items-center justify-center">
                  <BookHeart className="size-5 text-neutral-400" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium text-neutral-900 truncate">
                  {legacy.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {legacy.story_count} {legacy.story_count === 1 ? 'story' : 'stories'}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ConnectionsSection({
  connections,
}: {
  connections: ProfileResponse['connections'];
}) {
  const navigate = useNavigate();
  if (!connections || connections.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-neutral-900">Connections</h2>
      <div className="flex flex-wrap gap-3">
        {connections.map((conn) => {
          const initials = conn.display_name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase();
          return (
            <button
              key={conn.username}
              onClick={() => navigate(`/u/${conn.username}`)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-neutral-50 transition-colors"
            >
              <Avatar className="size-8">
                <AvatarImage src={conn.avatar_url || undefined} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-neutral-900">
                {conn.display_name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { data: profile, isLoading, error } = useUserProfile(username || '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-theme-primary" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-theme-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-4">
          <div className="size-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto">
            <User className="size-8 text-neutral-400" />
          </div>
          <h2 className="text-neutral-900">User Not Found</h2>
          <p className="text-sm text-neutral-600">
            This user doesn't exist or their profile is not available.
          </p>
          <Button variant="outline" onClick={() => navigate('/')}>
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  const ctx = profile.visibility_context;
  const hasContent =
    ctx.show_bio ||
    ctx.show_legacies ||
    ctx.show_stories ||
    ctx.show_connections;

  return (
    <div className="min-h-screen bg-theme-background">
      <SEOHead
        title={`${profile.display_name} (@${profile.username})`}
        description={profile.bio ?? `Profile of ${profile.display_name}`}
        path={`/u/${profile.username}`}
        ogImage={profile.avatar_url ?? undefined}
        ogType="profile"
        noIndex={!hasContent}
      />

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <ProfileHeader profile={profile} />

        {/* ConnectButton placeholder — wired in Task 5 */}

        {ctx.show_legacies && (
          <LegaciesSection legacies={profile.legacies} />
        )}

        {ctx.show_connections && (
          <ConnectionsSection connections={profile.connections} />
        )}

        {!hasContent && (
          <p className="text-center text-sm text-neutral-500">
            This user hasn't made their profile content public yet.
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Add route to router**

In `apps/web/src/routes/index.tsx`:

1. Add lazy import at top (near other lazy imports):
```typescript
const ProfilePage = lazy(() => import('@/features/profile/components/ProfilePage'));
```

2. Add route inside the children array, after the `community` route and before the `legacies` route:
```typescript
{
  path: 'u/:username',
  element: <LazyPage><ProfilePage /></LazyPage>,
},
```

**Step 3: Run lint and dev server check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/web/src/features/profile/components/ProfilePage.tsx apps/web/src/routes/index.tsx
git commit -m "feat(frontend): add user profile page at /u/:username"
```

---

## Task 4: Settings — Connections & Privacy Tab

**Files:**
- Create: `apps/web/src/features/settings/components/ConnectionsSettings.tsx`
- Modify: `apps/web/src/features/settings/components/SettingsLayout.tsx` (add sidebar item)
- Modify: `apps/web/src/routes/index.tsx` (add settings child route)

**Step 1: Create ConnectionsSettings component**

This component manages:
- Username display and editing with validation
- Discoverability toggle (Switch)
- Visibility settings for each content section (Select dropdowns)

```typescript
// apps/web/src/features/settings/components/ConnectionsSettings.tsx
import { useState, useEffect } from 'react';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import {
  useProfileSettings,
  useUpdateProfileSettings,
  useUpdateUsername,
} from '@/features/profile/hooks/useProfile';
import type { ProfileSettingsUpdate } from '@/features/profile/api/profile';

const VISIBILITY_OPTIONS = [
  { value: 'nobody', label: 'Nobody' },
  { value: 'connections', label: 'Connections' },
  { value: 'authenticated', label: 'All logged-in users' },
  { value: 'public', label: 'Public' },
];

const VISIBILITY_FIELDS = [
  { key: 'visibility_bio', label: 'Bio' },
  { key: 'visibility_legacies', label: 'Legacies' },
  { key: 'visibility_stories', label: 'Stories' },
  { key: 'visibility_media', label: 'Media' },
  { key: 'visibility_connections', label: 'Connections list' },
] as const;

function UsernameSection() {
  const { user } = useAuth();
  const updateUsername = useUpdateUsername();
  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Username validation (mirrors backend rules)
  const validateUsername = (value: string): string | null => {
    if (value.length < 3) return 'Must be at least 3 characters';
    if (value.length > 30) return 'Must be at most 30 characters';
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value) && value.length > 1)
      return 'Lowercase letters, numbers, and hyphens only. Cannot start or end with hyphen.';
    if (/[A-Z]/.test(value)) return 'Must be lowercase';
    return null;
  };

  const handleSave = async () => {
    const validationError = validateUsername(newUsername);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      await updateUsername.mutateAsync(newUsername);
      setEditing(false);
      setError(null);
    } catch (err: unknown) {
      const apiErr = err as { data?: { detail?: string } };
      setError(apiErr.data?.detail || 'Failed to update username');
    }
  };

  // Note: user object from AuthContext may not have username yet.
  // We read it from the profile settings query or rely on it being added to the auth context.
  // For now we show a placeholder that can be edited.

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Username</Label>
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={newUsername}
              onChange={(e) => {
                setNewUsername(e.target.value.toLowerCase());
                setError(null);
              }}
              placeholder="your-username"
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateUsername.isPending}
            >
              {updateUsername.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" />
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-700">
            @{(user as Record<string, string>)?.username || 'not set'}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setNewUsername(
                (user as Record<string, string>)?.username || ''
              );
              setEditing(true);
            }}
          >
            Change
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ConnectionsSettings() {
  const { data: settings, isLoading } = useProfileSettings();
  const updateSettings = useUpdateProfileSettings();

  const handleVisibilityChange = (
    field: string,
    value: string
  ) => {
    const update: ProfileSettingsUpdate = { [field]: value };
    updateSettings.mutate(update);
  };

  const handleDiscoverabilityChange = (checked: boolean) => {
    updateSettings.mutate({ discoverable: checked });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-theme-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          Connections & Privacy
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Control your username, discoverability, and what others can see on your
          profile.
        </p>
      </div>

      {/* Username */}
      <UsernameSection />

      <Separator />

      {/* Discoverability */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Discoverable</Label>
          <p className="text-xs text-neutral-500">
            Allow other users to find you via search. Co-members of your
            legacies can always find you.
          </p>
        </div>
        <Switch
          checked={settings?.discoverable ?? false}
          onCheckedChange={handleDiscoverabilityChange}
          disabled={updateSettings.isPending}
        />
      </div>

      <Separator />

      {/* Visibility Controls */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-neutral-900">
            Profile Visibility
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Choose who can see each section of your profile.
          </p>
        </div>

        {VISIBILITY_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <Label className="text-sm text-neutral-700 min-w-[120px]">
              {label}
            </Label>
            <Select
              value={
                (settings?.[key as keyof typeof settings] as string) ?? 'nobody'
              }
              onValueChange={(value) => handleVisibilityChange(key, value)}
              disabled={updateSettings.isPending}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Add sidebar item to SettingsLayout**

In `apps/web/src/features/settings/components/SettingsLayout.tsx`:

1. Add import: `import { Users } from 'lucide-react';` (add `Users` to the existing lucide import)
2. Add entry to `sidebarItems` array after the `'profile'` entry:
```typescript
{ path: 'connections', label: 'Connections & Privacy', icon: Users },
```

**Step 3: Add route to router**

In `apps/web/src/routes/index.tsx`:

1. Add lazy import:
```typescript
const ConnectionsSettings = lazy(() => import('@/features/settings/components/ConnectionsSettings'));
```

2. Add child route inside the `settings` children array, after the `'profile'` route:
```typescript
{
  path: 'connections',
  element: <LazyPage><ConnectionsSettings /></LazyPage>,
},
```

**Step 4: Run lint**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/features/settings/components/ConnectionsSettings.tsx apps/web/src/features/settings/components/SettingsLayout.tsx apps/web/src/routes/index.tsx
git commit -m "feat(frontend): add Connections & Privacy settings tab"
```

---

## Task 5: ConnectButton & ConnectionRequestDialog

**Files:**
- Create: `apps/web/src/features/user-connections/components/ConnectButton.tsx`
- Create: `apps/web/src/features/user-connections/components/ConnectionRequestDialog.tsx`
- Modify: `apps/web/src/features/profile/components/ProfilePage.tsx` (wire ConnectButton)

**Step 1: Create ConnectionRequestDialog**

Modal form with relationship type (required) and optional message.

```typescript
// apps/web/src/features/user-connections/components/ConnectionRequestDialog.tsx
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateConnectionRequest } from '../hooks/useUserConnections';

const RELATIONSHIP_TYPES = [
  { value: 'family', label: 'Family' },
  { value: 'friend', label: 'Friend' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'neighbor', label: 'Neighbor' },
  { value: 'caregiver', label: 'Caregiver' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'other', label: 'Other' },
];

interface ConnectionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toUserId: string;
  toUserName: string;
}

export default function ConnectionRequestDialog({
  open,
  onOpenChange,
  toUserId,
  toUserName,
}: ConnectionRequestDialogProps) {
  const [relationshipType, setRelationshipType] = useState('');
  const [message, setMessage] = useState('');
  const createRequest = useCreateConnectionRequest();

  const handleSubmit = async () => {
    if (!relationshipType) return;
    try {
      await createRequest.mutateAsync({
        to_user_id: toUserId,
        relationship_type: relationshipType,
        message: message.trim() || null,
      });
      onOpenChange(false);
      setRelationshipType('');
      setMessage('');
    } catch {
      // Error is available via createRequest.error
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect with {toUserName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>How do you know them?</Label>
            <Select value={relationshipType} onValueChange={setRelationshipType}>
              <SelectTrigger>
                <SelectValue placeholder="Select relationship type" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Message <span className="text-neutral-400">(optional)</span>
            </Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal note..."
              maxLength={500}
              rows={3}
            />
          </div>
          {createRequest.error && (
            <p className="text-sm text-destructive">
              {(createRequest.error as { data?: { detail?: string } })?.data
                ?.detail || 'Failed to send request'}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!relationshipType || createRequest.isPending}
          >
            {createRequest.isPending && (
              <Loader2 className="size-4 animate-spin mr-2" />
            )}
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Create ConnectButton**

Stateful button that checks connection status and renders appropriately.

```typescript
// apps/web/src/features/user-connections/components/ConnectButton.tsx
import { useState, useMemo } from 'react';
import { UserPlus, UserCheck, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import {
  useMyConnections,
  useIncomingRequests,
  useOutgoingRequests,
  useAcceptRequest,
  useDeclineRequest,
  useRemoveConnection,
} from '../hooks/useUserConnections';
import ConnectionRequestDialog from './ConnectionRequestDialog';

interface ConnectButtonProps {
  targetUserId: string;
  targetUserName: string;
}

type ConnectionState =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'connected'
  | 'loading';

export default function ConnectButton({
  targetUserId,
  targetUserName,
}: ConnectButtonProps) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: connections } = useMyConnections();
  const { data: outgoing } = useOutgoingRequests();
  const { data: incoming } = useIncomingRequests();
  const acceptRequest = useAcceptRequest();
  const declineRequest = useDeclineRequest();
  const removeConnection = useRemoveConnection();

  // Don't show button for own profile or when not authenticated
  if (!user || user.id === targetUserId) return null;

  const state: ConnectionState = useMemo(() => {
    if (!connections || !outgoing || !incoming) return 'loading';

    const existingConnection = connections.find(
      (c) => c.user_id === targetUserId
    );
    if (existingConnection) return 'connected';

    const outgoingRequest = outgoing.find(
      (r) => r.to_user_id === targetUserId
    );
    if (outgoingRequest) return 'pending_sent';

    const incomingRequest = incoming.find(
      (r) => r.from_user_id === targetUserId
    );
    if (incomingRequest) return 'pending_received';

    return 'none';
  }, [connections, outgoing, incoming, targetUserId]);

  const connectionId = connections?.find(
    (c) => c.user_id === targetUserId
  )?.id;
  const incomingRequestId = incoming?.find(
    (r) => r.from_user_id === targetUserId
  )?.id;

  if (state === 'loading') {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="size-4 animate-spin" />
      </Button>
    );
  }

  if (state === 'connected' && connectionId) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <UserCheck className="size-4 mr-2" />
            Connected
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => removeConnection.mutate(connectionId)}
          >
            Remove Connection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (state === 'pending_sent') {
    return (
      <Button variant="outline" size="sm" disabled>
        <Clock className="size-4 mr-2" />
        Request Pending
      </Button>
    );
  }

  if (state === 'pending_received' && incomingRequestId) {
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => acceptRequest.mutate(incomingRequestId)}
          disabled={acceptRequest.isPending}
        >
          Accept
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => declineRequest.mutate(incomingRequestId)}
          disabled={declineRequest.isPending}
        >
          Decline
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setDialogOpen(true)}>
        <UserPlus className="size-4 mr-2" />
        Connect
      </Button>
      <ConnectionRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        toUserId={targetUserId}
        toUserName={targetUserName}
      />
    </>
  );
}
```

**Step 3: Wire ConnectButton into ProfilePage**

In `apps/web/src/features/profile/components/ProfilePage.tsx`:

1. Add import:
```typescript
import ConnectButton from '@/features/user-connections/components/ConnectButton';
```

2. Replace the `{/* ConnectButton placeholder — wired in Task 5 */}` comment with:
```typescript
<div className="flex justify-center">
  <ConnectButton
    targetUserId={/* need user ID — see note below */}
    targetUserName={profile.display_name}
  />
</div>
```

**Note:** The `ProfileResponse` schema doesn't currently include the user's ID. The ConnectButton needs the target user's UUID. Two options:
- **Option A:** Add `user_id` to the `ProfileResponse` backend schema (preferred — small backend change)
- **Option B:** Do a user search by username to get the ID (wasteful)

For now, add a `user_id` field to the frontend `ProfileResponse` type as optional (`user_id?: string`), and conditionally render ConnectButton only when it's available. When the backend is updated to include it, the button will appear. Add a `// TODO: backend returns user_id in profile` comment.

**Step 4: Run lint**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/features/user-connections/components/ apps/web/src/features/profile/components/ProfilePage.tsx
git commit -m "feat(frontend): add ConnectButton and ConnectionRequestDialog"
```

---

## Task 6: Connections Page — My Connections & Requests Tabs

**Files:**
- Create: `apps/web/src/features/user-connections/components/MyConnectionsTab.tsx`
- Create: `apps/web/src/features/user-connections/components/ConnectionRequestsTab.tsx`
- Modify: `apps/web/src/pages/ConnectionsPage.tsx` (add new tabs)

**Step 1: Create MyConnectionsTab**

Grid of connection cards with avatars, relationship badges, and dropdown menus.

```typescript
// apps/web/src/features/user-connections/components/MyConnectionsTab.tsx
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Loader2, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useMyConnections,
  useRemoveConnection,
} from '../hooks/useUserConnections';
import { formatDistanceToNow } from 'date-fns';

export default function MyConnectionsTab() {
  const navigate = useNavigate();
  const { data: connections, isLoading } = useMyConnections();
  const removeConnection = useRemoveConnection();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-theme-primary" />
      </div>
    );
  }

  if (!connections || connections.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <Users className="size-12 text-neutral-300 mx-auto" />
        <p className="text-neutral-500">No connections yet</p>
        <p className="text-sm text-neutral-400">
          Search for users or visit their profiles to send connection requests.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
      {connections.map((conn) => {
        const initials = conn.display_name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase();
        return (
          <Card key={conn.id} className="p-4">
            <div className="flex items-start gap-3">
              <button
                onClick={() =>
                  conn.username
                    ? navigate(`/u/${conn.username}`)
                    : undefined
                }
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <Avatar className="size-11">
                  <AvatarImage src={conn.avatar_url || undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 truncate">
                    {conn.display_name}
                  </p>
                  {conn.username && (
                    <p className="text-xs text-neutral-500">
                      @{conn.username}
                    </p>
                  )}
                  <p className="text-xs text-neutral-400 mt-1">
                    Connected{' '}
                    {formatDistanceToNow(new Date(conn.connected_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {conn.username && (
                    <DropdownMenuItem
                      onClick={() => navigate(`/u/${conn.username}`)}
                    >
                      View Profile
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      if (
                        confirm(
                          `Remove connection with ${conn.display_name}?`
                        )
                      ) {
                        removeConnection.mutate(conn.id);
                      }
                    }}
                  >
                    Remove Connection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
```

**Step 2: Create ConnectionRequestsTab**

Shows incoming and outgoing requests with accept/decline/cancel actions.

```typescript
// apps/web/src/features/user-connections/components/ConnectionRequestsTab.tsx
import { Loader2, Inbox, Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  useIncomingRequests,
  useOutgoingRequests,
  useAcceptRequest,
  useDeclineRequest,
  useCancelRequest,
} from '../hooks/useUserConnections';
import { formatDistanceToNow } from 'date-fns';
import type { ConnectionRequestResponse } from '../api/userConnections';

function IncomingRequestCard({
  request,
}: {
  request: ConnectionRequestResponse;
}) {
  const acceptRequest = useAcceptRequest();
  const declineRequest = useDeclineRequest();
  const initials = request.from_user_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-11">
          <AvatarImage src={request.from_user_avatar_url || undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="font-medium text-neutral-900">
              {request.from_user_name}
            </p>
            <Badge variant="outline" className="text-xs mt-1">
              {request.relationship_type}
            </Badge>
          </div>
          {request.message && (
            <p className="text-sm text-neutral-600">{request.message}</p>
          )}
          <p className="text-xs text-neutral-400">
            {formatDistanceToNow(new Date(request.created_at), {
              addSuffix: true,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => acceptRequest.mutate(request.id)}
              disabled={acceptRequest.isPending}
            >
              {acceptRequest.isPending && (
                <Loader2 className="size-3 animate-spin mr-1" />
              )}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => declineRequest.mutate(request.id)}
              disabled={declineRequest.isPending}
            >
              Decline
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function OutgoingRequestCard({
  request,
}: {
  request: ConnectionRequestResponse;
}) {
  const cancelRequest = useCancelRequest();
  const initials = request.to_user_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-11">
          <AvatarImage src={request.to_user_avatar_url || undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="font-medium text-neutral-900">
              {request.to_user_name}
            </p>
            <Badge variant="outline" className="text-xs mt-1">
              {request.relationship_type}
            </Badge>
          </div>
          {request.message && (
            <p className="text-sm text-neutral-600">{request.message}</p>
          )}
          <p className="text-xs text-neutral-400">
            Sent{' '}
            {formatDistanceToNow(new Date(request.created_at), {
              addSuffix: true,
            })}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => cancelRequest.mutate(request.id)}
            disabled={cancelRequest.isPending}
          >
            Cancel Request
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function ConnectionRequestsTab() {
  const { data: incoming, isLoading: incomingLoading } = useIncomingRequests();
  const { data: outgoing, isLoading: outgoingLoading } = useOutgoingRequests();

  const isLoading = incomingLoading || outgoingLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-theme-primary" />
      </div>
    );
  }

  const hasIncoming = incoming && incoming.length > 0;
  const hasOutgoing = outgoing && outgoing.length > 0;

  if (!hasIncoming && !hasOutgoing) {
    return (
      <div className="text-center py-12 space-y-3">
        <Inbox className="size-12 text-neutral-300 mx-auto" />
        <p className="text-neutral-500">No pending requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {hasIncoming && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-700 flex items-center gap-2">
            <Inbox className="size-4" />
            Incoming Requests ({incoming.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {incoming.map((req) => (
              <IncomingRequestCard key={req.id} request={req} />
            ))}
          </div>
        </div>
      )}

      {hasOutgoing && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-700 flex items-center gap-2">
            <Send className="size-4" />
            Outgoing Requests ({outgoing.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {outgoing.map((req) => (
              <OutgoingRequestCard key={req.id} request={req} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Add tabs to ConnectionsPage**

In `apps/web/src/pages/ConnectionsPage.tsx`:

1. Add imports at top:
```typescript
import MyConnectionsTab from '@/features/user-connections/components/MyConnectionsTab';
import ConnectionRequestsTab from '@/features/user-connections/components/ConnectionRequestsTab';
```

2. Add `'my-connections'` and `'requests'` to `DEFAULT_FILTERS`:
```typescript
const DEFAULT_FILTERS: Record<string, string> = {
  personas: 'all',
  people: 'all',
  activity: 'all',
  'my-connections': 'all',
  requests: 'all',
};
```

3. Add new `TabsTrigger` entries inside the `<TabsList>`, after the existing `activity` trigger:
```typescript
<TabsTrigger value="my-connections">My Connections</TabsTrigger>
<TabsTrigger value="requests">Requests</TabsTrigger>
```

4. Add new `TabsContent` entries after the existing `activity` content:
```typescript
<TabsContent value="my-connections">
  <MyConnectionsTab />
</TabsContent>

<TabsContent value="requests">
  <ConnectionRequestsTab />
</TabsContent>
```

**Step 4: Run lint**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/features/user-connections/components/MyConnectionsTab.tsx apps/web/src/features/user-connections/components/ConnectionRequestsTab.tsx apps/web/src/pages/ConnectionsPage.tsx
git commit -m "feat(frontend): add My Connections and Requests tabs to connections page"
```

---

## Task 7: Legacy Access — Request Button, Dialog, MemberDrawer

**Files:**
- Create: `apps/web/src/features/legacy-access/components/LegacyAccessRequestDialog.tsx`
- Create: `apps/web/src/features/legacy-access/components/PendingAccessRequests.tsx`
- Modify: `apps/web/src/features/legacy/components/LegacyProfile.tsx` (add Request Access button)
- Modify: `apps/web/src/features/members/components/MemberDrawer.tsx` (add pending access requests section)

**Step 1: Create LegacyAccessRequestDialog**

```typescript
// apps/web/src/features/legacy-access/components/LegacyAccessRequestDialog.tsx
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSubmitAccessRequest } from '../hooks/useLegacyAccess';

interface LegacyAccessRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legacyId: string;
  legacyName: string;
}

export default function LegacyAccessRequestDialog({
  open,
  onOpenChange,
  legacyId,
  legacyName,
}: LegacyAccessRequestDialogProps) {
  const [requestedRole, setRequestedRole] = useState<'admirer' | 'advocate'>(
    'admirer'
  );
  const [message, setMessage] = useState('');
  const submitRequest = useSubmitAccessRequest();

  const handleSubmit = async () => {
    try {
      await submitRequest.mutateAsync({
        legacyId,
        data: {
          requested_role: requestedRole,
          message: message.trim() || null,
        },
      });
      onOpenChange(false);
      setMessage('');
      setRequestedRole('admirer');
    } catch {
      // Error available via submitRequest.error
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Access to {legacyName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Requested Role</Label>
            <Select
              value={requestedRole}
              onValueChange={(v) =>
                setRequestedRole(v as 'admirer' | 'advocate')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admirer">
                  Admirer — View and appreciate
                </SelectItem>
                <SelectItem value="advocate">
                  Advocate — Contribute stories
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Message <span className="text-neutral-400">(optional)</span>
            </Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell them how you knew the subject..."
              maxLength={500}
              rows={3}
            />
          </div>
          {submitRequest.error && (
            <p className="text-sm text-destructive">
              {(submitRequest.error as { data?: { detail?: string } })?.data
                ?.detail || 'Failed to submit request'}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitRequest.isPending}>
            {submitRequest.isPending && (
              <Loader2 className="size-4 animate-spin mr-2" />
            )}
            Request Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Create PendingAccessRequests section for MemberDrawer**

```typescript
// apps/web/src/features/legacy-access/components/PendingAccessRequests.tsx
import { useState } from 'react';
import { Loader2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  usePendingAccessRequests,
  useApproveAccessRequest,
  useDeclineAccessRequest,
} from '../hooks/useLegacyAccess';
import type { LegacyAccessRequestResponse } from '../api/legacyAccess';

function AccessRequestCard({
  request,
  legacyId,
}: {
  request: LegacyAccessRequestResponse;
  legacyId: string;
}) {
  const [assignedRole, setAssignedRole] = useState(request.requested_role);
  const approveRequest = useApproveAccessRequest();
  const declineRequest = useDeclineAccessRequest();

  const initials = request.user_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div className="p-3 rounded-lg border border-dashed space-y-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-10">
          <AvatarImage src={request.user_avatar_url || undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{request.user_name}</p>
          <p className="text-xs text-muted-foreground">
            Requested as{' '}
            <Badge variant="outline" className="text-xs">
              {request.requested_role}
            </Badge>
          </p>
        </div>
      </div>

      {request.message && (
        <p className="text-sm text-neutral-600 italic">
          "{request.message}"
        </p>
      )}

      {request.connected_members && request.connected_members.length > 0 && (
        <div className="text-xs text-neutral-500">
          <span className="font-medium">Known by: </span>
          {request.connected_members
            .map((m) => m.display_name)
            .join(', ')}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select value={assignedRole} onValueChange={setAssignedRole}>
          <SelectTrigger className="w-28 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admirer">Admirer</SelectItem>
            <SelectItem value="advocate">Advocate</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={() =>
            approveRequest.mutate({
              legacyId,
              requestId: request.id,
              data: {
                assigned_role: assignedRole as
                  | 'admirer'
                  | 'advocate'
                  | 'admin',
              },
            })
          }
          disabled={approveRequest.isPending}
        >
          {approveRequest.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            'Approve'
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            declineRequest.mutate({ legacyId, requestId: request.id })
          }
          disabled={declineRequest.isPending}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}

interface PendingAccessRequestsProps {
  legacyId: string;
  canManage: boolean;
}

export default function PendingAccessRequests({
  legacyId,
  canManage,
}: PendingAccessRequestsProps) {
  const { data: requests, isLoading } = usePendingAccessRequests(legacyId, {
    enabled: canManage,
  });

  if (!canManage || isLoading || !requests || requests.length === 0) {
    return null;
  }

  return (
    <>
      <Separator />
      <div>
        <h3 className="font-medium mb-3 flex items-center gap-2">
          <KeyRound className="size-4" />
          Pending Access Requests ({requests.length})
        </h3>
        <div className="space-y-3">
          {requests.map((request) => (
            <AccessRequestCard
              key={request.id}
              request={request}
              legacyId={legacyId}
            />
          ))}
        </div>
      </div>
    </>
  );
}
```

**Step 3: Add PendingAccessRequests to MemberDrawer**

In `apps/web/src/features/members/components/MemberDrawer.tsx`:

1. Add import:
```typescript
import PendingAccessRequests from '@/features/legacy-access/components/PendingAccessRequests';
```

2. Add the component inside the Sheet content, after the Pending Invitations section (before the closing `</div>` of `<div className="mt-6 space-y-6">`):
```typescript
{/* Pending Access Requests */}
<PendingAccessRequests legacyId={legacyId} canManage={canManage} />
```

**Step 4: Add "Request Access" button to LegacyProfile**

In `apps/web/src/features/legacy/components/LegacyProfile.tsx`:

1. Add import:
```typescript
import LegacyAccessRequestDialog from '@/features/legacy-access/components/LegacyAccessRequestDialog';
```

2. Add state:
```typescript
const [showAccessRequestDialog, setShowAccessRequestDialog] = useState(false);
```

3. Determine if the Request Access button should show (after `const isMember = !!currentUserMember;`):
```typescript
const canRequestAccess = !!authUser && !isMember && legacy?.visibility === 'public';
```

4. Add the button in the rendered output. In the error/not-found section where it shows `<Lock>` icon and "This legacy doesn't exist or is private", add an alternative: if the user is authenticated and the legacy loads but they're not a member, show a Request Access button. The best place is after the `<ProfileHeader>` component and before `<SectionNav>`:
```typescript
{canRequestAccess && (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
    <Button
      variant="outline"
      onClick={() => setShowAccessRequestDialog(true)}
    >
      Request Access
    </Button>
  </div>
)}
```

5. Add the dialog before the closing `</div>` of the component:
```typescript
{legacy && (
  <LegacyAccessRequestDialog
    open={showAccessRequestDialog}
    onOpenChange={setShowAccessRequestDialog}
    legacyId={legacyId}
    legacyName={legacy.name}
  />
)}
```

**Step 5: Run lint**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/web/src/features/legacy-access/components/ apps/web/src/features/members/components/MemberDrawer.tsx apps/web/src/features/legacy/components/LegacyProfile.tsx
git commit -m "feat(frontend): add legacy access request dialog and MemberDrawer integration"
```

---

## Task 8: SearchBar Wiring & Notification Types

**Files:**
- Modify: `apps/web/src/components/SearchBar.tsx` (wire to real API, add user results)
- Modify: `apps/web/src/features/notifications/components/NotificationHistory.tsx` (add link resolution for new types)

**Step 1: Wire SearchBar to real user search API**

Replace the mock data approach in `apps/web/src/components/SearchBar.tsx` with a real API call for user search results.

Key changes:
1. Import `useUserSearch` from `@/features/user-search`
2. Add a debounced query state (use existing `useDebounce` hook from `@/lib/hooks/`)
3. Merge user search results into the existing result types
4. Keep the existing mock data for legacies/communities (they'll be wired to real APIs separately)
5. Add user results with avatar, name, and @username subtitle

In the `SearchBar` component:
- Add: `import { useUserSearch } from '@/features/user-search';`
- Add: `import { useDebounce } from '@/lib/hooks/useDebounce';` (check if this exists; if not, use a simple `useEffect` debounce)
- Replace the `useEffect` that filters `allSearchData` with:

```typescript
const debouncedQuery = useDebounce(query, 300);

// Real user search
const { data: userResults } = useUserSearch(debouncedQuery);

// Combine mock + real results
useEffect(() => {
  if (query.trim().length === 0) {
    setResults([]);
    setIsOpen(false);
    return;
  }

  const searchTerm = query.toLowerCase();
  // Keep mock legacy/community results for now
  const mockResults = allSearchData.filter(
    (item) =>
      item.title.toLowerCase().includes(searchTerm) ||
      item.subtitle?.toLowerCase().includes(searchTerm)
  );

  // Add real user results
  const userSearchResults: SearchResult[] = (userResults || []).map(
    (user) => ({
      id: user.id,
      type: 'person' as const,
      title: user.name,
      subtitle: user.username ? `@${user.username}` : undefined,
      image: user.avatar_url || undefined,
    })
  );

  setResults([...mockResults, ...userSearchResults]);
  setIsOpen(true);
}, [query, userResults]);
```

Also update `handleSelectResult` to navigate to `/u/{username}` when a person result is clicked:
```typescript
const handleSelectResult = (result: SearchResult) => {
  if (result.type === 'person' && result.subtitle?.startsWith('@')) {
    // Navigate to user profile
    const username = result.subtitle.slice(1); // Remove @
    onSelectResult(result.type, username);
  } else {
    onSelectResult(result.type, result.id);
  }
  setQuery('');
  setIsOpen(false);
};
```

**Note:** If `useDebounce` doesn't exist, create a minimal version inline or check `@/lib/hooks/useDebounce.ts`. The existing codebase has `useDebounce` in `@/lib/hooks/`.

**Step 2: Add notification type awareness**

The notification system already handles generic notification rendering via `NotificationHistory.tsx` which displays `title`, `message`, and `link` from the backend. The new notification types (`connection_request_received`, `connection_request_accepted`, etc.) are created by the backend with appropriate `title`, `message`, and `link` fields.

Check if the backend notification `link` field already points to the right routes. If so, no frontend changes needed for basic rendering — the existing `handleNotificationClick` navigates to `notification.link`.

If we want type-specific icons, add a helper in `NotificationHistory.tsx`:

```typescript
import { UserPlus, UserCheck, UserX, KeyRound, BookHeart } from 'lucide-react';

function getNotificationIcon(type: string) {
  switch (type) {
    case 'connection_request_received':
      return <UserPlus className="size-4" />;
    case 'connection_request_accepted':
      return <UserCheck className="size-4" />;
    case 'connection_request_declined':
      return <UserX className="size-4" />;
    case 'legacy_access_request_received':
    case 'legacy_access_request_approved':
    case 'legacy_access_request_declined':
      return <KeyRound className="size-4" />;
    default:
      return null;
  }
}
```

Then in the notification rendering, add the icon next to the avatar or as an overlay badge. This is optional polish — the notifications will work without it since the backend sets the `message` text.

**Step 3: Run lint**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: PASS.

**Step 4: Run full frontend lint**

```bash
cd apps/web && npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/SearchBar.tsx apps/web/src/features/notifications/components/NotificationHistory.tsx
git commit -m "feat(frontend): wire SearchBar to user search API and add notification type icons"
```

---

## Validation Checklist

Before marking Phase 4 complete:

- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Lint passes: `cd apps/web && npm run lint`
- [ ] Dev server starts: `cd apps/web && npm run dev` (manual check)
- [ ] Routes work: `/u/:username`, `/connections` (new tabs), `/settings/connections`
- [ ] Profile page renders with visibility-filtered content
- [ ] ConnectButton shows correct state
- [ ] ConnectionRequestDialog submits requests
- [ ] LegacyAccessRequestDialog submits requests
- [ ] MemberDrawer shows pending access requests
- [ ] SearchBar returns real user results
- [ ] Notifications navigate to correct pages

---

## Deviations from Original Plan (Tasks 23-30)

| Original Task | What Changed | Why |
|---|---|---|
| Task 23 (Profile Page) | Implemented as Task 3. `user_id` not in `ProfileResponse` — ConnectButton conditionally renders. | Backend schema gap; frontend adapts gracefully. |
| Task 24 (Settings Tab) | Named "Connections & Privacy" instead of just "Connections". | Clearer purpose since it includes visibility controls. |
| Task 25 (Connections Page) | Added as new tabs to existing `/connections` page instead of replacing it. | Option A — preserves existing AI hub functionality. |
| Task 26 (ConnectButton) | Implemented as Task 5. Queries connection/request lists to determine state. | Simpler than a dedicated status endpoint. |
| Task 27 (Legacy Access) | Implemented as Task 7. PendingAccessRequests is a separate component composed into MemberDrawer. | Better separation of concerns. |
| Task 28 (Enhanced Legacy Creation) | Deferred. | Requires backend endpoint for connected-member legacy suggestions that doesn't exist yet. |
| Task 29 (Notifications) | Implemented as Task 8 (partial). Basic rendering works via existing notification system. Added optional type-specific icons. | Backend sets notification `link` and `message`, so frontend gets this "for free". |
| Task 30 (Member Profile Fields) | Not needed. | Backend migration already renamed fields; existing member profile components use the API response directly. |
