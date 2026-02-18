"""Tests for StoryEvolutionSession model."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.story import Story
from app.models.story_evolution import StoryEvolutionSession
from app.models.user import User


@pytest_asyncio.fixture
async def evolution_conversation(
    db_session: AsyncSession, test_user: User
) -> AIConversation:
    conv = AIConversation(
        user_id=test_user.id,
        persona_id="biographer",
        title="Evolution elicitation",
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


class TestStoryEvolutionSession:
    @pytest.mark.asyncio
    async def test_create_session(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        evolution_conversation: AIConversation,
    ) -> None:
        session = StoryEvolutionSession(
            story_id=test_story.id,
            base_version_number=1,
            conversation_id=evolution_conversation.id,
            phase="elicitation",
            created_by=test_user.id,
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        assert session.id is not None
        assert session.phase == "elicitation"
        assert session.summary_text is None
        assert session.writing_style is None
        assert session.length_preference is None
        assert session.revision_count == 0
        assert session.draft_version_id is None

    @pytest.mark.asyncio
    async def test_session_phase_update(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        evolution_conversation: AIConversation,
    ) -> None:
        session = StoryEvolutionSession(
            story_id=test_story.id,
            base_version_number=1,
            conversation_id=evolution_conversation.id,
            phase="elicitation",
            created_by=test_user.id,
        )
        db_session.add(session)
        await db_session.flush()

        session.phase = "summary"
        session.summary_text = "## New Details\n- Uncle Ray was present"
        await db_session.commit()
        await db_session.refresh(session)

        assert session.phase == "summary"
        assert session.summary_text is not None

    @pytest.mark.asyncio
    async def test_session_with_style_selection(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_story: Story,
        evolution_conversation: AIConversation,
    ) -> None:
        session = StoryEvolutionSession(
            story_id=test_story.id,
            base_version_number=1,
            conversation_id=evolution_conversation.id,
            phase="style_selection",
            writing_style="vivid",
            length_preference="similar",
            created_by=test_user.id,
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        assert session.writing_style == "vivid"
        assert session.length_preference == "similar"
