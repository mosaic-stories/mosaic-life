# SEO & GEO Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable brand discovery for "Mosaic Life" searches and prepare for AI-based search (GEO) by implementing dynamic meta tags, structured data, sitemap, and prerendering for bots.

**Architecture:** Add React Helmet for client-side meta tag management, FastAPI endpoints for sitemap/robots.txt, and a Prerender.io service for bot rendering. Nginx reverse proxy handles bot detection and routing.

**Tech Stack:** react-helmet-async, FastAPI, Prerender.io (Docker), nginx, Helm, ArgoCD

**Reference Design:** `docs/plans/2025-12-16-seo-geo-optimization-design.md`

---

## Phase 1: Frontend SEO Infrastructure

### Task 1: Install react-helmet-async

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Add dependency**

```bash
cd apps/web && npm install react-helmet-async
```

**Step 2: Verify installation**

```bash
grep "react-helmet-async" apps/web/package.json
```

Expected: `"react-helmet-async": "^2.x.x"` in dependencies

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "chore(web): add react-helmet-async for SEO meta tags"
```

---

### Task 2: Add HelmetProvider to App

**Files:**
- Modify: `apps/web/src/App.tsx`

**Step 1: Update App.tsx to wrap with HelmetProvider**

Replace the entire file with:

```tsx
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from '@/contexts/AuthContext';
import { router } from '@/routes';
import { useEffect } from 'react';
import { applyTheme } from '@/lib/themeUtils';
import ErrorBoundary from '@/components/ErrorBoundary';

// Create a client for TanStack Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export default function App() {
  // Apply initial theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('mosaic-theme') || 'warm-amber';
    applyTheme(savedTheme);
  }, []);

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}
```

**Step 2: Run TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors

**Step 3: Run existing tests**

```bash
cd apps/web && npm run test
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): add HelmetProvider for SEO meta tag management"
```

---

### Task 3: Create SEO utilities

**Files:**
- Create: `apps/web/src/lib/seo/meta.ts`

**Step 1: Create the meta utilities file**

```typescript
// apps/web/src/lib/seo/meta.ts

/**
 * SEO meta tag utilities for generating consistent meta information.
 */

export interface SEOMetaData {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'profile' | 'article';
  noIndex?: boolean;
}

const SITE_NAME = 'Mosaic Life';
const DEFAULT_DESCRIPTION = 'Honor the lives and milestones that matter most. Create meaningful digital tributes for memorials, retirements, graduations, and living legacies.';
const BASE_URL = 'https://mosaiclife.me';
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

/**
 * Generate a page title with site name suffix.
 */
export function formatPageTitle(pageTitle?: string): string {
  if (!pageTitle) {
    return `${SITE_NAME} - Honoring Lives Through Shared Stories`;
  }
  return `${pageTitle} | ${SITE_NAME}`;
}

/**
 * Truncate description to SEO-friendly length (max 160 chars).
 */
export function truncateDescription(text: string | undefined | null, maxLength = 160): string {
  if (!text) return DEFAULT_DESCRIPTION;
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trim() + '...';
}

/**
 * Generate canonical URL from path.
 */
export function getCanonicalUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${cleanPath}`;
}

/**
 * Get default meta data for the site.
 */
export function getDefaultMeta(): SEOMetaData {
  return {
    title: formatPageTitle(),
    description: DEFAULT_DESCRIPTION,
    canonicalUrl: BASE_URL,
    ogImage: DEFAULT_OG_IMAGE,
    ogType: 'website',
  };
}

export { SITE_NAME, DEFAULT_DESCRIPTION, BASE_URL, DEFAULT_OG_IMAGE };
```

**Step 2: Verify TypeScript compilation**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/lib/seo/meta.ts
git commit -m "feat(web): add SEO meta tag utilities"
```

---

### Task 4: Create SEOHead component

**Files:**
- Create: `apps/web/src/components/seo/SEOHead.tsx`

**Step 1: Create the SEOHead component**

```tsx
// apps/web/src/components/seo/SEOHead.tsx

