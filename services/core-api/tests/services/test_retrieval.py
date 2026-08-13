"""Tests for retrieval service."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.user import User
from app.schemas.retrieval import ChunkResult, LinkedLegacyFilter, VisibilityFilter
from app.services.retrieval import (
    count_chunks_for_story,
    delete_chunks_for_story,
    resolve_visibility_filter,
    retrieve_context,
    store_chunks,
)


class TestResolveVisibilityFilter:
    """Tests for permission resolution."""

    @pytest.mark.asyncio
    async def test_creator_sees_all_visibilities(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ) -> None:
        """Test creator can see all visibility levels."""
        # test_user is creator via fixture
        result = await resolve_visibility_filter(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )

        assert "public" in result.allowed_visibilities
        assert "private" in result.allowed_visibilities
        assert "personal" in result.allowed_visibilities
        assert result.personal_author_id == test_user.id

    @pytest.mark.asyncio
    async def test_admirer_sees_public_and_personal(
        self,
        db_session: AsyncSession,
        test_legacy: Legacy,
    ) -> None:
        """Test admirer can see public stories and their own personal stories."""
        # Create admirer user
        admirer = User(
            email="admirer@example.com",
            google_id="google_admirer",
            provider="google",
            provider_id="google_admirer",
            name="Admirer User",
            username="admirer-0002",
        )
        db_session.add(admirer)
        await db_session.flush()

        # Add as admirer
        membership = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=admirer.id,
            role="admirer",
        )
        db_session.add(membership)
        await db_session.commit()

        result = await resolve_visibility_filter(
            db=db_session,
            user_id=admirer.id,
            legacy_id=test_legacy.id,
        )

        assert result.allowed_visibilities == ["public", "private", "personal"]
        assert result.personal_author_id == admirer.id

    @pytest.mark.asyncio
    async def test_non_member_raises_permission_error(
        self,
        db_session: AsyncSession,
        test_legacy: Legacy,
    ) -> None:
        """Test non-member cannot access legacy."""
        from fastapi import HTTPException

        non_member = User(
            email="nonmember@example.com",
            google_id="google_nonmember",
            provider="google",
            provider_id="google_nonmember",
            name="Non Member",
            username="nonmember-0001",
        )
        db_session.add(non_member)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await resolve_visibility_filter(
                db=db_session,
                user_id=non_member.id,
                legacy_id=test_legacy.id,
            )

        assert exc.value.status_code == 403


class TestStoreAndDeleteChunks:
    """Tests for chunk storage operations."""

    @pytest.mark.asyncio
    async def test_store_chunks_creates_records(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test storing chunks creates database records."""
        chunks_data = [
            ("First chunk content", [0.1] * 1024),
            ("Second chunk content", [0.2] * 1024),
        ]

        await store_chunks(
            db=db_session,
            story_id=test_story.id,
            chunks=chunks_data,
            legacy_id=test_legacy.id,
            visibility=test_story.visibility,
            author_id=test_user.id,
        )

        count = await count_chunks_for_story(db_session, test_story.id)
        assert count == 2

    @pytest.mark.asyncio
    async def test_delete_chunks_removes_all(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        """Test deleting chunks removes all for story."""
        # First store some chunks
        chunks_data = [
            ("Chunk 1", [0.1] * 1024),
            ("Chunk 2", [0.2] * 1024),
        ]
        await store_chunks(
            db=db_session,
            story_id=test_story.id,
            chunks=chunks_data,
            legacy_id=test_legacy.id,
            visibility=test_story.visibility,
            author_id=test_user.id,
        )

        # Verify they exist
        count_before = await count_chunks_for_story(db_session, test_story.id)
        assert count_before == 2

        # Delete them
        deleted = await delete_chunks_for_story(db_session, test_story.id)
        assert deleted == 2

        # Verify they're gone
        count_after = await count_chunks_for_story(db_session, test_story.id)
        assert count_after == 0


class _FakeRow:
    """Stand-in for a SQLAlchemy Row with attribute access."""

    def __init__(
        self, id: UUID, story_id: UUID, content: str, similarity: float
    ) -> None:
        self.id = id
        self.story_id = story_id
        self.content = content
        self.similarity = similarity


def _fake_result(rows: list[_FakeRow]) -> MagicMock:
    result = MagicMock()
    result.fetchall.return_value = rows
    return result


class TestRetrieveContextSelectiveShare:
    """Tests for the linked-legacy "selective" share-mode query branch.

    ``retrieve_context`` builds this query's ``story_id IN (...)`` clause from
    a caller-controlled list of story IDs. These tests confirm the clause is
    built with named bound placeholders (mirroring the ``vis_i``/``sid_i``
    style already used elsewhere in the function) rather than interpolated
    directly into the SQL string, and that results are unaffected by the
    change. The DB session is mocked because pgvector operators used in the
    query aren't supported by the SQLite engine used elsewhere in this suite.
    """

    async def _run_selective_share(
        self,
        story_ids: list[UUID],
        linked_rows: list[_FakeRow],
    ) -> tuple[list[ChunkResult], AsyncMock]:
        legacy_id = uuid4()
        user_id = uuid4()
        linked_legacy_id = uuid4()

        mock_db = AsyncMock()
        mock_db.execute.side_effect = [
            _fake_result([]),  # primary (non-linked) chunk query
            _fake_result(linked_rows),  # linked-legacy selective query
        ]

        with (
            patch(
                "app.services.retrieval.resolve_visibility_filter",
                new=AsyncMock(
                    return_value=VisibilityFilter(
                        allowed_visibilities=["public", "private", "personal"],
                        personal_author_id=user_id,
                    )
                ),
            ),
            patch("app.services.retrieval.get_provider_registry") as mock_registry,
            patch(
                "app.services.retrieval.get_linked_legacy_filters",
                new=AsyncMock(
                    return_value=[
                        LinkedLegacyFilter(
                            legacy_id=linked_legacy_id,
                            share_mode="selective",
                            story_ids=story_ids,
                        )
                    ]
                ),
            ),
        ):
            embedding_provider = AsyncMock()
            embedding_provider.embed_texts = AsyncMock(return_value=[[0.1] * 4])
            mock_registry.return_value.get_embedding_provider.return_value = (
                embedding_provider
            )

            chunks = await retrieve_context(
                db=mock_db,
                query="tell me about grandma",
                legacy_id=legacy_id,
                user_id=user_id,
                top_k=5,
            )

        return chunks, mock_db

    @pytest.mark.asyncio
    async def test_results_unchanged_after_parameterization(self) -> None:
        """Selective-share results still come through correctly."""
        story1, story2 = uuid4(), uuid4()
        row = _FakeRow(
            id=uuid4(), story_id=story1, content="a shared chunk", similarity=0.9
        )

        chunks, _ = await self._run_selective_share(
            story_ids=[story1, story2],
            linked_rows=[row],
        )

        assert len(chunks) == 1
        assert isinstance(chunks[0], ChunkResult)
        assert chunks[0].story_id == story1
        assert chunks[0].content == "a shared chunk"

    @pytest.mark.asyncio
    async def test_story_ids_bound_as_named_params_not_interpolated(self) -> None:
        """Story IDs must be passed as bound params, never spliced into SQL text.

        This is the core of finding 12d: the ``IN (...)`` clause must use
        named placeholders (``:sid_0``, ``:sid_1``, ...) like the existing
        ``vis_i`` visibility placeholders in this same function, with the
        actual values supplied only via the params dict.
        """
        story1, story2 = uuid4(), uuid4()

        _, mock_db = await self._run_selective_share(
            story_ids=[story1, story2],
            linked_rows=[],
        )

        # Second db.execute call is the linked-legacy selective query.
        assert mock_db.execute.call_count == 2
        sql_clause, params = mock_db.execute.call_args_list[1].args
        sql_text = str(sql_clause)

        # The raw string ids must never appear directly in the SQL text.
        assert str(story1) not in sql_text
        assert str(story2) not in sql_text
        assert "sid_0" in sql_text
        assert "sid_1" in sql_text
        assert "story_id IN (:sid_0, :sid_1)" in sql_text

        # Values are supplied exclusively via the bound-parameter dict.
        assert params["sid_0"] == str(story1)
        assert params["sid_1"] == str(story2)
