# Media Gallery Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the media gallery redesign issues found in review, including the backend privacy and data-integrity bugs, incomplete media detail payloads, unreachable delete UI, and the missing person-creation and tag-autocomplete UX.

**Architecture:** Use a focused repair pass. Backend changes tighten authorization and scoping for person search and media tags, and consolidate media detail response assembly onto the complete builder path. Frontend changes keep the current layout but restore reachable destructive actions and finish the planned inline people/tag flows.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic v2, React, TypeScript, TanStack Query, Vitest.

---

## Task 1: Backend hardening and media detail consistency

**Files:**
- Modify: `services/core-api/app/routes/person.py`
- Modify: `services/core-api/app/services/person.py`
- Modify: `services/core-api/app/routes/media.py`
- Modify: `services/core-api/app/services/media.py`
- Modify: `services/core-api/app/schemas/person.py` if needed for test compatibility
- Test: `services/core-api/tests/test_person_api.py`
- Test: `services/core-api/tests/test_media_api.py`
- Test: `services/core-api/tests/test_media_service.py`

**Step 1: Add failing backend tests**

Cover these cases:

- `GET /api/persons/search` rejects requests without `legacy_id`.
- `GET /api/persons/search` rejects authenticated users who are not non-pending members of the requested legacy.
- Person search only returns persons visible through the requested legacy scope.
- Adding a media tag fails when the supplied `legacy_id` is not associated with the media item.
- `GET /api/media/{id}` includes `caption`, `date_taken`, `location`, `era`, `tags`, and `people` in the response.

**Step 2: Run the focused failing tests**

Run:

```bash
cd services/core-api && uv run pytest tests/test_person_api.py tests/test_media_api.py tests/test_media_service.py -q
```

Expected: failures covering the current review findings.

**Step 3: Implement the backend fixes**

- Require `legacy_id` on the person search route.
- In the person search service, verify the caller is a non-pending member of the requested legacy before returning results.
- Restrict person search results to the legacy-specific pool only.
- In `add_media_tag`, verify the requested legacy is both accessible to the caller and actually associated with the media item before creating or attaching a tag.
- Make `get_media_detail` delegate to the complete detail-builder path so it returns the same metadata/tag/person payload as update operations.

**Step 4: Re-run the focused tests**

Run:

```bash
cd services/core-api && uv run pytest tests/test_person_api.py tests/test_media_api.py tests/test_media_service.py -q
```

Expected: pass.

**Step 5: Run backend validation**

Run:

```bash
cd services/core-api && just validate-backend
```

Expected: ruff and mypy pass.

**Step 6: Commit**

```bash
git add services/core-api/app/routes/person.py services/core-api/app/services/person.py services/core-api/app/routes/media.py services/core-api/app/services/media.py services/core-api/tests/test_person_api.py services/core-api/tests/test_media_api.py services/core-api/tests/test_media_service.py
git commit -m "fix(media): harden search and tag scoping"
```

## Task 2: Migration alignment for tag schema

**Files:**
- Create: `services/core-api/alembic/versions/<new>_align_tags_legacy_constraint.py`
- Test: migration smoke via Alembic commands

**Step 1: Create a follow-up migration**

Add a new Alembic revision that:

- makes `tags.legacy_id` non-null,
- normalizes the unique constraint name to match the ORM expectation if the current DB constraint differs,
- safely handles existing rows if any unexpected nulls exist.

**Step 2: Run migration locally**

Run:

```bash
cd services/core-api && uv run alembic upgrade head
```

Expected: migration applies successfully.

**Step 3: Verify current head**

Run:

```bash
cd services/core-api && uv run alembic current
```

Expected: new revision is current head.

**Step 4: Commit**

```bash
git add services/core-api/alembic/versions/
git commit -m "fix(media): align tag schema migration with model contract"
```

## Task 3: Frontend detail panel fixes and missing UX

**Files:**
- Modify: `apps/web/src/features/media/components/MediaDetailPanel.tsx`
- Modify: `apps/web/src/features/legacy/components/MediaSection.tsx`
- Modify: `apps/web/src/features/media/api/media.ts` if API contract helpers need adjustment
- Modify: `apps/web/src/features/media/hooks/useMedia.ts` if mutation wiring needs adjustment
- Test: `apps/web/src/features/legacy/components/MediaSection.test.tsx` or appropriate media component tests
- Test: `apps/web/src/features/media/components/MediaDetailPanel.test.tsx` if absent, create it

**Step 1: Add failing frontend tests**

Cover these cases:

- The selected media panel exposes a reachable delete action that opens the existing confirmation dialog.
- The People section can create a new person when the search query has no results.
- The Tags section shows legacy tag suggestions/autocomplete and can apply one.

**Step 2: Run focused frontend tests**

Run:

```bash
cd apps/web && npx vitest run src/features/media/components/MediaDetailPanel.test.tsx src/features/legacy/components/MediaSection.test.tsx
```

Expected: failures for the missing behaviors.

**Step 3: Implement the UI fixes**

- Add a delete affordance to the detail panel and thread an `onRequestDelete` callback back to `MediaSection` so the existing dialog becomes reachable.
- Add inline create-person behavior that calls `tagPerson` with `{ name, role }` when there are no search results.
- Turn `useLegacyTags` into rendered suggestions/autocomplete for tag entry and allow selecting an existing tag.
- Keep the current panel layout and mobile sheet behavior unchanged except for the new interactions.

**Step 4: Re-run focused frontend tests**

Run:

```bash
cd apps/web && npx vitest run src/features/media/components/MediaDetailPanel.test.tsx src/features/legacy/components/MediaSection.test.tsx
```

Expected: pass.

**Step 5: Run frontend type-check**

Run:

```bash
cd apps/web && npx tsc --noEmit
```

Expected: pass.

**Step 6: Commit**

```bash
git add apps/web/src/features/media/components/MediaDetailPanel.tsx apps/web/src/features/legacy/components/MediaSection.tsx apps/web/src/features/media/api/media.ts apps/web/src/features/media/hooks/useMedia.ts apps/web/src/features/media/components/MediaDetailPanel.test.tsx apps/web/src/features/legacy/components/MediaSection.test.tsx
git commit -m "fix(media): restore detail panel actions and complete tagging ux"
```

## Task 4: Full verification and review pass

**Files:**
- None required unless follow-up fixes are needed

**Step 1: Run full backend validation and tests**

```bash
cd services/core-api && just validate-backend && uv run pytest
```

Expected: pass.

**Step 2: Run full frontend validation and tests**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: pass.

**Step 3: Build frontend**

```bash
cd apps/web && npm run build
```

Expected: build succeeds.

**Step 4: Review the final diff against the findings**

Confirm that:

- person search is legacy-scoped and privacy-safe,
- media tags cannot be injected across legacies,
- media detail returns complete metadata,
- delete is reachable from the new panel,
- create-person and tag-autocomplete UX both work.

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix(media): address verification follow-ups"
```