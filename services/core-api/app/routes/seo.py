# services/core-api/app/routes/seo.py
"""SEO routes for sitemap.xml and robots.txt."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models.legacy import Legacy

router = APIRouter(tags=["seo"])
logger = logging.getLogger(__name__)

settings = get_settings()


def _format_sitemap_date(dt: datetime) -> str:
    """Format datetime for sitemap lastmod."""
    return dt.strftime("%Y-%m-%d")


def _generate_sitemap_xml(urls: list[dict]) -> str:
    """Generate XML sitemap from URL list."""
    xml_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]

    for url in urls:
        xml_parts.append("  <url>")
        xml_parts.append(f"    <loc>{url['loc']}</loc>")
        if url.get("lastmod"):
            xml_parts.append(f"    <lastmod>{url['lastmod']}</lastmod>")
        if url.get("changefreq"):
            xml_parts.append(f"    <changefreq>{url['changefreq']}</changefreq>")
        if url.get("priority"):
            xml_parts.append(f"    <priority>{url['priority']}</priority>")
        xml_parts.append("  </url>")

    xml_parts.append("</urlset>")
    return "\n".join(xml_parts)


@router.get("/sitemap.xml", response_class=Response)
async def sitemap(db: AsyncSession = Depends(get_db)) -> Response:
    """Generate XML sitemap with static pages and public legacies."""
    base_url = settings.app_url.rstrip("/")

    # Static pages
    static_urls = [
        {"loc": f"{base_url}/", "priority": "1.0", "changefreq": "daily"},
        {"loc": f"{base_url}/about", "priority": "0.8", "changefreq": "monthly"},
        {
            "loc": f"{base_url}/how-it-works",
            "priority": "0.8",
            "changefreq": "monthly",
        },
        {"loc": f"{base_url}/community", "priority": "0.7", "changefreq": "weekly"},
    ]

    # Query public legacies
    query = select(Legacy).where(Legacy.visibility == "public").limit(1000)
    result = await db.execute(query)
    public_legacies = result.scalars().all()

    # Add legacy URLs
    legacy_urls = [
        {
            "loc": f"{base_url}/legacy/{legacy.id}",
            "lastmod": _format_sitemap_date(legacy.updated_at),
            "priority": "0.6",
            "changefreq": "weekly",
        }
        for legacy in public_legacies
    ]

    xml_content = _generate_sitemap_xml(static_urls + legacy_urls)

    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=3600"},  # Cache for 1 hour
    )


@router.get("/robots.txt", response_class=PlainTextResponse)
async def robots() -> PlainTextResponse:
    """Return robots.txt for crawler instructions."""
    base_url = settings.app_url.rstrip("/")

    content = f"""# Mosaic Life Robots.txt
# https://mosaiclife.me

User-agent: *
Allow: /
Allow: /about
Allow: /how-it-works
Allow: /community
Allow: /legacy/

# Disallow authenticated/private routes
Disallow: /my-legacies
Disallow: /settings
Disallow: /api/

# Sitemap location
Sitemap: {base_url}/sitemap.xml
"""

    return PlainTextResponse(
        content=content,
        headers={"Cache-Control": "public, max-age=86400"},  # Cache for 24 hours
    )