import { Helmet } from 'react-helmet-async';
import {
  formatPageTitle,
  truncateDescription,
  getCanonicalUrl,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
} from '@/lib/seo/meta';

export interface SEOHeadProps {
  /** Page title (will be suffixed with site name) */
  title?: string;
  /** Page description (max 160 chars) */
  description?: string;
  /** Path for canonical URL (e.g., "/about" or "/legacy/123") */
  path?: string;
  /** Open Graph image URL */
  ogImage?: string;
  /** Open Graph type */
  ogType?: 'website' | 'profile' | 'article';
  /** Set true for pages that should not be indexed (e.g., user settings) */
  noIndex?: boolean;
  /** Additional structured data (JSON-LD) */
  structuredData?: object;
}

export default function SEOHead({
  title,
  description,
  path = '/',
  ogImage,
  ogType = 'website',
  noIndex = false,
  structuredData,
}: SEOHeadProps) {
  const fullTitle = formatPageTitle(title);
  const fullDescription = truncateDescription(description);
  const canonicalUrl = getCanonicalUrl(path);
  const imageUrl = ogImage || DEFAULT_OG_IMAGE;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={fullDescription} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Robots */}
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      <meta name="twitter:image" content={imageUrl} />

      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
}
```

**Step 2: Create index export**

Create `apps/web/src/components/seo/index.ts`:

```typescript
export { default as SEOHead } from './SEOHead';
export type { SEOHeadProps } from './SEOHead';
```

**Step 3: Verify TypeScript compilation**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/components/seo/
git commit -m "feat(web): add SEOHead component for dynamic meta tags"
```

---

### Task 5: Create Schema.org structured data components

**Files:**
- Create: `apps/web/src/components/seo/OrganizationSchema.tsx`
- Create: `apps/web/src/components/seo/LegacySchema.tsx`

**Step 1: Create OrganizationSchema component**

```tsx
// apps/web/src/components/seo/OrganizationSchema.tsx

import { BASE_URL, SITE_NAME, DEFAULT_DESCRIPTION } from '@/lib/seo/meta';

/**
 * Generate Organization schema for Mosaic Life.
 * Include this on the homepage and key landing pages.
 */
export function getOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: BASE_URL,
    logo: `${BASE_URL}/logo.png`,
    description: DEFAULT_DESCRIPTION,
    sameAs: [
      // Add social profiles when available
      // 'https://twitter.com/mosaiclife',
      // 'https://facebook.com/mosaiclife',
    ],
  };
}
```

**Step 2: Create LegacySchema component**

```tsx
// apps/web/src/components/seo/LegacySchema.tsx

import { BASE_URL } from '@/lib/seo/meta';

export interface LegacySchemaInput {
  id: string;
  name: string;
  biography?: string | null;
  profileImageUrl?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Generate ProfilePage + Person schema for a legacy profile.
 * Use this on /legacy/:id pages.
 */
export function getLegacySchema(legacy: LegacySchemaInput) {
  const personSchema: Record<string, unknown> = {
    '@type': 'Person',
    name: legacy.name,
  };

  if (legacy.biography) {
    personSchema.description = legacy.biography;
  }

  if (legacy.profileImageUrl) {
    personSchema.image = legacy.profileImageUrl;
  }

  if (legacy.birthDate) {
    personSchema.birthDate = legacy.birthDate;
  }

  if (legacy.deathDate) {
    personSchema.deathDate = legacy.deathDate;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: personSchema,
    dateCreated: legacy.createdAt,
    dateModified: legacy.updatedAt,
    url: `${BASE_URL}/legacy/${legacy.id}`,
  };
}
```

**Step 3: Update index.ts to export schemas**

Update `apps/web/src/components/seo/index.ts`:

```typescript
export { default as SEOHead } from './SEOHead';
export type { SEOHeadProps } from './SEOHead';
export { getOrganizationSchema } from './OrganizationSchema';
export { getLegacySchema } from './LegacySchema';
export type { LegacySchemaInput } from './LegacySchema';
```

