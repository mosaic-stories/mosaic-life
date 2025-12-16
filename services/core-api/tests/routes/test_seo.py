# services/core-api/tests/routes/test_seo.py
"""Tests for SEO routes (sitemap.xml, robots.txt)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_robots_txt(client: AsyncClient) -> None:
    """Test robots.txt returns valid content."""
    response = await client.get("/robots.txt")

    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]

    content = response.text
    assert "User-agent: *" in content
    assert "Allow: /" in content
    assert "Disallow: /my-legacies" in content
    assert "Sitemap:" in content


@pytest.mark.asyncio
async def test_sitemap_xml(client: AsyncClient) -> None:
    """Test sitemap.xml returns valid XML."""
    response = await client.get("/sitemap.xml")

    assert response.status_code == 200
    assert "application/xml" in response.headers["content-type"]

    content = response.text
    assert '<?xml version="1.0" encoding="UTF-8"?>' in content
    assert "<urlset" in content
    assert "<url>" in content
    assert "<loc>" in content


@pytest.mark.asyncio
async def test_sitemap_contains_static_pages(client: AsyncClient) -> None:
    """Test sitemap contains expected static pages."""
    response = await client.get("/sitemap.xml")

    content = response.text
    # Check for static pages (URL may vary based on APP_URL config)
    assert "/about" in content or "about</loc>" in content
    assert "/how-it-works" in content or "how-it-works</loc>" in content
    assert "/community" in content or "community</loc>" in content


@pytest.mark.asyncio
async def test_sitemap_caching(client: AsyncClient) -> None:
    """Test sitemap has appropriate cache headers."""
    response = await client.get("/sitemap.xml")

    assert "cache-control" in response.headers
    assert "max-age" in response.headers["cache-control"]


@pytest.mark.asyncio
async def test_robots_caching(client: AsyncClient) -> None:
    """Test robots.txt has appropriate cache headers."""
    response = await client.get("/robots.txt")

    assert "cache-control" in response.headers
    assert "max-age" in response.headers["cache-control"]
