# Find People Feature — Design Document

**Goal:** Add a dedicated "Find People" search experience in two places: the Connections page People tab and the Dashboard sidebar. Results navigate to `/u/{username}`. Search respects existing discoverability/privacy settings.

**Related docs:**
- [User Connections Plan](2026-03-15-user-connections-plan.md)
- [User Connections Frontend Plan](2026-03-16-user-connections-frontend-plan.md)

---

## Approach

Single reusable `PeopleSearch` component with a `variant` prop, embedded in two placements. Minimal backend change to support username matching in search.

---

## Backend Change

**File:** `services/core-api/app/services/user.py`

The `search_users` function currently only matches on `User.name`. Add an `or_` to also match on `User.username`, and strip a leading `@` from the query if present.

```sql
WHERE (User.name ILIKE '%query%' OR User.username ILIKE '%query%')
  AND User.id != current_user_id
  AND (discoverable = true OR shares_legacy)
```

No new endpoints, no schema changes. The existing `UserSearchResult` (id, name, avatar_url, username) is sufficient.

---

## Frontend — PeopleSearch Component

**New file:** `apps/web/src/features/user-search/components/PeopleSearch.tsx`

A single reusable component with a `variant` prop:

- **`variant="full"`** — Used on the People tab. Full-width input, results render as a list of cards below the input (not a dropdown). Always visible when there are results.
- **`variant="compact"`** — Used on the Dashboard sidebar. Smaller input, results render as a dropdown overlay. Closes on selection or click-outside.

**Behavior (both variants):**
- Debounced input (300ms), minimum 3 characters to trigger search
- Strips leading `@` before sending query
- Uses existing `useUserSearch` hook
- Each result shows: avatar, display name, @username
- Clicking a result navigates to `/u/{username}`
- Empty state: "No users found" message
- Loading state: spinner

**Not included (YAGNI):**
- No pagination (API limits to 10 results)
- No result caching beyond existing 30s staleTime
- No "view all results" link
- No contextual badges (co-member, connected) — can evolve later

---

## Placement Integration

### People Tab (Connections Page)

Enhance the existing People tab in `ConnectionsPage.tsx` by adding `PeopleSearch` (`variant="full"`) at the top of the tab's content area, above the existing user list content.

### Dashboard Sidebar

Add a "Find People" card in the right sidebar of `DashboardPage.tsx` alongside Quick Actions, Activity, and Favorites. Contains:
- Card header with "Find People" title and Users icon
- `PeopleSearch` component (`variant="compact"`) inside

No routing changes needed — `/u/:username` already exists.

---

## Testing

**Backend:**
- Update `services/core-api/tests/test_user_search.py` with cases for username matching (exact, partial, `@` prefix stripping)

**Validation:**
- `just validate-backend` for backend
- `cd apps/web && npx tsc --noEmit && npm run lint` for frontend

---

## Scope Summary

| Layer | Change | Files |
|-------|--------|-------|
| Backend | Add username matching to `search_users` | `services/core-api/app/services/user.py` |
| Backend test | Username search test cases | `services/core-api/tests/test_user_search.py` |
| Frontend component | New `PeopleSearch` component | `apps/web/src/features/user-search/components/PeopleSearch.tsx` |
| Frontend integration | Embed in People tab | `apps/web/src/pages/ConnectionsPage.tsx` |
| Frontend integration | Embed in Dashboard sidebar | `apps/web/src/pages/DashboardPage.tsx` |
