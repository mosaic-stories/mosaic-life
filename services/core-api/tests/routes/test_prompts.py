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


@pytest.mark.asyncio
async def test_get_current_prompt_uses_renderable_profile_image_url(monkeypatch):
    """GET /current returns a renderable image URL rather than the profile-image mutation path."""
    from app.routes import prompts

    request = SimpleNamespace()
    db = AsyncMock()
    user_id = uuid4()
    legacy_id = uuid4()
    prompt_id = uuid4()
    created_at = "2026-03-09T00:00:00Z"
    prompt = SimpleNamespace(
        id=prompt_id,
        legacy_id=legacy_id,
        prompt_text="Tell me about this person",
        category="life",
        created_at=created_at,
    )
    legacy = SimpleNamespace(id=legacy_id, name="Test Legacy", profile_image_id=uuid4())

    monkeypatch.setattr(
        prompts,
        "require_auth",
        lambda _request: SimpleNamespace(user_id=user_id),
    )
    monkeypatch.setattr(
        prompts.prompts_service,
        "get_or_create_active_prompt",
        AsyncMock(return_value=prompt),
    )
    monkeypatch.setattr(db, "get", AsyncMock(return_value=legacy))
    monkeypatch.setattr(
        prompts,
        "get_profile_image_url",
        lambda loaded_legacy: f"https://api.example.test/media/{loaded_legacy.id}.jpg",
        raising=False,
    )

    response = await prompts.get_current_prompt(request=request, db=db)

    assert (
        response.legacy_profile_image_url
        == f"https://api.example.test/media/{legacy_id}.jpg"
    )
    db.commit.assert_awaited_once()
