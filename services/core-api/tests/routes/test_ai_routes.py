"""Tests for AI routes."""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation, AIMessage
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.user import User
from app.routes.ai import format_story_context
from app.schemas.retrieval import ChunkResult
from tests.conftest import create_auth_headers_for_user


class TestFormatStoryContext:
    """Tests for format_story_context helper function."""

    def test_format_empty_chunks_returns_empty_string(self) -> None:
        """Test that empty chunks list returns empty string."""
        result = format_story_context([])
        assert result == ""

    def test_format_single_chunk(self) -> None:
        """Test formatting a single chunk."""
        chunks = [
            ChunkResult(
                chunk_id=uuid4(),
                story_id=uuid4(),
                content="Grandma loved her garden.",
                similarity=0.85,
            )
        ]

        result = format_story_context(chunks)

        assert "## Relevant stories about this person:" in result
        assert "[Story excerpt 1]" in result
        assert "Grandma loved her garden." in result
        assert "Use these excerpts" in result
        assert "rather than making things up" in result

    def test_format_multiple_chunks(self) -> None:
        """Test formatting multiple chunks."""
        chunks = [
            ChunkResult(
                chunk_id=uuid4(),
                story_id=uuid4(),
                content="First memory content.",
                similarity=0.9,
            ),
            ChunkResult(
                chunk_id=uuid4(),
                story_id=uuid4(),
                content="Second memory content.",
                similarity=0.85,
            ),
            ChunkResult(
                chunk_id=uuid4(),
                story_id=uuid4(),
                content="Third memory content.",
                similarity=0.8,
            ),
        ]

        result = format_story_context(chunks)

        assert "[Story excerpt 1]" in result
        assert "[Story excerpt 2]" in result
        assert "[Story excerpt 3]" in result
        assert "First memory content." in result
        assert "Second memory content." in result
        assert "Third memory content." in result

    def test_format_includes_guidance_instructions(self) -> None:
        """Test that formatted context includes usage instructions."""
        chunks = [
            ChunkResult(
                chunk_id=uuid4(),
                story_id=uuid4(),
                content="Some content",
                similarity=0.9,
            )
        ]

        result = format_story_context(chunks)

        assert "Use these excerpts to inform your responses" in result
        assert "Reference specific details when relevant" in result
        assert "say so rather than making things up" in result


