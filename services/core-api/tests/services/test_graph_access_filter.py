"""Tests for GraphAccessFilter."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.schemas.retrieval import LinkedLegacyFilter, VisibilityFilter
from app.services.graph_access_filter import GraphAccessFilter


# ---------------------------------------------------------------------------
# Helpers / factories
# ---------------------------------------------------------------------------


def _make_story_row(
    story_id: UUID,
    legacy_id: UUID,
    visibility: str,
    author_id: UUID,
) -> MagicMock:
    """Build a mock Story ORM-like row with the fields the filter inspects."""
    row = MagicMock()
    row.id = story_id
    row.legacy_id = legacy_id
    row.visibility = visibility
    row.author_id = author_id
    return row


def _make_db_session(stories: list[MagicMock]) -> AsyncMock:
    """Build an AsyncSession mock that returns *stories* for any execute call."""
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = stories
    db.execute = AsyncMock(return_value=result_mock)
    return db


def _visibility_filter(
    allowed: list[str],
    personal_author_id: UUID,
) -> VisibilityFilter:
    return VisibilityFilter(
        allowed_visibilities=allowed,
        personal_author_id=personal_author_id,
    )


def _linked_filter(
    legacy_id: UUID,
    share_mode: str,
    story_ids: list[UUID] | None = None,
) -> LinkedLegacyFilter:
    return LinkedLegacyFilter(
        legacy_id=legacy_id,
        share_mode=share_mode,
        story_ids=story_ids or [],
    )


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------


class TestGraphAccessFilterPrimaryLegacy:
    """Stories whose source_legacy_id == primary_legacy_id."""

    @pytest.mark.asyncio
    async def test_public_story_included_when_public_is_allowed(self) -> None:
        """Public story is surfaced when user has public visibility."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        story_id = uuid4()

        story = _make_story_row(story_id, primary_legacy_id, "public", uuid4())
        db = _make_db_session([story])

        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[(story_id, primary_legacy_id, 0.9)],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert len(result) == 1
        assert result[0][0] == story_id
        assert result[0][1] == pytest.approx(0.9)

    @pytest.mark.asyncio
    async def test_private_story_included_for_privileged_role(self) -> None:
        """Private story is included when user's allowed_visibilities contains 'private'."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        story_id = uuid4()

        story = _make_story_row(story_id, primary_legacy_id, "private", uuid4())
        db = _make_db_session([story])

        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[(story_id, primary_legacy_id, 0.75)],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert len(result) == 1
        assert result[0][0] == story_id

    @pytest.mark.asyncio
    async def test_private_story_filtered_out_for_admirer(self) -> None:
        """Private story is excluded when user (admirer) lacks 'private' visibility."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        story_id = uuid4()

        story = _make_story_row(story_id, primary_legacy_id, "private", uuid4())
        db = _make_db_session([story])

        # Admirer only sees public + personal
        vis_filter = _visibility_filter(["public", "personal"], user_id)

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[(story_id, primary_legacy_id, 0.8)],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert result == []

    @pytest.mark.asyncio
    async def test_personal_story_included_when_author_matches_user(self) -> None:
        """Personal story is included when story.author_id == user_id."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        story_id = uuid4()

        story = _make_story_row(story_id, primary_legacy_id, "personal", user_id)
        db = _make_db_session([story])

        vis_filter = _visibility_filter(["public", "personal"], user_id)

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[(story_id, primary_legacy_id, 0.6)],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert len(result) == 1
        assert result[0][0] == story_id

    @pytest.mark.asyncio
    async def test_personal_story_excluded_when_author_differs(self) -> None:
        """Personal story from a different author is excluded even if 'personal' is allowed."""
        user_id = uuid4()
        other_author_id = uuid4()
        primary_legacy_id = uuid4()
        story_id = uuid4()

        story = _make_story_row(
            story_id, primary_legacy_id, "personal", other_author_id
        )
        db = _make_db_session([story])

        vis_filter = _visibility_filter(["public", "personal"], user_id)

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[(story_id, primary_legacy_id, 0.7)],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert result == []


class TestGraphAccessFilterCrossLegacy:
    """Stories whose source_legacy_id != primary_legacy_id."""

    @pytest.mark.asyncio
    async def test_cross_legacy_all_share_mode_included(self) -> None:
        """Cross-legacy story is included when linked with 'all' share mode."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        linked_legacy_id = uuid4()
        story_id = uuid4()

        story = _make_story_row(story_id, linked_legacy_id, "public", uuid4())
        db = _make_db_session([story])

        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)
        linked = _linked_filter(linked_legacy_id, "all")

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[linked]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[(story_id, linked_legacy_id, 0.85)],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert len(result) == 1
        assert result[0][0] == story_id
        assert result[0][1] == pytest.approx(0.85)

    @pytest.mark.asyncio
    async def test_cross_legacy_selective_story_in_list_included(self) -> None:
        """Cross-legacy story included when in selective share list."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        linked_legacy_id = uuid4()
        shared_story_id = uuid4()
        unshared_story_id = uuid4()

        shared_story = _make_story_row(
            shared_story_id, linked_legacy_id, "public", uuid4()
        )
        db = _make_db_session([shared_story])

        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)
        linked = _linked_filter(linked_legacy_id, "selective", [shared_story_id])

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[linked]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[
                    (shared_story_id, linked_legacy_id, 0.9),
                    (unshared_story_id, linked_legacy_id, 0.8),
                ],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        result_ids = [r[0] for r in result]
        assert shared_story_id in result_ids
        assert unshared_story_id not in result_ids

    @pytest.mark.asyncio
    async def test_cross_legacy_selective_story_not_in_list_excluded(self) -> None:
        """Cross-legacy story excluded when NOT in selective share list."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        linked_legacy_id = uuid4()
        story_id = uuid4()
        other_shared_story_id = uuid4()

        story = _make_story_row(story_id, linked_legacy_id, "public", uuid4())
        db = _make_db_session([story])

        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)
        # linked legacy only shares a different story
        linked = _linked_filter(linked_legacy_id, "selective", [other_shared_story_id])

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[linked]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[(story_id, linked_legacy_id, 0.7)],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert result == []

    @pytest.mark.asyncio
    async def test_unlinked_legacy_story_dropped_entirely(self) -> None:
        """Story from a legacy with no link to primary legacy is dropped."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        unlinked_legacy_id = uuid4()
        story_id = uuid4()

        story = _make_story_row(story_id, unlinked_legacy_id, "public", uuid4())
        db = _make_db_session([story])

        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)
        # No links at all
        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[(story_id, unlinked_legacy_id, 0.95)],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert result == []


class TestGraphAccessFilterMixed:
    """Mixed scenarios combining primary and cross-legacy stories."""

    @pytest.mark.asyncio
    async def test_mixed_allowed_and_filtered_stories(self) -> None:
        """Only stories passing permission checks are returned from a mixed input."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        linked_legacy_id = uuid4()

        public_story_id = uuid4()
        private_story_id = uuid4()  # admirer cannot see private
        cross_story_id = uuid4()
        unlinked_story_id = uuid4()
        unlinked_legacy_id = uuid4()

        public_story = _make_story_row(
            public_story_id, primary_legacy_id, "public", uuid4()
        )
        private_story = _make_story_row(
            private_story_id, primary_legacy_id, "private", uuid4()
        )
        cross_story = _make_story_row(
            cross_story_id, linked_legacy_id, "public", uuid4()
        )

        db = _make_db_session([public_story, private_story, cross_story])

        # Admirer: only public + personal
        vis_filter = _visibility_filter(["public", "personal"], user_id)
        linked = _linked_filter(linked_legacy_id, "all")

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[linked]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[
                    (public_story_id, primary_legacy_id, 0.9),
                    (private_story_id, primary_legacy_id, 0.85),
                    (cross_story_id, linked_legacy_id, 0.7),
                    (unlinked_story_id, unlinked_legacy_id, 0.6),
                ],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        result_ids = [r[0] for r in result]
        assert public_story_id in result_ids
        assert private_story_id not in result_ids
        assert cross_story_id in result_ids
        assert unlinked_story_id not in result_ids


