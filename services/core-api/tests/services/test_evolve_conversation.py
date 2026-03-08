"""Tests for evolve_conversation service function."""

import pytest
from uuid import uuid4

from sqlalchemy import func, select

from app.models.ai import AIConversation, AIMessage
from app.models.associations import ConversationLegacy
from app.models.story_evolution import StoryEvolutionSession
from app.services.ai import evolve_conversation


class TestEvolveConversation:
    """Test evolve_conversation service function."""

    @pytest.mark.asyncio
    async def test_evolve_creates_story_and_clones_conversation(
        self, db_session, test_user, test_legacy
    ):
        """Evolving a conversation should create a draft story and clone the conversation."""
        # Create original conversation with messages
        original = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
            title="Chat about grandpa",
        )
        db_session.add(original)
        await db_session.flush()

        # Add legacy association
        assoc = ConversationLegacy(
            conversation_id=original.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)

        # Add messages
        msg1 = AIMessage(
            conversation_id=original.id,
            role="user",
            content="Tell me about grandpa's workshop",
        )
        msg2 = AIMessage(
            conversation_id=original.id,
            role="assistant",
            content="Your grandfather's workshop was a magical place...",
        )
        db_session.add_all([msg1, msg2])
        await db_session.flush()

        # Evolve
        result = await evolve_conversation(
            db=db_session,
            conversation_id=original.id,
            user_id=test_user.id,
            title=None,
        )

        # Assertions
        assert result.story_id is not None
        assert result.conversation_id is not None
        assert result.conversation_id != str(original.id)

        # Verify breadcrumb in original conversation
        await db_session.refresh(original, ["messages"])
        system_msgs = [
            m for m in original.messages if m.message_type == "system_notification"
        ]
        assert len(system_msgs) == 1
        assert system_msgs[0].metadata_ is not None
        assert system_msgs[0].metadata_["story_id"] == result.story_id

    @pytest.mark.asyncio
    async def test_evolve_copies_all_messages(self, db_session, test_user, test_legacy):
        """Cloned conversation should have all original messages."""
        original = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(original)
        await db_session.flush()

        assoc = ConversationLegacy(
            conversation_id=original.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)

        for i in range(5):
            db_session.add(
                AIMessage(
                    conversation_id=original.id,
                    role="user" if i % 2 == 0 else "assistant",
                    content=f"Message {i}",
                )
            )
        await db_session.flush()

        result = await evolve_conversation(
            db=db_session,
            conversation_id=original.id,
            user_id=test_user.id,
        )

        # Verify cloned conversation has 5 messages
        from uuid import UUID as PyUUID

        cloned_id = PyUUID(result.conversation_id)
        count = await db_session.execute(
            select(func.count(AIMessage.id)).where(
                AIMessage.conversation_id == cloned_id
            )
        )
        assert count.scalar() == 5

    @pytest.mark.asyncio
    async def test_evolve_fails_without_legacy(self, db_session, test_user):
        """Should raise error if conversation has no legacy association."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await evolve_conversation(
                db=db_session,
                conversation_id=conv.id,
                user_id=test_user.id,
            )
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_evolve_fails_for_wrong_user(
        self, db_session, test_user, test_legacy
    ):
        """Should raise 404 if user doesn't own the conversation."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await evolve_conversation(
                db=db_session,
                conversation_id=conv.id,
                user_id=uuid4(),  # different user
            )
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_evolve_with_custom_title(self, db_session, test_user, test_legacy):
        """Should use the provided title for the story."""
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conv)
        await db_session.flush()

        db_session.add(
            ConversationLegacy(
                conversation_id=conv.id,
                legacy_id=test_legacy.id,
                role="primary",
                position=0,
            )
        )
        db_session.add(
            AIMessage(
                conversation_id=conv.id,
                role="user",
                content="A great memory",
            )
        )
        await db_session.flush()

        result = await evolve_conversation(
            db=db_session,
            conversation_id=conv.id,
            user_id=test_user.id,
            title="Grandpa's Workshop",
        )

        assert result.story_title == "Grandpa's Workshop"

    @pytest.mark.asyncio
    async def test_evolve_fails_when_membership_revoked(
        self, db_session, test_user, test_legacy
    ):
        """Should raise 403 if user's legacy membership was revoked before evolving."""
        from app.models.legacy import LegacyMember

        # Create conversation with legacy association
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        db_session.add(
            ConversationLegacy(
                conversation_id=conv.id,
                legacy_id=test_legacy.id,
                role="primary",
                position=0,
            )
        )
        db_session.add(
            AIMessage(
                conversation_id=conv.id,
                role="user",
                content="A memory to evolve",
            )
        )
        await db_session.flush()

        # Remove the user's legacy membership to simulate revocation
        result = await db_session.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == test_user.id,
                LegacyMember.legacy_id == test_legacy.id,
            )
        )
        member = result.scalar_one_or_none()
        if member:
            await db_session.delete(member)
            await db_session.flush()

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await evolve_conversation(
                db=db_session,
                conversation_id=conv.id,
                user_id=test_user.id,
            )
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_evolve_creates_evolution_session(
        self, db_session, test_user, test_legacy
    ):
        """Evolving should create a StoryEvolutionSession so the workspace can save drafts."""
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conv)
        await db_session.flush()

        db_session.add(
            ConversationLegacy(
                conversation_id=conv.id,
                legacy_id=test_legacy.id,
                role="primary",
                position=0,
            )
        )
        db_session.add(
            AIMessage(
                conversation_id=conv.id,
                role="user",
                content="Tell me about grandpa",
            )
        )
        await db_session.flush()

        result = await evolve_conversation(
            db=db_session,
            conversation_id=conv.id,
            user_id=test_user.id,
        )

        # Verify an active evolution session was created for the story
        from uuid import UUID as PyUUID

        session_result = await db_session.execute(
            select(StoryEvolutionSession).where(
                StoryEvolutionSession.story_id == PyUUID(result.story_id),
                StoryEvolutionSession.phase.notin_(
                    StoryEvolutionSession.TERMINAL_PHASES
                ),
            )
        )
        evo_session = session_result.scalar_one_or_none()
        assert evo_session is not None
        assert str(evo_session.conversation_id) == result.conversation_id
        assert evo_session.created_by == test_user.id
        assert evo_session.phase == "elicitation"
        assert evo_session.base_version_number == 1
