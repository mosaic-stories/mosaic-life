"""Tests for story prompts API routes."""


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
