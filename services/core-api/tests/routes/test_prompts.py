"""Tests for story prompts API routes."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import Response


def test_prompts_router_exists():
    """Prompts router can be imported."""
    from app.routes.prompts import router

    assert router.prefix == "/api/prompts"


def test_prompts_router_has_expected_routes():
    """Router has current, shuffle, and act endpoints."""
    from app.routes.prompts import router

    paths = [r.path for r in router.routes]
    assert "/api/prompts/current" in paths
    assert "/api/prompts/{prompt_id}/shuffle" in paths
    assert "/api/prompts/{prompt_id}/act" in paths


@pytest.mark.asyncio
async def test_get_current_prompt_commits_before_returning_204(monkeypatch):
    """GET /current commits cleanup mutations even when no prompt is returned."""
    from app.routes import prompts

    request = SimpleNamespace()
    db = AsyncMock()
    user_id = uuid4()

    monkeypatch.setattr(
        prompts,
        "require_auth",
        lambda _request: SimpleNamespace(user_id=user_id),
    )
    monkeypatch.setattr(
        prompts.prompts_service,
        "get_or_create_active_prompt",
        AsyncMock(return_value=None),
    )

    response = await prompts.get_current_prompt(request=request, db=db)

    assert isinstance(response, Response)
    assert response.status_code == 204
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_shuffle_prompt_commits_before_returning_204(monkeypatch):
    """POST /shuffle commits rotation mutations even when no replacement prompt is returned."""
    from app.routes import prompts

    request = SimpleNamespace()
    db = AsyncMock()
    user_id = uuid4()
    prompt_id = uuid4()

    monkeypatch.setattr(
        prompts,
        "require_auth",
        lambda _request: SimpleNamespace(user_id=user_id),
    )
    monkeypatch.setattr(
        prompts.prompts_service,
        "shuffle_prompt",
        AsyncMock(return_value=None),
    )

    response = await prompts.shuffle_prompt(
        prompt_id=prompt_id,
        request=request,
        db=db,
    )

    assert isinstance(response, Response)
    assert response.status_code == 204
    db.commit.assert_awaited_once()
