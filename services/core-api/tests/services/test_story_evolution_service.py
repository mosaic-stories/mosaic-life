"""Tests for story evolution service."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.story import Story
from app.models.user import User
from app.services import story_evolution as evolution_service


class TestStartEvolutionSession:
    @pytest.mark.asyncio
    async def test_start_session_success(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        assert session.phase == "elicitation"
        assert session.story_id == test_story.id
        assert session.base_version_number == 1
        assert session.conversation_id is not None
        assert session.created_by == test_user.id

    @pytest.mark.asyncio
    async def test_start_session_non_author_forbidden(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_story: Story,
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            await evolution_service.start_session(
                db=db_session,
                story_id=test_story.id,
                user_id=test_user_2.id,
                persona_id="biographer",
            )
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_start_session_conflict_when_active_exists(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        # Create first session
        await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        # Try to create second — should fail with 409
        with pytest.raises(HTTPException) as exc:
            await evolution_service.start_session(
                db=db_session,
                story_id=test_story.id,
                user_id=test_user.id,
                persona_id="biographer",
            )
        assert exc.value.status_code == 409


class TestGetActiveSession:
    @pytest.mark.asyncio
    async def test_get_active_session(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        created = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        found = await evolution_service.get_active_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
        )
        assert found is not None
        assert found.id == created.id

    @pytest.mark.asyncio
    async def test_get_active_session_returns_none_when_none(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ) -> None:
        result = await evolution_service.get_active_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
        )
        assert result is None


class TestAdvancePhase:
    @pytest.mark.asyncio
    async def test_elicitation_to_summary(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## New Details\n- Uncle Ray was present",
        )

        assert updated.phase == "summary"
        assert updated.summary_text is not None

    @pytest.mark.asyncio
    async def test_invalid_transition_rejected(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        with pytest.raises(HTTPException) as exc:
            await evolution_service.advance_phase(
                db=db_session,
                session_id=session.id,
                story_id=test_story.id,
                user_id=test_user.id,
                target_phase="review",  # Can't jump from elicitation to review
            )
        assert exc.value.status_code == 422

    @pytest.mark.asyncio
    async def test_summary_to_style_selection(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## New Details\n- Detail",
        )

        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
        )

        assert updated.phase == "style_selection"
        assert updated.writing_style == "vivid"
        assert updated.length_preference == "similar"

    @pytest.mark.asyncio
    async def test_summary_back_to_elicitation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## Summary",
        )

        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="elicitation",
        )

        assert updated.phase == "elicitation"


class TestDiscardSession:
    @pytest.mark.asyncio
    async def test_discard_session(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        discarded = await evolution_service.discard_session(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
        )

        assert discarded.phase == "discarded"

    @pytest.mark.asyncio
    async def test_discard_terminal_session_rejected(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        await evolution_service.discard_session(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
        )

        with pytest.raises(HTTPException) as exc:
            await evolution_service.discard_session(
                db=db_session,
                session_id=session.id,
                story_id=test_story.id,
                user_id=test_user.id,
            )
        assert exc.value.status_code == 422