class TestListPersonas:
    """Tests for GET /api/ai/personas."""

    @pytest.mark.asyncio
    async def test_list_personas_returns_personas(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing personas returns available personas."""
        response = await client.get("/api/ai/personas", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2
        assert any(p["id"] == "biographer" for p in data)
        assert any(p["id"] == "friend" for p in data)

        # Verify persona structure
        biographer = next(p for p in data if p["id"] == "biographer")
        assert "name" in biographer
        assert "icon" in biographer
        assert "description" in biographer

    @pytest.mark.asyncio
    async def test_list_personas_no_auth_required(
        self,
        client: AsyncClient,
    ):
        """Test personas endpoint works without auth."""
        response = await client.get("/api/ai/personas")

        # Should work without auth (public endpoint for UI)
        assert response.status_code == 200


class TestCreateConversation:
    """Tests for POST /api/ai/conversations."""

    @pytest.mark.asyncio
    async def test_create_conversation_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test creating a conversation."""
        response = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["persona_id"] == "biographer"
        assert len(data["legacies"]) == 1
        assert data["legacies"][0]["legacy_id"] == str(test_legacy.id)
        assert "id" in data
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_create_conversation_returns_existing(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test that creating a conversation returns existing one."""
        # Create first conversation
        response1 = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )
        assert response1.status_code == 201
        conv_id_1 = response1.json()["id"]

        # Request again - should return same
        response2 = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )
        assert response2.status_code == 201
        conv_id_2 = response2.json()["id"]

        assert conv_id_1 == conv_id_2

    @pytest.mark.asyncio
    async def test_create_conversation_requires_auth(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
    ):
        """Test that creating a conversation requires authentication."""
        response = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_create_conversation_requires_membership(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_user_2: User,
    ):
        """Test that non-members cannot create conversations."""
        headers = create_auth_headers_for_user(test_user_2)

        response = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=headers,
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_create_conversation_invalid_persona(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test that invalid persona returns 400."""
        response = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "invalid_persona",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )

        assert response.status_code == 400


class TestListConversations:
    """Tests for GET /api/ai/conversations."""

    @pytest.mark.asyncio
    async def test_list_conversations_empty(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing conversations when none exist."""
        response = await client.get(
            "/api/ai/conversations",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_conversations_returns_user_conversations(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test listing returns user's conversations."""
        # Create a conversation first
        create_resp = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )
        assert create_resp.status_code == 201

        # List conversations
        response = await client.get(
            "/api/ai/conversations",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["persona_id"] == "biographer"

    @pytest.mark.asyncio
    async def test_list_conversations_filter_by_legacy(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test filtering conversations by legacy_id."""
        # Create a conversation
        await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )

        # List with filter
        response = await client.get(
            "/api/ai/conversations",
            params={"legacy_id": str(test_legacy.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert all(
            any(leg["legacy_id"] == str(test_legacy.id) for leg in c["legacies"])
            for c in data
        )


class TestGetMessages:
    """Tests for GET /api/ai/conversations/{id}/messages."""

    @pytest.mark.asyncio
    async def test_get_messages_empty(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test getting messages for new conversation."""
        # Create conversation first
        create_resp = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        response = await client.get(
            f"/api/ai/conversations/{conv_id}/messages",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["messages"] == []
        assert data["total"] == 0
        assert data["has_more"] is False

    @pytest.mark.asyncio
    async def test_get_messages_with_data(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test getting messages when conversation has messages."""
        # Create conversation via DB
        conversation = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conversation)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conversation.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        # Add messages
        msg1 = AIMessage(
            conversation_id=conversation.id,
            role="user",
            content="Hello",
        )
        msg2 = AIMessage(
            conversation_id=conversation.id,
            role="assistant",
            content="Hi there!",
        )
        db_session.add_all([msg1, msg2])
        await db_session.commit()

        response = await client.get(
            f"/api/ai/conversations/{conversation.id}/messages",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["messages"]) == 2
        # First message should be "Hello" (ordered by created_at asc)
        assert data["messages"][0]["content"] == "Hello"

    @pytest.mark.asyncio
    async def test_get_messages_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting messages for non-existent conversation."""
        import uuid

        fake_id = str(uuid.uuid4())
        response = await client.get(
            f"/api/ai/conversations/{fake_id}/messages",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_messages_not_owner(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test cannot get messages for another user's conversation."""
        # Create conversation for user 1
        conversation = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conversation)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conversation.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.commit()

        # Try to access as user 2
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.get(
            f"/api/ai/conversations/{conversation.id}/messages",
            headers=headers,
        )

        assert response.status_code == 404


class TestDeleteConversation:
    """Tests for DELETE /api/ai/conversations/{id}."""

    @pytest.mark.asyncio
    async def test_delete_conversation_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test deleting a conversation."""
        # Create conversation first
        create_resp = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        # Delete it
        response = await client.delete(
            f"/api/ai/conversations/{conv_id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

        # Verify it's gone
        get_resp = await client.get(
            f"/api/ai/conversations/{conv_id}/messages",
            headers=auth_headers,
        )
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_conversation_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test deleting non-existent conversation."""
        import uuid

        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"/api/ai/conversations/{fake_id}",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_conversation_not_owner(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test cannot delete another user's conversation."""
        # Create conversation for user 1
        conversation = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conversation)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conversation.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.commit()

        # Try to delete as user 2
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.delete(
            f"/api/ai/conversations/{conversation.id}",
            headers=headers,
        )

        assert response.status_code == 404


class TestSendMessage:
    """Tests for POST /api/ai/conversations/{id}/messages (SSE streaming)."""

    @pytest.mark.asyncio
    async def test_send_message_returns_streaming_response(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test that send message returns SSE streaming response."""
        # Create conversation first
        create_resp = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        # Send message - verify it returns streaming response headers
        # Note: We can't fully test SSE streaming in httpx without mocking Bedrock
        # This test verifies the route is callable and returns the correct content type
        response = await client.post(
            f"/api/ai/conversations/{conv_id}/messages",
            json={"content": "Tell me about their childhood."},
            headers=auth_headers,
        )

        # The endpoint should return a streaming response
        # In tests, Bedrock isn't configured so it will return an error event
        # We verify the response is at least attempting to stream (content-type)
        assert (
            response.headers.get("content-type") == "text/event-stream; charset=utf-8"
        )

    @pytest.mark.asyncio
    async def test_send_message_requires_auth(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that sending messages requires authentication."""
        # Create conversation
        conversation = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conversation)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conversation.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.commit()

        response = await client.post(
            f"/api/ai/conversations/{conversation.id}/messages",
            json={"content": "Hello"},
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_send_message_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test sending message to non-existent conversation."""
        import uuid

        fake_id = str(uuid.uuid4())
        response = await client.post(
            f"/api/ai/conversations/{fake_id}/messages",
            json={"content": "Hello"},
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_send_message_validates_content(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test message content validation."""
        # Create conversation first
        create_resp = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )
        conv_id = create_resp.json()["id"]

        # Send empty message
        response = await client.post(
            f"/api/ai/conversations/{conv_id}/messages",
            json={"content": ""},
            headers=auth_headers,
        )

        assert response.status_code == 422


class TestAIWorkflow:
    """Integration tests for complete AI chat workflow."""

    @pytest.mark.asyncio
    async def test_complete_conversation_workflow(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test complete flow: list personas -> create conversation -> get messages -> delete."""
        # 1. List personas
        personas_resp = await client.get("/api/ai/personas", headers=auth_headers)
        assert personas_resp.status_code == 200
        personas = personas_resp.json()
        assert len(personas) >= 2

        # 2. Create conversation
        create_resp = await client.post(
            "/api/ai/conversations",
            json={
                "persona_id": "biographer",
                "legacies": [
                    {"legacy_id": str(test_legacy.id), "role": "primary", "position": 0}
                ],
            },
            headers=auth_headers,
        )
        assert create_resp.status_code == 201
        conv_data = create_resp.json()
        conv_id = conv_data["id"]
        assert conv_data["persona_id"] == "biographer"

        # 3. List conversations (should include new one)
        list_resp = await client.get("/api/ai/conversations", headers=auth_headers)
        assert list_resp.status_code == 200
        conversations = list_resp.json()
        assert any(c["id"] == conv_id for c in conversations)

        # 4. Get messages (should be empty)
        messages_resp = await client.get(
            f"/api/ai/conversations/{conv_id}/messages",
            headers=auth_headers,
        )
        assert messages_resp.status_code == 200
        msg_data = messages_resp.json()
        assert msg_data["total"] == 0

        # 5. Delete conversation
        delete_resp = await client.delete(
            f"/api/ai/conversations/{conv_id}",
            headers=auth_headers,
        )
        assert delete_resp.status_code == 204

        # 6. Verify conversation is deleted
        get_deleted = await client.get(
            f"/api/ai/conversations/{conv_id}/messages",
            headers=auth_headers,
        )
        assert get_deleted.status_code == 404
