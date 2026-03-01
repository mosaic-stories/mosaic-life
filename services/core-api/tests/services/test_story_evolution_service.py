"""Tests for story evolution service."""

from unittest.mock import AsyncMock, MagicMock, patch

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


class TestSummarizeConversation:
    @pytest.mark.asyncio
    async def test_summarize_success(
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

        mock_messages = [
            {"role": "assistant", "content": "Tell me about this story."},
            {"role": "user", "content": "Uncle Ray was there that day."},
        ]

        async def mock_stream(**kwargs):
            for chunk in ["**New Details**\n", "- Uncle Ray was present"]:
                yield chunk

        mock_provider = MagicMock()
        mock_provider.stream_generate = mock_stream

        with patch(
            "app.services.ai.get_context_messages",
            new_callable=AsyncMock,
            return_value=mock_messages,
        ):
            result = await evolution_service.summarize_conversation(
                db=db_session,
                session_id=session.id,
                story_id=test_story.id,
                user_id=test_user.id,
                llm_provider=mock_provider,
            )

        assert result.phase == "summary"
        assert result.summary_text is not None
        assert "Uncle Ray" in result.summary_text

    @pytest.mark.asyncio
    async def test_summarize_wrong_phase(
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

        # Advance to summary first
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="existing summary",
        )

        mock_provider = MagicMock()

        with pytest.raises(HTTPException) as exc:
            await evolution_service.summarize_conversation(
                db=db_session,
                session_id=session.id,
                story_id=test_story.id,
                user_id=test_user.id,
                llm_provider=mock_provider,
            )
        assert exc.value.status_code == 422

    @pytest.mark.asyncio
    async def test_summarize_no_messages(
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

        mock_provider = MagicMock()

        with (
            patch(
                "app.services.ai.get_context_messages",
                new_callable=AsyncMock,
                return_value=[],
            ),
            pytest.raises(HTTPException) as exc,
        ):
            await evolution_service.summarize_conversation(
                db=db_session,
                session_id=session.id,
                story_id=test_story.id,
                user_id=test_user.id,
                llm_provider=mock_provider,
            )
        assert exc.value.status_code == 422


class TestGetSessionForGeneration:
    @pytest.mark.asyncio
    async def test_accepts_style_selection_phase(
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

        # Advance to summary, then style_selection
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## New Details\n- Detail",
        )
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
        )

        result = await evolution_service.get_session_for_generation(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
        )

        assert result.phase == "drafting"

    @pytest.mark.asyncio
    async def test_accepts_drafting_phase(
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

        # Advance all the way to drafting
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## New Details\n- Detail",
        )
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
        )

        # First call transitions to drafting
        await evolution_service.get_session_for_generation(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
        )

        # Second call should still succeed (already drafting)
        result = await evolution_service.get_session_for_generation(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
        )
        assert result.phase == "drafting"

    @pytest.mark.asyncio
    async def test_rejects_elicitation_phase(
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
            await evolution_service.get_session_for_generation(
                db=db_session,
                session_id=session.id,
                story_id=test_story.id,
                user_id=test_user.id,
            )
        assert exc.value.status_code == 422


class TestBackwardPhaseTransitions:
    @pytest.mark.asyncio
    async def test_review_back_to_style_selection_clears_draft(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Going back to style_selection should delete draft and reset revision_count."""
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        # Advance through: elicitation → summary → style_selection
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
            summary_text="## New Details\n- Detail",
        )
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
        )

        # Simulate having a draft (manually set fields as generate endpoint would)
        from app.models.story_version import StoryVersion

        draft = StoryVersion(
            story_id=test_story.id,
            version_number=99,
            title="Draft",
            content="Draft content",
            status="draft",
            source="story_evolution",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()
        session.draft_version_id = draft.id
        session.phase = "review"
        session.revision_count = 2
        await db_session.commit()

        # Go back to style_selection
        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
        )

        assert updated.phase == "style_selection"
        assert updated.draft_version_id is None
        assert updated.revision_count == 0
        # Style and length should be preserved (they belong to style_selection)
        assert updated.writing_style == "vivid"
        assert updated.length_preference == "similar"
        # Summary should be preserved
        assert updated.summary_text is not None

    @pytest.mark.asyncio
    async def test_review_back_to_summary_clears_style_and_draft(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Going back to summary should clear style, length, draft, and revision_count."""
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
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="emotional",
            length_preference="longer",
        )

        # Simulate review phase
        session.phase = "review"
        await db_session.commit()

        # Go back to summary
        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="summary",
        )

        assert updated.phase == "summary"
        assert updated.writing_style is None
        assert updated.length_preference is None
        assert updated.draft_version_id is None
        assert updated.revision_count == 0
        # Summary should be preserved (belongs to this phase)
        assert updated.summary_text == "## New Details\n- Detail"

    @pytest.mark.asyncio
    async def test_review_back_to_elicitation_clears_everything(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Going back to elicitation should clear summary, style, length, draft."""
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
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="concise",
            length_preference="shorter",
        )

        # Simulate review phase
        session.phase = "review"
        await db_session.commit()

        # Go back to elicitation
        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="elicitation",
        )

        assert updated.phase == "elicitation"
        assert updated.summary_text is None
        assert updated.writing_style is None
        assert updated.length_preference is None
        assert updated.draft_version_id is None
        assert updated.revision_count == 0

    @pytest.mark.asyncio
    async def test_style_selection_back_to_elicitation_clears_summary(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Going from style_selection back to elicitation should clear summary and style."""
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
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
        )

        updated = await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="elicitation",
        )

        assert updated.phase == "elicitation"
        assert updated.summary_text is None
        assert updated.writing_style is None
        assert updated.length_preference is None

    @pytest.mark.asyncio
    async def test_backward_transition_deletes_draft_version_from_db(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Draft StoryVersion record should be deleted from DB on backward transition."""
        from sqlalchemy import select as sa_select

        from app.models.story_version import StoryVersion

        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        # Create a draft version
        draft = StoryVersion(
            story_id=test_story.id,
            version_number=99,
            title="Draft",
            content="Draft content",
            status="draft",
            source="story_evolution",
            created_by=test_user.id,
        )
        db_session.add(draft)
        await db_session.flush()

        session.draft_version_id = draft.id
        session.phase = "review"
        session.summary_text = "## Summary"
        session.writing_style = "vivid"
        session.length_preference = "similar"
        await db_session.commit()

        draft_id = draft.id

        # Go back to elicitation
        await evolution_service.advance_phase(
            db=db_session,
            session_id=session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            target_phase="elicitation",
        )

        # Verify draft is deleted from DB
        result = await db_session.execute(
            sa_select(StoryVersion).where(StoryVersion.id == draft_id)
        )
        assert result.scalar_one_or_none() is None


class TestSaveDraft:
    @pytest.mark.asyncio
    async def test_save_draft_manual_edit_source(
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

        draft = await evolution_service.save_draft(
            db=db_session,
            session=session,
            title="Updated Title",
            content="Updated content from manual edit",
            user_id=test_user.id,
            source="manual_edit",
        )

        assert draft.source == "manual_edit"
        assert draft.status == "draft"
        assert session.phase == "review"
        assert session.draft_version_id == draft.id


class TestAcceptSession:
    @pytest.mark.asyncio
    async def test_accept_session_requires_draft(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Accept should fail if no draft exists, regardless of phase."""
        session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )
        # Session is in elicitation, no draft
        with pytest.raises(HTTPException) as exc:
            await evolution_service.accept_session(
                db=db_session,
                session_id=session.id,
                story_id=test_story.id,
                user_id=test_user.id,
            )
        assert exc.value.status_code == 422
        assert "No draft" in exc.value.detail