class TestGraphAccessFilterEdgeCases:
    """Edge-case and error-handling scenarios."""

    @pytest.mark.asyncio
    async def test_empty_input_returns_empty_output(self) -> None:
        """Empty story_ids_with_sources returns an empty list."""
        user_id = uuid4()
        primary_legacy_id = uuid4()

        db = _make_db_session([])

        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert result == []

    @pytest.mark.asyncio
    async def test_http_exception_from_visibility_filter_returns_empty_list(
        self,
    ) -> None:
        """If resolve_visibility_filter raises HTTPException (403), return [] gracefully."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        story_id = uuid4()

        db = _make_db_session([])

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(
                    side_effect=HTTPException(status_code=403, detail="Not a member")
                ),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[(story_id, primary_legacy_id, 0.9)],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert result == []

    @pytest.mark.asyncio
    async def test_visibility_filter_called_once_not_per_story(self) -> None:
        """resolve_visibility_filter is called exactly once regardless of story count."""
        user_id = uuid4()
        primary_legacy_id = uuid4()

        stories = [
            _make_story_row(uuid4(), primary_legacy_id, "public", uuid4())
            for _ in range(5)
        ]
        db = _make_db_session(stories)
        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)

        mock_vis = AsyncMock(return_value=vis_filter)
        mock_linked = AsyncMock(return_value=[])

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=mock_vis,
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=mock_linked,
            ),
        ):
            svc = GraphAccessFilter()
            await svc.filter_story_ids(
                story_ids_with_sources=[
                    (s.id, primary_legacy_id, 0.8) for s in stories
                ],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        mock_vis.assert_called_once()

    @pytest.mark.asyncio
    async def test_linked_legacy_filter_called_once_not_per_story(self) -> None:
        """get_linked_legacy_filters is called exactly once regardless of story count."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        linked_legacy_id = uuid4()

        stories = [
            _make_story_row(uuid4(), linked_legacy_id, "public", uuid4())
            for _ in range(4)
        ]
        db = _make_db_session(stories)
        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)
        linked = _linked_filter(linked_legacy_id, "all")

        mock_vis = AsyncMock(return_value=vis_filter)
        mock_linked = AsyncMock(return_value=[linked])

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=mock_vis,
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=mock_linked,
            ),
        ):
            svc = GraphAccessFilter()
            await svc.filter_story_ids(
                story_ids_with_sources=[(s.id, linked_legacy_id, 0.7) for s in stories],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        mock_linked.assert_called_once()

    @pytest.mark.asyncio
    async def test_scores_preserved_in_output(self) -> None:
        """The original relevance scores are preserved in the filtered output."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        story_id_a = uuid4()
        story_id_b = uuid4()

        story_a = _make_story_row(story_id_a, primary_legacy_id, "public", uuid4())
        story_b = _make_story_row(story_id_b, primary_legacy_id, "public", uuid4())
        db = _make_db_session([story_a, story_b])

        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[
                    (story_id_a, primary_legacy_id, 0.95),
                    (story_id_b, primary_legacy_id, 0.42),
                ],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        score_map = {r[0]: r[1] for r in result}
        assert score_map[story_id_a] == pytest.approx(0.95)
        assert score_map[story_id_b] == pytest.approx(0.42)

    @pytest.mark.asyncio
    async def test_story_not_found_in_db_is_excluded(self) -> None:
        """A story_id present in graph results but absent from the DB is excluded."""
        user_id = uuid4()
        primary_legacy_id = uuid4()
        ghost_story_id = uuid4()

        # DB returns nothing for the given story_ids
        db = _make_db_session([])

        vis_filter = _visibility_filter(["public", "private", "personal"], user_id)

        with (
            patch(
                "app.services.graph_access_filter.resolve_visibility_filter",
                new=AsyncMock(return_value=vis_filter),
            ),
            patch(
                "app.services.graph_access_filter.get_linked_legacy_filters",
                new=AsyncMock(return_value=[]),
            ),
        ):
            svc = GraphAccessFilter()
            result = await svc.filter_story_ids(
                story_ids_with_sources=[(ghost_story_id, primary_legacy_id, 0.8)],
                user_id=user_id,
                primary_legacy_id=primary_legacy_id,
                db=db,
            )

        assert result == []
