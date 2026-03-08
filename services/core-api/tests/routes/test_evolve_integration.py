"""Integration test for the full evolve conversation to story flow."""

import pytest
from httpx import AsyncClient

from app.models.ai import AIConversation, AIMessage
from app.models.associations import ConversationLegacy


@pytest.mark.asyncio
async def test_full_evolve_flow(
    client: AsyncClient,
    db_session,
    test_user,
    test_legacy,
    auth_headers,
):
    """Test: create conversation → add messages → evolve → verify story + clone + breadcrumb."""
    # 1. Create conversation
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
    for content in [
        "Tell me about grandpa",
        "He loved woodworking",
        "That sounds wonderful",
    ]:
        db_session.add(
            AIMessage(
                conversation_id=conv.id,
                role="user"
                if content.startswith("Tell") or content.startswith("He")
                else "assistant",
                content=content,
            )
        )
    await db_session.flush()
    await db_session.commit()

    # 2. Evolve
    evolve_response = await client.post(
        f"/api/ai/conversations/{conv.id}/evolve",
        json={"title": "Grandpa's Woodworking Legacy"},
        headers=auth_headers,
    )
    assert evolve_response.status_code == 201
    evolve_data = evolve_response.json()

    # 3. Verify story was created
    story_response = await client.get(
        f"/api/stories/{evolve_data['story_id']}",
        headers=auth_headers,
    )
    assert story_response.status_code == 200
    story = story_response.json()
    assert story["title"] == "Grandpa's Woodworking Legacy"
    assert story["status"] == "draft"
    assert story["source_conversation_id"] is not None

    # 4. Verify cloned conversation has messages
    messages_response = await client.get(
        f"/api/ai/conversations/{evolve_data['conversation_id']}/messages",
        headers=auth_headers,
    )
    assert messages_response.status_code == 200
    messages = messages_response.json()
    assert len(messages["messages"]) == 3  # All original messages copied

    # 5. Verify breadcrumb in original conversation
    original_messages = await client.get(
        f"/api/ai/conversations/{conv.id}/messages",
        headers=auth_headers,
    )
    assert original_messages.status_code == 200
    original_msgs = original_messages.json()["messages"]
    system_msgs = [
        m for m in original_msgs if m.get("message_type") == "system_notification"
    ]
    assert len(system_msgs) == 1
    assert "evolved" in system_msgs[0]["content"].lower()