**Step 4: Verify TypeScript compilation**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/components/seo/
git commit -m "feat(web): add Schema.org structured data for Organization and Legacy profiles"
```

---

### Task 6: Add SEO to Homepage

**Files:**
- Modify: `apps/web/src/components/Homepage.tsx`

**Step 1: Add SEOHead to Homepage**

Add these imports at the top of the file:

```tsx
import { SEOHead, getOrganizationSchema } from '@/components/seo';
```

**Step 2: Add SEOHead component inside the return statement**

Add immediately after the opening `<div className="min-h-screen flex flex-col">`:

```tsx
<SEOHead
  title="Honoring Lives Through Shared Stories"
  description="Create meaningful digital tributes for memorials, retirements, graduations, and living legacies. Preserve memories, share stories, and celebrate what makes each person special."
  path="/"
  ogType="website"
  structuredData={getOrganizationSchema()}
/>
```

**Step 3: Run tests**

```bash
cd apps/web && npm run test
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add apps/web/src/components/Homepage.tsx
git commit -m "feat(web): add SEO meta tags to Homepage"
```

---

### Task 7: Add SEO to LegacyProfile

**Files:**
- Modify: `apps/web/src/components/LegacyProfile.tsx`

**Step 1: Add imports**

Add these imports at the top of the file:

```tsx
import { SEOHead, getLegacySchema } from '@/components/seo';
import type { LegacySchemaInput } from '@/components/seo';
```

**Step 2: Add SEOHead inside the component**

Inside the `LegacyProfile` function, after the hooks but before the return statement, add a helper to get the image URL:

```tsx
// Generate SEO data
const legacyImageUrl = legacy?.profile_image?.url
  ? rewriteBackendUrlForDev(legacy.profile_image.url)
  : undefined;

const seoSchema: LegacySchemaInput | null = legacy ? {
  id: legacy.id,
  name: legacy.name,
  biography: legacy.biography,
  profileImageUrl: legacyImageUrl,
  birthDate: legacy.birth_date,
  deathDate: legacy.death_date,
  createdAt: legacy.created_at,
  updatedAt: legacy.updated_at,
} : null;
```

**Step 3: Add SEOHead in the return**

Add at the very beginning of the return statement (inside the first `<>`):

```tsx
{legacy && seoSchema && (
  <SEOHead
    title={legacy.name}
    description={legacy.biography}
    path={`/legacy/${legacyId}`}
    ogImage={legacyImageUrl}
    ogType="profile"
    structuredData={getLegacySchema(seoSchema)}
  />
)}
```

**Step 4: Run tests**

```bash
cd apps/web && npm run test
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/web/src/components/LegacyProfile.tsx
git commit -m "feat(web): add SEO meta tags and Schema.org to LegacyProfile"
```

---

### Task 8: Add SEO to static pages

**Files:**
- Modify: `apps/web/src/components/About.tsx` (if exists)
- Modify: `apps/web/src/components/HowItWorks.tsx` (if exists)
- Modify: `apps/web/src/components/Community.tsx` (if exists)

**Step 1: Find and update static pages**

For each static page that exists, add SEOHead:

```tsx
import { SEOHead } from '@/components/seo';

// Inside the component's return, at the top:
<SEOHead
  title="About"  // or "How It Works", "Community"
  description="Learn about Mosaic Life and our mission to preserve meaningful stories and memories."
  path="/about"  // or "/how-it-works", "/community"
/>
```

**Step 2: Run tests**

```bash
cd apps/web && npm run test
```

**Step 3: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat(web): add SEO meta tags to static pages"
```

---

### Task 9: Add noindex to protected pages

**Files:**
- Modify protected page components (MyLegacies, Settings, etc.)

**Step 1: Add noindex SEOHead to protected pages**

For pages like MyLegacies, Settings, etc., add:

```tsx
import { SEOHead } from '@/components/seo';

// Inside the component's return:
<SEOHead
  title="My Legacies"
  noIndex={true}
/>
```

