# Invite Flow Enhancement: User Search

**Date:** 2025-01-30
**Status:** Approved

## Overview

Enhance the `InviteMemberModal` to support both email invitations and user search. The input auto-detects mode based on content:

- **Contains "@"** → Email mode (existing behavior)
- **No "@" and 3+ characters** → User search mode (new)

## User Flow

1. User opens "Invite Member" modal from legacy page
2. User types in the input field:
   - If typing an email (contains @): Shows email input as today, sends email invitation
   - If typing a name (no @, 3+ chars): Shows dropdown of matching users after 300ms debounce
3. User selects a person from dropdown (or finishes typing email)
4. User selects role from dropdown
5. User clicks "Send Invitation"
6. For existing users: Creates invitation record + notification (no email)
7. For email invites: Creates invitation record + sends email + notification (if user exists)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Input mode detection | Auto-detect by "@" | Simplest UX, no extra controls needed |
| User search scope | All users | MVP simplicity, users may want to invite anyone |
| Minimum search length | 3 characters | Reduces noise, meaningful prefix matching |
| Debounce delay | 300ms | Quick response while reducing API calls |
| Existing user invite | Notification only | User is in system, no email noise needed |

## Backend Changes

### New API Endpoint

```
GET /api/users/search?q={query}&limit={limit}
```

- **Query param `q`**: Search string (min 3 characters)
- **Query param `limit`**: Max results (default 10)
- **Returns**: List of matching users with `id`, `name`, `avatar_url`
- **Auth**: Requires authenticated user
- **Search logic**: Case-insensitive match on `name` field (contains match)

**Response schema:**
```json
[
  {
    "id": "uuid",
    "name": "John Smith",
    "avatar_url": "https://..."
  }
]
```

### Invitation Service Update

Modify `create_invitation` to accept either:
- `email` (string) - existing behavior
- `user_id` (UUID) - new: invite by user ID directly

When `user_id` is provided:
- Look up user's email from the database
- Skip sending email (notification only)
- Otherwise same flow (create invitation record, create notification)

### Files to modify/create

- `app/schemas/user.py` - Add `UserSearchResult` schema
- `app/services/user.py` - Add `search_users` function
- `app/routes/user.py` - Add search endpoint
- `app/schemas/invitation.py` - Update `InvitationCreate` to allow `email` OR `user_id`
- `app/services/invitation.py` - Handle `user_id` invitation path

## Frontend Changes

### New API Client & Hook

```typescript
// lib/api/users.ts
searchUsers(query: string, limit?: number): Promise<UserSearchResult[]>

// lib/hooks/useUsers.ts
useUserSearch(query: string, enabled: boolean)
```

The hook uses TanStack Query with:
- `enabled: query.length >= 3 && !query.includes('@')`
- `staleTime: 30000` (cache results for 30s)

### InviteMemberModal Updates

**State changes:**
```typescript
// Current
const [email, setEmail] = useState('');

// New
const [inputValue, setInputValue] = useState('');
const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
const [showDropdown, setShowDropdown] = useState(false);
```

**Mode detection:**
```typescript
const isEmailMode = inputValue.includes('@');
const isSearchMode = !isEmailMode && inputValue.length >= 3;
```

### UI Structure

```
┌─────────────────────────────────────────┐
│ Invite a Member                    [X]  │
├─────────────────────────────────────────┤
│                                         │
│ Email or Name                           │
│ ┌─────────────────────────────────────┐ │
│ │ [John Smith ✕]                      │ │  ← Selected user chip (when selected)
│ └─────────────────────────────────────┘ │
│   OR                                    │
│ ┌─────────────────────────────────────┐ │
│ │ joh_                                │ │  ← Input with search active
│ ├─────────────────────────────────────┤ │
│ │ 🧑 John Smith                       │ │  ← Dropdown results
│ │ 🧑 Johnny Appleseed                 │ │
│ │ 🧑 Johanna Doe                      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Role                                    │
│ ┌─────────────────────────────────────┐ │
│ │ Advocate ▼                          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│              [Cancel] [Send Invitation] │
└─────────────────────────────────────────┘
```

### Files to create/modify

- `lib/api/users.ts` - New file for user search API
- `lib/hooks/useUsers.ts` - New file for search hook
- `lib/api/invitations.ts` - Update `InvitationCreate` type
- `components/InviteMemberModal.tsx` - Update with combobox behavior

## Edge Cases

1. **User searches themselves** - Filter out current user from search results
2. **User already a member** - Show in results but disabled with "Already a member"
3. **Pending invitation exists** - Show in results but disabled with "Invitation pending"
4. **No results found** - Show "No users found" with hint to try email
5. **Email validation** - Validate format on submit only
6. **Network error during search** - Show "Search failed", don't block email entry
7. **Debounce edge case** - Clear pending search when input cleared

## Validation

**On Submit:**
- If `selectedUser` is set → use `user_id` path
- Else if `inputValue` contains "@" and is valid email → use `email` path
- Else → show error "Please enter a valid email or select a user"

**Backend Schema:**
- `InvitationCreate`: require exactly one of `email` or `user_id`
- User search: return empty array for queries < 3 chars

## Implementation Tasks

### Backend
1. Create `UserSearchResult` schema in `app/schemas/user.py`
2. Create `search_users` function in `app/services/user.py`
3. Add `GET /api/users/search` endpoint in `app/routes/user.py`
4. Update `InvitationCreate` schema to support `email` OR `user_id`
5. Update `create_invitation` service to handle `user_id` path

### Frontend
1. Create `lib/api/users.ts` with `searchUsers` function
2. Create `lib/hooks/useUsers.ts` with `useUserSearch` hook
3. Update `lib/api/invitations.ts` to support `user_id`
4. Update `InviteMemberModal.tsx` with combobox behavior

### Testing
- Backend: Unit tests for user search and updated invitation service
- Frontend: Build verification
