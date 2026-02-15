"""Tests for support request routes."""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.support_request import SupportRequest
from app.models.user import User


@pytest.mark.asyncio
async def test_support_request_rate_limited(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db_session: AsyncSession,
    test_user: User,
):
    for index in range(5):
        db_session.add(
            SupportRequest(
                user_id=test_user.id,
                category="general_question",
                subject=f"Existing request {index}",
                message="Existing message",
                context={"source": "test"},
                status="open",
            )
        )
    await db_session.commit()

    response = await client.post(
        "/api/support/request",
        headers=auth_headers,
        json={
            "category": "general_question",
            "subject": "Need help",
            "message": "Please assist",
            "context": {
                "page_url": "/settings/account",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "user_agent": "pytest-agent",
                "legacy_id": None,
                "session_duration_seconds": 120,
                "recent_errors": [],
            },
        },
    )

    assert response.status_code == 429
    assert "rate limit" in response.json()["detail"].lower()