**Step 2: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat(web): add noindex meta to protected pages"
```

---

## Phase 2: Backend SEO Endpoints

### Task 10: Create SEO routes module

**Files:**
- Create: `services/core-api/app/routes/seo.py`

**Step 1: Create the SEO routes file**

```python
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
```

**Step 2: Run linting**

```bash
cd services/core-api && just lint-fix-backend
```

**Step 3: Verify types**

```bash
cd services/core-api && just typecheck-backend
```

Expected: No errors

**Step 4: Commit**

```bash
git add services/core-api/app/routes/seo.py
git commit -m "feat(api): add sitemap.xml and robots.txt endpoints"
```

---

### Task 11: Register SEO routes in main.py

**Files:**
- Modify: `services/core-api/app/main.py`

**Step 1: Add import**

Add to the imports section:

```python
from .routes.seo import router as seo_router
```

**Step 2: Register the router**

Add after the other router registrations (around line 97):

```python
app.include_router(seo_router)
```

**Step 3: Run validation**

```bash
just validate-backend
```

Expected: All checks pass

**Step 4: Run tests**

```bash
cd services/core-api && uv run pytest -v
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add services/core-api/app/main.py
git commit -m "feat(api): register SEO routes for sitemap and robots.txt"
```

---

### Task 12: Add tests for SEO endpoints

**Files:**
- Create: `services/core-api/tests/routes/test_seo.py`

**Step 1: Create test file**

```python
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
```

**Step 2: Run the tests**

```bash
cd services/core-api && uv run pytest tests/routes/test_seo.py -v
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add services/core-api/tests/routes/test_seo.py
git commit -m "test(api): add tests for SEO endpoints"
```

---

## Phase 3: Prerender Service Infrastructure

### Task 13: Add Prerender to Docker Compose

**Files:**
- Modify: `infra/compose/docker-compose.yml`

**Step 1: Add prerender service**

Add this service after the `docs` service (before the `volumes` section):

```yaml
  # Prerender Service for SEO (renders pages for bots)
  prerender:
    image: prerender/prerender
    ports:
      - "3000:3000"
    environment:
      - CHROME_FLAGS=--no-sandbox --headless --disable-gpu --disable-dev-shm-usage
      - ALLOWED_DOMAINS=localhost,127.0.0.1
      - CACHE_MAXSIZE=1000
      - CACHE_TTL=86400
    mem_limit: 1g
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

**Step 2: Verify docker-compose syntax**

```bash
docker compose -f infra/compose/docker-compose.yml config
```

Expected: No errors, outputs the full config

**Step 3: Test prerender service starts**

```bash
docker compose -f infra/compose/docker-compose.yml up -d prerender
docker compose -f infra/compose/docker-compose.yml logs prerender
```

Expected: Service starts without errors

**Step 4: Test prerender works**

```bash
# Wait for service to be ready
sleep 10
curl "http://localhost:3000/render?url=https://example.com"
```

Expected: Returns rendered HTML

**Step 5: Stop test service**

```bash
docker compose -f infra/compose/docker-compose.yml stop prerender
```

**Step 6: Commit**

```bash
git add infra/compose/docker-compose.yml
git commit -m "infra(compose): add prerender service for SEO bot rendering"
```

---

### Task 14: Create Prerender Helm Chart

**Files:**
- Create: `infra/helm/prerender/Chart.yaml`
- Create: `infra/helm/prerender/values.yaml`
- Create: `infra/helm/prerender/templates/_helpers.tpl`
- Create: `infra/helm/prerender/templates/deployment.yaml`
- Create: `infra/helm/prerender/templates/service.yaml`
- Create: `infra/helm/prerender/templates/hpa.yaml`

**Step 1: Create Chart.yaml**

```yaml
# infra/helm/prerender/Chart.yaml
apiVersion: v2
name: prerender
description: Prerender.io service for SEO bot rendering
type: application
version: 1.0.0
appVersion: "latest"
keywords:
  - prerender
  - seo
  - ssr
home: https://github.com/mosaic-stories/mosaic-life
maintainers:
  - name: Mosaic Life Team
    email: team@mosaiclife.me
```

**Step 2: Create values.yaml**

