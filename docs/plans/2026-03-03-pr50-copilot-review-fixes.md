# Plan: Address Copilot Review Issues from PR #50

**Date:** 2026-03-03  
**Branch:** `develop` (direct commits, no worktrees)  
**PR:** https://github.com/mosaic-stories/mosaic-life/pull/50

---

## Summary

Six issues were raised by the Copilot reviewer. They fall into two root-cause clusters:

- **Cluster A — media/conversation enrichment gap:** `enrich_entities` only enriches `legacy` and `story`. This causes issues 3, 5, and 6. Fix the backend first, then apply frontend fallbacks as a belt-and-suspenders defence.
- **Cluster B — social feed early return:** The early exit when `my_legacy_ids` is empty prevents own `media`/`conversation` activity from appearing in the feed for users with no memberships. Causes issues 2 and 4. Fix backend + add a test.
- **Cluster C — dedup edge case:** The `get_recent_items` join can return duplicate rows for the same entity if two activity rows share the same `created_at`. Fix with Python-side set dedup (issue 1).

---

## Issues and Fixes

### Issue 1 — `get_recent_items` dedup edge case (activity.py ~L228)

**Problem:** The subquery groups by `(entity_type, entity_id)` and takes `max(created_at)`. The outer join matches on `created_at == max(created_at)` — if two rows for the same entity happen to share that max timestamp, both rows survive the join and `.unique()` doesn't collapse them.

**Fix:** After `result.scalars().unique().all()`, do a Python-side dedup using a `seen` set keyed on `(entity_type, entity_id)`. This is O(n), safe, and deterministic. Same pattern applies in `get_enriched_recent_items` (the subquery there is identical).

**Files:** `services/core-api/app/services/activity.py` (two locations: `get_recent_items` ~L226 and `get_enriched_recent_items` ~L540)

---

### Issue 2 — Early return in `get_social_feed` blocks own activity (activity.py ~L414)

**Problem:**
```python
if not my_legacy_ids:
    return {"items": [], "has_more": False, "next_cursor": None}
```
This fires before the scope filter that includes the user's own `media`/`conversation` activity, so new users or users who only have direct conversations (not via a legacy) see an empty feed.

**Fix:** Remove the early return. Build `scope_filters` conditionally:
- If `my_legacy_ids` is non-empty, include the legacy/story scope filters.
- Always include the own `media`/`conversation` filter.
- Skip the `related_story_ids` lookup when `my_legacy_ids` is empty.

**Files:** `services/core-api/app/services/activity.py` (~L390–L420)

---

### Issue 3 — `enrich_entities` doesn't enrich `media` or `conversation` (activity.py ~L320)

**Problem:** Feed items of type `media` and `conversation` always have `entity: null` in API responses. `media` needs `filename`, `content_type`, `legacy_id` (from `MediaLegacy` where role=`primary`). `conversation` needs `title`, `persona_id`, `legacy_id` (from `ConversationLegacy` where role=`primary`).

**Fix:** Add two new batch-load sections in `enrich_entities`:

```python
# Media enrichment
media_ids = [eid for etype, eid in items if etype == "media"]
if media_ids:
    media_rows = await db.execute(select(Media).where(Media.id.in_(media_ids)))
    medias = list(media_rows.scalars().all())

    # Get primary legacy associations
    ml_rows = await db.execute(
        select(MediaLegacy).where(
            MediaLegacy.media_id.in_(media_ids),
            MediaLegacy.role == "primary",
        )
    )
    media_legacy_map = {ml.media_id: str(ml.legacy_id) for ml in ml_rows.scalars().all()}

    for media in medias:
        result[("media", media.id)] = {
            "filename": media.filename,
            "content_type": media.content_type,
            "legacy_id": media_legacy_map.get(media.id),
        }

# Conversation enrichment
conversation_ids = [eid for etype, eid in items if etype == "conversation"]
if conversation_ids:
    conv_rows = await db.execute(
        select(AIConversation).where(AIConversation.id.in_(conversation_ids))
    )
    convs = list(conv_rows.scalars().all())

    cl_rows = await db.execute(
        select(ConversationLegacy).where(
            ConversationLegacy.conversation_id.in_(conversation_ids),
            ConversationLegacy.role == "primary",
        )
    )
    conv_legacy_map = {
        cl.conversation_id: str(cl.legacy_id) for cl in cl_rows.scalars().all()
    }

    for conv in convs:
        result[("conversation", conv.id)] = {
            "title": conv.title,
            "persona_id": conv.persona_id,
            "legacy_id": conv_legacy_map.get(conv.id),
        }
```

**Files:** `services/core-api/app/services/activity.py` (inside `enrich_entities`, after story enrichment block)