class TestAcceptSessionDraftTransition:
    async def _setup_session_with_draft(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
    ) -> "tuple[object, object]":
        """Helper to create a session and save a draft, returning (session, draft)."""
        evo_session = await evolution_service.start_session(
            db=db_session,
            story_id=test_story.id,
            user_id=test_user.id,
            persona_id="biographer",
        )

        draft = await evolution_service.save_draft(
            db=db_session,
            session=evo_session,
            title="Draft Title",
            content="Draft content for acceptance",
            user_id=test_user.id,
            source="manual_edit",
        )
        return evo_session, draft

    @pytest.mark.asyncio
    async def test_accept_transitions_draft_to_published(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Accepting a session on a draft story transitions status to published."""
        from sqlalchemy import select as sa_select

        from app.models.story import Story as StoryModel

        # Set story status to draft
        test_story.status = "draft"
        await db_session.commit()

        evo_session, _draft = await self._setup_session_with_draft(
            db_session, test_user, test_story
        )

        completed_session = await evolution_service.accept_session(
            db=db_session,
            session_id=evo_session.id,
            story_id=test_story.id,
            user_id=test_user.id,
        )

        assert completed_session.phase == "completed"

        # Verify story status was transitioned to published
        result = await db_session.execute(
            sa_select(StoryModel).where(StoryModel.id == test_story.id)
        )
        updated_story = result.scalar_one()
        assert updated_story.status == "published"

    @pytest.mark.asyncio
    async def test_accept_with_visibility_updates_story(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Accepting with visibility param updates the story visibility."""
        from sqlalchemy import select as sa_select

        from app.models.story import Story as StoryModel

        evo_session, _draft = await self._setup_session_with_draft(
            db_session, test_user, test_story
        )

        completed_session = await evolution_service.accept_session(
            db=db_session,
            session_id=evo_session.id,
            story_id=test_story.id,
            user_id=test_user.id,
            visibility="personal",
        )

        assert completed_session.phase == "completed"

        result = await db_session.execute(
            sa_select(StoryModel).where(StoryModel.id == test_story.id)
        )
        updated_story = result.scalar_one()
        assert updated_story.visibility == "personal"

    @pytest.mark.asyncio
    async def test_accept_without_visibility_leaves_story_visibility_unchanged(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Accepting without visibility param does not change story visibility."""
        from sqlalchemy import select as sa_select

        from app.models.story import Story as StoryModel

        original_visibility = test_story.visibility

        evo_session, _draft = await self._setup_session_with_draft(
            db_session, test_user, test_story
        )

        await evolution_service.accept_session(
            db=db_session,
            session_id=evo_session.id,
            story_id=test_story.id,
            user_id=test_user.id,
        )

        result = await db_session.execute(
            sa_select(StoryModel).where(StoryModel.id == test_story.id)
        )
        updated_story = result.scalar_one()
        assert updated_story.visibility == original_visibility

    @pytest.mark.asyncio
    async def test_accept_published_story_remains_published(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        test_legacy: Legacy,
    ) -> None:
        """Accepting a session on an already-published story keeps it published."""
        from sqlalchemy import select as sa_select

        from app.models.story import Story as StoryModel

        # Ensure story is published (default)
        test_story.status = "published"
        await db_session.commit()

        evo_session, _draft = await self._setup_session_with_draft(
            db_session, test_user, test_story
        )

        completed_session = await evolution_service.accept_session(
            db=db_session,
            session_id=evo_session.id,
            story_id=test_story.id,
            user_id=test_user.id,
        )

        assert completed_session.phase == "completed"

        result = await db_session.execute(
            sa_select(StoryModel).where(StoryModel.id == test_story.id)
        )
        updated_story = result.scalar_one()
        assert updated_story.status == "published"