```yaml
# infra/helm/prerender/values.yaml

replicaCount: 1

image:
  repository: prerender/prerender
  tag: latest
  pullPolicy: Always

service:
  type: ClusterIP
  port: 3000
  targetPort: 3000

# Environment configuration
config:
  allowedDomains: "mosaiclife.me,localhost"
  cacheMaxSize: "1000"
  cacheTTL: "86400"
  chromeFlags: "--no-sandbox --headless --disable-gpu --disable-dev-shm-usage"

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 250m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 1
  maxReplicas: 5
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

livenessProbe:
  httpGet:
    path: /
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3

podSecurityContext:
  runAsNonRoot: false  # Prerender needs root for Chrome

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
    add:
      - SYS_ADMIN  # Required for Chrome sandbox

nodeSelector: {}

tolerations: []

affinity: {}
```

**Step 3: Create _helpers.tpl**

```yaml
# infra/helm/prerender/templates/_helpers.tpl
{{/*
Expand the name of the chart.
*/}}
{{- define "prerender.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "prerender.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "prerender.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "prerender.labels" -}}
helm.sh/chart: {{ include "prerender.chart" . }}
{{ include "prerender.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: mosaic-life
{{- end }}

{{/*
Selector labels
*/}}
{{- define "prerender.selectorLabels" -}}
app.kubernetes.io/name: {{ include "prerender.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

**Step 4: Create deployment.yaml**

```yaml
# infra/helm/prerender/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "prerender.fullname" . }}
  labels:
    {{- include "prerender.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "prerender.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "prerender.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.podSecurityContext }}
      securityContext:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          {{- with .Values.securityContext }}
          securityContext:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
          env:
            - name: CHROME_FLAGS
              value: {{ .Values.config.chromeFlags | quote }}
            - name: ALLOWED_DOMAINS
              value: {{ .Values.config.allowedDomains | quote }}
            - name: CACHE_MAXSIZE
              value: {{ .Values.config.cacheMaxSize | quote }}
            - name: CACHE_TTL
              value: {{ .Values.config.cacheTTL | quote }}
          {{- with .Values.livenessProbe }}
          livenessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.readinessProbe }}
          readinessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

**Step 5: Create service.yaml**

```yaml
# infra/helm/prerender/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "prerender.fullname" . }}
  labels:
    {{- include "prerender.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.targetPort }}
      protocol: TCP
      name: http
  selector:
    {{- include "prerender.selectorLabels" . | nindent 4 }}
```

**Step 6: Create hpa.yaml**

```yaml
# infra/helm/prerender/templates/hpa.yaml
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "prerender.fullname" . }}
  labels:
    {{- include "prerender.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "prerender.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    {{- if .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    {{- end }}
    {{- if .Values.autoscaling.targetMemoryUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
    {{- end }}
{{- end }}
```

**Step 7: Validate Helm chart**

```bash
helm template prerender infra/helm/prerender/
```

Expected: Renders valid Kubernetes manifests

**Step 8: Commit**

```bash
git add infra/helm/prerender/
git commit -m "infra(helm): add prerender Helm chart for SEO bot rendering"
```

---

### Task 15: Create ArgoCD Application for Prerender

**Files:**
- Create: `infra/argocd/applications/prerender-prod.yaml`
- Create: `infra/argocd/applications/prerender-staging.yaml`

**Step 1: Create production ArgoCD Application**

```yaml
# infra/argocd/applications/prerender-prod.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: prerender-prod
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: mosaic-life

  source:
    repoURL: https://github.com/mosaic-stories/mosaic-life
    targetRevision: main
    path: infra/helm/prerender
    helm:
      values: |
        replicaCount: 2
        config:
          allowedDomains: "mosaiclife.me,api.mosaiclife.me"
        autoscaling:
          enabled: true
          minReplicas: 2
          maxReplicas: 5

  destination:
    server: https://kubernetes.default.svc
    namespace: mosaic-prod

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=false
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

**Step 2: Create staging ArgoCD Application**

```yaml
# infra/argocd/applications/prerender-staging.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: prerender-staging
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: mosaic-life

  source:
    repoURL: https://github.com/mosaic-stories/mosaic-life
    targetRevision: main
    path: infra/helm/prerender
    helm:
      values: |
        replicaCount: 1
        config:
          allowedDomains: "staging.mosaiclife.me,api-staging.mosaiclife.me,localhost"
        autoscaling:
          enabled: true
          minReplicas: 1
          maxReplicas: 3

  destination:
    server: https://kubernetes.default.svc
    namespace: mosaic-staging

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=false
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