Required imports to add at top of function (or at module level if not already there):
- `Media` from `..models.media`
- `AIConversation` from `..models.ai`
- `MediaLegacy`, `ConversationLegacy` from `..models.associations`

---

### Issue 4 — Missing test: no-membership user with media/conversation activity

**Problem:** No test verifies that a user with zero `LegacyMember` rows still sees their own `conversation` or `media` activity in the social feed.

**Fix:** Add a new test class `TestSocialFeedNoMembership` in `test_activity_social_feed.py`:

```python
class TestSocialFeedNoMembership:
    @pytest.mark.asyncio
    async def test_own_conversation_activity_with_no_memberships(
        self, db_session: AsyncSession, user_alice: User
    ):
        """User with no legacy memberships should still see own conversation activity."""
        # Verify Alice has no legacy memberships
        conv_id = uuid4()
        await activity_service.record_activity(
            db=db_session,
            user_id=user_alice.id,
            action="ai_conversation_started",
            entity_type="conversation",
            entity_id=conv_id,
            metadata={"persona_id": "default"},
        )
        result = await activity_service.get_social_feed(
            db=db_session, user_id=user_alice.id
        )
        assert result["items"], "Expected own conversation activity even with no memberships"
        assert result["items"][0]["entity_type"] == "conversation"
        assert result["items"][0]["entity_id"] == conv_id
```

**Files:** `services/core-api/tests/test_activity_social_feed.py`

---

### Issue 5 — `entityName` doesn't fall back to `metadata` (ActivityFeedItem.tsx ~L48)

**Problem:** When `item.entity` is `null` (deleted entity, or unenriched media/conversation before fix #3 lands), no name is shown.

**Fix:** Apply Copilot's suggestion exactly:

```ts
const metadata = item.metadata as
  | { title?: string; name?: string; filename?: string }
  | null
  | undefined;
const entityName =
  item.entity?.title ||
  item.entity?.name ||
  item.entity?.filename ||
  metadata?.title ||
  metadata?.name ||
  metadata?.filename ||
  '';
```

**Files:** `apps/web/src/features/activity/components/ActivityFeedItem.tsx`

---

### Issue 6 — `getActivityRoute` doesn't fall back to `metadata.legacy_id` (RecentActivitySection.tsx ~L19)

**Problem:** When `item.entity?.legacy_id` is absent, clicks for `story` and `media` items are silent no-ops.

**Fix:** Apply Copilot's suggestion for both cases, and cast `item.metadata` to include `legacy_id`:

```ts
function getActivityRoute(item: SocialFeedItem): string | null {
  switch (item.entity_type) {
    case 'legacy':
      return `/legacy/${item.entity_id}`;
    case 'story': {
      const legacyId =
        item.entity?.legacy_id ??
        (item.metadata as { legacy_id?: string } | null)?.legacy_id;
      return legacyId
        ? `/legacy/${legacyId}/story/${item.entity_id}`
        : null;
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
```

**Files:** `apps/web/src/features/activity/components/RecentActivitySection.tsx`

---

## Execution Order

1. **Fix backend** (all three changes in `activity.py`):
   - Issue 3: Add `media` and `conversation` enrichment blocks in `enrich_entities`
   - Issue 2: Remove early return from `get_social_feed` and restructure scope_filters
   - Issue 1: Add Python-side dedup in `get_recent_items` and `get_enriched_recent_items`

2. **Add backend test** (Issue 4): New test class in `test_activity_social_feed.py`

3. **Validate backend:** `just validate-backend` (ruff + mypy must pass clean)

4. **Run backend tests:** `docker compose -f infra/compose/docker-compose.yml exec core-api uv run pytest tests/test_activity_social_feed.py tests/test_activity_service.py -v`

5. **Fix frontend** (Issues 5 & 6): Patch `ActivityFeedItem.tsx` and `RecentActivitySection.tsx`

6. **Run frontend tests:** `cd apps/web && npm run test -- --run`

7. **Final check:** Confirm no TypeScript errors: `cd apps/web && npx tsc --noEmit`

---

## Acceptance Criteria

- [ ] `just validate-backend` passes with zero ruff and mypy errors
- [ ] `test_activity_social_feed.py` passes including new `TestSocialFeedNoMembership` test
- [ ] All existing activity backend tests continue to pass
- [ ] `ActivityFeedItem.tsx` renders a name for media/conversation feed items using metadata fallback
- [ ] Clicking a story/media feed item navigates correctly even when `entity` is null (uses metadata fallback)
- [ ] Frontend tests pass with no regressions
- [ ] TypeScript compiles clean (`tsc --noEmit`)