**Step 3: Commit**

```bash
git add infra/argocd/applications/prerender-*.yaml
git commit -m "infra(argocd): add prerender ArgoCD applications for prod and staging"
```

---

## Phase 4: External Setup (Manual Steps)

### Task 16: Document External Setup Steps

**Files:**
- Create: `docs/operations/SEO-SETUP.md`

**Step 1: Create the operations doc**

```markdown
# SEO External Setup Guide

This document covers the manual steps required to complete SEO setup after deploying the code changes.

## Prerequisites

- Code deployed with SEO endpoints (`/sitemap.xml`, `/robots.txt`)
- Prerender service deployed and running
- Access to DNS management (Route53)
- Access to Google and Bing accounts

## 1. Google Search Console Setup

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Click "Add Property"
3. Select "URL prefix" and enter: `https://mosaiclife.me`
4. Choose "DNS verification" (recommended)
5. Add TXT record to Route53:
   - Name: `mosaiclife.me`
   - Type: `TXT`
   - Value: `google-site-verification=XXXXX` (provided by Google)
6. Wait for DNS propagation (up to 24 hours, usually minutes)
7. Click "Verify" in Google Search Console
8. After verification:
   - Go to "Sitemaps" in the left menu
   - Enter: `sitemap.xml`
   - Click "Submit"

## 2. Bing Webmaster Tools Setup

1. Go to [Bing Webmaster Tools](https://www.bing.com/webmasters)
2. Click "Add a site"
3. Option A (easier): Click "Import from Google Search Console"
4. Option B (manual):
   - Enter: `https://mosaiclife.me`
   - Add DNS TXT record similar to Google
5. After verification:
   - Go to "Sitemaps"
   - Submit: `https://mosaiclife.me/sitemap.xml`

## 3. Verify Social Sharing

After deployment, test that social previews work:

1. **Facebook**: https://developers.facebook.com/tools/debug/
   - Enter: `https://mosaiclife.me`
   - Click "Debug"
   - Verify og:title, og:description, og:image appear

2. **Twitter**: https://cards-dev.twitter.com/validator
   - Enter: `https://mosaiclife.me`
   - Verify card preview appears

3. **LinkedIn**: https://www.linkedin.com/post-inspector/
   - Enter: `https://mosaiclife.me`
   - Verify preview appears

## 4. Monitor Indexing

After setup, monitor indexing progress:

- **Google**: Search Console → Coverage report
- **Bing**: Webmaster Tools → Site Activity

Expected timeline:
- DNS verification: Immediate to 24 hours
- Initial indexing: 1-7 days
- Brand term ranking: 2-4 weeks

## Troubleshooting

### Social previews not showing
- Verify prerender service is running
- Check that bot User-Agent is being routed to prerender
- Use browser dev tools to check meta tags

### Sitemap not being read
- Verify `/sitemap.xml` returns valid XML
- Check robots.txt includes Sitemap directive
- Re-submit sitemap in Search Console

### Pages not being indexed
- Check robots.txt isn't blocking the page
- Verify page returns 200 status
- Request manual indexing in Search Console
```

**Step 2: Commit**

```bash
git add docs/operations/SEO-SETUP.md
git commit -m "docs: add SEO external setup guide"
```

---

## Phase 5: Testing & Validation

### Task 17: Add Frontend SEO Tests

**Files:**
- Create: `apps/web/src/components/seo/SEOHead.test.tsx`

**Step 1: Create test file**

```tsx
// apps/web/src/components/seo/SEOHead.test.tsx
import { render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect } from 'vitest';
import SEOHead from './SEOHead';

const renderWithHelmet = (ui: React.ReactElement) => {
  return render(<HelmetProvider>{ui}</HelmetProvider>);
};

describe('SEOHead', () => {
  it('renders default title when no title provided', async () => {
    renderWithHelmet(<SEOHead />);
    await waitFor(() => {
      expect(document.title).toContain('Mosaic Life');
    });
  });

  it('renders custom title with site name suffix', async () => {
    renderWithHelmet(<SEOHead title="About" />);
    await waitFor(() => {
      expect(document.title).toBe('About | Mosaic Life');
    });
  });

  it('sets meta description', async () => {
    renderWithHelmet(<SEOHead description="Test description" />);
    await waitFor(() => {
      const meta = document.querySelector('meta[name="description"]');
      expect(meta?.getAttribute('content')).toBe('Test description');
    });
  });

  it('sets canonical URL', async () => {
    renderWithHelmet(<SEOHead path="/about" />);
    await waitFor(() => {
      const link = document.querySelector('link[rel="canonical"]');
      expect(link?.getAttribute('href')).toBe('https://mosaiclife.me/about');
    });
  });

  it('sets Open Graph tags', async () => {
    renderWithHelmet(
      <SEOHead title="Test" description="Test desc" ogType="article" />
    );
    await waitFor(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogType = document.querySelector('meta[property="og:type"]');
      expect(ogTitle?.getAttribute('content')).toContain('Test');
      expect(ogType?.getAttribute('content')).toBe('article');
    });
  });

  it('sets noindex when specified', async () => {
    renderWithHelmet(<SEOHead noIndex={true} />);
    await waitFor(() => {
      const robots = document.querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content')).toBe('noindex, nofollow');
    });
  });

  it('includes structured data when provided', async () => {
    const schema = { '@type': 'Organization', name: 'Test' };
    renderWithHelmet(<SEOHead structuredData={schema} />);
    await waitFor(() => {
      const script = document.querySelector(
        'script[type="application/ld+json"]'
      );
      expect(script?.textContent).toContain('Organization');
    });
  });
});
```

**Step 2: Run tests**

```bash
cd apps/web && npm run test -- src/components/seo/SEOHead.test.tsx
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add apps/web/src/components/seo/SEOHead.test.tsx
git commit -m "test(web): add tests for SEOHead component"
```

---

### Task 18: Final Validation

**Step 1: Run all backend validation**

```bash
just validate-backend
```

Expected: All checks pass

**Step 2: Run all frontend tests**

```bash
cd apps/web && npm run test
```

Expected: All tests pass

**Step 3: Run TypeScript checks**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors

**Step 4: Build frontend**

```bash
cd apps/web && npm run build
```

Expected: Build succeeds

**Step 5: Test locally with docker compose**

```bash
docker compose -f infra/compose/docker-compose.yml up -d
# Wait for services
sleep 30
# Test endpoints
curl http://localhost:8080/robots.txt
curl http://localhost:8080/sitemap.xml
```

Expected: Both return valid content

**Step 6: Create final commit if needed**

```bash
git status
# If any uncommitted changes:
git add .
git commit -m "chore: final SEO implementation cleanup"
```

---

## Summary

After completing all tasks, you will have:

1. **Frontend SEO** (Tasks 1-9):
   - react-helmet-async installed and configured
   - SEOHead component for dynamic meta tags
   - Schema.org structured data (Organization + Person)
   - All public pages have proper SEO tags
   - Protected pages have noindex

2. **Backend SEO** (Tasks 10-12):
   - `/sitemap.xml` endpoint with static + dynamic pages
   - `/robots.txt` endpoint with crawler instructions
   - Tests for both endpoints

3. **Prerender Infrastructure** (Tasks 13-15):
   - Docker Compose service for local development
   - Helm chart for Kubernetes deployment
   - ArgoCD applications for prod/staging

4. **Documentation** (Task 16):
   - External setup guide for Google/Bing registration

5. **Testing** (Tasks 17-18):
   - Frontend SEO component tests
   - Full validation suite

## Next Steps (Post-Implementation)

1. Follow `docs/operations/SEO-SETUP.md` to register with Google/Bing
2. Deploy to staging and verify prerender works
3. Deploy to production
4. Monitor indexing in Search Console
5. (Future) Add nginx bot detection for full prerender integration
